import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "@neondatabase/serverless",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  /**
   * A production build, whatever .env says.
   *
   * .env carries NODE_ENV="development" for local work, and it reaches this
   * process, so Vite built the client in development mode: import.meta.env.PROD
   * was false and client/src/lib/config.ts chose its development branch. On the
   * web that is invisible, because the dev branch there is the empty string and
   * same-origin requests work anyway.
   *
   * In the staff app it was fatal. The native development branch is
   * http://10.0.2.2:5083 — the address an emulator uses to reach the machine
   * that built it — so the installed app asked a laptop that was not there, over
   * http from an https page, and Android blocked it as mixed content. What the
   * user saw was "failed to fetch" while the website beside it worked.
   *
   * Set before the build rather than passed as an option, because Vite reads
   * process.env.NODE_ENV directly when deciding isProduction.
   */
  process.env.NODE_ENV = "production";

  console.log("building client...");
  await viteBuild({ mode: "production" });

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
