import { useEffect, useMemo, useState } from "react";
/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
import { io, Socket } from "socket.io-client";
import {
  Apple,
  Bot,
  CalendarDays,
  Dumbbell,
  Heart,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import "./App.css";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

type Role = "MEMBER" | "PERSONAL" | "NUTRITIONIST" | "ADMIN";
type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  bio?: string;
  goal: string;
  location?: string;
  isFollowing?: boolean;
};
type Post = {
  id: string;
  title: string;
  content: string;
  workout?: string;
  type: string;
  createdAt: string;
  author: User;
  comments: { id: string; content: string; author: User }[];
  likeCount: number;
  likedByMe: boolean;
};
type Message = { id: string; senderId: string; receiverId: string; content: string; createdAt: string };
type Plan = { id: string; title: string; kind: string; content: string; createdAt: string; author?: User };
type Appointment = {
  id: string;
  title: string;
  startsAt: string;
  status: string;
  notes?: string;
  professional: User;
  member: User;
};

const nav = [
  ["feed", "Feed", Dumbbell],
  ["people", "Pessoas", Users],
  ["chat", "Chat", MessageCircle],
  ["ai", "IA", Bot],
  ["pros", "Profissionais", Apple],
  ["agenda", "Agenda", CalendarDays],
  ["settings", "Conta", Settings],
] as const;

function roleLabel(role: Role) {
  return { MEMBER: "Aluno", PERSONAL: "Personal", NUTRITIONIST: "Nutricionista", ADMIN: "Admin" }[role];
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("fitlink_token") ?? "");
  const [me, setMe] = useState<User | null>(null);
  const [tab, setTab] = useState<(typeof nav)[number][0]>("feed");
  const [posts, setPosts] = useState<Post[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [pros, setPros] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeChat, setActiveChat] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [notice, setNotice] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...(token ? authHeaders : { "Content-Type": "application/json" }), ...(options.headers ?? {}) },
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "Erro inesperado.");
    return res.json();
  }

  async function refresh() {
    if (!token) return;
    const [user, feed, users, professionals, userPlans, userAppointments] = await Promise.all([
      api<User>("/api/me"),
      api<Post[]>("/api/feed"),
      api<User[]>("/api/users"),
      api<User[]>("/api/professionals"),
      api<Plan[]>("/api/plans"),
      api<Appointment[]>("/api/appointments"),
    ]);
    setMe(user);
    setPosts(feed);
    setPeople(users);
    setPros(professionals);
    setPlans(userPlans);
    setAppointments(userAppointments);
    setActiveChat((current) => current ?? users[0] ?? null);
  }

  useEffect(() => {
    refresh().catch(() => logout());
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const live = io(API, { auth: { token } });
    live.on("message:new", (message: Message) => {
      setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
    });
    setSocket(live);
    return () => {
      live.close();
    };
  }, [token]);

  useEffect(() => {
    if (!activeChat || !token) return;
    api<Message[]>(`/api/messages/${activeChat.id}`).then(setMessages).catch(() => setMessages([]));
  }, [activeChat?.id, token]);

  function logout() {
    localStorage.removeItem("fitlink_token");
    setToken("");
    setMe(null);
    socket?.close();
  }

  async function onAuth(form: FormData) {
    const body = Object.fromEntries(form.entries());
    const path = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const data = await api<{ token: string; user: User }>(path, { method: "POST", body: JSON.stringify(body) });
    localStorage.setItem("fitlink_token", data.token);
    setToken(data.token);
    setMe(data.user);
  }

  async function submitPost(form: FormData) {
    await api<Post>("/api/posts", { method: "POST", body: JSON.stringify(Object.fromEntries(form.entries())) });
    setNotice("Post publicado.");
    await refresh();
  }

  async function generatePlan(form: FormData) {
    const body = Object.fromEntries(form.entries());
    await api<Plan>("/api/ai/plan", { method: "POST", body: JSON.stringify(body) });
    setNotice("Plano criado pela IA.");
    await refresh();
  }

  async function book(form: FormData) {
    const body = Object.fromEntries(form.entries());
    await api<Appointment>("/api/appointments", {
      method: "POST",
      body: JSON.stringify({ ...body, startsAt: new Date(String(body.startsAt)).toISOString() }),
    });
    setNotice("Horario solicitado.");
    await refresh();
  }

  async function sendMessage(form: FormData) {
    if (!activeChat) return;
    const content = String(form.get("content") ?? "");
    if (!content.trim()) return;
    await api<Message>(`/api/messages/${activeChat.id}`, { method: "POST", body: JSON.stringify({ content }) });
  }

  if (!token || !me) {
    return (
      <main className="auth-shell">
        <section className="auth-hero">
          <div className="brand-mark"><Dumbbell size={26} /> FitLink</div>
          <h1>Rede social, treinos, dietas e agenda fitness em um so lugar.</h1>
          <p>Entre com <b>ana@fitlink.com</b> e senha <b>123456</b>, ou crie sua conta agora.</p>
        </section>
        <form
          className="auth-panel"
          onSubmit={(event) => {
            event.preventDefault();
            onAuth(new FormData(event.currentTarget)).catch((error) => setNotice(error.message));
          }}
        >
          <div className="segmented">
            <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Entrar</button>
            <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Cadastrar</button>
          </div>
          {authMode === "register" && <input name="name" placeholder="Nome completo" required />}
          <input name="email" type="email" placeholder="Email" defaultValue="ana@fitlink.com" required />
          <input name="password" type="password" placeholder="Senha" defaultValue="123456" required />
          {authMode === "register" && <input name="goal" placeholder="Objetivo principal" />}
          <button className="primary" type="submit">{authMode === "login" ? "Entrar" : "Criar conta"}</button>
          {notice && <p className="notice">{notice}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><Dumbbell size={24} /> FitLink</div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>
        <button className="ghost" onClick={logout}><LogOut size={18} /> Sair</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>{roleLabel(me.role)} conectado</p>
            <h1>Oi, {me.name.split(" ")[0]}</h1>
          </div>
          <div className="profile-chip">
            <img src={me.avatarUrl || "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=180&h=180&fit=crop"} alt="" />
            <span>{me.goal}</span>
          </div>
        </header>
        {notice && <button className="notice inline" onClick={() => setNotice("")}>{notice}</button>}

        {tab === "feed" && (
          <div className="grid two">
            <form className="panel" onSubmit={(e) => { e.preventDefault(); submitPost(new FormData(e.currentTarget)); e.currentTarget.reset(); }}>
              <h2>Novo post</h2>
              <input name="title" placeholder="Titulo do treino ou dieta" required />
              <textarea name="content" placeholder="Conte o que voce fez hoje" required />
              <textarea name="workout" placeholder="Exercicios, cargas, refeicoes ou observacoes" />
              <button className="primary"><Plus size={18} /> Publicar</button>
            </form>
            <section className="feed-list">
              {posts.map((post) => (
                <article className="post" key={post.id}>
                  <div className="post-head"><img src={post.author.avatarUrl} alt="" /><div><b>{post.author.name}</b><span>{roleLabel(post.author.role)} - {new Date(post.createdAt).toLocaleString()}</span></div></div>
                  <h2>{post.title}</h2>
                  <p>{post.content}</p>
                  {post.workout && <pre>{post.workout}</pre>}
                  <div className="actions">
                    <button onClick={async () => { await api(`/api/posts/${post.id}/like`, { method: "POST" }); await refresh(); }}><Heart size={17} fill={post.likedByMe ? "currentColor" : "none"} /> {post.likeCount}</button>
                    <form onSubmit={async (e) => { e.preventDefault(); const data = new FormData(e.currentTarget); await api(`/api/posts/${post.id}/comments`, { method: "POST", body: JSON.stringify(Object.fromEntries(data.entries())) }); e.currentTarget.reset(); await refresh(); }}>
                      <input name="content" placeholder="Comentar" />
                    </form>
                  </div>
                  {post.comments.map((comment) => <p className="comment" key={comment.id}><b>{comment.author.name}:</b> {comment.content}</p>)}
                </article>
              ))}
            </section>
          </div>
        )}

        {tab === "people" && <UserGrid users={people} action={async (id) => { await api(`/api/users/${id}/follow`, { method: "POST" }); await refresh(); }} />}

        {tab === "chat" && (
          <div className="chat-layout">
            <UserGrid users={people} compact action={async (id) => setActiveChat(people.find((p) => p.id === id) ?? null)} />
            <section className="panel chat-panel">
              <h2>{activeChat ? `Conversa com ${activeChat.name}` : "Escolha uma pessoa"}</h2>
              <div className="messages">
                {messages.map((message) => <p key={message.id} className={message.senderId === me.id ? "mine" : ""}>{message.content}</p>)}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(new FormData(e.currentTarget)); e.currentTarget.reset(); }}>
                <input name="content" placeholder="Digite sua mensagem" />
                <button className="primary"><MessageCircle size={18} /> Enviar</button>
              </form>
            </section>
          </div>
        )}

        {tab === "ai" && (
          <div className="grid two">
            <form className="panel" onSubmit={(e) => { e.preventDefault(); generatePlan(new FormData(e.currentTarget)); }}>
              <h2>Gerador de treino e dieta</h2>
              <input name="goal" placeholder="Objetivo: emagrecer, hipertrofia..." required />
              <select name="level"><option>iniciante</option><option>intermediario</option><option>avancado</option></select>
              <input name="days" type="number" min="2" max="7" defaultValue="4" />
              <textarea name="diet" placeholder="Preferencias alimentares, restricoes e rotina" required />
              <button className="primary"><Bot size={18} /> Gerar plano</button>
            </form>
            <PlanList plans={plans} />
          </div>
        )}

        {tab === "pros" && (
          <div className="grid two">
            <UserGrid users={pros} compact action={async (id) => { setActiveChat(pros.find((p) => p.id === id) ?? null); setTab("chat"); }} />
            <section className="panel">
              <h2>Contratar profissional</h2>
              <p>Escolha um personal ou nutricionista, converse pelo chat e marque consulta na agenda.</p>
              <PlanList plans={plans} />
            </section>
          </div>
        )}

        {tab === "agenda" && (
          <div className="grid two">
            <form className="panel" onSubmit={(e) => { e.preventDefault(); book(new FormData(e.currentTarget)); }}>
              <h2>Marcar compromisso</h2>
              <select name="professionalId">{pros.map((pro) => <option key={pro.id} value={pro.id}>{pro.name} - {roleLabel(pro.role)}</option>)}</select>
              <input name="title" placeholder="Titulo da consulta" required />
              <input name="startsAt" type="datetime-local" required />
              <textarea name="notes" placeholder="Observacoes" />
              <button className="primary"><CalendarDays size={18} /> Agendar</button>
            </form>
            <section className="panel list">
              <h2>Minha agenda</h2>
              {appointments.map((item) => <article key={item.id}><b>{item.title}</b><span>{new Date(item.startsAt).toLocaleString()} com {item.professional.name}</span><small>{item.status}</small></article>)}
            </section>
          </div>
        )}

        {tab === "settings" && (
          <form className="panel settings" onSubmit={async (e) => { e.preventDefault(); await api("/api/me", { method: "PATCH", body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget).entries())) }); setNotice("Perfil atualizado."); await refresh(); }}>
            <h2>Configuracoes da conta</h2>
            <input name="name" defaultValue={me.name} placeholder="Nome" />
            <input name="email" defaultValue={me.email} placeholder="Email" />
            <input name="avatarUrl" defaultValue={me.avatarUrl} placeholder="URL da foto" />
            <input name="goal" defaultValue={me.goal} placeholder="Objetivo" />
            <input name="location" defaultValue={me.location} placeholder="Cidade" />
            <textarea name="bio" defaultValue={me.bio} placeholder="Bio" />
            <button className="primary"><Settings size={18} /> Salvar</button>
          </form>
        )}
      </section>
    </main>
  );
}

function UserGrid({ users, action, compact = false }: { users: User[]; action: (id: string) => void; compact?: boolean }) {
  return (
    <section className={compact ? "panel user-grid compact" : "user-grid"}>
      {!compact && <div className="section-title"><Search size={18} /><h2>Comunidade</h2></div>}
      {users.map((user) => (
        <article className="user-card" key={user.id}>
          <img src={user.avatarUrl} alt="" />
          <div><b>{user.name}</b><span>{roleLabel(user.role)} - {user.goal}</span><p>{user.bio}</p></div>
          <button onClick={() => action(user.id)}><UserPlus size={17} /> {user.isFollowing ? "Seguindo" : compact ? "Abrir" : "Seguir"}</button>
        </article>
      ))}
    </section>
  );
}

function PlanList({ plans }: { plans: Plan[] }) {
  return (
    <section className="panel list">
      <h2>Planos salvos</h2>
      {plans.map((plan) => (
        <article key={plan.id}>
          <b>{plan.title}</b>
          <span>{plan.kind} {plan.author ? `por ${plan.author.name}` : ""}</span>
          <pre>{plan.content}</pre>
        </article>
      ))}
    </section>
  );
}

export default App;
