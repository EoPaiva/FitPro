import './styles.css';
import { api, apiUrl, Bootstrap, clearToken, dateBR, dateTimeBR, getToken, money, Payment, Plan, protectedFileUrl, publicAssetUrl, setToken, statusLabel, Student, User, Workout } from './api';

type View = 'landing' | 'login' | 'register' | 'app';
type Modal = { type: string; payload?: any } | null;

const objectiveOptions = ['hipertrofia','emagrecimento','condicionamento','força','resistência','mobilidade','saúde geral','performance','retorno após pausa','definição','ganho de massa','postura e estabilidade'];
const muscleGroups = ['peito','costas','ombros','bíceps','tríceps','quadríceps','posteriores','glúteos','panturrilhas','abdômen','core','lombar','corpo todo','cardio','mobilidade'];
const equipments = ['peso corporal','halteres','barra','máquina','cabo/polia','elástico','kettlebell','banco','bola','esteira','bicicleta','colchonete','outro'];
const workoutMethods = ['tradicional','bi-set','tri-set','drop-set','rest-pause','circuito','pirâmide','supersérie','isometria','HIIT','EMOM','AMRAP'];
const legalPaths = new Set(['termos','privacidade','lgpd','aviso-de-saude','suporte','contato','cookies','responsabilidade']);

const app = document.querySelector<HTMLDivElement>('#app')!;
const modalRoot = document.querySelector<HTMLDivElement>('#modal-root')!;
const toastRoot = document.querySelector<HTMLDivElement>('#toast-root')!;

async function registerFitProPWA() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('/sw.js'); } catch (error) { console.warn('[FitPro] Service Worker não registrado', error); }
}
registerFitProPWA();
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
async function enablePushNotifications() {
  if (!('Notification' in window)) throw new Error('Este navegador não suporta notificações.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permissão de notificação negada.');
  let subscription: any = null;
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    const registration = await navigator.serviceWorker.ready;
    const vapid = await api<{publicKey:string,enabled:boolean,mode:string}>('/api/push/vapid-public-key');
    subscription = vapid.publicKey ? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid.publicKey) }) : { endpoint: `local-notification-${Date.now()}`, mode: 'local_notification_only', permission };
  } else subscription = { endpoint: `local-notification-${Date.now()}`, mode: 'notification_api_only', permission };
  const result = await api<{bootstrap:Bootstrap}>('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) });
  data = adoptBootstrap(result.bootstrap);
  new Notification('FitPro Elite', { body: 'Notificações ativadas com segurança no app.', icon: '/favicon.svg' });
}

let view: View = getToken() ? 'app' : 'landing';
let tab = 'dashboard';
let registerMode: 'choice' | 'student' | 'trainer' = 'choice';
let data: Bootstrap | null = null;
let modal: Modal = null;
let loading = false;
type ApiHealth = { status: 'checking' | 'online' | 'slow' | 'offline'; latencyMs?: number; checkedAt?: string; env?: string; app?: string; error?: string };
let apiHealth: ApiHealth = { status: 'checking' };

const navByRole: Record<string, { id: string; label: string; icon: string }[]> = {
  student: [
    { id: 'dashboard', label: 'Visão Geral', icon: '⚡' }, { id: 'jornada', label: 'Progresso', icon: '🧭' }, { id: 'treinos', label: 'Meus Treinos', icon: '🏋️' },
    { id: 'avaliacoes', label: 'Evolução', icon: '📈' }, { id: 'pagamentos', label: 'Pagamentos', icon: '💳' }, { id: 'conteudos', label: 'Academy', icon: '🎬' },
    { id: 'comunidade', label: 'Comunidade', icon: '🏆' }, { id: 'badges', label: 'Desafios', icon: '🎖️' }, { id: 'recompensas', label: 'Recompensas', icon: '🛍️' }, { id: 'habitos', label: 'Hábitos', icon: '💧' }, { id: 'mensagens', label: 'Meu Personal', icon: '💬' }, { id: 'perfil', label: 'Perfil', icon: '👤' }, { id: 'ajuda', label: 'Ajuda', icon: '❔' }
  ],
  admin: [
    { id: 'dashboard', label: 'Pulse Coach', icon: '📊' }, { id: 'coach', label: 'Coach Invisível', icon: '🧠' }, { id: 'solicitacoes', label: 'Solicitações', icon: '📥' }, { id: 'alunos', label: 'Alunos', icon: '🧑‍🤝‍🧑' }, { id: 'treinos', label: 'Treinos', icon: '🏋️' },
    { id: 'pagamentos', label: 'Pagamentos', icon: '💳' }, { id: 'planos-plataforma', label: 'Plano FitPro', icon: '🚀' }, { id: 'conteudos', label: 'Conteúdos', icon: '🎬' },
    { id: 'comunidade', label: 'Comunidade', icon: '🏆' }, { id: 'mensagens', label: 'Mensagens', icon: '💬' }, { id: 'relatorios', label: 'Relatórios', icon: '📈' },
    { id: 'leads', label: 'CRM/Leads', icon: '🎯' }, { id: 'sorteios', label: 'Sorteios', icon: '🎁' }, { id: 'recompensas', label: 'Recompensas', icon: '🛍️' },
    { id: 'perfil', label: 'Perfil', icon: '👤' }, { id: 'ajuda', label: 'Ajuda', icon: '❔' }
  ],
  super_admin: [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' }, { id: 'status', label: 'Status', icon: '🟢' }, { id: 'tenant', label: 'Marca', icon: '🎨' }, { id: 'marketplace', label: 'Marketplace', icon: '🛒' }, { id: 'wearables', label: 'Wearables', icon: '⌚' }, { id: 'workspaces', label: 'Workspaces', icon: '🏢' }, { id: 'personais', label: 'Personais', icon: '🧑‍🏫' }, { id: 'alunos', label: 'Alunos', icon: '🧑‍🤝‍🧑' },
    { id: 'pagamentos', label: 'Pagamentos', icon: '💳' }, { id: 'planos-plataforma', label: 'Planos plataforma', icon: '🚀' }, { id: 'codigos-ativacao', label: 'Códigos', icon: '🎟️' }, { id: 'integracoes', label: 'Integrações', icon: '🔌' }, { id: 'sorteios', label: 'Sorteios', icon: '🎁' },
    { id: 'relatorios', label: 'Relatórios', icon: '📈' }, { id: 'logs', label: 'Auditoria', icon: '🛡️' }, { id: 'ajuda', label: 'Docs', icon: '📚' }
  ],
  dev: []
};
navByRole.trainer = navByRole.admin;
navByRole.dev = navByRole.super_admin;

function html(strings: TemplateStringsArray, ...values: any[]) {
  return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
}
function esc(value: any) {
  return String(value ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[s]!));
}
function initials(name = 'FP') { return name.split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase(); }

const AVATAR_CACHE_KEY = 'fitpro_elite_avatar_cache_v4_supabase';
function readAvatarCache(): Record<string,string> {
  try { return JSON.parse(localStorage.getItem(AVATAR_CACHE_KEY) || '{}') || {}; } catch { return {}; }
}
function writeAvatarCache(cache: Record<string,string>) {
  try { localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(cache)); } catch {}
}
function cacheAvatar(userId = '', avatar = '') {
  if (!userId || !avatar) return;
  const cache = readAvatarCache();
  cache[userId] = avatar;
  writeAvatarCache(cache);
}
function rawAvatarOf(person: any) {
  return person?.avatar || person?.avatarUrl || person?.avatar_url || person?.userAvatar || person?.user_avatar || '';
}
function cachedAvatarFor(person: any) {
  const direct = rawAvatarOf(person);
  if (direct) return direct;
  const cache = readAvatarCache();
  const id = person?.id || person?.userId || person?.user_id;
  return id ? cache[id] || '' : '';
}
function isProbablyUserId(value = '') { return /^user_[a-z0-9_-]+$/i.test(String(value || '').trim()); }
function normalizeAvatarSrc(value = '', person: any = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^data:image\//.test(raw) || /^blob:/.test(raw) || /^https?:\/\//.test(raw)) return raw.replace(/[?&]access_token=[^&]+/g, '').replace(/[?&]token=[^&]+/g, '');
  const id = isProbablyUserId(raw) ? raw : '';
  if (id) return publicAssetUrl(`/api/profile/avatar/${encodeURIComponent(id)}`);
  if (raw.startsWith('/api/profile/avatar/')) return publicAssetUrl(raw.replace(/[?&]access_token=[^&]+/g, '').replace(/[?&]token=[^&]+/g, ''));
  if (raw.startsWith('/api/')) return publicAssetUrl(raw);
  const fallbackId = person?.userId || person?.user_id;
  if (isProbablyUserId(fallbackId) && (raw === fallbackId || raw.includes(fallbackId))) return publicAssetUrl(`/api/profile/avatar/${encodeURIComponent(fallbackId)}`);
  return '';
}
function renderAvatar(person: any, extraClass = '') {
  const name = person?.name || person?.author || person?.userName || person?.user_name || 'FitPro';
  const fallback = initials(name);
  const avatarRaw = cachedAvatarFor(person);
  const src = normalizeAvatarSrc(avatarRaw, person);
  return src
    ? `<span class="avatar avatar-img ${extraClass}" title="${esc(name)}" data-avatar-state="persisted"><span class="avatar-fallback">${esc(fallback)}</span><img src="${esc(src)}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove();this.parentElement.classList.remove('avatar-img');this.parentElement.dataset.avatarState='fallback';"></span>`
    : `<span class="avatar ${extraClass}" title="${esc(name)}" data-avatar-state="fallback"><span class="avatar-fallback">${esc(fallback)}</span></span>`;
}
function isSuperRole(role = data?.user?.role || '') { return ['dev','super_admin'].includes(role); }
function isTrainerRole(role = data?.user?.role || '') { return ['trainer','admin'].includes(role); }
const devOnlyTabs = new Set(['agenda','automacoes','integracoes','logs','status','workspaces','tenant','marketplace','wearables']);
function canAccessTab(tabId = tab, role = data?.user?.role || '') {
  if (isSuperRole(role)) return true;
  if (devOnlyTabs.has(tabId)) return false;
  if (role === 'student' && ['solicitacoes','alunos','relatorios','leads','personais','codigos-ativacao','planos-plataforma','configuracoes'].includes(tabId)) return false;
  return true;
}

const WORKOUT_ACTIVE_TARGET_KEY = 'fitpro_elite_workout_active_target_v1';
type WorkoutActiveTarget = { studentId?: string; planId?: string; dayId?: string; dayLabel?: string; planTitle?: string; studentName?: string; updatedAt?: string };
function readWorkoutActiveTarget(): WorkoutActiveTarget | null {
  try { const raw = localStorage.getItem(WORKOUT_ACTIVE_TARGET_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeWorkoutActiveTarget(target: WorkoutActiveTarget | null) {
  try { target ? localStorage.setItem(WORKOUT_ACTIVE_TARGET_KEY, JSON.stringify({ ...target, updatedAt: new Date().toISOString() })) : localStorage.removeItem(WORKOUT_ACTIVE_TARGET_KEY); } catch {}
}
function studentNameById(id='') { return (data?.students || []).find((s:any) => s.id === id)?.name || ''; }
function planById(id='') { return ((data as any)?.workoutPlans || []).find((p:any) => p.id === id); }
function dayById(id='') {
  for (const plan of ((data as any)?.workoutPlans || [])) for (const day of (plan.days || [])) if (day.id === id) return { plan, day };
  return null;
}
function libraryExerciseByKey(key='') {
  const raw = decodeURIComponent(String(key || ''));
  return ((data as any)?.exerciseLibrary || []).find((e:any) => String(e.id || '') === raw || String(e.name || '').toLowerCase() === raw.toLowerCase()) || null;
}
function exerciseDefaultsFromLibrary(item:any = {}) {
  return {
    exerciseId: item.id && !String(item.id).startsWith('tpl_') ? item.id : null,
    name: item.name || 'Exercício',
    muscleGroup: item.muscleGroup || item.muscle_group || 'corpo todo',
    category: item.category || 'força',
    equipment: item.equipment || 'peso corporal',
    level: item.level || 'iniciante',
    sets: item.sets || '3',
    reps: item.reps || item.duration || '10-12',
    rest: item.rest || item.restSeconds || item.rest_seconds || '60s',
    load: item.load || '',
    notes: item.executionNotes || item.description || item.cautions || '',
    substitutions: item.substitutions || '',
    cautions: item.cautions || 'Ajustar conforme limite e histórico do aluno.',
    method: item.method || 'tradicional'
  };
}
function senderOf(senderId?: string) {
  return (data as any)?.users?.find((u:any) => u.id === senderId) || data?.students.find((s:any) => s.userId === senderId) || (senderId === data?.user.id ? data?.user : null);
}
function studentAvatar(student: any) { return renderAvatar(student || { name: 'Aluno' }); }
function statusClass(status: string) { return ['aprovado','ativo'].includes(status) ? 'ok' : ['recusado','cancelado','bloqueado','reembolsado','estornado','em_disputa'].includes(status) ? 'danger' : ['em_analise','solicitacao_enviada','aguardando_aprovacao'].includes(status) ? 'info' : 'warn'; }
function roleLabel(role: string) { return role === 'student' ? 'Aluno' : (role === 'admin' || role === 'trainer') ? 'Personal' : role === 'dev' ? 'Dev uPaiva' : 'Super Admin'; }
function normalizePhoneBR(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}
function whatsappTextForContext(kind = 'generic', targetName = '') {
  const userName = data?.user?.name || 'usuário FitPro';
  const target = targetName ? ` ${targetName}` : '';
  const messages: Record<string,string> = {
    student_to_trainer: `Olá${target}! Sou ${userName}, seu aluno pelo FitPro Elite. Quero falar sobre meu acompanhamento, treinos ou pagamentos.`,
    trainer_to_student: `Olá${target}! Aqui é ${userName}, seu personal pelo FitPro Elite. Quero alinhar seu acompanhamento e próximos passos.`,
    support_activation: `Olá, sou ${userName}. Preciso de suporte para ativar meu acesso de personal no FitPro Elite.`,
    support_student: `Olá, sou ${userName}. Preciso de suporte para escolher um personal e iniciar meu acompanhamento no FitPro Elite.`,
    payment: `Olá${target}! Sou ${userName} e quero falar sobre o pagamento pelo FitPro Elite.`,
    generic: `Olá! Vim pelo FitPro Elite.`
  };
  return messages[kind] || messages.generic;
}
function whatsappHref(phone = '', message = '') {
  const normalized = normalizePhoneBR(phone);
  if (!normalized) return '';
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message || whatsappTextForContext())}`;
}
function whatsappButton({ phone, label = 'WhatsApp', kind = 'generic', targetName = '', className = 'ghost small' }: { phone?: string; label?: string; kind?: string; targetName?: string; className?: string }) {
  const safePhone = normalizePhoneBR(phone || '');
  if (!safePhone) return `<button class="${className} whatsapp-missing" data-action="missing-whatsapp" data-target="${esc(targetName || 'contato')}">${esc(label)}</button>`;
  return `<button class="${className}" data-action="open-whatsapp" data-phone="${esc(safePhone)}" data-message="${esc(whatsappTextForContext(kind, targetName))}">${esc(label)}</button>`;
}
function currentStudent() { return data?.students.find(s => s.id === data?.user.studentId) || data?.students[0]; }
function trainerOf(id?: string) { return (data as any)?.trainers?.find((t:any) => t.id === id); }
function trainerPlansFor(trainerId?: string) { return ((data as any)?.trainerPlans || []).filter((p:any) => !trainerId || p.trainerId === trainerId || p.trainer_id === trainerId); }
function trainerPaymentSettingsFor(trainerId?: string) { const settings = (data as any)?.trainerPaymentSettings; if (Array.isArray(settings)) return settings.find((s:any) => !trainerId || s.trainerId === trainerId || s.trainer_id === trainerId); return settings; }
function studentHasApprovedTrainer(student?: any) { return Boolean(student?.trainerId && ['ativo','aprovado'].includes(String(student?.status || '')) && String(student?.requestStatus || student?.request_status || '') === 'aprovado'); }
function studentOnboardingState(student?: any) {
  if (!student) return { locked: true, stage: 'sem_aluno', title: 'Perfil não encontrado', detail: 'Entre novamente ou fale com suporte.' };
  if (studentHasApprovedTrainer(student)) return { locked: false, stage: 'acesso_liberado', title: 'Acesso liberado', detail: 'Seu acompanhamento está ativo.' };
  const requestStatus = String(student.requestStatus || student.request_status || 'sem_personal');
  if (requestStatus === 'aguardando_aprovacao') return { locked: true, stage: 'aguardando_aprovacao', title: 'Aguardando aprovação', detail: 'Sua solicitação foi enviada para o personal.' };
  if (requestStatus === 'recusado') return { locked: true, stage: 'recusado', title: 'Solicitação recusada', detail: 'Você pode escolher outro personal ou falar com suporte.' };
  return { locked: true, stage: 'sem_personal', title: 'Complete seu início no FitPro', detail: 'Escolha cidade, modalidade, personal e plano para começar.' };
}
function safeWorkspaceLabel(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const isSeedLeandro = /leandro performance/i.test(text);
  const userEmail = String(data?.user?.email || '').toLowerCase();
  if (isSeedLeandro && !userEmail.includes('leandro@')) return '';
  return text;
}
function workspaceDisplayName() {
  if (!data?.user) return 'FitPro Elite';
  const role = data.user.role;
  if (role === 'student') {
    const s = currentStudent();
    if (!studentHasApprovedTrainer(s)) return studentOnboardingState(s).stage === 'aguardando_aprovacao' ? 'Aguardando aprovação' : 'Início do acompanhamento';
    const trainer = trainerOf(s?.trainerId);
    return safeWorkspaceLabel(trainer?.brandName) || trainer?.name || 'Personal';
  }
  if (isTrainerRole(role)) {
    const trainer = (data as any)?.trainers?.find((t:any) => t.id === data!.user.trainerId || t.userId === data!.user.id || t.user_id === data!.user.id);
    return safeWorkspaceLabel(trainer?.brandName) || trainer?.name || data.user.name || 'Personal';
  }
  if (isSuperRole(role)) return 'Dev/Super Admin';
  return 'FitPro Elite';
}
function appBrandName() {
  const display = workspaceDisplayName();
  return display === 'FitPro Elite' ? 'FitPro Elite' : `FitPro Elite • ${display}`;
}
function pageTitle() {
  if (!data?.user) return 'FitPro Elite';
  const display = workspaceDisplayName();
  return display === 'FitPro Elite' ? 'FitPro Elite' : `FitPro Elite • ${display}`;
}

function planOf(id?: string) { return data?.plans.find(p => p.id === id); }
function studentOf(id?: string) { return data?.students.find(s => s.id === id); }
function toast(message: string) {
  toastRoot.innerHTML = `<div class="toast">${esc(message)}</div>`;
  window.setTimeout(() => { toastRoot.innerHTML = ''; }, 3500);
}
function apiHealthLabel() {
  if (apiHealth.status === 'online') return `Online${apiHealth.latencyMs ? ` • ${apiHealth.latencyMs}ms` : ''}`;
  if (apiHealth.status === 'slow') return `Instável${apiHealth.latencyMs ? ` • ${apiHealth.latencyMs}ms` : ''}`;
  if (apiHealth.status === 'offline') return 'Offline';
  return 'Verificando';
}
function apiHealthClass() { return apiHealth.status === 'online' ? 'ok' : apiHealth.status === 'slow' ? 'warn' : apiHealth.status === 'offline' ? 'danger' : 'info'; }
async function checkApiHealth(showToast = false) {
  const started = performance.now();
  apiHealth = { status: 'checking' };
  try {
    const response = await fetch(apiUrl('/health'), { cache: 'no-store', credentials: 'include' });
    const latencyMs = Math.round(performance.now() - started);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json().catch(() => ({}));
    apiHealth = { status: latencyMs > 1800 ? 'slow' : 'online', latencyMs, checkedAt: new Date().toISOString(), env: payload.env || '', app: payload.app || 'FitPro API' };
    if (showToast) toast(`API ${apiHealthLabel()}.`);
  } catch (error) {
    apiHealth = { status: 'offline', checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : 'Falha de conexão' };
    if (showToast) toast('API offline ou indisponível no /health.');
  }
}
async function reload() { data = adoptBootstrap(await api<Bootstrap>('/api/bootstrap')); document.documentElement.style.setProperty('--primary', data.settings.primaryColor || '#00e676'); }
async function bootstrap() {
  await checkApiHealth(false);
  if (!getToken()) { view = 'landing'; render(); openInitialLegalPath(); return; }
  try { loading = true; render(); await reload(); view = 'app'; } catch { clearToken(); view = 'landing'; } finally { loading = false; render(); openInitialLegalPath(); }
}
function openModal(type: string, payload?: any) { modal = { type, payload }; renderModal(); }
function closeModal() { modal = null; renderModal(); }
function openInitialLegalPath() {
  const slug = location.pathname.replace(/^\//, '').replace(/\/$/, '');
  if (legalPaths.has(slug)) openModal('legal', slug === 'aviso-de-saude' ? 'responsabilidade' : slug);
}
async function action(fn: () => Promise<void>, ok = 'Ação realizada.') {
  try { await fn(); toast(ok); } catch (e) { toast(e instanceof Error ? e.message : 'Erro ao executar ação.'); }
}


const COOKIE_PREF_KEY = 'fitpro_cookie_consent_v1';
type CookiePrefs = { necessary: true; functional: boolean; analytics: boolean; thirdParty: boolean; updatedAt: string };
function readCookiePrefs(): CookiePrefs | null { try { return JSON.parse(localStorage.getItem(COOKIE_PREF_KEY) || 'null'); } catch { return null; } }
function saveCookiePrefs(prefs: Partial<CookiePrefs>) { const next: CookiePrefs = { necessary: true, functional: Boolean(prefs.functional), analytics: Boolean(prefs.analytics), thirdParty: Boolean(prefs.thirdParty), updatedAt: new Date().toISOString() }; localStorage.setItem(COOKIE_PREF_KEY, JSON.stringify(next)); return next; }
function renderCookieBanner() {
  if (readCookiePrefs()) return '';
  return `<div class="cookie-banner"><div><b>Cookies e privacidade</b><p>Usamos cookies necessários para funcionamento e, com sua autorização, cookies para melhorar sua experiência e analisar o uso.</p></div><div class="modal-actions"><button class="primary small" data-action="accept-cookies">Aceitar todos</button><button class="ghost small" data-action="reject-cookies">Rejeitar não necessários</button><button class="ghost small" data-modal="legal" data-id="cookies">Personalizar</button></div></div>`;
}


function paymentReturnInfo() {
  const slug = location.pathname.replace(/^\//, '').replace(/\/$/, '');
  if (!slug.startsWith('pagamento/')) return null;
  const kind = slug.split('/')[1] || '';
  const map:any = {
    sucesso: { icon: '✅', title: 'Pagamento enviado com sucesso', message: 'O Mercado Pago confirmou o retorno positivo. O status final ainda será validado pelo webhook seguro no backend.' },
    erro: { icon: '⚠️', title: 'Pagamento não concluído', message: 'O pagamento não foi finalizado. Você pode voltar ao app e tentar novamente ou falar com seu personal.' },
    pendente: { icon: '🟡', title: 'Pagamento pendente', message: 'O Mercado Pago recebeu a tentativa, mas ainda não confirmou aprovação. Aguarde a atualização automática pelo webhook.' }
  };
  return map[kind] || null;
}
function renderPaymentReturn(info:any) {
  return `<main class="center-screen payment-return-page"><section class="auth-card wide-card payment-return-card">${renderFitProLogo('compact', 'payment-logo')}<div class="payment-return-icon">${info.icon}</div><h1>${esc(info.title)}</h1><p>${esc(info.message)}</p><div class="quick-grid"><button class="primary" data-view="login">Entrar no FitPro</button><button class="ghost" data-view="landing">Voltar para início</button></div><p class="notice">A liberação de acesso acontece somente após confirmação do webhook Mercado Pago no backend/Railway. Nenhum token é exposto nesta tela.</p></section></main>${renderFooter()}`;
}

function render() {
  document.title = pageTitle();
  if (loading) { app.innerHTML = renderLoading(); return; }
  const payReturn = paymentReturnInfo();
  if (payReturn && view === 'landing') app.innerHTML = renderPaymentReturn(payReturn);
  else if (view === 'landing') app.innerHTML = renderLanding();
  if (view === 'login') app.innerHTML = renderLogin();
  if (view === 'register') app.innerHTML = renderRegister();
  if (view === 'app') app.innerHTML = data ? renderShell() : renderLoading();
  app.insertAdjacentHTML('beforeend', renderCookieBanner());
  bindEvents();
  renderModal();
}

function renderLoading() { return `<main class="center-screen"><div class="loader-card brand-loader">${renderFitProLogo('stacked')}<h2>Carregando FitPro Elite</h2><p>Conectando API, banco e permissões...</p></div></main>`; }

function renderLanding() {
  return html`
  <main class="landing">
    <section class="hero">
      <div class="topbar"><div class="brand">${renderFitProLogo('horizontal')}</div><div class="top-actions"><button data-view="login" class="ghost">Entrar</button><button data-view="register" class="primary">Criar conta</button></div></div>
      <div class="hero-grid">
        <div>
          <span class="eyebrow">SaaS fitness fullstack • produção Vercel + Railway</span>
          <h1>Aluno entrando, pagando, treinando e sendo acompanhado de verdade.</h1>
          <p>Base premium com backend, banco, autenticação, roles, uploads privados, pagamentos manuais, logs e painéis para aluno, personal e dev/super admin.</p>
          <div class="hero-actions"><button data-view="register" class="primary big">Criar conta de aluno</button><button data-view="login" class="ghost big">Entrar</button></div>
          <div class="production-note"><b>Produto real:</b> aluno solicita acompanhamento, personal aprova e o dev gerencia a plataforma.</div>
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

function renderFitProLogo(mode: 'horizontal' | 'compact' | 'stacked' = 'horizontal', extraClass = '') {
  const isCompact = mode === 'compact';
  const text = isCompact ? '' : `<span class="fitpro-logo-text"><b><span>FitPro</span> <em>Elite</em></b><small>TRAIN. TRACK. TRANSFORM.</small></span>`;
  return `<span class="fitpro-logo fitpro-logo-${mode} ${extraClass}" aria-label="FitPro Elite">
    <svg class="fitpro-logo-svg fp-reference-logo fp-s34-logo" viewBox="0 0 360 190" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="fp34Green" x1="18%" y1="6%" x2="88%" y2="96%"><stop offset="0%" stop-color="#f3fff8"/><stop offset="18%" stop-color="#9dffd6"/><stop offset="52%" stop-color="#12ef88"/><stop offset="78%" stop-color="#02b86d"/><stop offset="100%" stop-color="#064e3b"/></linearGradient>
        <linearGradient id="fp34Top" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#ffffff" stop-opacity=".95"/><stop offset="44%" stop-color="#bcffe5" stop-opacity=".9"/><stop offset="100%" stop-color="#14e684" stop-opacity=".78"/></linearGradient>
        <linearGradient id="fp34Edge" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity=".92"/><stop offset="62%" stop-color="#86efac" stop-opacity=".45"/><stop offset="100%" stop-color="#00e676" stop-opacity="0"/></linearGradient>
        <radialGradient id="fp34Halo" cx="48%" cy="43%" r="66%"><stop offset="0%" stop-color="#00f08a" stop-opacity=".54"/><stop offset="48%" stop-color="#00e676" stop-opacity=".16"/><stop offset="100%" stop-color="#020617" stop-opacity="0"/></radialGradient>
        <filter id="fp34Glow" x="-42%" y="-50%" width="200%" height="220%"><feGaussianBlur stdDeviation="6" result="blur"/><feColorMatrix in="blur" type="matrix" values="0 0 0 0 0  0 0 0 0 .95  0 0 0 0 .44  0 0 0 .82 0" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="fp34Depth" x="-18%" y="-22%" width="145%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="4" flood-color="#000" flood-opacity=".54"/><feDropShadow dx="0" dy="-2" stdDeviation="1.2" flood-color="#fff" flood-opacity=".24"/></filter>
      </defs>
      <ellipse class="fp34-halo" cx="176" cy="96" rx="148" ry="82" fill="url(#fp34Halo)"/>
      <g class="fp34-motion-trails" aria-hidden="true">
        <path class="fp34-trail fp34-trail-1" d="M18 59 H122 C149 59 168 55 194 45"/>
        <path class="fp34-trail fp34-trail-2" d="M0 88 H142 C174 88 206 81 248 67"/>
        <path class="fp34-trail fp34-trail-3" d="M25 119 H129 C164 119 202 118 256 102"/>
        <path class="fp34-trail fp34-trail-4" d="M48 146 H145 C181 146 216 141 268 126"/>
      </g>
      <path class="fp34-energy-ring" d="M80 52 C113 17 192 8 255 39 C304 63 316 119 270 153 C224 188 125 183 74 140 C36 108 42 72 80 52Z"/>
      <g class="fp34-symbol" filter="url(#fp34Glow)">
        <path class="fp34-shadow" d="M58 150 L89 43 H226 C265 43 292 61 292 90 C292 119 266 138 220 140 L164 141 L154 164 H110 L118 141 H58 Z"/>
        <path class="fp34-mark" d="M46 150 L79 45 H226 C260 45 287 61 287 89 C287 118 261 134 214 134 H151 L143 161 H100 L109 134 H53 L65 98 H121 L128 75 H61 L70 45 H46 L35 75 H58 L30 150 Z" filter="url(#fp34Depth)"/>
        <path class="fp34-upper-slab" d="M82 45 H226 C259 45 283 60 287 84 L147 84 L134 122 H121 L128 75 H72 Z"/>
        <path class="fp34-open-bowl" d="M145 84 H220 C239 84 251 91 250 103 C249 119 232 126 202 126 H132 Z"/>
        <path class="fp34-inner-cut" d="M171 101 H218 C226 101 231 104 231 109 C230 115 222 118 207 118 H161 Z"/>
        <path class="fp34-f-cross" d="M60 99 H202"/>
        <path class="fp34-front-edge" d="M81 45 H225 C254 45 279 58 286 82"/>
        <path class="fp34-lower-edge" d="M44 150 H149"/>
        <path class="fp34-heart" d="M86 128 H118 L130 108 L139 153 L155 113 L168 128 H213"/>
        <rect class="fp34-light-sweep" x="48" y="29" width="42" height="142" rx="20"/>
      </g>
    </svg>${text}</span>`;
}

function hardenAvatarBootstrap(bootstrap: Bootstrap, avatarUrl = '') {
  const incomingUser = bootstrap.user || data?.user;
  if (!incomingUser) return bootstrap;
  const previousUser = data?.user?.id === incomingUser.id ? data.user : null;
  const cached = readAvatarCache()[incomingUser.id] || '';
  const avatar = avatarUrl || incomingUser.avatar || previousUser?.avatar || cached || '';
  if (!avatar) return bootstrap;
  cacheAvatar(incomingUser.id, avatar);
  const patched: Bootstrap = { ...bootstrap, user: { ...bootstrap.user, avatar } };
  patched.users = (bootstrap.users || []).map((u:any) => u.id === incomingUser.id ? { ...u, avatar } : { ...u, avatar: rawAvatarOf(u) || readAvatarCache()[u.id] || '' });
  if (incomingUser.studentId) patched.students = (bootstrap.students || []).map((st:any) => (st.id === incomingUser.studentId || st.userId === incomingUser.id || st.user_id === incomingUser.id) ? { ...st, avatar, avatarUrl: avatar, avatar_url: avatar } : st);
  if (incomingUser.trainerId) patched.trainers = ((bootstrap as any).trainers || []).map((tr:any) => (tr.id === incomingUser.trainerId || tr.userId === incomingUser.id || tr.user_id === incomingUser.id) ? { ...tr, avatar, avatarUrl: avatar, avatar_url: avatar } : tr);
  patched.posts = (bootstrap.posts || []).map((post:any) => ({
    ...post,
    comments: (post.comments || []).map((comment:any) => comment?.userId === incomingUser.id || comment?.user_id === incomingUser.id ? { ...comment, avatar } : comment),
    reactions: (post.reactions || []).map((reaction:any) => reaction?.userId === incomingUser.id || reaction?.user_id === incomingUser.id ? { ...reaction, userAvatar: avatar, user_avatar: avatar } : reaction)
  }));
  return patched;
}
function adoptBootstrap(bootstrap: Bootstrap, avatarUrl = '') {
  if (!bootstrap) return bootstrap;
  const guarded = hardenAvatarBootstrap(bootstrap, avatarUrl);
  if (guarded.user?.avatar) cacheAvatar(guarded.user.id, guarded.user.avatar);
  (guarded.users || []).forEach((u:any) => { const av = rawAvatarOf(u); if (av) cacheAvatar(u.id, av); });
  return guarded;
}

function renderLogin() { return html`<main class="center-screen"><form class="auth-card auth-card-premium" data-form="login"><button type="button" data-view="landing" class="close-x">×</button>${renderFitProLogo('stacked', 'auth-logo')}<h1>Entrar no FitPro</h1><p>Use sua conta de aluno, personal ou Dev/Super Admin. O sistema redireciona por permissão e mantém secrets somente no backend.</p><label>E-mail<input name="email" type="email" autocomplete="email" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" required></label><button class="primary wide">Entrar</button><button type="button" data-view="register" class="ghost wide">Criar conta FitPro</button></form></main>`; }
function renderRegister() {
  if (registerMode === 'choice') return html`<main class="center-screen"><section class="auth-card wide-card account-choice"><button type="button" data-view="landing" class="close-x">×</button>${renderFitProLogo('stacked', 'auth-logo')}<h1>Criar conta FitPro</h1><p>Escolha como você quer usar a plataforma. O fluxo do aluno continua com onboarding; o personal escolhe plano ou código de ativação.</p><div class="choice-grid"><button type="button" class="choice-card" data-register-mode="student"><span>🏋️</span><b>Sou aluno</b><small>Quero treinar com acompanhamento de um personal.</small></button><button type="button" class="choice-card featured" data-register-mode="trainer"><span>🧑‍🏫</span><b>Sou personal</b><small>Quero gerenciar alunos, treinos, pagamentos e evolução.</small></button></div><p class="notice">Nada de modo demo público: cadastro real, permissões reais e onboarding adequado para cada perfil.</p></section></main>`;
  if (registerMode === 'trainer') return html`<main class="center-screen"><form class="auth-card wide-card" data-form="register"><input type="hidden" name="accountType" value="trainer"><button type="button" data-register-mode="choice" class="close-x">×</button>${renderFitProLogo('stacked', 'auth-logo')}<h1>Cadastro do personal</h1><p>Crie sua conta profissional e finalize a ativação com plano FitPro Start/Plus ou código fornecido pela equipe FitPro/uPaiva.</p><div class="form-grid"><label>Nome completo<input name="name" required></label><label>Nome profissional / marca<input name="brandName" placeholder="Ex.: Leandro Performance"></label><label>E-mail<input name="email" type="email" required></label><label>WhatsApp<input name="phone" required></label><label>Cidade<input name="city" required></label><label>Estado<input name="state" maxlength="2" placeholder="MG"></label><label>Modalidade<select name="modalities"><option value="online">Online</option><option value="presencial">Presencial</option><option value="hibrido">Híbrido</option></select></label><label>Especialidades<input name="specialty" placeholder="Hipertrofia, emagrecimento, performance"></label><label>Área de atuação<input name="serviceArea" placeholder="Cidade, bairros ou online"></label><label>Plano inicial<select name="platformPlanCode"><option value="fitpro_start">FitPro Start — R$ 49,99/mês</option><option value="fitpro_plus">FitPro Plus — R$ 149,99/mês</option></select></label><label>Senha<input name="password" type="password" required minlength="6"></label></div><label>Bio profissional<textarea name="bio" placeholder="Conte seu método, público atendido e diferenciais."></textarea></label><div class="checks"><label><input type="checkbox" name="terms" required> Aceito os termos</label><label><input type="checkbox" name="lgpd" required> Autorizo tratamento de dados LGPD</label></div><p class="notice">Após o cadastro, você acessa apenas ativação, plano, código, suporte e saída até ter plano/código ativo.</p><button class="primary wide">Criar conta de personal</button><button type="button" data-register-mode="student" class="ghost wide">Quero criar conta de aluno</button></form></main>`;
  return html`<main class="center-screen"><form class="auth-card wide-card" data-form="register"><input type="hidden" name="accountType" value="student"><button type="button" data-register-mode="choice" class="close-x">×</button>${renderFitProLogo('stacked', 'auth-logo')}<h1>Cadastro do aluno</h1><p>Crie sua conta e depois complete cidade, modalidade, personal e plano no onboarding. Você não cairá em dashboard com dados falsos.</p><div class="form-grid"><label>Nome completo<input name="name" required></label><label>E-mail<input name="email" type="email" required></label><label>WhatsApp<input name="phone"></label><label>Cidade<input name="city" required></label><label>Estado<input name="state" maxlength="2" placeholder="MG"></label><label>Bairro opcional<input name="neighborhood"></label><label>Objetivo<input name="goal" required></label><label>Modalidade<select name="modality"><option value="online">Online</option><option value="presencial">Presencial</option><option value="hibrido">Híbrido</option></select></label><label>Local de treino<select name="trainingPlace"><option>Academia</option><option>Casa</option><option>Ar livre</option><option>A combinar</option></select></label><label>Disponibilidade<input name="availability" placeholder="Ex: Noite, seg/qua/sex"></label><label>Nascimento<input name="birthdate" type="date"></label><label>Altura<input name="height" type="number" step="0.01"></label><label>Peso inicial<input name="weight" type="number" step="0.1"></label><label>Nível<select name="level"><option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option><option value="retorno">Retorno após pausa</option></select></label><label>Pagamento futuro<select name="paymentMethod"><option value="pix_manual">Pix do personal</option><option value="combinar_personal">Combinar com personal</option></select></label><label>Senha<input name="password" type="password" required minlength="6"></label></div><label>Mensagem para o personal<textarea name="requestMessage" placeholder="Conte sua rotina, objetivo e restrições principais."></textarea></label><label>Restrições/observações de saúde<textarea name="restrictions"></textarea></label><div class="checks"><label><input type="checkbox" name="terms" required> Aceito os termos</label><label><input type="checkbox" name="lgpd" required> Autorizo tratamento de dados LGPD</label><label><input type="checkbox" name="photos"> Autorizo armazenamento de fotos de evolução</label><label><input type="checkbox" name="notifications"> Quero receber notificações</label></div><p class="notice">Após o cadastro, você escolhe personal e aguarda aprovação. Sem treino, desafio ou progresso fake.</p><button class="primary wide">Criar conta de aluno</button><button type="button" data-register-mode="trainer" class="ghost wide">Sou personal</button></form></main>`;
}

function renderShell() {
  const user = data!.user;
  const nav = navByRole[user.role] || navByRole.admin;
  if (!nav.some(n => n.id === tab)) tab = 'dashboard';
  return html`
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand sidebar-brand">${renderFitProLogo('horizontal', 'sidebar-logo')}<small>${esc(data!.settings.plan)} • ${esc(data!.settings.status)}</small></div>
      <nav>${nav.map(n => `<button class="nav-btn ${tab===n.id?'active':''}" data-tab="${n.id}"><span>${n.icon}</span>${n.label}</button>`).join('')}</nav>
      <div class="user-box">${renderAvatar(user)}<div><b>${esc(user.name)}</b><small>${roleLabel(user.role)}</small></div><button class="icon-btn" data-action="logout">Sair</button></div>
    </aside>
    <main class="main">
      <header class="app-header"><div><span class="eyebrow">${esc(appBrandName())}</span><h1>${titleForTab(tab)}</h1></div><div class="header-actions"><span class="api-mini ${apiHealthClass()}">API ${apiHealthLabel()}</span><button class="ghost" data-action="whatsapp">WhatsApp</button><button class="ghost" data-modal="ai-assistant">Assistente IA</button><button class="primary" data-modal="quick-action">Ação rápida</button></div></header>
      ${renderTab()}
      ${renderFloatingAssistant()}
      ${renderFooter()}
    </main>
    <nav class="bottom-nav">${nav.slice(0,5).map(n => `<button class="${tab===n.id?'active':''}" data-tab="${n.id}"><span>${n.icon}</span><small>${n.label}</small></button>`).join('')}</nav>
  </div>`;
}
function titleForTab(id: string) { const item = [...navByRole.student, ...navByRole.admin, ...navByRole.super_admin].find(n => n.id === id); return item?.label || 'Dashboard'; }
function trainerPlatformActive() {
  const sub = currentPlatformSubscription();
  if (!['trainer','admin'].includes(data?.user.role || '')) return true;
  if (!sub) return false;
  const status = String(sub.status || '').toLowerCase();
  const expires = sub.expiresAt || sub.expires_at || sub.dueDate || sub.due_date;
  const expired = expires ? new Date(expires).getTime() < Date.now() : false;
  // Sprint 19.1: trial/teste precisam liberar o painel enquanto não expirados.
  // O usuário Leandro seeded usa status "trial" para teste guiado; tratar como bloqueado
  // fazia todos os itens do menu parecerem quebrados. Status pendente/inadimplente continuam bloqueados.
  return ['ativo','active','aprovado','trial','teste','provisorio'].includes(status) && !expired;
}
function renderPersonalActivationGate() {
  const sub = currentPlatformSubscription();
  return panel('Finalize sua ativação FitPro', '', `<section class="card hero-card activation-gate">${renderFitProLogo('horizontal')}<span class="eyebrow">Plano do personal</span><h2>Finalize sua ativação para liberar o painel do personal.</h2><p>Você pode escolher FitPro Start/Plus e pagar via Mercado Pago, ou usar um código de ativação fornecido pelo FitPro/uPaiva.</p>${sub ? `<div class="info-grid"><span>Status<b>${statusLabel(sub.status || '')}</b></span><span>Plano<b>${esc(sub.planName || '-')}</b></span><span>Expira/vencimento<b>${dateBR(sub.expiresAt || sub.dueDate)}</b></span></div>` : ''}<div class="modal-actions"><button class="primary" data-tab="planos-plataforma">Ver planos</button><button class="ghost" data-modal="redeem-activation-code">Tenho um código de ativação</button><button class="ghost" data-action="whatsapp-support">Falar com suporte</button></div></section>`);
}
function renderTab() {
  if (!data) return '';
  const role = data.user.role;
  if (!canAccessTab(tab, role)) return renderRestrictedAccess(tab);
  if (role === 'student') {
    const st = studentOnboardingState(currentStudent());
    const allowedWhileLocked = ['dashboard','jornada','perfil','ajuda','pagamentos','habitos'];
    if (st.locked && !allowedWhileLocked.includes(tab)) return renderStudentOnboardingGate();
    if (st.locked && (tab === 'dashboard' || tab === 'jornada')) return renderStudentOnboardingGate();
  }
  if (['trainer','admin'].includes(role)) {
    const allowedWhileInactive = ['planos-plataforma','perfil','ajuda','configuracoes'];
    if (!trainerPlatformActive() && !allowedWhileInactive.includes(tab)) return renderPersonalActivationGate();
  }
  if (tab === 'dashboard') return role === 'student' ? renderStudentDashboard() : renderAdminDashboard();
  if (tab === 'coach') return renderInvisibleCoach();
  if (tab === 'solicitacoes') return renderStudentRequests();
  if (tab === 'alunos') return renderStudents();
  if (tab === 'jornada') return renderStudentJourney();
  if (tab === 'treinos') return renderWorkouts();
  if (tab === 'agenda') return renderSchedules();
  if (tab === 'avaliacoes') return renderAssessments();
  if (tab === 'pagamentos') return renderPayments();
  if (tab === 'planos-plataforma') return renderPlatformPlans();
  if (tab === 'codigos-ativacao') return renderPlatformPlans();
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
  if (tab === 'status') return renderSystemStatus();
  if (tab === 'tenant') return renderTenantBranding();
  if (tab === 'marketplace') return renderMarketplace();
  if (tab === 'wearables') return renderWearables();
  if (tab === 'personais') return renderPersonalManagement();
  if (tab === 'workspaces') return renderWorkspaces();
  if (tab === 'sorteios') return renderGiveaways();
  return renderHelp();
}


function renderRestrictedAccess(moduleId = '') {
  const label = titleForTab(moduleId);
  return panel('Acesso restrito', '', `<section class="card hero-card restricted-card"><span class="eyebrow">Permissão por perfil</span><h2>Acesso restrito. Este módulo é exclusivo do painel Dev/Super Admin.</h2><p>O módulo <b>${esc(label)}</b> continua existindo no projeto, mas foi removido dos dashboards de Personal e Aluno para reduzir ruído visual e proteger áreas técnicas.</p><div class="modal-actions"><button class="primary" data-tab="dashboard">Voltar para visão geral</button><button class="ghost" data-modal="ai-assistant">Pedir ajuda</button></div></section>`);
}


function workoutToday() { return data!.workouts[0]; }
function paymentStatusSummary(studentId?: string) { return data!.payments.find(p => !studentId || p.studentId === studentId); }
function challengeMain() { return data!.challenges[0]; }
function challengeProgress(studentId?: string) {
  const ch = challengeMain();
  const pt = studentId ? ch?.participants?.find((p:any) => p.studentId === studentId) : ch?.participants?.[0];
  return { challenge: ch, participant: pt, percent: pt ? Math.round(((pt?.progress || 0) / (ch?.target || 1)) * 100) : 0, points: pt?.points || 0 };
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

function calcBMI(weight?: any, height?: any) {
  const w = Number(weight || 0); const h = Number(height || 0);
  if (!w || !h) return { value: 0, label: 'Dados insuficientes' };
  const value = Number((w / (h*h)).toFixed(1));
  const label = value < 18.5 ? 'Abaixo do peso' : value < 25 ? 'Faixa geral adequada' : value < 30 ? 'Sobrepeso' : 'Obesidade';
  return { value, label };
}
function fitnessThumb(category = 'treino') {
  const map: Record<string,string> = { mobilidade:'🧘', alongamento:'🤸', receitas:'🥗', suplementacao:'💊', motivacao:'🔥', lives:'🎥', treino:'🏋️', técnica:'🎯', cardio:'❤️' };
  const key = String(category || '').toLowerCase();
  return map[key] || '🏋️';
}
function reactionSummary(post:any) {
  const reactions = post.reactions || post.reactionsJson || {};
  if (!reactions || typeof reactions !== 'object') return '';
  return Object.entries(reactions).map(([k,v]:any) => `<span class="reaction-chip">${esc(k)} ${Array.isArray(v) ? v.length : 0}</span>`).join('');
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

function renderStudentOnboardingGate() {
  const s = currentStudent();
  const state = studentOnboardingState(s);
  const trainers = ((data as any)?.trainers || []).filter((t:any) => Number(t.active ?? 1) === 1);
  const requestedTrainer = trainerOf(s?.trainerId || s?.requestedTrainerId);
  const plansForRequested = trainerPlansFor(requestedTrainer?.id);
  const city = String(s?.city || '').split('/')[0].trim();
  const stateUf = s?.state || (String(s?.city || '').includes('/') ? String(s?.city || '').split('/').pop()?.trim() : '');
  const matched = trainers.filter((t:any) => {
    const modality = String(s?.modality || 'online').toLowerCase();
    const tModalities = String(t.modalities || 'online,hibrido').toLowerCase();
    const sameCity = city && String(t.city || '').toLowerCase().includes(city.toLowerCase());
    const sameState = stateUf && String(t.state || '').toLowerCase().includes(String(stateUf).toLowerCase());
    return modality === 'online' || tModalities.includes('online') || sameCity || sameState;
  });
  const steps = [
    ['Conta criada', true], ['Perfil básico preenchido', Boolean(s?.city || s?.goal)], ['Cidade selecionada', Boolean(s?.city && (s?.state || String(s?.city).includes('/')))], ['Personal escolhido', Boolean(s?.trainerId || s?.requestedTrainerId)], ['Solicitação enviada', ['aguardando_aprovacao','aprovado'].includes(String(s?.requestStatus || s?.request_status))], ['Aguardando aprovação', String(s?.requestStatus || s?.request_status) === 'aguardando_aprovacao'], ['Plano/pagamento', Boolean(s?.requestedTrainerPlanId || s?.planId)], ['Acesso liberado', studentHasApprovedTrainer(s)]
  ];
  const statusCard = state.stage === 'aguardando_aprovacao' && requestedTrainer ? `<article class="card hero-card"><span class="eyebrow">Solicitação enviada</span><h2>Sua solicitação foi enviada para ${esc(requestedTrainer.brandName || requestedTrainer.name)}</h2><p>O personal vai analisar seus dados antes de liberar dashboard, treino, comunidade e pagamentos completos.</p><div class="info-grid vertical"><span>Personal<b>${esc(requestedTrainer.name)}</b></span><span>Plano desejado<b>${esc(plansForRequested.find((p:any)=>p.id===s?.requestedTrainerPlanId)?.name || 'A combinar')}</b></span><span>Cidade<b>${esc(s?.city || '-')} ${esc(s?.state || '')}</b></span><span>Status<b>${statusLabel(s?.requestStatus || 'aguardando_aprovacao')}</b></span></div><div class="modal-actions"><button class="ghost" data-action="cancel-onboarding-request">Cancelar solicitação</button>${whatsappButton({ phone: requestedTrainer.whatsapp || requestedTrainer.phone, label: 'Chamar no WhatsApp', kind: 'student_to_trainer', targetName: requestedTrainer.name, className: 'primary' })}</div></article>` : '';
  const trainerCards = (matched.length ? matched : trainers).map((t:any) => {
    const plans = trainerPlansFor(t.id);
    const cheapest = plans.slice().sort((a:any,b:any)=>Number(a.price)-Number(b.price))[0];
    return `<article class="card trainer-card">${renderAvatar(t, 'profile-avatar')}<span class="badge ${String(t.modalities||'online').includes('online')?'ok':'info'}">${esc(t.modalities || 'online')}</span><h3>${esc(t.brandName || t.name)}</h3><p>${esc(t.bio || t.specialty || 'Personal FitPro Elite')}</p><div class="info-grid vertical"><span>Cidade/UF<b>${esc(t.city || 'Online')} ${esc(t.state || '')}</b></span><span>Especialidades<b>${esc(t.specialty || '-')}</b></span><span>Planos a partir de<b>${cheapest ? money(cheapest.price) : 'A combinar'}</b></span><span>Vagas<b>${esc(t.maxStudents || 'sob consulta')}</b></span></div><form data-form="onboarding-request" class="mini-form"><input type="hidden" name="trainerId" value="${esc(t.id)}"><input type="hidden" name="city" value="${esc(city || s?.city || '')}"><input type="hidden" name="state" value="${esc(stateUf || s?.state || '')}"><input type="hidden" name="modality" value="${esc(s?.modality || 'online')}"><input type="hidden" name="goal" value="${esc(s?.goal || '')}"><input type="hidden" name="level" value="${esc(s?.level || 'iniciante')}"><label>Plano do personal<select name="trainerPlanId">${plans.map((p:any)=>`<option value="${esc(p.id)}">${esc(p.name)} — ${money(p.price)}</option>`).join('') || '<option value="">A combinar</option>'}</select></label><label>Mensagem opcional<textarea name="message" placeholder="Conte sua rotina, horários e objetivo."></textarea></label><button class="primary wide">Solicitar acompanhamento</button></form>${whatsappButton({ phone: t.whatsapp || t.phone, label: 'Chamar no WhatsApp', kind: 'student_to_trainer', targetName: t.name, className: 'ghost wide' })}</article>`;
  }).join('');
  return panel('Complete seu início no FitPro', '', `<section class="onboarding-hero card"><span class="eyebrow">${esc(state.title)}</span><h2>${esc(state.detail)}</h2><p>Nenhum treino, desafio, pódio, check-in ou dado do personal será exibido até o vínculo ser aprovado.</p><div class="journey-map compact">${steps.map(([label,done], i)=>`<div class="journey-step ${done?'done':''}"><span>${done?'✅':i+1}</span><h3>${esc(label)}</h3></div>`).join('')}</div></section>${statusCard}<section class="card"><h3>Encontre seu personal</h3><p>Informe seus dados e selecione um profissional disponível na sua região ou online.</p><form data-form="onboarding-preferences" class="form-grid"><label>Estado / UF<input name="state" maxlength="2" value="${esc(stateUf || '')}" placeholder="MG"></label><label>Cidade<input name="city" value="${esc(city || '')}" placeholder="Poços de Caldas"></label><label>Modalidade<select name="modality"><option ${s?.modality==='presencial'?'selected':''} value="presencial">Presencial</option><option ${s?.modality==='online'?'selected':''} value="online">Online</option><option ${s?.modality==='hibrido'?'selected':''} value="hibrido">Híbrido</option></select></label><label>Objetivo<select name="goal">${objectiveOptions.map(o=>`<option ${s?.goal===o?'selected':''} value="${esc(o)}">${esc(o)}</option>`).join('')}</select></label><label>Nível<select name="level"><option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option><option value="retorno">Retorno após pausa</option></select></label><button class="ghost">Atualizar filtro</button></form></section><div class="cards-grid trainer-choice-grid">${trainerCards || `<article class="card empty-card"><h3>Ainda não encontramos personais cadastrados para sua cidade.</h3><p>Você pode ver personais online, entrar em lista de espera ou falar com suporte.</p><div class="modal-actions"><button class="ghost">Ver personais online</button>${whatsappButton({ phone: data!.settings.whatsapp || '', label: 'Falar com suporte', kind: 'support_student', className: 'primary' })}</div></article>`}</div>`);
}

function renderStudentJourney() {
  const s = currentStudent();
  const state = studentOnboardingState(s);
  if (state.locked) return renderStudentOnboardingGate();
  const progress = challengeProgress(s?.id);
  const hasWorkout = data!.workouts.some(w => w.studentId === s?.id || !w.studentId);
  const steps = [
    ['Cadastro', 'Conta criada e consentimentos aceitos', true], ['Personal aprovado', 'Vínculo liberado pelo personal', true], ['Primeira avaliação', 'Registre sua linha base', data!.assessments.length > 0], ['Treino provisório', hasWorkout ? 'Treino liberado' : 'Aguardando liberação do personal', hasWorkout], ['Check-ins', progress.percent > 0 ? 'Progresso real registrado' : 'Ainda sem check-ins aprovados', progress.percent > 0], ['Pódio', 'Ranking aparece apenas com pontos reais', progress.percent >= 50]
  ];
  return panel('Jornada do Aluno', '', `<section class="journey-map">${steps.map(([title,desc,done],i) => `<div class="journey-step ${done?'done':''}"><span>${done?'✅':i+1}</span><h3>${esc(title)}</h3><p>${esc(desc)}</p></div>`).join('')}</section><article class="card"><h3>Temporada Fitness</h3><p>${hasWorkout ? 'Treino disponível. Siga o plano do seu personal.' : 'Seu personal ainda não liberou um treino. Você pode falar com ele pelo chat/WhatsApp.'}</p><div class="progress"><i style="width:${progress.percent}%"></i></div></article>`);
}

function renderRewardsStore() {
  const rewards = [ ['🎽 Camiseta FitPro', 1200, 'Produto físico futuro'], ['📋 Avaliação bônus', 800, 'Liberar com o personal'], ['🥤 Shaker premium', 650, 'Recompensa de engajamento'], ['🏅 Certificado Elite', 400, 'Conquista digital'] ];
  const student = currentStudent(); const balance = Number(student?.fitPoints || student?.fit_points || 0); return panel('Loja de Recompensas', '', `<section class="card reward-balance"><span class="eyebrow">FitPoints</span><h2>${balance} pts disponíveis</h2><p>Resgates são aprovados pelo personal e protegidos por antifraude.</p></section><div class="cards-grid rewards-grid">${(data!.rewards || []).map((r:any) => `<article class="card reward-card"><strong>${r.type === 'desconto' ? '🏷️' : r.type === 'digital' ? '📘' : r.type === 'conteudo' ? '🎬' : '🎁'}</strong><h3>${esc(r.title)}</h3><p>${esc(r.description || '')}</p><span class="badge ok">${r.points} pts</span>${data!.user.role === 'student' ? `<button class="primary small" data-action="redeem-reward" data-id="${r.id}">Solicitar resgate</button>` : `<span class="badge warn">${Number(r.stock || 0)} disponíveis</span>`}</article>`).join('')}</div>`);
}
function renderBadges() {
  const badges = [ ['🔥 Streak 7 dias', 'Treinou por 7 dias de rotina'], ['💧 Hidratação Pro', 'Bateu meta de água'], ['🏋️ Carga Evoluindo', 'Registrou progressão'], ['🥇 Pódio FitPro', 'Entrou no top 3'], ['📸 Evolução Registrada', 'Fez avaliação com foto'], ['💬 Comunidade Ativa', 'Interagiu no feed'] ];
  return panel('Badges de Conquistas', '', `<div class="cards-grid badge-grid">${badges.map((b,i) => `<article class="card badge-card ${i<3?'unlocked':''}"><strong>${b[0].split(' ')[0]}</strong><h3>${esc(b[0])}</h3><p>${esc(b[1])}</p><span class="badge ${i<3?'ok':'warn'}">${i<3?'desbloqueado':'em progresso'}</span></article>`).join('')}</div>`);
}
function renderFloatingAssistant() {
  return `<button class="floating-assistant" data-modal="ai-assistant" aria-label="Abrir assistente FitPro IA"><span>🤖</span><b>Coach IA</b></button>`;
}

function renderStudentPending(s:any) {
  const trainers = (data as any)!.trainers || []; const plans = data!.plans || [];
  return panel('Aguardando aprovação do personal', '', `<section class="pending-flow"><article class="card hero-card"><span class="eyebrow">Próximo passo</span><h2>Você ainda não está liberado para o painel completo.</h2><p>Sua solicitação está com o personal. Enquanto isso, revise seu perfil, escolha plano e envie comprovante quando houver cobrança.</p><div class="flow-steps"><span class="done">Cadastro</span><span class="active">Aguardando aprovação</span><span>Pagamento</span><span>Acesso liberado</span></div></article><article class="card"><h3>Dados da solicitação</h3><div class="info-grid vertical"><span>Status<b>${statusLabel(s.status || 'aguardando_aprovacao')}</b></span><span>Objetivo<b>${esc(s.goal || '-')}</b></span><span>Cidade<b>${esc(s.city || '-')} ${esc(s.state || '')}</b></span><span>Modalidade<b>${esc(s.modality || '-')}</b></span><span>Plano<b>${esc(planOf(s.planId)?.name || '-')}</b></span></div><button class="primary" data-tab="pagamentos">Ver pagamento/comprovante</button></article></section><section class="panel"><div class="panel-head"><div><span class="eyebrow">Personais compatíveis</span><h2>Escolha e atendimento</h2></div></div><div class="cards-grid">${trainers.map((t:any) => `<article class="card trainer-card">${renderAvatar(t,'profile-avatar')}<h3>${esc(t.name)}</h3><p>${esc(t.specialty || 'Performance, emagrecimento e hipertrofia')}</p><small>${esc(t.city || 'Atendimento online')} ${esc(t.state || '')} • ${esc(t.modalities || 'online/híbrido')}</small>${whatsappButton({ phone: t.whatsapp || t.phone, label: 'Chamar no WhatsApp', kind: 'student_to_trainer', targetName: t.name, className: 'ghost small' })}</article>`).join('') || empty('Nenhum personal disponível ainda.')}</div></section><section class="panel"><div class="cards-grid">${plans.map(p => `<article class="card"><h3>${esc(p.name)}</h3><b>${money(p.price)}</b><p>${esc(p.description || '')}</p></article>`).join('')}</div></section>`);
}

function dashboardLinkCard(item: { tab: string; icon: string; title: string; desc: string; badge?: string; tone?: string }) {
  return `<button class="dashboard-module-card ${item.tone || ''}" data-tab="${esc(item.tab)}"><span class="module-icon">${esc(item.icon)}</span><b>${esc(item.title)}</b><small>${esc(item.desc)}</small>${item.badge ? `<em>${esc(item.badge)}</em>` : ''}</button>`;
}
function renderDashboardNavigator(title: string, subtitle: string, items: { tab: string; icon: string; title: string; desc: string; badge?: string; tone?: string }[]) {
  return `<section class="dashboard-navigator card"><div class="dashboard-navigator-head"><span class="eyebrow">Organização guiada</span><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div><div class="dashboard-module-grid">${items.map(dashboardLinkCard).join('')}</div></section>`;
}
function renderStudentDashboardMap(st:any) {
  const hasTrainer = studentHasApprovedTrainer(st);
  return renderDashboardNavigator('Áreas do aluno', 'Tudo continua acessível, mas agora separado por contexto para não ficar espremido no Pulse.', [
    { tab: 'treinos', icon: '🏋️', title: 'Meu treino', desc: 'Ficha ativa, vídeos, execução e histórico.', badge: data!.workouts.length ? `${data!.workouts.length} ficha(s)` : 'aguardando' },
    { tab: 'habitos', icon: '💧', title: 'Hábitos do dia', desc: 'Água, sono, check-in e consistência.', badge: data!.habits.length ? 'registrar' : 'iniciar' },
    { tab: 'avaliacoes', icon: '📈', title: 'Evolução', desc: 'Peso, medidas, fotos e metas.', badge: `${data!.assessments.length} registro(s)` },
    { tab: 'pagamentos', icon: '💳', title: 'Pagamentos', desc: 'Comprovantes, status e Pix do personal.', badge: data!.payments[0] ? statusLabel(data!.payments[0].status) : 'ver fluxo' },
    { tab: 'comunidade', icon: '🏆', title: 'Comunidade', desc: 'Feed, desafios, ranking e pódio.', badge: `${data!.posts.length} post(s)` },
    { tab: 'mensagens', icon: '💬', title: 'Personal', desc: hasTrainer ? 'Mensagens e contato com seu personal.' : 'Escolha/aguarde aprovação do personal.', badge: hasTrainer ? 'liberado' : 'guiado', tone: hasTrainer ? 'ok' : 'warn' },
    { tab: 'perfil', icon: '👤', title: 'Perfil', desc: 'Avatar, dados pessoais e preferências.', badge: data!.user.avatar ? 'foto salva' : 'sem foto' }
  ]);
}
function renderTrainerDashboardMap() {
  const pendingRequests = data!.students.filter(st => ['aguardando_aprovacao','solicitacao_enviada','sem_personal'].includes(st.status || st.requestStatus || '')).length;
  const paymentQueue = data!.payments.filter(p => ['pendente','aguardando_comprovante','em_analise'].includes(p.status)).length;
  return renderDashboardNavigator('Central do personal', 'O painel mantém os módulos de operação diária, com áreas técnicas concentradas no Dev/Super Admin.', [
    { tab: 'coach', icon: '🧠', title: 'Coach invisível', desc: 'Riscos, elogios e mensagens sugeridas.', badge: `${missingCheckins().length} alerta(s)`, tone: 'ok' },
    { tab: 'solicitacoes', icon: '📥', title: 'Solicitações', desc: 'Novos alunos aguardando análise.', badge: pendingRequests ? `${pendingRequests} pendente(s)` : 'ok', tone: pendingRequests ? 'warn' : 'ok' },
    { tab: 'alunos', icon: '🧑‍🤝‍🧑', title: 'Alunos', desc: 'Carteira, progresso e WhatsApp.', badge: `${data!.students.length} aluno(s)` },
    { tab: 'treinos', icon: '🏋️', title: 'Treinos', desc: 'Criador de ficha e templates.', badge: `${((data as any).workoutPlans || []).length} ficha(s)` },
    { tab: 'pagamentos', icon: '💳', title: 'Pagamentos', desc: 'Comprovantes, aprovar/reprovar e histórico.', badge: paymentQueue ? `${paymentQueue} ação(ões)` : 'em dia', tone: paymentQueue ? 'warn' : 'ok' },
    { tab: 'comunidade', icon: '🏆', title: 'Comunidade', desc: 'Posts, comentários, reactions e desafios.', badge: `${data!.posts.length} post(s)` },
    { tab: 'relatorios', icon: '📈', title: 'Relatórios', desc: 'Engajamento, evolução e financeiro.', badge: 'analisar' },
    { tab: 'leads', icon: '🎯', title: 'CRM/Leads', desc: 'Interessados, conversão e contatos.', badge: `${data!.leads.length} lead(s)` },
    { tab: 'perfil', icon: '👤', title: 'Perfil', desc: 'Avatar, telefone, plano e preferências.', badge: data!.user.avatar ? 'foto salva' : 'sem foto' }
  ]);
}
function renderMenuAuditPanel() {
  const role = data!.user.role;
  const currentNav = navByRole[role] || [];
  const implementedTabs = new Set(['dashboard','coach','solicitacoes','alunos','jornada','treinos','agenda','avaliacoes','pagamentos','planos-plataforma','codigos-ativacao','conteudos','comunidade','badges','recompensas','habitos','mensagens','perfil','relatorios','leads','integracoes','automacoes','configuracoes','logs','status','tenant','marketplace','wearables','personais','workspaces','sorteios','ajuda']);
  const critical = currentNav.filter(item => ['coach','solicitacoes','alunos','treinos','pagamentos','planos-plataforma','conteudos','comunidade','mensagens','relatorios','leads','sorteios','recompensas','perfil','ajuda'].includes(item.id));
  return `<section class="card menu-audit-card"><div class="card-head"><div><span class="eyebrow">Auditoria funcional Sprint 22</span><h3>Menus do perfil ${esc(roleLabel(role))}</h3></div><span class="badge ok">${critical.length} módulos verificados</span></div><p>Agenda, Automações, Logs e Integrações ficam concentrados no Dev/Super Admin. O menu deste perfil mostra apenas módulos de uso diário e cada botão aponta para uma aba implementada ou estado guiado.</p><div class="modal-actions compact-actions"><button class="ghost small" data-action="verify-avatar">Testar avatar</button><button class="ghost small" data-action="repair-avatar">Reparar avatar</button><button class="ghost small" data-action="check-health">Testar API</button></div><div class="menu-audit-grid">${critical.map(item => `<button class="menu-audit-pill ${implementedTabs.has(item.id) ? 'ok' : 'warn'}" data-tab="${esc(item.id)}"><span>${esc(item.icon)}</span><b>${esc(item.label)}</b><small>${implementedTabs.has(item.id) ? 'abrir módulo' : 'estado guiado'}</small></button>`).join('')}</div></section>`;
}


function sectionTabCard(item: { tab: string; icon: string; title: string; desc: string; status?: string; tone?: string }) {
  return `<button class="section-tab-card ${item.tone || ''}" data-tab="${esc(item.tab)}"><span>${esc(item.icon)}</span><b>${esc(item.title)}</b><small>${esc(item.desc)}</small>${item.status ? `<em>${esc(item.status)}</em>` : ''}</button>`;
}
function renderStudentSectionTabs(st:any) {
  const pay = data!.payments[0];
  const next = data!.schedules[0];
  const hasTrainer = studentHasApprovedTrainer(st);
  const items = [
    { tab: 'dashboard', icon: '⚡', title: 'Hoje', desc: 'Treino do dia, hábitos, avisos e próximas ações.', status: data!.workouts[0] ? 'treino liberado' : 'aguardando treino', tone: 'ok' },
    { tab: 'treinos', icon: '🏋️', title: 'Meu Treino', desc: 'Ficha ativa, execução, histórico e vídeos.', status: `${data!.workouts.length} item(ns)` },
    { tab: 'avaliacoes', icon: '📈', title: 'Evolução', desc: 'Medidas, peso, metas, gráficos e ranking pessoal.', status: `${data!.assessments.length} registro(s)` },
    { tab: 'comunidade', icon: '🏆', title: 'Comunidade', desc: 'Feed, comentários, reactions, desafios e pódio.', status: `${data!.posts.length} post(s)` },
    { tab: 'pagamentos', icon: '💳', title: 'Pagamentos', desc: 'Status, comprovante, histórico e avisos.', status: pay ? statusLabel(pay.status) : 'sem cobrança', tone: pay && ['pendente','aguardando_comprovante','em_analise','recusado'].includes(pay.status) ? 'warn' : 'ok' },
    { tab: 'mensagens', icon: '💬', title: 'Personal', desc: 'Mensagens, avisos e WhatsApp contextual.', status: hasTrainer ? 'vinculado' : 'onboarding', tone: hasTrainer ? 'ok' : 'warn' },
    { tab: 'perfil', icon: '👤', title: 'Perfil', desc: 'Avatar, dados pessoais, cidade/UF e preferências.', status: data!.user.avatar ? 'foto salva' : 'iniciais', tone: data!.user.avatar ? 'ok' : 'warn' }
  ];
  return `<section class="dashboard-section-tabs card"><div class="card-head"><div><span class="eyebrow">Dashboard em áreas reais</span><h3>Aluno organizado por contexto</h3></div><span class="badge ok">sem remover funções</span></div><p>Cada área continua acessível, mas o painel principal fica mais respirado: primeiro o que importa hoje, depois módulos por contexto.</p><div class="section-tab-grid">${items.map(sectionTabCard).join('')}</div></section>`;
}
function renderTrainerSectionTabs() {
  const pendingRequests = data!.students.filter(st => ['aguardando_aprovacao','solicitacao_enviada','sem_personal'].includes(st.status || st.requestStatus || '')).length;
  const paymentQueue = data!.payments.filter(p => ['pendente','aguardando_comprovante','em_analise','recusado'].includes(p.status)).length;
  const items = [
    { tab: 'dashboard', icon: '📊', title: 'Visão Geral', desc: 'Resumo da carteira, agenda, alertas e ações rápidas.', status: 'central' },
    { tab: 'coach', icon: '🧠', title: 'Coach Invisível', desc: 'Riscos, elogios, check-ins e mensagens sugeridas.', status: `${missingCheckins().length} alerta(s)`, tone: missingCheckins().length ? 'warn' : 'ok' },
    { tab: 'solicitacoes', icon: '📥', title: 'Solicitações', desc: 'Entrada de alunos, aprovação e recusas.', status: pendingRequests ? `${pendingRequests} pendente(s)` : 'ok', tone: pendingRequests ? 'warn' : 'ok' },
    { tab: 'alunos', icon: '🧑‍🤝‍🧑', title: 'Alunos', desc: 'Carteira, progresso, perfil rápido e WhatsApp.', status: `${data!.students.length} aluno(s)` },
    { tab: 'treinos', icon: '🏋️', title: 'Treinos', desc: 'Criador de ficha, templates, histórico e execução.', status: `${((data as any).workoutPlans || []).length} ficha(s)` },
    { tab: 'pagamentos', icon: '💳', title: 'Pagamentos', desc: 'Comprovantes, aprovar/reprovar, histórico e filtros.', status: paymentQueue ? `${paymentQueue} ação(ões)` : 'em dia', tone: paymentQueue ? 'warn' : 'ok' },
    { tab: 'comunidade', icon: '🏆', title: 'Comunidade', desc: 'Posts, comments, reactions, ranking e desafios.', status: `${data!.posts.length} post(s)` },
    { tab: 'mensagens', icon: '💬', title: 'Mensagens', desc: 'Conversas, avisos e contato complementar por WhatsApp.', status: `${data!.messages.length} msg(s)` },
    { tab: 'relatorios', icon: '📈', title: 'Relatórios', desc: 'Evolução, engajamento, financeiro e retenção.', status: 'analisar' },
    { tab: 'leads', icon: '🎯', title: 'CRM/Leads', desc: 'Interessados, follow-up, conversão e status.', status: `${data!.leads.length} lead(s)` },
    { tab: 'perfil', icon: '👤', title: 'Perfil', desc: 'Avatar, telefone, plano, código e preferências.', status: data!.user.avatar ? 'foto salva' : 'sem foto', tone: data!.user.avatar ? 'ok' : 'warn' }
  ];
  return `<section class="dashboard-section-tabs card"><div class="card-head"><div><span class="eyebrow">Dashboard em áreas reais</span><h3>Personal dividido por operação</h3></div><span class="badge ok">operação diária limpa</span></div><p>A visão geral deixa de carregar tudo ao mesmo tempo; módulos técnicos como Agenda, Automações, Logs e Integrações ficam no Dev/Super Admin.</p><div class="section-tab-grid trainer-sections">${items.map(sectionTabCard).join('')}</div></section>`;
}
function renderAvatarPersistenceChecklist() {
  const user = data!.user;
  const current = currentStudent();
  const trainerProfile = ((data as any).trainers || []).find((t:any) => t.id === user.trainerId || t.userId === user.id || t.user_id === user.id);
  const userAvatar = Boolean(rawAvatarOf(user));
  const linkedAvatar = Boolean(current?.avatar || current?.avatarUrl || current?.avatar_url || trainerProfile?.avatar || trainerProfile?.avatarUrl || trainerProfile?.avatar_url);
  const cached = Boolean(readAvatarCache()[user.id]);
  const checks = [
    ['Sessão atual', userAvatar],
    ['Perfil aluno/personal', linkedAvatar],
    ['Cache anti-flicker', cached],
    ['Fallback com iniciais', true],
    ['Bootstrap protegido', true],
    ['Endpoint de diagnóstico', true]
  ];
  return `<div class="avatar-check-grid">${checks.map(([label, ok]:any) => `<span class="${ok ? 'ok' : 'warn'}">${ok ? '🟢' : '🟡'} <b>${esc(label)}</b><small>${ok ? 'OK' : 'conferir'}</small></span>`).join('')}</div>`;
}
function renderStudentDashboard() {
  const st = currentStudent();
  if (st && !['ativo','aprovado'].includes(st.status || '')) return renderStudentPending(st);
  const plan = planOf(st?.planId);
  const next = data!.schedules[0];
  const pay = data!.payments[0];
  const assessments = data!.assessments;
  const first = assessments[0]?.weight || st?.initialWeight || 0;
  const last = assessments[assessments.length - 1]?.weight || st?.currentWeight || 0;
  return html`${renderFitProPulseStudent()}
  <section class="dashboard-today-grid"><article class="card priority-card"><span class="eyebrow">Hoje</span><h3>Treino, hábitos e próximo passo</h3>${data!.workouts.slice(0,2).map(renderWorkoutMini).join('') || empty('Treino ainda não liberado.')}${alertLine(`Água hoje: ${data!.habits[0]?.waterMl || 0} ml • meta 2500 ml`)}${next ? alertLine(`Próxima agenda: ${dateBR(next.date)} às ${esc(next.time)}.`) : alertLine('Sem agenda marcada. Solicite horário ao personal.')}</article><article class="card priority-card"><span class="eyebrow">Status rápido</span><div class="stats-grid compact-stats">${stat('Peso atual', `${last || '-'} kg`, `Início: ${first || '-'} kg`)}${stat('Plano', plan?.name || '-', pay ? statusLabel(pay.status) : 'Sem cobrança')}${stat('Streak', '12 dias', 'check-ins')}${stat('Pagamento', pay ? statusLabel(pay.status) : 'ok', pay ? dateBR(pay.dueDate) : 'sem pendência')}</div></article></section>
  ${renderStudentDashboardMap(st)}
  ${renderStudentSectionTabs(st)}
  <section class="grid-2"><article class="card"><h3>Pulse de alertas</h3>${alertLine('Seu personal deixou uma nova recomendação.')}${alertLine(pay ? `Pagamento ${statusLabel(pay.status)} vence em ${dateBR(pay.dueDate)}.` : 'Nenhum pagamento pendente.')}${alertLine('Sua avaliação mensal está atualizada.')}</article><article class="card"><h3>Atalhos seguros</h3><div class="quick-grid clean-quick"><button data-tab="treinos">Abrir treino</button><button data-tab="pagamentos">Enviar comprovante</button><button data-tab="comunidade">Ver comunidade</button><button data-tab="perfil">Editar perfil</button></div></article></section>`;
}
function renderAdminDashboard() {
  const revenue = data!.payments.filter(p => p.status === 'aprovado' || p.status === 'em_analise').reduce((a,p)=>a+Number(p.amount||0),0);
  const pending = data!.payments.filter(p => ['pendente','aguardando_comprovante','em_analise'].includes(p.status)).length;
  return html`${renderFitProPulseCoach()}
  <section class="dashboard-today-grid"><article class="card priority-card"><span class="eyebrow">Visão geral</span><div class="stats-grid compact-stats">${stat('Alunos', data!.students.length, 'ativos no workspace')}${stat('Receita prevista', money(revenue), 'análise/aprovados')}${stat('Pagamentos', pending, 'pendentes')}${stat('Leads', data!.leads.length, 'CRM')}</div></article><article class="card priority-card"><span class="eyebrow">Fila de decisão</span><h3>O que precisa de ação</h3>${missingCheckins().slice(0,3).map(st => renderCoachInsight(st, 'risk')).join('') || alertLine('Nenhum check-in crítico agora.')}${pending ? alertLine(`${pending} pagamento(s) precisam de análise.`) : alertLine('Pagamentos sem fila crítica.')}</article></section>
  ${renderTrainerDashboardMap()}
  ${renderTrainerSectionTabs()}
  ${renderMenuAuditPanel()}
  <section class="grid-2"><article class="card"><h3>Check-ins pendentes</h3>${missingCheckins().map(st => renderCoachInsight(st, 'risk')).join('') || empty('Todos registraram check-in hoje.')}</article><article class="card"><h3>Fila de pagamentos</h3>${data!.payments.map(renderPaymentMini).join('') || empty('Nenhum pagamento na fila.')}</article></section>`;
}
function stat(label: string, value: any, hint: string) { return `<article class="stat"><span>${label}</span><b>${value}</b><small>${hint}</small></article>`; }
function alertLine(text: string) { return `<div class="alert-line">⚡ ${esc(text)}</div>`; }
function renderWorkoutMini(w: Workout) { return `<div class="workout-mini"><div><b>${esc(w.title)}</b><small>${esc(w.method || '')} • ${esc(statusLabel(w.status || 'ativo'))}</small></div><span>${w.exercises?.length || 0} exercícios</span></div>`; }
function renderPaymentMini(p: Payment) { const st = studentOf(p.studentId); return `<div class="list-row"><span><b>${esc(st?.name || p.studentId)}</b><small>${money(p.amount)} • ${statusLabel(p.status)}</small></span><button class="ghost small" ${p.hasProof?'':'disabled'} data-modal="proof" data-id="${p.id}">Ver comprovante</button></div>`; }

function studentDecisionButtons(s: any) { return ['aguardando_aprovacao','solicitacao_enviada','sem_personal'].includes(s.status || s.requestStatus || '') ? `<button class="primary small" data-action="approve-student" data-id="${s.id}">Aceitar</button><button class="danger small" data-action="reject-student" data-id="${s.id}">Recusar</button>` : ''; }
function renderStudents() { return panel('Alunos', `<button class="primary" data-modal="new-student">Novo aluno</button>`, `<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Objetivo</th><th>Plano</th><th>Status</th><th>Ações</th></tr></thead><tbody>${data!.students.map(s => `<tr><td><div class="person-cell">${studentAvatar(s)}<span><b>${esc(s.name)}</b><small>${esc(s.email)} • ${esc(s.city || '-')}</small></span></div></td><td>${esc(s.goal)}</td><td>${esc(planOf(s.planId)?.name || '-')}</td><td><span class="badge ${statusClass(s.status || '')}">${statusLabel(s.status || '')}</span></td><td><button class="ghost small" data-modal="student" data-id="${s.id}">Detalhes</button><button class="ghost small" data-action="whatsapp-student" data-phone="${esc(s.phone || '')}">WhatsApp</button>${studentDecisionButtons(s)}</td></tr>`).join('')}</tbody></table></div>`); }
function renderStudentRequests() { const requests = data!.students.filter(s => ['aguardando_aprovacao','solicitacao_enviada','sem_personal','recusado'].includes(s.status || s.requestStatus || '')); return panel('Solicitações de alunos', '', `<div class="cards-grid">${requests.map(s => `<article class="card request-card"><div class="card-head"><h3>${esc(s.name)}</h3><span class="badge ${statusClass(s.status || '')}">${statusLabel(s.status || '')}</span></div><p>${esc(s.goal || 'Objetivo não informado')}</p><div class="info-grid"><span>Cidade<b>${esc(s.city || '-')} ${esc(s.state || '')}</b></span><span>Modalidade<b>${esc(s.modality || 'não informada')}</b></span><span>Plano<b>${esc(planOf(s.planId)?.name || '-')}</b></span><span>Pagamento<b>${esc(s.paymentMethod || '-')}</b></span></div><p class="notice">${esc(s.requestMessage || 'Sem mensagem adicional.')}</p><div class="modal-actions"><button class="primary" data-action="approve-student" data-id="${s.id}">Aceitar aluno</button><button class="danger" data-action="reject-student" data-id="${s.id}">Recusar</button><button class="ghost" data-action="whatsapp-student" data-phone="${esc(s.phone || '')}">WhatsApp</button></div></article>`).join('') || empty('Nenhuma solicitação pendente.')}</div>`); }
function planProgressLabel(plan:any) {
  const days = plan?.days?.length || 0;
  const ex = (plan?.days || []).reduce((acc:number, d:any) => acc + (d.exercises?.length || 0), 0);
  return `${days} dia(s) • ${ex} exercício(s) • ${esc(plan?.frequencyPerWeek || plan?.frequency_per_week || '-')}`;
}
function workoutExerciseCount(plan:any) { return (plan?.days || []).reduce((acc:number, d:any) => acc + ((d.exercises || []).length), 0); }

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDaysClient(baseDate='', offset=0) { const base = baseDate || todayISO(); const date = new Date(`${base}T00:00:00`); date.setDate(date.getDate() + Number(offset || 0)); return date.toISOString().slice(0,10); }
function dayNumberOf(day:any, index=0) { return Number(day?.dayNumber || day?.day_number || day?.order || day?.dayOrder || day?.day_order || index + 1); }
function dayDateOf(day:any, plan:any, index=0) { return String(day?.trainingDate || day?.training_date || day?.date || (plan?.startDate || plan?.start_date ? addDaysClient(plan.startDate || plan.start_date, dayNumberOf(day,index) - 1) : '') || ''); }
function dateBRShort(iso='') { if (!iso) return ''; const [y,m,d] = String(iso).slice(0,10).split('-'); return y && m && d ? `${d}/${m}/${y}` : iso; }
function isWorkoutDay(day:any) { const type = String(day?.dayType || day?.day_type || '').toLowerCase(); return type === 'treino' || ((day?.exercises || []).length > 0 && !['descanso','recuperacao','alongamento'].includes(type)); }
function planDaysSorted(plan:any) { return (plan?.days || []).slice().sort((a:any,b:any)=> dayNumberOf(a,0) - dayNumberOf(b,0)); }
function currentPlanDay(plan:any) {
  const days = planDaysSorted(plan);
  const today = todayISO();
  return days.find((d:any,i:number)=>dayDateOf(d,plan,i) === today) || days.find((d:any,i:number)=>dayDateOf(d,plan,i) > today) || days[0];
}
function nextTrainingDay(plan:any, current:any) {
  const days = planDaysSorted(plan); const today = todayISO(); const curNum = dayNumberOf(current,0);
  return days.find((d:any,i:number)=> dayNumberOf(d,i) > curNum && isWorkoutDay(d)) || days.find((d:any,i:number)=> dayDateOf(d,plan,i) > today && isWorkoutDay(d)) || days.find((d:any)=>isWorkoutDay(d));
}
function completionForExercise(exerciseId:string) { return ((data as any)?.workoutExerciseCompletions || []).find((c:any)=>String(c.workoutExerciseId || c.workout_exercise_id) === String(exerciseId) && Number(c.completed) === 1); }
function dayProgressFor(dayId:string) { return ((data as any)?.workoutDayProgress || []).find((p:any)=>String(p.workoutDayId || p.workout_day_id) === String(dayId)); }
function planCompletionSummary(plan:any) {
  const days = planDaysSorted(plan);
  const trainingDays = days.filter((d:any)=>isWorkoutDay(d));
  const completedDays = trainingDays.filter((d:any)=>exerciseCompletionStats(d).isCompleted);
  const totalExercises = trainingDays.reduce((acc:number,d:any)=>acc+(d.exercises || []).length,0);
  const completedExercises = trainingDays.reduce((acc:number,d:any)=>acc+exerciseCompletionStats(d).done,0);
  const percent = totalExercises ? Math.round((completedExercises / totalExercises) * 100) : 0;
  return { days, trainingDays, completedDays, totalExercises, completedExercises, percent };
}
function planAdvancedProgress(plan:any) {
  const summary = planCompletionSummary(plan);
  const days = summary.days;
  const todayDay = currentPlanDay(plan);
  const currentIndex = Math.max(0, days.findIndex((d:any)=>String(d.id) === String(todayDay?.id)));
  const completedAllDays = days.filter((d:any)=>exerciseCompletionStats(d).isCompleted).length;
  const pendingTraining = summary.trainingDays.filter((d:any)=>!exerciseCompletionStats(d).isCompleted).length;
  const next = nextTrainingDay(plan, todayDay);
  return { ...summary, todayDay, currentIndex, currentDayNumber: dayNumberOf(todayDay, currentIndex), week: Math.max(1, Math.ceil(dayNumberOf(todayDay,currentIndex)/7)), completedAllDays, pendingTraining, next };
}
function renderStudentProgressAdvanced(plan:any) {
  const p = planAdvancedProgress(plan);
  return `<article class="card plan-progress-card advanced-progress-card"><span class="eyebrow">Progresso do plano</span><h3>Dia ${esc(p.currentDayNumber)} de ${esc(p.days.length || 30)} · Semana ${esc(p.week)}</h3><div class="day-progress"><b>${p.completedDays.length} treino(s) concluído(s) · ${p.completedExercises}/${p.totalExercises} exercício(s)</b><span>${p.percent}%</span><div class="progress"><i style="width:${p.percent}%"></i></div></div><div class="info-grid compact-info"><span>Treino de hoje<b>${esc(p.todayDay?.name || '-')}</b></span><span>Próximo treino<b>${esc(p.next?.weekday || '-')} · ${esc(p.next?.name || '-')}</b></span><span>Pendentes<b>${esc(p.pendingTraining)}</b></span><span>Dias concluídos<b>${esc(p.completedAllDays)}/${esc(p.days.length)}</b></span></div></article>`;
}
function planDayFilterButtons() {
  return `<div class="plan-filter-row" data-plan-filters><button class="selected" data-plan-filter="all">Todos</button><button data-plan-filter="pending">Pendentes</button><button data-plan-filter="completed">Concluídos</button><button data-plan-filter="training">Treino</button><button data-plan-filter="rest">Descanso</button><button data-plan-filter="cardio">Cardio</button><button data-plan-filter="mobility">Mobilidade</button></div>`;
}
function studentPlanProgressCard(plan:any) {
  return renderStudentProgressAdvanced(plan);
}

function exerciseVideoUrl(ex:any) { return String(ex?.videoUrl || ex?.video_url || ex?.youtubeUrl || ex?.youtube_url || ex?.tutorialUrl || ex?.tutorial_url || '').trim(); }
function exerciseYoutubeSearch(ex:any) { return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${ex?.name || 'exercício'} execução correta`)}`; }
function youtubeEmbedUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (host.endsWith('youtube.com')) {
      if (parsed.pathname.startsWith('/watch')) id = parsed.searchParams.get('v') || '';
      else if (parsed.pathname.startsWith('/shorts/') || parsed.pathname.startsWith('/embed/')) id = parsed.pathname.split('/').filter(Boolean)[1] || '';
    }
    if (!/^[a-zA-Z0-9_-]{6,}$/.test(id)) return '';
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1`;
  } catch { return ''; }
}
function exerciseVideoTarget(ex:any) {
  const video = exerciseVideoUrl(ex);
  const embed = youtubeEmbedUrl(video);
  const fallback = exerciseYoutubeSearch(ex);
  return { video, embed, fallback, hasVideo: Boolean(video), canEmbed: Boolean(embed) };
}
function exerciseCompletionStats(day:any) {
  const exercises = day?.exercises || [];
  const done = exercises.filter((e:any)=>completionForExercise(e.id)).length;
  const total = exercises.length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0, isCompleted: total > 0 && done >= total };
}
function completionBannerIfNeeded(day:any) {
  const stats = exerciseCompletionStats(day);
  if (!stats.isCompleted) return '';
  return `<div class="completion-banner premium-completion"><b>🎉 Parabéns! Treino do dia concluído com sucesso.</b><span>${stats.done} de ${stats.total} exercícios finalizados. Mais um passo na sua evolução.</span></div>`;
}
function renderStudentExerciseCards(day:any) {
  const exercises = day?.exercises || [];
  return `<div class="student-exercise-stack interactive-exercises">${exercises.map((e:any, i:number) => {
    const done = !!completionForExercise(e.id);
    const target = exerciseVideoTarget(e);
    const titleAction = target.hasVideo
      ? `<button class="exercise-title-link" data-action="exercise-video" data-id="${esc(e.id)}"><b>${esc(e.name)}</b></button>`
      : `<a class="exercise-title-link" href="${esc(target.fallback)}" target="_blank" rel="noopener noreferrer" title="Buscar ${esc(e.name)} no YouTube"><b>${esc(e.name)}</b></a>`;
    const videoAction = target.hasVideo
      ? `<button class="ghost tiny" data-action="exercise-video" data-id="${esc(e.id)}">${target.canEmbed ? 'Ver player' : 'Abrir tutorial'}</button>`
      : `<a class="ghost tiny inline-link-button" href="${esc(target.fallback)}" target="_blank" rel="noopener noreferrer" title="Buscar ${esc(e.name)} no YouTube">Buscar no YouTube</a>`;
    return `<div class="student-exercise-row interactive-exercise ${done ? 'completed' : ''}"><span class="exercise-order">${done ? '✓' : i + 1}</span><div class="exercise-content">${titleAction}<small>${esc(e.sets || '3')} séries • ${esc(e.reps || '10-12')} reps/tempo • descanso ${esc(e.restSeconds || e.rest_seconds || e.rest || '-')}</small>${e.notes || e.cautions ? `<em>${esc(e.notes || e.cautions)}</em>` : ''}<div class="exercise-actions student-actions">${videoAction}<button class="${done ? 'ghost' : 'primary'} tiny" data-action="toggle-exercise-completion" data-id="${esc(e.id)}" data-completed="${done ? 'false' : 'true'}">${done ? 'Desmarcar' : 'Concluir exercício'}</button></div></div></div>`;
  }).join('') || empty('Sem exercícios neste dia.')}</div>`;
}
function findExerciseInPlans(exerciseId:string) {
  for (const plan of ((data as any)?.workoutPlans || [])) for (const day of (plan.days || [])) for (const exercise of (day.exercises || [])) if (String(exercise.id) === String(exerciseId)) return { plan, day, exercise };
  return null;
}
function showCompletionCelebration(message='Parabéns! Treino do dia concluído com sucesso.') {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const box = document.createElement('div'); box.className = 'fitpro-confetti-celebration';
  box.innerHTML = `<div class="celebration-card"><b>🏆 ${esc(message)}</b><span>Excelente trabalho. Consistência constrói evolução.</span></div>${reduce ? '' : '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>'}`;
  document.body.appendChild(box); setTimeout(()=>box.remove(), reduce ? 2600 : 4200);
}

function findWorkoutExerciseById(exerciseId:string) {
  for (const plan of ((data as any)?.workoutPlans || [])) {
    for (const day of (plan.days || [])) {
      for (const exercise of (day.exercises || [])) {
        if (String(exercise.id) === String(exerciseId)) return { plan, day, exercise };
      }
    }
  }
  return null;
}
function exerciseFormValue(ex:any, key:string, fallback = '') {
  return esc(ex?.[key] ?? ex?.[key.replace(/[A-Z]/g, m => '_' + m.toLowerCase())] ?? fallback);
}
function renderExerciseActionBar(e:any, day:any) {
  return `<div class="exercise-actions"><button class="ghost tiny" data-modal="workout-exercise-edit" data-id="${esc(e.id)}">Editar</button><button class="ghost tiny" data-modal="workout-exercise-replace" data-id="${esc(e.id)}">Substituir</button><button class="ghost tiny" data-action="duplicate-workout-exercise" data-id="${esc(e.id)}">Duplicar</button><button class="ghost tiny" data-action="move-workout-exercise" data-id="${esc(e.id)}" data-direction="up">↑</button><button class="ghost tiny" data-action="move-workout-exercise" data-id="${esc(e.id)}" data-direction="down">↓</button><button class="danger tiny" data-action="remove-workout-exercise" data-id="${esc(e.id)}">Remover</button></div><small class="muted">${esc(day?.weekday || '')} • ordem ${esc(e.exerciseOrder || e.exercise_order || '-')}</small>`;
}
function renderWorkoutExerciseEditModal(exerciseId:string) {
  const found = findWorkoutExerciseById(exerciseId);
  if (!found) return `<h2>Exercício não encontrado</h2><p>Atualize a ficha e tente novamente.</p>`;
  const { plan, day, exercise } = found;
  return `<h2>Editar exercício</h2><p>${esc(plan.title)} • ${esc(day.weekday || day.name || '')}</p><form data-form="workout-exercise-edit" data-exercise-id="${esc(exercise.id)}"><div class="form-grid"><label>Nome<input name="name" required value="${exerciseFormValue(exercise,'name')}"></label><label>Grupo<select name="muscleGroup">${optionList(muscleGroups, exercise.muscleGroup || exercise.muscle_group || '')}</select></label><label>Séries<input name="sets" value="${exerciseFormValue(exercise,'sets')}"></label><label>Reps/tempo<input name="reps" value="${exerciseFormValue(exercise,'reps')}"></label><label>Carga<input name="load" value="${exerciseFormValue(exercise,'load')}"></label><label>Descanso<input name="restSeconds" value="${exerciseFormValue(exercise,'restSeconds', exercise.rest_seconds || '')}"></label><label>Equipamento<select name="equipment">${optionList(equipments, exercise.equipment || '')}</select></label><label>Método<select name="method">${optionList(workoutMethods, exercise.method || 'tradicional')}</select></label><label>Vídeo/YouTube<input name="videoUrl" value="${exerciseFormValue(exercise,'videoUrl', exercise.video_url || '')}" placeholder="https://youtube.com/..."></label></div><label>Técnica/observações<textarea name="notes">${exerciseFormValue(exercise,'notes')}</textarea></label><label>Substituições sugeridas<textarea name="substitutions">${exerciseFormValue(exercise,'substitutions')}</textarea></label><label>Cuidados/contraindicação genérica<textarea name="cautions">${exerciseFormValue(exercise,'cautions')}</textarea></label><label>Motivo da alteração<input name="reason" placeholder="Ex.: ajuste de carga, técnica, restrição do aluno"></label><button class="primary wide">Salvar alteração</button><p class="notice">A alteração gera nova versão da ficha e fica registrada no histórico.</p></form>`;
}
function renderWorkoutExerciseReplaceModal(exerciseId:string) {
  const found = findWorkoutExerciseById(exerciseId);
  if (!found) return `<h2>Exercício não encontrado</h2><p>Atualize a ficha e tente novamente.</p>`;
  const { plan, day, exercise } = found;
  const items = ((data as any).exerciseLibrary || []).slice(0, 180);
  return `<h2>Substituir exercício</h2><p>${esc(exercise.name)} em ${esc(day.weekday || day.name || '')} • ${esc(plan.title)}</p><div class="library-filters"><input data-library-search placeholder="Buscar substituto por nome, grupo ou equipamento"><select data-library-filter="muscle"><option value="">Todos grupos</option>${muscleGroups.map(g => `<option>${esc(g)}</option>`).join('')}</select></div><div class="exercise-library-list replace-library-list">${items.map((item:any) => `<div class="library-item" data-name="${esc([item.name,item.muscleGroup,item.equipment,item.level,item.category].join(' ').toLowerCase())}" data-muscle="${esc(String(item.muscleGroup || '').toLowerCase())}" data-equipment="${esc(String(item.equipment || '').toLowerCase())}"><div><b>${esc(item.name)}</b><small>${esc(item.muscleGroup || '')} • ${esc(item.equipment || '')} • ${esc(item.level || '')}</small><p>${esc(item.cautions || item.executionNotes || item.description || '')}</p></div><button class="primary small" data-action="replace-workout-exercise" data-id="${esc(exercise.id)}" data-library-id="${esc(item.id)}">Usar este</button></div>`).join('') || empty('Nenhum exercício na biblioteca.')}</div><p class="notice">Substituir gera nova versão, preserva aluno/ficha/dia e evita recriar a ficha inteira.</p>`;
}
function renderWorkoutInsightsPanel(isAdmin:boolean) {
  const insights = (data as any).workoutInsights || {};
  if (!isAdmin) return `<section class="grid-2"><article class="card ai-card"><h3>Execução do aluno</h3><p>${esc(insights.guidance || 'Registre carga, repetições, dificuldade e dor/desconforto ao concluir o treino.')}</p>${insights.lastWorkoutAt ? alertLine(`Último treino registrado em ${dateTimeBR(insights.lastWorkoutAt)}.`) : alertLine('Nenhum treino registrado ainda.')}${insights.painReported ? alertLine(`Atenção: feedback de dor/desconforto registrado: ${insights.painReported}`) : alertLine('Sem alerta recente de dor/desconforto.')}</article><article class="card"><h3>Como pontuar com segurança</h3>${alertLine('Treino concluído gera FitPoints uma vez por log válido.')}${alertLine('Rever ficha ou abrir conteúdo não gera pontos infinitos.')}${alertLine('Feedback honesto ajuda o personal a ajustar carga e progressão.')}</article></section>`;
  const painAlerts = Array.isArray(insights.painAlerts) ? insights.painAlerts : [];
  return `<section class="stats-grid workout-insights">${stat('Fichas ativas', insights.activePlans || 0, 'publicadas para alunos')}${stat('Rascunhos', insights.draftPlans || 0, 'em construção')}${stat('Sem ficha ativa', insights.studentsWithoutPlan || 0, 'alunos aprovados')}${stat('Fichas vencidas', insights.expiredPlans || 0, 'precisam revisão')}</section><section class="grid-2"><article class="card"><h3>Alertas pós-publicação</h3>${alertLine(`${insights.reviewPlans || 0} ficha(s) em revisão.`)}${alertLine(`${insights.completedWorkouts || 0} registro(s) recentes de treino.`)}${painAlerts.length ? painAlerts.map((log:any) => alertLine(`Dor/desconforto: ${log.painReported} • ${dateTimeBR(log.createdAt)}`)).join('') : alertLine('Nenhum alerta recente de dor/desconforto.')}</article><article class="card ai-card"><h3>Assistente de Treino FitPro</h3><p>Use a IA como apoio para estrutura, divisão semanal e progressão. O personal revisa antes de publicar.</p><button class="primary small" data-action="ai-workout-suggestion">Gerar sugestão segura</button></article></section>`;
}
function renderRecentWorkoutLogs() {
  const logs = ((data as any).workoutLogs || []).slice(0, 8);
  return logs.length ? `<article class="card"><h3>Histórico recente de execução</h3><div class="timeline compact">${logs.map((log:any) => `<div class="time-item"><time>${dateTimeBR(log.createdAt)}</time><div><h3>${esc(log.difficulty || 'treino registrado')}</h3><p>${esc(log.notes || 'Sem observação.')} ${log.painReported ? `• Dor/desconforto: ${esc(log.painReported)}` : ''}</p><small>${esc(log.pointsAwarded || 0)} pts • ${esc(log.durationMinutes || 0)} min</small></div></div>`).join('')}</div></article>` : '';
}

function renderWorkoutAutomationPanel() {
  if (data!.user.role === 'student') return '';
  const drafts = ((data as any).workoutDrafts || []).slice(0, 5);
  const templates = ((data as any).personalWorkoutTemplates || []).slice(0, 6);
  const plans = ((data as any).workoutPlans || []).filter((p:any)=>p.status !== 'arquivado').slice(0, 6);
  return `<section class="grid-2 workout-automation-panel"><article class="card"><div class="card-head"><div><span class="eyebrow">Autosave backend</span><h3>Rascunhos salvos</h3></div><span class="badge info">${drafts.length}</span></div>${drafts.map((d:any)=>`<div class="list-row"><span><b>${esc(d.title || d.draft?.title || 'Rascunho')}</b><small>${esc(studentNameById(d.studentId || d.student_id || d.draft?.studentId) || 'sem aluno')} • ${dateTimeBR(d.updatedAt || d.updated_at)}</small></span><div class="mini-actions"><button class="ghost tiny" data-modal="new-workout">Continuar</button><button class="danger tiny" data-action="delete-workout-draft" data-id="${esc(d.id)}">Descartar</button></div></div>`).join('') || empty('Nenhum rascunho de backend salvo ainda.')}</article><article class="card"><div class="card-head"><div><span class="eyebrow">Modelos do personal</span><h3>Favoritos e reutilizáveis</h3></div><span class="badge ok">${templates.length}</span></div>${templates.map((t:any)=>`<div class="list-row"><span><b>${t.favorite ? '⭐ ' : ''}${esc(t.title)}</b><small>${esc(t.objective || 'modelo')} • usado ${esc(t.usageCount || t.usage_count || 0)}x</small></span><button class="ghost tiny" data-action="favorite-personal-template" data-id="${esc(t.id)}" data-favorite="${t.favorite ? 'false' : 'true'}">${t.favorite ? 'Desfavoritar' : 'Favoritar'}</button></div>`).join('') || empty('Salve uma ficha como modelo para reutilizar depois.')}</article><article class="card"><div class="card-head"><div><span class="eyebrow">Duplicação rápida</span><h3>Copiar ficha para outro aluno</h3></div></div>${plans.map((p:any)=>`<div class="list-row"><span><b>${esc(p.title)}</b><small>${esc(statusLabel(p.status || 'rascunho'))} • ${workoutExerciseCount(p)} exercícios</small></span><div class="mini-actions"><button class="ghost tiny" data-modal="duplicate-plan-to-student" data-id="${esc(p.id)}">Duplicar</button><button class="ghost tiny" data-action="save-workout-template" data-id="${esc(p.id)}">Salvar modelo</button></div></div>`).join('') || empty('Crie uma ficha para habilitar duplicação.')}</article><article class="card ai-card"><h3>Resumo de volume semanal</h3><p>Use o card da ficha para ver séries por grupo e alertas simples antes de publicar. A regra continua: completo por trás, simples por fora.</p>${alertLine('Ao substituir exercício, a biblioteca abre priorizando grupo/equipamento compatíveis.')}${alertLine('Aplicação em massa cria cópias individuais, sem copiar histórico do aluno anterior.')}</article></section>`;
}
function renderWorkouts() {
  const isAdmin = data!.user.role !== 'student';
  const plans = (data as any).workoutPlans || [];
  const planCards = plans.map((p:any) => `<article class="card workout-card pro-workout-card">
    <div class="card-head"><div><span class="eyebrow">${esc(p.type || 'ficha')} • ${planProgressLabel(p)}</span><h3>${esc(p.title)}</h3></div><span class="badge ${statusClass(p.status || 'rascunho')}">${statusLabel(p.status || 'rascunho')}</span></div>
    <p>${esc(p.objective || '')} • ${esc(p.level || '')} • ${esc(p.modality || '')} • ${esc(p.location || '')}</p>
    <div class="workout-meta-grid"><span>Frequência <b>${esc(p.frequencyPerWeek || '-')}</b></span><span>Revisão <b>${dateBR(p.reviewDate)}</b></span><span>Versão <b>v${esc(p.version || 1)}</b></span><span>Exercícios <b>${workoutExerciseCount(p)}</b></span></div>
    <div class="exercise-list compact">${(p.days || []).slice(0,4).map((d:any) => `<div><b>${esc(d.name)}</b><small>${esc(d.focus || d.muscleGroup || '')} • ${(d.exercises || []).length} exercício(s)</small></div>`).join('')}</div>
    <div class="modal-actions"><button class="primary small" data-modal="workout-plan" data-id="${p.id}">Abrir ficha</button>${isAdmin ? `<button class="ghost small" data-modal="edit-workout-plan" data-id="${p.id}">Editar</button><button class="ghost small" data-action="publish-workout-plan" data-id="${p.id}">Publicar</button><button class="ghost small" data-action="duplicate-workout-plan" data-id="${p.id}">Duplicar</button><button class="danger small" data-action="archive-workout-plan" data-id="${p.id}">Arquivar</button>` : `<button class="ghost small" data-modal="workout-log" data-id="${p.id}">Registrar treino</button>`}</div>
  </article>`).join('');
  const legacy = data!.workouts.map(w => `<article class="card workout-card"><div class="card-head"><h3>${esc(w.title)}</h3><span class="badge ${w.status==='provisorio'?'warn':''}">${statusLabel(w.status || 'ativo')}</span></div><p>${esc(w.goal || '')} • ${esc(w.level || '')} • ${esc(w.method || '')}</p><div class="exercise-list">${(w.exercises || []).map((e:any) => `<div><b>${esc(e.name)}</b><small>${esc(e.sets)}x ${esc(e.reps)} • descanso ${esc(e.rest || '-')}</small></div>`).join('')}</div><button class="primary small" data-modal="workout" data-id="${w.id}">Abrir treino</button></article>`).join('');
  return panel('Treinos e fichas profissionais', isAdmin ? `<button class="primary" data-modal="new-workout">Criar ficha profissional</button><button class="primary" data-modal="monthly-plan">Aplicar plano de 30 dias</button><button class="ghost" data-modal="exercise-library">Biblioteca avançada</button><button class="ghost" data-action="ai-workout-suggestion">Assistente IA</button>` : '', `<section class="workout-hero card"><div><span class="eyebrow">Sprint 9.1 • Criador profissional FitPro</span><h3>Fichas com IA de apoio, biblioteca filtrável, versionamento, duplicação e logs reais por exercício.</h3><p>Personal cria, publica, acompanha feedback de execução e ajusta progressão com segurança. Aluno registra carga, reps, dificuldade e dor/desconforto.</p></div><div class="workout-kpis"><b>${plans.length}</b><span>fichas avançadas</span><b>${(data as any).workoutTemplates?.length || 0}</b><span>templates</span></div></section>${renderWorkoutInsightsPanel(isAdmin)}${renderWorkoutAutomationPanel()}<div class="cards-grid">${planCards || legacy || empty('Nenhuma ficha criada ainda.')}</div>${renderRecentWorkoutLogs()}`);
}

function renderSchedules() {
  const isAdmin = data!.user.role !== 'student';
  const googleConnected = (data!.googleConnections || []).some((g:any)=>g.status==='connected');
  return panel('Agenda de treinos', isAdmin ? `<button class="primary" data-modal="new-schedule">Novo agendamento</button>${googleConnected ? '<span class="badge ok">Google conectado</span>' : '<button class="ghost" data-action="google-connect">Conectar Google Calendar</button>'}` : `<button class="primary" data-action="whatsapp">Solicitar horário</button>`, `<div class="timeline">${data!.schedules.map(s => `<div class="time-item"><time>${dateBR(s.date)}<b>${esc(s.time)}</b></time><div><h3>${esc(s.title)}</h3><p>${esc(s.type)} • ${statusLabel(s.status)} • ${esc(s.location)}</p>${s.googleMeetLink || s.onlineLink ? `<a href="${esc(s.googleMeetLink || s.onlineLink)}" target="_blank">Abrir aula online</a>` : ''}${isAdmin ? `<div class="modal-actions"><button class="ghost small" data-action="schedule-meet" data-id="${s.id}">Criar Google Meet</button></div>` : ''}</div></div>`).join('') || empty('Nenhum agendamento.')}</div>`);
}

function renderAssessments() {
  const s = currentStudent();
  const latest = data!.assessments[0] || {};
  const bmi = calcBMI(latest.weight || s?.currentWeight, s?.height);
  const delta = Number(s?.currentWeight || latest.weight || 0) - Number(s?.initialWeight || 0);
  return panel('Avaliação física e evolução', `<button class="primary" data-modal="new-assessment">Registrar avaliação</button>`, `<div class="stats-grid">${stat('IMC', bmi.value || '-', bmi.label)}${stat('Peso atual', `${esc(latest.weight || s?.currentWeight || '-')} kg`, delta ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}kg desde o início` : 'linha base')}${stat('Energia', `${esc(latest.energy || '-')} /10`, 'registro sensível')}${stat('Sono', `${esc(latest.sleep || '-')} /10`, 'recuperação')}</div><div class="grid-2"><article class="card ai-card"><h3>Resumo inteligente da sua evolução</h3><p>${esc(latest.aiSummary || 'Você está construindo consistência. Registre peso, sono, energia e observações para seu personal acompanhar com mais precisão. A análise é apoio e não substitui avaliação médica, nutricional ou profissional.')}</p>${alertLine('Próximo passo leve: registre uma nova avaliação e mantenha o treino da semana.')}${alertLine('Dados corporais e fotos são privados por padrão.')}</article><article class="card"><h3>Linha do tempo</h3>${data!.assessments.map(a => `<div class="time-item"><time>${dateBR(a.date)}</time><div><h3>Avaliação registrada</h3><p>Peso ${esc(a.weight)}kg • Gordura ${esc(a.bodyFat || '-')}% • Sono ${esc(a.sleep || '-')}/10</p></div></div>`).join('') || empty('Faça sua primeira avaliação para criar sua linha de evolução.')}</article></div><article class="card"><h3>Gráfico de peso</h3><div class="bars">${data!.assessments.map(a => `<span style="height:${Math.max(18, Number(a.weight||0))}%"><em>${esc(a.weight)}</em></span>`).join('')}</div><p class="notice">IMC é referência geral e não substitui avaliação médica, nutricional ou profissional.</p></article>`);
}
function paymentProviderMeta(p: Payment) {
  const provider = p.paymentProvider || (p.mercadoPagoId || p.mercadoPagoPreferenceId || p.mercadoPagoPreapprovalId ? 'mercado_pago' : 'manual');
  const last = p.lastWebhookAt ? `Último webhook: ${dateTimeBR(p.lastWebhookAt)}` : 'Sem webhook recebido ainda';
  const mp = p.mercadoPagoStatus ? `MP: ${p.mercadoPagoStatus}${p.mercadoPagoStatusDetail ? `/${p.mercadoPagoStatusDetail}` : ''}` : 'Mercado Pago aguardando checkout/webhook';
  return { provider, last, mp };
}

function renderPayments() {
  const role = data!.user.role;
  const studentPayments = (data as any).studentPayments || [];
  const platformSubscriptions = (data as any).platformSubscriptions || [];
  const s = currentStudent();
  const trainer = trainerOf(s?.trainerId || s?.requestedTrainerId);
  const pix = trainerPaymentSettingsFor(trainer?.id);
  const payments = data!.payments || [];
  if (role === 'student') {
    const sp = studentPayments[0];
    return panel('Pagamento ao personal', '', `<section class="card hero-card"><span class="eyebrow">Fluxo correto</span><h2>Aluno paga diretamente ao personal</h2><p>Este pagamento não usa o Mercado Pago do Dev. O Mercado Pago da plataforma é para a assinatura do personal ao dono/dev.</p></section>${trainer ? `<article class="card pix-card"><h3>Pix do personal</h3><div class="info-grid vertical"><span>Recebedor<b>${esc(pix?.receiverName || trainer.brandName || trainer.name)}</b></span><span>Tipo da chave<b>${esc(pix?.pixKeyType || 'a combinar')}</b></span><span>Chave Pix<b>${esc(pix?.pixKey || 'Personal ainda não configurou Pix')}</b></span><span>Instruções<b>${esc(pix?.instructions || 'Combine o pagamento com o personal e envie o comprovante.')}</b></span>${sp ? `<span>Valor<b>${money(sp.amount)}</b></span><span>Status<b>${statusLabel(sp.status)}</b></span>` : ''}</div><div class="modal-actions">${pix?.pixKey ? `<button class="primary" data-action="copy-text" data-value="${esc(pix.pixKey)}">Copiar chave Pix</button>` : ''}${whatsappButton({ phone: trainer.whatsapp || trainer.phone || '', label: 'Chamar personal', kind: 'student_to_trainer', targetName: trainer.name, className: 'ghost' })}</div></article>` : `<article class="card">${empty('Escolha um personal para ver os dados de pagamento.')}</article>`}<article class="card"><h3>Histórico aluno → personal</h3>${studentPayments.map((p:any)=>`<div class="list-row"><span><b>${money(p.amount)} • ${statusLabel(p.status)}</b><small>${dateBR(p.dueDate)} • pagamento ao personal • ${esc(p.paymentMethod || 'pix_manual')}</small></span></div>`).join('') || empty('Nenhum pagamento do personal gerado ainda.')}</article>`);
  }
  if (['dev','super_admin'].includes(role)) {
    return panel('Financeiro da plataforma', `<button class="primary" data-modal="new-payment">Nova cobrança plataforma</button>`, `<section class="grid-2"><article class="card hero-card"><span class="eyebrow">Fluxo 1</span><h2>Personal paga para o Dev/uPaiva</h2><p>Usa Mercado Pago da plataforma, webhook da plataforma e controle pelo Super Admin.</p></article><article class="card"><h3>Assinaturas dos personais</h3>${platformSubscriptions.map((p:any)=>`<div class="list-row"><span><b>${esc(trainerOf(p.trainerId)?.name || p.trainerId)} • ${esc(p.planName)}</b><small>${money(p.amount)} • vencimento ${dateBR(p.dueDate)} • ${statusLabel(p.status)}</small></span></div>`).join('') || empty('Nenhuma assinatura de personal cadastrada.')}</article></section><article class="card"><h3>Webhooks Mercado Pago da plataforma</h3>${((data as any).mercadoPagoWebhookEvents || []).slice(0,8).map((e:any)=>`<div class="list-row"><span><b>${e.signatureValid ? '🟢' : '🟡'} ${esc(e.eventType || 'evento')} • ${esc(e.processedStatus || '-')}</b><small>${dateTimeBR(e.receivedAt || e.received_at)} — recurso ${esc(e.resourceId || '-')}</small></span></div>`).join('') || empty('Nenhum webhook recebido ainda.')}</article><article class="card"><h3>Pagamentos aluno → personal</h3><p>Visão de auditoria/suporte. O dinheiro do aluno é do personal.</p>${studentPayments.slice(0,12).map((p:any)=>`<div class="list-row"><span><b>${esc(studentOf(p.studentId)?.name || p.studentId)} → ${esc(trainerOf(p.trainerId)?.name || p.trainerId)}</b><small>${money(p.amount)} • ${statusLabel(p.status)} • ${esc(p.paymentMethod || 'pix_manual')}</small></span></div>`).join('') || empty('Nenhum pagamento de aluno ao personal.')}</article>`);
  }
  return panel('Pagamentos dos alunos', `<button class="primary" data-modal="trainer-payment-settings">Configurar Pix</button><button class="ghost" data-modal="trainer-plan">Novo plano do aluno</button>`, `<section class="grid-2"><article class="card hero-card"><span class="eyebrow">Fluxo 2</span><h2>Aluno paga para o personal</h2><p>Configure Pix, planos e aprove comprovantes dos seus alunos. Mercado Pago do Dev não entra neste fluxo.</p></article><article class="card"><h3>Configuração Pix</h3><div class="info-grid vertical"><span>Recebedor<b>${esc(((data as any).trainerPaymentSettings || {}).receiverName || data!.user.name)}</b></span><span>Chave Pix<b>${esc(((data as any).trainerPaymentSettings || {}).pixKey || 'não configurada')}</b></span><span>Instruções<b>${esc(((data as any).trainerPaymentSettings || {}).instructions || 'Configure na ação acima.')}</b></span></div></article></section><article class="card"><h3>Planos do personal</h3>${((data as any).trainerPlans || []).filter((p:any)=>!data!.user.trainerId || p.trainerId===data!.user.trainerId).map((p:any)=>`<div class="list-row"><span><b>${esc(p.name)} • ${money(p.price)}</b><small>${esc(p.description || '')}</small></span><span class="badge ${p.status==='ativo'?'ok':'warn'}">${esc(p.status)}</span></div>`).join('') || empty('Crie seu primeiro plano do aluno.')}</article><article class="card"><h3>Pagamentos dos alunos</h3>${studentPayments.map((p:any)=>`<div class="list-row"><span><b>${esc(studentOf(p.studentId)?.name || p.studentId)} • ${money(p.amount)}</b><small>${statusLabel(p.status)} • vencimento ${dateBR(p.dueDate)}</small></span>${whatsappButton({ phone: studentOf(p.studentId)?.phone || '', label: 'WhatsApp', kind: 'trainer_to_student', targetName: studentOf(p.studentId)?.name || 'aluno', className: 'ghost small' })}</div>`).join('') || empty('Nenhum pagamento de aluno ao personal ainda.')}</article>`);
}

function planFeatureList(items:any[] = []) { return `<ul class="feature-list mini">${items.slice(0, 14).map(item => `<li>✅ ${esc(item)}</li>`).join('')}</ul>`; }
function currentPlatformSubscription() {
  const subs = ((data as any).platformSubscriptions || []);
  if (!data?.user.trainerId) return subs[0];
  return subs.find((s:any) => s.trainerId === data!.user.trainerId || s.trainer_id === data!.user.trainerId) || subs[0];
}
function renderPlatformPlans() {
  const role = data!.user.role;
  const isSuper = ['dev','super_admin'].includes(role);
  const isTrainer = ['trainer','admin'].includes(role);
  const plans = ((data as any).platformPlans || []);
  const codes = ((data as any).platformActivationCodes || []);
  const redemptions = ((data as any).activationCodeRedemptions || []);
  const subs = ((data as any).platformSubscriptions || []);
  const mySub = currentPlatformSubscription();
  const planCards = plans.map((p:any)=>`<article class="card plan-card platform-plan-card"><div class="card-head"><span class="badge ${p.code==='fitpro_plus'?'ok':'info'}">${esc(p.name)}</span><b>${money(p.price)}/mês</b></div><h3>${esc(p.objective || '')}</h3><p>${p.studentLimit ? `Até ${p.studentLimit} alunos ativos` : 'Plano personalizado'}</p>${planFeatureList(p.resources || [])}${(p.limitations || []).length ? `<div class="notice">${(p.limitations || []).map((x:string)=>`⚠️ ${esc(x)}`).join('<br>')}</div>` : ''}${isTrainer ? `<div class="modal-actions"><button class="primary" data-action="platform-checkout" data-id="${esc(p.id)}">Escolher plano e pagar agora</button></div>` : ''}</article>`).join('');
  const future = `<article class="card plan-card disabled-card"><div class="card-head"><span class="badge warn">EM ESPERA</span><b>FitPro Elite / Studio</b></div><p>Multi-profissionais, múltiplas unidades, mais alunos, marketplace, split de pagamento, comissão automática, Google Calendar/Meet, IA avançada, automações, relatórios premium e marca branca parcial.</p></article>`;
  if (isTrainer && !isSuper) {
    return panel('Plano FitPro do personal', `<button class="primary" data-modal="redeem-activation-code">Tenho um código de ativação</button>`, `<section class="card hero-card"><span class="eyebrow">Assinatura da plataforma</span><h2>${mySub ? `${esc(mySub.planName)} • ${statusLabel(mySub.status)}` : 'Escolha seu plano FitPro'}</h2><p>${mySub?.source === 'activation_code' ? `Seu plano está ativo via código de ativação até ${dateBR(mySub.expiresAt || mySub.dueDate)}.` : 'Escolha um plano e pague via Mercado Pago, ou use um código fornecido pelo FitPro/uPaiva.'}</p>${mySub ? `<div class="info-grid"><span>Origem<b>${esc(mySub.source || 'mercado_pago')}</b></span><span>Valor<b>${money(mySub.amount)}</b></span><span>Expira/vencimento<b>${dateBR(mySub.expiresAt || mySub.dueDate)}</b></span><span>Status<b>${statusLabel(mySub.status)}</b></span></div>` : ''}</section><section class="cards-grid">${planCards}${future}</section>`);
  }
  const codeRows = codes.map((c:any)=>`<div class="list-row code-row"><span><b>${esc(c.code)} • ${esc(c.plan?.name || c.platformPlanId)}</b><small>${esc(c.name || '')} • ${c.durationDays} dias • usos ${c.usedCount}/${c.maxUses} • expira ${dateBR(c.expiresAt)} • ${esc(c.type)}</small></span><span class="badge ${c.computedStatus==='ativo'?'ok':c.computedStatus==='expirado'||c.computedStatus==='cancelado'?'danger':'warn'}">${statusLabel(c.computedStatus || c.status)}</span><button class="ghost small" data-action="copy-text" data-value="${esc(c.code)}">Copiar</button>${c.status==='ativo' ? `<button class="danger small" data-action="activation-code-status" data-id="${esc(c.id)}" data-status="cancelado">Cancelar</button>` : `<button class="ghost small" data-action="activation-code-status" data-id="${esc(c.id)}" data-status="ativo">Reativar</button>`}</div>`).join('');
  const subsRows = subs.map((s:any)=>`<div class="list-row"><span><b>${esc(trainerOf(s.trainerId)?.name || s.trainerId)} • ${esc(s.planName)}</b><small>${money(s.amount)} • origem ${esc(s.source || 'mercado_pago')} • expira/vencimento ${dateBR(s.expiresAt || s.dueDate)}</small></span><span class="badge ${s.status==='ativo'?'ok':s.status==='pendente'?'warn':'danger'}">${statusLabel(s.status)}</span></div>`).join('');
  const redemptionRows = redemptions.slice(0,10).map((r:any)=>`<div class="list-row"><span><b>${esc(trainerOf(r.trainerId)?.name || r.trainerId)}</b><small>${dateTimeBR(r.redeemedAt)} • assinatura ${esc(r.subscriptionId)}</small></span></div>`).join('');
  return panel('Planos da plataforma e códigos', `<button class="primary" data-modal="platform-activation-code">Criar código de ativação</button>`, `<section class="grid-2"><article class="card hero-card"><span class="eyebrow">Fluxo 1</span><h2>Personal paga para FitPro/uPaiva</h2><p>Planos Start e Plus são assinaturas da plataforma. O aluno continua pagando ao personal por Pix/manual configurado no painel do personal.</p></article><article class="card"><h3>Assinaturas dos personais</h3>${subsRows || empty('Nenhuma assinatura criada ainda.')}</article></section><section class="cards-grid">${planCards}${future}</section><article class="card"><div class="card-head"><h3>Códigos de ativação</h3><span class="badge info">backend valida e resgata</span></div>${codeRows || empty('Nenhum código criado ainda.')}</article><article class="card"><h3>Últimos resgates</h3>${redemptionRows || empty('Nenhum código resgatado ainda.')}</article>`);
}

function renderContents() { return panel('FitPro Academy', '', `<div class="academy-hero card"><h3>Biblioteca estilo streaming</h3><p>Trilhas, lives, PDFs, receitas e dicas rápidas. Conteúdo concluído pode ser revisto sem pontuação infinita.</p></div><div class="cards-grid academy-grid">${data!.contents.map(c => `<article class="card academy-card"><div class="academy-thumb">${c.thumbnailUrl ? `<img src="${esc(c.thumbnailUrl)}" alt="${esc(c.title)}">` : `<span>${fitnessThumb(c.category)}</span>`}</div><div class="card-head"><span class="badge">${esc(c.category)}</span>${c.premium ? '<span class="badge warn">Premium</span>' : ''}</div><h3>${esc(c.title)}</h3><p>${esc(c.description)}</p><div class="progress"><i style="width:${(c.completedBy || []).includes(data!.user.id) ? 100 : 35}%"></i></div><button class="primary small" data-modal="content" data-id="${c.id}">${(c.completedBy || []).includes(data!.user.id) ? 'Rever' : 'Assistir'}</button></article>`).join('')}</div>`); }
function renderReactionSummaryPremium(post:any) {
  const grouped:any = {};
  const reactions = post.reactions || [];
  if (Array.isArray(reactions)) reactions.forEach((r:any) => { const emoji = r.emoji || r.reactionType || '🔥'; if (!grouped[emoji]) grouped[emoji] = []; grouped[emoji].push(r); });
  else Object.entries(post.reactionSummary || post.reactionsJson || {}).forEach(([emoji, users]:any) => grouped[emoji] = Array.isArray(users) ? users : []);
  return Object.entries(grouped).map(([emoji, users]:any) => {
    const names = users.map((u:any)=>u.userName || u.name || u).filter(Boolean);
    const mine = users.some((u:any)=>u.userId === data?.user.id || u === data?.user.id);
    return `<button class="reaction-chip rich ${mine ? 'selected' : ''}" title="${esc(names.length ? names.join(', ') : 'Sem nomes registrados')}">${esc(emoji)} ${users.length}${mine ? ' • você' : ''}</button>`;
  }).join('');
}

function renderCommunity() {
  return panel('Comunidade, reações e desafios', `<button class="primary" data-modal="new-post">Nova publicação</button>`, `<div class="grid-2"><article class="card"><h3>Feed</h3>${data!.posts.map(p => { const st = studentOf(p.studentId); const comments = p.comments || p.commentsJson || []; const myReactions = (p.reactions || []).filter((r:any)=>r.userId === data!.user.id); return `<div class="post"><div class="post-head">${renderAvatar(st || {name:p.author})}<span><b>${esc(p.author)}</b><small>${esc(p.category)} • ${dateTimeBR(p.createdAt)}</small></span>${p.pinned ? '<span class="badge ok">fixado</span>' : ''}</div><p>${esc(p.text)}</p><div class="reaction-row">${['🔥','👏','💪','🚀','❤️','🏆','🙌'].map(r => `<button class="reaction ${myReactions.some((mr:any)=>mr.emoji===r)?'selected':''}" title="Clique para adicionar/remover sua reação" data-action="react-post" data-id="${p.id}" data-reaction="${r}">${r}</button>`).join('')}${renderReactionSummaryPremium(p)}</div><div class="comment-list"><b>${comments.length} comentário(s)</b>${comments.slice(-3).map((c:any)=>`<small>${renderAvatar({name:c.author, avatar:c.avatar}, 'tiny-avatar')} <b>${esc(c.author || 'Aluno')}:</b> ${esc(c.text)}</small>`).join('')}</div><button class="ghost small" data-modal="comment-post" data-id="${p.id}">Comentar</button></div>`; }).join('') || empty('Nenhuma publicação ainda.')}</article><article class="card"><h3>Desafios, check-ins e pódio</h3>${data!.challenges.map(c => { const participants = (c.participants || []).filter((pt:any)=>Number(pt.progress || 0) > 0 || Number(pt.points || 0) > 0); return `<div class="challenge"><b>${esc(c.title)}</b><p>${esc(c.description)}</p>${participants.length ? `<div class="podium-list">${participants.slice(0,3).map((pt:any, i:number) => { const st = studentOf(pt.studentId) || {name:'Aluno'}; return `<div>${renderAvatar(st,'small-avatar')}<span>${['🥇','🥈','🥉'][i] || '🏅'} ${esc(st.name)}<small>${pt.progress || 0}/${c.target || 0} • ${pt.points || 0} pts</small></span></div>`; }).join('')}</div><div class="progress"><i style="width:${Math.min(100, ((participants[0]?.progress || 0) / (c.target || 1)) * 100)}%"></i></div>` : empty('Você ainda não participa de nenhum desafio com progresso real.')}${data!.user.role==='student' ? `<button class="primary small" data-action="challenge-checkin" data-id="${c.id}">Enviar check-in</button>` : ''}<small>Recompensa: ${esc(c.reward)}</small></div>`; }).join('') || empty('Nenhum desafio disponível.')}</article></div>`);
}

function habitLabel(value:any) {
  const map: Record<string,string> = { good:'Meta concluída', near:'Cheguei perto', low:'Hoje ficou abaixo', slept_well:'Dormi bem', slept_ok:'Dormi razoável', slept_bad:'Dormi mal', moved_good:'Me movimentei bem', moved_basic:'Fiz o básico', moved_low:'Quase não me movimentei', balanced:'Mantive equilibrado', middle:'Meio termo', off:'Fora do planejado', high:'Energia alta', medium:'Energia média', low_energy:'Energia baixa', good_mood:'Me senti bem', normal_mood:'Dia normal', hard_day:'Dia difícil', supplements_done:'Tomei tudo', supplements_some:'Esqueci algum', supplements_none:'Não tomei hoje', workout_done:'Concluído', workout_partial:'Parcial', workout_none:'Não consegui hoje' };
  return map[String(value || '')] || String(value || '-');
}
function renderHabits() {
  const latest = data!.habits[0] || {};
  return panel('Hábitos, rotina e check-in rápido', `<button class="primary" data-modal="quick-habit">Check-in rápido</button><button class="ghost" data-modal="new-habit">Detalhes avançados</button>`, `<div class="stats-grid">${stat('Check-ins', data!.habits.length, 'registros')}${stat('Último score', latest.quickScore || '-', latest.quickFeedback || 'sem check-in rápido')}${stat('Água', latest.waterMl ? `${latest.waterMl}ml` : habitLabel(latest.quickCheckin?.water), 'hidratação')}${stat('Energia', latest.energy ? `${latest.energy}/10` : habitLabel(latest.quickCheckin?.energy), 'autoavaliação')}</div><div class="grid-2"><article class="card"><h3>Resumo rápido</h3>${data!.habits.map(h => { const q = h.quickCheckin || {}; return `<div class="list-row"><span><b>${dateBR(h.date)}</b><small>Água: ${habitLabel(q.water) || `${h.waterMl||0}ml`} • Sono: ${habitLabel(q.sleep) || `${h.sleepHours||0}h`} • Alimentação: ${habitLabel(q.food)} • Humor: ${habitLabel(q.mood)}</small><small>${esc(h.quickFeedback || h.notes || '')}</small></span></div>`; }).join('') || empty('Registre seu primeiro check-in rápido. Leva menos de 1 minuto.')}</article><article class="card ai-card"><h3>Feedback sem julgamento</h3><p>O check-in rápido usa linguagem leve e motivacional. Um dia difícil não define sua evolução; o importante é manter consistência.</p>${alertLine('Modo avançado continua disponível para água ml, sono, passos e macros.')}${alertLine('Suplementos não substituem orientação médica/nutricional.')}</article><article class="card"><h3>Suplementos</h3>${data!.supplements.map(s => `<div class="list-row"><span><b>${esc(s.name)}</b><small>${esc(s.objective)} • ${esc(s.scheduleText)}</small></span><button class="ghost small" data-action="supplement-taken" data-id="${s.id}">Tomado</button></div>`).join('') || empty('Seu personal ainda não adicionou suplementos.')}<p class="notice">Suplementação deve ser validada por profissional quando necessário.</p></article></div>`);
}

function renderMessages() { return panel('Chat interno e WhatsApp', `<button class="primary" data-modal="new-message">Enviar mensagem</button>`, `<div class="chat-list">${data!.messages.map(m => { const sender = senderOf(m.senderId) || { name: 'Sistema' }; return `<div class="message ${m.senderId===data!.user.id?'mine':''}"><div class="message-head">${renderAvatar(sender,'small-avatar')}<span><b>${esc(sender.name)}</b><small>${dateTimeBR(m.createdAt)}</small></span></div><p>${esc(m.text)}</p></div>`; }).join('')}</div>`); }

function renderProfile() {
  const s = currentStudent();
  const plan = planOf(s?.planId);
  const trainerProfile = ((data as any).trainers || []).find((t:any) => t.id === data!.user.trainerId || t.userId === data!.user.id);
  const person = data!.user.role === 'student' ? { ...s, avatar: data!.user.avatar || s?.avatar || s?.avatarUrl, name: data!.user.name } : { ...trainerProfile, ...data!.user, avatar: data!.user.avatar || trainerProfile?.avatar || trainerProfile?.avatarUrl };
  const profileTitle = data!.user.role === 'student' ? 'Perfil do aluno' : data!.user.role === 'trainer' || data!.user.role === 'admin' ? 'Perfil do personal' : 'Perfil dev/super admin';
  return panel(profileTitle, '', `<div class="profile-grid profile-premium-grid"><article class="card profile-card avatar-card">
    <span class="eyebrow">Foto de perfil</span>
    <div class="avatar-preview-wrap">${renderAvatar(person,'profile-avatar live-profile-avatar')}</div>
    <h3>${esc(person?.name || data!.user.name)}</h3><p>${esc(data!.user.email)}</p>
    <form data-form="avatar-upload" class="avatar-upload-form">
      <label>Trocar foto de perfil<input name="file" type="file" accept="image/png,image/jpeg,image/webp" data-avatar-input required></label>
      <div class="avatar-preview-file" data-avatar-preview>${renderAvatar(person,'small-avatar')}</div>
      <button class="primary wide">Salvar foto e atualizar app</button>
    </form>
    <button class="ghost wide" data-action="verify-avatar">Testar persistência do avatar</button>
    <button class="ghost wide" data-action="repair-avatar">Reparar sincronização da foto</button>
    <p class="notice">PNG, JPG ou WebP até 3MB. Ao salvar, o backend grava arquivo/caminho, banco, sessão, perfil vinculado e reenvia o bootstrap atualizado. Critério: não piscar, não sumir, permanecer após F5/logout/login.</p><div class="avatar-persist-check">${data!.user.avatar ? '🟢 Avatar detectado na sessão atual e protegido contra sobrescrita' : '🟡 Nenhum avatar salvo ainda — fallback com iniciais ativo'}</div>${renderAvatarPersistenceChecklist()}
  </article><article class="card"><h3>Dados principais</h3><div class="info-grid vertical"><span>Nome<b>${esc(s?.name || data!.user.name)}</b></span><span>E-mail<b>${esc(s?.email || data!.user.email)}</b></span><span>WhatsApp<b>${esc(s?.phone || '-')}</b></span><span>Objetivo<b>${esc(s?.goal || '-')}</b></span><span>Plano<b>${esc(plan?.name || '-')}</b></span><span>Peso inicial<b>${esc(s?.initialWeight || '-')} kg</b></span><span>Peso atual<b>${esc(s?.currentWeight || '-')} kg</b></span><span>Nível<b>${esc(s?.level || '-')}</b></span><span>Cidade/Estado<b>${esc(s?.city || '-')}</b></span><span>Status<b>${statusLabel(s?.status || 'ativo')}</b></span></div></article><article class="card"><h3>Consentimentos e privacidade</h3><p>Dados de saúde, fotos de evolução, mensagens e comprovantes continuam privados por padrão.</p><div class="checks readonly"><label>✅ Termos de uso</label><label>✅ Consentimento LGPD</label><label>✅ Notificações configuráveis</label><label>⚠️ Fotos e comprovantes protegidos por rota autenticada</label></div></article></div>`);
}

function renderStudentExecutionDetail(studentId:string) {
  const st = studentOf(studentId) || (data!.students || []).find((s:any)=>String(s.id)===String(studentId));
  const plans = ((data as any).workoutPlans || []).filter((p:any)=>String(p.studentId || p.student_id) === String(studentId));
  const active = plans.filter((p:any)=>['ativo','publicado','published','active'].includes(String(p.status || '').toLowerCase()));
  const rows = active.map((plan:any) => {
    const progress = planAdvancedProgress(plan);
    const today = progress.todayDay;
    const todayStats = exerciseCompletionStats(today);
    const dayDate = dayDateOf(today, plan, Math.max(0, progress.days.findIndex((d:any)=>String(d.id)===String(today?.id))));
    const dayRows = planDaysSorted(plan).slice(0, 30).map((day:any, i:number) => {
      const stats = exerciseCompletionStats(day);
      const isToday = String(day.id) === String(today?.id);
      const date = dayDateOf(day, plan, i);
      return `<div class="execution-day-mini ${stats.isCompleted?'done':''} ${isToday?'today':''}"><span><b>Dia ${esc(dayNumberOf(day,i))} · ${esc(day.weekday || '')}</b><small>${dateBRShort(date)} • ${esc(day.name || day.dayType || 'Dia')} • ${stats.done}/${stats.total} exercício(s)</small></span><span class="badge ${stats.isCompleted?'ok':isWorkoutDay(day)?'warn':'info'}">${stats.isCompleted?'Concluído':isWorkoutDay(day)?'Pendente':statusLabel(day.dayType || 'descanso')}</span></div>`;
    }).join('');
    return `<article class="card student-execution-detail-card"><div class="card-head"><div><span class="eyebrow">${esc(statusLabel(plan.status || 'ativo'))}</span><h3>${esc(plan.title)}</h3></div><button class="primary small" data-modal="workout-plan" data-id="${esc(plan.id)}">Abrir ficha</button></div><div class="stats-grid compact-stats">${stat('Dia atual', `${progress.currentDayNumber}/${progress.days.length || 30}`, `Semana ${progress.week}`)}${stat('Treinos concluídos', progress.completedDays.length, 'dias de treino')}${stat('Exercícios feitos', `${progress.completedExercises}/${progress.totalExercises}`, 'total do plano')}${stat('Progresso', `${progress.percent}%`, 'geral')}</div><div class="day-progress"><b>Hoje: ${esc(today?.name || '-')}</b><span>${todayStats.done}/${todayStats.total}</span><div class="progress"><i style="width:${todayStats.percent || 0}%"></i></div></div><p class="notice">Próximo treino: ${esc(progress.next?.weekday || '-')} · ${esc(progress.next?.name || '-')} ${dayDate ? `• Hoje: ${dateBRShort(dayDate)}` : ''}</p><div class="execution-day-list">${dayRows || empty('Nenhum dia no plano.')}</div></article>`;
  }).join('');
  return `<h2>Execução de ${esc(st?.name || 'aluno')}</h2><p class="notice">Visão do personal: acompanhamento por plano, dia, treino concluído, exercícios feitos e pendências.</p>${rows || empty('Este aluno ainda não possui ficha/plano ativo com progresso.')}`;
}

function renderWorkoutExecutionMonitor() {
  const plans = ((data as any).workoutPlans || []).filter((p:any)=>['ativo','publicado','published','active'].includes(String(p.status || '').toLowerCase()));
  const rows = plans.slice(0, 12).map((plan:any) => {
    const st = studentOf(plan.studentId || plan.student_id);
    const summary = planCompletionSummary(plan);
    const current = currentPlanDay(plan);
    const stats = exerciseCompletionStats(current);
    const date = dayDateOf(current, plan, Math.max(0, summary.days.findIndex((d:any)=>String(d.id) === String(current?.id))));
    const late = isWorkoutDay(current) && date && date < todayISO() && !stats.isCompleted;
    const badge = stats.isCompleted ? '<span class="badge ok">Concluiu hoje</span>' : late ? '<span class="badge danger">Atrasado</span>' : '<span class="badge warn">Em andamento</span>';
    return `<div class="execution-row execution-row-v2"><div>${studentAvatar(st || {name: plan.studentName || 'Aluno'})}<span><b>${esc(st?.name || plan.studentName || 'Aluno')}</b><small>${esc(plan.title)} • Dia ${esc(dayNumberOf(current,0))} • ${dateBRShort(date)} • ${esc(current?.name || 'treino atual')}</small></span></div><div class="execution-status">${badge}<small>${stats.done}/${stats.total} exercícios hoje • plano ${summary.percent}%</small><div class="progress"><i style="width:${summary.percent}%"></i></div></div><div class="mini-actions"><button class="ghost tiny" data-modal="student" data-id="${esc(st?.id || plan.studentId || '')}">Aluno</button><button class="ghost tiny" data-modal="student-execution-detail" data-id="${esc(st?.id || plan.studentId || '')}">Progresso</button><button class="primary tiny" data-modal="workout-plan" data-id="${esc(plan.id)}">Abrir ficha</button></div></div>`;
  }).join('');
  const doneToday = plans.filter((p:any)=>exerciseCompletionStats(currentPlanDay(p)).isCompleted).length;
  const lateCount = plans.filter((p:any)=>{ const d=currentPlanDay(p); return isWorkoutDay(d) && dayDateOf(d,p,0) < todayISO() && !exerciseCompletionStats(d).isCompleted; }).length;
  return `<article class="card execution-monitor-card"><div class="card-head"><div><span class="eyebrow">Execução dos alunos</span><h3>Monitoramento diário do personal</h3></div><span class="badge info">${plans.length} ficha(s) ativa(s)</span></div><div class="stats-grid compact-stats">${stat('Concluíram hoje', doneToday, 'treinos finalizados')}${stat('Atrasados', lateCount, 'precisam atenção')}${stat('Planos ativos', plans.length, 'alunos/fichas')}${stat('Média progresso', plans.length ? Math.round(plans.reduce((a:any,p:any)=>a+planCompletionSummary(p).percent,0)/plans.length)+'%' : '0%', '30 dias')}</div>${rows || empty('Nenhuma ficha ativa com progresso para monitorar ainda.')}</article>`;
}

function renderReports() { const approved = data!.payments.filter(p=>p.status==='aprovado').reduce((a,p)=>a+p.amount,0); return panel('Relatórios executivos', `<button class="ghost" data-action="export-json">Exportar JSON</button>`, `<section class="stats-grid">${stat('Receita aprovada', money(approved), 'financeiro')}${stat('Treinos criados', data!.workouts.length, 'biblioteca/fichas')}${stat('Conteúdos', data!.contents.length, 'FitPro Academy')}${stat('Logs', data!.auditLogs.length, 'auditoria')}</section>${renderWorkoutExecutionMonitor()}<article class="card"><h3>Insights</h3>${alertLine('Alunos sem atividade devem receber mensagem automática.')}${alertLine('Pagamentos em análise precisam de comprovante visualizado antes da decisão.')}${alertLine('Conteúdos mais vistos podem virar programa de desafio.')}</article>`); }
function renderLeads() { return panel('CRM e leads', '', `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Contato</th><th>Objetivo</th><th>Status</th><th>Ações</th></tr></thead><tbody>${data!.leads.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(l.phone)}<small>${esc(l.email)}</small></td><td>${esc(l.goal)}</td><td><span class="badge ${l.status==='convertido'?'ok':'warn'}">${esc(l.status)}</span></td><td><button class="ghost small" data-action="whatsapp-lead" data-phone="${esc(l.phone)}">WhatsApp</button><button class="primary small" ${l.status==='convertido'?'disabled':''} data-action="convert-lead" data-id="${l.id}">Converter</button></td></tr>`).join('')}</tbody></table></div>`); }
function integrationBadgeClass(item: any) { return item?.severity === 'ok' ? 'ok' : item?.severity === 'warn' ? 'warn' : 'danger'; }
function variableList(vars: any[] = []) { return vars.length ? `<div class="integration-vars">${vars.map(v => `<span class="var-pill ${v.configured ? 'ok' : 'warn'}"><b>${esc(v.name)}</b>${v.configured ? 'configurada' : 'ausente'}</span>`).join('')}</div>` : '<p class="muted">Sem variáveis obrigatórias.</p>'; }
function renderIntegrations() {
  const dashboard = (data as any)!.integrationDashboard || {};
  const items = dashboard.items || [];
  const logs = dashboard.logs || [];
  const checklist = dashboard.checklist || [];
  const urls = dashboard.urls || [];
  const counts = dashboard.counts || { total: items.length, ok: 0, warn: 0, danger: 0 };
  const waEvents = data!.whatsappWebhookEvents || [];
  const waAiReplies = (data as any)!.whatsappAiReplies || [];
  const waTemplates = (data as any)!.whatsappTemplates || [];
  const waTemplateSends = (data as any)!.whatsappTemplateSends || [];
  const mpEvents = data!.mercadoPagoWebhookEvents || [];
  const canManage = ['dev','super_admin'].includes(data!.user.role);
  const actions = canManage
    ? `<button class="primary" data-action="refresh-integrations">Verificar tudo</button><button class="ghost" data-action="run-automations">Rodar automações</button>`
    : `<span class="badge warn">Somente Dev/Super Admin testa conexões</span>`;
  return panel('Central real de integrações', actions, `
    <section class="integrations-hero card hero-card">
      <span class="eyebrow">Diagnóstico seguro</span>
      <h2>${counts.ok}/${counts.total || items.length} integrações sem alerta crítico</h2>
      <p>Esta central mostra status real sem expor secrets. Variáveis aparecem apenas como configuradas ou ausentes.</p>
      <div class="kpi-row"><span class="badge ok">${counts.ok || 0} ok</span><span class="badge warn">${counts.warn || 0} parciais/em espera</span><span class="badge danger">${counts.danger || 0} pendentes</span><span class="badge info">${esc(dashboard.environment || 'local')}</span></div>
    </section>
    <div class="cards-grid integration-grid">${items.map((i:any) => `
      <article class="card integration-card ${integrationBadgeClass(i)}">
        <div class="card-head"><span class="integration-icon">${esc(i.icon || '🔌')}</span><h3>${esc(i.title || i.key)}</h3><span class="badge ${integrationBadgeClass(i)}">${esc(i.status || 'não testado')}</span></div>
        <p>${esc(i.description || '')}</p>
        <div class="integration-meter"><i style="width:${i.totalRequired ? Math.round((i.configuredRequired / i.totalRequired) * 100) : 100}%"></i></div>
        <h4>Obrigatórias</h4>${variableList(i.required || [])}
        ${i.optional?.length ? `<h4>Opcionais</h4>${variableList(i.optional)}` : ''}
        <div class="integration-log-preview"><b>Último evento</b><small>${esc(i.lastLog?.message || 'Nenhum teste registrado ainda.')}</small></div>
        <div class="modal-actions">
          ${canManage ? `<button class="primary small" data-action="test-integration" data-key="${esc(i.key)}">Testar conexão</button>` : ''}
          ${i.key === 'supabase' && canManage ? `<button class="ghost small" data-action="supabase-migrate">Migrar tabelas-chave</button><button class="ghost small" data-action="supabase-schema-check">Checar schema</button>` : ''}
          ${i.key === 'mercadopago' && data!.payments[0] ? `<button class="ghost small" data-action="mercado-preference" data-id="${data!.payments[0].id}">Criar checkout</button>` : ''}
          ${i.key === 'google' ? `<button class="ghost small" data-action="google-connect">Conectar Google</button>` : ''}
          ${i.key === 'whatsapp_ai' ? `<button class="ghost small" data-action="whatsapp-ai-replies">Ver respostas IA</button>` : ''}
          ${i.key === 'whatsapp_templates' ? `<button class="ghost small" data-action="whatsapp-templates">Ver templates</button>` : ''}
          ${i.usefulUrl ? `<button class="ghost small" data-action="copy-text" data-value="${esc((dashboard.apiUrl || '') + i.usefulUrl)}">Copiar URL</button>` : ''}
        </div>
      </article>`).join('') || empty('Nenhuma integração catalogada.')}</div>
    <section class="grid-2">
      <article class="card"><h3>Checklist de produção</h3>${checklist.map((c:any)=>`<div class="list-row"><span><b>${c.status === 'ok' ? '🟢' : '🟡'} ${esc(c.label)}</b><small>${c.status === 'ok' ? 'OK' : 'Conferir configuração'}</small></span></div>`).join('') || empty('Checklist indisponível.')}</article>
      <article class="card"><h3>URLs úteis</h3>${urls.map((u:any)=>`<div class="list-row"><span><b>${esc(u.label)}</b><small>${esc(u.url)}</small></span><button class="ghost small" data-action="copy-text" data-value="${esc(u.url)}">Copiar</button></div>`).join('') || empty('Nenhuma URL útil.')}</article>
    </section>
    <section class="grid-2">
      <article class="card"><h3>Webhooks WhatsApp recentes</h3>${waEvents.slice(0,8).map((w:any)=>`<div class="list-row"><span><b>${esc(w.webhookType || w.webhook_type || 'evento')} • ${esc(w.processedStatus || w.processed_status || '-')}</b><small>${dateTimeBR(w.receivedAt || w.received_at)} — ${esc(w.contactName || w.contact_name || w.fromPhone || w.from_phone || '')} ${w.text ? '• ' + esc(w.text).slice(0,90) : ''}</small></span></div>`).join('') || empty('Nenhum webhook WhatsApp recebido ainda.')}</article>
      <article class="card"><h3>Webhooks Mercado Pago recentes</h3>${mpEvents.slice(0,8).map((m:any)=>`<div class="list-row"><span><b>${esc(m.eventType || m.event_type || 'evento')} • ${esc(m.processedStatus || m.processed_status || '-')}</b><small>${dateTimeBR(m.receivedAt || m.received_at)} — ${esc(m.paymentId || m.payment_id || m.resourceId || m.resource_id || '')}</small></span></div>`).join('') || empty('Nenhum webhook Mercado Pago recebido ainda.')}</article>
    </section>
    <section class="grid-2">
      <article class="card"><h3>WhatsApp + IA automática</h3>${waAiReplies.slice(0,8).map((r:any)=>`<div class="list-row"><span><b>${esc(r.status || '-')} • ${esc(r.provider || '-')}</b><small>${dateTimeBR(r.createdAt || r.created_at)} — ${esc(r.inboundText || r.inbound_text || '').slice(0,80)}${r.aiAnswer || r.ai_answer ? ' → ' + esc(r.aiAnswer || r.ai_answer).slice(0,90) : ''}</small></span></div>`).join('') || empty('Nenhuma resposta automática registrada ainda. Ative WHATSAPP_AI_AUTO_REPLY_ENABLED=true no Railway para produção.')}</article>
      <article class="card"><h3>Templates aprovados na Meta</h3>${waTemplates.map((t:any)=>`<div class="list-row"><span><b>${t.configured ? '🟢' : '🟡'} ${esc(t.label || t.key)}</b><small>${esc(t.configured ? t.name : t.envName)} • ${esc(t.language || 'pt_BR')}</small></span>${t.configured && canManage ? `<button class="ghost small" data-action="send-whatsapp-template" data-key="${esc(t.key)}">Enviar teste</button>` : ''}</div>`).join('') || empty('Nenhum template catalogado.')}</article>
    </section>
    <article class="card"><h3>Envios de template recentes</h3>${waTemplateSends.slice(0,8).map((s:any)=>`<div class="list-row"><span><b>${esc(s.templateKey || s.template_key)} • ${esc(s.status || '-')}</b><small>${dateTimeBR(s.createdAt || s.created_at)} — ${esc(s.toPhone || s.to_phone || '')} ${s.errorMessage || s.error_message ? '• ' + esc(s.errorMessage || s.error_message) : ''}</small></span></div>`).join('') || empty('Nenhum template enviado ainda.')}</article>
    <article class="card"><h3>Logs recentes de integrações</h3>${logs.slice(0,10).map((l:any)=>`<div class="list-row"><span><b>${esc(l.integration || 'integração')} • ${esc(l.status || '-')}</b><small>${dateTimeBR(l.createdAt || l.created_at)} — ${esc(l.message || '')}</small></span></div>`).join('') || empty('Nenhum log de integração ainda.')}</article>
    <p class="notice">Secrets continuam somente no backend/Railway. Esta tela não exibe tokens, access keys ou service role.</p>`);
}
function renderAutomations() { return panel('Motor de automações', `<button class="primary" data-action="run-automations">Rodar automações agora</button>`, `<div class="cards-grid">${data!.automations.map(a => `<article class="card"><span class="badge ${a.active?'ok':'warn'}">${a.active?'ativa':'inativa'}</span><h3>${esc(a.name)}</h3><p>${esc(a.triggerName)} → ${esc(a.channel)}</p><small>${esc(a.message)}</small></article>`).join('')}</div><article class="card"><h3>O que roda agora</h3>${alertLine('Cria notificações para pagamentos pendentes.')}${alertLine('Detecta alunos inativos e cria missão rápida.')}${alertLine('Registra logs para auditoria do personal/dev.')}</article>`); }

function renderTenantBranding() {
  const b = data!.tenantBranding || {};
  return panel('Marca, página pública e white label', `<button class="primary" data-modal="tenant-branding">Editar identidade</button>`, `<section class="grid-2"><article class="card hero-card"><span class="eyebrow">Página pública do personal</span><h2>${esc(b.headline || 'Acompanhamento fitness premium')}</h2><p>${esc(b.publicDescription || 'Configure a descrição pública do personal, CTA, cores e domínio futuro.')}</p><div class="info-grid vertical"><span>Slug público<b>${esc(b.publicSlug || '-')}</b></span><span>Domínio futuro<b>${esc(b.customDomain || 'não configurado')}</b></span><span>CTA WhatsApp<b>${esc(b.whatsappCta || '-')}</b></span></div><button class="ghost" data-action="copy-public-profile">Copiar link público</button></article><article class="card"><h3>Preview visual</h3><div class="brand-preview" style="--tenant-primary:${esc(b.primaryColor || '#00e676')};--tenant-accent:${esc(b.accentColor || '#16a34a')}"><b>${esc(data!.settings.brandName)}</b><span>${esc(b.publicSlug || 'slug')}</span><p>${esc(b.headline || 'Headline pública')}</p></div><p class="notice">White label completo com domínio próprio fica preparado; ativação final depende de DNS/produção.</p></article></section><article class="card"><h3>Status</h3>${alertLine('Marca e página pública agora possuem configuração persistida no backend.')}${alertLine('Domínio próprio fica em espera até configuração DNS.')}${alertLine('Nenhum segredo é exposto nesta tela.')}</article>`);
}
function renderMarketplace() {
  const coupons = data!.coupons || [];
  const refs = data!.referralCodes || [];
  return panel('Marketplace, cupons e indicações', `<button class="primary" data-modal="new-coupon">Novo cupom</button><button class="ghost" data-action="create-referral">Gerar indicação</button>`, `<section class="grid-2"><article class="card"><h3>Cupons ativos</h3>${coupons.map((c:any)=>`<div class="list-row"><span><b>${esc(c.code)}</b><small>${esc(c.description || '')} • ${c.discountType === 'fixed' ? money(c.discountValue) : `${c.discountValue}%`} • usos ${c.uses || 0}/${c.maxUses || '∞'}</small></span><span class="badge ${c.active?'ok':'warn'}">${c.active?'ativo':'inativo'}</span></div>`).join('') || empty('Nenhum cupom criado.')}</article><article class="card"><h3>Códigos de indicação</h3>${refs.map((r:any)=>`<div class="list-row"><span><b>${esc(r.code)}</b><small>${r.rewardPoints || 0} pts • ${r.discountPercent || 0}% desconto • usos ${r.uses || 0}/${r.maxUses || '∞'}</small></span><button class="ghost small" data-action="copy-referral" data-code="${esc(r.code)}">Copiar</button></div>`).join('') || empty('Nenhuma indicação criada.')}</article></section><article class="card"><h3>Regras de segurança</h3>${alertLine('Cupom é validado no backend antes de aplicar desconto.')}${alertLine('Indicações geram pontos apenas por regra auditável, sem clique infinito.')}${alertLine('Marketplace completo com produtos de terceiros fica para fase futura.')}</article>`);
}
function renderWearables() {
  const devices = data!.deviceConnections || [];
  const metrics = data!.healthMetrics || [];
  const today = metrics[0] || {};
  return panel('Wearables e métricas de saúde', `<button class="primary" data-modal="device-connect">Conectar manual</button><button class="ghost" data-modal="health-metric">Registrar métrica</button>`, `<section class="stats-grid">${stat('Passos', today.steps || 0, today.metricDate || 'sem registro')}${stat('Calorias', today.calories || 0, 'estimativa')}${stat('Min. ativos', today.activeMinutes || 0, 'atividade')}${stat('Sono', `${today.sleepHours || 0}h`, 'recuperação')}</section><section class="grid-2"><article class="card"><h3>Dispositivos conectados</h3>${devices.map((d:any)=>`<div class="list-row"><span><b>${esc(d.provider)}</b><small>${esc(d.status)} • último sync ${dateTimeBR(d.lastSyncAt)}</small></span><span class="badge ok">ativo</span></div>`).join('') || empty('Nenhum dispositivo conectado.')}</article><article class="card"><h3>Histórico de métricas</h3>${metrics.slice(0,8).map((m:any)=>`<div class="list-row"><span><b>${dateBR(m.metricDate)}</b><small>${m.steps || 0} passos • ${m.activeMinutes || 0} min • sono ${m.sleepHours || 0}h</small></span></div>`).join('') || empty('Sem métricas registradas.')}</article></section><p class="notice">Google Fit, Apple Health, Fitbit, Garmin e Samsung Health ficam preparados como conectores futuros. Esta sprint adiciona base segura/manual sem coletar dados sem consentimento.</p>`);
}
function renderSettings() { return panel('Configurações do site', '', `<form class="card form-grid" data-form="settings"><label>Marca<input name="brandName" value="${esc(data!.settings.brandName)}"></label><label>Cor principal<input name="primaryColor" value="${esc(data!.settings.primaryColor)}"></label><label>Cor secundária<input name="secondaryColor" value="${esc(data!.settings.secondaryColor)}"></label><label>WhatsApp<input name="whatsapp" value="${esc(data!.settings.whatsapp)}"></label><button class="primary">Salvar configurações</button></form>`); }
function renderLogs() { return panel('Auditoria e segurança', '', `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Ação</th><th>Entidade</th><th>Meta</th></tr></thead><tbody>${data!.auditLogs.map(l => `<tr><td>${dateTimeBR(l.createdAt)}</td><td>${esc(l.action)}</td><td>${esc(l.entity)} / ${esc(l.entityId)}</td><td>${esc(l.metadata)}</td></tr>`).join('')}</tbody></table></div>`); }
function renderSystemStatus() {
  const status = data!.systemStatus || {};
  const sync = status.sync || { pending: 0, error: 0, synced: 0 };
  const active = (status.statuses || [])[0]?.status || 'fallback';
  return panel('Status do sistema', `<button class="primary" data-modal="ai-assistant">Diagnóstico IA</button><button class="ghost" data-action="sync-now">Sincronizar fallback</button>`, `<div class="cards-grid status-grid">${feature('🟢','Frontend Vercel','VITE_API_URL deve apontar para a API Railway.')}${feature('🟢','API Railway','Health check em /health e /api/health.')}${feature(active === 'supabase' ? '🟢' : '🟡','Banco principal','Supabase principal com SQLite fallback automático.')}${feature(sync.pending || sync.error ? '🟡' : '🟢','Fila de sincronização', `${sync.pending || 0} pendentes • ${sync.error || 0} com erro • ${sync.synced || 0} enviados.`)}${feature('📎','Storage privado','Supabase Storage principal com fallback local temporário para comprovantes.')}${feature('💳','Mercado Pago','Preference e webhook preparados no backend.')}${feature('🤖','IA','OpenAI server-side com fallback seguro.')}${feature((data!.googleConnections || []).some((g:any)=>g.status==='connected') ? '🟢' : '🟡','Google Calendar/Meet','OAuth server-side, criação de evento e link Meet para agendamentos.')}</div><article class="card"><h3>Últimos status internos</h3><div class="timeline">${(status.statuses || []).slice(0,6).map((it:any)=>`<div class="time-item"><time>${dateTimeBR(it.checkedAt || it.checked_at)}</time><div><b>${esc(it.key)}</b><p>${esc(it.status)} — ${esc(it.message || '')}</p></div></div>`).join('') || empty('Nenhum status registrado ainda.')}</div></article>`);
}
function renderPersonalManagement() { const trainers = (data as any)!.trainers || []; return panel('Personais da plataforma', `<button class="primary" data-modal="new-trainer">Criar personal</button>`, `<div class="cards-grid">${trainers.map((t:any) => `<article class="card trainer-admin-card">${renderAvatar(t,'profile-avatar')}<h3>${esc(t.name)}</h3><p>${esc(t.specialty || '')}</p><div class="info-grid vertical"><span>E-mail<b>${esc(t.email)}</b></span><span>Cidade<b>${esc(t.city || '-')} ${esc(t.state || '')}</b></span><span>Status<b>${t.active ? 'ativo' : 'inativo'}</b></span></div></article>`).join('') || empty('Nenhum personal cadastrado.')}</div>`); }
function renderWorkspaces() { return panel('SaaS multi-personal', '', `<div class="cards-grid">${(data!.workspaces || []).map((w:any) => `<article class="card"><h3>${esc(w.brandName || w.brand_name)}</h3><p>Slug: ${esc(w.slug)} • Plano ${esc(w.plan)} • ${esc(w.status)}</p><button class="ghost small" data-action="audit-workspace" data-id="${esc(w.id)}">Auditar workspace</button></article>`).join('')}</div>`); }
function renderGiveaways() {
  const rows = data!.students.map((s,i) => {
    const progress = challengeProgress(s.id); const chances = 1 + Math.floor((progress.points || 0) / 200) + (data!.posts.some(p => p.studentId === s.id) ? 1 : 0) + (data!.habits.some(h => h.studentId === s.id) ? 1 : 0);
    return `<tr><td><div class="person-cell">${renderAvatar(s,'small-avatar')}<span><b>${esc(s.name)}</b><small>${esc(s.goal || '')}</small></span></div></td><td>${progress.points} pts</td><td><span class="badge ok">${chances} chance(s)</span></td><td>${i===0 ? 'Aluno destaque da semana' : 'Elegível por engajamento'}</td></tr>`;
  }).join('');
  return panel('Sorteios do Dev e chances extras', `<button class="primary" data-modal="giveaway-rules">Criar sorteio</button>`, `<section class="grid-2"><article class="card"><h3>Sorteio Performance 30D</h3><p>Chances extras por treino, check-in, comunidade, avaliação e pagamento em dia. A regra antifraude final deve ser ligada ao backend na próxima fase.</p>${alertLine('1 chance base para aluno ativo.')}${alertLine('+1 chance por publicação/check-in válido.')}${alertLine('+1 chance a cada 200 pontos de engajamento.')}</article><article class="card"><h3>Aluno destaque da semana</h3><div class="spotlight-card">${renderAvatar(data!.students[0],'spotlight-avatar')}<div><b>${esc(data!.students[0]?.name || 'Aluno')}</b><p>Mais engajamento na temporada atual.</p><span class="badge ok">Destaque semanal</span></div></div></article></section><div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Pontos</th><th>Chances</th><th>Motivo</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}
function renderHelp() {
  return panel('Central de ajuda com IA', `<button class="primary" data-modal="ai-assistant">Abrir assistente</button>`, `<div class="cards-grid">${feature('🤖','Assistente IA','Tira dúvidas sobre uso do app, pagamentos, treinos e rotina. Não substitui personal, médico ou nutricionista.')}${feature('👤','Aluno','Como ver treinos, registrar avaliação, enviar comprovante e falar com o personal.')}${feature('🧑‍🏫','Personal','Como cadastrar aluno, criar treino, aprovar pagamento, usar Pulse e analisar riscos.')}${feature('🛡️','Segurança','Dados sensíveis, comprovantes privados, LGPD, logs e permissões por role.')}</div><article class="card ai-help-card"><h3>Perguntas rápidas</h3><div class="quick-grid"><button data-modal="ai-answer" data-id="pagamento">Como aprovar pagamento?</button><button data-modal="ai-answer" data-id="sumido">Como lidar com aluno sumido?</button><button data-modal="ai-answer" data-id="missao">Como funciona Missão do Dia?</button><button data-modal="ai-answer" data-id="sorteio">Como funcionam sorteios?</button></div></article>`);
}

function panel(title: string, actionHtml: string, body: string) { return `<section class="panel"><div class="panel-head"><div><span class="eyebrow">${esc(appBrandName())}</span><h2>${title}</h2></div><div>${actionHtml}</div></div>${body}</section>`; }
function empty(text: string) { return `<div class="empty">${esc(text)}</div>`; }
function renderFooter() {
  return `<footer class="footer footer-slim"><div class="footer-line"><b>FitPro Elite © 2026</b><span>·</span><a href="https://upaiva.dev/" target="_blank" rel="noopener">Desenvolvido por uPaiva</a><span>·</span><a data-modal="legal" data-id="termos">Termos</a><span>·</span><a data-modal="legal" data-id="privacidade">Privacidade</a><span>·</span><a data-modal="legal" data-id="lgpd">LGPD</a><span>·</span><a data-modal="legal" data-id="cookies">Cookies</a><span>·</span><a data-modal="legal" data-id="suporte">Suporte</a></div><div class="footer-line footer-warning">Acompanhamento fitness digital. Não substitui médico, nutricionista, fisioterapeuta ou profissional habilitado.</div></footer>`;
}



const WORKOUT_DRAFT_KEY = 'fitpro_workout_wizard_draft_v4';
const weekDays = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];

type MonthlyPlanTemplate = {
  key: string; name: string; goal: string; level: string; location: string; frequency: string; duration: string; equipment: string; badge: string; description: string;
  progressions: string[];
  pattern: any[];
};
function mpExercise(name:string, muscleGroup='corpo todo', sets='3', reps='10-12', rest='60s', notes='Execução controlada e técnica antes de carga.', equipment='') {
  return { name, muscleGroup, category: muscleGroup === 'cardio' ? 'cardio' : muscleGroup === 'mobilidade' ? 'mobilidade' : 'força', equipment, sets, reps, rest, notes, method: 'tradicional', cautions: 'Ajustar conforme histórico, dor, recuperação e nível do aluno.' };
}
function mpDay(dayType:string, name:string, focus:string, duration:string, exercises:any[] = [], notes = '') {
  return { dayType, name, focus, muscleGroup: focus.toLowerCase().includes('cardio') ? 'cardio' : focus.toLowerCase().includes('mobilidade') ? 'mobilidade' : 'corpo todo', intensity: dayType === 'descanso' ? 'leve' : 'moderada', estimatedDuration: duration, exercises, notes };
}
const MONTHLY_PLAN_TEMPLATES: MonthlyPlanTemplate[] = [
  { key:'hipertrofia_base_30d', name:'Hipertrofia Base 30D', goal:'hipertrofia', level:'iniciante/intermediário', location:'academia', frequency:'4x por semana', duration:'55 a 70 min', equipment:'academia completa', badge:'Mais usado', description:'Ganho de massa, adaptação ao volume e progressão técnica com divisão A/B/C/D.', progressions:['Semana 1: adaptação técnica, carga moderada e sem falha.','Semana 2: aumentar levemente carga ou 1 série nos principais.','Semana 3: maior intensidade mantendo boa execução.','Semana 4: consolidar e preparar revisão.'], pattern:[
    mpDay('treino','Treino A','Peito + tríceps','60 min',[mpExercise('Supino reto barra','peito','4','8-10','90s'),mpExercise('Supino inclinado halteres','peito','3','10-12','90s'),mpExercise('Crucifixo máquina','peito','3','12-15','60s'),mpExercise('Tríceps corda','tríceps','3','10-12','60s'),mpExercise('Tríceps francês','tríceps','3','10-12','60s'),mpExercise('Prancha','core','3','30-45s','45s')]),
    mpDay('treino','Treino B','Costas + bíceps','60 min',[mpExercise('Puxada frente','costas','4','8-10','90s'),mpExercise('Remada baixa','costas','3','10-12','90s'),mpExercise('Remada unilateral halter','costas','3','10 cada lado','75s'),mpExercise('Pulldown braço reto','costas','3','12','60s'),mpExercise('Rosca direta barra','bíceps','3','10','60s'),mpExercise('Rosca alternada','bíceps','3','10-12','60s')]),
    mpDay('descanso','Descanso ou mobilidade','Recuperação','15 min',[], 'Caminhada leve ou mobilidade, sem treino pesado.'),
    mpDay('treino','Treino C','Pernas completas','70 min',[mpExercise('Agachamento livre ou hack','quadríceps','4','8-10','120s'),mpExercise('Leg press','quadríceps','4','10-12','90s'),mpExercise('Cadeira extensora','quadríceps','3','12-15','60s'),mpExercise('Mesa flexora','posteriores','3','12','60s'),mpExercise('Stiff','posteriores','3','10-12','90s'),mpExercise('Elevação pélvica','glúteos','3','10-12','90s'),mpExercise('Panturrilha','panturrilhas','4','12-15','45s')]),
    mpDay('treino','Treino D','Ombros + core','55 min',[mpExercise('Desenvolvimento halteres','ombros','4','8-10','90s'),mpExercise('Elevação lateral','ombros','4','12-15','60s'),mpExercise('Crucifixo inverso','ombros','3','12-15','60s'),mpExercise('Abdominal infra','abdômen','3','12-15','45s'),mpExercise('Prancha lateral','core','3','20-30s cada lado','45s'),mpExercise('Dead bug','core','3','10 cada lado','45s')]),
    mpDay('cardio','Cardio leve opcional','Cardio','25 min',[mpExercise('Caminhada inclinada','cardio','1','20-25 min','-', 'Manter ritmo confortável.')]),
    mpDay('descanso','Descanso','Recuperação','-',[])
  ]},
  { key:'emagrecimento_condicionamento_30d', name:'Emagrecimento + Condicionamento 30D', goal:'emagrecimento', level:'iniciante/intermediário', location:'academia ou casa', frequency:'5x por semana', duration:'35 a 60 min', equipment:'academia adaptável', badge:'Condicionamento', description:'Musculação, cardio e circuito para gasto calórico sem abandonar força.', progressions:['Semana 1: ritmo moderado e aprender execução.','Semana 2: aumentar cardio em 5 minutos.','Semana 3: adicionar 1 rodada ou reduzir descanso.','Semana 4: manter intensidade controlada e revisar evolução.'], pattern:[
    mpDay('treino','Full Body A + cardio','Força + cardio','55 min',[mpExercise('Leg press','quadríceps','3','12','60s'),mpExercise('Supino máquina','peito','3','12','60s'),mpExercise('Puxada frente','costas','3','12','60s'),mpExercise('Remada baixa','costas','3','12','60s'),mpExercise('Prancha','core','3','30s','45s'),mpExercise('Esteira inclinada','cardio','1','15-20 min','-')]),
    mpDay('cardio','Cardio + core','Cardio + core','40 min',[mpExercise('Caminhada rápida ou bike','cardio','1','25-35 min','-'),mpExercise('Crunch','abdômen','3','15','30s'),mpExercise('Elevação de pernas','abdômen','3','12','30s'),mpExercise('Mountain climber controlado','core','3','30s','30s')]),
    mpDay('mobilidade','Descanso ativo','Mobilidade','20 min',[mpExercise('Mobilidade de quadril','mobilidade','3','10','30s'),mpExercise('Alongamento posterior','mobilidade','3','30s','30s')]),
    mpDay('treino','Full Body B + cardio','Força + cardio','55 min',[mpExercise('Agachamento goblet','quadríceps','3','12','60s'),mpExercise('Supino halteres','peito','3','12','60s'),mpExercise('Mesa flexora','posteriores','3','12','60s'),mpExercise('Desenvolvimento máquina','ombros','3','12','60s'),mpExercise('Bike','cardio','1','15-20 min','-')]),
    mpDay('treino','Circuito metabólico','Circuito','35 min',[mpExercise('Agachamento livre','quadríceps','4','12','60s'),mpExercise('Flexão inclinada','peito','4','10','60s'),mpExercise('Remada elástico ou baixa','costas','4','12','60s'),mpExercise('Polichinelo','cardio','4','30s','30s'),mpExercise('Prancha','core','4','30s','30s')]),
    mpDay('cardio','Cardio opcional','Cardio','30 min',[mpExercise('Caminhada leve','cardio','1','20-30 min','-')]),
    mpDay('descanso','Descanso','Recuperação','-',[])
  ]},
  { key:'forca_essencial_30d', name:'Força Essencial 30D', goal:'força', level:'iniciante/intermediário', location:'academia', frequency:'3x por semana', duration:'55 a 70 min', equipment:'barra, halteres e máquinas', badge:'Força base', description:'Progressão técnica em movimentos principais com descanso maior.', progressions:['Semana 1: técnica e carga confortável.','Semana 2: subir carga levemente se completar séries.','Semana 3: carga desafiadora com execução limpa.','Semana 4: consolidar sem forçar recorde máximo.'], pattern:[
    mpDay('treino','Força A','Agachamento + supino','65 min',[mpExercise('Agachamento','quadríceps','5','5','120s'),mpExercise('Supino reto','peito','5','5','120s'),mpExercise('Remada curvada ou máquina','costas','4','6-8','120s'),mpExercise('Prancha','core','3','40s','45s')]), mpDay('mobilidade','Mobilidade leve','Mobilidade','20 min',[mpExercise('Mobilidade de quadril','mobilidade','3','10','30s')]),
    mpDay('treino','Força B','Terra + ombros','65 min',[mpExercise('Levantamento terra técnico','posteriores','4','5','150s'),mpExercise('Desenvolvimento militar','ombros','5','5','120s'),mpExercise('Puxada frente ou barra assistida','costas','4','6-8','120s'),mpExercise('Dead bug','core','3','10 cada lado','45s')]), mpDay('descanso','Descanso','Recuperação','-',[]),
    mpDay('treino','Força C','Hack + remada','65 min',[mpExercise('Hack machine ou agachamento frontal','quadríceps','4','6','120s'),mpExercise('Supino inclinado','peito','4','6-8','120s'),mpExercise('Remada baixa','costas','4','8','90s'),mpExercise('Stiff','posteriores','3','8','120s'),mpExercise('Abdominal infra','abdômen','3','12','45s')]), mpDay('descanso','Descanso','Recuperação','-',[]), mpDay('descanso','Descanso','Recuperação','-',[])
  ]},
  { key:'iniciante_total_30d', name:'Iniciante Total 30D', goal:'saúde geral', level:'iniciante', location:'academia ou casa', frequency:'3 treinos + 2 dias leves', duration:'25 a 50 min', equipment:'adaptável', badge:'Primeira ficha', description:'Cria rotina e técnica sem excesso de volume.', progressions:['Semana 1: aprender movimentos.','Semana 2: aumentar uma série em exercícios seguros.','Semana 3: subir levemente carga ou reps.','Semana 4: manter consistência e revisar.'], pattern:[
    mpDay('treino','Full Body A','Corpo todo','45 min',[mpExercise('Leg press ou agachamento no banco','quadríceps','3','12','60s'),mpExercise('Supino máquina ou flexão na parede','peito','3','12','60s'),mpExercise('Puxada frente ou remada elástico','costas','3','12','60s'),mpExercise('Prancha curta','core','3','20s','45s')]), mpDay('cardio','Caminhada leve','Cardio','25 min',[mpExercise('Caminhada leve','cardio','1','15-30 min','-')]), mpDay('treino','Full Body B','Corpo todo','45 min',[mpExercise('Agachamento goblet leve','quadríceps','3','12','60s'),mpExercise('Remada baixa','costas','3','12','60s'),mpExercise('Supino halteres leve','peito','3','12','60s'),mpExercise('Abdominal crunch','abdômen','3','12','45s')]), mpDay('mobilidade','Mobilidade','Mobilidade','20 min',[mpExercise('Mobilidade de quadril','mobilidade','3','10','30s'),mpExercise('Alongamento leve','mobilidade','3','30s','30s')]), mpDay('treino','Full Body C','Corpo todo','45 min',[mpExercise('Hack ou agachamento assistido','quadríceps','3','10','60s'),mpExercise('Puxada neutra','costas','3','12','60s'),mpExercise('Crucifixo máquina leve','peito','3','12','60s'),mpExercise('Tríceps corda','tríceps','2','12','60s')]), mpDay('cardio','Caminhada opcional','Cardio','20 min',[mpExercise('Caminhada leve','cardio','1','20 min','-')]), mpDay('descanso','Descanso','Recuperação','-',[])
  ]},
  { key:'casa_sem_equipamento_30d', name:'Casa Sem Equipamento 30D', goal:'condicionamento', level:'iniciante/intermediário', location:'casa', frequency:'4x por semana', duration:'25 a 45 min', equipment:'peso corporal', badge:'Casa', description:'Peso corporal para resistência, consistência e condicionamento.', progressions:['Semana 1: movimentos básicos.','Semana 2: aumentar repetições.','Semana 3: aumentar uma rodada.','Semana 4: reduzir descanso ou usar variação mais difícil.'], pattern:[
    mpDay('treino','Corpo todo A','Peso corporal','40 min',[mpExercise('Agachamento livre','quadríceps','4','12','45s'),mpExercise('Flexão inclinada','peito','4','8-12','60s'),mpExercise('Afundo alternado','quadríceps','3','10 cada perna','60s'),mpExercise('Ponte de glúteo','glúteos','3','15','45s'),mpExercise('Prancha','core','3','30s','45s')]), mpDay('cardio','Core + cardio','Core + cardio','35 min',[mpExercise('Corrida parada','cardio','4','40s','30s'),mpExercise('Mountain climber','core','3','30s','30s'),mpExercise('Abdominal bicicleta','abdômen','3','20','30s')]), mpDay('descanso','Descanso','Recuperação','-',[]), mpDay('treino','Corpo todo B','Peso corporal','40 min',[mpExercise('Agachamento sumô','glúteos','4','12','45s'),mpExercise('Flexão joelhos/tradicional','peito','4','8-12','60s'),mpExercise('Superman','lombar','3','12','45s'),mpExercise('Elevação pélvica unilateral','glúteos','3','10 cada lado','45s')]), mpDay('treino','Pernas + glúteos','Inferiores','40 min',[mpExercise('Agachamento com pausa','quadríceps','4','10','60s'),mpExercise('Afundo curto','quadríceps','3','10 cada perna','60s'),mpExercise('Ponte de glúteo','glúteos','4','15','45s'),mpExercise('Panturrilha em pé','panturrilhas','4','15','30s')]), mpDay('cardio','Cardio opcional','Cardio','25 min',[mpExercise('Caminhada leve','cardio','1','20-30 min','-')]), mpDay('descanso','Descanso','Recuperação','-',[])
  ]},
  { key:'mobilidade_postura_core_30d', name:'Mobilidade, Postura e Core 30D', goal:'mobilidade', level:'todos', location:'casa ou academia', frequency:'4x por semana', duration:'20 a 40 min', equipment:'colchonete/elástico opcional', badge:'Recuperação', description:'Mobilidade, postura, estabilidade e recuperação.', progressions:['Semana 1: aprender movimentos.','Semana 2: aumentar tempo de permanência.','Semana 3: melhorar amplitude.','Semana 4: consolidar rotina.'], pattern:[
    mpDay('mobilidade','Quadril + coluna','Mobilidade','30 min',[mpExercise('Mobilidade de quadril','mobilidade','3','10','30s'),mpExercise('Alongamento flexores do quadril','mobilidade','3','30s','30s'),mpExercise('Mobilidade torácica','mobilidade','3','10','30s'),mpExercise('Ponte de glúteo','glúteos','3','15','45s')]), mpDay('mobilidade','Ombros + escápulas','Mobilidade','30 min',[mpExercise('Rotação externa ombro','ombros','3','15','30s'),mpExercise('Face pull com elástico','ombros','3','15','30s'),mpExercise('Alongamento peitoral','mobilidade','3','30s','30s')]), mpDay('descanso','Descanso','Recuperação','-',[]), mpDay('treino','Core + lombar','Core','30 min',[mpExercise('Dead bug','core','3','10 cada lado','30s'),mpExercise('Bird dog','core','3','10 cada lado','30s'),mpExercise('Superman controlado','lombar','3','12','45s'),mpExercise('Prancha lateral','core','3','20s','45s')]), mpDay('mobilidade','Mobilidade geral','Mobilidade','30 min',[mpExercise('Mobilidade de tornozelo','mobilidade','3','10','30s'),mpExercise('Alongamento posterior','mobilidade','3','30s','30s'),mpExercise('Respiração diafragmática','mobilidade','1','3 min','-')]), mpDay('cardio','Caminhada leve opcional','Cardio','20 min',[mpExercise('Caminhada leve','cardio','1','10-20 min','-')]), mpDay('descanso','Descanso','Recuperação','-',[])
  ]},
  { key:'gluteos_pernas_30d', name:'Glúteos e Pernas 30D', goal:'hipertrofia', level:'iniciante/intermediário', location:'academia', frequency:'4x por semana', duration:'55 a 70 min', equipment:'academia', badge:'Inferiores', description:'Ênfase em membros inferiores, glúteos e manutenção de superiores.', progressions:['Semana 1: carga moderada e técnica.','Semana 2: aumentar volume em glúteos/pernas.','Semana 3: maior intensidade com execução segura.','Semana 4: consolidar e revisar.'], pattern:[
    mpDay('treino','Pernas A','Quadríceps','65 min',[mpExercise('Agachamento livre ou hack','quadríceps','4','8-10','120s'),mpExercise('Leg press','quadríceps','4','10-12','90s'),mpExercise('Cadeira extensora','quadríceps','4','12-15','60s'),mpExercise('Afundo','quadríceps','3','10 cada perna','60s'),mpExercise('Panturrilha em pé','panturrilhas','4','15','45s')]), mpDay('treino','Superiores manutenção','Superiores','50 min',[mpExercise('Puxada frente','costas','3','10','75s'),mpExercise('Supino máquina','peito','3','10','75s'),mpExercise('Remada baixa','costas','3','12','75s'),mpExercise('Desenvolvimento halteres','ombros','3','10','75s')]), mpDay('descanso','Descanso ou mobilidade','Recuperação','20 min',[]), mpDay('treino','Pernas B','Posteriores + glúteos','70 min',[mpExercise('Stiff','posteriores','4','8-10','120s'),mpExercise('Mesa flexora','posteriores','4','10-12','90s'),mpExercise('Elevação pélvica','glúteos','4','10-12','90s'),mpExercise('Abdução máquina','glúteos','3','15','60s'),mpExercise('Panturrilha sentada','panturrilhas','4','15','45s')]), mpDay('treino','Glúteos + core','Glúteos + core','60 min',[mpExercise('Elevação pélvica','glúteos','4','10','90s'),mpExercise('Agachamento sumô','glúteos','3','12','75s'),mpExercise('Coice na polia','glúteos','3','12 cada perna','60s'),mpExercise('Ponte de glúteo','glúteos','3','15','45s'),mpExercise('Prancha lateral','core','3','30s','45s')]), mpDay('cardio','Cardio leve opcional','Cardio','25 min',[mpExercise('Caminhada leve','cardio','1','20-30 min','-')]), mpDay('descanso','Descanso','Recuperação','-',[])
  ]}
];
function monthlyPlanByKey(key='') { return MONTHLY_PLAN_TEMPLATES.find(p => p.key === key) || null; }
function buildMonthlyPlanDays(plan: MonthlyPlanTemplate, startDate='') {
  const start = startDate || todayISO();
  return Array.from({ length: 30 }, (_, index) => {
    const week = Math.floor(index / 7) + 1;
    const dayBase = plan.pattern[index % 7] || mpDay('descanso','Descanso','Recuperação','-',[]);
    const progression = plan.progressions[Math.min(week - 1, plan.progressions.length - 1)] || '';
    const dateIso = addDaysClient(start, index);
    const date = new Date(`${dateIso}T12:00:00`);
    const weekday = weekDays[index % 7];
    return {
      weekday,
      date: dateIso,
      trainingDate: dateIso,
      dayNumber: index + 1,
      dayType: dayBase.dayType,
      name: dayBase.name,
      focus: dayBase.focus,
      muscleGroup: dayBase.muscleGroup,
      intensity: week >= 3 && dayBase.dayType === 'treino' ? 'alta' : dayBase.intensity,
      estimatedDuration: dayBase.estimatedDuration,
      notes: `${dayBase.notes || ''}${dayBase.notes ? ' · ' : ''}Semana ${week}: ${progression} · Data: ${date.toLocaleDateString('pt-BR')}`,
      order: index + 1,
      exercises: (dayBase.exercises || []).map((ex:any, exIndex:number) => cloneWorkoutExercise({ ...ex, notes: `${ex.notes || ''} ${progression}`.trim() }, exIndex + 1))
    };
  });
}
function workoutTemplateFull(key = '') { return ((data as any)?.workoutTemplates || []).find((t:any) => t.key === key) || null; }
function cloneWorkoutExercise(ex:any = {}, order = 1) {
  return {
    exerciseId: ex.id || ex.exerciseId || ex.exercise_id || '',
    name: ex.name || '', muscleGroup: ex.muscleGroup || ex.muscle_group || '', category: ex.category || ex.objectiveRecommended || ex.objective_recommended || 'hipertrofia', equipment: ex.equipment || '',
    level: ex.level || 'iniciante', sets: ex.sets || ex.defaultSets || ex.default_sets || '3', reps: ex.reps || ex.defaultReps || ex.default_reps || '10-12', load: ex.load || '', rest: ex.rest || ex.restSeconds || ex.rest_seconds || ex.defaultRest || ex.default_rest || '60s',
    tempo: ex.tempo || '', rpe: ex.rpe || '', rir: ex.rir || '', method: ex.method || 'tradicional', notes: ex.notes || ex.executionNotes || ex.execution_notes || ex.description || '', cautions: ex.cautions || '', substitutions: ex.substitutions || '', order
  };
}
function templateWeekdayIndexes(template:any) {
  const key = String(template?.key || '').toLowerCase();
  if (key.includes('adaptacao_7')) return [0,1,2,3,4,5,6];
  if (key.includes('abcd')) return [0,1,3,4];
  if (key.includes('emagrecimento')) return [0,1,3,5];
  return [0,2,4];
}
function makeEmptyWorkoutWeek() {
  return weekDays.map((weekday, index) => ({ weekday, dayType: index === 0 ? 'treino' : 'descanso', name: index === 0 ? 'Treino A' : 'Descanso', focus: index === 0 ? 'Corpo todo' : 'Recuperação', muscleGroup: index === 0 ? 'corpo todo' : 'mobilidade', intensity: index === 0 ? 'moderada' : 'leve', estimatedDuration: index === 0 ? '60 min' : '-', notes: index === 0 ? '' : 'Recuperação, caminhada leve ou mobilidade se indicado.', order: index + 1, exercises: [] }));
}
function scheduledTemplateDays(template:any) {
  const week = makeEmptyWorkoutWeek();
  const indexes = templateWeekdayIndexes(template);
  (template?.days || []).forEach((day:any, i:number) => {
    const idx = indexes[i] ?? i;
    if (!week[idx]) return;
    week[idx] = {
      weekday: weekDays[idx], dayType: (day.exercises || []).length ? 'treino' : (day.dayType || 'descanso'), name: day.name || `Treino ${String.fromCharCode(65+i)}`,
      focus: day.focus || '', muscleGroup: day.muscleGroup || day.muscle_group || 'corpo todo', intensity: day.intensity || 'moderada', estimatedDuration: day.estimatedDuration || day.duration || template?.duration || template?.estimatedDuration || '60 min',
      notes: day.notes || '', order: idx + 1, exercises: (day.exercises || []).map((ex:any, exIndex:number) => cloneWorkoutExercise(ex, exIndex + 1))
    };
  });
  return week;
}
function readWorkoutDraft() { try { return JSON.parse(localStorage.getItem(WORKOUT_DRAFT_KEY) || 'null'); } catch { return null; } }
function writeWorkoutDraft(draft:any) { try { localStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() })); } catch {} }
function clearWorkoutDraft() { try { localStorage.removeItem(WORKOUT_DRAFT_KEY); } catch {} }
function renderExerciseEditor(ex:any, dayIndex:number, exIndex:number) {
  return `<div class="workout-exercise-edit" data-exercise-index="${exIndex}"><div><b>${esc(ex.name || 'Exercício')}</b><small>${esc(ex.muscleGroup || '')} • ${esc(ex.sets || '3')}x ${esc(ex.reps || '10-12')} • descanso ${esc(ex.rest || '60s')}</small></div><div class="mini-actions"><button type="button" class="ghost tiny" data-wizard-exercise-move="up">↑</button><button type="button" class="ghost tiny" data-wizard-exercise-move="down">↓</button><button type="button" class="ghost tiny" data-wizard-exercise-duplicate>Duplicar</button><button type="button" class="danger tiny" data-wizard-exercise-remove>Remover</button></div><div class="form-grid compact-form"><label>Nome<input data-ex-field="name" value="${esc(ex.name || '')}"></label><label>Grupo<select data-ex-field="muscleGroup">${optionList(muscleGroups, ex.muscleGroup || '')}</select></label><label>Séries<input data-ex-field="sets" value="${esc(ex.sets || '')}"></label><label>Reps/tempo<input data-ex-field="reps" value="${esc(ex.reps || '')}"></label><label>Carga<input data-ex-field="load" value="${esc(ex.load || '')}"></label><label>Descanso<input data-ex-field="rest" value="${esc(ex.rest || '')}"></label><label>Técnica/observação<textarea data-ex-field="notes">${esc(ex.notes || '')}</textarea></label><label>Cuidados<textarea data-ex-field="cautions">${esc(ex.cautions || '')}</textarea></label></div></div>`;
}
function renderWizardWeek(days:any[] = makeEmptyWorkoutWeek()) {
  return `<div class="weekday-tabs">${days.map((d:any,i:number)=>`<button type="button" class="weekday-tab ${i===0?'active':''}" data-wizard-day-jump="${i}">${esc(String(d.weekday || weekDays[i]).slice(0,3))}</button>`).join('')}</div><div class="workout-day-grid weekly-editor">${days.map((d:any,i:number)=>`<article class="mini-form-card workout-day-card" data-wizard-day="${i}"><div class="card-head"><h4>${esc(d.weekday || weekDays[i])}</h4><span class="badge ${d.dayType === 'treino' ? 'ok' : 'warn'}">${esc(d.dayType || 'treino')}</span></div><div class="form-grid compact-form"><label>Tipo<select data-day-field="dayType"><option value="treino" ${d.dayType==='treino'?'selected':''}>Treino</option><option value="descanso" ${d.dayType==='descanso'?'selected':''}>Descanso</option><option value="cardio" ${d.dayType==='cardio'?'selected':''}>Cardio</option><option value="mobilidade" ${d.dayType==='mobilidade'?'selected':''}>Mobilidade</option><option value="alongamento" ${d.dayType==='alongamento'?'selected':''}>Alongamento</option><option value="recuperacao" ${d.dayType==='recuperacao'?'selected':''}>Recuperação</option><option value="opcional" ${d.dayType==='opcional'?'selected':''}>Treino opcional</option></select></label><label>Nome<input data-day-field="name" value="${esc(d.name || '')}"></label><label>Foco<input data-day-field="focus" value="${esc(d.focus || '')}"></label><label>Grupo<select data-day-field="muscleGroup">${optionList(muscleGroups, d.muscleGroup || '')}</select></label><label>Intensidade<select data-day-field="intensity"><option ${d.intensity==='leve'?'selected':''}>leve</option><option ${d.intensity==='moderada'?'selected':''}>moderada</option><option ${d.intensity==='alta'?'selected':''}>alta</option></select></label><label>Duração<input data-day-field="estimatedDuration" value="${esc(d.estimatedDuration || '')}"></label></div><label>Observações<textarea data-day-field="notes">${esc(d.notes || '')}</textarea></label><div class="exercise-list editable-exercises" data-day-exercises>${(d.exercises || []).map((ex:any, exIndex:number)=>renderExerciseEditor(ex, i, exIndex)).join('') || '<div class="empty">Nenhum exercício neste dia ainda.</div>'}</div></article>`).join('')}</div>`;
}
function collectWizardDays(form: HTMLFormElement) {
  return Array.from(form.querySelectorAll<HTMLElement>('[data-wizard-day]')).map((dayEl, i) => {
    const day:any = { weekday: weekDays[i], order: i + 1, exercises: [] };
    dayEl.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('[data-day-field]').forEach(input => { day[input.dataset.dayField || ''] = input.value; });
    dayEl.querySelectorAll<HTMLElement>('[data-exercise-index]').forEach((exEl, exIndex) => {
      const ex:any = { order: exIndex + 1 };
      exEl.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('[data-ex-field]').forEach(input => { ex[input.dataset.exField || ''] = input.value; });
      if (ex.name) day.exercises.push(ex);
    });
    return day;
  });
}
function applyWorkoutDaysToForm(form: HTMLFormElement, days:any[]) {
  const wrap = form.querySelector<HTMLElement>('[data-weekly-days]');
  if (wrap) wrap.innerHTML = renderWizardWeek(days);
  const hidden = form.querySelector<HTMLInputElement>('[data-days-json]');
  if (hidden) hidden.value = JSON.stringify(days);
}
function collectWorkoutWizardDraft(form: HTMLFormElement) {
  const fd = new FormData(form); const draft:any = {};
  fd.forEach((value, key) => { if (!(value instanceof File)) draft[key] = value; });
  draft.days = collectWizardDays(form);
  draft.currentStep = Number(form.dataset.step || 1);
  return draft;
}
function fillWorkoutFormFromDraft(form: HTMLFormElement, draft:any) {
  Object.entries(draft || {}).forEach(([key,value]) => {
    const input = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (input && typeof value !== 'object') input.value = String(value ?? '');
  });
  if (Array.isArray(draft?.days)) applyWorkoutDaysToForm(form, draft.days);
  showWorkoutWizardStep(form, Number(draft?.currentStep || 1));
}
function showWorkoutWizardStep(form: HTMLFormElement, step:number) {
  const safe = Math.max(1, Math.min(5, step)); form.dataset.step = String(safe);
  form.querySelectorAll<HTMLElement>('.wizard-section').forEach(sec => sec.classList.toggle('active', Number(sec.dataset.step) === safe));
  form.querySelectorAll<HTMLElement>('.wizard-steps span').forEach((el, idx) => el.classList.toggle('active', idx + 1 === safe));
  const prev = form.querySelector<HTMLButtonElement>('[data-wizard-prev]'); if (prev) prev.disabled = safe <= 1;
  const next = form.querySelector<HTMLButtonElement>('[data-wizard-next]'); if (next) next.style.display = safe >= 5 ? 'none' : '';
  const publish = form.querySelector<HTMLElement>('[data-wizard-publish-actions]'); if (publish) publish.style.display = safe >= 5 ? '' : 'none';
}
function optionList(values:string[], selected='') { return values.map(v => `<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join(''); }
function safeFormValue(value:any = '') { return esc(String(value ?? '')); }
function planToWizardDays(plan:any) {
  const base = makeEmptyWorkoutWeek();
  const normalized = (plan?.days || []).map((day:any, index:number) => ({
    weekday: day.weekday || day.weekDay || weekDays[Math.max(0, Number(day.dayOrder || day.day_order || index + 1) - 1)] || weekDays[index] || 'Segunda',
    dayType: day.dayType || day.day_type || ((day.exercises || []).length ? 'treino' : 'descanso'),
    name: day.name || `Treino ${String.fromCharCode(65 + index)}`,
    focus: day.focus || '',
    muscleGroup: day.muscleGroup || day.muscle_group || 'corpo todo',
    intensity: day.intensity || 'moderada',
    estimatedDuration: day.estimatedDuration || day.estimated_duration || plan?.estimatedDuration || plan?.estimated_duration || '60 min',
    notes: day.notes || '',
    order: Number(day.dayOrder || day.day_order || index + 1),
    id: day.id || '',
    exercises: (day.exercises || []).map((ex:any, exIndex:number) => cloneWorkoutExercise({
      ...ex,
      exerciseId: ex.exerciseId || ex.exercise_id || ex.id,
      rest: ex.rest || ex.restSeconds || ex.rest_seconds,
      muscleGroup: ex.muscleGroup || ex.muscle_group,
      notes: ex.notes || ex.executionNotes || ex.execution_notes
    }, exIndex + 1))
  }));
  normalized.forEach((day:any, index:number) => {
    const byName = weekDays.findIndex(w => String(w).toLowerCase() === String(day.weekday || '').toLowerCase());
    const byOrder = Math.max(0, Number(day.order || index + 1) - 1);
    const target = byName >= 0 ? byName : byOrder;
    if (base[target]) base[target] = { ...base[target], ...day, order: target + 1 };
  });
  return base;
}
function renderWorkoutCreatorModal(editPlan:any = null) {
  const templates = (data as any).workoutTemplates || [];
  const students = data!.students || [];
  const isEdit = !!editPlan;
  const draft = isEdit ? null : readWorkoutDraft();
  const initialDays = isEdit ? planToWizardDays(editPlan) : (draft?.days || makeEmptyWorkoutWeek());
  const selectedStudent = isEdit ? (editPlan.studentId || editPlan.student_id || '') : '';
  const selectedTemplate = isEdit ? (editPlan.sourceTemplate || editPlan.source_template || editPlan.templateKey || '') : '';
  const selectedType = isEdit ? (editPlan.type || 'personalizada') : 'personalizada';
  const selectedObjective = isEdit ? (editPlan.objective || editPlan.goal || '') : '';
  const selectedLevel = isEdit ? (editPlan.level || 'iniciante') : '';
  const selectedModality = isEdit ? (editPlan.modality || 'academia') : '';
  const selectedLocation = isEdit ? (editPlan.location || 'academia completa') : '';
  const selectedFrequency = isEdit ? (editPlan.frequencyPerWeek || editPlan.frequency_per_week || '3x por semana') : '3x por semana';
  const selectedDuration = isEdit ? (editPlan.estimatedDuration || editPlan.estimated_duration || '60 min') : '60 min';
  const selectedStatus = isEdit ? (editPlan.status || 'rascunho') : 'rascunho';
  const editNotice = isEdit ? `<div class="draft-resume edit-resume"><b>Editando ficha existente</b><small>v${esc(editPlan.version || 1)} • alterações serão versionadas no backend</small><button type="button" class="ghost small" data-modal="workout-plan" data-id="${esc(editPlan.id)}">Voltar para ficha</button></div>` : '';
  return `<h2>${isEdit ? 'Editar ficha de treino profissional' : 'Criar ficha de treino profissional'}</h2>
  <p class="notice">Sprint 25: editor em etapas para ficha existente, visão do aluno mais limpa e gestão real de treinos. Os modelos são sugestões gerais e devem ser ajustados pelo profissional conforme histórico, limitações, objetivo e condição física do aluno.</p>
  ${editNotice}
  ${draft ? `<div class="draft-resume"><b>Rascunho automático encontrado</b><small>Última alteração: ${dateTimeBR(draft.updatedAt)}</small><button type="button" class="primary small" data-load-workout-draft>Continuar rascunho</button><button type="button" class="ghost small" data-clear-workout-draft>Descartar</button></div>` : ''}
  <form data-form="workout" class="workout-wizard workout-wizard-v2" data-step="1" data-mode="${isEdit ? 'edit' : 'create'}" data-plan-id="${esc(editPlan?.id || '')}">
    <input type="hidden" name="daysJson" data-days-json value="${esc(JSON.stringify(initialDays))}">
    <div class="wizard-steps"><span class="active">1 Dados</span><span>2 Semana</span><span>3 Exercícios</span><span>4 Progressão</span><span>5 Revisão</span></div>
    <section class="wizard-section active" data-step="1"><h3>1. Dados gerais</h3><div class="form-grid">
      <label>Aluno<select name="studentId"><option value="">Modelo sem aluno</option>${students.map(s => `<option value="${s.id}" ${s.id === selectedStudent ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label>Template<select name="templateKey" data-workout-template-select><option value="">Começar do zero</option>${templates.map((t:any) => `<option value="${esc(t.key)}" ${t.key === selectedTemplate ? 'selected' : ''}>${esc(t.title)} • ${esc(t.frequency)}</option>`).join('')}</select></label>
      <label>Tipo de ficha<select name="type">${optionList(['personalizada','provisória','modelo/template','treino de adaptação','manutenção','retorno após pausa'], selectedType)}</select></label>
      <label>Título<input name="title" required placeholder="Ex.: Hipertrofia ABC — revisão maio" value="${safeFormValue(editPlan?.title || '')}"></label>
      <label>Objetivo<select name="objective">${optionList(objectiveOptions, selectedObjective)}</select></label>
      <label>Nível<select name="level">${optionList(['iniciante','intermediario','avancado','atleta','retorno após pausa'], selectedLevel)}</select></label>
      <label>Modalidade<select name="modality">${optionList(['academia','casa','casa ou academia','ar livre','online','presencial','híbrido'], selectedModality)}</select></label>
      <label>Local<select name="location">${optionList(['academia completa','academia simples','casa sem equipamentos','casa com halteres','casa com elásticos','condomínio','parque','estúdio do personal'], selectedLocation)}</select></label>
      <label>Frequência<select name="frequencyPerWeek">${optionList(['1x por semana','2x por semana','3x por semana','4x por semana','5x por semana','6x por semana','7 dias leves','personalizado'], selectedFrequency)}</select></label>
      <label>Duração<select name="estimatedDuration">${optionList(['15 a 35 min','30 min','35 a 45 min','45 a 60 min','60 min','60 a 75 min','90 min'], selectedDuration)}</select></label>
      <label>Início<input name="startDate" type="date" value="${safeFormValue(editPlan?.startDate || editPlan?.start_date || '')}"></label><label>Revisão<input name="reviewDate" type="date" value="${safeFormValue(editPlan?.reviewDate || editPlan?.review_date || '')}"></label>
      <label>Status<select name="status">${optionList(['rascunho','ativo','pausado','em_revisao','arquivado'], selectedStatus)}</select></label>
    </div><p class="notice">Ao escolher um template, a semana, exercícios, séries, reps, descanso e observações são carregados automaticamente e continuam editáveis.</p></section>
    <section class="wizard-section" data-step="2"><h3>2. Estrutura semanal</h3><div data-weekly-days>${renderWizardWeek(initialDays)}</div></section>
    <section class="wizard-section" data-step="3"><h3>3. Exercícios e biblioteca</h3><p class="notice">Escolha o dia ativo, filtre a biblioteca e clique em “Adicionar ao treino”. O exercício entra no dia selecionado e será salvo no backend ao salvar/publicar.</p><div class="library-filters"><select data-active-day-select>${weekDays.map((d,i)=>`<option value="${i}">${esc(d)}</option>`).join('')}</select><input data-wizard-library-search placeholder="Buscar exercício"><select data-wizard-library-filter="muscle"><option value="">Todos grupos</option>${muscleGroups.map(g=>`<option>${esc(g)}</option>`).join('')}</select></div><div class="exercise-library-list wizard-library">${((data as any).exerciseLibrary || []).slice(0,180).map((e:any)=>`<div class="library-item wizard-library-item" data-name="${esc([e.name,e.muscleGroup,e.equipment,e.level,e.category].join(' ').toLowerCase())}" data-muscle="${esc(String(e.muscleGroup || '').toLowerCase())}"><div><b>${esc(e.name)}</b><small>${esc(e.muscleGroup || '')} • ${esc(e.equipment || '')} • ${esc(e.level || '')}</small><p>${esc(e.executionNotes || e.description || e.cautions || '')}</p></div><button type="button" class="primary small" data-add-library-exercise="${esc(e.id || e.name)}">Adicionar ao treino</button></div>`).join('') || empty('A biblioteca será preenchida conforme os templates e exercícios personalizados.')}</div></section>
    <section class="wizard-section" data-step="4"><h3>4. Progressão, segurança e qualidade</h3><div class="form-grid"><label>Regra de progressão<textarea name="progressionRule" placeholder="Quando bater 12 reps em todas as séries com boa execução, sugerir aumento gradual de carga.">${esc(editPlan?.progressionRule || editPlan?.progression_rule || '')}</textarea></label><label>Frequência de revisão<select name="reviewFrequency">${optionList(['7 dias','14 dias','30 dias','manual'], editPlan?.reviewFrequency || editPlan?.review_frequency || '30 dias')}</select></label><label>Ajuste de carga<textarea name="loadAdjustment">${esc(editPlan?.loadAdjustment || editPlan?.load_adjustment || '')}</textarea></label><label>Aquecimento<textarea name="warmup">${esc(editPlan?.warmup || '')}</textarea></label><label>Cardio<textarea name="cardio">${esc(editPlan?.cardio || '')}</textarea></label><label>Alongamento final<textarea name="cooldown">${esc(editPlan?.cooldown || '')}</textarea></label><label>Equipamentos necessários<textarea name="equipmentNeeded">${esc(editPlan?.equipmentNeeded || editPlan?.equipment_needed || '')}</textarea></label><label>Avisos de segurança<textarea name="safetyNotes" placeholder="Restrições, dor, execução técnica e limites.">${esc(editPlan?.safetyNotes || editPlan?.safety_notes || '')}</textarea></label><label>Mensagem motivacional<textarea name="motivationalMessage">${esc(editPlan?.motivationalMessage || editPlan?.motivational_message || '')}</textarea></label></div></section>
    <section class="wizard-section review-section" data-step="5"><h3>5. Revisão e publicação</h3><div data-workout-review class="workout-review-box"></div>${alertLine('Checklist: aluno/modelo, objetivo, pelo menos 1 dia de treino e exercícios configurados.')}${alertLine('Modelos são sugestões gerais. O personal deve revisar e adaptar antes de publicar.')}${alertLine('Aluno verá a ficha limpa por hoje/próximo treino/semana completa, sem campos técnicos de edição.')}</section>
    <div class="modal-actions sticky-actions wizard-nav"><button type="button" class="ghost" data-wizard-prev>Voltar</button><button type="button" class="primary" data-wizard-next>Próximo</button><button class="ghost" name="action" value="draft">${isEdit ? 'Salvar alterações como rascunho' : 'Salvar rascunho'}</button><span data-wizard-publish-actions style="display:none"><button class="ghost" name="targetMode" value="template">Salvar como modelo</button><button class="primary" name="action" value="publish">${isEdit ? 'Salvar e publicar' : 'Publicar para aluno'}</button></span></div>
  </form>`;
}


function renderStudentWeekDayCard(plan:any, day:any, index:number) {
  const stats = exerciseCompletionStats(day);
  const date = dayDateOf(day, plan, index);
  const dayType = String(day?.dayType || day?.day_type || '').toLowerCase();
  const actionLabel = isWorkoutDay(day) ? 'Abrir treino' : (dayType === 'descanso' ? 'Ver descanso' : 'Ver detalhes');
  const typeKey = String(day.dayType || day.day_type || (isWorkoutDay(day) ? 'treino' : 'descanso')).toLowerCase();
  const filterKey = stats.isCompleted ? 'completed' : (isWorkoutDay(day) ? 'training pending' : (typeKey.includes('cardio') ? 'cardio' : (typeKey.includes('mobil') ? 'mobility' : 'rest')));
  return `<button type="button" class="student-week-day ${isWorkoutDay(day) ? 'has-workout' : 'rest-day'} ${stats.isCompleted ? 'completed' : ''}" data-plan-day-card data-filter="${esc(filterKey)}" data-modal="workout-day-detail" data-id="${esc(day.id)}"><b>${esc(day.weekday || '-')} · Dia ${esc(dayNumberOf(day,index))}</b><span>${esc(day.name || day.dayType || 'Descanso')}</span><small>${dateBRShort(date)} • ${esc(day.focus || day.muscleGroup || '')} • ${(day.exercises || []).length} exercício(s)${stats.total ? ` • ${stats.done}/${stats.total} feito(s)` : ''}</small>${stats.isCompleted ? '<strong class="day-done-badge">Concluído</strong>' : ''}<em>${esc(actionLabel)}</em></button>`;
}

function renderWorkoutDayDetailModal(dayId:string) {
  const ctx = dayById(dayId);
  if (!ctx?.day || !ctx?.plan) return `<h2>Treino não encontrado</h2><p>Atualize os dados e tente novamente.</p>`;
  const { plan, day } = ctx;
  const days = planDaysSorted(plan);
  const index = Math.max(0, days.findIndex((d:any)=>String(d.id) === String(day.id)));
  const date = dayDateOf(day, plan, index);
  const stats = exerciseCompletionStats(day);
  const type = String(day.dayType || day.day_type || '').toLowerCase();
  const isTraining = isWorkoutDay(day);
  const headline = isTraining ? 'Treino do dia' : (type === 'descanso' ? 'Dia de descanso' : 'Detalhes do dia');
  return `<h2>${esc(day.weekday || '-')} · Dia ${esc(dayNumberOf(day,index))}</h2><p>${dateBRShort(date)} • ${esc(plan.title || '')}</p><section class="card workout-day-detail"><span class="eyebrow">${esc(headline)}</span><h3>${esc(day.name || statusLabel(type || 'dia'))}</h3><p>${esc(day.focus || day.muscleGroup || day.notes || 'Siga a orientação do seu personal.')}</p>${isTraining ? `<div class="day-progress"><b>${stats.done} de ${stats.total} exercícios concluídos</b><span>${stats.percent}%</span><div class="progress"><i style="width:${stats.percent}%"></i></div></div>${completionBannerIfNeeded(day)}${renderStudentExerciseCards(day)}<div class="modal-actions"><button class="${stats.isCompleted ? 'ghost' : 'primary'} small" data-action="complete-workout-day" data-id="${esc(day.id)}">${stats.isCompleted ? 'Treino concluído' : 'Concluir treino do dia'}</button></div>` : `<div class="rest-day-detail">${alertLine(day.notes || 'Dia programado para recuperação, mobilidade leve ou descanso ativo.')} ${alertLine('Respeite o descanso para melhorar recuperação e consistência.')}</div>`}</section><div class="modal-actions"><button class="ghost" data-modal="workout-plan" data-id="${esc(plan.id)}">Voltar para plano</button><button class="primary" data-close>Fechar</button></div>`;
}

function renderStudentWorkoutPlanView(plan:any) {
  const days = planDaysSorted(plan);
  const todayDay = currentPlanDay(plan);
  const nextDay = nextTrainingDay(plan, todayDay);
  const currentIndex = Math.max(0, days.findIndex((d:any)=>String(d.id) === String(todayDay?.id)));
  const currentDate = dayDateOf(todayDay, plan, currentIndex);
  const progress = exerciseCompletionStats(todayDay);
  const progressRow = todayDay?.id ? (dayProgressFor(todayDay.id) || {}) : {};
  const labelToday = currentDate === todayISO() ? `Hoje, ${dateBRShort(currentDate)}` : (currentDate ? `${dateBRShort(currentDate)}` : 'Hoje');
  const dayNumber = dayNumberOf(todayDay, currentIndex);
  return `<h2>${esc(plan.title)}</h2><p>${esc(plan.objective || '')} • ${esc(plan.level || '')} • ${esc(plan.frequencyPerWeek || '')}</p>
    ${studentPlanProgressCard(plan)}
    <section class="student-plan-clean student-plan-interactive">
      <article class="card priority-card"><span class="eyebrow">${esc(labelToday)} · Dia ${esc(dayNumber)}</span><h3>${esc(todayDay?.weekday || 'Treino')} ${todayDay?.dayType && !isWorkoutDay(todayDay) ? `• ${statusLabel(todayDay.dayType)}` : ''}</h3><p>${esc(todayDay?.name || 'Treino do dia')} • ${esc(todayDay?.focus || todayDay?.muscleGroup || '')}</p><div class="day-progress"><b>${progress.done} de ${progress.total} exercícios concluídos</b><span>${progress.percent}%</span><div class="progress"><i style="width:${progress.percent}%"></i></div></div>${completionBannerIfNeeded(todayDay)}${renderStudentExerciseCards(todayDay)}${todayDay?.id ? `<div class="modal-actions"><button class="${progress.isCompleted ? 'ghost' : 'primary'} small" data-action="complete-workout-day" data-id="${esc(todayDay.id)}">${progress.isCompleted ? 'Treino do dia concluído' : 'Concluir treino do dia'}</button><button class="ghost small" data-modal="workout-day-detail" data-id="${esc(todayDay.id)}">Abrir detalhes deste dia</button></div>` : ''}</article>
      <article class="card"><span class="eyebrow">Próximo treino</span><h3>${esc(nextDay?.weekday || '-')} ${nextDay ? `· Dia ${esc(dayNumberOf(nextDay,0))}` : ''}</h3><p>${nextDay ? `${esc(dateBRShort(dayDateOf(nextDay, plan, days.indexOf(nextDay))) || '')} • ` : ''}${esc(nextDay?.name || 'Próximo treino')} • ${esc(nextDay?.estimatedDuration || plan.estimatedDuration || '')}</p>${nextDay?.id ? `<button class="ghost small" data-modal="workout-day-detail" data-id="${esc(nextDay.id)}">Abrir próximo treino</button>` : ''}${alertLine(plan.motivationalMessage || 'Mantenha consistência e respeite seus limites.')}${alertLine(plan.safetyNotes || 'Interrompa em caso de dor, tontura ou mal-estar.')}${progressRow?.isCompleted ? alertLine(`Treino concluído em ${dateTimeBR(progressRow.completedAt)}.`) : alertLine('Toque em cada exercício para ver tutorial e marque como concluído.')}</article>
    </section>
    <article class="card"><h3>Semana / Plano completo</h3><p class="muted">Clique em qualquer dia para abrir os exercícios, detalhes, vídeos e progresso daquele treino.</p>${planDayFilterButtons()}<div class="student-week-clean">${days.map((d:any,i:number) => renderStudentWeekDayCard(plan, d, i)).join('')}</div></article>
    <p class="notice">Esta é a visão limpa do aluno. Clique no exercício para abrir o tutorial ou buscar execução correta no YouTube. O progresso fica salvo no backend.</p>`;
}

function renderWeeklyVolumeCard(plan:any) {
  const totals:Record<string,number> = {};
  (plan.days || []).forEach((day:any)=>(day.exercises || []).forEach((ex:any)=>{ const group=String(ex.muscleGroup || ex.muscle_group || ex.category || 'outros').toLowerCase(); const sets=Number(String(ex.sets || '0').match(/\d+/)?.[0] || 0); totals[group]=(totals[group] || 0)+sets; }));
  const entries = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const alerts:string[] = [];
  if ((totals.peito || 0) > (totals.costas || 0) + 6) alerts.push('Peito acima de costas. Revise equilíbrio.');
  if (!((totals.core || 0) + (totals['abdômen'] || 0))) alerts.push('Core/abdômen ausente na semana.');
  if ((totals.quadríceps || 0) + (totals.posteriores || 0) + (totals['glúteos'] || 0) > 28) alerts.push('Volume de pernas alto. Ajuste para iniciantes.');
  return `<article class="card weekly-volume-card"><div class="card-head"><div><span class="eyebrow">Equilíbrio semanal</span><h3>Volume por grupo</h3></div><span class="badge info">regra simples</span></div><div class="volume-chip-grid">${entries.map(([k,v])=>`<span>${esc(k)} <b>${v} séries</b></span>`).join('') || '<span>Sem volume calculado</span>'}</div>${alerts.map(a=>alertLine(a)).join('') || alertLine('Volume semanal sem alerta crítico pelas regras simples.')}</article>`;
}
function renderWorkoutPlanModal(planId:string) {
  const plan = ((data as any).workoutPlans || []).find((p:any) => p.id === planId);
  if (!plan) return `<h2>Ficha não encontrada</h2><p>Atualize os dados e tente novamente.</p>`;
  const isAdmin = data!.user.role !== 'student';
  if (!isAdmin) return renderStudentWorkoutPlanView(plan);
  const versions = (plan.versions || []).slice(0, 8);
  return `<h2>${esc(plan.title)}</h2><p>${esc(plan.objective || '')} • ${esc(plan.level || '')} • ${esc(plan.frequencyPerWeek || '')} • v${esc(plan.version || 1)}</p>
  <div class="workout-meta-grid"><span>Status <b>${statusLabel(plan.status)}</b></span><span>Revisão <b>${dateBR(plan.reviewDate)}</b></span><span>Duração <b>${esc(plan.estimatedDuration || '-')}</b></span><span>Exercícios <b>${workoutExerciseCount(plan)}</b></span></div>${renderWeeklyVolumeCard(plan)}
  ${isAdmin ? `<div class="modal-actions sticky-actions"><button class="primary" data-modal="edit-workout-plan" data-id="${plan.id}">Editar em etapas</button><button class="ghost" data-modal="student-workout-preview" data-id="${plan.id}">Ver como aluno</button><button class="ghost" data-action="publish-workout-plan" data-id="${plan.id}">Publicar</button><button class="ghost" data-action="duplicate-workout-plan" data-id="${plan.id}">Duplicar ficha</button><button class="ghost" data-modal="duplicate-plan-to-student" data-id="${plan.id}">Duplicar para aluno</button><button class="ghost" data-action="save-workout-template" data-id="${plan.id}">Salvar como modelo</button><button class="ghost" data-action="restore-workout-version" data-id="${plan.id}">Restaurar última versão</button><button class="danger" data-action="archive-workout-plan" data-id="${plan.id}">Arquivar</button></div>` : `<button class="primary wide" data-modal="workout-log" data-id="${plan.id}">Iniciar/registrar treino</button>`}
  ${(plan.days || []).map((day:any) => `<article class="card nested-card workout-day-editor"><div class="card-head"><div><h3>${esc(day.weekday ? `${day.weekday} — ${day.name}` : day.name)}</h3><small>${esc(day.focus || day.muscleGroup || '')} • ${esc(day.estimatedDuration || plan.estimatedDuration || '')}</small></div><span class="badge info">${esc(day.intensity || 'moderada')}</span></div><div class="exercise-list exercise-editor-list">${(day.exercises || []).map((e:any) => `<div class="exercise-editor-row"><div><b>${esc(e.name)}</b><small>${esc(e.sets)}x ${esc(e.reps)} • ${esc(e.equipment || '')} • descanso ${esc(e.restSeconds || '-')} • RPE ${esc(e.rpe || '-')} • RIR ${esc(e.rir || '-')}</small><em>${esc(e.cautions || e.notes || '')}</em></div>${isAdmin ? renderExerciseActionBar(e, day) : ''}</div>`).join('') || empty('Nenhum exercício neste dia.')}</div></article>`).join('')}
  <section class="grid-2"><article class="card ai-card"><h3>Progressão e segurança</h3><p>${esc(plan.progressionRule || 'Progressão manual pelo personal conforme execução, carga e feedback do aluno.')}</p>${alertLine(plan.safetyNotes || 'Validar restrições e dor/desconforto antes de aumentar intensidade.')}${alertLine('IA é apoio: o personal revisa antes de publicar.')}</article><article class="card"><h3>Histórico visual de versões</h3>${versions.length ? `<div class="version-timeline">${versions.map((v:any) => `<div><b>v${esc(v.version)}</b><span>${dateTimeBR(v.createdAt)}</span><small>${esc(v.reason || 'Alteração registrada')}</small>${isAdmin ? `<button class="ghost tiny" data-action="restore-workout-version" data-id="${plan.id}" data-version-id="${v.id}">Restaurar</button>` : ''}</div>`).join('')}</div>` : empty('Nenhuma versão registrada ainda.')}</article></section>`;
}
function renderWorkoutLogModal(planId:string) {
  const plan = ((data as any).workoutPlans || []).find((p:any) => p.id === planId);
  const exercises = (plan?.days || []).flatMap((d:any) => (d.exercises || []).map((e:any) => ({ ...e, dayName: d.name, dayId: d.id })));
  return `<h2>Registrar treino completo</h2><p>${esc(plan?.title || 'Ficha')}</p><form data-form="workout-log" data-plan-id="${esc(planId)}"><div class="form-grid"><label>Dia de treino<select name="workoutDayId">${(plan?.days || []).map((d:any) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label><label>Duração em minutos<input name="durationMinutes" type="number" placeholder="60"></label><label>Dificuldade geral<select name="difficulty"><option>leve</option><option selected>moderada</option><option>alta</option><option>muito difícil</option></select></label></div><label>Dor/desconforto geral<textarea name="painReported" placeholder="Informe se sentiu algo fora do normal. Se não sentiu, deixe vazio."></textarea></label><section class="exercise-log-grid"><h3>Logs por exercício</h3>${exercises.map((e:any, i:number) => `<article class="mini-form-card"><h4>${esc(e.name)}</h4><small>${esc(e.dayName)} • ${esc(e.sets)}x ${esc(e.reps)}</small><input type="hidden" name="logEx${i}Id" value="${esc(e.id)}"><label><input type="checkbox" name="logEx${i}Completed" checked> Concluído</label><label>Carga usada<input name="logEx${i}Load" placeholder="Ex.: 20kg"></label><label>Reps feitas<input name="logEx${i}Reps" placeholder="Ex.: 12/10/9"></label><label>Dificuldade<select name="logEx${i}Difficulty"><option>leve</option><option selected>moderada</option><option>alta</option><option>muito difícil</option></select></label><label>Dor/desconforto<input name="logEx${i}Pain" placeholder="Ex.: ombro direito leve"></label><label>Observações<textarea name="logEx${i}Notes" placeholder="Execução, ajuste de carga, substituição..."></textarea></label></article>`).join('')}</section><label>Observações finais<textarea name="notes"></textarea></label><button class="primary wide">Concluir treino e enviar feedback</button><p class="notice">O registro salva histórico, gera FitPoints com antifraude e notifica o personal quando há dor/desconforto.</p></form>`;
}
function renderAssignmentStatusBar() {
  const target = readWorkoutActiveTarget();
  if (!target?.dayId) return `<div class="assignment-context empty"><b>Nenhum treino ativo selecionado</b><span>Escolha destino ao adicionar ou abra uma ficha existente para editar.</span></div>`;
  const ctx = dayById(target.dayId);
  const plan = ctx?.plan || planById(target.planId || '');
  const day = ctx?.day;
  return `<div class="assignment-context active"><span class="eyebrow">Treino ativo</span><b>Adicionando em: ${esc(target.studentName || studentNameById(plan?.studentId || plan?.student_id || '') || 'Aluno')} · ${esc(target.planTitle || plan?.title || 'Ficha')} · ${esc(target.dayLabel || day?.name || day?.weekday || 'Treino')}</b><button class="ghost tiny" data-action="clear-workout-target">Limpar</button></div>`;
}

function renderAssignExerciseModal(exerciseKey:string) {
  const exercise = libraryExerciseByKey(exerciseKey);
  if (!exercise) return `<h2>Exercício não encontrado</h2><p>Atualize a biblioteca e tente novamente.</p>`;
  const defaults = exerciseDefaultsFromLibrary(exercise);
  const target = readWorkoutActiveTarget();
  const plans = ((data as any).workoutPlans || []).filter((p:any) => p.status !== 'arquivado');
  const dayOptions = plans.flatMap((p:any) => (p.days || []).map((d:any) => ({ plan:p, day:d }))).filter((x:any) => x.day?.id);
  const selectedDay = target?.dayId && dayOptions.some((x:any)=>x.day.id===target.dayId) ? target.dayId : '';
  const selectedStudent = target?.studentId || dayById(selectedDay)?.plan?.studentId || dayById(selectedDay)?.plan?.student_id || '';
  return `<h2>Adicionar exercício em uma ficha</h2>
    <p class="notice">Fluxo guiado: escolha aluno, destino, ficha/dia, ajuste os detalhes e salve. Nada fica solto sem destino.</p>
    <article class="card assignment-exercise-card"><div><span class="eyebrow">Exercício selecionado</span><h3>${esc(defaults.name)}</h3><p>${esc(defaults.muscleGroup)} • ${esc(defaults.equipment)} • ${esc(exercise.level || '')}</p></div><span class="badge ok">${esc(exercise.source || 'biblioteca')}</span></article>
    ${renderAssignmentStatusBar()}
    <form data-form="assign-exercise" class="assignment-flow">
      <input type="hidden" name="exerciseKey" value="${esc(exerciseKey)}">
      <div class="assignment-steps">
        <section class="card"><span class="eyebrow">1. Aluno</span><label>Aluno que receberá a ficha<select name="studentId" required><option value="">Selecione um aluno</option>${(data!.students || []).map((s:any)=>`<option value="${esc(s.id)}" ${s.id===selectedStudent?'selected':''}>${esc(s.name)} • ${statusLabel(s.status || 'ativo')}</option>`).join('')}</select></label></section>
        <section class="card"><span class="eyebrow">2. Destino</span><label>O que deseja fazer?<select name="targetMode" data-assign-target-mode><option value="existing" ${selectedDay?'selected':''}>Adicionar em ficha existente</option><option value="new" ${!selectedDay?'selected':''}>Criar nova ficha com este exercício</option><option value="active" ${selectedDay?'':'disabled'}>Adicionar ao treino ativo</option></select></label></section>
        <section class="card assign-existing"><span class="eyebrow">3. Ficha e dia</span><label>Dia/treino de destino<select name="workoutDayId"><option value="">Selecione uma ficha e um dia</option>${dayOptions.map(({plan,day}:any)=>`<option value="${esc(day.id)}" ${day.id===selectedDay?'selected':''}>${esc(plan.title)} · ${esc(statusLabel(plan.status || 'rascunho'))} · ${esc(day.weekday || '')} — ${esc(day.name || 'Treino')}</option>`).join('')}</select></label><p class="muted">Para fichas publicadas, a alteração gera nova versão e histórico.</p></section>
        <section class="card assign-new"><span class="eyebrow">3. Nova ficha</span><div class="form-grid"><label>Título da ficha<input name="title" value="Ficha com ${safeFormValue(defaults.name)}"></label><label>Dia da semana<select name="weekday">${weekDays.map(d=>`<option>${esc(d)}</option>`).join('')}</select></label><label>Nome do treino<input name="dayName" value="Treino A"></label><label>Objetivo<select name="objective">${optionList(objectiveOptions, 'hipertrofia')}</select></label><label>Nível<select name="level">${optionList(['iniciante','intermediario','avancado','atleta','retorno após pausa'], exercise.level || 'iniciante')}</select></label><label>Status<select name="status"><option value="rascunho">Rascunho</option><option value="ativo">Publicar agora</option></select></label></div></section>
        <section class="card"><span class="eyebrow">4. Detalhes do exercício</span><div class="form-grid"><label>Séries<input name="sets" value="${safeFormValue(defaults.sets)}"></label><label>Repetições/tempo<input name="reps" value="${safeFormValue(defaults.reps)}"></label><label>Descanso<input name="rest" value="${safeFormValue(defaults.rest)}"></label><label>Carga sugerida<input name="load" value="${safeFormValue(defaults.load)}" placeholder="opcional"></label><label>Ordem<input name="order" type="number" min="1" placeholder="automática"></label><label>Método<select name="method">${optionList(workoutMethods, defaults.method)}</select></label></div><label>Observações/técnica<textarea name="notes">${safeFormValue(defaults.notes)}</textarea></label><label>Cuidados<textarea name="cautions">${safeFormValue(defaults.cautions)}</textarea></label></section>
      </div>
      <div class="modal-actions sticky-actions"><button class="ghost" name="saveMode" value="draft">Salvar como rascunho</button><button class="primary" name="saveMode" value="continue">Salvar e continuar adicionando</button><button class="primary" name="saveMode" value="publish">Publicar para aluno</button></div>
    </form>`;
}


function renderMonthlyPlanPreview(plan: MonthlyPlanTemplate, startDate = '') {
  const days = buildMonthlyPlanDays(plan, startDate);
  const weeks = [0,1,2,3,4].map(w => days.slice(w * 7, w * 7 + 7)).filter(group => group.length);
  return `<div class="monthly-preview"><div class="info-grid"><span>Objetivo<b>${esc(plan.goal)}</b></span><span>Nível<b>${esc(plan.level)}</b></span><span>Frequência<b>${esc(plan.frequency)}</b></span><span>Duração<b>${esc(plan.duration)}</b></span></div>${weeks.map((week, wi) => `<article class="card monthly-week"><h3>Semana ${wi + 1}</h3><p class="muted">${esc(plan.progressions[Math.min(wi, plan.progressions.length - 1)] || '')}</p><div class="monthly-day-grid">${week.map((day:any) => `<div class="monthly-day ${day.dayType === 'treino' ? 'has-workout' : day.dayType}"><b>${esc(day.weekday)} · Dia ${esc(day.dayNumber || '')}</b><span>${esc(day.name)}</span><small>${dateBRShort(day.date || day.trainingDate)} • ${esc(day.focus)} • ${(day.exercises || []).length} exercício(s)</small></div>`).join('')}</div></article>`).join('')}</div>`;
}
function renderMonthlyPlansModal(planKey = '') {
  const plan = monthlyPlanByKey(planKey);
  if (!plan) {
    return `<h2>Planos prontos de 30 dias</h2><p class="notice">Fluxo rápido: escolha aluno → escolha plano de 30 dias → veja prévia → salve rascunho ou publique. Completo por trás, simples por fora.</p><div class="monthly-plan-grid">${MONTHLY_PLAN_TEMPLATES.map(p => `<article class="card monthly-plan-card"><div class="card-head"><div><span class="eyebrow">${esc(p.badge)}</span><h3>${esc(p.name)}</h3></div><span class="badge ok">30D</span></div><p>${esc(p.description)}</p><div class="info-grid compact-info"><span>Objetivo<b>${esc(p.goal)}</b></span><span>Nível<b>${esc(p.level)}</b></span><span>Frequência<b>${esc(p.frequency)}</b></span><span>Local<b>${esc(p.location)}</b></span></div><div class="modal-actions"><button class="ghost small" data-modal="monthly-plan" data-id="${esc(p.key)}">Ver prévia</button><button class="primary small" data-modal="monthly-plan" data-id="${esc(p.key)}">Aplicar para aluno</button><button class="ghost small" data-modal="bulk-apply-plan" data-id="${esc(p.key)}">Aplicar para varios</button></div></article>`).join('')}</div>`;
  }
  const students = data!.students || [];
  const today = new Date().toISOString().slice(0,10);
  return `<h2>Aplicar plano de 30 dias</h2><p class="notice">${esc(plan.name)} será criado como ficha mensal completa. Você pode salvar como rascunho ou publicar para o aluno.</p><form data-form="monthly-plan" class="monthly-plan-flow" data-plan-key="${esc(plan.key)}"><section class="grid-2"><article class="card"><span class="eyebrow">1. Aluno</span><label>Aluno<select name="studentId" required><option value="">Selecione um aluno</option>${students.map((s:any)=>`<option value="${esc(s.id)}">${esc(s.name)} • ${statusLabel(s.status || 'ativo')}</option>`).join('')}</select></label><label>Data de início<input type="date" name="startDate" value="${today}" required></label><label>Observação do personal<textarea name="personalNote" placeholder="Adapte conforme histórico, limitações e evolução do aluno."></textarea></label></article><article class="card"><span class="eyebrow">2. Plano escolhido</span><h3>${esc(plan.name)}</h3><p>${esc(plan.description)}</p><div class="info-grid compact-info"><span>Objetivo<b>${esc(plan.goal)}</b></span><span>Nível<b>${esc(plan.level)}</b></span><span>Frequência<b>${esc(plan.frequency)}</b></span><span>Equipamentos<b>${esc(plan.equipment)}</b></span></div>${alertLine('Os modelos são sugestões gerais e devem ser ajustados pelo profissional responsável.')}</article></section><section class="card"><div class="card-head"><div><span class="eyebrow">3. Prévia do mês</span><h3>4 semanas + 30 dias gerados automaticamente</h3></div><button type="button" class="ghost small" data-action="monthly-preview-refresh">Atualizar prévia</button></div><div data-monthly-preview>${renderMonthlyPlanPreview(plan, today)}</div></section><div class="modal-actions sticky-actions"><button class="ghost" name="saveMode" value="draft">Salvar rascunho</button><button class="ghost" name="saveMode" value="preview">Ver como aluno</button><button class="primary" name="saveMode" value="publish">Publicar plano</button></div></form>`;
}
function renderExerciseLibraryModal() {
  const items = (data as any).exerciseLibrary || [];
  return `<h2>Biblioteca avançada de exercícios</h2><p>Base combinada: exercícios personalizados salvos pelo personal + templates FitPro. Use o fluxo guiado para escolher aluno, ficha e dia antes de salvar.</p>${renderAssignmentStatusBar()}<div class="library-filters"><input data-library-search placeholder="Buscar por nome, grupo ou equipamento"><select data-library-filter="muscle"><option value="">Todos grupos</option>${muscleGroups.map(g => `<option>${esc(g)}</option>`).join('')}</select><select data-library-filter="equipment"><option value="">Todos equipamentos</option>${equipments.map(e => `<option>${esc(e)}</option>`).join('')}</select></div><div class="exercise-library-list">${items.slice(0,160).map((e:any) => `<div class="library-item" data-name="${esc([e.name,e.muscleGroup,e.equipment,e.level,e.category].join(' ').toLowerCase())}" data-muscle="${esc(String(e.muscleGroup || '').toLowerCase())}" data-equipment="${esc(String(e.equipment || '').toLowerCase())}"><div><b>${esc(e.name)}</b><small>${esc(e.muscleGroup || '')} • ${esc(e.equipment || '')} • ${esc(e.level || '')} • ${esc(e.source || 'base')}</small><p>${esc(e.cautions || e.executionNotes || e.description || '')}</p></div><div class="library-card-actions"><button type="button" class="primary small" data-modal="assign-exercise" data-id="${esc(e.id || e.name)}">Adicionar em uma ficha</button><button type="button" class="ghost tiny" data-modal="assign-exercise" data-id="${esc(e.id || e.name)}">Escolher destino</button></div></div>`).join('') || empty('A biblioteca será preenchida conforme você criar exercícios.')}</div><hr><h3>Salvar exercício personalizado</h3><form data-form="exercise-library"><div class="form-grid"><label>Nome<input name="name" required></label><label>Grupo<select name="muscleGroup">${optionList(muscleGroups)}</select></label><label>Categoria<select name="category"><option>força</option><option>hipertrofia</option><option>resistência</option><option>cardio</option><option>mobilidade</option><option>core</option><option>HIIT</option><option>corretivo</option></select></label><label>Equipamento<select name="equipment">${optionList(equipments)}</select></label><label>Nível<select name="level"><option>iniciante</option><option>intermediario</option><option>avancado</option><option>atleta</option></select></label></div><label>Execução correta<textarea name="executionNotes"></textarea></label><label>Erros comuns<textarea name="commonMistakes"></textarea></label><label>Substituições<textarea name="substitutions"></textarea></label><label>Cuidados<textarea name="cautions"></textarea></label><button class="primary wide">Salvar na biblioteca</button></form>`;
}


function renderBulkApplyPlanModal(planKey = '') {
  const plan = monthlyPlanByKey(String(planKey || '')) || MONTHLY_PLAN_TEMPLATES[0];
  const today = new Date().toISOString().slice(0,10);
  return `<h2>Aplicar plano para varios alunos</h2><p class="notice">Selecione os alunos. O sistema cria uma ficha/plano independente para cada aluno, sem copiar historico pessoal.</p><form data-form="bulk-monthly-plan" data-plan-key="${esc(plan.key)}"><section class="card"><span class="eyebrow">Plano escolhido</span><h3>${esc(plan.name)}</h3><p>${esc(plan.description)}</p><div class="form-grid"><label>Data de inicio<input type="date" name="startDate" value="${today}" required></label><label>Status<select name="saveMode"><option value="draft">Rascunho</option><option value="publish">Publicar agora</option></select></label></div></section><section class="card"><span class="eyebrow">Alunos</span><div class="bulk-student-list">${(data!.students || []).map((s:any)=>`<label><input type="checkbox" name="studentIds" value="${esc(s.id)}"> ${esc(s.name)} <small>${statusLabel(s.status || 'ativo')}</small></label>`).join('') || empty('Nenhum aluno disponível.')}</div></section><button class="primary wide">Aplicar plano para selecionados</button></form>`;
}
function renderDuplicatePlanToStudentModal(planId = '') {
  const plan = planById(String(planId || ''));
  if (!plan) return `<h2>Duplicar ficha/plano</h2>${empty('Ficha não encontrada.')}`;
  return `<h2>Duplicar ficha/plano para outro aluno</h2><p class="notice">Copia apenas estrutura, dias e exercicios. Nao copia historico, progresso ou dados pessoais do aluno anterior.</p><form data-form="duplicate-plan-to-student" data-plan-id="${esc(plan.id)}"><div class="form-grid"><label>Aluno destino<select name="studentId" required><option value="">Selecione</option>${(data!.students || []).map((s:any)=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label><label>Titulo da copia<input name="title" value="${esc((plan.title || 'Ficha') + ' - copia')}"></label><label>Status<select name="status"><option value="rascunho">Rascunho</option><option value="ativo">Publicar agora</option></select></label></div><button class="primary wide">Duplicar para aluno</button></form>`;
}

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
  if (type === 'ai-assistant') return `<h2>Assistente FitPro IA</h2><p>Assistente seguro: ajuda com uso do app, pagamentos, treinos, hábitos e navegação. Não substitui personal, médico, nutricionista ou fisioterapeuta.</p><form data-form="ai-help"><label>Sua dúvida<textarea name="question" required placeholder="Ex.: como envio comprovante? como resgato recompensa?"></textarea></label><button class="primary wide">Perguntar</button></form><div id="ai-answer-box" class="ai-chat-demo"><div class="message"><div class="message-head"><span class="avatar small-avatar">IA</span><span><b>FitPro Coach IA</b><small>seguro</small></span></div><p>${data?.user.role === 'student' ? 'Sua missão de hoje é concluir o treino, bater a meta de água e registrar check-in.' : 'Seu Pulse indica alunos em risco, alunos que merecem elogio e pagamentos pendentes.'}</p></div></div><div class="quick-grid"><button data-tab="dashboard" data-close>Ver Pulse</button><button data-tab="coach" data-close>Coach Invisível</button><button data-tab="ajuda" data-close>Central de ajuda</button><button data-close>Fechar</button></div>`;
  if (type === 'ai-answer') return `<h2>Resposta IA segura</h2><p>${payload === 'pagamento' ? 'Abra Pagamentos, clique em Ver comprovante, confira imagem/PDF e aprove ou reprove com motivo. O aluno não tem permissão para aprovar o próprio pagamento.' : payload === 'sumido' ? 'O Coach Invisível marca aluno sumido quando há muitos dias sem atividade/check-in. O ideal é enviar uma mensagem curta de retomada pelo WhatsApp.' : payload === 'missao' ? 'A Missão do Dia combina treino, energia, check-in e pontos possíveis para aumentar engajamento do aluno.' : 'Sorteios usam chances por engajamento: aluno ativo ganha chance base, pontos geram chances extras e ações válidas aumentam participação.'}</p><button class="primary" data-close>Entendi</button>`;
  if (type === 'ai-workout-suggestion') return `<h2>Assistente de Treino FitPro</h2><p class="notice">${esc(payload?.warning || 'Sugestão de apoio. O personal revisa antes de publicar.')}</p><div class="info-grid"><span>Título sugerido<b>${esc(payload?.title || '-')}</b></span><span>Objetivo<b>${esc(payload?.objective || '-')}</b></span><span>Nível<b>${esc(payload?.level || '-')}</b></span><span>Divisão<b>${esc(payload?.division || '-')}</b></span></div><article class="card ai-card"><h3>Progressão sugerida</h3><p>${esc(payload?.progressionRule || '')}</p>${alertLine(payload?.safetyNotes || 'Validar restrições antes de publicar.')}</article><article class="card"><h3>Checklist profissional</h3>${(payload?.checklist || []).map((item:string) => alertLine(item)).join('')}</article><div class="exercise-list">${(payload?.days || []).map((d:any) => `<div><b>${esc(d.name)}</b><small>${esc(d.focus || '')} • ${(d.exercises || []).length} exercícios</small></div>`).join('')}</div><button class="primary" data-modal="new-workout">Abrir criador e revisar</button>`;
  if (type === 'coach-message') { const s = studentOf(payload); return `<h2>Mensagem sugerida pelo Coach Invisível</h2><p>Olá, ${esc(s?.name?.split(' ')[0] || 'aluno')}! Vi seu progresso no FitPro e queria te puxar de volta para a missão da semana. Vamos fazer um check-in rápido hoje?</p><button class="primary" data-action="whatsapp-student" data-phone="${esc(s?.phone || '')}">Enviar pelo WhatsApp</button>`; }
  if (type === 'reward-preview') return `<h2>Loja de recompensas</h2><p>Resgate preparado para próxima fase. A pontuação será validada por logs, check-ins, desafios e regras antifraude.</p><button class="primary" data-close>Ok</button>`;
  if (type === 'giveaway-rules') return `<h2>Criar sorteio</h2><p>Sorteio preparado com chances extras por engajamento. Para produção, conectar logs reais, antifraude e aceite das regras.</p><button class="primary" data-close>Entendi</button>`;
  if (type === 'student-execution-detail') return renderStudentExecutionDetail(String(payload || ''));
  if (type === 'student') { const s = studentOf(payload); return `${studentAvatar(s)}<h2>${esc(s?.name)}</h2><p>${esc(s?.goal)}</p><div class="info-grid"><span>E-mail<b>${esc(s?.email)}</b></span><span>WhatsApp<b>${esc(s?.phone)}</b></span><span>Status<b>${statusLabel(s?.status || '')}</b></span><span>Plano<b>${esc(planOf(s?.planId)?.name)}</b></span></div><button class="primary" data-action="whatsapp-student" data-phone="${esc(s?.phone || '')}">Chamar no WhatsApp</button>`; }
  if (type === 'workout') { const w = data!.workouts.find(x => x.id === payload); return `<h2>${esc(w?.title)}</h2><p>${esc(w?.goal)} • ${esc(w?.method)}</p><div class="exercise-list">${(w?.exercises || []).map((e:any) => `<div><b>${esc(e.name)}</b><small>${esc(e.sets)}x ${esc(e.reps)} • ${esc(e.note)}</small></div>`).join('')}</div>`; }
  if (type === 'exercise-video') {
    const found = findExerciseInPlans(String(payload || ''));
    const ex = found?.exercise || {};
    const target = exerciseVideoTarget(ex);
    const meta = [ex.muscleGroup || ex.muscle_group, ex.equipment, found?.day?.weekday || found?.day?.name].filter(Boolean).join(' • ');
    return `<h2>${esc(ex.name || 'Tutorial do exercício')}</h2><p>${esc(meta || 'Execução correta')}</p><article class="card tutorial-card youtube-tutorial-card"><h3>Execução correta</h3>${target.canEmbed ? `<div class="youtube-embed-shell"><iframe class="youtube-embed-player" src="${esc(target.embed)}" title="${esc(ex.name || 'Tutorial FitPro')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div><div class="modal-actions compact-actions"><a class="ghost" href="${esc(target.video)}" target="_blank" rel="noopener noreferrer">Abrir no YouTube</a><a class="ghost" href="${esc(target.fallback)}" target="_blank" rel="noopener noreferrer">Buscar alternativas</a></div>` : target.hasVideo ? `<p>Vídeo/tutorial cadastrado para este exercício.</p><a class="primary wide text-center" href="${esc(target.video)}" target="_blank" rel="noopener noreferrer">Abrir tutorial</a>` : `<p>Ainda não há vídeo cadastrado para este exercício.</p><a class="primary wide text-center" href="${esc(target.fallback)}" target="_blank" rel="noopener noreferrer">Buscar no YouTube</a>`}${ex.notes ? `<p class="notice">${esc(ex.notes)}</p>` : ''}<p class="notice">Use este vídeo apenas como apoio. Siga sempre a orientação do seu personal.</p></article><div class="modal-actions"><button class="ghost" data-close>Fechar</button></div>`;
  }
  if (type === 'workout-plan') return renderWorkoutPlanModal(payload);
  if (type === 'workout-day-detail') return renderWorkoutDayDetailModal(String(payload || ''));
  if (type === 'student-workout-preview') { const plan = planById(payload); return plan ? renderStudentWorkoutPlanView(plan) : `<h2>Prévia indisponível</h2><p>Ficha não encontrada.</p>`; }
  if (type === 'assign-exercise') return renderAssignExerciseModal(String(payload || ''));
  if (type === 'workout-exercise-edit') return renderWorkoutExerciseEditModal(payload);
  if (type === 'workout-exercise-replace') return renderWorkoutExerciseReplaceModal(payload);
  if (type === 'edit-workout-plan') { const plan = ((data as any).workoutPlans || []).find((p:any) => p.id === payload); return renderWorkoutCreatorModal(plan); }
  if (type === 'workout-log') return renderWorkoutLogModal(payload);
  if (type === 'exercise-library') return renderExerciseLibraryModal();
  if (type === 'monthly-plan') return renderMonthlyPlansModal(String(payload || ''));
  if (type === 'bulk-apply-plan') return renderBulkApplyPlanModal(String(payload || ''));
  if (type === 'duplicate-plan-to-student') return renderDuplicatePlanToStudentModal(String(payload || ''));
  if (type === 'comment-post') return `<h2>Comentar publicação</h2><form data-form="comment-post" data-post-id="${payload}"><textarea name="text" required placeholder="Escreva um comentário de apoio, dúvida ou feedback."></textarea><button class="primary">Comentar</button></form>`;
  if (type === 'new-post') return `<h2>Nova publicação</h2><form data-form="post"><label>Categoria<select name="category"><option>Vitória</option><option>Dúvida</option><option>Aviso</option><option>Desafio</option><option>Evolução</option></select></label><label>Texto<textarea name="text" required></textarea></label><button class="primary">Publicar</button></form>`;
  if (type === 'new-message') return `<h2>Enviar mensagem</h2><form data-form="message"><label>Aluno<select name="studentId">${data!.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><label>Mensagem<textarea name="text" required></textarea></label><button class="primary">Enviar</button></form>`;
  if (type === 'upload-proof') return `<h2>Enviar comprovante</h2><p>Arquivos aceitos: imagem ou PDF até 8MB. O comprovante será salvo em storage privado local e acessado por rota protegida.</p><form data-form="proof-upload" data-payment-id="${payload}"><label>Arquivo<input name="file" type="file" accept="image/*,application/pdf" required></label><label>Observação<textarea name="note" placeholder="Ex: Pix feito às 18:42"></textarea></label><button class="primary">Enviar comprovante</button></form>`;
  if (type === 'new-student') return `<h2>Novo aluno</h2><form data-form="student"><div class="form-grid"><input name="name" placeholder="Nome" required><input name="email" placeholder="E-mail"><input name="phone" placeholder="WhatsApp"><input name="city" placeholder="Cidade"><input name="goal" placeholder="Objetivo"><select name="level"><option value="iniciante">Iniciante</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></select></div><button class="primary">Salvar aluno</button></form>`;
  if (type === 'new-workout') return renderWorkoutCreatorModal();
  if (type === 'new-schedule') return `<h2>Novo agendamento</h2><form data-form="schedule"><label>Aluno<select name="studentId">${data!.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><input name="title" placeholder="Título" required><input name="date" type="date" required><input name="time" type="time" required><select name="type"><option value="presencial">Presencial</option><option value="online">Online</option><option value="consultoria">Consultoria</option><option value="avaliacao">Avaliação</option></select><input name="location" placeholder="Local"><input name="onlineLink" placeholder="Link online"><button class="primary">Agendar</button></form>`;
  if (type === 'new-assessment') return `<h2>Registrar avaliação</h2><form data-form="assessment"><label>Aluno<select name="studentId">${data!.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><input name="date" type="date"><input name="weight" type="number" step="0.1" placeholder="Peso"><input name="bodyFat" type="number" step="0.1" placeholder="Gordura %"><input name="sleep" type="number" placeholder="Sono 0-10"><textarea name="notes" placeholder="Observações"></textarea><button class="primary">Salvar avaliação</button></form>`;
  if (type === 'new-payment') return `<h2>Nova cobrança manual</h2><form data-form="payment"><label>Aluno<select name="studentId">${data!.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><label>Plano<select name="planId">${data!.plans.map(p => `<option value="${p.id}">${esc(p.name)} • ${money(p.price)}</option>`).join('')}</select></label><input name="amount" type="number" step="0.01" placeholder="Valor" required><input name="dueDate" type="date" required><input name="externalLink" placeholder="Link de pagamento"><button class="primary">Criar cobrança</button></form>`;
  if (type === 'quick-habit') return `<h2>Check-in rápido de hábitos</h2><p>Responda por cards, sem julgamento. Detalhes numéricos são opcionais.</p><form data-form="habit-quick"><div class="habit-card-grid"><label>Água<select name="water"><option value="good">Concluí minha meta</option><option value="near">Cheguei perto</option><option value="low">Hoje ficou abaixo</option></select></label><label>Sono<select name="sleep"><option value="slept_well">Dormi bem</option><option value="slept_ok">Dormi razoável</option><option value="slept_bad">Dormi mal</option></select></label><label>Movimento<select name="movement"><option value="moved_good">Me movimentei bem</option><option value="moved_basic">Fiz o básico</option><option value="moved_low">Quase não me movimentei</option></select></label><label>Alimentação<select name="food"><option value="balanced">Mantive uma boa rotina</option><option value="middle">Fiquei no meio termo</option><option value="off">Hoje saí bastante do planejado</option></select></label><label>Proteína<select name="protein"><option value="good">Bati minha meta</option><option value="near">Cheguei perto</option><option value="low">Fiquei abaixo</option></select></label><label>Energia<select name="energy"><option value="high">Energia alta</option><option value="medium">Energia média</option><option value="low_energy">Energia baixa</option></select></label><label>Humor<select name="mood"><option value="good_mood">Me senti bem</option><option value="normal_mood">Dia normal</option><option value="hard_day">Dia difícil</option></select></label><label>Suplementos<select name="supplements"><option value="supplements_done">Tomei tudo conforme combinado</option><option value="supplements_some">Esqueci algum</option><option value="supplements_none">Não tomei hoje</option></select></label><label>Treino do dia<select name="workout"><option value="workout_done">Concluído</option><option value="workout_partial">Parcial</option><option value="workout_none">Não consegui hoje</option></select></label></div><details class="advanced-box"><summary>Adicionar detalhes avançados</summary><div class="form-grid"><input name="advWaterMl" type="number" placeholder="Água ml"><input name="advSleepHours" type="number" step="0.1" placeholder="Sono horas"><input name="advSteps" type="number" placeholder="Passos"><input name="advProteinG" type="number" placeholder="Proteína g"><input name="advCarbsG" type="number" placeholder="Carboidrato g"><input name="advFatG" type="number" placeholder="Gordura g"><input name="advCalories" type="number" placeholder="Calorias"><input name="advEnergy" type="number" min="0" max="10" placeholder="Energia 0-10"></div></details><label>Observações<textarea name="notes" placeholder="Algo importante para seu personal saber?"></textarea></label><button class="primary wide">Salvar check-in rápido</button></form>`;
  if (type === 'trainer-payment-settings') { const st = trainerPaymentSettingsFor(data!.user.trainerId || (data as any).trainers?.[0]?.id) || {}; return `<h2>Pix do personal</h2><form data-form="trainer-payment-settings"><input type="hidden" name="trainerId" value="${esc(data!.user.trainerId || (data as any).trainers?.[0]?.id || '')}"><div class="form-grid"><label>Tipo da chave Pix<select name="pixKeyType"><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="telefone">Telefone</option><option value="aleatoria">Chave aleatória</option></select></label><label>Chave Pix<input name="pixKey" value="${esc(st.pixKey || '')}" required></label><label>Nome do recebedor<input name="receiverName" value="${esc(st.receiverName || data!.user.name)}"></label><label>Banco opcional<input name="bankName" value="${esc(st.bankName || '')}"></label></div><label>Instruções<textarea name="instructions">${esc(st.instructions || 'Envie o Pix e anexe o comprovante. O acesso é liberado após aprovação do personal.')}</textarea></label><button class="primary wide">Salvar Pix do personal</button></form>`; }
  if (type === 'trainer-plan') return `<h2>Novo plano do aluno</h2><form data-form="trainer-plan"><input type="hidden" name="trainerId" value="${esc(data!.user.trainerId || (data as any).trainers?.[0]?.id || '')}"><div class="form-grid"><label>Nome<input name="name" required placeholder="Plano Pro"></label><label>Valor<input name="price" type="number" step="0.01" required></label><label>Periodicidade<select name="billingCycle"><option value="mensal">Mensal</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option></select></label><label>Status<select name="status"><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></label></div><label>Descrição<textarea name="description"></textarea></label><label>Benefícios, um por linha<textarea name="benefits"></textarea></label><button class="primary wide">Criar plano do personal</button></form>`;
  if (type === 'redeem-activation-code') return `<h2>Tenho um código de ativação</h2><p>Use um código fornecido pela equipe FitPro/uPaiva para liberar Start ou Plus por um período específico.</p><form data-form="activation-code-redeem"><label>Código de ativação<input name="code" required placeholder="Digite seu código"></label><div class="modal-actions"><button class="ghost" name="action" value="validate">Validar código</button><button class="primary" name="action" value="redeem">Ativar código</button></div></form><p class="notice">A validação acontece no backend. Aluno não pode usar código de personal.</p>`;
  if (type === 'platform-activation-code') { const plans = ((data as any).platformPlans || []); const trainers = ((data as any).trainers || []); return `<h2>Criar código de ativação</h2><p>Crie códigos para liberar planos, cortesias, testes e acessos temporários para personais.</p><form data-form="platform-activation-code"><div class="form-grid"><label>Nome interno<input name="name" placeholder="Campanha Plus 30 dias"></label><label>Código manual opcional<input name="code" placeholder="deixe vazio para gerar automaticamente"></label><label>Plano liberado<select name="platformPlanId">${plans.map((p:any)=>`<option value="${esc(p.id)}">${esc(p.name)} • ${money(p.price)}</option>`).join('')}</select></label><label>Duração<select name="durationDays"><option value="7">7 dias</option><option value="15">15 dias</option><option value="30" selected>30 dias</option><option value="60">60 dias</option><option value="90">90 dias</option><option value="180">180 dias</option></select></label><label>Data de expiração do código<input name="expiresAt" type="date"></label><label>Máximo de usos<input name="maxUses" type="number" value="1" min="1"></label><label>Personal específico opcional<select name="assignedTrainerId"><option value="">Qualquer personal</option>${trainers.map((t:any)=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label><label>Tipo<select name="type"><option value="cortesia">Cortesia</option><option value="teste">Teste</option><option value="parceiro">Parceiro</option><option value="implantacao">Implantação</option><option value="promocao">Promoção</option><option value="renovacao_manual">Renovação manual</option><option value="acesso_interno">Acesso interno</option><option value="suporte">Suporte</option></select></label><label>Status<select name="status"><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></label></div><label>Observação interna<textarea name="notes"></textarea></label><button class="primary wide">Criar código</button></form><p class="notice">O código completo aparece apenas no painel Dev/Super Admin e nunca é público.</p>`; }
  if (type === 'new-habit') return `<h2>Registrar hábito</h2><form data-form="habit"><input name="date" type="date"><div class="form-grid"><input name="waterMl" type="number" placeholder="Água ml"><input name="sleepHours" type="number" step="0.1" placeholder="Sono horas"><input name="steps" type="number" placeholder="Passos"><input name="proteinG" type="number" placeholder="Proteína g"><input name="carbsG" type="number" placeholder="Carboidrato g"><input name="fatG" type="number" placeholder="Gordura g"><input name="calories" type="number" placeholder="Calorias"><input name="energy" type="number" min="0" max="10" placeholder="Energia 0-10"></div><textarea name="notes" placeholder="Observações do dia"></textarea><button class="primary">Salvar rotina</button></form>`;
  if (type === 'content') { const c = data!.contents.find(x => x.id === payload); return `<h2>${esc(c?.title || 'Conteúdo')}</h2><p>${esc(c?.description || '')}</p>${c?.url?.includes('youtube') ? `<iframe class="content-player" src="${esc(c.url)}" title="${esc(c.title)}" allowfullscreen></iframe>` : c?.url ? `<a class="primary" href="${esc(c.url)}" target="_blank">Abrir material</a>` : empty('Conteúdo sem URL.')}<p class="notice">Botão Rever reabre o conteúdo sem gerar pontos infinitos. Pontuação real fica vinculada a logs.</p><button class="primary" data-action="complete-content" data-id="${c?.id || ''}">Marcar como concluído</button>`; }
  if (type === 'legal') {
    const updated = '13/05/2026';
    const legalKey = String(payload || 'termos');
    const sections: Record<string, { title: string; subtitle: string; body: string }> = {
      termos: { title: 'Termos de Uso', subtitle: 'Uso responsável, permissões, pagamentos, limites da plataforma e responsabilidade fitness.', body: `
        <h3>1. Aceitação dos termos</h3><p>Ao acessar ou usar o FitPro Elite, o usuário declara que leu, entendeu e concorda com estes Termos de Uso.</p>
        <h3>2. Definição da plataforma</h3><p>O FitPro Elite é uma plataforma digital de acompanhamento fitness, gestão de alunos, treinos, conteúdos, comunidade, mensagens, pagamentos, comprovantes e recursos de apoio operacional.</p>
        <h3>3. Natureza e limites</h3><p>A plataforma é uma ferramenta tecnológica de organização e suporte. Ela não substitui médico, nutricionista, fisioterapeuta, educador físico, psicólogo ou qualquer profissional habilitado.</p>
        <h3>4. Ausência de promessa de resultado</h3><p>Resultados físicos, estéticos, esportivos, financeiros ou de saúde dependem de múltiplos fatores individuais. O FitPro Elite não garante emagrecimento, ganho de massa, performance, cura, tratamento, renda ou resultado específico.</p>
        <h3>5. Responsabilidade dos usuários</h3><p>Usuários devem fornecer dados verdadeiros, proteger login e senha, respeitar limites físicos e usar a plataforma de forma lícita. O personal/profissional é responsável pelas orientações, treinos, conteúdos, avaliações e mensagens oferecidas aos seus alunos.</p>
        <h3>6. Uso permitido e proibido</h3><p>É permitido usar a plataforma para gestão fitness, comunicação, conteúdos, pagamentos, evolução, comunidade e recursos internos. É proibido fraude, invasão, engenharia reversa, cópia, revenda não autorizada, spam, assédio, conteúdo ilícito, tentativa de burlar pagamentos ou acessar áreas restritas.</p>
        <h3>7. Conta, planos e pagamentos</h3><p>Recursos pagos podem depender de plano ativo, código de ativação, pagamento aprovado ou validação administrativa. Reembolsos, quando aplicáveis, seguirão as regras do plano contratado, meio de pagamento, legislação vigente e análise administrativa.</p>
        <h3>8. Propriedade intelectual</h3><p>Marca, layout, código, identidade visual, fluxos, textos, componentes, painéis, recursos e estrutura do FitPro Elite pertencem ao titular/desenvolvedor da plataforma. É proibido copiar, reproduzir, distribuir, vender, clonar ou modificar sem autorização.</p>
        <h3>9. Disponibilidade e terceiros</h3><p>A plataforma pode passar por manutenção, instabilidades ou falhas temporárias de provedores externos como hospedagem, banco de dados, pagamentos, e-mail, WhatsApp, APIs, analytics e storage.</p>
        <h3>10. Limitação de responsabilidade</h3><p>Na máxima extensão permitida pela legislação aplicável, o FitPro Elite não será responsável por danos indiretos, lucros cessantes, resultados físicos não alcançados, condutas de profissionais ou alunos, indisponibilidade de terceiros ou decisões tomadas fora da plataforma.</p>
        <h3>11. Saúde e segurança</h3><p>Antes de iniciar treinos, dietas ou mudanças de rotina, procure orientação profissional adequada. Em caso de dor, tontura, falta de ar, lesão ou mal-estar, interrompa a atividade e busque atendimento.</p>
        <h3>12. Alterações e contato</h3><p>Estes termos podem ser atualizados. Contato: suporte@fitproelite.com ou canal configurado na plataforma. Lei aplicável: Brasil, com foro a ser definido em versão jurídica revisada.</p>` },
      privacidade: { title: 'Política de Privacidade', subtitle: 'Tratamento de dados pessoais conforme LGPD, sem venda de dados.', body: `
        <h3>1. Introdução</h3><p>Esta política descreve como dados pessoais são coletados, usados, armazenados, compartilhados e protegidos no FitPro Elite.</p>
        <h3>2. Dados coletados</h3><p>Podemos tratar nome, e-mail, telefone, avatar, cidade/UF, tipo de conta, login, plano, pagamentos/comprovantes, mensagens, comentários, conteúdos enviados, treinos, progresso, check-ins, preferências, IP, dispositivo, navegador, logs, cookies e dados de uso.</p>
        <h3>3. Dados sensíveis</h3><p>Informações fitness, evolução, hábitos, treinos, medidas, avaliações e dados corporais podem exigir cuidado adicional. Não coletamos dados sensíveis desnecessários e usamos essas informações apenas para finalidades claras da plataforma.</p>
        <h3>4. Finalidades</h3><p>Os dados podem ser usados para criar conta, autenticar login, entregar funcionalidades, conectar personal e aluno, exibir treinos, acompanhar progresso, mensagens/comunidade, pagamentos, suporte, auditoria, segurança, prevenção de fraude e melhoria da plataforma.</p>
        <h3>5. Bases legais</h3><p>As bases podem incluir execução de contrato, obrigação legal, legítimo interesse, consentimento quando necessário, exercício regular de direitos, proteção da vida/incolumidade física e tutela da saúde quando aplicável por profissional habilitado.</p>
        <h3>6. Compartilhamento</h3><p>Dados podem ser compartilhados com hospedagem, banco de dados, pagamentos, e-mail, WhatsApp/API, segurança, suporte técnico e autoridades legais quando obrigatório. Não vendemos dados pessoais.</p>
        <h3>7. Retenção e segurança</h3><p>Os dados são mantidos pelo tempo necessário para finalidades, obrigações legais, segurança, auditoria e exercício de direitos. Aplicamos controle de acesso, autenticação, variáveis protegidas, backups, logs e permissões por perfil, sem prometer segurança absoluta.</p>
        <h3>8. Direitos do titular</h3><p>Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação, portabilidade quando aplicável, informação sobre compartilhamento, revogação de consentimento e oposição quando cabível.</p>
        <h3>9. Menores, transferência internacional e incidentes</h3><p>Uso por menores exige autorização do responsável quando aplicável. Provedores como Vercel, Railway, Supabase, Mercado Pago, Resend, OpenAI ou outros podem processar dados fora do Brasil. Incidentes relevantes serão tratados conforme medidas razoáveis e legislação aplicável.</p>
        <h3>10. Contato</h3><p>Encarregado/DPO configurável: privacidade@fitproelite.com.</p>` },
      lgpd: { title: 'Central de Privacidade e LGPD', subtitle: 'Solicitações de direitos do titular e consentimento.', body: `
        <p>Você pode solicitar acesso, correção, exclusão, portabilidade, revogação de consentimento ou informações sobre o uso dos seus dados pessoais.</p>
        <div class="legal-actions"><button class="ghost" data-action="lgpd-request" data-kind="acesso">Solicitar meus dados</button><button class="ghost" data-action="lgpd-request" data-kind="correcao">Corrigir meus dados</button><button class="ghost" data-action="lgpd-request" data-kind="exclusao">Excluir conta/dados</button><button class="ghost" data-action="lgpd-request" data-kind="revogacao">Revogar consentimento</button><button class="primary" data-action="lgpd-request" data-kind="contato">Falar com privacidade</button></div>
        <p class="notice">Nesta fase, as ações abrem um fluxo guiado e registrável para suporte. Backend dedicado de requisições LGPD fica preparado para etapa futura.</p>` },
      cookies: { title: 'Política e Preferências de Cookies', subtitle: 'Cookies necessários, funcionais, analíticos e terceiros.', body: `
        <h3>O que são cookies</h3><p>Cookies e tecnologias similares ajudam funcionamento, segurança, preferências, análise e melhoria da plataforma.</p>
        <h3>Tipos usados</h3><p><b>Necessários:</b> login, sessão e segurança, sempre ativos. <b>Funcionais:</b> tema, filtros e escolhas. <b>Analíticos:</b> uso, erros e performance. <b>Terceiros:</b> pagamentos, vídeos, chat, WhatsApp, APIs ou recursos incorporados quando configurados.</p>
        <div class="cookie-preferences"><label><input type="checkbox" checked disabled> Necessários</label><label><input type="checkbox" data-cookie-pref="functional"> Funcionais</label><label><input type="checkbox" data-cookie-pref="analytics"> Analíticos</label><label><input type="checkbox" data-cookie-pref="thirdParty"> Terceiros</label></div>
        <div class="modal-actions"><button class="primary" data-action="save-cookie-preferences">Salvar preferências</button><button class="ghost" data-action="accept-cookies">Aceitar todos</button><button class="ghost" data-action="reject-cookies">Rejeitar não necessários</button></div>
        <table class="legal-table"><thead><tr><th>Cookie</th><th>Categoria</th><th>Finalidade</th><th>Duração</th></tr></thead><tbody><tr><td>fitpro_session</td><td>necessário</td><td>manter login seguro</td><td>sessão</td></tr><tr><td>fitpro_cookie_consent</td><td>necessário</td><td>salvar preferências</td><td>6 meses</td></tr><tr><td>fitpro_theme</td><td>funcional</td><td>preferência visual</td><td>6 meses</td></tr><tr><td>fitpro_analytics</td><td>analítico</td><td>métricas agregadas</td><td>configurável</td></tr></tbody></table>` },
      suporte: { title: 'Suporte FitPro', subtitle: 'Ajuda para login, pagamentos, avatar, treinos e permissões.', body: `<p>Use o suporte para relatar erro de login, pagamento, comprovante, upload, perfil, treino, permissões, integração ou dúvidas de uso.</p><div class="modal-actions"><button class="primary" data-modal="ai-assistant">Abrir Assistente IA</button><button class="ghost" data-action="whatsapp-support">Falar no WhatsApp</button></div>` },
      responsabilidade: { title: 'Aviso de saúde e responsabilidade', subtitle: 'Apoio fitness, sem substituir atendimento profissional habilitado.', body: `<p>O FitPro Elite apoia acompanhamento fitness e organização de treinos, mas não substitui médico, nutricionista, fisioterapeuta ou profissional habilitado. Interrompa atividades em caso de dor, tontura, falta de ar, lesão ou mal-estar.</p>` },
      contato: { title: 'Contato', subtitle: 'Canais institucionais do projeto.', body: `<p>Criador do projeto: uPaiva — Dev Web • IA • Automação.</p><p>Site: https://upaiva.dev/ • GitHub: EoPaiva • E-mail: suporte@fitproelite.com.</p>` }
    };
    const item = sections[legalKey] || sections.termos;
    return `<h2>${esc(item.title)}</h2><p class="legal-updated">Última atualização: ${updated}</p><p>${esc(item.subtitle)}</p><article class="card legal-card legal-rich">${item.body}</article><div class="modal-actions"><button class="primary" data-close>Entendi</button><button class="ghost" data-close>Fechar</button></div>`;
  }
  if (type === 'workspace-audit') {
    const audit = payload?.audit || payload || {};
    const checks = audit.checks || [];
    const summary = audit.summary || {};
    return `<h2>Auditoria do workspace</h2><p>${esc(audit.workspaceName || workspaceDisplayName())} • ${dateTimeBR(audit.checkedAt || new Date().toISOString())}</p><section class="stats-grid compact-stats">${stat('OK', summary.ok || 0, 'checagens verdes')}${stat('Parcial', summary.warn || 0, 'atenção/configurar')}${stat('Falhas', summary.danger || 0, 'corrigir')}${stat('Ambiente', audit.environment || '-', 'sem secrets expostos')}</section><article class="card"><h3>Resultado verificável</h3>${checks.map((c:any)=>`<div class="list-row"><span><b>${c.status === 'ok' ? '🟢' : c.status === 'danger' ? '🔴' : '🟡'} ${esc(c.label)}</b><small>${esc(c.detail || '')}</small></span><span class="badge ${c.status === 'ok' ? 'ok' : c.status === 'danger' ? 'danger' : 'warn'}">${esc(c.statusLabel || c.status)}</span></div>`).join('') || empty('Nenhuma checagem retornada.')}</article><p class="notice">A auditoria mostra apenas configurado/ausente/ok. Tokens, secrets e chaves privadas não são exibidos.</p><div class="modal-actions"><button class="primary" data-close>Fechar</button><button class="ghost" data-tab="status">Abrir Status Dev</button></div>`;
  }
  if (type === 'new-trainer') return `<h2>Criar personal</h2><form data-form="trainer"><div class="form-grid"><input name="name" placeholder="Nome profissional" required><input name="email" type="email" placeholder="E-mail" required><input name="password" type="password" placeholder="Senha inicial" required minlength="6"><input name="phone" placeholder="WhatsApp"><input name="city" placeholder="Cidade"><input name="state" placeholder="Estado"><input name="specialty" placeholder="Especialidades"><select name="modalities"><option value="online">Online</option><option value="presencial">Presencial</option><option value="hibrido">Híbrido</option></select></div><label>Bio<textarea name="bio"></textarea></label><div class="checks"><label><input type="checkbox" name="premium"> Premium</label><label><input type="checkbox" name="aiEnabled"> Acesso à IA</label><label><input type="checkbox" name="requiresPasswordChange" checked> Exigir troca de senha</label></div><button class="primary">Criar personal</button></form>`;
  if (type === 'tenant-branding') { const b = data!.tenantBranding || {}; return `<h2>Editar marca pública</h2><form data-form="tenant-branding"><div class="form-grid"><label>Slug público<input name="publicSlug" value="${esc(b.publicSlug || data!.settings.slug || 'fitpro')}"></label><label>Domínio próprio futuro<input name="customDomain" value="${esc(b.customDomain || '')}" placeholder="fitpro.seudominio.com"></label><label>Cor principal<input name="primaryColor" value="${esc(b.primaryColor || '#00e676')}"></label><label>Cor de destaque<input name="accentColor" value="${esc(b.accentColor || '#16a34a')}"></label></div><label>Headline<input name="headline" value="${esc(b.headline || '')}" placeholder="Acompanhamento premium"></label><label>Descrição pública<textarea name="publicDescription">${esc(b.publicDescription || '')}</textarea></label><label>CTA WhatsApp<input name="whatsappCta" value="${esc(b.whatsappCta || 'Quero iniciar meu acompanhamento FitPro')}"></label><button class="primary">Salvar marca</button></form>`; }
  if (type === 'new-coupon') return `<h2>Novo cupom</h2><form data-form="coupon"><div class="form-grid"><label>Código<input name="code" required placeholder="FITPRO10"></label><label>Tipo<select name="discountType"><option value="percent">Percentual</option><option value="fixed">Valor fixo</option></select></label><label>Desconto<input name="discountValue" type="number" step="0.01" required></label><label>Valor mínimo<input name="minAmount" type="number" step="0.01"></label><label>Máximo de usos<input name="maxUses" type="number"></label><label>Expira em<input name="expiresAt" type="datetime-local"></label></div><label>Descrição<input name="description" placeholder="Cupom de campanha"></label><button class="primary">Criar cupom</button></form>`;
  if (type === 'device-connect') return `<h2>Conectar wearable/manual</h2><form data-form="device-connect"><label>Aluno<select name="studentId">${data!.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><label>Provedor<select name="provider"><option value="manual_fitpro">Manual FitPro</option><option value="google_fit_future">Google Fit futuro</option><option value="apple_health_future">Apple Health futuro</option><option value="garmin_future">Garmin futuro</option></select></label><div class="form-grid"><input name="steps" type="number" placeholder="Passos"><input name="activeMinutes" type="number" placeholder="Minutos ativos"><input name="sleepHours" type="number" step="0.1" placeholder="Sono horas"></div><button class="primary">Conectar/atualizar</button></form>`;
  if (type === 'health-metric') return `<h2>Registrar métrica</h2><form data-form="health-metric"><label>Aluno<select name="studentId">${data!.students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label><div class="form-grid"><input name="metricDate" type="date"><input name="steps" type="number" placeholder="Passos"><input name="calories" type="number" placeholder="Calorias"><input name="activeMinutes" type="number" placeholder="Minutos ativos"><input name="sleepHours" type="number" step="0.1" placeholder="Sono horas"><input name="heartRateAvg" type="number" placeholder="FC média"></div><button class="primary">Salvar métrica</button></form>`;
  return `<h2>Em breve</h2><p>Este módulo possui estrutura preparada e será ligado ao backend na próxima etapa segura.</p>`;
}

async function renderProofModal(paymentId: string) {
  const p = data!.payments.find(x => x.id === paymentId);
  if (!p) return;
  const s = studentOf(p.studentId); const plan = planOf(p.planId);
  const src = protectedFileUrl(`/api/payments/${p.id}/proof`);
  const srcDownload = protectedFileUrl(`/api/payments/${p.id}/proof?download=1`);
  const isPdf = p.proofMimeType === 'application/pdf';
  modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal proof-modal"><button class="close-x" data-close aria-label="Fechar modal">×</button><div class="proof-grid"><div class="proof-preview">${p.hasProof ? (isPdf ? `<iframe src="${src}" title="Comprovante PDF"></iframe>` : `<img src="${src}" alt="Comprovante">`) : empty('Nenhum comprovante enviado')}</div><div><span class="eyebrow">Análise manual</span><h2>${esc(p.proofName || 'Aguardando comprovante')}</h2><div class="info-grid vertical"><span>Aluno<b>${esc(s?.name)}</b></span><span>Plano<b>${esc(plan?.name)}</b></span><span>Valor<b>${money(p.amount)}</b></span><span>Vencimento<b>${dateBR(p.dueDate)}</b></span><span>Enviado em<b>${dateTimeBR(p.proofUploadedAt)}</b></span><span>Status<b>${statusLabel(p.status)}</b></span><span>Observação<b>${esc(p.proofStudentNote || '-')}</b></span></div><div class="modal-actions"><a class="ghost" href="${src}" target="_blank" rel="noopener">Abrir em nova aba</a><a class="ghost" href="${srcDownload}">Baixar comprovante</a>${data!.user.role !== 'student' ? `<button class="primary" data-action="approve-payment" data-id="${p.id}">Aprovar</button><button class="danger" data-action="reject-payment" data-id="${p.id}">Reprovar</button><button class="ghost" data-modal="payment-history" data-id="${p.id}">Histórico</button>` : ''}</div><p class="notice">Comprovante privado: aluno só acessa o próprio arquivo; personal acessa alunos do workspace; dev/super admin audita.</p></div></div></div></div>`;
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
  document.querySelectorAll<HTMLElement>('[data-view]').forEach(el => el.onclick = () => { view = el.dataset.view as View; if (view === 'register') registerMode = 'choice'; render(); });
  document.querySelectorAll<HTMLElement>('[data-register-mode]').forEach(el => el.onclick = () => { registerMode = (el.dataset.registerMode as any) || 'choice'; view = 'register'; render(); });
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach(el => el.onclick = () => { tab = el.dataset.tab || 'dashboard'; closeModal(); render(); });
  document.querySelectorAll<HTMLElement>('[data-modal]').forEach(el => el.onclick = () => openModal(el.dataset.modal!, el.dataset.id));
  document.querySelectorAll<HTMLFormElement>('form[data-form]').forEach(form => form.onsubmit = submitForm);
  document.querySelectorAll<HTMLInputElement>('[data-avatar-input]').forEach(input => input.onchange = async () => {
    const file = input.files?.[0];
    const preview = input.closest('form')?.querySelector<HTMLElement>('[data-avatar-preview]');
    if (!file || !preview) return;
    const temp = await fileToDataUrl(file);
    preview.innerHTML = `<span class="avatar avatar-img profile-avatar"><span class="avatar-fallback">${esc(initials(data?.user.name || 'FP'))}</span><img src="${esc(temp)}" alt="Prévia da foto"></span><small>Prévia local. Clique em salvar para persistir.</small>`;
  });
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
  bindExerciseLibraryFilters();
  modalRoot.querySelectorAll<HTMLElement>('[data-plan-filter]').forEach(btn => btn.onclick = () => {
    const filter = btn.dataset.planFilter || 'all';
    modalRoot.querySelectorAll<HTMLElement>('[data-plan-filter]').forEach(b=>b.classList.toggle('selected', b===btn));
    modalRoot.querySelectorAll<HTMLElement>('[data-plan-day-card]').forEach(card => {
      const tags = card.dataset.filter || '';
      card.style.display = filter === 'all' || tags.includes(filter) ? '' : 'none';
    });
  });
  bindWorkoutWizard();
}
function bindExerciseLibraryFilters() {
  const search = modalRoot.querySelector<HTMLInputElement>('[data-library-search]');
  const muscle = modalRoot.querySelector<HTMLSelectElement>('[data-library-filter="muscle"]');
  const equipment = modalRoot.querySelector<HTMLSelectElement>('[data-library-filter="equipment"]');
  if (!search && !muscle && !equipment) return;
  const apply = () => {
    const q = (search?.value || '').toLowerCase().trim();
    const m = (muscle?.value || '').toLowerCase().trim();
    const e = (equipment?.value || '').toLowerCase().trim();
    modalRoot.querySelectorAll<HTMLElement>('.library-item').forEach(item => {
      const text = item.dataset.name || '';
      const okSearch = !q || text.includes(q);
      const okMuscle = !m || (item.dataset.muscle || '').includes(m);
      const okEquipment = !e || (item.dataset.equipment || '').includes(e);
      item.style.display = okSearch && okMuscle && okEquipment ? '' : 'none';
    });
  };
  search?.addEventListener('input', apply);
  muscle?.addEventListener('change', apply);
  equipment?.addEventListener('change', apply);
}
function updateWorkoutReview(form: HTMLFormElement) {
  const days = collectWizardDays(form); const activeDays = days.filter(d => d.dayType === 'treino' || d.exercises.length);
  const exercises = days.reduce((acc:number,d:any)=>acc+d.exercises.length,0);
  const review = form.querySelector<HTMLElement>('[data-workout-review]');
  if (review) review.innerHTML = `<div class="stats-grid compact-stats">${stat('Dias com treino', activeDays.length, 'na semana')}${stat('Exercícios', exercises, 'configurados')}${stat('Template', (form.elements.namedItem('templateKey') as HTMLSelectElement)?.selectedOptions?.[0]?.text || 'zero', 'base da ficha')}${stat('Status', (form.elements.namedItem('status') as HTMLSelectElement)?.value || 'rascunho', 'salvamento')}</div>`;
}
function bindWorkoutWizard() {
  const assignForm = modalRoot.querySelector<HTMLFormElement>('form[data-form="assign-exercise"]');
  if (assignForm) {
    const toggleAssignMode = () => {
      const mode = assignForm.querySelector<HTMLSelectElement>('[data-assign-target-mode]')?.value || 'existing';
      assignForm.querySelectorAll<HTMLElement>('.assign-existing').forEach(el => el.style.display = mode === 'new' ? 'none' : '');
      assignForm.querySelectorAll<HTMLElement>('.assign-new').forEach(el => el.style.display = mode === 'existing' || mode === 'active' ? 'none' : '');
    };
    assignForm.querySelector<HTMLSelectElement>('[data-assign-target-mode]')?.addEventListener('change', toggleAssignMode);
    toggleAssignMode();
  }
  const form = modalRoot.querySelector<HTMLFormElement>('form[data-form="workout"]');
  if (!form) return;
  const updateActiveTarget = () => {
    const fd = new FormData(form);
    const planId = form.dataset.planId || '';
    const dayIndex = Number(form.querySelector<HTMLSelectElement>('[data-active-day-select]')?.value || 0);
    const days = collectWizardDays(form);
    const day = days[dayIndex];
    if (planId && day?.id) writeWorkoutActiveTarget({ studentId: String(fd.get('studentId') || ''), planId, dayId: day.id, planTitle: String(fd.get('title') || planById(planId)?.title || ''), dayLabel: `${day.weekday || ''} — ${day.name || ''}`, studentName: studentNameById(String(fd.get('studentId') || '')) });
  };
  form.addEventListener('change', updateActiveTarget);
  updateActiveTarget();

  let autosaveTimer: number | undefined;
  const autosaveBackend = () => {
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(async () => {
      try {
        const draft = collectWorkoutWizardDraft(form);
        if (form.dataset.mode === 'edit' && form.dataset.planId) {
          await api(`/api/workout-plans/${form.dataset.planId}`, { method: 'PATCH', body: JSON.stringify({ ...draft, fullEdit: true, status: 'rascunho', reason: 'Autosave backend do editor de ficha.' }) });
        } else {
          await api('/api/workout-drafts', { method: 'POST', body: JSON.stringify({ title: draft.title || 'Nova ficha', studentId: draft.studentId || '', draft, source: 'new-workout-wizard', lastStep: Number(form.dataset.step || 1) }) });
        }
        toast('Rascunho salvo no backend.');
      } catch { toast('Autosave backend não concluiu. Você ainda pode salvar manualmente.'); }
    }, 2600);
  };
  const autosave = () => { const draft = collectWorkoutWizardDraft(form); const hidden = form.querySelector<HTMLInputElement>('[data-days-json]'); if (hidden) hidden.value = JSON.stringify(draft.days); if (form.dataset.mode !== 'edit') writeWorkoutDraft(draft); autosaveBackend(); updateWorkoutReview(form); };
  modalRoot.querySelector<HTMLElement>('[data-load-workout-draft]')?.addEventListener('click', () => { const draft = readWorkoutDraft(); if (draft) { fillWorkoutFormFromDraft(form, draft); toast('Rascunho restaurado.'); } });
  modalRoot.querySelector<HTMLElement>('[data-clear-workout-draft]')?.addEventListener('click', () => { clearWorkoutDraft(); toast('Rascunho descartado.'); openModal('new-workout'); });
  form.querySelector<HTMLElement>('[data-wizard-prev]')?.addEventListener('click', () => { showWorkoutWizardStep(form, Number(form.dataset.step || 1) - 1); autosave(); });
  form.querySelector<HTMLElement>('[data-wizard-next]')?.addEventListener('click', () => { showWorkoutWizardStep(form, Number(form.dataset.step || 1) + 1); autosave(); });
  form.querySelector<HTMLSelectElement>('[data-workout-template-select]')?.addEventListener('change', (event) => {
    const select = event.currentTarget as HTMLSelectElement; const template = workoutTemplateFull(select.value); if (!template) return;
    const fields:any = { title: template.title, objective: template.objective, level: template.level, frequencyPerWeek: template.frequency, estimatedDuration: template.duration || template.estimatedDuration || '60 min', modality: template.modality || 'academia', location: template.location || 'academia completa', warmup: template.warmup || 'Aquecimento geral 5 a 8 minutos + séries leves dos principais exercícios.', cardio: template.cardio || '', cooldown: template.cooldown || 'Alongamento leve e mobilidade final conforme necessidade.', safetyNotes: template.safetyNotes || 'Modelos são sugestões gerais e devem ser ajustados pelo personal.', progressionRule: template.progressionRule || 'Progredir carga/reps apenas com boa técnica, sem dor e com recuperação adequada.' };
    Object.entries(fields).forEach(([key,value]) => { const input = form.elements.namedItem(key) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null; if (input && value) input.value = String(value); });
    applyWorkoutDaysToForm(form, scheduledTemplateDays(template));
    showWorkoutWizardStep(form, 2); autosave(); toast(`Template aplicado: ${template.title}`);
  });
  form.addEventListener('input', autosave); form.addEventListener('change', autosave);
  form.querySelector<HTMLElement>('[data-weekly-days]')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement; const exEl = target.closest<HTMLElement>('[data-exercise-index]'); const dayEl = target.closest<HTMLElement>('[data-wizard-day]'); if (!exEl || !dayEl) return;
    if (target.closest('[data-wizard-exercise-remove]')) { exEl.remove(); autosave(); toast('Exercício removido do rascunho.'); }
    if (target.closest('[data-wizard-exercise-duplicate]')) { exEl.insertAdjacentHTML('afterend', exEl.outerHTML); autosave(); toast('Exercício duplicado.'); }
    if (target.closest('[data-wizard-exercise-move="up"]')) { const prev = exEl.previousElementSibling; if (prev && !prev.classList.contains('empty')) dayEl.querySelector('[data-day-exercises]')?.insertBefore(exEl, prev); autosave(); }
    if (target.closest('[data-wizard-exercise-move="down"]')) { const next = exEl.nextElementSibling; if (next) dayEl.querySelector('[data-day-exercises]')?.insertBefore(next, exEl); autosave(); }
  });
  form.querySelector<HTMLElement>('.wizard-library')?.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLElement>('[data-add-library-exercise]'); if (!btn) return;
    const activeDay = Number((form.querySelector<HTMLSelectElement>('[data-active-day-select]')?.value || '0'));
    const days = collectWizardDays(form); const item = ((data as any).exerciseLibrary || []).find((e:any) => String(e.id || e.name) === String(btn.dataset.addLibraryExercise)); if (!item) return toast('Exercício não encontrado na biblioteca.');
    days[activeDay] ||= makeEmptyWorkoutWeek()[activeDay];
    if ((days[activeDay].exercises || []).some((ex:any) => String(ex.name).toLowerCase() === String(item.name).toLowerCase())) return toast('Este exercício já está neste treino.');
    days[activeDay].dayType = 'treino'; days[activeDay].exercises = [...(days[activeDay].exercises || []), cloneWorkoutExercise(item, (days[activeDay].exercises || []).length + 1)];
    applyWorkoutDaysToForm(form, days); autosave(); toast(`Exercício adicionado ao ${days[activeDay].name || days[activeDay].weekday}.`);
  });
  const search = form.querySelector<HTMLInputElement>('[data-wizard-library-search]'); const muscle = form.querySelector<HTMLSelectElement>('[data-wizard-library-filter="muscle"]');
  const filter = () => { const q=(search?.value||'').toLowerCase().trim(); const m=(muscle?.value||'').toLowerCase().trim(); form.querySelectorAll<HTMLElement>('.wizard-library-item').forEach(item => { const ok=(!q || (item.dataset.name||'').includes(q)) && (!m || (item.dataset.muscle||'').includes(m)); item.style.display=ok?'':'none'; }); };
  search?.addEventListener('input', filter); muscle?.addEventListener('change', filter);
  updateWorkoutReview(form); autosave();
}
window.onkeydown = (event: KeyboardEvent) => { if (event.key === 'Escape' && modal) closeModal(); };
async function submitForm(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const submitter = event.submitter as HTMLButtonElement | null;
  const type = form.dataset.form!;
  const fd = new FormData(form);
  const body: Record<string, any> = {};
  fd.forEach((value, key) => { if (!(value instanceof File)) body[key] = value; });
  await action(async () => {
    if (type === 'login') { const r = await api<{token:string,user:User}>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }); setToken(r.token); await reload(); view = 'app'; tab = 'dashboard'; render(); return; }
    if (type === 'register') { body.terms = fd.get('terms') === 'on'; body.lgpd = fd.get('lgpd') === 'on'; body.photos = fd.get('photos') === 'on'; body.notifications = fd.get('notifications') === 'on'; const r = await api<{token:string}>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }); setToken(r.token); await reload(); view = 'app'; tab = body.accountType === 'trainer' ? 'planos-plataforma' : 'dashboard'; render(); return; }
    if (type === 'lead') { await api('/api/leads', { method: 'POST', body: JSON.stringify(body) }); form.reset(); return; }
    if (type === 'onboarding-preferences') { const st = currentStudent(); if (st) Object.assign(st, body); render(); return; }
    if (type === 'onboarding-request') { const r = await api<{bootstrap:Bootstrap}>('/api/student/onboarding/request-personal', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); tab = 'dashboard'; render(); return; }
    if (type === 'habit-quick') {
      const quick:any = {}; const advanced:any = {};
      for (const [key,value] of Object.entries(body)) { if (key.startsWith('adv')) advanced[key.slice(3,4).toLowerCase()+key.slice(4)] = value; else quick[key] = value; }
      const r = await api<{bootstrap:Bootstrap,feedback:string}>('/api/habits/quick-checkin', { method: 'POST', body: JSON.stringify({ quick, advanced, notes: body.notes }) }); data = adoptBootstrap(r.bootstrap); toast(r.feedback || 'Check-in salvo.'); closeModal(); render(); return;
    }
    if (type === 'trainer-payment-settings') { const r = await api<{bootstrap:Bootstrap}>('/api/trainer/payment-settings', { method: 'PUT', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'trainer-plan') { const r = await api<{bootstrap:Bootstrap}>('/api/trainer/plans', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'activation-code-redeem') {
      const submitAction = submitter?.value || body.action || 'redeem';
      const endpoint = submitAction === 'validate' ? '/api/platform-activation-codes/validate' : '/api/platform-activation-codes/redeem';
      const r = await api<any>(endpoint, { method: 'POST', body: JSON.stringify({ code: body.code }) });
      if (r.bootstrap) data = adoptBootstrap(r.bootstrap);
      closeModal();
      toast(submitAction === 'validate' ? (r.message || 'Código válido.') : `Código ativado: ${r.plan?.name || 'plano liberado'}`);
      render();
      return;
    }
    if (type === 'platform-activation-code') { const r = await api<any>('/api/admin/platform-activation-codes', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); toast(`Código criado: ${r.code?.code || 'gerado'}`); render(); return; }
    if (type === 'settings') { const r = await api<{bootstrap:Bootstrap}>('/api/settings', { method: 'PUT', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); render(); return; }
    if (type === 'assign-exercise') {
      const exercise = libraryExerciseByKey(String(body.exerciseKey || ''));
      if (!exercise) throw new Error('Exercício não encontrado na biblioteca.');
      const defaults = exerciseDefaultsFromLibrary(exercise);
      const saveMode = submitter?.value || body.saveMode || 'draft';
      const targetMode = body.targetMode || 'existing';
      const exercisePayload = {
        exerciseId: defaults.exerciseId,
        name: defaults.name,
        muscleGroup: defaults.muscleGroup,
        category: defaults.category,
        equipment: defaults.equipment,
        sets: body.sets || defaults.sets,
        reps: body.reps || defaults.reps,
        rest: body.rest || defaults.rest,
        load: body.load || defaults.load,
        order: body.order || '',
        method: body.method || defaults.method,
        notes: body.notes || defaults.notes,
        substitutions: defaults.substitutions,
        cautions: body.cautions || defaults.cautions
      };
      if (!body.studentId) throw new Error('Selecione um aluno antes de continuar.');
      if (targetMode === 'existing' || targetMode === 'active') {
        const active = readWorkoutActiveTarget();
        const workoutDayId = String(body.workoutDayId || (targetMode === 'active' ? active?.dayId : '') || '');
        if (!workoutDayId) throw new Error('Selecione uma ficha e um dia/treino antes de adicionar.');
        const dayCtxBefore = dayById(workoutDayId);
        const addResult = await api<{bootstrap:Bootstrap,plan?:any}>(`/api/workout-days/${workoutDayId}/exercises`, { method: 'POST', body: JSON.stringify(exercisePayload) });
        data = adoptBootstrap(addResult.bootstrap);
        const refreshedPlan = addResult.plan || planById(dayCtxBefore?.plan?.id || '');
        if (saveMode === 'publish' && (dayCtxBefore?.plan?.id || refreshedPlan?.id)) {
          const publishResult = await api<{bootstrap:Bootstrap}>(`/api/workout-plans/${dayCtxBefore?.plan?.id || refreshedPlan.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'ativo', reason: 'Publicação pelo fluxo guiado da biblioteca.' }) });
          data = adoptBootstrap(publishResult.bootstrap);
        }
        const planId = dayCtxBefore?.plan?.id || refreshedPlan?.id || '';
        if (planId) writeWorkoutActiveTarget({ studentId: String(body.studentId), planId, dayId: workoutDayId, planTitle: dayCtxBefore?.plan?.title || refreshedPlan?.title || 'Ficha', dayLabel: `${dayCtxBefore?.day?.weekday || ''} — ${dayCtxBefore?.day?.name || 'Treino'}`, studentName: studentNameById(String(body.studentId)) });
        if (saveMode === 'continue') { openModal('exercise-library'); render(); return; }
        closeModal(); tab = 'treinos'; render(); return;
      }
      const days = [{ weekday: body.weekday || 'Segunda', dayType: 'treino', name: body.dayName || 'Treino A', focus: defaults.muscleGroup, muscleGroup: defaults.muscleGroup, intensity: 'moderada', estimatedDuration: '60 min', notes: 'Ficha criada a partir da biblioteca avançada.', order: 1, exercises: [exercisePayload] }];
      const createPayload = { studentId: body.studentId, title: body.title || `Ficha com ${defaults.name}`, objective: body.objective || defaults.category || 'hipertrofia', level: body.level || defaults.level || 'iniciante', type: 'personalizada', modality: 'academia', location: defaults.equipment === 'peso corporal' ? 'casa sem equipamentos' : 'academia completa', frequencyPerWeek: 'personalizado', estimatedDuration: '60 min', status: saveMode === 'publish' ? 'ativo' : 'rascunho', action: saveMode === 'publish' ? 'publish' : 'draft', days, safetyNotes: 'Os modelos são sugestões gerais e devem ser ajustados pelo personal.', progressionRule: 'Progredir somente com boa técnica e sem dor.' };
      const created = await api<{bootstrap:Bootstrap,plan?:any,id?:string}>('/api/workout-plans', { method: 'POST', body: JSON.stringify(createPayload) });
      data = adoptBootstrap(created.bootstrap);
      const newPlan = created.plan || planById(created.id || '');
      const firstDay = newPlan?.days?.[0];
      if (firstDay?.id) writeWorkoutActiveTarget({ studentId: String(body.studentId), planId: newPlan.id, dayId: firstDay.id, planTitle: newPlan.title, dayLabel: `${firstDay.weekday || ''} — ${firstDay.name || 'Treino'}`, studentName: studentNameById(String(body.studentId)) });
      if (saveMode === 'continue') { openModal('exercise-library'); render(); return; }
      closeModal(); tab = 'treinos'; render(); return;
    }
    if (type === 'monthly-plan') {
      const plan = monthlyPlanByKey(form.dataset.planKey || String(body.planKey || ''));
      if (!plan) throw new Error('Plano de 30 dias não encontrado.');
      if (!body.studentId) throw new Error('Selecione um aluno antes de aplicar o plano.');
      const saveMode = submitter?.value || body.saveMode || 'draft';
      const days = buildMonthlyPlanDays(plan, String(body.startDate || ''));
      const payload = {
        studentId: body.studentId,
        title: `${plan.name} · ${studentNameById(String(body.studentId)) || 'Aluno'}`,
        objective: plan.goal,
        level: plan.level,
        type: 'plano mensal 30 dias',
        modality: plan.location.includes('casa') ? 'casa ou academia' : 'academia',
        location: plan.location,
        frequencyPerWeek: plan.frequency,
        estimatedDuration: plan.duration,
        startDate: body.startDate || '',
        reviewDate: '',
        status: saveMode === 'publish' ? 'ativo' : 'rascunho',
        action: saveMode === 'publish' ? 'publish' : 'draft',
        templateKey: plan.key,
        notes: body.personalNote || plan.description,
        safetyNotes: 'Os planos são modelos gerais e devem ser ajustados pelo profissional conforme histórico, limitações, objetivo, experiência e condição física do aluno.',
        progressionRule: plan.progressions.join('\n'),
        weeklyGoal: 'Concluir os treinos previstos da semana respeitando descanso e técnica.',
        warmup: 'Aquecimento geral de 5 a 8 minutos e séries leves antes dos principais exercícios.',
        cardio: plan.pattern.some(d => d.dayType === 'cardio') ? 'Cardio previsto nos dias marcados como cardio/opcional.' : '',
        cooldown: 'Alongamento leve e mobilidade final quando indicado.',
        equipmentNeeded: plan.equipment,
        motivationalMessage: 'Consistência, execução e recuperação são prioridade neste ciclo de 30 dias.',
        days
      };
      const r = await api<{bootstrap:Bootstrap,plan?:any}>('/api/workout-plans', { method: 'POST', body: JSON.stringify(payload) });
      data = adoptBootstrap(r.bootstrap);
      if (saveMode === 'preview' && r.plan?.id) { openModal('student-workout-preview', r.plan.id); render(); return; }
      closeModal(); tab = 'treinos'; render(); return;
    }
    if (type === 'post') { const r = await api<{bootstrap:Bootstrap}>('/api/community-posts', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'message') { const r = await api<{bootstrap:Bootstrap}>('/api/messages', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'student') { const r = await api<{bootstrap:Bootstrap}>('/api/students', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'workout') {
      let days:any[] = [];
      if (body.daysJson) { try { days = JSON.parse(body.daysJson); } catch { days = []; } }
      if (!days.length) days = collectWizardDays(form);
      days = days.filter((d:any) => d.dayType !== 'descanso' || (d.exercises || []).length || String(d.notes || '').trim());
      body.action = submitter?.name === 'action' ? submitter.value : body.status === 'ativo' ? 'publish' : 'draft';
      body.targetMode = submitter?.name === 'targetMode' ? submitter.value : (body.studentId ? 'student' : 'template');
      body.days = days;
      const mode = form.dataset.mode || 'create';
      const planId = form.dataset.planId || '';
      const endpoint = mode === 'edit' && planId ? `/api/workout-plans/${planId}` : '/api/workout-plans';
      const method = mode === 'edit' && planId ? 'PATCH' : 'POST';
      body.fullEdit = mode === 'edit';
      body.reason = mode === 'edit' ? 'Edição completa em etapas pelo personal.' : undefined;
      const r = await api<{bootstrap:Bootstrap}>(endpoint, { method, body: JSON.stringify(body) });
      data = adoptBootstrap(r.bootstrap);
      if (mode !== 'edit') clearWorkoutDraft();
      closeModal(); render(); return;
    }
    if (type === 'workout-exercise-edit') {
      const r = await api<{bootstrap:Bootstrap}>(`/api/workout-exercises/${form.dataset.exerciseId}`, { method: 'PATCH', body: JSON.stringify(body) });
      data = adoptBootstrap(r.bootstrap); openModal('workout-plan', findWorkoutExerciseById(form.dataset.exerciseId || '')?.plan?.id || ''); render(); return;
    }
    if (type === 'workout-log') {
      const exercises:any[] = [];
      for (let i=0;i<80;i++) {
        const exId = body[`logEx${i}Id`];
        if (!exId) continue;
        exercises.push({ workoutExerciseId: exId, completed: fd.get(`logEx${i}Completed`) === 'on', loadUsed: body[`logEx${i}Load`], repsDone: body[`logEx${i}Reps`], difficulty: body[`logEx${i}Difficulty`], painReported: body[`logEx${i}Pain`], notes: body[`logEx${i}Notes`] });
      }
      body.exercises = exercises;
      const r = await api<{bootstrap:Bootstrap}>(`/api/workout-plans/${form.dataset.planId}/logs`, { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return;
    }
    if (type === 'bulk-monthly-plan') {
      const plan = monthlyPlanByKey(form.dataset.planKey || String(body.planKey || ''));
      if (!plan) throw new Error('Plano de 30 dias não encontrado.');
      const selected = fd.getAll('studentIds').map(String).filter(Boolean);
      if (!selected.length) throw new Error('Selecione pelo menos um aluno.');
      const saveMode = String(body.saveMode || 'draft');
      const days = buildMonthlyPlanDays(plan, String(body.startDate || ''));
      const planPayload = { title: plan.name, objective: plan.goal, level: plan.level, type: 'plano mensal 30 dias', modality: plan.location.includes('casa') ? 'casa ou academia' : 'academia', location: plan.location, frequencyPerWeek: plan.frequency, estimatedDuration: plan.duration, startDate: body.startDate || '', reviewDate: '', status: saveMode === 'publish' ? 'ativo' : 'rascunho', action: saveMode === 'publish' ? 'publish' : 'draft', days, safetyNotes: 'Os planos são modelos gerais e devem ser ajustados pelo profissional responsável.', progressionRule: plan.progressions.join(' | '), motivationalMessage: 'Consistência, execução e recuperação são prioridades neste ciclo de 30 dias.' };
      const r = await api<{bootstrap:Bootstrap,created:string[]}>('/api/workout-plans/bulk-apply', { method: 'POST', body: JSON.stringify({ studentIds: selected, planPayload, startDate: body.startDate || '', status: planPayload.status, publish: saveMode === 'publish', title: plan.name }) });
      data = adoptBootstrap(r.bootstrap);
      closeModal(); tab = 'treinos'; render(); toast(`Plano aplicado para ${selected.length} aluno(s).`); return;
    }
    if (type === 'duplicate-plan-to-student') {
      if (!body.studentId) throw new Error('Selecione o aluno destino.');
      const r = await api<{bootstrap:Bootstrap}>(`/api/workout-plans/${form.dataset.planId}/duplicate`, { method: 'POST', body: JSON.stringify({ studentId: body.studentId, title: body.title, status: body.status, targetMode: 'student' }) });
      data = adoptBootstrap(r.bootstrap);
      if (body.status === 'ativo' && r.bootstrap) {
        const created = ((r.bootstrap as any).workoutPlans || []).find((p:any)=>p.title === body.title && String(p.studentId || p.student_id) === String(body.studentId));
        if (created?.id) {
          const pub = await api<{bootstrap:Bootstrap}>(`/api/workout-plans/${created.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'ativo', reason: 'Duplicada e publicada para outro aluno.' }) });
          data = adoptBootstrap(pub.bootstrap);
        }
      }
      closeModal(); tab = 'treinos'; render(); return;
    }
    if (type === 'exercise-library') { const r = await api<{bootstrap:Bootstrap}>('/api/exercise-library', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'schedule') { const r = await api<{bootstrap:Bootstrap}>('/api/schedules', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'assessment') { const r = await api<{bootstrap:Bootstrap}>('/api/assessments', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'trainer') { body.premium = fd.get('premium') === 'on'; body.aiEnabled = fd.get('aiEnabled') === 'on'; body.requiresPasswordChange = fd.get('requiresPasswordChange') === 'on'; const r = await api<{bootstrap:Bootstrap}>('/api/trainers', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'payment') { const plan = planOf(body.planId); if (!body.amount) body.amount = plan?.price || 0; const r = await api<{bootstrap:Bootstrap}>('/api/payments', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'avatar-upload') { const file = fd.get('file') as File; if (!file || !file.size) throw new Error('Selecione uma imagem.'); if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Use PNG, JPG ou WebP.'); if (file.size > 3 * 1024 * 1024) throw new Error('Imagem deve ter no máximo 3MB.'); const dataUrl = await fileToDataUrl(file); const r = await api<{bootstrap:Bootstrap,avatarUrl?:string,publicUrl?:string,storageProvider?:string,persisted?:any}>('/api/profile/avatar', { method: 'POST', body: JSON.stringify({ fileName: file.name, dataUrl }) }); data = adoptBootstrap(r.bootstrap, r.avatarUrl || r.publicUrl || ''); tab = 'perfil'; render(); toast(r.storageProvider === 'supabase_storage' ? 'Foto salva no Supabase Storage, gravada no banco e sincronizada na sessão.' : 'Foto salva com fallback local. Confira Supabase/Railway se quiser storage definitivo.'); return; }
    if (type === 'proof-upload') { const file = fd.get('file') as File; if (!file || !file.size) throw new Error('Selecione um arquivo.'); const dataUrl = await fileToDataUrl(file); const r = await api<{bootstrap:Bootstrap}>(`/api/payments/${form.dataset.paymentId}/proof`, { method: 'POST', body: JSON.stringify({ fileName: file.name, note: body.note, dataUrl }) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'tenant-branding') { const r = await api<{bootstrap:Bootstrap}>('/api/tenant/branding', { method: 'PUT', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'coupon') { const r = await api<{bootstrap:Bootstrap}>('/api/coupons', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'device-connect') { const r = await api<{bootstrap:Bootstrap}>('/api/device-connections', { method: 'POST', body: JSON.stringify({ studentId: body.studentId, provider: body.provider, metrics: { steps: Number(body.steps || 0), activeMinutes: Number(body.activeMinutes || 0), sleepHours: Number(body.sleepHours || 0) } }) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'health-metric') { const r = await api<{bootstrap:Bootstrap}>('/api/health-metrics', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'habit') { const r = await api<{bootstrap:Bootstrap}>('/api/habits', { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'comment-post') { const r = await api<{bootstrap:Bootstrap}>(`/api/community-posts/${form.dataset.postId}/comment`, { method: 'POST', body: JSON.stringify(body) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); return; }
    if (type === 'ai-help') { const r = await api<{answer:string,provider:string,warning:string}>('/api/ai/help', { method: 'POST', body: JSON.stringify({ question: body.question }) }); const box = document.querySelector('#ai-answer-box'); if (box) box.innerHTML = `<div class="message"><div class="message-head"><span class="avatar small-avatar">IA</span><span><b>FitPro Coach IA</b><small>${esc(r.provider)}</small></span></div><p>${esc(r.answer)}</p><small>${esc(r.warning)}</small></div>`; return; }
  }, 'Salvo com sucesso.');
}
function fileToDataUrl(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Falha ao ler arquivo.')); reader.readAsDataURL(file); }); }
async function handleAction(el: HTMLElement) {
  const actionName = el.dataset.action;
  if (actionName === 'ping-api') return action(async () => { await checkApiHealth(true); render(); }, 'Status da API atualizado.');
  if (actionName === 'accept-cookies') { saveCookiePrefs({ functional: true, analytics: true, thirdParty: true }); closeModal(); render(); toast('Preferências de cookies salvas.'); return; }
  if (actionName === 'reject-cookies') { saveCookiePrefs({ functional: false, analytics: false, thirdParty: false }); closeModal(); render(); toast('Cookies não necessários rejeitados.'); return; }
  if (actionName === 'save-cookie-preferences') { const root = modalRoot || document; saveCookiePrefs({ functional: Boolean(root.querySelector<HTMLInputElement>('[data-cookie-pref=\"functional\"]')?.checked), analytics: Boolean(root.querySelector<HTMLInputElement>('[data-cookie-pref=\"analytics\"]')?.checked), thirdParty: Boolean(root.querySelector<HTMLInputElement>('[data-cookie-pref=\"thirdParty\"]')?.checked) }); closeModal(); render(); toast('Preferências de cookies atualizadas.'); return; }
  if (actionName === 'lgpd-request') { toast(`Solicitação LGPD (${el.dataset.kind || 'contato'}) registrada como atendimento guiado. Backend dedicado fica para etapa futura.`); return; }
  if (actionName === 'monthly-preview-refresh') { const form = modalRoot.querySelector<HTMLFormElement>('form[data-form="monthly-plan"]'); const plan = monthlyPlanByKey(form?.dataset.planKey || ''); const box = modalRoot.querySelector<HTMLElement>('[data-monthly-preview]'); const startDate = String((form?.elements.namedItem('startDate') as HTMLInputElement | null)?.value || ''); if (plan && box) { box.innerHTML = renderMonthlyPlanPreview(plan, startDate); toast('Prévia mensal atualizada.'); } return; }
  if (actionName === 'audit-workspace') return action(async () => { const r = await api<any>('/api/admin/workspace-audit', { method: 'POST', body: JSON.stringify({ workspaceId: el.dataset.id || data?.user.workspaceId }) }); openModal('workspace-audit', r); }, 'Auditoria do workspace concluída.');
  if (actionName === 'copy-app-url') return action(async () => { await navigator.clipboard.writeText(location.href); }, 'Link copiado.');
  if (actionName === 'logout') return action(async () => { await api('/api/auth/logout', { method: 'POST' }); clearToken(); data = null; view = 'landing'; render(); }, 'Você saiu.');
  if (actionName === 'whatsapp') { const s = currentStudent(); const trainer = data?.user.role === 'student' ? trainerOf(s?.trainerId || s?.requestedTrainerId) : null; const kind = data?.user.role === 'student' && trainer ? 'student_to_trainer' : 'support_activation'; const url = whatsappHref(trainer?.whatsapp || trainer?.phone || data?.settings.whatsapp || '', whatsappTextForContext(kind, trainer?.name || '')); if (!url) return toast('WhatsApp não cadastrado para este contexto.'); window.open(url, '_blank', 'noopener'); return; }
  if (actionName === 'whatsapp-support') { const url = whatsappHref(data?.settings.whatsapp || '', whatsappTextForContext('support_activation')); if (!url) return toast('WhatsApp de suporte ainda não configurado nas configurações do workspace.'); window.open(url, '_blank', 'noopener'); return; }
  if (actionName === 'whatsapp-student' || actionName === 'whatsapp-lead') { const url = whatsappHref(el.dataset.phone || '', whatsappTextForContext(actionName === 'whatsapp-student' ? 'trainer_to_student' : 'generic', el.dataset.name || '')); if (!url) return toast('WhatsApp não cadastrado para este contato.'); window.open(url, '_blank', 'noopener'); return; }
  if (actionName === 'open-whatsapp') { const url = whatsappHref(el.dataset.phone || '', el.dataset.message || whatsappTextForContext()); if (!url) return toast('WhatsApp não configurado para este contato.'); window.open(url, '_blank', 'noopener'); return; }
  if (actionName === 'missing-whatsapp') { toast(`WhatsApp de ${el.dataset.target || 'contato'} não cadastrado. Cadastre telefone/WhatsApp para habilitar o contato.`); return; }
  if (actionName === 'verify-avatar') return action(async () => { const r = await api<any>('/api/profile/avatar/status'); if (r.bootstrap) data = adoptBootstrap(r.bootstrap, r.avatar || ''); render(); toast(r.ok ? `Avatar persistido: ${r.storageProvider || 'storage'} • sem token na URL.` : 'Avatar ainda não está totalmente persistido no banco/storage. Use Reparar ou reenvie a foto.'); }, 'Teste de avatar concluído.');
  if (actionName === 'repair-avatar') return action(async () => { const r = await api<any>('/api/profile/avatar/repair', { method: 'POST', body: JSON.stringify({}) }); if (r.bootstrap) data = adoptBootstrap(r.bootstrap, r.avatar || ''); render(); toast(r.repaired ? 'Avatar reparado entre users, perfil vinculado, comentários e reactions.' : 'Não havia avatar válido para reparar. Envie a foto novamente.'); }, 'Reparo de avatar concluído.');
  if (actionName === 'check-health') return action(async () => { await checkApiHealth(true); render(); }, 'Health check executado.');
  if (actionName === 'cancel-onboarding-request') return action(async () => { const r = await api<{bootstrap:Bootstrap}>('/api/student/onboarding/cancel-request', { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); tab = 'dashboard'; render(); }, 'Solicitação cancelada. Você pode escolher outro personal.');
  if (actionName === 'approve-student') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/students/${el.dataset.id}/approve`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Aluno aceito e notificado.');
  if (actionName === 'reject-student') { const reason = prompt('Motivo da recusa:') || 'Solicitação recusada pelo personal.'; return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/students/${el.dataset.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Solicitação recusada e aluno notificado.'); }
  if (actionName === 'approve-payment') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/payments/${el.dataset.id}/approve`, { method: 'POST', body: JSON.stringify({ note: 'Aprovado após análise do comprovante.' }) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); }, 'Pagamento aprovado e aluno notificado.');
  if (actionName === 'reject-payment') { const reason = prompt('Motivo da reprovação:') || 'Comprovante recusado.'; return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/payments/${el.dataset.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); }, 'Pagamento recusado e aluno notificado.'); }

  if (actionName === 'react-post') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/community-posts/${el.dataset.id}/react`, { method: 'POST', body: JSON.stringify({ reaction: el.dataset.reaction }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Reação registrada.');
  if (actionName === 'challenge-checkin') { const note = prompt('Observação do check-in:') || 'Check-in do desafio enviado.'; return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/challenges/${el.dataset.id}/checkins`, { method: 'POST', body: JSON.stringify({ note }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Check-in enviado para aprovação.'); }
  if (actionName === 'supplement-taken') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/supplements/${el.dataset.id}/taken`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Suplemento marcado como tomado.');
  if (actionName === 'approve-checkin') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/challenge-checkins/${el.dataset.id}/approve`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Check-in aprovado.');
  if (actionName === 'reject-checkin') return action(async () => { const reason = prompt('Motivo:') || 'Check-in recusado.'; const r = await api<{bootstrap:Bootstrap}>(`/api/challenge-checkins/${el.dataset.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Check-in recusado.');
  if (actionName === 'approve-redemption') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/reward-redemptions/${el.dataset.id}/approve`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Resgate aprovado.');
  if (actionName === 'reject-redemption') return action(async () => { const reason = prompt('Motivo:') || 'Resgate recusado.'; const r = await api<{bootstrap:Bootstrap}>(`/api/reward-redemptions/${el.dataset.id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Resgate recusado.');

  if (actionName === 'complete-content') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/contents/${el.dataset.id}/complete`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); }, 'Conteúdo concluído. Você pode rever sem pontuação infinita.');
  if (actionName === 'redeem-reward') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/rewards/${el.dataset.id}/redeem`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Resgate solicitado ao personal.');
  if (actionName === 'enable-push') return action(async () => { await enablePushNotifications(); render(); }, 'Notificações PWA ativadas neste dispositivo.');
  if (actionName === 'test-push') return action(async () => { const r = await api<{bootstrap:Bootstrap}>('/api/push/test', { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); if ('Notification' in window && Notification.permission === 'granted') new Notification('FitPro Elite', { body: 'Teste local de notificação executado.', icon: '/favicon.svg' }); render(); }, 'Teste de notificação executado.');
  if (actionName === 'review-antifraud') return action(async () => { const r = await api<{bootstrap:Bootstrap}>('/api/antifraud/review', { method: 'POST', body: JSON.stringify({ eventId: el.dataset.id }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Evento antifraude marcado como revisado.');
  if (actionName === 'sync-now') return action(async () => { const r = await api<{bootstrap:Bootstrap,result:any}>('/api/sync/run', { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Sincronização executada. Veja o status atualizado.');
  if (actionName === 'supabase-migrate') return action(async () => { const r = await api<{bootstrap:Bootstrap,result:any}>('/api/supabase/migrate-key-tables', { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Tabelas-chave espelhadas para Supabase ou colocadas na fila.');
  if (actionName === 'integration-action') return action(async () => { const r = await api<{bootstrap:Bootstrap,result:any}>('/api/integrations/action', { method: 'POST', body: JSON.stringify({ key: el.dataset.key, action: 'test' }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Teste de integração executado.');
  if (actionName === 'refresh-integrations') return action(async () => { const r = await api<{bootstrap:Bootstrap,dashboard:any}>('/api/admin/integrations/status'); data = adoptBootstrap(r.bootstrap); render(); }, 'Central de integrações atualizada.');
  if (actionName === 'test-integration') return action(async () => { const r = await api<{bootstrap:Bootstrap,result:any}>(`/api/admin/integrations/test/${el.dataset.key}`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); toast(r.result?.message || 'Teste concluído.'); }, 'Teste de integração concluído.');
  if (actionName === 'whatsapp-ai-replies') return action(async () => { const r = await api<{bootstrap:Bootstrap,replies:any[],enabled:boolean}>('/api/admin/whatsapp/ai-replies'); data = adoptBootstrap(r.bootstrap); render(); toast(r.enabled ? 'IA automática WhatsApp está ativa.' : 'IA automática WhatsApp está configurada/desativada.'); }, 'Respostas de IA atualizadas.');
  if (actionName === 'whatsapp-templates') return action(async () => { const r = await api<{bootstrap:Bootstrap,templates:any[],sends:any[]}>('/api/admin/whatsapp/templates'); data = adoptBootstrap(r.bootstrap); render(); }, 'Templates WhatsApp atualizados.');
  if (actionName === 'send-whatsapp-template') return action(async () => { const to = prompt('Telefone com DDD/DDI para teste do template:') || ''; if (!to.trim()) throw new Error('Informe um telefone.'); const r = await api<{bootstrap:Bootstrap}>('/api/admin/whatsapp/templates/send', { method: 'POST', body: JSON.stringify({ templateKey: el.dataset.key, to }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Template enviado pelo WhatsApp Business.');
  if (actionName === 'copy-text') return action(async () => { const value = el.dataset.value || ''; if (!value) throw new Error('Nada para copiar.'); await navigator.clipboard.writeText(value); }, 'Copiado.');
  if (actionName === 'platform-checkout') return action(async () => { const r = await api<any>('/api/platform-subscriptions/checkout', { method: 'POST', body: JSON.stringify({ platformPlanId: el.dataset.id }) }); data = adoptBootstrap(r.bootstrap); render(); if (r.initPoint) { window.open(r.initPoint, '_blank', 'noopener'); toast('Checkout Mercado Pago aberto em nova aba.'); } else toast(r.message || 'Checkout registrado. Configure Mercado Pago no backend para abrir pagamento automático.'); }, 'Fluxo de assinatura FitPro processado.');
  if (actionName === 'activation-code-status') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/admin/platform-activation-codes/${el.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status: el.dataset.status }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Status do código atualizado.');
  if (actionName === 'run-automations') return action(async () => { const r = await api<{bootstrap:Bootstrap,notificationsCreated:number}>('/api/automations/run', { method: 'POST', body: JSON.stringify({ channels: ['internal','whatsapp','email'] }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Automações executadas.');
  if (actionName === 'convert-lead') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/leads/${el.dataset.id}/convert`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Lead convertido em solicitação de aluno.');
  if (actionName === 'mercado-preference') return action(async () => { const r = await api<{bootstrap:Bootstrap,initPoint:string}>(`/api/payments/${el.dataset.id}/mercado-pago-preference`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); if (r.initPoint) window.open(r.initPoint, '_blank'); }, 'Checkout Mercado Pago criado.');
  if (actionName === 'mercado-subscription') return action(async () => { const r = await api<{bootstrap:Bootstrap,initPoint:string}>(`/api/payments/${el.dataset.id}/mercado-pago-subscription`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); if (r.initPoint) window.open(r.initPoint, '_blank'); }, 'Assinatura Mercado Pago criada.');
  if (actionName === 'send-payment-whatsapp') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/payments/${el.dataset.id}/send-whatsapp-reminder`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Lembrete enviado por WhatsApp.');
  if (actionName === 'send-payment-email') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/payments/${el.dataset.id}/send-email-reminder`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Lembrete enviado por e-mail.');
  if (actionName === 'google-connect') return action(async () => { const r = await api<{url:string}>('/api/google/auth-url'); if (r.url) window.open(r.url, '_blank'); }, 'Abra a janela do Google para autorizar Calendar/Meet.');
  if (actionName === 'google-disconnect') return action(async () => { const r = await api<{bootstrap:Bootstrap}>('/api/google/disconnect', { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Google Calendar desconectado.');
  if (actionName === 'schedule-meet') return action(async () => { const r = await api<{bootstrap:Bootstrap,meetLink:string}>(`/api/schedules/${el.dataset.id}/google-meet`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); if (r.meetLink) window.open(r.meetLink, '_blank'); }, 'Evento Google Calendar/Meet criado.');
  if (actionName === 'exercise-video') {
    const found = findExerciseInPlans(String(el.dataset.id || ''));
    const target = exerciseVideoTarget(found?.exercise || {});
    if (!target.hasVideo) { window.open(target.fallback, '_blank', 'noopener,noreferrer'); toast('Abrindo busca no YouTube.'); return; }
    openModal('exercise-video', el.dataset.id); return;
  }
  if (actionName === 'complete-workout-day') return action(async () => { const ctx = dayById(String(el.dataset.id || '')); if (!ctx?.day) throw new Error('Treino do dia não encontrado.'); const pending = (ctx.day.exercises || []).filter((e:any)=>!completionForExercise(e.id)); if (!pending.length) { toast('Este treino do dia já está concluído.'); return; } if (!confirm(`Concluir o treino do dia e marcar ${pending.length} exercício(s) pendente(s) como feitos?`)) return; for (const ex of pending) { const r = await api<{bootstrap:Bootstrap}>(`/api/workout-exercises/${ex.id}/completion`, { method: 'POST', body: JSON.stringify({ completed: true }) }); data = adoptBootstrap(r.bootstrap); } renderModal(); render(); showCompletionCelebration('Treino do dia concluído com sucesso.'); }, 'Treino do dia concluído.');
  if (actionName === 'toggle-exercise-completion') return action(async () => { const r = await api<{bootstrap:Bootstrap,progress:any,completed:boolean}>(`/api/workout-exercises/${el.dataset.id}/completion`, { method: 'POST', body: JSON.stringify({ completed: el.dataset.completed !== 'false' }) }); const wasDone = Boolean(r.progress?.isCompleted); data = adoptBootstrap(r.bootstrap); renderModal(); render(); if (wasDone && r.completed) showCompletionCelebration('Parabéns! Treino do dia concluído com sucesso.'); }, el.dataset.completed === 'false' ? 'Exercício desmarcado.' : 'Exercício concluído.');
  if (actionName === 'replace-workout-exercise') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/workout-exercises/${el.dataset.id}/replace`, { method: 'POST', body: JSON.stringify({ libraryExerciseId: el.dataset.libraryId }) }); data = adoptBootstrap(r.bootstrap); const planId = findWorkoutExerciseById(el.dataset.id || '')?.plan?.id || ''; if (planId) openModal('workout-plan', planId); else closeModal(); render(); }, 'Exercício substituído e versionado.');
  if (actionName === 'duplicate-workout-exercise') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/workout-exercises/${el.dataset.id}/duplicate`, { method: 'POST', body: JSON.stringify({}) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Exercício duplicado na ficha.');
  if (actionName === 'move-workout-exercise') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/workout-exercises/${el.dataset.id}/move`, { method: 'POST', body: JSON.stringify({ direction: el.dataset.direction }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Ordem do exercício atualizada.');
  if (actionName === 'remove-workout-exercise') return action(async () => { if (!confirm('Remover este exercício da ficha?')) return; const r = await api<{bootstrap:Bootstrap}>(`/api/workout-exercises/${el.dataset.id}`, { method: 'DELETE' }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); }, 'Exercício removido da ficha.');
  if (actionName === 'publish-workout-plan') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/workout-plans/${el.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'ativo', reason: 'Publicação manual pelo personal.' }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Ficha publicada para o aluno.');
  if (actionName === 'duplicate-workout-plan') return action(async () => { const title = prompt('Nome da cópia da ficha:') || ''; const r = await api<{bootstrap:Bootstrap}>(`/api/workout-plans/${el.dataset.id}/duplicate`, { method: 'POST', body: JSON.stringify({ title }) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); }, 'Ficha duplicada como rascunho.');
  if (actionName === 'archive-workout-plan') return action(async () => { const reason = prompt('Motivo do arquivamento:') || 'Arquivamento manual pelo personal.'; const r = await api<{bootstrap:Bootstrap}>(`/api/workout-plans/${el.dataset.id}/archive`, { method: 'POST', body: JSON.stringify({ reason }) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); }, 'Ficha arquivada.');
  if (actionName === 'restore-workout-version') return action(async () => { const reason = prompt('Motivo da restauração:') || 'Restauração solicitada pelo personal.'; const r = await api<{bootstrap:Bootstrap}>(`/api/workout-plans/${el.dataset.id}/restore-version`, { method: 'POST', body: JSON.stringify({ versionId: el.dataset.versionId || '', reason }) }); data = adoptBootstrap(r.bootstrap); closeModal(); render(); }, 'Versão restaurada em revisão.');
  if (actionName === 'ai-workout-suggestion') return action(async () => { const student = currentStudent(); const r = await api<{suggestion:any}>('/api/workout-plans/ai-suggestion', { method: 'POST', body: JSON.stringify({ studentId: student?.id || '', objective: student?.goal || 'saúde geral', level: student?.level || 'iniciante', frequencyPerWeek: '3x por semana' }) }); openModal('ai-workout-suggestion', r.suggestion); }, 'Sugestão gerada para revisão do personal.');
  if (actionName === 'clear-workout-target') { writeWorkoutActiveTarget(null); toast('Treino ativo limpo.'); renderModal(); return; }
  if (actionName === 'delete-workout-draft') return action(async () => { if (!confirm('Descartar este rascunho salvo no backend?')) return; const r = await api<{bootstrap:Bootstrap}>(`/api/workout-drafts/${el.dataset.id}`, { method: 'DELETE' }); data = adoptBootstrap(r.bootstrap); render(); }, 'Rascunho descartado.');
  if (actionName === 'save-workout-template') return action(async () => { const title = prompt('Nome do modelo do personal:') || ''; const r = await api<{bootstrap:Bootstrap}>(`/api/workout-plans/${el.dataset.id}/save-template`, { method: 'POST', body: JSON.stringify({ title, favorite: true }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Modelo salvo e favoritado.');
  if (actionName === 'favorite-personal-template') return action(async () => { const r = await api<{bootstrap:Bootstrap}>(`/api/personal-workout-templates/${el.dataset.id}/favorite`, { method: 'POST', body: JSON.stringify({ favorite: el.dataset.favorite !== 'false' }) }); data = adoptBootstrap(r.bootstrap); render(); }, 'Modelo atualizado.');
  if (actionName === 'export-json') { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fitpro-export-data.json'; a.click(); URL.revokeObjectURL(a.href); return; }
}

bootstrap();
