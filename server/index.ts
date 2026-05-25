import "dotenv/config";
// O SQLite nativo retorna registros sem tipos fortes; validamos as entradas com Zod.
/* eslint-disable @typescript-eslint/no-explicit-any */
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";
import { createAuthMiddleware, publicUser, signToken, type AuthRequest } from "./auth";
import { db, getUser, getUserByEmail, id, initDb, now, seed } from "./database";

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" } });
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const PORT = Number(process.env.PORT ?? 3333);
const auth = createAuthMiddleware(JWT_SECRET);

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/register", async (req, res) => {
  const data = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(6), goal: z.string().optional() }).parse(req.body);
  const userId = id();
  db.prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    userId, data.name, data.email.toLowerCase(), await bcrypt.hash(data.password, 10), "MEMBER", null, null,
    data.goal ?? "Criar uma rotina fitness", null, now(), now(),
  );
  const user = getUser(userId);
  res.json({ token: signToken(user, JWT_SECRET), user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const data = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const user = getUserByEmail(data.email);
  if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) return res.status(401).json({ error: "Email ou senha invalidos." });
  res.json({ token: signToken(user, JWT_SECRET), user: publicUser(user) });
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
  const postId = String(req.params.id);
  const existing = db.prepare("SELECT * FROM likes WHERE postId=? AND userId=?").get(postId, req.user!.id) as any;
  if (existing) {
    db.prepare("DELETE FROM likes WHERE id=?").run(existing.id);
    return res.json({ liked: false });
  }
  db.prepare("INSERT INTO likes VALUES (?, ?, ?, ?)").run(id(), postId, req.user!.id, now());
  res.json({ liked: true });
});

app.post("/api/posts/:id/comments", auth, (req: AuthRequest, res) => {
  const postId = String(req.params.id);
  const data = z.object({ content: z.string().min(1) }).parse(req.body);
  db.prepare("INSERT INTO comments VALUES (?, ?, ?, ?, ?)").run(id(), postId, req.user!.id, data.content, now());
  res.json({ ok: true });
});

app.get("/api/users", auth, (req: AuthRequest, res) => {
  const users = db.prepare("SELECT * FROM users WHERE id <> ? ORDER BY name").all(req.user!.id) as any[];
  res.json(users.map((user) => ({ ...publicUser(user), isFollowing: Boolean(db.prepare("SELECT id FROM follows WHERE followerId=? AND followingId=?").get(req.user!.id, user.id)) })));
});

app.post("/api/users/:id/follow", auth, (req: AuthRequest, res) => {
  const followingId = String(req.params.id);
  const existing = db.prepare("SELECT * FROM follows WHERE followerId=? AND followingId=?").get(req.user!.id, followingId) as any;
  if (existing) {
    db.prepare("DELETE FROM follows WHERE id=?").run(existing.id);
    return res.json({ following: false });
  }
  db.prepare("INSERT INTO follows VALUES (?, ?, ?, ?)").run(id(), req.user!.id, followingId, now());
  res.json({ following: true });
});

app.get("/api/professionals", auth, (_req, res) => {
  const pros = db.prepare("SELECT * FROM users WHERE role IN ('PERSONAL', 'NUTRITIONIST') ORDER BY name").all() as any[];
  res.json(pros.map(publicUser));
});

app.get("/api/messages/:userId", auth, (req: AuthRequest, res) => {
  const otherUserId = String(req.params.userId);
  res.json(db.prepare("SELECT * FROM messages WHERE (senderId=? AND receiverId=?) OR (senderId=? AND receiverId=?) ORDER BY createdAt").all(req.user!.id, otherUserId, otherUserId, req.user!.id));
});

app.post("/api/messages/:userId", auth, (req: AuthRequest, res) => {
  const receiverId = String(req.params.userId);
  const data = z.object({ content: z.string().min(1) }).parse(req.body);
  const message = { id: id(), senderId: req.user!.id, receiverId, content: data.content, createdAt: now() };
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
