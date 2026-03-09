import { Request, Response, NextFunction } from "express";
import { storage } from "../../storage.js";

export function superAdminOnly(req: Request, res: Response, next: NextFunction) {
    const adminUserId = req.session?.adminUserId;

    if (!adminUserId) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    storage.getUser(adminUserId)
        .then((user) => {
            if (!user) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            if (user.role !== "Super Admin") {
                return res.status(403).json({ error: "Forbidden: Super Admin access required" });
            }

            next();
        })
        .catch((err) => {
            console.error("[superAdminOnly] Error:", err);
            return res.status(500).json({ error: "Internal Server Error" });
        });
}
