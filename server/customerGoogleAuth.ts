import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import MemoryStore from "memorystore";
import { storage } from "./storage.js";
import { OAuth2Client } from 'google-auth-library';

declare global {
  namespace Express {
    interface User {
      customerId: string;
      authMethod: 'google' | 'phone';
    }
  }
}

declare module 'express-session' {
  interface SessionData {
    customerId?: string;
    authMethod?: 'google' | 'phone';
    authenticatedAt?: number;
  }
}

export function getCustomerSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const MemoryStoreSession = MemoryStore(session);
  const sessionStore = new MemoryStoreSession({
    checkPeriod: 86400000, // prune expired entries every 24h
  });

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.warn("[CustomerAuth] SESSION_SECRET is not set — using fallback. Insecure for production.");
  }

  const isProduction = process.env.NODE_ENV === "production";
  const isReplit = !!process.env.REPLIT_DEV_DOMAIN;
  const useSecureCookie = isProduction || isReplit;

  console.log(`[CustomerAuth] Session config: production=${isProduction}, secureCookie=${useSecureCookie}`);

  return session({
    secret: sessionSecret || "promise-electronics-fallback-secret-2025",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: "customer.sid",
    cookie: {
      httpOnly: true,
      secure: useSecureCookie,
      maxAge: sessionTtl,
      sameSite: "lax",
    },
  });
}

async function upsertCustomerFromGoogle(profile: Profile) {
  const email = profile.emails?.[0]?.value;
  const name = profile.displayName ||
    (profile.name?.givenName && profile.name?.familyName
      ? `${profile.name.givenName} ${profile.name.familyName}`.trim()
      : email?.split("@")[0] || "Customer");
  const profileImageUrl = profile.photos?.[0]?.value;

  const user = await storage.upsertUserFromGoogle({
    googleSub: profile.id,
    name,
    email: email || null,
    profileImageUrl: profileImageUrl || null,
  });
  return user;
}

export async function setupCustomerAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getCustomerSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const clientID = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientID || !clientSecret) {
    console.warn("[CustomerAuth] Google OAuth credentials not configured — Sign-In disabled");
    return;
  }

  const getCallbackUrl = () => {
    if (process.env.CUSTOM_DOMAIN) {
      return `https://${process.env.CUSTOM_DOMAIN}/api/customer/callback`;
    }
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}/api/customer/callback`;
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
      return `https://${process.env.REPLIT_DEV_DOMAIN}/api/customer/callback`;
    }
    return "/api/customer/callback";
  };

  const callbackURL = getCallbackUrl();
  console.log("[CustomerAuth] Google OAuth callback URL configured");

  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        callbackURL,
        scope: ["profile", "email"],
        proxy: true,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const user = await upsertCustomerFromGoogle(profile);
          done(null, { customerId: user.id, authMethod: 'google' } as Express.User);
        } catch (error) {
          console.error("[CustomerAuth] Google strategy error:", (error as Error).message);
          done(error as Error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: Express.User, done) => {
    done(null, user);
  });

  app.get("/api/customer/google/login",
    passport.authenticate("google", {
      scope: ["profile", "email"],
      prompt: "select_account"
    })
  );

  app.get("/api/customer/callback", (req, res, next) => {
    if (req.query.error) {
      console.error("[CustomerAuth] OAuth error:", req.query.error);
      return res.redirect(`/?error=${req.query.error}`);
    }

    try {
      passport.authenticate("google", { failureRedirect: "/?error=auth_failed" }, (err: any, user: Express.User | false, _info: any) => {
        if (err) {
          console.error("[CustomerAuth] Google OAuth error:", (err as Error).message);
          return res.redirect("/?error=auth_failed");
        }
        if (!user) {
          console.error("[CustomerAuth] No user returned from Google OAuth");
          return res.redirect("/?error=auth_failed");
        }

        req.session.regenerate((regenErr) => {
          if (regenErr) {
            console.error("[CustomerAuth] Session regenerate failed:", (regenErr as Error).message);
            return res.redirect("/?error=session_failed");
          }

          req.logIn(user, (loginErr) => {
            if (loginErr) {
              console.error("[CustomerAuth] Passport login failed:", (loginErr as Error).message);
              return res.redirect("/?error=auth_failed");
            }

            req.session.authenticatedAt = Date.now();
            req.session.save((saveErr) => {
              if (saveErr) {
                console.error("[CustomerAuth] Session save failed:", (saveErr as Error).message);
                return res.redirect("/?error=session_failed");
              }
              res.redirect("/");
            });
          });
        });
      })(req, res, next);
    } catch (error) {
      console.error("[CustomerAuth] OAuth callback exception:", (error as Error).message);
      res.redirect("/?error=exception");
    }
  });

  app.get("/api/customer/google/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("[CustomerAuth] Passport logout error:", (err as Error).message);
      }
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          console.error("[CustomerAuth] Session destroy error:", (destroyErr as Error).message);
        }
        res.clearCookie("customer.sid");
        res.clearCookie("connect.sid");

        if (req.headers.accept?.includes("application/json") || req.query.json === "true") {
          res.json({ message: "Logged out successfully" });
        } else {
          res.redirect("/");
        }
      });
    });
  });

  app.get("/api/customer/auth/me", async (req: any, res) => {
    try {
      // Prefer Passport authentication (Google OAuth)
      if (req.isAuthenticated() && req.user?.customerId && req.user?.authMethod === 'google') {
        const user = await storage.getUser(req.user.customerId);
        if (user) {
          const { password, ...userWithoutPassword } = user;
          return res.json(userWithoutPassword);
        }
      }

      // Fallback to session-based auth (phone/password) with authMethod verification
      if (req.session?.customerId && req.session?.authMethod === 'phone') {
        const user = await storage.getUser(req.session.customerId);
        if (user) {
          const { password, ...userWithoutPassword } = user;
          return res.json(userWithoutPassword);
        }
      }

      // Also check for legacy sessions without authMethod (backwards compatibility)
      if (req.session?.customerId && !req.session?.authMethod) {
        const user = await storage.getUser(req.session.customerId);
        if (user) {
          // Only trust if user doesn't have a googleSub (i.e., they are a phone user)
          if (!user.googleSub) {
            const { password, ...userWithoutPassword } = user;
            return res.json(userWithoutPassword);
          }
        }
      }

      res.status(401).json({ message: "Not authenticated" });
    } catch (error) {
      console.error("[CustomerAuth] Failed to fetch auth state:", (error as Error).message);
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });


  const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

  app.post("/api/customer/google/native-login", async (req, res) => {
    try {
      const { idToken } = req.body;
      if (!idToken) return res.status(400).json({ message: "Missing idToken" });

      // Verify the token
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();

      if (!payload) return res.status(401).json({ message: "Invalid token" });

      const googleSub = payload.sub;
      const email = payload.email;
      const name = payload.name || "Google User";
      const profileImageUrl = payload.picture;

      // Check if user is already logged in (Linking Flow)
      if (req.session?.customerId) {
        const user = await storage.linkUserToGoogle(req.session.customerId, {
          googleSub,
          name,
          email,
          profileImageUrl
        });
        const { password: _p, passwordHash: _ph, temporaryPassword: _tp, resetSecret: _rs, otpSecret: _os, ...safeLinkedUser } = user as any;
        return res.json({ message: "Account linked successfully", user: safeLinkedUser });
      }

      const user = await storage.upsertUserFromGoogle({
        googleSub,
        name,
        email,
        profileImageUrl
      });

      const oldCsrf = req.session?.csrfToken;
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.error("[CustomerAuth] Native Google session regenerate failed:", (regenErr as Error).message);
          return res.status(500).json({ message: "Session creation failed" });
        }
        if (oldCsrf) req.session.csrfToken = oldCsrf;
        req.session.customerId = user.id;
        req.session.authMethod = 'google';
        req.session.authenticatedAt = Date.now();
        req.session.save((err) => {
          if (err) {
            console.error("[CustomerAuth] Native Google session save failed:", (err as Error).message);
            return res.status(500).json({ message: "Session creation failed" });
          }
          const { password: _, ...safeUser } = user;
          res.json({ message: "Logged in successfully", user: safeUser });
        });
      });

    } catch (error) {
      console.error("[CustomerAuth] Native Google auth failed:", (error as Error).message);
      res.status(500).json({ message: "Authentication failed" });
    }
  });
}

export const isCustomerAuthenticated: RequestHandler = async (req: any, res, next) => {
  if (req.isAuthenticated() && req.user?.customerId) {
    return next();
  }

  if (req.session?.customerId) {
    return next();
  }

  return res.status(401).json({ message: "Unauthorized" });
};
