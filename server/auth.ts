import type express from "express";
import jwt from "jsonwebtoken";

// O SQLite nativo retorna objetos dinamicos, entao limpamos campos sensiveis em runtime.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type Role = "MEMBER" | "PERSONAL" | "NUTRITIONIST" | "ADMIN";
export type AuthRequest = express.Request & { user?: { id: string; role: Role } };

export function publicUser(user: any) {
  if (!user) return null;
  const safe = { ...user };
  delete safe.passwordHash;
  return safe;
}

export function signToken(user: { id: string; role: Role }, secret: string) {
  return jwt.sign({ id: user.id, role: user.role }, secret, { expiresIn: "7d" });
}

export function createAuthMiddleware(secret: string) {
  return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Login necessario." });

    try {
      req.user = jwt.verify(token, secret) as { id: string; role: Role };
      next();
    } catch {
      res.status(401).json({ error: "Sessao invalida." });
    }
  };
}
