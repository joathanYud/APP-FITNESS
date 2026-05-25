import { useEffect, useMemo, useState } from "react";
// A tela centraliza varios fluxos do MVP; estes efeitos sincronizam dados externos.
/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
import { io, Socket } from "socket.io-client";
import {
  Bot,
  CalendarDays,
  CheckCircle2,
  Dumbbell,
  Heart,
  LogOut,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Upload,
} from "lucide-react";
import { PlanList } from "./components/PlanList";
import { UserGrid } from "./components/UserGrid";
import { API_URL, NAV_ITEMS, roleLabel, type TabId } from "./config";
import type { Appointment, Message, Plan, Post, User } from "./types";
import "./styles/app.css";

function formatDateTimeLocal(date: Date) {
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("fitlink_token") ?? "");
  const [me, setMe] = useState<User | null>(null);
  const [tab, setTab] = useState<TabId>("home");
  const [posts, setPosts] = useState<Post[]>([]);
  const [people, setPeople] = useState<User[]>([]);
  const [pros, setPros] = useState<User[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeChat, setActiveChat] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [accountType, setAccountType] = useState<"MEMBER" | "PROFESSIONAL">("MEMBER");
  const [previewAvatar, setPreviewAvatar] = useState("");
  const [notice, setNotice] = useState("");
  const [feedQuery, setFeedQuery] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" }), [token]);
  const appointmentMin = useMemo(() => formatDateTimeLocal(new Date()), []);
  const appointmentDefault = useMemo(() => {
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    return formatDateTimeLocal(nextHour);
  }, []);
  const nextAppointment = useMemo(
    () =>
      appointments
        .filter((item) => new Date(item.startsAt).getTime() >= Date.now())
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())[0],
    [appointments],
  );
  const dashboardStats = useMemo(
    () => [
      { label: "Posts no feed", value: posts.length, detail: "treinos e dietas publicados" },
      { label: "Pessoas", value: people.length + 1, detail: "membros na comunidade" },
      { label: "Planos salvos", value: plans.length, detail: "treinos e dietas no perfil" },
      { label: "Agenda", value: appointments.length, detail: "compromissos cadastrados" },
    ],
    [appointments.length, people.length, plans.length, posts.length],
  );
  const visiblePosts = useMemo(() => {
    const query = feedQuery.trim().toLowerCase();
    if (!query) return posts;
    return posts.filter((post) => [post.title, post.content, post.workout, post.author.name, post.type].some((field) => field?.toLowerCase().includes(query)));
  }, [feedQuery, posts]);
  const visiblePeople = useMemo(() => {
    const query = peopleQuery.trim().toLowerCase();
    if (!query) return people;
    return people.filter((user) => [user.name, user.goal, user.bio, user.location, roleLabel(user.role)].some((field) => field?.toLowerCase().includes(query)));
  }, [people, peopleQuery]);

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    // Mantem todas as chamadas autenticadas com o mesmo contrato da API.
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...(token ? authHeaders : { "Content-Type": "application/json" }), ...(options.headers ?? {}) },
    });
    const contentType = res.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json") ? await res.json() : { error: await res.text() };
    if (!res.ok) throw new Error(payload.error ?? "Erro inesperado.");
    return payload;
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
    const live = io(API_URL, { auth: { token } });
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
    const startsAt = new Date(String(body.startsAt));
    if (Number.isNaN(startsAt.getTime())) {
      setNotice("Escolha uma data e horario validos para agendar.");
      return;
    }
    await api<Appointment>("/api/appointments", {
      method: "POST",
      body: JSON.stringify({ ...body, startsAt: startsAt.toISOString() }),
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

  function readImage(file?: File) {
    return new Promise<string>((resolve, reject) => {
      if (!file) return resolve("");
      if (!file.type.startsWith("image/")) return reject(new Error("Escolha um arquivo de imagem."));
      if (file.size > 1_500_000) return reject(new Error("A imagem deve ter no maximo 1.5 MB."));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Nao foi possivel carregar a imagem."));
      reader.readAsDataURL(file);
    });
  }

  async function updateProfile(form: HTMLFormElement) {
    const data = Object.fromEntries(new FormData(form).entries());
    await api("/api/me", { method: "PATCH", body: JSON.stringify({ ...data, avatarUrl: previewAvatar || data.avatarUrl }) });
    setNotice("Perfil atualizado.");
    await refresh();
  }

  if (!token || !me) {
    return (
      <main className="auth-shell">
        <section className="auth-hero">
          <div className="brand-mark"><Dumbbell size={26} /> FitLink</div>
          <h1>Fitness social com profissionais verificados, IA e rotina de verdade.</h1>
          <p>Crie sua conta como aluno ou solicite entrada como profissional da area fitness.</p>
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
          {authMode === "register" && (
            <div className="segmented slim">
              <button type="button" className={accountType === "MEMBER" ? "active" : ""} onClick={() => setAccountType("MEMBER")}>Aluno</button>
              <button type="button" className={accountType === "PROFESSIONAL" ? "active" : ""} onClick={() => setAccountType("PROFESSIONAL")}>Profissional</button>
            </div>
          )}
          <input type="hidden" name="accountType" value={accountType} />
          <input name="email" type="email" placeholder="Email" required />
          <input name="password" type="password" placeholder="Senha" minLength={6} required />
          {authMode === "register" && <input name="goal" placeholder="Objetivo principal" />}
          {authMode === "register" && accountType === "PROFESSIONAL" && (
            <div className="professional-box">
              <select name="professionalKind" defaultValue="PERSONAL">
                <option value="PERSONAL">Personal trainer</option>
                <option value="NUTRITIONIST">Nutricionista</option>
              </select>
              <input name="credential" placeholder="CREF, CRN ou registro profissional" required />
              <input name="documentUrl" placeholder="Link do comprovante ou portfolio profissional" required />
              <select name="subscriptionPlan" defaultValue="PRO_START">
                <option value="PRO_START">Pro Start - teste inicial</option>
                <option value="PRO_PLUS">Pro Plus - agenda e alunos ilimitados</option>
              </select>
              <p className="form-hint">O perfil profissional entra em analise. Depois da verificacao, ele aparece como profissional verificado.</p>
            </div>
          )}
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
          {NAV_ITEMS.map(([id, label, Icon]) => (
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

        {tab === "home" && (
          <div className="home-layout">
            <section className="hero-panel">
              <div>
                <p>{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p>
                <h2>{me.goal}</h2>
                <span>Use o feed para registrar treino, gere um plano pela IA ou agende com um profissional.</span>
              </div>
              <button className="primary" onClick={() => setTab("ai")}><Sparkles size={18} /> Criar plano</button>
            </section>

            <section className="stats-grid">
              {dashboardStats.map((stat) => (
                <article className="stat-card" key={stat.label}>
                  <b>{stat.value}</b>
                  <span>{stat.label}</span>
                  <small>{stat.detail}</small>
                </article>
              ))}
            </section>

            <div className="grid two">
              <section className="panel list">
                <h2>Proximo compromisso</h2>
                {nextAppointment ? (
                  <article>
                    <b>{nextAppointment.title}</b>
                    <span>{new Date(nextAppointment.startsAt).toLocaleString()} com {nextAppointment.professional.name}</span>
                    <small className="status">{nextAppointment.status}</small>
                  </article>
                ) : (
                  <p className="empty">Nenhum horario futuro. Marque uma consulta com um personal ou nutricionista.</p>
                )}
                <button className="secondary" onClick={() => setTab("agenda")}><CalendarDays size={17} /> Abrir agenda</button>
              </section>

              <section className="panel list">
                <h2>Ultimos planos</h2>
                {plans.slice(0, 2).map((plan) => (
                  <article key={plan.id}>
                    <b>{plan.title}</b>
                    <span>{plan.kind} {plan.author ? `por ${plan.author.name}` : ""}</span>
                  </article>
                ))}
                {plans.length === 0 && <p className="empty">Voce ainda nao tem planos salvos.</p>}
              </section>
            </div>
          </div>
        )}

        {tab === "feed" && (
          <div className="grid two">
            <form className="panel" onSubmit={(e) => { e.preventDefault(); submitPost(new FormData(e.currentTarget)); e.currentTarget.reset(); }}>
              <h2>Novo post</h2>
              <select name="type" defaultValue="TREINO">
                <option value="TREINO">Treino</option>
                <option value="DIETA">Dieta</option>
                <option value="EVOLUCAO">Evolucao</option>
              </select>
              <input name="title" placeholder="Titulo do treino ou dieta" required />
              <textarea name="content" placeholder="Conte o que voce fez hoje" required />
              <textarea name="workout" placeholder="Exercicios, cargas, refeicoes ou observacoes" />
              <button className="primary"><Plus size={18} /> Publicar</button>
            </form>
            <section className="feed-list">
              <label className="search-field">
                <Search size={18} />
                <input value={feedQuery} onChange={(event) => setFeedQuery(event.target.value)} placeholder="Buscar por treino, dieta, autor..." />
              </label>
              {visiblePosts.map((post) => (
                <article className="post" key={post.id}>
                  <div className="post-head"><img src={post.author.avatarUrl} alt="" /><div><b>{post.author.name}</b><span>{roleLabel(post.author.role)} - {new Date(post.createdAt).toLocaleString()}</span></div><small className="pill">{post.type}</small></div>
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
              {visiblePosts.length === 0 && <p className="empty">Nada encontrado no feed com esse filtro.</p>}
            </section>
          </div>
        )}

        {tab === "people" && (
          <div className="stack">
            <label className="search-field">
              <Search size={18} />
              <input value={peopleQuery} onChange={(event) => setPeopleQuery(event.target.value)} placeholder="Buscar por nome, objetivo, cidade ou profissao..." />
            </label>
            <UserGrid users={visiblePeople} action={async (id) => { await api(`/api/users/${id}/follow`, { method: "POST" }); await refresh(); }} />
            {visiblePeople.length === 0 && <p className="empty">Nenhuma pessoa encontrada com esse filtro.</p>}
          </div>
        )}

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
              <button className="primary"><Bot size={18} /> Gerar plano inteligente</button>
            </form>
            <PlanList plans={plans} />
          </div>
        )}

        {tab === "pros" && (
          <div className="grid two">
            <UserGrid users={pros} compact action={async (id) => { setActiveChat(pros.find((p) => p.id === id) ?? null); setTab("chat"); }} />
            <section className="panel">
              <h2>Profissionais com analise</h2>
              <p>Personais e nutricionistas precisam informar registro profissional, comprovante e plano de uso. Perfis verificados aparecem com selo.</p>
              <PlanList plans={plans} />
            </section>
          </div>
        )}

        {tab === "agenda" && (
          <div className="grid two">
            <form className="panel" onSubmit={(e) => { e.preventDefault(); book(new FormData(e.currentTarget)); }}>
              <h2>Marcar compromisso</h2>
              <select name="professionalId" disabled={pros.length === 0}>{pros.length === 0 ? <option>Nenhum profissional verificado disponivel</option> : pros.map((pro) => <option key={pro.id} value={pro.id}>{pro.name} - {roleLabel(pro.role)}</option>)}</select>
              <input name="title" placeholder="Titulo da consulta" required />
              <input name="startsAt" type="datetime-local" defaultValue={appointmentDefault} min={appointmentMin} required />
              <textarea name="notes" placeholder="Observacoes" />
              <button className="primary" disabled={pros.length === 0}><CalendarDays size={18} /> Agendar</button>
            </form>
            <section className="panel list">
              <h2>Minha agenda</h2>
              {appointments.map((item) => <article key={item.id}><b>{item.title}</b><span>{new Date(item.startsAt).toLocaleString()} com {item.professional.name}</span><small className="status"><CheckCircle2 size={14} /> {item.status}</small></article>)}
              {appointments.length === 0 && <p className="empty">Sua agenda ainda esta vazia.</p>}
            </section>
          </div>
        )}

        {tab === "settings" && (
          <form className="panel settings" onSubmit={async (e) => { e.preventDefault(); updateProfile(e.currentTarget); }}>
            <h2>Configuracoes da conta</h2>
            <div className="avatar-editor">
              <img src={previewAvatar || me.avatarUrl || "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=180&h=180&fit=crop"} alt="" />
              <label className="upload-button">
                <Upload size={17} /> Trocar foto
                <input type="file" accept="image/*" onChange={(event) => readImage(event.target.files?.[0]).then(setPreviewAvatar).catch((error) => setNotice(error.message))} />
              </label>
            </div>
            <input name="name" defaultValue={me.name} placeholder="Nome" />
            <input name="email" defaultValue={me.email} placeholder="Email" />
            <input name="avatarUrl" defaultValue={me.avatarUrl} placeholder="URL da foto ou use o upload acima" />
            <input name="goal" defaultValue={me.goal} placeholder="Objetivo" />
            <input name="location" defaultValue={me.location} placeholder="Cidade" />
            <textarea name="bio" defaultValue={me.bio} placeholder="Bio" />
            {me.role !== "MEMBER" && (
              <div className="professional-status">
                <b>{roleLabel(me.role)}</b>
                <span>{me.credential || "Registro nao informado"}</span>
                <small className={`verify-badge ${me.verificationStatus?.toLowerCase()}`}>{me.verificationStatus === "VERIFIED" ? "Profissional verificado" : "Verificacao em analise"}</small>
              </div>
            )}
            <button className="primary"><Settings size={18} /> Salvar</button>
            <p className="form-hint"><TrendingUp size={16} /> Perfis completos aparecem melhor para outros membros da comunidade.</p>
          </form>
        )}
      </section>
    </main>
  );
}

export default App;
