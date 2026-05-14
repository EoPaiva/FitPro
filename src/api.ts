export type Role = 'student' | 'trainer' | 'admin' | 'super_admin' | 'dev';

export type User = {
  id: string;
  workspaceId: string;
  studentId?: string;
  trainerId?: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
};

export type Student = Record<string, any> & { id: string; name: string; email: string; phone?: string; goal?: string; status?: string; planId?: string };
export type Plan = Record<string, any> & { id: string; name: string; price: number; benefits?: string[] };
export type Payment = Record<string, any> & { id: string; studentId: string; planId: string; amount: number; status: string; proofName?: string; hasProof?: boolean; dueDate: string };
export type Workout = Record<string, any> & { id: string; title: string; exercises?: any[]; status?: string; studentId?: string };
export type Bootstrap = Record<string, any> & {
  user: User;
  settings: { brandName: string; primaryColor: string; secondaryColor: string; whatsapp: string; slug: string; plan: string; status: string };
  students: Student[];
  plans: Plan[];
  payments: Payment[];
  workouts: Workout[];
  workoutPlans?: any[];
  exerciseLibrary?: any[];
  workoutTemplates?: any[];
  workoutInsights?: any;
  workoutLogs?: any[];
  schedules: any[];
  assessments: any[];
  posts: any[];
  contents: any[];
  messages: any[];
  leads: any[];
  challenges: any[];
  habits: any[];
  supplements: any[];
  integrations: any[];
  automations: any[];
  auditLogs: any[];
  notifications: any[];
  users: User[];
  rewards: any[];
  rewardRedemptions: any[];
  giveaways: any[];
  giveawayEntries: any[];
  challengeCheckins: any[];
  pointLedger?: any[];
  antifraudEvents?: any[];
  pushSubscriptions?: any[];
  notificationPreferences?: any[];
  systemStatus?: any;
  mercadoPagoWebhookEvents?: any[];
  whatsappWebhookEvents?: any[];
  whatsappAiReplies?: any[];
  whatsappTemplates?: any[];
  whatsappTemplateSends?: any[];
  trainers?: any[];
  trainerPlans?: any[];
  trainerPaymentSettings?: any;
  studentPayments?: any[];
  platformSubscriptions?: any[];
  platformPlans?: any[];
  platformActivationCodes?: any[];
  activationCodeRedemptions?: any[];
  badges?: any[];
  paymentLogs?: any[];
  tenantBranding?: any;
  referralCodes?: any[];
  coupons?: any[];
  deviceConnections?: any[];
  healthMetrics?: any[];
};

const TOKEN_KEY = 'fitpro_fullstack_token';

const DEFAULT_API_URL = import.meta.env.PROD ? 'https://fitpro-production-847a.up.railway.app' : 'http://localhost:3333';
export const API_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}

export function protectedFileUrl(path: string) {
  const token = getToken();
  const sep = path.includes('?') ? '&' : '?';
  return token ? `${apiUrl(path)}${sep}access_token=${encodeURIComponent(token)}` : apiUrl(path);
}

export function publicAssetUrl(path: string) {
  if (!path) return '';
  if (/^(https?:|data:image\/|blob:)/.test(path)) return path;
  return apiUrl(path.startsWith('/') ? path : `/${path}`);
}

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function setToken(token: string) { localStorage.setItem(TOKEN_KEY, token); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...options, headers, credentials: 'include' });
  } catch {
    throw new Error('Não foi possível conectar ao servidor. Verifique se a API do FitPro está online.');
  }
  if (!response.ok) {
    let message = response.status === 404 ? 'Rota da API não encontrada. Verifique se o backend Railway está online.' : `Erro ${response.status}`;
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return response as unknown as T;
  return response.json() as Promise<T>;
}

export function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

export function dateBR(value?: string) {
  if (!value) return '-';
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}

export function dateTimeBR(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

export function statusLabel(status: string) {
  const map: Record<string,string> = {
    pendente: 'Pendente', aguardando_comprovante: 'Aguardando comprovante', aguardando_aprovacao: 'Aguardando aprovação', solicitacao_enviada: 'Solicitação enviada', sem_personal: 'Sem personal', em_analise: 'Em análise', aprovado: 'Aprovado', recusado: 'Recusado', vencido: 'Vencido', cancelado: 'Cancelado', reembolsado: 'Reembolsado', estornado: 'Estornado', em_disputa: 'Em disputa', ativo: 'Ativo', active: 'Ativo', trial: 'Teste ativo', teste: 'Teste ativo', inativo: 'Inativo', inadimplente: 'Inadimplente', provisorio: 'Provisório', rascunho: 'Rascunho', modelo: 'Modelo', em_revisao: 'Em revisão', arquivado: 'Arquivado', pausado: 'Pausado', personalizada: 'Personalizada'
  };
  return map[status] || status;
}
