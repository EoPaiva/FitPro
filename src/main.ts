import './styles.css';
import { api, Bootstrap, clearToken, dateBR, dateTimeBR, getToken, money, Payment, Plan, setToken, statusLabel, Student, User, Workout } from './api';

type View = 'landing' | 'login' | 'register' | 'app';
type Modal = { type: string; payload?: any } | null;

const app = document.querySelector<HTMLDivElement>('#app')!;
const modalRoot = document.querySelector<HTMLDivElement>('#modal-root')!;
const toastRoot = document.querySelector<HTMLDivElement>('#toast-root')!;

let view: View = getToken() ? 'app' : 'landing';
let tab = 'dashboard';
let data: Bootstrap | null = null;
let modal: Modal = null;
let loading = false;

const navByRole: Record<string, { id: string; label: string; icon: string }[]> = {
  student: [
    { id: 'dashboard', label: 'Pulse', icon: '⚡' }, { id: 'jornada', label: 'Jornada', icon: '🧭' }, { id: 'treinos', label: 'Treinos', icon: '🏋️' }, { id: 'agenda', label: 'Agenda', icon: '📅' },
    { id: 'avaliacoes', label: 'Evolução', icon: '📈' }, { id: 'pagamentos', label: 'Pagamentos', icon: '💳' }, { id: 'conteudos', label: 'Academy', icon: '🎬' },
    { id: 'comunidade', label: 'Comunidade', icon: '🏆' }, { id: 'badges', label: 'Badges', icon: '🎖️' }, { id: 'recompensas', label: 'Loja', icon: '🛍️' }, { id: 'habitos', label: 'Hábitos', icon: '💧' }, { id: 'mensagens', label: 'Chat', icon: '💬' }, { id: 'perfil', label: 'Perfil', icon: '👤' }, { id: 'ajuda', label: 'Ajuda', icon: '❔' }
  ],
  admin: [
    { id: 'dashboard', label: 'Pulse Coach', icon: '📊' }, { id: 'coach', label: 'Coach Invisível', icon: '🧠' }, { id: 'alunos', label: 'Alunos', icon: '🧑‍🤝‍🧑' }, { id: 'treinos', label: 'Treinos', icon: '🏋️' },
    { id: 'agenda', label: 'Agenda', icon: '📅' }, { id: 'pagamentos', label: 'Pagamentos', icon: '💳' }, { id: 'conteudos', label: 'Conteúdos', icon: '🎬' },
    { id: 'comunidade', label: 'Comunidade', icon: '🏆' }, { id: 'mensagens', label: 'Mensagens', icon: '💬' }, { id: 'relatorios', label: 'Relatórios', icon: '📈' },
    { id: 'leads', label: 'CRM/Leads', icon: '🎯' }, { id: 'sorteios', label: 'Sorteios', icon: '🎁' }, { id: 'recompensas', label: 'Recompensas', icon: '🛍️' }, { id: 'integracoes', label: 'Integrações', icon: '🔌' }, { id: 'automacoes', label: 'Automações', icon: '🤖' },
    { id: 'configuracoes', label: 'Configurações', icon: '⚙️' }, { id: 'logs', label: 'Logs', icon: '🛡️' }, { id: 'ajuda', label: 'Ajuda', icon: '❔' }
  ],
  super_admin: [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' }, { id: 'workspaces', label: 'Workspaces', icon: '🏢' }, { id: 'alunos', label: 'Alunos', icon: '🧑‍🤝‍🧑' },
    { id: 'pagamentos', label: 'Pagamentos', icon: '💳' }, { id: 'integracoes', label: 'Integrações', icon: '🔌' }, { id: 'sorteios', label: 'Sorteios', icon: '🎁' },
    { id: 'relatorios', label: 'Relatórios', icon: '📈' }, { id: 'logs', label: 'Auditoria', icon: '🛡️' }, { id: 'ajuda', label: 'Docs', icon: '📚' }
  ],
  dev: []
};
navByRole.dev = navByRole.super_admin;

function html(strings: TemplateStringsArray, ...values: any[]) {
  return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
}
function esc(value: any) {
  return String(value ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[s]!));
}
function initials(name = 'FP') { return name.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase(); }
function renderAvatar(person: any, extraClass = '') {
  const name = person?.name || person?.author || 'FitPro';
  const avatar = person?.avatar || person?.avatarUrl;
  return avatar
    ? `<span class="avatar avatar-img ${extraClass}"><img src="${esc(avatar)}" alt="${esc(name)}"></span>`
    : `<span class="avatar ${extraClass}">${esc(initials(name))}</span>`;
}
function senderOf(senderId?: string) {
  return (data as any)?.users?.find((u:any) => u.id === senderId) || data?.students.find((s:any) => s.userId === senderId) || (senderId === data?.user.id ? data?.user : null);
}
function studentAvatar(student: any) { return renderAvatar(student || { name: 'Aluno' }); }
function statusClass(status: string) { return status === 'aprovado' ? 'ok' : status === 'recusado' ? 'danger' : status === 'em_analise' ? 'info' : 'warn'; }
function roleLabel(role: string) { return role === 'student' ? 'Aluno' : role === 'admin' ? 'Personal/Admin' : role === 'dev' ? 'Dev uPaiva' : 'Super Admin'; }
function currentStudent() { return data?.students.find(s => s.id === data?.user.studentId) || data?.students[0]; }
function planOf(id?: string) { return data?.plans.find(p => p.id === id); }
function studentOf(id?: string) { return data?.students.find(s => s.id === id); }
function toast(message: string) {
  toastRoot.innerHTML = `<div class="toast">${esc(message)}</div>`;
  window.setTimeout(() => { toastRoot.innerHTML = ''; }, 3500);
}
async function reload() { data = await api<Bootstrap>('/api/bootstrap'); document.documentElement.style.setProperty('--primary', data.settings.primaryColor || '#00e676'); }
async function bootstrap() {
  if (!getToken()) { view = 'landing'; render(); return; }
  try { loading = true; render(); await reload(); view = 'app'; } catch { clearToken(); view = 'landing'; } finally { loading = false; render(); }
}
function openModal(type: string, payload?: any) { modal = { type, payload }; renderModal(); }
function closeModal() { modal = null; renderModal(); }
async function action(fn: () => Promise<void>, ok = 'Ação realizada.') {
  try { await fn(); toast(ok); } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao executar ação.'); }
}

function render() {
  document.title = data?.settings?.brandName ? `${data.settings.brandName} — FitPro Elite` : 'FitPro Elite — Plataforma Fitness Premium';
  if (loading) { app.innerHTML = renderLoading(); return; }
  if (view === 'landing') app.innerHTML = renderLanding();
  if (view === 'login') app.innerHTML = renderLogin();
  if (view === 'register') app.innerHTML = renderRegister();
  if (view === 'app') app.innerHTML = data ? renderShell() : renderLoading();
  bindEvents();
  renderModal();
}

function renderLoading() { return `<main class="center-screen"><div class="loader-card"><div class="pulse-logo">FP</div><h2>Carregando FitPro Elite</h2><p>Conectando API, banco e permissões...</p></div></main>`; }

function renderLanding() {
  return html`
  <main class="landing">
    <section class="hero">
      <div class="topbar"><div class="brand"><span class="brand-mark">FP</span><span>FitPro Elite</span></div><div class="top-actions"><button data-view="login" class="ghost">Entrar</button><button data-view="register" class="primary">Criar conta</button></div></div>
      <div class="hero-grid">
        <div>
          <span class="eyebrow">SaaS fitness fullstack • demo segura</span>
          <h1>Aluno entrando, pagando, treinando e sendo acompanhado de verdade.</h1>
          <p>Base premium com backend, banco, autenticação, roles, uploads privados, pagamentos manuais, logs e painéis para aluno, personal e dev/super admin.</p>
          <div class="hero-actions"><button data-view="register" class="primary big">Começar agora</button><button data-view="login" class="ghost big">Acessar demo</button></div>
          <div class="demo-logins"><b>Demo:</b> aluno@fitpro.dev / 123456 • leandro@fitpro.dev / Leandro123 • upaiva@dev / 99221542Mat@</div>
        </div>
        <div class="phone-card">
          <div class="phone-head"><span></span><b>Performance hoje</b><em>live</em></div>
          <div class="heartbeat">▁▂▃▅▇▅▃▂▁▂▃▅▇▅▃</div>
          <div class="metric-row"><span>Streak</span><b>12 dias</b></div>
          <div class="metric-row"><span>Treinos do mês</span><b>17/20</b></div>
          <div class="progress"><i style="width:85%"></i></div>
          <div class="mini-podium"><span>🥇 Júlia</span><span>🥈 Rafael</span><span>🥉 Camila</span></div>
        </div>
      </div>
    </section>
    <section class="landing-section">
      <h2>Fluxo real da Fase 1</h2>
      <div class="feature-grid">
        ${feature('🔐', 'Auth segura', 'Senha com PBKDF2, token assinado, bloqueio por tentativas e cookies HttpOnly.')}
        ${feature('🗄️', 'Banco real', 'SQLite local com tabelas para alunos, treinos, pagamentos, logs, mensagens e integrações.')}
        ${feature('📎', 'Comprovantes privados', 'Imagem/PDF em rota protegida, preview, download, aprovar/reprovar e histórico auditado.')}
        ${feature('🛡️', 'Permissões', 'Aluno vê só seus dados; personal vê o workspace; dev/super admin audita tudo.')}
      </div>
      <form class="lead-card" data-form="lead"><h3>Solicitar aula experimental</h3><input name="name" placeholder="Nome" required><input name="phone" placeholder="WhatsApp" required><input name="email" placeholder="E-mail"><input name="goal" placeholder="Objetivo"><button class="primary">Virar lead no CRM</button></form>
    </section>
    ${renderFooter()}
  </main>`;
}
function feature(icon: string, title: string, text: string) { return `<article class="feature"><strong>${icon}</strong><h3>${title}</h3><p>${text}</p></article>`; }

function renderLogin() { return html`<main class="center-screen"><form class="auth-card" data-form="login"><button type="button" data-view="landing" class="close-x">×</button><span class="brand-mark">FP</span><h1>Entrar no FitPro</h1><p>Acesse usando uma conta demo ou sua conta cadastrada.</p><label>E-mail<input name="email" type="email" value="leandro@fitpro.dev" required></label><label>Senha<input name="password" type="password" value="Leandro123" required></label><button class="primary wide">Entrar</button><button type="button" data-view="register" class="ghost wide">Criar conta de aluno</button></form></main>`; }
function renderRegister() { return html`<main class="center-screen"><form class="auth-card wide-card" data-form="register"><button type="button" data-view="landing" class="close-x">×</button><span class="brand-mark">FP</span><h1>Cadastro do aluno</h1><p>Com consentimento LGPD e aviso de saúde. O sistema não substitui médico, nutricionista ou profissional habilitado.</p><div class="form-grid"><label>Nome<input name="name" required></label><label>E-mail<input name="email" type="email" required></label><label>WhatsApp<input name="phone"></label><label>Cidade/Estado<input name="city"></label><label>Objetivo<input name="goal"></label><label>Nascimento<input name="birthdate" type="date"></label><label>Altura<input name="height" type="number" step="0.01"></label><label>Peso inicial<input name="weight" type="number" step="0.1"></label><label>Nível<select name="level"><option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select></label><label>Senha<input name="password" type="password" required minlength="6"></label></div><label>Restrições/observações de saúde<textarea name="restrictions"></textarea></label><div class="checks"><label><input type="checkbox" name="terms" required> Aceito os termos</label><label><input type="checkbox" name="lgpd" required> Autorizo tratamento de dados LGPD</label><label><input type="checkbox" name="photos"> Autorizo armazenamento de fotos de evolução</label><label><input type="checkbox" name="notifications"> Quero receber notificações</label></div><button class="primary wide">Criar conta</button></form></main>`; }

function renderShell() {
  const user = data!.user;
  const nav = navByRole[user.role] || navByRole.admin;
  if (!nav.some(n => n.id === tab)) tab = 'dashboard';
  return html`
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand sidebar-brand"><span class="brand-mark">FP</span><span><b>FitPro Elite</b><small>${esc(data!.settings.plan)} • ${esc(data!.settings.status)}</small></span></div>
      <nav>${nav.map(n => `<button class="nav-btn ${tab===n.id?'active':''}" data-tab="${n.id}"><span>${n.icon}</span>${n.label}</button>`).join('')}</nav>
      <div class="user-box">${renderAvatar(user)}<div><b>${esc(user.name)}</b><small>${roleLabel(user.role)}</small></div><button class="icon-btn" data-action="logout">Sair</button></div>
    </aside>
    <main class="main">
      <header class="app-header"><div><span class="eyebrow">${esc(data!.settings.brandName)}</span><h1>${titleForTab(tab)}</h1></div><div class="header-actions"><button class="ghost" data-action="whatsapp">WhatsApp</button><button class="ghost" data-modal="ai-assistant">Assistente IA</button><button class="primary" data-modal="quick-action">Ação rápida</button></div></header>
      ${renderTab()}
      ${renderFloatingAssistant()}
      ${renderFooter()}
    </main>
    <nav class="bottom-nav">${nav.slice(0,5).map(n => `<button class="${tab===n.id?'active':''}" data-tab="${n.id}"><span>${n.icon}</span><small>${n.label}</small></button>`).join('')}</nav>
  </div>`;
}
function titleForTab(id: string) { const item = [...navByRole.student, ...navByRole.admin, ...navByRole.super_admin].find(n => n.id === id); return item?.label || 'Dashboard'; }
function renderTab() {
  if (!data) return '';
  const role = data.user.role;
  if (tab === 'dashboard') return role === 'student' ? renderStudentDashboard() : renderAdminDashboard();
  if (tab === 'coach') return renderInvisibleCoach();
  if (tab === 'alunos') return renderStudents();
  if (tab === 'jornada') return renderStudentJourney();
  if (tab === 'treinos') return renderWorkouts();
  if (tab === 'agenda') return renderSchedules();
  if (tab === 'avaliacoes') return renderAssessments();
  if (tab === 'pagamentos') return renderPayments();
  if (tab === 'conteudos') return renderContents();
  if (tab === 'comunidade') return renderCommunity();
  if (tab === 'badges') return renderBadges();
  if (tab === 'recompensas') return renderRewardsStore();
  if (tab === 'habitos') return renderHabits();
  if (tab === 'mensagens') return renderMessages();
  if (tab === 'perfil') return renderProfile();
  if (tab === 'relatorios') return renderReports();
  if (tab === 'leads') return renderLeads();
  if (tab === 'integracoes') return renderIntegrations();
  if (tab === 'automacoes') return renderAutomations();
  if (tab === 'configuracoes') return renderSettings();
  if (tab === 'logs') return renderLogs();
  if (tab === 'workspaces') return renderWorkspaces();
  if (tab === 'sorteios') return renderGiveaways();
  return renderHelp();
}


function workoutToday() { return data!.workouts[0]; }
function paymentStatusSummary(studentId?: string) { return data!.payments.find(p => !studentId || p.studentId === studentId); }
function challengeMain() { return data!.challenges[0]; }
function challengeProgress(studentId?: string) {
  const ch = challengeMain();
  const pt = ch?.participants?.find((p:any) => !studentId || p.studentId === studentId) || ch?.participants?.[0];
  return { challenge: ch, participant: pt, percent: Math.round(((pt?.progress || 0) / (ch?.target || 1)) * 100), points: pt?.points || 0 };
}
function studentRiskLevel(s: any) {
  const pay = paymentStatusSummary(s.id);
  const lastActivity = s.lastActivityAt ? new Date(s.lastActivityAt).getTime() : Date.now() - 9 * 86400000;
  const daysAway = Math.max(0, Math.floor((Date.now() - lastActivity) / 86400000));
  const lastAssessment = data!.assessments.filter(a => a.studentId === s.id).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
  const assessmentDays = lastAssessment ? Math.floor((Date.now() - new Date(lastAssessment.date + 'T00:00:00').getTime()) / 86400000) : 999;
  const reasons: string[] = [];
  if (daysAway >= 7) reasons.push(`sumido há ${daysAway} dias`);
  if (pay && ['pendente','aguardando_comprovante','em_analise','recusado'].includes(pay.status)) reasons.push(`pagamento ${statusLabel(pay.status).toLowerCase()}`);
  if (assessmentDays > 30) reasons.push('sem avaliação recente');
  return { daysAway, assessmentDays, payment: pay, reasons, score: reasons.length };
}
function studentsWithPraise() {
  return data!.students.filter(s => {
    const progress = challengeProgress(s.id);
    const habit = data!.habits.find(h => h.studentId === s.id);
    return (progress.participant?.progress || 0) >= 5 || Number(habit?.energy || 0) >= 8 || Number(habit?.waterMl || 0) >= 2000;
  });
}
function missingCheckins() { return data!.students.filter(s => !data!.habits.some(h => h.studentId === s.id && h.date === new Date().toISOString().slice(0,10))); }
function missionOfDay() {
  const w = workoutToday();
  const h = data!.habits[0];
  return {
    title: w ? `Concluir ${w.title}` : 'Registrar check-in fitness',
    energy: h?.energy || 8,
    workout: w?.title || 'Treino de adaptação',
    points: 120 + (h?.waterMl >= 2000 ? 30 : 0),
    bonus: h?.waterMl >= 2000 ? 'Bônus hidratação ativo' : 'Bônus liberado ao bater água do dia'
  };
}
function renderFitProPulseStudent() {
  const s = currentStudent(); const mission = missionOfDay(); const progress = challengeProgress(s?.id); const pay = paymentStatusSummary(s?.id);
  return `<section class="pulse-panel student-pulse"><div><span class="eyebrow">FitPro Pulse do aluno</span><h2>Missão de hoje: ${esc(mission.title)}</h2><p>Energia do dia: <b>${mission.energy}/10</b> • Treino: <b>${esc(mission.workout)}</b> • Pontos possíveis hoje: <b>${mission.points} pts</b></p><div class="pulse-actions"><button class="primary" data-tab="treinos">Iniciar treino</button><button class="ghost" data-tab="habitos">Registrar check-in</button><button class="ghost" data-tab="pagamentos">Ver pagamento</button></div></div><div class="pulse-orb"><b>${progress.percent}%</b><span>${esc(progress.challenge?.title || 'desafio')}</span></div></section><section class="grid-2"><article class="card mission-card"><h3>Missão do Dia</h3>${alertLine(`Ganhe ${mission.points} pontos concluindo treino, hidratação e check-in.`)}${alertLine(mission.bonus)}${alertLine(pay ? `Pagamento atual: ${statusLabel(pay.status)}.` : 'Nenhum pagamento pendente.')}</article><article class="card"><h3>Aluno destaque da semana</h3><div class="spotlight-card">${renderAvatar(s,'spotlight-avatar')}<div><b>${esc(s?.name || 'Aluno')}</b><p>Consistência alta, desafio em andamento e engajamento positivo.</p><span class="badge ok">Destaque FitPro</span></div></div></article></section>`;
}
function renderFitProPulseCoach() {
  const risks = data!.students.filter(s => studentRiskLevel(s).score > 0);
  const praise = studentsWithPraise();
  const pending = missingCheckins();
  return `<section class="pulse-panel coach-pulse"><div><span class="eyebrow">FitPro Pulse do personal</span><h2>Radar inteligente de alunos, check-ins e oportunidades.</h2><p>${risks.length} aluno(s) em risco • ${praise.length} merecem elogio • ${pending.length} check-in(s) pendente(s).</p><div class="pulse-actions"><button class="primary" data-tab="coach">Abrir Coach Invisível</button><button class="ghost" data-tab="mensagens">Mensagens</button><button class="ghost" data-tab="sorteios">Sorteios</button></div></div><div class="coach-score"><b>${Math.max(72, 100 - risks.length * 12)}%</b><span>saúde da carteira</span></div></section><section class="grid-2"><article class="card"><h3>Alunos em risco</h3>${risks.map(s => renderCoachInsight(s, 'risk')).join('') || empty('Nenhum risco crítico agora.')}</article><article class="card"><h3>Merecem elogio</h3>${praise.map(s => renderCoachInsight(s, 'praise')).join('') || empty('Sem elogios automáticos hoje.')}</article></section>`;
}
function renderCoachInsight(s:any, mode='risk') {
  const risk = studentRiskLevel(s); const progress = challengeProgress(s.id);
  const text = mode === 'praise' ? `Bom engajamento • ${progress.points} pts • perto do pódio` : (risk.reasons.join(' • ') || 'atenção preventiva');
  return `<div class="coach-insight ${mode}">${renderAvatar(s,'small-avatar')}<span><b>${esc(s.name)}</b><small>${esc(text)}</small></span><button class="ghost small" data-modal="student" data-id="${s.id}">Abrir</button></div>`;
}
function renderInvisibleCoach() {
  const cards = data!.students.map(s => {
    const risk = studentRiskLevel(s); const progress = challengeProgress(s.id); const nearPodium = (progress.participant?.progress || 0) >= Math.max(1, (progress.challenge?.target || 20) * .3);
    return `<article class="card coach-card"><div class="card-head"><h3>${esc(s.name)}</h3><span class="badge ${risk.score ? 'warn' : 'ok'}">${risk.score ? 'atenção' : 'ok'}</span></div>${renderAvatar(s,'profile-avatar')}<div class="coach-detections">${risk.daysAway >= 7 ? alertLine('Aluno sumido: enviar mensagem de retomada.') : alertLine('Atividade recente dentro do esperado.')}${nearPodium ? alertLine('Aluno perto do pódio: vale elogio e incentivo.') : alertLine('Ainda distante do pódio: sugerir missão curta.')}${risk.payment ? alertLine(`Pagamento: ${statusLabel(risk.payment.status)}.`) : alertLine('Sem cobrança pendente.')}${risk.assessmentDays > 30 ? alertLine('Sem avaliação recente: solicitar nova avaliação.') : alertLine('Avaliação dentro do período.')}</div><button class="primary small" data-modal="coach-message" data-id="${s.id}">Gerar mensagem</button></article>`;
  }).join('');
  return panel('Modo Coach Invisível', '', `<div class="cards-grid coach-grid">${cards}</div>`);
}
function renderStudentJourney() {
  const s = currentStudent(); const progress = challengeProgress(s?.id);
  const steps = [
    ['Cadastro', 'Conta criada e consentimentos aceitos', true], ['Onboarding', 'Objetivo e nível definidos', true], ['Primeiro treino', 'Treino liberado pelo personal', true], ['Check-ins', 'Rotina semanal em construção', progress.percent >= 25], ['Avaliação', 'Evolução física registrada', data!.assessments.length > 0], ['Pódio', 'Desafio e ranking ativo', progress.percent >= 50]
  ];
  return panel('Jornada do Aluno', '', `<section class="journey-map">${steps.map(([title,desc,done],i) => `<div class="journey-step ${done?'done':''}"><span>${done?'✅':i+1}</span><h3>${esc(title)}</h3><p>${esc(desc)}</p></div>`).join('')}</section><article class="card"><h3>Temporada Fitness</h3><p>Temporada atual: <b>Performance 30D</b>. Acumule pontos por treino, check-in, água, avaliação e comunidade.</p><div class="progress"><i style="width:${progress.percent}%"></i></div></article>`);
}
function renderRewardsStore() {
  const rewards = [ ['🎽 Camiseta FitPro', 1200, 'Produto físico futuro'], ['📋 Avaliação bônus', 800, 'Liberar com o personal'], ['🥤 Shaker premium', 650, 'Recompensa de engajamento'], ['🏅 Certificado Elite', 400, 'Conquista digital'] ];
  return panel('Loja de Recompensas', '', `<div class="cards-grid rewards-grid">${rewards.map(r => `<article class="card reward-card"><strong>${r[0]}</strong><h3>${r[0]}</h3><p>${r[2]}</p><span class="badge ok">${r[1]} pts</span><button class="ghost small" data-modal="reward-preview">Resgatar em breve</button></article>`).join('')}</div>`);
}
function renderBadges() {
  const badges = [ ['🔥 Streak 7 dias', 'Treinou por 7 dias de rotina'], ['💧 Hidratação Pro', 'Bateu meta de água'], ['🏋️ Carga Evoluindo', 'Registrou progressão'], ['🥇 Pódio FitPro', 'Entrou no top 3'], ['📸 Evolução Registrada', 'Fez avaliação com foto'], ['💬 Comunidade Ativa', 'Interagiu no feed'] ];
  return panel('Badges de Conquistas', '', `<div class="cards-grid badge-grid">${badges.map((b,i) => `<article class="card badge-card ${i<3?'unlocked':''}"><strong>${b[0].split(' ')[0]}</strong><h3>${esc(b[0])}</h3><p>${esc(b[1])}</p><span class="badge ${i<3?'ok':'warn'}">${i<3?'desbloqueado':'em progresso'}</span></article>`).join('')}</div>`);
}
function renderFloatingAssistant() {
  return `<button class="floating-assistant" data-modal="ai-assistant" aria-label="Abrir assistente FitPro IA"><span>🤖</span><b>Coach IA</b></button>`;
}

function renderStudentDashboard() {
  const s = currentStudent();
  const plan = planOf(s?.planId);
  const next = data!.schedules[0];
  const pay = data!.payments[0];
  const assessments = data!.assessments;
  const first = assessments[0]?.weight || s?.initialWeight || 0;
  const last = assessments[assessments.length - 1]?.weight || s?.currentWeight || 0;
  return html`${renderFitProPulseStudent()}
  <section class="stats-grid">${stat('Peso atual', `${last || '-'} kg`, `Início: ${first || '-'} kg`)}${stat('Plano', plan?.name || '-', pay ? statusLabel(pay.status) : 'Sem cobrança')}${stat('Streak', '12 dias', 'check-ins fictícios demo')}${stat('Água hoje', `${data!.habits[0]?.waterMl || 0} ml`, 'meta 2500 ml')}</section>
  <section class="grid-2"><article class="card"><h3>Treino de hoje</h3>${data!.workouts.slice(0,2).map(renderWorkoutMini).join('')}</article><article class="card"><h3>Pulse de alertas</h3>${alertLine('Seu personal deixou uma nova recomendação.')}${alertLine(pay ? `Pagamento ${statusLabel(pay.status)} vence em ${dateBR(pay.dueDate)}.` : 'Nenhum pagamento pendente.')}${alertLine('Sua avaliação mensal está atualizada.')}</article></section>`;
}
function renderAdminDashboard() {
  const revenue = data!.payments.filter(p => p.status === 'aprovado' || p.status === 'em_analise').reduce((a,p)=>a+Number(p.amount||0),0);
  const pending = data!.payments.filter(p => ['pendente','aguardando_comprovante','em_analise'].includes(p.status)).length;
  return html`${renderFitProPulseCoach()}
  <section class="stats-grid">${stat('Alunos', data!.students.length, 'ativos no workspace')}${stat('Receita prevista', money(revenue), 'inclui análise/aprovados')}${stat('Pagamentos pendentes', pending, 'precisam de ação')}${stat('Leads', data!.leads.length, 'CRM comercial')}</section>
  <section class="grid-2"><article class="card"><h3>Check-ins pendentes</h3>${missingCheckins().map(s => renderCoachInsight(s, 'risk')).join('') || empty('Todos registraram check-in hoje.')}</article><article class="card"><h3>Fila de pagamentos</h3>${data!.payments.map(renderPaymentMini).join('')}</article></section>`;
}
function stat(label: string, value: any, hint: string) { return `<article class="stat"><span>${label}</span><b>${value}</b><small>${hint}</small></article>`; }
function alertLine(text: string) { return `<div class="alert-line">⚡ ${esc(text)}</div>`; }
function renderWorkoutMini(w: Workout) { return `<div class="workout-mini"><div><b>${esc(w.title)}</b><small>${esc(w.method || '')} • ${esc(statusLabel(w.status || 'ativo'))}</small></div><span>${w.exercises?.length || 0} exercícios</span></div>`; }
function renderPaymentMini(p: Payment) { const st = studentOf(p.studentId); return `<div class="list-row"><span><b>${esc(st?.name || p.studentId)}</b><small>${money(p.amount)} • ${statusLabel(p.status)}</small></span><button class="ghost small" ${p.hasProof?'':'disabled'} data-modal="proof" data-id="${p.id}">Ver comprovante</button></div>`; }

function renderStudents() { return panel('Alunos', `<button class="primary" data-modal="new-student">Novo aluno</button>`, `<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Objetivo</th><th>Plano</th><th>Status</th><th>Ações</th></tr></thead><tbody>${data!.students.map(s => `<tr><td><div class="person-cell">${studentAvatar(s)}<span><b>${esc(s.name)}</b><small>${esc(s.email)}</small></span></div></td><td>${esc(s.goal)}</td><td>${esc(planOf(s.planId)?.name || '-')}</td><td><span class="badge ${statusClass(s.status || '')}">${statusLabel(s.status || '')}</span></td><td><button class="ghost small" data-modal="student" data-id="${s.id}">Detalhes</button><button class="ghost small" data-action="whatsapp-student" data-phone="${esc(s.phone || '')}">WhatsApp</button></td></tr>`).join('')}</tbody></table></div>`); }
function renderWorkouts() { const isAdmin = data!.user.role !== 'student'; return panel('Treinos e exercícios', isAdmin ? `<button class="primary" data-modal="new-workout">Criar ficha</button>` : '', `<div class="cards-grid">${data!.workouts.map(w => `<article class="card workout-card"><div class="card-head"><h3>${esc(w.title)}</h3><span class="badge ${w.status==='provisorio'?'warn':''}">${statusLabel(w.status || 'ativo')}</span></div><p>${esc(w.goal || '')} • ${esc(w.level || '')} • ${esc(w.method || '')}</p><div class="exercise-list">${(w.exercises || []).map((e:any) => `<div><b>${esc(e.name)}</b><small>${esc(e.sets)}x ${esc(e.reps)} • descanso ${esc(e.rest || '-')}</small></div>`).join('')}</div><button class="primary small" data-modal="workout" data-id="${w.id}">Abrir treino</button></article>`).join('')}</div>`); }
function renderSchedules() { const isAdmin = data!.user.role !== 'student'; return panel('Agenda de treinos', isAdmin ? `<button class="primary" data-modal="new-schedule">Novo agendamento</button>` : `<button class="primary" data-action="whatsapp">Solicitar horário</button>`, `<div class="timeline">${data!.schedules.map(s => `<div class="time-item"><time>${dateBR(s.date)}<b>${esc(s.time)}</b></time><div><h3>${esc(s.title)}</h3><p>${esc(s.type)} • ${statusLabel(s.status)} • ${esc(s.location)}</p>${s.onlineLink ? `<a href="${esc(s.onlineLink)}" target="_blank">Abrir aula online</a>` : ''}</div></div>`).join('') || empty('Nenhum agendamento.')}</div>`); }
function renderAssessments() { return panel('Avaliação física e evolução', `<button class="primary" data-modal="new-assessment">Registrar avaliação</button>`, `<div class="grid-2"><article class="card"><h3>Histórico</h3>${data!.assessments.map(a => `<div class="list-row"><span><b>${dateBR(a.date)}</b><small>Peso ${a.weight}kg • Gordura ${a.bodyFat}% • Sono ${a.sleep}/10</small></span></div>`).join('') || empty('Sem avaliações.')}</article><article class="card"><h3>Gráfico simples</h3><div class="bars">${data!.assessments.map(a => `<span style="height:${Math.max(18, Number(a.weight||0))}%"><em>${a.weight}</em></span>`).join('')}</div><p class="notice">Dados corporais são sensíveis e devem ser tratados conforme LGPD.</p></article></div>`); }
function renderPayments() {
  return panel('Pagamentos manuais e comprovantes', data!.user.role !== 'student' ? `<button class="primary" data-modal="new-payment">Nova cobrança</button>` : '', `<div class="checkout-card card"><h3>Checkout manual</h3><p>Envie o comprovante do Pix ou pagamento externo. O status muda para <b>Em análise</b> e o personal aprova ou reprova pelo painel.</p>${data!.user.role === 'student' && data!.payments[0] ? `<button class="primary" data-modal="upload-proof" data-id="${data!.payments[0].id}">Enviar comprovante agora</button>` : ''}</div><div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Plano</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Comprovante</th><th>Ações</th></tr></thead><tbody>${data!.payments.map(p => `<tr><td>${esc(studentOf(p.studentId)?.name || data!.user.name)}</td><td>${esc(planOf(p.planId)?.name || '-')}</td><td>${money(p.amount)}</td><td>${dateBR(p.dueDate)}</td><td><span class="badge ${statusClass(p.status)}">${statusLabel(p.status)}</span></td><td>${p.hasProof ? `<button class="link-btn" data-modal="proof" data-id="${p.id}">${esc(p.proofName)}</button>` : '<span class="muted">Aguardando comprovante</span>'}</td><td><button class="ghost small" ${p.hasProof?'':'disabled'} data-modal="proof" data-id="${p.id}">Ver comprovante</button>${data!.user.role==='student' ? `<button class="primary small" data-modal="upload-proof" data-id="${p.id}">Enviar</button><button class="ghost small" data-modal="payment-history" data-id="${p.id}">Histórico</button>` : `<button class="ghost small" data-modal="payment-history" data-id="${p.id}">Histórico</button>`}</td></tr>`).join('')}</tbody></table></div>`);
}
function renderContents() { return panel('FitPro Academy', '', `<div class="cards-grid">${data!.contents.map(c => `<article class="card"><span class="badge">${esc(c.category)}</span><h3>${esc(c.title)}</h3><p>${esc(c.description)}</p>${c.url?.includes('youtube') ? `<iframe src="${esc(c.url)}" title="${esc(c.title)}" allowfullscreen></iframe>` : `<a href="${esc(c.url)}" target="_blank">Abrir conteúdo</a>`}<button class="ghost small">Marcar como concluído</button></article>`).join('')}</div>`); }
function renderCommunity() {
  return panel('Comunidade e gamificação', `<button class="primary" data-modal="new-post">Nova publicação</button>`, `<div class="grid-2"><article class="card"><h3>Feed</h3>${data!.posts.map(p => { const st = studentOf(p.studentId); return `<div class="post"><div class="post-head">${renderAvatar(st || {name:p.author})}<span><b>${esc(p.author)}</b><small>${esc(p.category)} • ${dateTimeBR(p.createdAt)}</small></span></div><p>${esc(p.text)}</p></div>`; }).join('')}</article><article class="card"><h3>Desafios, ranking e pódio</h3>${data!.challenges.map(c => `<div class="challenge"><b>${esc(c.title)}</b><p>${esc(c.description)}</p><div class="podium-list">${(c.participants || []).slice(0,3).map((pt:any, i:number) => { const st = studentOf(pt.studentId) || data!.students[i] || {name:'Aluno'}; return `<div>${renderAvatar(st,'small-avatar')}<span>${['🥇','🥈','🥉'][i] || '🏅'} ${esc(st.name)}<small>${pt.progress || 0}/${c.target || 0}</small></span></div>`; }).join('')}</div><div class="progress"><i style="width:${Math.min(100, ((c.participants?.[0]?.progress || 0) / (c.target || 1)) * 100)}%"></i></div><small>Recompensa: ${esc(c.reward)}</small></div>`).join('')}</article></div>`);
}
function renderHabits() { return panel('Hábitos, nutrição básica e suplementação', `<button class="primary" data-modal="new-habit">Registrar hábito</button>`, `<div class="grid-2"><article class="card"><h3>Hoje</h3>${data!.habits.map(h => `<div class="list-row"><span><b>${dateBR(h.date)}</b><small>Água ${h.waterMl}ml • Sono ${h.sleepHours}h • Passos ${h.steps}</small></span></div>`).join('')}</article><article class="card"><h3>Suplementos</h3>${data!.supplements.map(s => `<div class="list-row"><span><b>${esc(s.name)}</b><small>${esc(s.objective)} • ${esc(s.scheduleText)}</small></span><span class="badge warn">validar profissional</span></div>`).join('')}<p class="notice">O sistema não substitui nutricionista, médico ou profissional habilitado.</p></article></div>`); }
function renderMessages() { return panel('Chat interno e WhatsApp', `<button class="primary" data-modal="new-message">Enviar mensagem</button>`, `<div class="chat-list">${data!.messages.map(m => { const sender = senderOf(m.senderId) || { name: 'Sistema' }; return `<div class="message ${m.senderId===data!.user.id?'mine':''}"><div class="message-head">${renderAvatar(sender,'small-avatar')}<span><b>${esc(sender.name)}</b><small>${dateTimeBR(m.createdAt)}</small></span></div><p>${esc(m.text)}</p></div>`; }).join('')}</div>`); }

function renderProfile() {
  const s = currentStudent();
  const plan = planOf(s?.planId);
  const person = data!.user.role === 'student' ? { ...s, avatar: data!.user.avatar, name: data!.user.name } : data!.user;
  return panel('Perfil do aluno', '', `<div class="profile-grid"><article class="card profile-card">${renderAvatar(person,'profile-avatar')}<h3>${esc(person?.name || data!.user.name)}</h3><p>${esc(data!.user.email)}</p><form data-form="avatar-upload"><label>Trocar foto de perfil<input name="file" type="file" accept="image/png,image/jpeg,image/webp" required></label><button class="primary">Salvar foto</button></form><p class="notice">PNG, JPG ou WebP. A imagem fica em rota protegida do backend local.</p></article><article class="card"><h3>Dados principais</h3><div class="info-grid vertical"><span>Nome<b>${esc(s?.name || data!.user.name)}</b></span><span>E-mail<b>${esc(s?.email || data!.user.email)}</b></span><span>WhatsApp<b>${esc(s?.phone || '-')}</b></span><span>Objetivo<b>${esc(s?.goal || '-')}</b></span><span>Plano<b>${esc(plan?.name || '-')}</b></span><span>Peso inicial<b>${esc(s?.initialWeight || '-')} kg</b></span><span>Peso atual<b>${esc(s?.currentWeight || '-')} kg</b></span><span>Nível<b>${esc(s?.level || '-')}</b></span><span>Cidade/Estado<b>${esc(s?.city || '-')}</b></span><span>Status<b>${statusLabel(s?.status || 'ativo')}</b></span></div></article><article class="card"><h3>Consentimentos e privacidade</h3><p>Dados de saúde, fotos de evolução e comprovantes são tratados como dados sensíveis.</p><div class="checks readonly"><label>✅ Termos de uso</label><label>✅ Consentimento LGPD</label><label>✅ Notificações configuráveis</label><label>⚠️ Fotos e comprovantes privados por rota protegida</label></div></article></div>`);
}
function renderReports() { const approved = data!.payments.filter(p=>p.status==='aprovado').reduce((a,p)=>a+p.amount,0); return panel('Relatórios executivos', `<button class="ghost" data-action="export-json">Exportar JSON</button>`, `<section class="stats-grid">${stat('Receita aprovada', money(approved), 'financeiro')}${stat('Treinos criados', data!.workouts.length, 'biblioteca/fichas')}${stat('Conteúdos', data!.contents.length, 'FitPro Academy')}${stat('Logs', data!.auditLogs.length, 'auditoria')}</section><article class="card"><h3>Insights</h3>${alertLine('Alunos sem atividade devem receber mensagem automática.')}${alertLine('Pagamentos em análise precisam de comprovante visualizado antes da decisão.')}${alertLine('Conteúdos mais vistos podem virar programa de desafio.')}</article>`); }
function renderLeads() { return panel('CRM e leads', '', `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Contato</th><th>Objetivo</th><th>Status</th><th>Ações</th></tr></thead><tbody>${data!.leads.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.phone)}<small>${esc(l.email)}</small></td><td>${esc(l.goal)}</td><td><span class="badge">${esc(l.status)}</span></td><td><button class="ghost small" data-action="whatsapp-lead" data-phone="${esc(l.phone)}">WhatsApp</button></td></tr>`).join('')}</tbody></table></div>`); }
function renderIntegrations() { return panel('Painel de integrações', '', `<div class="cards-grid">${data!.integrations.map(i => `<article class="card"><div class="card-head"><h3>${esc(i.key)}</h3><span class="badge ${i.status==='conectado'?'ok':'warn'}">${esc(i.status)}</span></div><p>Configuração pública: ${esc(JSON.stringify(i.publicConfig || {}))}</p><button class="ghost small">Testar conexão</button></article>`).join('')}</div><p class="notice">Chaves secretas ficam fora do frontend e devem ser configuradas no .env/backend.</p>`); }
function renderAutomations() { return panel('Motor de automações', '', `<div class="cards-grid">${data!.automations.map(a => `<article class="card"><span class="badge ${a.active?'ok':'warn'}">${a.active?'ativa':'inativa'}</span><h3>${esc(a.name)}</h3><p>${esc(a.triggerName)} → ${esc(a.channel)}</p><small>${esc(a.message)}</small></article>`).join('')}</div>`); }
function renderSettings() { return panel('Configurações do site', '', `<form class="card form-grid" data-form="settings"><label>Marca<input name="brandName" value="${esc(data!.settings.brandName)}"></label><label>Cor principal<input name="primaryColor" value="${esc(data!.settings.primaryColor)}"></label><label>Cor secundária<input name="secondaryColor" value="${esc(data!.settings.secondaryColor)}"></label><label>WhatsApp<input name="whatsapp" value="${esc(data!.settings.whatsapp)}"></label><button class="primary">Salvar configurações</button></form>`); }
function renderLogs() { return panel('Auditoria e segurança', '', `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Ação</th><th>Entidade</th><th>Meta</th></tr></thead><tbody>${data!.auditLogs.map(l => `<tr><td>${dateTimeBR(l.createdAt)}</td><td>${esc(l.action)}</td><td>${esc(l.entity)} / ${esc(l.entityId)}</td><td>${esc(l.metadata)}</td></tr>`).join('')}</tbody></table></div>`); }
function renderWorkspaces() { return panel('SaaS multi-personal', '', `<div class="cards-grid">${(data!.workspaces || []).map((w:any) => `<article class="card"><h3>${esc(w.brandName || w.brand_name)}</h3><p>Slug: ${esc(w.slug)} • Plano ${esc(w.plan)} • ${esc(w.status)}</p><button class="ghost small">Auditar workspace</button></article>`).join('')}</div>`); }
function renderGiveaways() {
  const rows = data!.students.map((s,i) => {
    const progress = challengeProgress(s.id); const chances = 1 + Math.floor((progress.points || 0) / 200) + (data!.posts.some(p => p.studentId === s.id) ? 1 : 0) + (data!.habits.some(h => h.studentId === s.id) ? 1 : 0);
    return `<tr><td><div class="person-cell">${renderAvatar(s,'small-avatar')}<span><b>${esc(s.name)}</b><small>${esc(s.goal || '')}</small></span></div></td><td>${progress.points} pts</td><td><span class="badge ok">${chances} chance(s)</span></td><td>${i===0 ? 'Aluno destaque da semana' : 'Elegível por engajamento'}</td></tr>`;
  }).join('');
  return panel('Sorteios do Dev e chances extras', `<button class="primary" data-modal="giveaway-rules">Criar sorteio demo</button>`, `<section class="grid-2"><article class="card"><h3>Sorteio Performance 30D</h3><p>Chances extras por treino, check-in, comunidade, avaliação e pagamento em dia. A regra antifraude final deve ser ligada ao backend na próxima fase.</p>${alertLine('1 chance base para aluno ativo.')}${alertLine('+1 chance por publicação/check-in válido.')}${alertLine('+1 chance a cada 200 pontos de engajamento.')}</article><article class="card"><h3>Aluno destaque da semana</h3><div class="spotlight-card">${renderAvatar(data!.students[0],'spotlight-avatar')}<div><b>${esc(data!.students[0]?.name || 'Aluno')}</b><p>Mais engajamento na temporada atual.</p><span class="badge ok">Destaque semanal</span></div></div></article></section><div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Pontos</th><th>Chances</th><th>Motivo</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}
function renderHelp() {
  return panel('Central de ajuda com IA', `<button class="primary" data-modal="ai-assistant">Abrir assistente</button>`, `<div class="cards-grid">${feature('🤖','Assistente IA','Tira dúvidas sobre uso do app, pagamentos, treinos e rotina. Não substitui personal, médico ou nutricionista.')}${feature('👤','Aluno','Como ver treinos, registrar avaliação, enviar comprovante e falar com o personal.')}${feature('🧑‍🏫','Personal','Como cadastrar aluno, criar treino, aprovar pagamento, usar Pulse e analisar riscos.')}${feature('🛡️','Segurança','Dados sensíveis, comprovantes privados, LGPD, logs e permissões por role.')}</div><article class="card ai-help-card"><h3>Perguntas rápidas</h3><div class="quick-grid"><button data-modal="ai-answer" data-id="pagamento">Como aprovar pagamento?</button><button data-modal="ai-answer" data-id="sumido">Como lidar com aluno sumido?</button><button data-modal="ai-answer" data-id="missao">Como funciona Missão do Dia?</button><button data-modal="ai-answer" data-id="sorteio">Como funcionam sorteios?</button></div></article>`);
}

function panel(title: string, actionHtml: string, body: string) { return `<section class="panel"><div class="panel-head"><div><span class="eyebrow">FitPro Elite</span><h2>${title}</h2></div><div>${actionHtml}</div></div>${body}</section>`; }
function empty(text: string) { return `<div class="empty">${esc(text)}</div>`; }
function renderFooter() { return `<footer class="footer"><b>FitPro Elite</b><span>Produto desenvolvido por uPaiva.dev • dados demo fictícios • LGPD, saúde e pagamentos exigem backend/storage real em produção.</span><div><a href="#">Termos</a><a href="#">Privacidade</a><a href="#">Segurança</a><a href="#">Suporte</a></div></footer>`; }

function renderModal() {
  if (!modal) { modalRoot.innerHTML = ''; return; }
  const type = modal.type;
  if (type === 'proof') return renderProofModal(modal.payload);
  if (type === 'payment-history') return renderHistoryModal(modal.payload);
  const content = genericModal(type, modal.payload);
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal"><button class="close-x" data-close aria-label="Fechar modal">×</button>${content}</div></div>`;
  bindModalEvents();
}

function genericModal(type: string, payload: any) {
  if (type === 'quick-action') return `<h2>Ação rápida</h2><div class="quick-grid"><button data-tab="pagamentos" data-close>Pagamentos</button><button data-tab="treinos" data-close>Treinos</button><button data-tab="mensagens" data-close>Mensagens</button><button data-modal="ai-assistant">Assistente IA</button><button data-tab="jornada" data-close>Jornada</button><button data-action="whatsapp" data-close>WhatsApp</button></div>`;
  if (type === 'ai-assistant') return `<h2>Assistente FitPro IA</h2><p>Assistente flutuante em modo seguro: ajuda com navegação, pagamentos, missão do dia, check-ins e alertas. Não substitui personal, médico ou nutricionista.</p><div class="ai-chat-demo"><div class="message"><div class="message-head"><span class="avatar small-avatar">IA</span><span><b>FitPro Coach IA</b><small>agora</small></span></div><p>${data?.user.role === 'student' ? 'Sua missão de hoje é concluir o treino, bater a meta de água e registrar check-in para ganhar pontos.' : 'Seu Pulse indica alunos em risco, alunos que merecem elogio e pagamentos pendentes para priorizar.'}</p></div></div><div class="quick-grid"><button data-tab="dashboard" data-close>Ver Pulse</button><button data-tab="coach" data-close>Coach Invisível</button><button data-tab="ajuda" data-close>Central de ajuda</button><button data-close>Fechar</button></div>`;
  if (type === 'ai-answer') return `<h2>Resposta IA segura</h2><p>${payload === 'pagamento' ? 'Abra Pagamentos, clique em Ver comprovante, confira imagem/PDF e aprove ou reprove com motivo. O aluno não tem permissão para aprovar o próprio pagamento.' : payload === 'sumido' ? 'O Coach Invisível marca aluno sumido quando há muitos dias sem atividade/check-in. O ideal é enviar uma mensagem curta de retomada pelo WhatsApp.' : payload === 'missao' ? 'A Missão do Dia combina treino, energia, check-in e pontos possíveis para aumentar engajamento do aluno.' : 'Sorteios usam chances por engajamento: aluno ativo ganha chance base, pontos geram chances extras e ações válidas aumentam participação.'}</p><button class="primary" data-close>Entendi</button>`;
  if (type === 'coach-message') { const s = studentOf(payload); return `<h2>Mensagem sugerida pelo Coach Invisível</h2><p>Olá, ${esc(s?.name?.split(' ')[0] || 'aluno')}! Vi seu progresso no FitPro e queria te puxar de volta para a missão da semana. Vamos fazer um check-in rápido hoje?</p><button class="primary" data-action="whatsapp-student" data-phone="${esc(s?.phone || '')}">Enviar pelo WhatsApp</button>`; }
  if (type === 'reward-preview') return `<h2>Loja de recompensas</h2><p>Resgate preparado para próxima fase. A pontuação será validada por logs, check-ins, desafios e regras antifraude.</p><button class="primary" data-close>Ok</button>`;
  if (type === 'giveaway-rules') return `<h2>Criar sorteio demo</h2><p>Sorteio preparado com chances extras por engajamento. Para produção, conectar logs reais, antifraude e aceite das regras.</p><button class="primary" data-close>Entendi</button>`;
  if (type === 'student') { const s = studentOf(payload); return `${studentAvatar(s)}<h2>${esc(s?.name)}</h2><p>${esc(s?.goal)}</p><div class="info-grid"><span>E-mail<b>${esc(s?.email)}</b></span><span>WhatsApp<b>${esc(s?.phone)}</b></span><span>Status<b>${statusLabel(s?.status || '')}</b></span><span>Plano<b>${esc(planOf(s?.planId)?.name)}</b></span></div><button class="primary" data-action="whatsapp-student" data-phone="${esc(s?.phone || '')}">Chamar no WhatsApp</button>`; }
  if (type === 'workout') { const w = data!.workouts.find(x => x.id === payload); return `<h2>${esc(w?.title)}</h2><p>${esc(w?.goal)} • ${esc(w?.method)}</p><div class="exercise-list">${(w?.exercises || []).map((e:any) => `<div><b>${esc(e.name)}</b><small>${esc(e.sets)}x ${esc(e.reps)} • ${esc(e.note)}</small></div>`).join('')}</div>`; }
  if (type === 'new-post') return `<h2>Nova publicação</h2><form data-form="post"><label>Categoria<select name="category"><option>Vitória</option><option>Dúvida</option><option>Aviso</option><option>Desafio</option><option>Evolução</option></select></label><label>Texto<textarea name="text" required></textarea></label><button class="primary">Publicar</button></form>`;
  if (type === 'new-message') return `<h2>Enviar mensagem</h2><form data-form="message"><label>Aluno<select name="studentId">${data!.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><label>Mensagem<textarea name="text" required></textarea></label><button class="primary">Enviar</button></form>`;
  if (type === 'upload-proof') return `<h2>Enviar comprovante</h2><p>Arquivos aceitos: imagem ou PDF até 8MB. O comprovante será salvo em storage privado local e acessado por rota protegida.</p><form data-form="proof-upload" data-payment-id="${payload}"><label>Arquivo<input name="file" type="file" accept="image/*,application/pdf" required></label><label>Observação<textarea name="note" placeholder="Ex: Pix feito às 18:42"></textarea></label><button class="primary">Enviar comprovante</button></form>`;
  if (type === 'new-student') return `<h2>Novo aluno</h2><form data-form="student"><div class="form-grid"><input name="name" placeholder="Nome" required><input name="email" placeholder="E-mail"><input name="phone" placeholder="WhatsApp"><input name="city" placeholder="Cidade"><input name="goal" placeholder="Objetivo"><select name="level"><option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select></div><button class="primary">Salvar aluno</button></form>`;
  if (type === 'new-workout') return `<h2>Criar ficha de treino</h2><form data-form="workout"><label>Aluno<select name="studentId"><option value="">Modelo sem aluno</option>${data!.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><input name="title" placeholder="Título" required><input name="goal" placeholder="Objetivo"><input name="method" placeholder="Método"><button class="primary">Criar treino</button></form>`;
  if (type === 'new-schedule') return `<h2>Novo agendamento</h2><form data-form="schedule"><label>Aluno<select name="studentId">${data!.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><input name="title" placeholder="Título" required><input name="date" type="date" required><input name="time" type="time" required><select name="type"><option value="presencial">Presencial</option><option value="online">Online</option><option value="consultoria">Consultoria</option><option value="avaliacao">Avaliação</option></select><input name="location" placeholder="Local"><input name="onlineLink" placeholder="Link online"><button class="primary">Agendar</button></form>`;
  if (type === 'new-assessment') return `<h2>Registrar avaliação</h2><form data-form="assessment"><label>Aluno<select name="studentId">${data!.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><input name="date" type="date"><input name="weight" type="number" step="0.1" placeholder="Peso"><input name="bodyFat" type="number" step="0.1" placeholder="Gordura %"><input name="sleep" type="number" placeholder="Sono 0-10"><textarea name="notes" placeholder="Observações"></textarea><button class="primary">Salvar avaliação</button></form>`;
  if (type === 'new-payment') return `<h2>Nova cobrança manual</h2><form data-form="payment"><label>Aluno<select name="studentId">${data!.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><label>Plano<select name="planId">${data!.plans.map(p => `<option value="${p.id}">${esc(p.name)} • ${money(p.price)}</option>`).join('')}</select></label><input name="amount" type="number" step="0.01" placeholder="Valor" required><input name="dueDate" type="date" required><input name="externalLink" placeholder="Link de pagamento"><button class="primary">Criar cobrança</button></form>`;
  if (type === 'new-habit') return `<h2>Registrar hábito</h2><form><p class="notice">Endpoint de hábitos está preparado no banco. A gravação direta será finalizada na próxima iteração.</p><button type="button" class="primary" data-close>Entendi</button></form>`;
  return `<h2>Em breve</h2><p>Este módulo possui estrutura preparada e será ligado ao backend na próxima etapa segura.</p>`;
}

async function renderProofModal(paymentId: string) {
  const p = data!.payments.find(x => x.id === paymentId);
  if (!p) return;
  const s = studentOf(p.studentId); const plan = planOf(p.planId);
  const src = `/api/payments/${p.id}/proof`;
  const isPdf = p.proofMimeType === 'application/pdf';
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal proof-modal"><button class="close-x" data-close aria-label="Fechar modal">×</button><div class="proof-grid"><div class="proof-preview">${p.hasProof ? (isPdf ? `<iframe src="${src}" title="Comprovante PDF"></iframe>` : `<img src="${src}" alt="Comprovante">`) : empty('Nenhum comprovante enviado')}</div><div><span class="eyebrow">Análise manual</span><h2>${esc(p.proofName || 'Aguardando comprovante')}</h2><div class="info-grid vertical"><span>Aluno<b>${esc(s?.name)}</b></span><span>Plano<b>${esc(plan?.name)}</b></span><span>Valor<b>${money(p.amount)}</b></span><span>Vencimento<b>${dateBR(p.dueDate)}</b></span><span>Enviado em<b>${dateTimeBR(p.proofUploadedAt)}</b></span><span>Status<b>${statusLabel(p.status)}</b></span><span>Observação<b>${esc(p.proofStudentNote || '-')}</b></span></div><div class="modal-actions"><a class="ghost" href="${src}" target="_blank" rel="noopener">Abrir em nova aba</a><a class="ghost" href="${src}?download=1">Baixar comprovante</a>${data!.user.role !== 'student' ? `<button class="primary" data-action="approve-payment" data-id="${p.id}">Aprovar</button><button class="danger" data-action="reject-payment" data-id="${p.id}">Reprovar</button><button class="ghost" data-modal="payment-history" data-id="${p.id}">Histórico</button>` : ''}</div><p class="notice">Comprovante privado: aluno só acessa o próprio arquivo; personal acessa alunos do workspace; dev/super admin audita.</p></div></div></div></div>`;
  bindModalEvents();
}
async function renderHistoryModal(paymentId: string) {
  await action(async () => {
    const result = await api<{history:any[]}>(`/api/payments/${paymentId}/history`);
    modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal"><button class="close-x" data-close aria-label="Fechar modal">×</button><h2>Histórico do pagamento</h2><div class="timeline">${result.history.map(h => `<div class="time-item"><time>${dateTimeBR(h.createdAt)}</time><div><h3>${esc(h.action)}</h3><p>${esc(h.note || '')}</p><small>Responsável: ${esc(h.actorId)}</small></div></div>`).join('')}</div></div></div>`;
    bindModalEvents();
  }, 'Histórico carregado.');
}

function bindEvents() {
  document.querySelectorAll<HTMLElement>('[data-view]').forEach(el => el.onclick = () => { view = el.dataset.view as View; render(); });
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(el => el.onclick = () => { tab = el.dataset.tab || 'dashboard'; closeModal(); render(); });
  document.querySelectorAll<HTMLElement>('[data-modal]').forEach(el => el.onclick = () => openModal(el.dataset.modal!, el.dataset.id));
  document.querySelectorAll<HTMLFormElement>('form[data-form]').forEach(form => form.onsubmit = submitForm);
  document.querySelectorAll<HTMLElement>('[data-action]').forEach(el => el.onclick = () => handleAction(el));
}
function bindModalEvents() {
  modalRoot.querySelectorAll<HTMLElement>('[data-close]').forEach(el => el.onclick = closeModal);
  modalRoot.querySelectorAll<HTMLFormElement>('form[data-form]').forEach(form => form.onsubmit = submitForm);
  modalRoot.querySelectorAll<HTMLElement>('[data-action]').forEach(el => el.onclick = () => handleAction(el));
  modalRoot.querySelectorAll<HTMLElement>('[data-modal]').forEach(el => el.onclick = () => openModal(el.dataset.modal!, el.dataset.id));
  modalRoot.querySelectorAll<HTMLElement>('[data-tab]').forEach(el => el.onclick = () => { tab = el.dataset.tab || 'dashboard'; closeModal(); render(); });
  modalRoot.querySelectorAll<HTMLElement>('.modal-backdrop').forEach(backdrop => backdrop.onclick = (event) => { if (event.target === backdrop) closeModal(); });
  modalRoot.querySelectorAll<HTMLElement>('.modal').forEach(card => card.onclick = event => event.stopPropagation());
}
window.onkeydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && modal) closeModal(); };
async function submitForm(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const type = form.dataset.form!;
  const fd = new FormData(form);
  const body: Record<string, any> = {};
  fd.forEach((value, key) => { if (!(value instanceof File)) body[key] = value; });
  await action(async () => {
    if (type === 'login') { const r = await api<{token:string,user:User}>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }); setToken(r.token); await reload(); view = 'app'; tab = 'dashboard'; render(); return; }
    if (type === 'register') { body.terms = fd.get('terms') === 'on'; body.lgpd = fd.get('lgpd') === 'on'; body.photos = fd.get('photos') === 'on'; body.notifications = fd.get('notifications') === 'on'; const r = await api<{token:string}>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }); setToken(r.token); await reload(); view = 'app'; tab = 'dashboard'; render(); return; }
    if (type === 'lead') { await api('/api/leads', { method: 'POST', body: JSON.stringify(body) }); form.reset(); return; }
    if (type === 'settings') { const r = await api<{bootstrap:Bootstrap}>('/api/settings', { method: 'PUT', body: JSON.stringify(body) }); data = r.bootstrap; render(); return; }
    if (type === 'post') { const r = await api<{bootstrap:Bootstrap}>('/api/community-posts', { method: 'POST', body: JSON.stringify(body) }); data = r.bootstrap; closeModal(); render(); return; }
    if (type === 'message') { const r = await api<{bootstrap:Bootstrap}>('/api/messages', { method: 'POST', body: JSON.stringify(body) }); data = r.bootstrap; closeModal(); render(); return; }
    if (type === 'student') { const r = await api<{bootstrap:Bootstrap}>('/api/students', { method: 'POST', body: JSON.stringify(body) }); data = r.bootstrap; closeModal(); render(); return; }
    if (type === 'workout') { body.exercises = [{ name: 'Exercício base', sets: '3', reps: '12', rest: '60s', note: 'Editar na próxima etapa.' }]; const r = await api<{bootstrap:Bootstrap}>('/api/workouts', { method: 'POST', body: JSON.stringify(body) }); data = r.bootstrap; closeModal(); render(); return; }
    if (type === 'schedule') { const r = await api<{bootstrap:Bootstrap}>('/api/schedules', { method: 'POST', body: JSON.stringify(body) }); data = r.bootstrap; closeModal(); render(); return; }
    if (type === 'assessment') { const r = await api<{bootstrap:Bootstrap}>('/api/assessments', { method: 'POST', body: JSON.stringify(body) }); data = r.bootstrap; closeModal(); render(); return; }
    if (type === 'payment') { const plan = planOf(body.planId); if (!body.amount) body.amount = plan?.price || 0; const r = await api<{bootstrap:Bootstrap}>('/api/payments', { method: 'POST', body: JSON.stringify(body) }); data = r.bootstrap; closeModal(); render(); return; }
    if (type === 'avatar-upload') { const file = fd.get('file') as File; if (!file || !file.size) throw new Error('Selecione uma imagem.'); if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Use PNG, JPG ou WebP.'); if (file.size > 3 * 1024 * 1024) throw new Error('Imagem deve ter no máximo 3MB.'); const dataUrl = await fileToDataUrl(file); const r = await api<{bootstrap:Bootstrap}>('/api/profile/avatar', { method: 'POST', body: JSON.stringify({ fileName: file.name, dataUrl }) }); data = r.bootstrap; render(); return; }
    if (type === 'proof-upload') { const file = fd.get('file') as File; if (!file || !file.size) throw new Error('Selecione um arquivo.'); const dataUrl = await fileToDataUrl(file); const r = await api<{bootstrap:Bootstrap}>(`/api/payments/${form.dataset.paymentId}/proof`, { method: 'POST', body: JSON.stringify({ fileName: file.name, note: body.note, dataUrl }) }); data = r.bootstrap; closeModal(); render(); return; }
  }, 'Salvo com sucesso.');
}
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Falha ao ler arquivo.')); reader.readAsDataURL(file); }); }
async function handleAction(el: HTMLElement) {
  const actionName = el.dataset.action;
  if (actionName === 'logout') return action(async () => { await api('/api/auth/logout', { method: 'POST' }); clearToken(); data = null; view = 'landing'; render(); }, 'Você saiu.');
  if (actionName === 'whatsapp') { const msg = encodeURIComponent('Olá, quero falar sobre meu acompanhamento FitPro.'); window.open(`https://wa.me/${data?.settings.whatsapp || '5535988042182'}?text=${msg}`, '_blank'); return; }
  if (actionName === 'whatsapp-student' || actionName === 'whatsapp-lead') { const phone = (el.dataset.phone || data?.settings.whatsapp || '').replace(/\D/g, ''); window.open(`https://wa.me/55${phone.replace(/^55/,'')}?text=${encodeURIComponent('Olá! Passando pelo acompanhamento FitPro.')}`, '_blank'); return; }
  if (actionName === 'approve-payment') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/payments/${el.dataset.id}/approve`, { method: 'POST', body: JSON.stringify({ note: 'Aprovado após análise do comprovante.' }) }); data = r.bootstrap; closeModal(); render(); }, 'Pagamento aprovado e aluno notificado.');
  if (actionName === 'reject-payment') { const reason = prompt('Motivo da reprovação:') || 'Comprovante recusado.'; return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/payments/${el.dataset.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); data = r.bootstrap; closeModal(); render(); }, 'Pagamento recusado e aluno notificado.'); }
  if (actionName === 'export-json') { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fitpro-export-demo.json'; a.click(); URL.revokeObjectURL(a.href); return; }
}

bootstrap();
