import bcrypt from "bcryptjs";
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
}

export function getUserByEmail(email: string) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as any;
}

export function getUser(id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
}

export async function seed() {
  // Popula o ambiente local com usuarios, posts, plano e agenda para teste imediato.
  const count = db.prepare("SELECT COUNT(*) as total FROM users").get() as { total: number };
  if (count.total > 0) return;
  const passwordHash = await bcrypt.hash("123456", 10);
  const users = [
    ["ana", "Ana Ribeiro", "ana@fitlink.com", "MEMBER", "Emagrecer com saude", "Corrida leve, musculacao e marmitas simples.", "Sao Paulo", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=180&h=180&fit=crop&crop=faces"],
    ["marcos", "Marcos Lima", "marcos@fitlink.com", "PERSONAL", "Forca e hipertrofia", "Personal trainer especialista em recomposicao corporal.", "Online", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=180&h=180&fit=crop&crop=faces"],
    ["julia", "Dra. Julia Costa", "julia@fitlink.com", "NUTRITIONIST", "Nutrir rotina real", "Nutricionista esportiva, sem terrorismo alimentar.", "Online", "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=180&h=180&fit=crop&crop=faces"],
    ["leo", "Leo Martins", "leo@fitlink.com", "MEMBER", "Correr 10 km", "Tentando bater meus primeiros 10 km sem quebrar no km 7.", "Campinas", "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=180&h=180&fit=crop&crop=faces"],
  ];
  const insertUser = db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  users.forEach(([userId, name, email, role, goal, bio, location, avatarUrl]) => {
    insertUser.run(userId, name, email, passwordHash, role, avatarUrl, bio, goal, location, now(), now());
  });
  db.prepare("INSERT INTO follows VALUES (?, ?, ?, ?)").run(id(), "ana", "marcos", now());
  const post = db.prepare("INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  post.run(id(), "ana", "TREINO", "Treino de pernas finalizado", "Hoje subi carga no agachamento e finalizei com 15 min de escada.", "Agachamento 4x8, leg press 4x10, stiff 3x10", null, now());
  post.run(id(), "marcos", "TREINO", "Dica rapida para progressao", "Primeiro estabilize tecnica, amplitude e descanso.", "Anote carga, RPE e repeticoes feitas de verdade.", null, now());
  post.run(id(), "julia", "DIETA", "Pre-treino simples", "Banana, iogurte e aveia resolvem a vida de muita gente antes do treino.", null, null, now());
  db.prepare("INSERT INTO plans VALUES (?, ?, ?, ?, ?, ?, ?)").run(id(), "ana", "marcos", "TREINO", "Hipertrofia iniciante - 4 semanas", "4 dias por semana alternando inferiores e superiores, com progressao leve de carga e cardio moderado.", now());
  db.prepare("INSERT INTO appointments VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id(), "ana", "julia", "Consulta nutricional inicial", new Date(Date.now() + 86400000).toISOString(), "CONFIRMED", "Levar medidas atuais e rotina alimentar.", now());
}
