import "dotenv/config";
/* eslint-disable @typescript-eslint/no-explicit-any */
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Server } from "socket.io";
import { z } from "zod";

const dataDir = join(process.cwd(), "data");
if (!existsSync(dataDir)) mkdirSync(dataDir);

const db = new DatabaseSync(join(dataDir, "fitlink.sqlite"));
const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" } });
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const PORT = Number(process.env.PORT ?? 3333);

type Role = "MEMBER" | "PERSONAL" | "NUTRITIONIST" | "ADMIN";
type AuthRequest = express.Request & { user?: { id: string; role: Role } };

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json({ limit: "2mb" }));

function id() {
  return randomUUID();
}

function now() {
  return new Date().toISOString();
}

function publicUser(user: any) {
  if (!user) return null;
  const safe = { ...user };
  delete safe.passwordHash;
  return safe;
}

function signToken(user: { id: string; role: Role }) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
}

function auth(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Login necessario." });
  try {
    req.user = jwt.verify(token, JWT_SECRET) as { id: string; role: Role };
    next();
  } catch {
    res.status(401).json({ error: "Sessao invalida." });
  }
}

function initDb() {
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

function getUserByEmail(email: string) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as any;
}

function getUser(id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
}

async function seed() {
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

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/register", async (req, res) => {
  const data = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6), goal: z.string().optional() }).parse(req.body);
  const userId = id();
  db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    userId, data.name, data.email.toLowerCase(), await bcrypt.hash(data.password, 10), "MEMBER", null, null,
    data.goal ?? "Criar uma rotina fitness", null, now(), now(),
  );
  const user = getUser(userId);
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const data = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const user = getUserByEmail(data.email);
  if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) return res.status(401).json({ error: "Email ou senha invalidos." });
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/me", auth, (req: AuthRequest, res) => res.json(publicUser(getUser(req.user!.id))));

app.patch("/api/me", auth, (req: AuthRequest, res) => {
  const data = z.object({ name: z.string().optional(), email: z.string().email().optional(), avatarUrl: z.string().optional(), bio: z.string().optional(), goal: z.string().optional(), location: z.string().optional() }).parse(req.body);
  const current = getUser(req.user!.id);
  db.prepare("UPDATE users SET name=?, email=?, avatarUrl=?, bio=?, goal=?, location=?, updatedAt=? WHERE id=?").run(
    data.name ?? current.name, data.email?.toLowerCase() ?? current.email, data.avatarUrl || current.avatarUrl, data.bio ?? current.bio,
    data.goal ?? current.goal, data.location ?? current.location, now(), req.user!.id,
  );
  res.json(publicUser(getUser(req.user!.id)));
});

app.get("/api/feed", auth, (req: AuthRequest, res) => {
  const posts = db.prepare("SELECT p.*, u.name, u.email, u.role, u.avatarUrl, u.bio, u.goal, u.location FROM posts p JOIN users u ON u.id=p.authorId ORDER BY p.createdAt DESC").all() as any[];
  res.json(posts.map((post) => {
    const likes = db.prepare("SELECT * FROM likes WHERE postId = ?").all(post.id) as any[];
    const comments = db.prepare("SELECT c.*, u.name, u.email, u.role, u.avatarUrl, u.bio, u.goal, u.location FROM comments c JOIN users u ON u.id=c.authorId WHERE c.postId=? ORDER BY c.createdAt").all(post.id) as any[];
    return {
      id: post.id, title: post.title, content: post.content, workout: post.workout, type: post.type, createdAt: post.createdAt,
      author: publicUser({ id: post.authorId, name: post.name, email: post.email, role: post.role, avatarUrl: post.avatarUrl, bio: post.bio, goal: post.goal, location: post.location }),
      comments: comments.map((c) => ({ id: c.id, content: c.content, author: publicUser({ id: c.authorId, name: c.name, email: c.email, role: c.role, avatarUrl: c.avatarUrl, bio: c.bio, goal: c.goal, location: c.location }) })),
      likeCount: likes.length,
      likedByMe: likes.some((like) => like.userId === req.user!.id),
    };
  }));
});

app.post("/api/posts", auth, (req: AuthRequest, res) => {
  const data = z.object({ title: z.string().min(3), content: z.string().min(3), workout: z.string().optional(), type: z.string().optional() }).parse(req.body);
  const postId = id();
  db.prepare("INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(postId, req.user!.id, data.type ?? "TREINO", data.title, data.content, data.workout ?? null, null, now());
  res.json({ id: postId });
});

app.post("/api/posts/:id/like", auth, (req: AuthRequest, res) => {
  const existing = db.prepare("SELECT * FROM likes WHERE postId=? AND userId=?").get(req.params.id, req.user!.id) as any;
  if (existing) {
    db.prepare("DELETE FROM likes WHERE id=?").run(existing.id);
    return res.json({ liked: false });
  }
  db.prepare("INSERT INTO likes VALUES (?, ?, ?, ?)").run(id(), req.params.id, req.user!.id, now());
  res.json({ liked: true });
});

app.post("/api/posts/:id/comments", auth, (req: AuthRequest, res) => {
  const data = z.object({ content: z.string().min(1) }).parse(req.body);
  db.prepare("INSERT INTO comments VALUES (?, ?, ?, ?, ?)").run(id(), req.params.id, req.user!.id, data.content, now());
  res.json({ ok: true });
});

app.get("/api/users", auth, (req: AuthRequest, res) => {
  const users = db.prepare("SELECT * FROM users WHERE id <> ? ORDER BY name").all(req.user!.id) as any[];
  res.json(users.map((user) => ({ ...publicUser(user), isFollowing: Boolean(db.prepare("SELECT id FROM follows WHERE followerId=? AND followingId=?").get(req.user!.id, user.id)) })));
});

app.post("/api/users/:id/follow", auth, (req: AuthRequest, res) => {
  const existing = db.prepare("SELECT * FROM follows WHERE followerId=? AND followingId=?").get(req.user!.id, req.params.id) as any;
  if (existing) {
    db.prepare("DELETE FROM follows WHERE id=?").run(existing.id);
    return res.json({ following: false });
  }
  db.prepare("INSERT INTO follows VALUES (?, ?, ?, ?)").run(id(), req.user!.id, req.params.id, now());
  res.json({ following: true });
});

app.get("/api/professionals", auth, (_req, res) => {
  const pros = db.prepare("SELECT * FROM users WHERE role IN ('PERSONAL', 'NUTRITIONIST') ORDER BY name").all() as any[];
  res.json(pros.map(publicUser));
});

app.get("/api/messages/:userId", auth, (req: AuthRequest, res) => {
  res.json(db.prepare("SELECT * FROM messages WHERE (senderId=? AND receiverId=?) OR (senderId=? AND receiverId=?) ORDER BY createdAt").all(req.user!.id, req.params.userId, req.params.userId, req.user!.id));
});

app.post("/api/messages/:userId", auth, (req: AuthRequest, res) => {
  const data = z.object({ content: z.string().min(1) }).parse(req.body);
  const message = { id: id(), senderId: req.user!.id, receiverId: req.params.userId, content: data.content, createdAt: now() };
  db.prepare("INSERT INTO messages VALUES (?, ?, ?, ?, ?)").run(message.id, message.senderId, message.receiverId, message.content, message.createdAt);
  io.to(message.receiverId).to(message.senderId).emit("message:new", message);
  res.json(message);
});

app.get("/api/plans", auth, (req: AuthRequest, res) => {
  const plans = db.prepare("SELECT p.*, u.name, u.email, u.role, u.avatarUrl, u.bio, u.goal, u.location FROM plans p LEFT JOIN users u ON u.id=p.authorId WHERE p.memberId=? ORDER BY p.createdAt DESC").all(req.user!.id) as any[];
  res.json(plans.map((plan) => ({ ...plan, author: plan.authorId ? publicUser({ id: plan.authorId, name: plan.name, email: plan.email, role: plan.role, avatarUrl: plan.avatarUrl, bio: plan.bio, goal: plan.goal, location: plan.location }) : undefined })));
});

app.post("/api/ai/plan", auth, (req: AuthRequest, res) => {
  const data = z.object({ goal: z.string().min(3), level: z.string(), days: z.coerce.number().min(2).max(7), diet: z.string().min(3) }).parse(req.body);
  const content = [`Plano de treino ${data.level} para ${data.goal}`, `Frequencia: ${data.days} dias por semana.`, "Treino A: inferiores, agachamento, leg press, stiff, panturrilha e core.", "Treino B: superiores, supino, remada, desenvolvimento, puxada e bracos.", "Treino C: condicionamento, mobilidade e circuito metabolico.", `Dieta base: ${data.diet}. Priorize proteina, vegetais, agua e ajuste calorias pela evolucao.`, "Consulte um profissional para restricoes clinicas."].join("\n");
  const plan = { id: id(), memberId: req.user!.id, authorId: null, kind: "IA", title: `Plano IA - ${data.goal}`, content, createdAt: now() };
  db.prepare("INSERT INTO plans VALUES (?, ?, ?, ?, ?, ?, ?)").run(plan.id, plan.memberId, plan.authorId, plan.kind, plan.title, plan.content, plan.createdAt);
  res.json(plan);
});

app.get("/api/appointments", auth, (req: AuthRequest, res) => {
  const items = db.prepare("SELECT * FROM appointments WHERE memberId=? OR professionalId=? ORDER BY startsAt").all(req.user!.id, req.user!.id) as any[];
  res.json(items.map((item) => ({ ...item, member: publicUser(getUser(item.memberId)), professional: publicUser(getUser(item.professionalId)) })));
});

app.post("/api/appointments", auth, (req: AuthRequest, res) => {
  const data = z.object({ professionalId: z.string(), title: z.string().min(3), startsAt: z.string().datetime(), notes: z.string().optional() }).parse(req.body);
  const appointment = { id: id(), memberId: req.user!.id, professionalId: data.professionalId, title: data.title, startsAt: data.startsAt, status: "PENDING", notes: data.notes ?? null, createdAt: now() };
  db.prepare("INSERT INTO appointments VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(appointment.id, appointment.memberId, appointment.professionalId, appointment.title, appointment.startsAt, appointment.status, appointment.notes, appointment.createdAt);
  res.json(appointment);
});

io.on("connection", (socket) => {
  try {
    const user = jwt.verify(socket.handshake.auth.token as string, JWT_SECRET) as { id: string };
    socket.join(user.id);
  } catch {
    socket.disconnect();
  }
});

initDb();
seed().then(() => server.listen(PORT, () => console.log(`API FitLink rodando em http://localhost:${PORT}`)));
