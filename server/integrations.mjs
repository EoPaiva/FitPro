function env(name) { return process.env[name] || ''; }

export function integrationFlags() {
  return {
    supabase: Boolean(env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY')),
    mercadoPago: Boolean(env('MERCADO_PAGO_ACCESS_TOKEN') && env('MERCADO_PAGO_PUBLIC_KEY')),
    whatsapp: Boolean(env('WHATSAPP_PHONE')),
    whatsappBusiness: Boolean(env('WHATSAPP_BUSINESS_TOKEN') && env('WHATSAPP_BUSINESS_PHONE_ID')),
    whatsappAi: Boolean(env('WHATSAPP_BUSINESS_TOKEN') && env('WHATSAPP_BUSINESS_PHONE_ID') && env('OPENAI_API_KEY')),
    whatsappTemplates: whatsappApprovedTemplates().some(template => template.configured),
    email: Boolean(env('RESEND_API_KEY') && env('EMAIL_FROM')),
    openai: Boolean(env('OPENAI_API_KEY')),
    google: Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET') && env('GOOGLE_REDIRECT_URI'))
  };
}

function moneyBR(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function normalizePhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

export const emailTemplates = {
  payment_pending: ({ student = {}, payment = {} } = {}) => ({
    subject: 'FitPro Elite — pagamento pendente',
    html: `<p>Olá, <strong>${student.name || 'aluno(a)'}</strong>.</p><p>Sua cobrança FitPro de <strong>${moneyBR(payment.amount)}</strong> está com status <strong>${payment.status || 'pendente'}</strong>.</p><p>Envie o comprovante ou fale com seu personal pelo app.</p>`
  }),
  payment_approved: ({ student = {}, payment = {} } = {}) => ({
    subject: 'FitPro Elite — pagamento aprovado',
    html: `<p>Olá, <strong>${student.name || 'aluno(a)'}</strong>.</p><p>Seu pagamento de <strong>${moneyBR(payment.amount)}</strong> foi aprovado. Seu acesso segue liberado.</p>`
  }),
  payment_rejected: ({ student = {}, payment = {}, reason = '' } = {}) => ({
    subject: 'FitPro Elite — comprovante recusado',
    html: `<p>Olá, <strong>${student.name || 'aluno(a)'}</strong>.</p><p>Seu comprovante precisa de revisão.</p><p><strong>Motivo:</strong> ${reason || payment.note || 'Verifique no app.'}</p>`
  }),
  student_approved: ({ student = {} } = {}) => ({
    subject: 'FitPro Elite — acompanhamento aprovado',
    html: `<p>Olá, <strong>${student.name || 'aluno(a)'}</strong>.</p><p>Seu personal aprovou sua solicitação. Entre no FitPro para acessar seu painel.</p>`
  }),
  trainer_invite: ({ trainer = {}, tempPassword = '' } = {}) => ({
    subject: 'FitPro Elite — acesso do personal',
    html: `<p>Olá, <strong>${trainer.name || 'personal'}</strong>.</p><p>Seu acesso ao FitPro Elite foi criado.</p>${tempPassword ? `<p>Senha inicial: <strong>${tempPassword}</strong></p>` : ''}<p>Recomendamos alterar a senha no primeiro acesso.</p>`
  }),
  report_monthly: ({ trainer = {}, summary = '' } = {}) => ({
    subject: 'FitPro Elite — resumo mensal',
    html: `<p>Olá, <strong>${trainer.name || 'personal'}</strong>.</p><p>${summary || 'Seu relatório mensal está disponível no painel.'}</p>`
  })
};

export const whatsappTemplates = {
  payment_pending: ({ student = {}, payment = {} } = {}) => `Olá, ${student.name || 'aluno(a)'}! Sua cobrança FitPro de ${moneyBR(payment.amount)} está com status ${payment.status || 'pendente'}. Envie o comprovante pelo app ou fale com seu personal.`,
  payment_approved: ({ student = {}, payment = {} } = {}) => `Olá, ${student.name || 'aluno(a)'}! Seu pagamento FitPro de ${moneyBR(payment.amount)} foi aprovado. Acesso liberado.`,
  payment_rejected: ({ student = {}, reason = '' } = {}) => `Olá, ${student.name || 'aluno(a)'}! Seu comprovante precisa de revisão. Motivo: ${reason || 'verifique no app.'}`,
  student_approved: ({ student = {} } = {}) => `Olá, ${student.name || 'aluno(a)'}! Seu acompanhamento foi aprovado no FitPro. Acesse o app para ver seu painel.`,
  inactive_student: ({ student = {} } = {}) => `Olá, ${student.name || 'aluno(a)'}! Passando para lembrar de uma missão rápida hoje: água, caminhada ou check-in leve. Constância vence intensidade.`,
  assessment_due: ({ student = {} } = {}) => `Olá, ${student.name || 'aluno(a)'}! Está na hora de atualizar sua avaliação no FitPro para acompanhar sua evolução.`
};

export async function createMercadoPagoPreference({ payment, student, plan, notificationUrl }) {
  const token = env('MERCADO_PAGO_ACCESS_TOKEN');
  if (!token) throw new Error('Mercado Pago não configurado no backend.');
  const body = {
    external_reference: payment.id,
    notification_url: notificationUrl,
    metadata: { fitpro_payment_id: payment.id, workspace_id: payment.workspace_id, student_id: payment.student_id },
    items: [{
      id: plan?.id || payment.plan_id,
      title: `FitPro Elite — ${plan?.name || 'Plano fitness'}`,
      description: `Acompanhamento fitness para ${student?.name || 'aluno FitPro'}`,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Number(payment.amount || 0)
    }],
    payer: { name: student?.name || '', email: student?.email || '' },
    back_urls: {
      success: env('MERCADO_PAGO_SUCCESS_URL'),
      failure: env('MERCADO_PAGO_FAILURE_URL'),
      pending: env('MERCADO_PAGO_PENDING_URL')
    },
    auto_return: 'approved'
  };
  const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Falha ao criar preferência Mercado Pago.');
  return data;
}

export async function createMercadoPagoPreapproval({ payment, student, plan, notificationUrl }) {
  const token = env('MERCADO_PAGO_ACCESS_TOKEN');
  if (!token) throw new Error('Mercado Pago não configurado no backend.');
  const amount = Number(payment.amount || plan?.price || 0);
  const body = {
    reason: `FitPro Elite — ${plan?.name || 'Plano mensal'}`,
    external_reference: payment.id,
    notification_url: notificationUrl,
    payer_email: student?.email || '',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: amount,
      currency_id: 'BRL'
    },
    back_url: env('MERCADO_PAGO_SUCCESS_URL'),
    status: 'pending'
  };
  const response = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || 'Falha ao criar assinatura Mercado Pago.');
  return data;
}

export async function fetchMercadoPagoPayment(paymentId) {
  const token = env('MERCADO_PAGO_ACCESS_TOKEN');
  if (!token || !paymentId) return null;
  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Falha ao consultar pagamento Mercado Pago.');
  return data;
}

export async function fetchMercadoPagoPreapproval(preapprovalId) {
  const token = env('MERCADO_PAGO_ACCESS_TOKEN');
  if (!token || !preapprovalId) return null;
  const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Falha ao consultar assinatura Mercado Pago.');
  return data;
}


export function whatsappAiEnabled() {
  const value = String(env('WHATSAPP_AI_AUTO_REPLY_ENABLED') || '').toLowerCase().trim();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'nao', 'não', 'no', 'off'].includes(value)) return false;
  // Em produção, exige ativação explícita para evitar disparos indesejados.
  return String(env('NODE_ENV')).toLowerCase() !== 'production' && Boolean(env('OPENAI_API_KEY'));
}

export function whatsappTemplateLanguage() {
  return env('WHATSAPP_TEMPLATE_LANGUAGE') || 'pt_BR';
}

const templateDefinitions = [
  { key: 'student_approved', envName: 'WHATSAPP_TEMPLATE_STUDENT_APPROVED', label: 'Aluno aprovado', description: 'Aviso de liberação de acompanhamento.', suggestedParams: ['nome_aluno'] },
  { key: 'payment_pending', envName: 'WHATSAPP_TEMPLATE_PAYMENT_PENDING', label: 'Pagamento pendente', description: 'Lembrete de cobrança ou comprovante pendente.', suggestedParams: ['nome_aluno', 'valor', 'status'] },
  { key: 'payment_approved', envName: 'WHATSAPP_TEMPLATE_PAYMENT_APPROVED', label: 'Pagamento aprovado', description: 'Confirmação de acesso liberado.', suggestedParams: ['nome_aluno', 'valor'] },
  { key: 'payment_rejected', envName: 'WHATSAPP_TEMPLATE_PAYMENT_REJECTED', label: 'Comprovante recusado', description: 'Solicita correção/reenvio de comprovante.', suggestedParams: ['nome_aluno', 'motivo'] },
  { key: 'workout_ready', envName: 'WHATSAPP_TEMPLATE_WORKOUT_READY', label: 'Ficha disponível', description: 'Avisa que a ficha foi publicada.', suggestedParams: ['nome_aluno', 'titulo_ficha'] },
  { key: 'workout_reminder', envName: 'WHATSAPP_TEMPLATE_WORKOUT_REMINDER', label: 'Lembrete de treino', description: 'Lembrete de treino/rotina.', suggestedParams: ['nome_aluno'] },
  { key: 'assessment_due', envName: 'WHATSAPP_TEMPLATE_ASSESSMENT_DUE', label: 'Avaliação pendente', description: 'Lembrete de avaliação física.', suggestedParams: ['nome_aluno'] },
  { key: 'inactive_student', envName: 'WHATSAPP_TEMPLATE_INACTIVE_STUDENT', label: 'Aluno inativo', description: 'Reativação leve e segura.', suggestedParams: ['nome_aluno'] }
];

export function whatsappApprovedTemplates() {
  return templateDefinitions.map(def => ({
    ...def,
    name: env(def.envName),
    language: env(`${def.envName}_LANGUAGE`) || whatsappTemplateLanguage(),
    configured: Boolean(env(def.envName))
  }));
}

export function whatsappApprovedTemplate(templateKey) {
  return whatsappApprovedTemplates().find(template => template.key === templateKey || template.name === templateKey) || null;
}

function bodyParamsToComponents(bodyParams = []) {
  const params = Array.isArray(bodyParams) ? bodyParams.filter(value => value !== undefined && value !== null).map(value => ({ type: 'text', text: String(value).slice(0, 1024) })) : [];
  return params.length ? [{ type: 'body', parameters: params }] : [];
}

export function whatsappTemplateBodyParams(templateKey, context = {}) {
  const student = context.student || {};
  const payment = context.payment || {};
  const plan = context.plan || {};
  const workout = context.workout || context.workoutPlan || {};
  const name = student.name || context.name || 'aluno(a)';
  const amount = payment.amount ? moneyBR(payment.amount) : context.amount || '';
  const reason = context.reason || payment.note || 'verifique no app';
  const status = payment.status || context.status || 'pendente';
  const workoutTitle = workout.title || context.workoutTitle || 'sua ficha FitPro';
  const map = {
    student_approved: [name],
    payment_pending: [name, amount, status],
    payment_approved: [name, amount],
    payment_rejected: [name, reason],
    workout_ready: [name, workoutTitle],
    workout_reminder: [name],
    assessment_due: [name],
    inactive_student: [name]
  };
  return map[templateKey] || [];
}

export async function sendWhatsAppApprovedTemplate({ to, templateKey, language = '', components = null, bodyParams = null, context = {} }) {
  const template = whatsappApprovedTemplate(templateKey);
  if (!template) throw new Error(`Template WhatsApp não catalogado: ${templateKey}`);
  if (!template.configured) throw new Error(`Template WhatsApp ainda não configurado no Railway: ${template.envName}`);
  const finalComponents = Array.isArray(components)
    ? components
    : bodyParamsToComponents(bodyParams || whatsappTemplateBodyParams(template.key, context));
  return sendWhatsAppTemplate({ to, templateName: template.name, language: language || template.language || whatsappTemplateLanguage(), components: finalComponents });
}

export async function sendWhatsAppText({ to, text }) {
  const phoneId = env('WHATSAPP_BUSINESS_PHONE_ID');
  const token = env('WHATSAPP_BUSINESS_TOKEN');
  if (!phoneId || !token) throw new Error('WhatsApp Business API não configurado no backend.');
  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: normalizePhone(to), type: 'text', text: { body: text } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || 'Falha ao enviar WhatsApp.');
  return data;
}

export async function sendWhatsAppTemplate({ to, templateName, language = 'pt_BR', components = [] }) {
  const phoneId = env('WHATSAPP_BUSINESS_PHONE_ID');
  const token = env('WHATSAPP_BUSINESS_TOKEN');
  if (!phoneId || !token) throw new Error('WhatsApp Business API não configurado no backend.');
  if (!templateName) throw new Error('Informe o template aprovado do WhatsApp Business.');
  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(to),
      type: 'template',
      template: { name: templateName, language: { code: language }, components }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || 'Falha ao enviar template WhatsApp.');
  return data;
}

export async function sendEmail({ to, subject, html }) {
  const key = env('RESEND_API_KEY');
  const from = env('EMAIL_FROM');
  if (!key || !from) throw new Error('Resend não configurado no backend.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || 'Falha ao enviar e-mail.');
  return data;
}

export async function sendEmailTemplate({ to, template, context = {} }) {
  const renderer = emailTemplates[template];
  if (!renderer) throw new Error(`Template de e-mail não encontrado: ${template}`);
  return sendEmail({ to, ...renderer(context) });
}

const knowledgeBase = [
  'Login e painel: alunos entram em /dashboard, personal em /admin/dashboard e dev em /super-admin/dashboard conforme role.',
  'Pagamentos: aluno envia comprovante; personal analisa, aprova ou recusa. Aluno nunca aprova o próprio pagamento.',
  'Comprovantes e fotos são privados: acesso via backend, URL assinada ou rota protegida.',
  'Treinos: personal cria treino provisório ou personalizado; aluno registra carga, dificuldade e feedback.',
  'Hábitos: água, sono, passos, refeições, macros, suplementos e energia ajudam a acompanhar rotina, sem substituir nutricionista.',
  'Comunidade: reações, comentários e posts de conquista dependem de confirmação e moderação quando necessário.',
  'IA FitPro ajuda no uso do app e orientação geral de rotina. Não dá diagnóstico, dieta, prescrição ou promessa de resultado.',
  'Integrações ficam no backend: Supabase, Mercado Pago, WhatsApp, Resend e OpenAI nunca devem expor secrets no frontend.'
];

function relevantContext(prompt = '') {
  const q = prompt.toLowerCase();
  const selected = knowledgeBase.filter(item => item.toLowerCase().split(/\W+/).some(word => word.length > 4 && q.includes(word))).slice(0, 4);
  return selected.length ? selected : knowledgeBase.slice(0, 4);
}

function safeFallbackAnswer(prompt = '') {
  const q = prompt.toLowerCase();
  if (q.includes('pagamento') || q.includes('comprovante')) return 'Abra Pagamentos, envie ou visualize o comprovante e aguarde a análise do personal. O aluno não pode aprovar o próprio pagamento.';
  if (q.includes('treino')) return 'Abra Treinos, veja a ficha ativa ou provisória e registre carga, dificuldade e observações após concluir.';
  if (q.includes('hábito') || q.includes('agua') || q.includes('água')) return 'Na central de hábitos, registre água, sono, refeições, energia e suplementos. O sistema apoia a rotina, mas não substitui profissional habilitado.';
  if (q.includes('personal')) return 'O aluno escolhe um personal, envia solicitação e aguarda aprovação. O personal gerencia solicitações pelo painel admin.';
  return 'Posso ajudar com navegação do app, pagamentos, treinos, hábitos, avaliação, comunidade e suporte. Não substituo personal, médico, nutricionista ou fisioterapeuta.';
}

export async function askOpenAI({ prompt, role = 'student' }) {
  const key = env('OPENAI_API_KEY');
  const context = relevantContext(prompt).join('\n- ');
  if (!key) return { provider: 'fallback', answer: safeFallbackAnswer(prompt), context: relevantContext(prompt) };
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env('OPENAI_MODEL') || 'gpt-4o-mini',
      temperature: 0.25,
      max_tokens: 360,
      messages: [
        { role: 'system', content: `Você é o assistente FitPro Elite. Ajude somente com uso do app, treinos liberados, rotina e suporte. Não dê diagnóstico, dieta, prescrição médica ou promessa de resultado. Encaminhe para personal/profissional habilitado quando necessário. Contexto interno:\n- ${context}` },
        { role: 'user', content: `Role: ${role}\nPergunta: ${prompt}` }
      ]
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { provider: 'fallback', answer: safeFallbackAnswer(prompt), error: data?.error?.message || 'OpenAI indisponível.', context: relevantContext(prompt) };
  return { provider: 'openai', answer: data?.choices?.[0]?.message?.content || safeFallbackAnswer(prompt), context: relevantContext(prompt) };
}


export function googleConfigured() {
  return Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET') && env('GOOGLE_REDIRECT_URI'));
}

export function googleAuthUrl({ state = '' } = {}) {
  const clientId = env('GOOGLE_CLIENT_ID');
  const redirect = env('GOOGLE_REDIRECT_URI');
  if (!clientId || !redirect) throw new Error('Google Calendar/Meet não configurado no backend.');
  const scopes = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
    'openid',
    'email',
    'profile'
  ].join(' ');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code) {
  if (!googleConfigured()) throw new Error('Google Calendar/Meet não configurado no backend.');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      redirect_uri: env('GOOGLE_REDIRECT_URI'),
      grant_type: 'authorization_code'
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error_description || data?.error || 'Falha ao trocar autorização Google.');
  return data;
}

export async function refreshGoogleToken(refreshToken) {
  if (!googleConfigured()) throw new Error('Google Calendar/Meet não configurado no backend.');
  if (!refreshToken) throw new Error('Refresh token Google ausente. Reconecte a integração.');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error_description || data?.error || 'Falha ao renovar token Google.');
  return data;
}

export async function fetchGoogleProfile(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || 'Falha ao buscar perfil Google.');
  return data;
}

export async function createGoogleCalendarEvent({ accessToken, calendarId = 'primary', event }) {
  if (!accessToken) throw new Error('Token Google ausente.');
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || 'primary')}/events?conferenceDataVersion=1`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(event)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || 'Falha ao criar evento Google Calendar.');
  return data;
}
