// O SQLite nativo retorna objetos dinamicos; as rotas validam entradas com Zod.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir);

export const db = new DatabaseSync(join(dataDir, "fitlink.sqlite"));

export function id() {
  return randomUUID();
}

export function now() {
  return new Date().toISOString();
}

export function initDb() {
  // Cria as tabelas essenciais do FitLink quando o banco local ainda nao existe.
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'MEMBER', avatarUrl TEXT, bio TEXT, goal TEXT NOT NULL, location TEXT,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY, followerId TEXT NOT NULL, followingId TEXT NOT NULL, createdAt TEXT NOT NULL,
      UNIQUE(followerId, followingId), FOREIGN KEY(followerId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(followingId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, authorId TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'TREINO', title TEXT NOT NULL,
      content TEXT NOT NULL, workout TEXT, imageUrl TEXT, createdAt TEXT NOT NULL,
      FOREIGN KEY(authorId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY, postId TEXT NOT NULL, authorId TEXT NOT NULL, content TEXT NOT NULL, createdAt TEXT NOT NULL,
      FOREIGN KEY(postId) REFERENCES posts(id) ON DELETE CASCADE, FOREIGN KEY(authorId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY, postId TEXT NOT NULL, userId TEXT NOT NULL, createdAt TEXT NOT NULL,
      UNIQUE(postId, userId), FOREIGN KEY(postId) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, senderId TEXT NOT NULL, receiverId TEXT NOT NULL, content TEXT NOT NULL, createdAt TEXT NOT NULL,
      FOREIGN KEY(senderId) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(receiverId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY, memberId TEXT NOT NULL, authorId TEXT, kind TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL, createdAt TEXT NOT NULL,
      FOREIGN KEY(memberId) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(authorId) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY, memberId TEXT NOT NULL, professionalId TEXT NOT NULL, title TEXT NOT NULL,
      startsAt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', notes TEXT, createdAt TEXT NOT NULL,
      FOREIGN KEY(memberId) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(professionalId) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  addColumnIfMissing("users", "professionalKind", "TEXT");
  addColumnIfMissing("users", "verificationStatus", "TEXT NOT NULL DEFAULT 'NOT_REQUIRED'");
  addColumnIfMissing("users", "credential", "TEXT");
  addColumnIfMissing("users", "documentUrl", "TEXT");
  addColumnIfMissing("users", "subscriptionPlan", "TEXT");
  addColumnIfMissing("users", "subscriptionStatus", "TEXT NOT NULL DEFAULT 'NONE'");
}

export function getUserByEmail(email: string) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as any;
}

export function getUser(id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function removeDemoData() {
  const demoIds = ["ana", "marcos", "julia", "leo"];
  const placeholders = demoIds.map(() => "?").join(",");
  db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...demoIds);
}
