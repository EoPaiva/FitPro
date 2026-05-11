export type Role = 'student' | 'admin' | 'super_admin' | 'dev';

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
};

const TOKEN_KEY = 'fitpro_fullstack_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
export function setToken(token: string) { localStorage.setItem(TOKEN_KEY, token); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    let message = `Erro ${response.status}`;
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
    pendente: 'Pendente', aguardando_comprovante: 'Aguardando comprovante', em_analise: 'Em análise', aprovado: 'Aprovado', recusado: 'Recusado', vencido: 'Vencido', cancelado: 'Cancelado', reembolsado: 'Reembolsado', estornado: 'Estornado', em_disputa: 'Em disputa', ativo: 'Ativo', inativo: 'Inativo', inadimplente: 'Inadimplente', provisorio: 'Provisório'
  };
  return map[status] || status;
}
