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
import { db, getUser, getUserByEmail, id, initDb, now, removeDemoData } from "./database";

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" } });
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const PORT = Number(process.env.PORT ?? 3333);
const auth = createAuthMiddleware(JWT_SECRET);
const professionalRoles = ["PERSONAL", "NUTRITIONIST"];

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/register", async (req, res) => {
  const data = z
    .object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
      goal: z.string().optional(),
      accountType: z.enum(["MEMBER", "PROFESSIONAL"]).optional(),
      professionalKind: z.enum(["PERSONAL", "NUTRITIONIST"]).optional(),
      credential: z.string().optional(),
      documentUrl: z.string().optional(),
      subscriptionPlan: z.string().optional(),
    })
    .parse(req.body);
  const userId = id();
  const isProfessional = data.accountType === "PROFESSIONAL";
  const role = isProfessional ? data.professionalKind ?? "PERSONAL" : "MEMBER";
  const verificationStatus = isProfessional ? "PENDING" : "NOT_REQUIRED";
  const subscriptionStatus = isProfessional ? "TRIAL" : "NONE";
  db.prepare(`
    INSERT INTO users (
      id, name, email, passwordHash, role, avatarUrl, bio, goal, location, createdAt, updatedAt,
      professionalKind, verificationStatus, credential, documentUrl, subscriptionPlan, subscriptionStatus
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    data.name,
    data.email.toLowerCase(),
    await bcrypt.hash(data.password, 10),
    role,
    null,
    null,
    data.goal ?? (isProfessional ? "Atender alunos com seguranca" : "Criar uma rotina fitness"),
    null,
    now(),
    now(),
    isProfessional ? role : null,
    verificationStatus,
    data.credential ?? null,
    data.documentUrl ?? null,
    data.subscriptionPlan ?? null,
    subscriptionStatus,
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
  const data = z.object({ name: z.string().optional(), email: z.string().email().optional(), avatarUrl: z.string().max(6_000_000).optional(), bio: z.string().optional(), goal: z.string().optional(), location: z.string().optional() }).parse(req.body);
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
  const pros = db.prepare("SELECT * FROM users WHERE role IN ('PERSONAL', 'NUTRITIONIST') AND verificationStatus = 'VERIFIED' ORDER BY name").all() as any[];
  res.json(pros.map(publicUser));
});

function adminOnly(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (req.user?.role !== "ADMIN") return res.status(403).json({ error: "Acesso restrito ao administrador." });
  next();
}

app.get("/api/admin/professionals", auth, adminOnly, (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "PENDING";
  const professionals = db
    .prepare(`
      SELECT * FROM users
      WHERE role IN ('PERSONAL', 'NUTRITIONIST') AND verificationStatus = ?
      ORDER BY createdAt DESC
    `)
    .all(status) as any[];
  res.json(professionals.map(publicUser));
});

app.patch("/api/admin/professionals/:id/verification", auth, adminOnly, (req, res) => {
  const professionalId = String(req.params.id);
  const data = z.object({ status: z.enum(["VERIFIED", "REJECTED", "PENDING"]) }).parse(req.body);
  const professional = getUser(professionalId);

  if (!professional || !professionalRoles.includes(professional.role)) {
    return res.status(404).json({ error: "Profissional nao encontrado." });
  }

  db.prepare("UPDATE users SET verificationStatus=?, subscriptionStatus=?, updatedAt=? WHERE id=?").run(
    data.status,
    data.status === "VERIFIED" ? "ACTIVE" : professional.subscriptionStatus,
    now(),
    professionalId,
  );

  res.json(publicUser(getUser(professionalId)));
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
  const weeklySplit = [
    "Dia 1: inferiores com agachamento, leg press, stiff, panturrilha e core.",
    "Dia 2: superiores com supino, remada, desenvolvimento, puxada e bracos.",
    "Dia 3: cardio progressivo, mobilidade e circuito metabolico leve.",
    "Dia 4: inferiores com foco posterior, gluteos, unilateral e abdomen.",
    "Dia 5: superiores com costas, peito, ombros e finalizacao de bracos.",
    "Dia 6: condicionamento, tecnica dos exercicios e alongamento ativo.",
    "Dia 7: recuperacao, caminhada leve e revisao de medidas.",
  ].slice(0, data.days);
  const intensity = {
    iniciante: "Use cargas confortaveis, 2 a 3 series por exercicio e aprenda a tecnica antes de subir peso.",
    intermediario: "Trabalhe com 3 a 4 series, progressao semanal pequena e 1 a 2 repeticoes em reserva.",
    avancado: "Alterne semanas de volume e intensidade, registre RPE e proteja a recuperacao.",
  }[data.level] ?? "Ajuste volume e intensidade conforme energia, sono e evolucao.";
  const content = [
    `Plano ${data.level} para ${data.goal}`,
    `Frequencia: ${data.days} dias por semana.`,
    intensity,
    "",
    "Divisao semanal:",
    ...weeklySplit,
    "",
    "Dieta base:",
    `${data.diet}. Priorize proteina em todas as refeicoes, vegetais, carboidratos perto do treino, agua e constancia.`,
    "",
    "Acompanhamento:",
    "Registre carga, repeticoes, sono, fome, medidas e energia. Ajuste o plano a cada 2 semanas.",
    "Consulte um profissional para restricoes clinicas, lesoes ou objetivos competitivos.",
  ].join("\n");
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

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  void next;
  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0];
    const field = firstIssue?.path.join(".");
    const message =
      {
        email: "Informe um email valido. Exemplo: nome@email.com.",
        password: "A senha deve ter pelo menos 6 caracteres.",
        name: "Informe seu nome completo.",
        credential: "Informe seu registro profissional, como CREF ou CRN.",
        documentUrl: "Informe um link valido para o comprovante profissional.",
      }[field ?? ""] ?? "Confira os dados informados.";
    return res.status(400).json({ error: message });
  }

  if (error instanceof Error && error.message.includes("UNIQUE constraint failed: users.email")) {
    return res.status(409).json({ error: "Este email ja esta cadastrado. Tente entrar na conta." });
  }

  console.error(error);
  return res.status(500).json({ error: "Nao foi possivel concluir a acao agora." });
});

async function ensureAdminUser() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Administrador FitLink";

  if (!email || !password) return;

  const existing = getUserByEmail(email);
  if (existing) {
    if (existing.role !== "ADMIN") {
      db.prepare("UPDATE users SET role='ADMIN', updatedAt=? WHERE id=?").run(now(), existing.id);
    }
    return;
  }

  db.prepare(`
    INSERT INTO users (
      id, name, email, passwordHash, role, avatarUrl, bio, goal, location, createdAt, updatedAt,
      professionalKind, verificationStatus, credential, documentUrl, subscriptionPlan, subscriptionStatus
    ) VALUES (?, ?, ?, ?, 'ADMIN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id(),
    name,
    email,
    await bcrypt.hash(password, 10),
    null,
    "Conta administrativa para verificar profissionais.",
    "Administrar a plataforma",
    null,
    now(),
    now(),
    null,
    "NOT_REQUIRED",
    null,
    null,
    null,
    "NONE",
  );
}

initDb();
removeDemoData();
ensureAdminUser().then(() => server.listen(PORT, () => console.log(`API FitLink rodando em http://localhost:${PORT}`)));
