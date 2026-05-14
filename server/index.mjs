import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.mjs';
import { all, get, json, run, toJSON } from './db.mjs';
import { seedIfNeeded } from './seed.mjs';
import { createToken, decryptSecret, encryptSecret, hashPassword, id, nowISO, safeFileName, sanitizeText, verifyPassword, verifyToken } from './security.mjs';
import { supabasePublicStatus, hasSupabaseAdmin, uploadPrivateObject, createSignedUrl, supabaseHealthCheck, bucketStatus, supabaseSelect, publicObjectUrl, parseSupabaseStoragePath, supabaseAvatarBucket } from './supabase.mjs';
import { askOpenAI, createGoogleCalendarEvent, exchangeGoogleCode, fetchGoogleProfile, googleAuthUrl, googleConfigured, refreshGoogleToken, createMercadoPagoPreference, createMercadoPagoPreapproval, fetchMercadoPagoPayment, fetchMercadoPagoPreapproval, integrationFlags, sendEmail, sendEmailTemplate, sendWhatsAppApprovedTemplate, sendWhatsAppTemplate, sendWhatsAppText, whatsappApprovedTemplates, whatsappTemplateBodyParams, whatsappTemplates, whatsappAiEnabled } from './integrations.mjs';
import { databaseAdapter } from './database-adapter.mjs';
import { SUPABASE_SYNC_TABLES, listSyncQueue, processSyncQueue, processStorageFallback, processAllSyncQueues, recordStorageFallback, syncSummary, systemStatusRows, startBackgroundSync } from './sync.mjs';

seedIfNeeded();

const ADMIN_ROLES = new Set(['admin', 'trainer', 'super_admin', 'dev']);
const SUPER_ROLES = new Set(['super_admin', 'dev']);
const MAX_JSON_BYTES = 12 * 1024 * 1024;
const PUBLIC_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf']);
const AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function resolveCorsOrigin(req) {
  const origin = req?.headers?.origin || '';
  if (!origin) return config.corsOrigin || config.appUrl || 'http://localhost:5173';
  if (config.allowedOrigins.includes(origin)) return origin;
  return '';
}

function corsHeaders(req) {
  const origin = resolveCorsOrigin(req);
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Signature, X-Request-Id',
    'Access-Control-Max-Age': '86400'
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function applyCors(req, res) {
  const headers = corsHeaders(req);
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
}

function send(res, status, data, headers = {}) {
  const body = status === 204 ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    ...headers
  });
  res.end(body);
}

function isAllowedOrigin(origin = '') {
  return !origin || config.allowedOrigins.includes(origin);
}

function slugify(value = '') {
  return String(value || 'fitpro').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'fitpro';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        reject(Object.assign(new Error('Payload muito grande.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('JSON inválido.'), { status: 400 })); }
    });
  });
}

function cookieToken(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(new RegExp(`(?:^|;)\\s*${config.cookieName}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function tokenFromReq(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const queryToken = url.searchParams.get('access_token') || url.searchParams.get('token');
    if (queryToken) return queryToken;
  } catch {}
  return cookieToken(req);
}

function normalizeUser(row) {
  if (!row) return null;
  let avatar = avatarClientUrlFromRow(row);
  // Sprint 27: avatar é persistido no Supabase Storage/banco; fallback só entra se não houver URL/path válido.
  if (!avatar && row.student_id) avatar = cleanAvatarUrl(get('SELECT avatar_url FROM students WHERE id=?', [row.student_id])?.avatar_url || '');
  if (!avatar && row.trainer_id) avatar = cleanAvatarUrl(get('SELECT avatar_url FROM trainers WHERE id=?', [row.trainer_id])?.avatar_url || '');
  if (avatar === row.id || /^user_[a-z0-9_-]+$/i.test(String(avatar || ''))) avatar = `/api/profile/avatar/${row.id}`;
  avatar = cleanAvatarUrl(avatar);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    studentId: row.student_id,
    trainerId: row.trainer_id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatar,
    createdAt: row.created_at
  };
}

function authUser(req) {
  const payload = verifyToken(tokenFromReq(req));
  if (!payload?.sub) return null;
  return normalizeUser(get('SELECT * FROM users WHERE id = ?', [payload.sub]));
}

function requireAuth(req, res) {
  const user = authUser(req);
  if (!user) {
    send(res, 401, { error: 'Faça login para continuar.' });
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!ADMIN_ROLES.has(user.role)) {
    send(res, 403, { error: 'Apenas personal/admin pode realizar esta ação.' });
    return null;
  }
  return user;
}

function requireSuper(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!SUPER_ROLES.has(user.role)) {
    send(res, 403, { error: 'Apenas dev/super admin pode realizar esta ação.' });
    return null;
  }
  return user;
}

function assertWorkspace(user, workspaceId) {
  return SUPER_ROLES.has(user.role) || user.workspaceId === workspaceId;
}

function canAccessStudent(user, studentId) {
  if (SUPER_ROLES.has(user.role)) return true;
  const student = get('SELECT * FROM students WHERE id = ?', [studentId]);
  if (!student) return false;
  if (user.role === 'student') return user.studentId === studentId;
  if (user.role === 'admin' || user.role === 'trainer') return user.workspaceId === student.workspace_id;
  return false;
}

function audit(user, action, entity, entityId, metadata = '') {
  const workspaceId = user?.workspaceId || 'ws_fitpro_elite';
  const payload = { id: id('log'), workspace_id: workspaceId, actor_id: user?.id || 'system', action, entity, entity_id: entityId, metadata, created_at: nowISO() };
  run('INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity,entity_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)',
    [payload.id, payload.workspace_id, payload.actor_id, payload.action, payload.entity, payload.entity_id, payload.metadata, payload.created_at]);
  databaseAdapter.mirror('audit_logs', payload, { workspaceId, entityId: payload.id }).catch(() => {});
}

function paymentHistory(paymentId, actorId, action, note = '') {
  const payment = get('SELECT workspace_id FROM payments WHERE id=?', [paymentId]);
  const payload = { id: id('ph'), workspace_id: payment?.workspace_id || platformSubscription?.workspace_id || 'ws_fitpro_elite', payment_id: paymentId, actor_id: actorId || 'system', action, note, created_at: nowISO() };
  run('INSERT INTO payment_history (id,payment_id,actor_id,action,note,created_at) VALUES (?,?,?,?,?,?)',
    [payload.id, payload.payment_id, payload.actor_id, payload.action, payload.note, payload.created_at]);
  databaseAdapter.mirror('payment_history', payload, { workspaceId: payload.workspace_id, entityId: payload.id }).catch(() => {});
}

function moneyServer(value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0)); }

function notify(workspaceId, userId, title, body = '', options = {}) {
  const payload = { id: id('not'), workspace_id: workspaceId, user_id: userId, title, body, type: options.type || 'internal', action_url: options.actionUrl || '', metadata_json: toJSON(options.metadata || {}), created_at: nowISO() };
  run('INSERT INTO notifications (id,workspace_id,user_id,title,body,type,action_url,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [payload.id, payload.workspace_id, payload.user_id, payload.title, payload.body, payload.type, payload.action_url, payload.metadata_json, payload.created_at]);
  databaseAdapter.mirror('notifications', payload, { workspaceId, entityId: payload.id }).catch(() => {});
}

function recordAntifraudEvent({ workspaceId = 'ws_fitpro_elite', studentId = '', actorId = 'system', eventType = 'points', severity = 'info', message = '', metadata = {} }) {
  const payload = { id: id('afe'), workspace_id: workspaceId, student_id: studentId, actor_id: actorId, event_type: eventType, severity, message: String(message || '').slice(0, 900), metadata_json: toJSON(metadata), created_at: nowISO() };
  run('INSERT INTO antifraud_events (id,workspace_id,student_id,actor_id,event_type,severity,message,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [payload.id, payload.workspace_id, payload.student_id, payload.actor_id, payload.event_type, payload.severity, payload.message, payload.metadata_json, payload.created_at]);
  databaseAdapter.mirror('antifraud_events', payload, { workspaceId: payload.workspace_id, entityId: payload.id }).catch(() => {});
  return payload;
}

function pointDailyTotal(studentId) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  return Number(get('SELECT COALESCE(SUM(points),0) AS total FROM point_ledger WHERE student_id=? AND status=? AND created_at>=?', [studentId, 'aprovado', since.toISOString()])?.total || 0);
}

function validatePointAward({ student, points, ruleKey, source, referenceId = '' }) {
  const flags = [];
  const p = Number(points || 0);
  if (!student) flags.push('student_not_found');
  if (!Number.isFinite(p) || p <= 0) flags.push('invalid_points');
  if (p > 150) flags.push('single_award_too_high');
  if (student && pointDailyTotal(student.id) + p > 300) flags.push('daily_cap_exceeded');
  if (student && ruleKey && get('SELECT id FROM point_ledger WHERE student_id=? AND rule_key=?', [student.id, ruleKey])) flags.push('duplicate_rule_key');
  if (source === 'content' && referenceId && student && get('SELECT id FROM point_ledger WHERE student_id=? AND source=? AND reference_id=?', [student.id, 'content', referenceId])) flags.push('content_already_awarded');
  if (source === 'challenge_checkin' && referenceId && get('SELECT status FROM challenge_checkins WHERE id=?', [referenceId])?.status !== 'aprovado') flags.push('checkin_not_approved');
  const riskScore = Math.min(100, flags.length * 30 + (p > 50 ? 15 : 0));
  return { ok: flags.length === 0, flags, riskScore };
}


function bmiInfo(weight, height) {
  const h = Number(height || 0);
  const w = Number(weight || 0);
  if (!h || !w) return { bmi: 0, classification: 'Dados insuficientes' };
  const bmi = Number((w / (h * h)).toFixed(1));
  const classification = bmi < 18.5 ? 'Abaixo do peso' : bmi < 25 ? 'Faixa geral adequada' : bmi < 30 ? 'Sobrepeso' : 'Obesidade';
  return { bmi, classification };
}

function addStudentPoints(studentId, points, reason, actor = null, options = {}) {
  const student = get('SELECT * FROM students WHERE id=?', [studentId]);
  if (!student) return { ok: false, skipped: true, reason: 'student_not_found' };
  const source = options.source || 'manual';
  const referenceId = options.referenceId || '';
  const ruleKey = options.ruleKey || `${source}:${referenceId || reason}:${new Date().toISOString().slice(0,10)}`;
  const validation = validatePointAward({ student, points, ruleKey, source, referenceId });
  const actorId = actor?.id || 'system';
  const ledgerId = id('pts');
  const status = validation.ok ? 'aprovado' : 'bloqueado';
  run('INSERT OR IGNORE INTO point_ledger (id,workspace_id,student_id,actor_id,source,reason,points,rule_key,reference_id,status,risk_score,risk_flags_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [ledgerId, student.workspace_id, studentId, actorId, source, reason, Number(points || 0), ruleKey, referenceId, status, validation.riskScore, toJSON(validation.flags), nowISO()]);
  if (!validation.ok) {
    recordAntifraudEvent({ workspaceId: student.workspace_id, studentId, actorId, eventType: 'points_blocked', severity: validation.riskScore >= 60 ? 'high' : 'medium', message: `Pontuação bloqueada: ${reason}`, metadata: { points, ruleKey, flags: validation.flags, source, referenceId } });
    return { ok: false, blocked: true, flags: validation.flags, riskScore: validation.riskScore };
  }
  const current = Number(student.fit_points || 0);
  run('UPDATE students SET fit_points=?, last_activity_at=? WHERE id=?', [current + Number(points || 0), nowISO(), studentId]);
  audit(actor || { id: 'system', workspaceId: student.workspace_id }, 'fitpoints_added', 'student', studentId, `${points} pontos • ${reason}`);
  return { ok: true, points: Number(points || 0), ledgerId };
}


function paymentStatusFromMercadoPago(status = '') {
  const value = String(status || '').toLowerCase();
  if (['approved','accredited','authorized'].includes(value)) return 'aprovado';
  if (['rejected'].includes(value)) return 'recusado';
  if (['charged_back','in_mediation'].includes(value)) return 'em_disputa';
  if (['cancelled','cancelled_by_collector'].includes(value)) return 'cancelado';
  if (['refunded'].includes(value)) return 'reembolsado';
  if (['in_process','pending','authorized'].includes(value)) return 'em_analise';
  return 'em_analise';
}


function paymentStatusTone(status = '') {
  const value = String(status || '').toLowerCase();
  if (value === 'aprovado') return 'payment_approved';
  if (value === 'recusado' || value === 'cancelado' || value === 'reembolsado') return 'payment_rejected';
  return 'payment_pending';
}

function mercadoPagoEventKind(eventType = '', topic = '') {
  const value = `${eventType} ${topic}`.toLowerCase();
  if (value.includes('preapproval') || value.includes('subscription_preapproval')) return 'preapproval';
  if (value.includes('payment') || value.includes('payments')) return 'payment';
  if (value.includes('chargeback')) return 'chargeback';
  if (value.includes('merchant_order') || value.includes('order')) return 'order';
  return 'unknown';
}

function parseMercadoPagoSignature(header = '') {
  const parts = {};
  for (const part of String(header || '').split(',')) {
    const [key, ...rest] = part.split('=');
    if (key && rest.length) parts[key.trim()] = rest.join('=').trim();
  }
  return { ts: parts.ts || '', v1: parts.v1 || '' };
}

function timingSafeEqualHex(a = '', b = '') {
  const left = String(a || '').toLowerCase();
  const right = String(b || '').toLowerCase();
  if (!/^[a-f0-9]+$/.test(left) || !/^[a-f0-9]+$/.test(right)) return false;
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function validateMercadoPagoWebhook(req, url) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET || '';
  const xSignature = req.headers['x-signature'] || '';
  const xRequestId = req.headers['x-request-id'] || '';
  const { ts, v1 } = parseMercadoPagoSignature(xSignature);
  const dataId = String(url.searchParams.get('data.id') || '').toLowerCase();
  const manifest = `${dataId ? `id:${dataId};` : ''}${xRequestId ? `request-id:${xRequestId};` : ''}${ts ? `ts:${ts};` : ''}`;
  if (!secret) return { configured: false, valid: false, required: config.nodeEnv === 'production', reason: 'MERCADO_PAGO_WEBHOOK_SECRET ausente.', requestId: String(xRequestId || ''), dataId, manifestReady: Boolean(manifest) };
  if (!xSignature || !v1 || !ts) return { configured: true, valid: false, required: true, reason: 'Headers x-signature/x-request-id ausentes ou incompletos.', requestId: String(xRequestId || ''), dataId, manifestReady: Boolean(manifest) };
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  const valid = timingSafeEqualHex(expected, v1);
  const timestamp = Number(ts);
  const timestampMs = timestamp > 100000000000 ? timestamp : timestamp * 1000;
  const ageSeconds = Number.isFinite(timestampMs) ? Math.abs(Date.now() - timestampMs) / 1000 : Infinity;
  const maxAge = Number(process.env.MERCADO_PAGO_WEBHOOK_MAX_AGE_SECONDS || 900);
  const fresh = ageSeconds <= maxAge;
  return { configured: true, valid: valid && fresh, required: true, reason: valid ? (fresh ? 'Assinatura válida.' : 'Assinatura antiga fora da janela de segurança.') : 'Assinatura inválida.', requestId: String(xRequestId || ''), dataId, manifestReady: Boolean(manifest), ageSeconds: Number.isFinite(ageSeconds) ? Math.round(ageSeconds) : null };
}

function recordMercadoPagoEvent({ workspaceId = 'ws_fitpro_elite', eventKey, requestId = '', eventType = '', resourceId = '', externalReference = '', paymentId = '', status = '', signatureValid = false, processedStatus = 'received', payload = {}, error = '' }) {
  const payloadJson = toJSON(payload || {});
  const now = nowISO();
  const existing = get('SELECT * FROM mercado_pago_webhook_events WHERE event_key=?', [eventKey]);
  if (existing) {
    run('UPDATE mercado_pago_webhook_events SET processed_status=?, payment_id=COALESCE(NULLIF(?,\'\'),payment_id), mercado_pago_status=COALESCE(NULLIF(?,\'\'),mercado_pago_status), error_message=?, processed_at=? WHERE event_key=?', [processedStatus, paymentId, status, error, now, eventKey]);
    return { duplicate: true, row: existing };
  }
  run('INSERT INTO mercado_pago_webhook_events (id,workspace_id,event_key,request_id,event_type,resource_id,external_reference,payment_id,mercado_pago_status,signature_valid,processed_status,payload_json,error_message,received_at,processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [id('mpwh'), workspaceId, eventKey, requestId, eventType, resourceId, externalReference, paymentId, status, signatureValid ? 1 : 0, processedStatus, payloadJson, error, now, processedStatus === 'received' ? '' : now]);
  databaseAdapter.mirror('mercado_pago_webhook_events', { id: eventKey, workspace_id: workspaceId, event_key: eventKey, request_id: requestId, event_type: eventType, resource_id: resourceId, external_reference: externalReference, payment_id: paymentId, mercado_pago_status: status, signature_valid: signatureValid ? 1 : 0, processed_status: processedStatus, payload_json: payloadJson, error_message: error, received_at: now }, { workspaceId, entityId: eventKey }).catch(() => {});
  return { duplicate: false };
}

function findPaymentByMercadoPagoReference({ externalReference = '', dataId = '', preapprovalId = '', preferenceId = '' }) {
  const params = [String(externalReference || ''), String(dataId || ''), String(preapprovalId || ''), String(preferenceId || ''), String(dataId || ''), String(dataId || '')];
  return get('SELECT * FROM payments WHERE id=? OR mercado_pago_id=? OR mercado_pago_preapproval_id=? OR mercado_pago_preference_id=? OR mercado_pago_preapproval_id=? OR external_link LIKE ? LIMIT 1', params.slice(0, 5).concat([`%${String(dataId || preferenceId || externalReference || '')}%`]));
}
function findPlatformSubscriptionByMercadoPagoReference({ externalReference = '', dataId = '', preferenceId = '' }) {
  const ref = String(externalReference || '').trim();
  const data = String(dataId || '').trim();
  const pref = String(preferenceId || '').trim();
  if (ref) {
    const byRef = get('SELECT * FROM platform_subscriptions WHERE id=? LIMIT 1', [ref]);
    if (byRef) return byRef;
  }
  if (data || pref) {
    const token = data || pref;
    return get('SELECT * FROM platform_subscriptions WHERE mercado_pago_payment_id=? OR metadata LIKE ? LIMIT 1', [token, `%${token}%`]);
  }
  return null;
}

async function fetchMercadoPagoResource(kind, dataId) {
  if (!dataId) return null;
  if (kind === 'preapproval') return fetchMercadoPagoPreapproval(dataId);
  if (kind === 'payment' || kind === 'chargeback' || kind === 'unknown') return fetchMercadoPagoPayment(dataId);
  return null;
}

function normalizePhoneDigits(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function phoneComparable(value = '') {
  const digits = normalizePhoneDigits(value);
  return digits.length > 11 ? digits.slice(-11) : digits;
}

function findStudentByWhatsappPhone(phone = '') {
  const target = phoneComparable(phone);
  if (!target) return null;
  const students = all('SELECT * FROM students WHERE phone IS NOT NULL AND phone != ? ORDER BY created_at DESC LIMIT 1000', ['']);
  return students.find(student => phoneComparable(student.phone) === target) || null;
}

function extractWhatsAppEvents(body = {}) {
  const events = [];
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const metadata = value.metadata || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const contactNameByWaId = new Map(contacts.map(contact => [String(contact.wa_id || ''), String(contact.profile?.name || '')]));
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const type = message.type || 'message';
        const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || message.image?.caption || message.document?.caption || '';
        events.push({
          webhookType: 'message',
          eventKey: String(message.id || `${entry.id || 'entry'}:${message.from || ''}:${message.timestamp || Date.now()}`),
          messageId: String(message.id || ''),
          fromPhone: normalizePhoneDigits(message.from || ''),
          toPhone: normalizePhoneDigits(metadata.display_phone_number || metadata.phone_number_id || process.env.WHATSAPP_PHONE || ''),
          contactName: contactNameByWaId.get(String(message.from || '')) || '',
          status: type,
          text: String(text || '').slice(0, 2000),
          raw: { object: body.object || '', entryId: entry.id || '', field: change.field || '', metadata, message: { id: message.id, from: message.from, type, timestamp: message.timestamp } }
        });
      }
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        events.push({
          webhookType: 'status',
          eventKey: String(status.id || `${entry.id || 'entry'}:${status.recipient_id || ''}:${status.timestamp || Date.now()}:${status.status || 'status'}`),
          messageId: String(status.id || ''),
          fromPhone: '',
          toPhone: normalizePhoneDigits(status.recipient_id || ''),
          contactName: '',
          status: String(status.status || ''),
          text: String(status.errors?.[0]?.title || status.conversation?.origin?.type || '').slice(0, 1000),
          raw: { object: body.object || '', entryId: entry.id || '', field: change.field || '', status }
        });
      }
    }
  }
  return events;
}

function recordWhatsAppEvent({ workspaceId = 'ws_fitpro_elite', eventKey, webhookType = 'message', messageId = '', fromPhone = '', toPhone = '', contactName = '', status = '', text = '', payload = {}, matchedStudentId = '', matchedUserId = '', processedStatus = 'received', error = '' }) {
  const safeKey = String(eventKey || messageId || id('wa_evt')).slice(0, 220);
  const now = nowISO();
  const existing = get('SELECT * FROM whatsapp_webhook_events WHERE event_key=?', [safeKey]);
  if (existing) {
    run('UPDATE whatsapp_webhook_events SET status=COALESCE(NULLIF(?,\'\'),status), processed_status=?, error_message=?, processed_at=? WHERE event_key=?', [status, processedStatus, error, now, safeKey]);
    return { duplicate: true, row: existing };
  }
  const payloadJson = toJSON(payload || {});
  const rowId = id('wawb');
  run('INSERT INTO whatsapp_webhook_events (id,workspace_id,event_key,webhook_type,message_id,from_phone,to_phone,contact_name,status,text,payload_json,matched_student_id,matched_user_id,processed_status,error_message,received_at,processed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [rowId, workspaceId, safeKey, webhookType, messageId, fromPhone, toPhone, contactName, status, text, payloadJson, matchedStudentId, matchedUserId, processedStatus, error, now, processedStatus === 'received' ? '' : now]);
  databaseAdapter.mirror('whatsapp_webhook_events', { id: rowId, workspace_id: workspaceId, event_key: safeKey, webhook_type: webhookType, message_id: messageId, from_phone: fromPhone, to_phone: toPhone, contact_name: contactName, status, text, payload_json: payloadJson, matched_student_id: matchedStudentId, matched_user_id: matchedUserId, processed_status: processedStatus, error_message: error, received_at: now, processed_at: processedStatus === 'received' ? '' : now }, { workspaceId, entityId: rowId }).catch(() => {});
  return { duplicate: false, id: rowId };
}

function whatsappAiReplyLimit() {
  const parsed = Number(process.env.WHATSAPP_AI_MAX_REPLIES_PER_STUDENT_HOUR || 6);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 30) : 6;
}

function whatsappAiSystemNotice() {
  return 'Sou a IA de apoio do FitPro. Posso ajudar com uso do app, treinos já liberados, hábitos e suporte. Para ajuste individual, dor, lesão, dieta, suplemento ou diagnóstico, fale com seu personal/profissional habilitado.';
}

function recentWhatsappAiReplies(studentId) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const row = get('SELECT COUNT(*) AS total FROM whatsapp_ai_replies WHERE student_id=? AND created_at>=?', [studentId, since]);
  return Number(row?.total || 0);
}

function recordWhatsappAiReply({ workspaceId, studentId, inboundMessageId, inboundText, aiAnswer = '', provider = 'fallback', whatsappMessageId = '', status = 'pending', errorMessage = '' }) {
  const now = nowISO();
  const rowId = id('waai');
  run('INSERT OR REPLACE INTO whatsapp_ai_replies (id,workspace_id,student_id,inbound_message_id,inbound_text,ai_answer,provider,whatsapp_message_id,status,error_message,created_at) VALUES (COALESCE((SELECT id FROM whatsapp_ai_replies WHERE inbound_message_id=?),?),?,?,?,?,?,?,?,?,?,?)',
    [inboundMessageId || rowId, rowId, workspaceId, studentId || '', inboundMessageId || rowId, sanitizeText(inboundText || '', 2000), sanitizeText(aiAnswer || '', 2000), provider, whatsappMessageId, status, sanitizeText(errorMessage || '', 1000), now]);
  const saved = get('SELECT * FROM whatsapp_ai_replies WHERE inbound_message_id=?', [inboundMessageId || rowId]) || { id: rowId };
  databaseAdapter.mirror('whatsapp_ai_replies', saved, { workspaceId, entityId: saved.id || rowId }).catch(() => {});
  return saved;
}

function whatsappAiAlreadyReplied(messageId = '') {
  if (!messageId) return false;
  return Boolean(get('SELECT id FROM whatsapp_ai_replies WHERE inbound_message_id=? LIMIT 1', [messageId]));
}

function studentWorkoutContext(studentId) {
  const activePlan = get('SELECT id,title,objective,status,review_date FROM workout_plans WHERE student_id=? AND status=? ORDER BY updated_at DESC LIMIT 1', [studentId, 'ativo']);
  const lastWorkout = get('SELECT completed_at,difficulty,pain_reported,points_awarded FROM workout_logs WHERE student_id=? ORDER BY created_at DESC LIMIT 1', [studentId]);
  const lastPayment = get('SELECT status,amount,due_date FROM payments WHERE student_id=? ORDER BY due_date DESC LIMIT 1', [studentId]);
  return { activePlan, lastWorkout, lastPayment };
}

async function maybeSendWhatsappAiReply({ event, student }) {
  const enabled = whatsappAiEnabled();
  if (!enabled) return { skipped: true, reason: 'WHATSAPP_AI_AUTO_REPLY_ENABLED não está ativo em produção.' };
  if (!student || event.webhookType !== 'message') return { skipped: true, reason: 'Mensagem sem aluno identificado.' };
  if (!event.text || !String(event.text).trim()) return { skipped: true, reason: 'Mensagem sem texto.' };
  if (whatsappAiAlreadyReplied(event.messageId || event.eventKey)) return { skipped: true, reason: 'Mensagem já respondida pela IA.' };
  const limit = whatsappAiReplyLimit();
  if (recentWhatsappAiReplies(student.id) >= limit) {
    recordWhatsappAiReply({ workspaceId: student.workspace_id, studentId: student.id, inboundMessageId: event.messageId || event.eventKey, inboundText: event.text, status: 'rate_limited', errorMessage: `Limite de ${limit}/hora atingido.` });
    return { skipped: true, reason: 'Limite horário atingido.' };
  }
  const trainer = student.trainer_id ? get('SELECT * FROM trainers WHERE id=?', [student.trainer_id]) : null;
  const ctx = studentWorkoutContext(student.id);
  const prompt = [
    `Aluno: ${student.name || 'aluno(a)'} | Objetivo: ${student.goal || 'não informado'} | Nível: ${student.level || 'não informado'} | Status: ${student.status || 'ativo'}`,
    trainer ? `Personal: ${trainer.name || 'personal'}` : 'Personal: ainda não identificado',
    ctx.activePlan ? `Ficha ativa: ${ctx.activePlan.title || ''} (${ctx.activePlan.objective || ''})` : 'Ficha ativa: não encontrada',
    ctx.lastWorkout ? `Último treino: ${ctx.lastWorkout.completed_at || ''} | dificuldade ${ctx.lastWorkout.difficulty || '-'} | dor ${ctx.lastWorkout.pain_reported || 'não relatada'}` : 'Último treino: sem registro recente',
    ctx.lastPayment ? `Pagamento recente: ${ctx.lastPayment.status || '-'} | vencimento ${ctx.lastPayment.due_date || '-'}` : 'Pagamento recente: sem cobrança localizada',
    'Responda de forma curta, humana, educada e segura para WhatsApp. Não prescreva dieta, suplemento, diagnóstico ou tratamento. Se houver dor/lesão, oriente falar com o personal/profissional habilitado. Se for problema de pagamento, oriente usar o app ou falar com o personal.',
    `Mensagem recebida: ${event.text}`
  ].join('\n');
  try {
    const ai = await askOpenAI({ prompt, role: 'student' });
    const answer = sanitizeText(`${ai.answer || 'Recebi sua mensagem. Vou te orientar pelo FitPro.'}\n\n${whatsappAiSystemNotice()}`, 1400);
    const wa = await sendWhatsAppText({ to: event.fromPhone, text: answer });
    const providerMessageId = wa?.messages?.[0]?.id || '';
    const senderId = trainer?.user_id || 'fitpro_ai';
    const msg = { id: id('msg'), workspace_id: student.workspace_id, student_id: student.id, sender_id: senderId, text: answer, attachment_path: '', attachment_name: providerMessageId ? `wa-ai:${providerMessageId}` : `wa-ai:${event.messageId || event.eventKey}`, attachment_mime_type: 'whatsapp/ai-reply', read_at: '', created_at: nowISO() };
    run('INSERT INTO messages (id,workspace_id,student_id,sender_id,text,attachment_path,attachment_name,attachment_mime_type,read_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [msg.id, msg.workspace_id, msg.student_id, msg.sender_id, msg.text, msg.attachment_path, msg.attachment_name, msg.attachment_mime_type, msg.read_at, msg.created_at]);
    databaseAdapter.mirror('messages', msg, { workspaceId: msg.workspace_id, entityId: msg.id }).catch(() => {});
    recordWhatsappAiReply({ workspaceId: student.workspace_id, studentId: student.id, inboundMessageId: event.messageId || event.eventKey, inboundText: event.text, aiAnswer: answer, provider: ai.provider || 'openai', whatsappMessageId: providerMessageId, status: 'sent' });
    integrationLog(student.workspace_id, 'whatsapp_ai', 'auto_reply', 'ok', student.id, `Resposta automática enviada para ${student.name}.`);
    return { skipped: false, provider: ai.provider || 'openai', messageId: providerMessageId };
  } catch (error) {
    recordWhatsappAiReply({ workspaceId: student.workspace_id, studentId: student.id, inboundMessageId: event.messageId || event.eventKey, inboundText: event.text, status: 'error', errorMessage: error.message || String(error) });
    integrationLog(student.workspace_id, 'whatsapp_ai', 'auto_reply', 'error', student.id, error.message || String(error));
    return { skipped: true, reason: error.message || String(error) };
  }
}

function recordWhatsappTemplateSend({ workspaceId = 'ws_fitpro_elite', templateKey = '', templateName = '', language = 'pt_BR', toPhone = '', studentId = '', status = 'sent', providerMessageId = '', payload = {}, errorMessage = '', sentBy = '' }) {
  const row = { id: id('watpl'), workspace_id: workspaceId, template_key: templateKey, template_name: templateName, language, to_phone: normalizePhoneDigits(toPhone), student_id: studentId || '', status, provider_message_id: providerMessageId || '', payload_json: toJSON(payload || {}), error_message: sanitizeText(errorMessage || '', 1000), sent_by: sentBy || '', created_at: nowISO() };
  run('INSERT INTO whatsapp_template_sends (id,workspace_id,template_key,template_name,language,to_phone,student_id,status,provider_message_id,payload_json,error_message,sent_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [row.id, row.workspace_id, row.template_key, row.template_name, row.language, row.to_phone, row.student_id, row.status, row.provider_message_id, row.payload_json, row.error_message, row.sent_by, row.created_at]);
  databaseAdapter.mirror('whatsapp_template_sends', row, { workspaceId: row.workspace_id, entityId: row.id }).catch(() => {});
  return row;
}

async function processWhatsAppWebhookPayload(body = {}) {
  const events = extractWhatsAppEvents(body);
  const result = { total: events.length, messages: 0, statuses: 0, matched: 0, unmatched: 0, duplicates: 0, savedMessages: 0, aiReplies: 0, aiSkipped: 0, errors: [] };
  if (!events.length) {
    recordWhatsAppEvent({ eventKey: id('wa_empty'), webhookType: 'unknown', status: 'empty', payload: { object: body?.object || '' }, processedStatus: 'ignored', error: 'Payload sem messages/statuses reconhecidos.' });
    integrationLog('ws_fitpro_elite', 'whatsapp', 'webhook_empty', 'warn', 'whatsapp', 'Payload recebido sem messages/statuses reconhecidos.');
    return result;
  }
  for (const event of events) {
    try {
      if (event.webhookType === 'status') result.statuses += 1;
      if (event.webhookType === 'message') result.messages += 1;
      let student = null;
      let matchedUser = null;
      let processedStatus = 'received';
      let error = '';
      if (event.webhookType === 'message') {
        student = findStudentByWhatsappPhone(event.fromPhone);
        matchedUser = student?.user_id ? get('SELECT * FROM users WHERE id=?', [student.user_id]) : null;
        if (student) {
          result.matched += 1;
          processedStatus = 'matched_student';
          const senderId = matchedUser?.id || student.user_id || 'whatsapp_contact';
          const alreadyMessage = event.messageId ? get('SELECT id FROM messages WHERE attachment_name=? LIMIT 1', [`wa:${event.messageId}`]) : null;
          if (!alreadyMessage && event.text) {
            const msg = { id: id('msg'), workspace_id: student.workspace_id, student_id: student.id, sender_id: senderId, text: event.text, attachment_path: '', attachment_name: event.messageId ? `wa:${event.messageId}` : '', attachment_mime_type: 'whatsapp/text', read_at: '', created_at: nowISO() };
            run('INSERT INTO messages (id,workspace_id,student_id,sender_id,text,attachment_path,attachment_name,attachment_mime_type,read_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [msg.id, msg.workspace_id, msg.student_id, msg.sender_id, msg.text, msg.attachment_path, msg.attachment_name, msg.attachment_mime_type, msg.read_at, msg.created_at]);
            databaseAdapter.mirror('messages', msg, { workspaceId: msg.workspace_id, entityId: msg.id }).catch(() => {});
            result.savedMessages += 1;
          }
          const trainer = student.trainer_id ? get('SELECT * FROM trainers WHERE id=?', [student.trainer_id]) : null;
          if (trainer?.user_id) notify(student.workspace_id, trainer.user_id, 'Mensagem recebida no WhatsApp', `${student.name}: ${event.text || 'Nova mensagem recebida.'}`, { type: 'whatsapp', actionUrl: '/admin/chat', metadata: { studentId: student.id, messageId: event.messageId } });
          const aiReply = await maybeSendWhatsappAiReply({ event, student });
          if (aiReply?.skipped) result.aiSkipped += 1;
          else result.aiReplies += 1;
        } else {
          result.unmatched += 1;
          processedStatus = 'unmatched_contact';
          error = 'Contato recebido, mas nenhum aluno com esse telefone foi localizado.';
        }
      }
      const recorded = recordWhatsAppEvent({ workspaceId: student?.workspace_id || 'ws_fitpro_elite', ...event, matchedStudentId: student?.id || '', matchedUserId: matchedUser?.id || '', processedStatus, error });
      if (recorded.duplicate) result.duplicates += 1;
    } catch (error) {
      result.errors.push(error.message || String(error));
      recordWhatsAppEvent({ ...event, processedStatus: 'error', error: error.message || String(error) });
    }
  }
  integrationLog('ws_fitpro_elite', 'whatsapp', 'webhook_received', result.errors.length ? 'warn' : 'ok', 'whatsapp', JSON.stringify(result).slice(0, 1000));
  audit({ id: 'whatsapp', workspaceId: 'ws_fitpro_elite' }, 'whatsapp_webhook_processed', 'integration', 'whatsapp', JSON.stringify(result).slice(0, 900));
  return result;
}

function templateContextForPayment(paymentId) {
  const payment = get('SELECT * FROM payments WHERE id=?', [paymentId]);
  if (!payment) return {};
  const student = get('SELECT * FROM students WHERE id=?', [payment.student_id]) || {};
  const plan = get('SELECT * FROM plans WHERE id=?', [payment.plan_id]) || {};
  return { payment, student, plan };
}

async function notifyPaymentChannels({ user, payment, template = 'payment_pending', reason = '', channels = ['internal'] }) {
  const student = get('SELECT * FROM students WHERE id=?', [payment.student_id]) || {};
  const studentUser = student.user_id ? get('SELECT * FROM users WHERE id=?', [student.user_id]) : null;
  const context = { student, payment, reason };
  const result = { internal: false, whatsapp: false, email: false, errors: [] };
  if (studentUser && channels.includes('internal')) {
    notify(payment.workspace_id, studentUser.id, template === 'payment_approved' ? 'Pagamento aprovado' : template === 'payment_rejected' ? 'Pagamento recusado' : 'Pagamento pendente', template === 'payment_rejected' ? reason : `Status: ${payment.status}`);
    result.internal = true;
  }
  if (channels.includes('whatsapp') && student.phone) {
    try {
      const text = whatsappTemplates[template] ? whatsappTemplates[template](context) : whatsappTemplates.payment_pending(context);
      await sendWhatsAppText({ to: student.phone, text });
      integrationLog(payment.workspace_id, 'whatsapp', template, 'ok', payment.id, 'Mensagem de pagamento enviada.');
      result.whatsapp = true;
    } catch (error) { result.errors.push(`WhatsApp: ${error.message}`); integrationLog(payment.workspace_id, 'whatsapp', template, 'error', payment.id, error.message); }
  }
  if (channels.includes('email') && student.email) {
    try {
      await sendEmailTemplate({ to: student.email, template, context });
      integrationLog(payment.workspace_id, 'email', template, 'ok', payment.id, 'E-mail de pagamento enviado.');
      result.email = true;
    } catch (error) { result.errors.push(`E-mail: ${error.message}`); integrationLog(payment.workspace_id, 'email', template, 'error', payment.id, error.message); }
  }
  return result;
}

async function mirrorKeyTablesToSupabase(user) {
  const tables = SUPABASE_SYNC_TABLES.filter(table => !['sync_queue'].includes(table));
  const result = { queued: 0, mirrored: 0, tables: [] };
  for (const table of tables) {
    const rows = all(`SELECT * FROM ${table} WHERE ${table === 'workspaces' ? '1=1' : 'workspace_id=?'} LIMIT 500`, table === 'workspaces' ? [] : [user.workspaceId]);
    for (const row of rows) {
      const sync = await databaseAdapter.mirror(table, row, { workspaceId: row.workspace_id || user.workspaceId, entityId: row.id || '' });
      if (sync?.queued) result.queued += 1; else result.mirrored += 1;
    }
    result.tables.push({ table, rows: rows.length });
  }
  integrationLog(user.workspaceId, 'supabase', 'migrate_key_tables', 'ok', 'supabase', `${result.mirrored} espelhados • ${result.queued} em fila.`);
  audit(user, 'supabase_key_tables_migrated', 'integration', 'supabase', JSON.stringify(result).slice(0, 1000));
  return result;
}

function integrationLog(workspaceId, integration, action, status, relatedId = '', message = '') {
  const payload = { id: id('ilog'), workspace_id: workspaceId || 'ws_fitpro_elite', integration, action, status, related_id: relatedId, message: String(message || '').slice(0, 1200), created_at: nowISO() };
  run('INSERT INTO integration_logs (id,workspace_id,integration,action,status,related_id,message,created_at) VALUES (?,?,?,?,?,?,?,?)',
    [payload.id, payload.workspace_id, payload.integration, payload.action, payload.status, payload.related_id, payload.message, payload.created_at]);
  databaseAdapter.mirror('integration_logs', payload, { workspaceId: payload.workspace_id, entityId: payload.id }).catch(() => {});
}


const INTEGRATION_CATALOG = [
  {
    key: 'api', icon: '🟢', title: 'API FitPro / Railway', category: 'core', description: 'Backend Node.js, healthcheck público e rotas protegidas.',
    required: ['APP_URL', 'CORS_ORIGIN'], optional: ['PORT'], usefulUrl: '/health', testPath: '/api/admin/integrations/test/api'
  },
  {
    key: 'database', icon: '🗄️', title: 'Banco de dados', category: 'core', description: 'SQLite ativo hoje, com preparação para Supabase-first.',
    required: ['DATABASE_PATH'], optional: [], usefulUrl: '', testPath: '/api/admin/integrations/test/database'
  },
  {
    key: 'storage', icon: '📎', title: 'Upload/storage', category: 'storage', description: 'Uploads privados locais com fallback e preparação para Supabase Storage.',
    required: ['UPLOAD_DIR'], optional: ['SUPABASE_STORAGE_BUCKET_PROOFS','SUPABASE_STORAGE_BUCKET_AVATARS','SUPABASE_STORAGE_BUCKET_PROGRESS','SUPABASE_STORAGE_BUCKET_CONTENTS'], usefulUrl: '', testPath: '/api/admin/integrations/test/storage'
  },
  {
    key: 'supabase', icon: '🟩', title: 'Supabase', category: 'database', description: 'Banco/storage principal futuro com service role apenas no backend.',
    required: ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'], optional: ['SUPABASE_PUBLISHABLE_KEY'], usefulUrl: '', testPath: '/api/admin/integrations/test/supabase'
  },
  {
    key: 'mercadopago', icon: '💳', title: 'Mercado Pago', category: 'payments', description: 'Checkout, preferências e webhook server-side.',
    required: ['MERCADO_PAGO_ACCESS_TOKEN'], optional: ['MERCADO_PAGO_WEBHOOK_SECRET','MERCADO_PAGO_SUCCESS_URL','MERCADO_PAGO_FAILURE_URL','MERCADO_PAGO_PENDING_URL'], usefulUrl: '/api/mercado-pago/webhook', testPath: '/api/admin/integrations/test/mercadopago'
  },
  {
    key: 'whatsapp_link', icon: '💬', title: 'WhatsApp Link', category: 'communication', description: 'Abertura segura de conversa via link, sem token secreto.',
    required: ['WHATSAPP_PHONE'], optional: [], usefulUrl: '', testPath: '/api/admin/integrations/test/whatsapp-link'
  },
  {
    key: 'whatsapp', icon: '🟢', title: 'WhatsApp Business API', category: 'communication', description: 'Envio server-side e webhook Meta.',
    required: ['WHATSAPP_BUSINESS_TOKEN','WHATSAPP_BUSINESS_PHONE_ID','WHATSAPP_VERIFY_TOKEN'], optional: ['WHATSAPP_PHONE'], usefulUrl: '/api/whatsapp/webhook', testPath: '/api/admin/integrations/test/whatsapp'
  },
  {
    key: 'whatsapp_ai', icon: '🤖', title: 'WhatsApp + IA automática', category: 'ai', description: 'Resposta automática segura para aluno identificado pelo webhook WhatsApp.',
    required: ['WHATSAPP_BUSINESS_TOKEN','WHATSAPP_BUSINESS_PHONE_ID','OPENAI_API_KEY','WHATSAPP_AI_AUTO_REPLY_ENABLED'], optional: ['WHATSAPP_AI_MAX_REPLIES_PER_STUDENT_HOUR','OPENAI_MODEL'], usefulUrl: '/api/admin/whatsapp/ai-replies', testPath: '/api/admin/integrations/test/whatsapp-ai'
  },
  {
    key: 'whatsapp_templates', icon: '📨', title: 'Templates WhatsApp aprovados', category: 'communication', description: 'Registro e envio de templates aprovados na Meta sem expor nomes/secrets no frontend.',
    required: ['WHATSAPP_BUSINESS_TOKEN','WHATSAPP_BUSINESS_PHONE_ID'], optional: ['WHATSAPP_TEMPLATE_STUDENT_APPROVED','WHATSAPP_TEMPLATE_PAYMENT_PENDING','WHATSAPP_TEMPLATE_PAYMENT_APPROVED','WHATSAPP_TEMPLATE_PAYMENT_REJECTED','WHATSAPP_TEMPLATE_WORKOUT_READY','WHATSAPP_TEMPLATE_WORKOUT_REMINDER','WHATSAPP_TEMPLATE_ASSESSMENT_DUE','WHATSAPP_TEMPLATE_INACTIVE_STUDENT'], usefulUrl: '/api/admin/whatsapp/templates', testPath: '/api/admin/integrations/test/whatsapp-templates'
  },
  {
    key: 'resend', icon: '✉️', title: 'E-mail / Resend', category: 'communication', description: 'E-mail transacional via backend.',
    required: ['RESEND_API_KEY','EMAIL_FROM'], optional: [], usefulUrl: '', testPath: '/api/admin/integrations/test/resend'
  },
  {
    key: 'openai', icon: '🤖', title: 'OpenAI / IA', category: 'ai', description: 'IA server-side com fallback seguro quando a chave não existe.',
    required: ['OPENAI_API_KEY'], optional: [], usefulUrl: '', testPath: '/api/admin/integrations/test/openai'
  },
  {
    key: 'google', icon: '📅', title: 'Google Calendar/Meet', category: 'calendar', description: 'OAuth, Calendar e criação de link Meet.',
    required: ['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REDIRECT_URI'], optional: [], usefulUrl: '/api/google/auth-url', testPath: '/api/admin/integrations/test/google'
  }
];

function hasEnv(name) {
  return Boolean(String(process.env[name] || '').trim());
}
function envState(name) {
  return { name, configured: hasEnv(name), status: hasEnv(name) ? 'configurada' : 'ausente' };
}
function lastIntegrationLog(workspaceId, key) {
  const rows = all('SELECT * FROM integration_logs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 80', [workspaceId]);
  const aliases = key === 'resend' ? ['email','resend'] : key === 'mercadopago' ? ['mercado_pago','mercadopago','mercado pago'] : key === 'whatsapp_link' ? ['whatsapp_link','whatsapp'] : key === 'whatsapp_ai' ? ['whatsapp_ai'] : key === 'whatsapp_templates' ? ['whatsapp_template','send_template'] : [key];
  return mapRows(rows).find(log => aliases.some(alias => String(log.integration || '').toLowerCase().includes(alias))) || null;
}
function integrationBaseStatus(item, workspaceId) {
  const required = item.required.map(envState);
  const optional = item.optional.map(envState);
  const configuredRequired = required.filter(v => v.configured).length;
  const configuredOptional = optional.filter(v => v.configured).length;
  let status = 'nao_configurado';
  let severity = 'danger';
  if (configuredRequired === item.required.length) { status = 'configurado'; severity = 'ok'; }
  else if (configuredRequired > 0 || configuredOptional > 0) { status = 'parcial'; severity = 'warn'; }
  if (item.key === 'api') { status = 'online'; severity = 'ok'; }
  if (item.key === 'database') { status = 'ativo'; severity = 'ok'; }
  if (item.key === 'storage' && hasEnv('UPLOAD_DIR')) { status = 'ativo'; severity = 'ok'; }
  if (item.key === 'openai' && !hasEnv('OPENAI_API_KEY')) { status = 'fallback_seguro'; severity = 'warn'; }
  if (item.key === 'whatsapp_link' && hasEnv('WHATSAPP_PHONE')) { status = 'configurado'; severity = 'ok'; }
  const log = lastIntegrationLog(workspaceId, item.key);
  return {
    ...item,
    status,
    severity,
    required,
    optional,
    configuredRequired,
    totalRequired: item.required.length,
    configuredOptional,
    totalOptional: item.optional.length,
    lastLog: log,
    lastTestAt: log?.createdAt || log?.created_at || null,
    safeNote: 'Secrets nunca são exibidas: apenas status configurada/ausente.'
  };
}
function integrationChecklist(items) {
  const has = key => items.find(i => i.key === key);
  return [
    { label: 'Railway/API responde /health', status: has('api')?.severity === 'ok' ? 'ok' : 'warn' },
    { label: 'Vercel deve usar VITE_API_URL apontando para Railway', status: config.apiUrl ? 'ok' : 'warn' },
    { label: 'AUTH_SECRET fica apenas no backend', status: hasEnv('AUTH_SECRET') ? 'ok' : 'warn' },
    { label: 'Banco local/fallback configurado', status: has('database')?.severity === 'ok' ? 'ok' : 'warn' },
    { label: 'Uploads privados com pasta escrita', status: has('storage')?.severity === 'ok' ? 'ok' : 'warn' },
    { label: 'Supabase service role somente no Railway', status: has('supabase')?.severity === 'ok' ? 'ok' : 'warn' },
    { label: 'Mercado Pago sem secret no frontend', status: has('mercadopago')?.severity === 'ok' ? 'ok' : 'warn' },
    { label: 'WhatsApp Business webhook preparado', status: has('whatsapp')?.severity === 'ok' ? 'ok' : 'warn' },
    { label: 'OpenAI somente server-side', status: has('openai')?.severity === 'ok' ? 'ok' : 'warn' },
    { label: 'Google OAuth com redirect público', status: has('google')?.severity === 'ok' ? 'ok' : 'warn' }
  ];
}
function buildIntegrationDashboard(user) {
  const workspaceId = user?.workspaceId || 'ws_fitpro_elite';
  const items = INTEGRATION_CATALOG.map(item => integrationBaseStatus(item, workspaceId));
  const logs = mapRows(all('SELECT * FROM integration_logs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 40', [workspaceId]));
  const counts = items.reduce((acc, item) => {
    acc.total += 1;
    if (item.severity === 'ok') acc.ok += 1;
    else if (item.severity === 'warn') acc.warn += 1;
    else acc.danger += 1;
    return acc;
  }, { total: 0, ok: 0, warn: 0, danger: 0 });
  const usefulUrls = [
    { label: 'Health Railway', url: `${config.apiUrl}/health` },
    { label: 'Health API', url: `${config.apiUrl}/api/health` },
    { label: 'Webhook WhatsApp', url: `${config.apiUrl}/api/whatsapp/webhook` },
    { label: 'Webhook Mercado Pago', url: `${config.apiUrl}/api/mercado-pago/webhook` },
    { label: 'Frontend Vercel/App', url: config.appUrl || '' }
  ].filter(item => item.url);
  return {
    generatedAt: nowISO(),
    environment: config.nodeEnv,
    apiUrl: config.apiUrl,
    appUrl: config.appUrl,
    counts,
    items,
    checklist: integrationChecklist(items),
    urls: usefulUrls,
    logs,
    alerts: items.filter(i => i.severity !== 'ok').slice(0, 8).map(i => ({ key: i.key, title: i.title, status: i.status, message: i.totalRequired ? `${i.configuredRequired}/${i.totalRequired} variáveis obrigatórias configuradas.` : i.description }))
  };
}
function normalizeIntegrationKey(value = '') {
  const key = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (key.includes('mercado')) return 'mercadopago';
  if (key.includes('resend') || key.includes('email')) return 'resend';
  if (key.includes('whatsapp_ai') || key.includes('whatsapp_ia') || key.includes('whatsapp-ia')) return 'whatsapp_ai';
  if (key.includes('whatsapp_templates') || key.includes('whatsapp_template') || key.includes('whatsapp-template')) return 'whatsapp_templates';
  if (key.includes('openai') || key === 'ia' || key.includes('ai')) return 'openai';
  if (key.includes('whatsapp_link')) return 'whatsapp_link';
  if (key.includes('whatsapp')) return 'whatsapp';
  if (key.includes('supabase')) return 'supabase';
  if (key.includes('storage') || key.includes('upload')) return 'storage';
  if (key.includes('database') || key.includes('banco')) return 'database';
  if (key.includes('google') || key.includes('calendar') || key.includes('meet')) return 'google';
  if (key.includes('api') || key.includes('railway') || key.includes('health')) return 'api';
  return key;
}
async function runIntegrationTest(user, rawKey, body = {}) {
  const key = normalizeIntegrationKey(rawKey);
  const now = nowISO();
  let result = { ok: false, status: 'em_espera', integration: key, message: 'Integração ainda sem teste específico.', checkedAt: now };
  if (key === 'api') {
    result = { ok: true, status: 'online', integration: key, message: 'API FitPro respondeu internamente. Teste público recomendado em /health.', checkedAt: now, details: { env: config.nodeEnv, apiUrl: config.apiUrl } };
  } else if (key === 'database') {
    const row = get('SELECT COUNT(*) AS total FROM users');
    result = { ok: true, status: 'ativo', integration: key, message: `Banco respondeu. Usuários encontrados: ${row?.total || 0}.`, checkedAt: now, details: { mode: databaseAdapter.mode, dbPath: config.dbPath } };
  } else if (key === 'storage') {
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    fs.accessSync(config.uploadsDir, fs.constants.W_OK);
    const fallbackFiles = all('SELECT status, COUNT(*) AS total FROM storage_fallback_files GROUP BY status').map(r => ({ status: r.status, total: r.total }));
    result = { ok: true, status: 'ativo', integration: key, message: 'Pasta de uploads privados existe e possui permissão de escrita.', checkedAt: now, details: { uploadDir: config.uploadsDir, fallbackFiles } };
  } else if (key === 'supabase') {
    if (!hasEnv('SUPABASE_URL') || !hasEnv('SUPABASE_SERVICE_ROLE_KEY')) result = { ok: false, status: 'em_espera', integration: key, message: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente no backend/Railway.', checkedAt: now };
    else {
      const health = await supabaseHealthCheck();
      const schemaChecks = [];
      if (health.ok) {
        for (const table of ['workspaces','students','payments','whatsapp_webhook_events','whatsapp_ai_replies','whatsapp_template_sends','mercado_pago_webhook_events']) {
          try { await supabaseSelect(table, 'select=id&limit=1'); schemaChecks.push({ table, ok: true }); }
          catch (error) { schemaChecks.push({ table, ok: false, error: error.message }); }
        }
      }
      const schemaOk = schemaChecks.length ? schemaChecks.every(item => item.ok) : Boolean(health.ok);
      const avatarsBucket = await bucketStatus(supabaseAvatarBucket()).catch(error => ({ ok: false, error: error.message }));
      result = { ok: Boolean(health.ok && schemaOk && avatarsBucket.ok), status: health.ok && schemaOk && avatarsBucket.ok ? 'conectado' : (health.ok ? 'parcial' : 'erro'), integration: key, message: health.ok ? (avatarsBucket.ok ? (schemaOk ? 'Supabase respondeu, tabelas-chave existem e bucket avatars está acessível.' : 'Supabase respondeu e bucket avatars existe, mas uma ou mais tabelas-chave precisam do SQL de schema.') : 'Supabase respondeu, mas bucket avatars não confirmou acesso.') : (health.error || 'Supabase indisponível.'), checkedAt: now, details: { ...health, schemaChecks, avatarsBucket, avatarBucketName: supabaseAvatarBucket() } };
    }
  } else if (key === 'mercadopago') {
    if (!hasEnv('MERCADO_PAGO_ACCESS_TOKEN')) result = { ok: false, status: 'em_espera', integration: key, message: 'MERCADO_PAGO_ACCESS_TOKEN ausente no backend/Railway.', checkedAt: now };
    else {
      const payment = get('SELECT * FROM payments WHERE workspace_id=? ORDER BY created_at DESC LIMIT 1', [user.workspaceId]);
      if (!payment) result = { ok: false, status: 'parcial', integration: key, message: 'Token encontrado, mas não há cobrança para criar preference de teste.', checkedAt: now };
      else {
        const student = get('SELECT * FROM students WHERE id=?', [payment.student_id]);
        const plan = get('SELECT * FROM plans WHERE id=?', [payment.plan_id]);
        const pref = await createMercadoPagoPreference({ payment, student, plan, notificationUrl: `${config.apiUrl}/api/mercado-pago/webhook` });
        run('UPDATE payments SET external_link=? WHERE id=?', [pref.init_point || pref.sandbox_init_point || '', payment.id]);
        result = { ok: true, status: 'conectado', integration: key, message: 'Preference Mercado Pago criada para cobrança recente.', checkedAt: now, details: { preferenceId: pref.id || '', hasInitPoint: Boolean(pref.init_point || pref.sandbox_init_point) } };
      }
    }
  } else if (key === 'whatsapp_link') {
    result = hasEnv('WHATSAPP_PHONE')
      ? { ok: true, status: 'configurado', integration: key, message: 'WHATSAPP_PHONE configurado para links seguros.', checkedAt: now }
      : { ok: false, status: 'em_espera', integration: key, message: 'WHATSAPP_PHONE ausente. Links ainda dependem de telefone público.', checkedAt: now };
  } else if (key === 'whatsapp') {
    if (!hasEnv('WHATSAPP_BUSINESS_TOKEN') || !hasEnv('WHATSAPP_BUSINESS_PHONE_ID') || !hasEnv('WHATSAPP_VERIFY_TOKEN')) result = { ok: false, status: 'em_espera', integration: key, message: 'Token, Phone ID ou Verify Token do WhatsApp Business ausente no backend/Railway.', checkedAt: now, details: { webhook: `${config.apiUrl}/api/whatsapp/webhook` } };
    else if (body.sendRealMessage) {
      const to = String(body.to || process.env.WHATSAPP_PHONE || '').replace(/\D/g, '');
      if (!to) throw new Error('Informe telefone para teste real de WhatsApp.');
      const wa = await sendWhatsAppText({ to, text: 'Teste de integração FitPro Elite.' });
      result = { ok: true, status: 'conectado', integration: key, message: 'Mensagem de teste enviada via WhatsApp Business.', checkedAt: now, details: { providerResult: wa, webhook: `${config.apiUrl}/api/whatsapp/webhook` } };
    } else {
      const rows = all('SELECT processed_status, COUNT(*) AS total FROM whatsapp_webhook_events GROUP BY processed_status').map(r => ({ status: r.processed_status, total: r.total }));
      result = { ok: true, status: 'configurado', integration: key, message: 'Credenciais e webhook do WhatsApp Business detectados. Envio real fica opcional para evitar disparo indevido.', checkedAt: now, details: { webhook: `${config.apiUrl}/api/whatsapp/webhook`, recentEvents: rows } };
    }
  } else if (key === 'whatsapp_ai') {
    const recent = all('SELECT status, COUNT(*) AS total FROM whatsapp_ai_replies GROUP BY status').map(r => ({ status: r.status, total: r.total }));
    if (!hasEnv('WHATSAPP_BUSINESS_TOKEN') || !hasEnv('WHATSAPP_BUSINESS_PHONE_ID')) result = { ok: false, status: 'em_espera', integration: key, message: 'WhatsApp Business ainda não está configurado no backend/Railway.', checkedAt: now };
    else if (!hasEnv('OPENAI_API_KEY')) result = { ok: false, status: 'fallback_seguro', integration: key, message: 'OPENAI_API_KEY ausente. Auto resposta por IA real fica em espera.', checkedAt: now, details: { recent } };
    else if (!whatsappAiEnabled()) result = { ok: false, status: 'configurado_desativado', integration: key, message: 'Credenciais existem, mas WHATSAPP_AI_AUTO_REPLY_ENABLED precisa estar true para responder automaticamente em produção.', checkedAt: now, details: { recent } };
    else {
      const ai = await askOpenAI({ prompt: 'Responda em uma frase curta e segura para aluno: como sei se a IA do WhatsApp FitPro está online?', role: 'student' });
      result = { ok: true, status: 'ativo', integration: key, message: 'WhatsApp + IA automática está ativo para alunos identificados por telefone.', checkedAt: now, details: { provider: ai.provider, sample: ai.answer, recent } };
    }
  } else if (key === 'whatsapp_templates') {
    const templates = whatsappApprovedTemplates().map(t => ({ key: t.key, label: t.label, configured: t.configured, name: t.configured ? t.name : '', language: t.language, envName: t.envName }));
    const configured = templates.filter(t => t.configured).length;
    result = { ok: configured > 0 && hasEnv('WHATSAPP_BUSINESS_TOKEN') && hasEnv('WHATSAPP_BUSINESS_PHONE_ID'), status: configured > 0 ? 'configurado' : 'aguardando_nomes_meta', integration: key, message: configured > 0 ? `${configured} template(s) aprovados configurados por variável de ambiente.` : 'Adicione no Railway os nomes exatos dos templates aprovados na Meta.', checkedAt: now, details: { templates } };
  } else if (key === 'resend') {
    if (!hasEnv('RESEND_API_KEY') || !hasEnv('EMAIL_FROM')) result = { ok: false, status: 'em_espera', integration: key, message: 'RESEND_API_KEY ou EMAIL_FROM ausente no backend/Railway.', checkedAt: now };
    else if (body.sendRealEmail) {
      const to = body.to || process.env.EMAIL_FROM;
      const email = await sendEmail({ to, subject: 'Teste FitPro Elite', html: '<p>Integração de e-mail FitPro Elite funcionando.</p>' });
      result = { ok: true, status: 'conectado', integration: key, message: 'E-mail de teste enviado via Resend.', checkedAt: now, details: { providerResult: email } };
    } else result = { ok: true, status: 'configurado', integration: key, message: 'Credenciais Resend detectadas. Envio real fica opcional para evitar e-mails indevidos.', checkedAt: now };
  } else if (key === 'openai') {
    if (!hasEnv('OPENAI_API_KEY')) result = { ok: false, status: 'fallback_seguro', integration: key, message: 'OPENAI_API_KEY ausente. IA segue usando fallback seguro.', checkedAt: now };
    else {
      const ai = await askOpenAI({ prompt: 'Responda em uma frase curta: a integração FitPro está online?', role: user.role });
      result = { ok: true, status: 'conectado', integration: key, message: 'OpenAI respondeu via backend.', checkedAt: now, details: { provider: ai.provider, answer: ai.answer } };
    }
  } else if (key === 'google') {
    const ok = hasEnv('GOOGLE_CLIENT_ID') && hasEnv('GOOGLE_CLIENT_SECRET') && hasEnv('GOOGLE_REDIRECT_URI');
    result = ok
      ? { ok: true, status: 'configurado', integration: key, message: 'Credenciais Google detectadas. OAuth pode ser iniciado pelo backend.', checkedAt: now, details: { authUrl: `${config.apiUrl}/api/google/auth-url` } }
      : { ok: false, status: 'em_espera', integration: key, message: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ou GOOGLE_REDIRECT_URI ausente.', checkedAt: now };
  }
  const logStatus = result.ok ? 'ok' : (result.status === 'em_espera' || result.status === 'fallback_seguro' ? 'warn' : 'error');
  integrationLog(user.workspaceId, key, 'test_connection', logStatus, key, result.message);
  run('INSERT INTO integration_settings (id,workspace_id,key,status,public_config_json,last_test_at,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(workspace_id,key) DO UPDATE SET status=excluded.status,last_test_at=excluded.last_test_at,public_config_json=excluded.public_config_json', [id('int'), user.workspaceId, key, result.status, toJSON({ lastMessage: result.message, lastResult: result.status, safe: true }), now, now]);
  return result;
}


function cleanAvatarUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/[?&]access_token=[^&]+/g, '').replace(/[?&]token=[^&]+/g, '');
}

function avatarUrlFromStoragePath(storagePath = '') {
  const parsed = parseSupabaseStoragePath(storagePath);
  if (!parsed) return '';
  return publicObjectUrl(parsed.bucket, parsed.objectPath);
}

function avatarClientUrlFromRow(row = {}) {
  if (!row) return '';
  let avatar = cleanAvatarUrl(row.avatar_public_url || row.avatar || '');
  if (!avatar && row.avatar_storage_path) avatar = avatarUrlFromStoragePath(row.avatar_storage_path);
  if (avatar === row.id || /^user_[a-z0-9_-]+$/i.test(String(avatar || ''))) avatar = row.id ? `/api/profile/avatar/${row.id}` : '';
  if (String(avatar || '').startsWith('supabase://')) avatar = avatarUrlFromStoragePath(avatar) || (row.id ? `/api/profile/avatar/${row.id}` : '');
  return cleanAvatarUrl(avatar);
}

function parseDataUrl(dataUrl = '') {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  return { mime, buffer };
}

async function savePrivateDataUrl({ dataUrl, fileName = 'arquivo', allowedTypes = PUBLIC_TYPES, maxBytes = 8 * 1024 * 1024, localSubdir = 'files', bucket = '', objectPath = '', workspaceId = 'ws_fitpro_elite', ownerId = '', reasonWhenLocal = 'Supabase Storage não configurado.' }) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw Object.assign(new Error('Arquivo inválido. Envie base64 dataURL.'), { status: 422 });
  if (!allowedTypes.has(parsed.mime)) throw Object.assign(new Error('Tipo de arquivo não permitido.'), { status: 422 });
  if (parsed.buffer.length > maxBytes) throw Object.assign(new Error(`Arquivo deve ter no máximo ${Math.round(maxBytes / 1024 / 1024)}MB.`), { status: 413 });
  const safeName = safeFileName(fileName || 'arquivo');
  const dir = path.join(config.uploadsDir, localSubdir);
  fs.mkdirSync(dir, { recursive: true });
  const localPath = path.join(dir, `${Date.now()}-${safeName}`);
  if (hasSupabaseAdmin() && bucket && objectPath) {
    try {
      await uploadPrivateObject(bucket, objectPath, parsed.buffer, parsed.mime);
      return { storagePath: `supabase://${bucket}/${objectPath}`, publicUrl: publicObjectUrl(bucket, objectPath), mime: parsed.mime, size: parsed.buffer.length, fileName: safeName, provider: 'supabase_storage' };
    } catch (error) {
      fs.writeFileSync(localPath, parsed.buffer);
      recordStorageFallback({ workspaceId, ownerId, bucket, objectPath, localPath, mimeType: parsed.mime, size: parsed.buffer.length, reason: error.message });
      return { storagePath: localPath, mime: parsed.mime, size: parsed.buffer.length, fileName: safeName, provider: 'local_fallback', error: error.message };
    }
  }
  fs.writeFileSync(localPath, parsed.buffer);
  if (bucket && objectPath) recordStorageFallback({ workspaceId, ownerId, bucket, objectPath, localPath, mimeType: parsed.mime, size: parsed.buffer.length, reason: reasonWhenLocal });
  return { storagePath: localPath, mime: parsed.mime, size: parsed.buffer.length, fileName: safeName, provider: 'local' };
}

async function servePrivateStoragePath({ req, res, storagePath, mimeType = 'application/octet-stream', fileName = 'arquivo', disposition = 'inline', workspaceId = 'ws_fitpro_elite', relatedId = '' }) {
  if (String(storagePath || '').startsWith('supabase://')) {
    const [, rest] = String(storagePath).split('supabase://');
    const [bucket, ...parts] = rest.split('/');
    const objectPath = parts.join('/');
    try {
      const signed = await createSignedUrl(bucket, objectPath, disposition === 'attachment' ? 60 : 300);
      const signedUrl = signed?.signedURL || signed?.signedUrl || signed?.url || '';
      if (!signedUrl) throw new Error('Storage não retornou URL assinada.');
      res.writeHead(302, { Location: signedUrl, ...corsHeaders(req), 'Cache-Control': 'private, no-store' });
      return res.end();
    } catch (error) {
      integrationLog(workspaceId, 'supabase_storage', 'signed_url', 'error', relatedId, error.message);
      return send(res, 502, { error: 'Não foi possível gerar acesso seguro ao arquivo privado.' });
    }
  }
  if (!fs.existsSync(storagePath)) return send(res, 404, { error: 'Arquivo privado não localizado no storage.' });
  const buffer = fs.readFileSync(storagePath);
  res.writeHead(200, {
    'Content-Type': mimeType || 'application/octet-stream',
    'Content-Length': buffer.length,
    'Content-Disposition': `${disposition}; filename="${encodeURIComponent(fileName || 'arquivo')}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders(req)
  });
  return res.end(buffer);
}

function cleanPayment(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    studentId: row.student_id,
    planId: row.plan_id,
    amount: row.amount,
    dueDate: row.due_date,
    status: row.status,
    proofName: row.proof_name,
    proofMimeType: row.proof_mime_type,
    proofSize: row.proof_size,
    proofUploadedAt: row.proof_uploaded_at,
    proofStudentNote: row.proof_student_note,
    proofViewedAt: row.proof_viewed_at,
    proofViewedBy: row.proof_viewed_by,
    externalLink: row.external_link,
    mercadoPagoId: row.mercado_pago_id,
    mercadoPagoStatus: row.mercado_pago_status,
    mercadoPagoStatusDetail: row.mercado_pago_status_detail,
    mercadoPagoPreapprovalId: row.mercado_pago_preapproval_id,
    mercadoPagoPreferenceId: row.mercado_pago_preference_id,
    mercadoPagoLastEventId: row.mercado_pago_last_event_id,
    mercadoPagoLastEventType: row.mercado_pago_last_event_type,
    paymentProvider: row.payment_provider,
    checkoutCreatedAt: row.checkout_created_at,
    lastWebhookAt: row.last_webhook_at,
    paidAt: row.paid_at,
    note: row.note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    hasProof: Boolean(row.proof_path)
  };
}

function tableAll(name, workspaceId, extra = '') {
  return all(`SELECT * FROM ${name} WHERE workspace_id = ? ${extra}`, [workspaceId]);
}

function initialsServer(name = 'FP') { return String(name).split(' ').map(part => part[0] || '').join('').slice(0, 2).toUpperCase(); }
function mapRows(rows) {
  return rows.map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
    return out;
  });
}

function activeCoupon(code, workspaceId) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;
  const row = get('SELECT * FROM coupons WHERE workspace_id=? AND UPPER(code)=? AND active=1', [workspaceId, normalized]);
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  if (Number(row.max_uses || 0) > 0 && Number(row.uses || 0) >= Number(row.max_uses)) return null;
  return row;
}
function publicTrainerProfile(row, branding, plans = []) {
  return {
    id: row.id,
    name: row.name,
    brandName: row.brand_name || row.name,
    slug: row.profile_slug || branding?.public_slug || row.id,
    city: row.city,
    state: row.state,
    specialty: row.specialty,
    bio: row.bio,
    modalities: row.modalities,
    whatsapp: row.whatsapp || row.phone || '',
    avatarUrl: row.avatar_url || '',
    instagram: row.instagram || '',
    serviceArea: row.service_area || '',
    maxStudents: row.max_students || 0,
    headline: branding?.headline || 'Acompanhamento fitness premium',
    publicDescription: branding?.public_description || row.bio || '',
    primaryColor: branding?.primary_color || '#00e676',
    accentColor: branding?.accent_color || '#16a34a',
    whatsappCta: branding?.whatsapp_cta || 'Quero iniciar meu acompanhamento FitPro',
    plans
  };
}
function mapStudent(row) {
  if (!row) return null;
  const mapped = mapRows([row])[0];
  const userRow = row.user_id ? get('SELECT id,name,avatar,avatar_public_url,avatar_storage_path FROM users WHERE id=?', [row.user_id]) : null;
  const avatar = avatarClientUrlFromRow(userRow) || row.avatar_url || '';
  return { ...mapped, avatar, avatarUrl: row.avatar_url || avatar, consents: json(row.consents_json, {}) };
}
function publicUsers(workspaceId) {
  return all('SELECT id,workspace_id,student_id,trainer_id,name,email,role,avatar,avatar_public_url,avatar_storage_path,created_at FROM users WHERE workspace_id=?', [workspaceId]).map(row => normalizeUser(row));
}

function avatarForUserId(userId = '', fallback = '') {
  if (!userId) return fallback || '';
  const row = get('SELECT id,avatar,avatar_public_url,avatar_storage_path,student_id,trainer_id FROM users WHERE id=?', [userId]);
  const rowAvatar = avatarClientUrlFromRow(row);
  if (rowAvatar) return rowAvatar;
  if (row?.student_id) {
    const st = get('SELECT avatar_url FROM students WHERE id=?', [row.student_id]);
    if (st?.avatar_url) return st.avatar_url;
  }
  if (row?.trainer_id) {
    const tr = get('SELECT avatar_url FROM trainers WHERE id=?', [row.trainer_id]);
    if (tr?.avatar_url) return tr.avatar_url;
  }
  return fallback || '';
}

function communityReactionRows(postId) {
  return mapRows(all('SELECT id,post_id,user_id,user_name,user_avatar,emoji,reaction_type,created_at FROM community_reactions WHERE post_id=? ORDER BY created_at ASC', [postId]))
    .map(r => ({ ...r, userAvatar: avatarForUserId(r.userId, r.userAvatar), user_avatar: avatarForUserId(r.userId, r.userAvatar) }));
}
function mapCommunityPost(row) {
  const mapped = mapRows([row])[0];
  const reactions = communityReactionRows(row.id);
  const comments = json(row.comments_json, []).map(comment => ({ ...comment, avatar: avatarForUserId(comment.userId || comment.user_id, comment.avatar || '') }));
  const grouped = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = [];
    grouped[r.emoji].push({ userId: r.userId, userName: r.userName, userAvatar: r.userAvatar, createdAt: r.createdAt });
  }
  return { ...mapped, likes: json(row.likes_json, []), comments, reactions, reactionSummary: grouped, attachments: json(row.attachments_json || '[]', []) };
}

function propagateUserAvatar({ user, avatarUrl }) {
  const now = nowISO();
  if (!user?.id || !avatarUrl) return;
  run("UPDATE users SET avatar=?, avatar_public_url=CASE WHEN ? LIKE 'http%' THEN ? ELSE avatar_public_url END WHERE id=?", [avatarUrl, avatarUrl, avatarUrl, user.id]);
  if (user.studentId) {
    run('UPDATE students SET avatar_url=? WHERE id=?', [avatarUrl, user.studentId]);
    run("UPDATE users SET avatar=?, avatar_public_url=CASE WHEN ? LIKE 'http%' THEN ? ELSE avatar_public_url END WHERE student_id=?", [avatarUrl, avatarUrl, avatarUrl, user.studentId]);
  }
  if (user.trainerId) {
    run('UPDATE trainers SET avatar_url=? WHERE id=?', [avatarUrl, user.trainerId]);
    run("UPDATE users SET avatar=?, avatar_public_url=CASE WHEN ? LIKE 'http%' THEN ? ELSE avatar_public_url END WHERE trainer_id=?", [avatarUrl, avatarUrl, avatarUrl, user.trainerId]);
  }
  run('UPDATE community_reactions SET user_avatar=? WHERE workspace_id=? AND user_id=?', [avatarUrl, user.workspaceId, user.id]);
  const posts = all('SELECT id,comments_json FROM community_posts WHERE workspace_id=? AND comments_json IS NOT NULL', [user.workspaceId]);
  for (const post of posts) {
    const comments = json(post.comments_json || '[]', []);
    let changed = false;
    const next = comments.map(comment => {
      if (comment?.userId === user.id) { changed = true; return { ...comment, avatar: avatarUrl }; }
      return comment;
    });
    if (changed) run('UPDATE community_posts SET comments_json=? WHERE id=?', [toJSON(next), post.id]);
  }
  audit(user, 'avatar_propagated', 'user', user.id, `Avatar propagado para perfis, reações e comentários em ${now}.`);
}
function hasApprovedTrainer(student) {
  return Boolean(student?.trainer_id && ['ativo','aprovado'].includes(String(student.status || '')) && String(student.request_status || '') === 'aprovado');
}
function onboardingStatusFor(student) {
  if (!student) return { locked: true, stage: 'sem_aluno', label: 'Perfil não encontrado' };
  if (hasApprovedTrainer(student)) return { locked: false, stage: 'acesso_liberado', label: 'Acesso liberado' };
  const requestStatus = String(student.request_status || 'sem_personal');
  if (requestStatus === 'aguardando_aprovacao') return { locked: true, stage: 'aguardando_aprovacao', label: 'Aguardando aprovação do personal' };
  if (requestStatus === 'recusado') return { locked: true, stage: 'recusado', label: 'Solicitação recusada' };
  return { locked: true, stage: 'sem_personal', label: 'Escolha um personal para iniciar' };
}
function trainerPlans(workspaceId, trainerId = '') {
  const rows = trainerId ? all('SELECT * FROM trainer_plans WHERE workspace_id=? AND trainer_id=? ORDER BY price', [workspaceId, trainerId]) : all('SELECT * FROM trainer_plans WHERE workspace_id=? ORDER BY price', [workspaceId]);
  return rows.map(r => ({ ...mapRows([r])[0], benefits: json(r.benefits_json, []) }));
}
function platformPlans(workspaceId) {
  return all('SELECT * FROM platform_plans WHERE workspace_id=? ORDER BY sort_order, price', [workspaceId]).map(r => ({
    ...mapRows([r])[0],
    resources: json(r.resources_json, []),
    limitations: json(r.limitations_json, [])
  }));
}
function platformPlanByIdOrCode(workspaceId, value) {
  const key = String(value || '').trim();
  if (!key) return null;
  return get('SELECT * FROM platform_plans WHERE workspace_id=? AND (id=? OR code=? OR LOWER(name)=LOWER(?)) LIMIT 1', [workspaceId, key, key, key]);
}
function normalizeActivationCode(value = '') {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '').slice(0, 60);
}
function generateActivationCode(planCode = 'PLUS', days = 30) {
  const prefix = String(planCode || 'FITPRO').replace(/^fitpro_/,'').toUpperCase().slice(0, 5) || 'FIT';
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}${Number(days || 30)}-${random}`;
}
function mapActivationCode(row, reveal = false) {
  if (!row) return null;
  const mapped = mapRows([row])[0];
  const plan = get('SELECT * FROM platform_plans WHERE id=?', [row.platform_plan_id]);
  const remaining = Math.max(0, Number(row.max_uses || 0) - Number(row.used_count || 0));
  const expired = row.expires_at && new Date(row.expires_at).getTime() < Date.now();
  return {
    ...mapped,
    code: reveal ? row.code : `${String(row.code || '').slice(0, 6)}••••`,
    plan: plan ? { ...mapRows([plan])[0], resources: json(plan.resources_json, []), limitations: json(plan.limitations_json, []) } : null,
    usesRemaining: remaining,
    computedStatus: expired ? 'expirado' : (remaining <= 0 ? 'limite_atingido' : row.status)
  };
}
function activationCodeValidation({ workspaceId, code, user = null, trainerId = '' }) {
  const normalized = normalizeActivationCode(code);
  if (!normalized) return { valid: false, reason: 'Informe o código de ativação.' };
  const row = get('SELECT * FROM platform_activation_codes WHERE workspace_id=? AND UPPER(code)=?', [workspaceId, normalized]);
  if (!row) return { valid: false, reason: 'Código inválido ou não encontrado.' };
  if (row.status !== 'ativo') return { valid: false, reason: `Código ${statusLabelServer(row.status)}.` , code: row };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return { valid: false, reason: 'Código expirado.', code: row };
  if (Number(row.max_uses || 0) > 0 && Number(row.used_count || 0) >= Number(row.max_uses || 0)) return { valid: false, reason: 'Código atingiu o limite de usos.', code: row };
  const targetTrainerId = trainerId || user?.trainerId || '';
  if (row.assigned_trainer_id && row.assigned_trainer_id !== targetTrainerId) return { valid: false, reason: 'Código vinculado a outro personal.', code: row };
  if (targetTrainerId && get('SELECT id FROM activation_code_redemptions WHERE activation_code_id=? AND trainer_id=? LIMIT 1', [row.id, targetTrainerId])) return { valid: false, reason: 'Este personal já usou esse código.', code: row };
  const plan = get('SELECT * FROM platform_plans WHERE id=? AND workspace_id=?', [row.platform_plan_id, workspaceId]);
  if (!plan || plan.status !== 'ativo') return { valid: false, reason: 'Plano do código não está disponível.', code: row };
  return { valid: true, code: row, plan, normalized };
}
function statusLabelServer(status = '') {
  const labels = { ativo:'ativo', inativo:'inativo', usado:'usado', expirado:'expirado', cancelado:'cancelado', bloqueado:'bloqueado', limite_atingido:'com limite atingido', trial:'trial', pending:'pendente', active:'ativo' };
  return labels[String(status)] || String(status || 'indefinido');
}
function applyActivationCode({ user, code }) {
  if (!user || !ADMIN_ROLES.has(user.role) || SUPER_ROLES.has(user.role) && !user.trainerId) {
    if (!user?.trainerId) throw new Error('Somente personal pode ativar código de plano diretamente. Dev pode criar/cancelar códigos pelo painel.');
  }
  const trainerId = user.trainerId;
  const validation = activationCodeValidation({ workspaceId: user.workspaceId, code, user, trainerId });
  if (!validation.valid) throw new Error(validation.reason);
  const now = nowISO();
  const expiresAt = new Date(Date.now() + Number(validation.code.duration_days || 30) * 86400000).toISOString();
  const planMapped = mapRows([validation.plan])[0];
  const existing = get('SELECT * FROM platform_subscriptions WHERE workspace_id=? AND trainer_id=? ORDER BY created_at DESC LIMIT 1', [user.workspaceId, trainerId]);
  const subId = existing?.id || id('platform_sub');
  if (existing) {
    run('UPDATE platform_subscriptions SET platform_plan_id=?,plan_name=?,amount=?,status=?,source=?,activation_code_id=?,starts_at=?,expires_at=?,due_date=?,paid_at=?,payment_method=?,metadata=?,updated_at=? WHERE id=?', [validation.plan.id, validation.plan.name, 0, 'ativo', 'activation_code', validation.code.id, now, expiresAt, expiresAt.slice(0,10), now, 'activation_code', toJSON({ code: validation.code.code, durationDays: validation.code.duration_days }), now, subId]);
  } else {
    run('INSERT INTO platform_subscriptions (id,workspace_id,trainer_id,plan_name,amount,status,due_date,paid_at,mercado_pago_payment_id,created_at,updated_at,platform_plan_id,source,activation_code_id,starts_at,expires_at,payment_method,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [subId, user.workspaceId, trainerId, validation.plan.name, 0, 'ativo', expiresAt.slice(0,10), now, '', now, now, validation.plan.id, 'activation_code', validation.code.id, now, expiresAt, 'activation_code', toJSON({ code: validation.code.code, durationDays: validation.code.duration_days })]);
  }
  run('UPDATE platform_activation_codes SET used_count=used_count+1, status=CASE WHEN max_uses>0 AND used_count+1>=max_uses THEN ? ELSE status END, updated_at=? WHERE id=?', ['usado', now, validation.code.id]);
  const redemptionId = id('act_red');
  run('INSERT INTO activation_code_redemptions (id,workspace_id,activation_code_id,trainer_id,user_id,redeemed_at,subscription_id,metadata) VALUES (?,?,?,?,?,?,?,?)', [redemptionId, user.workspaceId, validation.code.id, trainerId, user.id, now, subId, toJSON({ plan: validation.plan.name, durationDays: validation.code.duration_days })]);
  run('UPDATE trainers SET platform_subscription_status=?, platform_plan_name=?, platform_plan_amount=?, payment_blocked_at=NULL WHERE id=?', ['ativo', validation.plan.name, Number(validation.plan.price || 0), trainerId]);
  paymentLog(user.workspaceId, subId, 'platform_activation', 'redeemed', user.id, { codeId: validation.code.id, code: validation.code.code, plan: validation.plan.name, expiresAt });
  audit(user, 'platform_activation_code_redeemed', 'platform_subscription', subId, `Código ${validation.code.code} ativou ${validation.plan.name} até ${expiresAt.slice(0,10)}.`);
  databaseAdapter.mirror('platform_subscriptions', { id: subId, workspace_id: user.workspaceId, trainer_id: trainerId, platform_plan_id: validation.plan.id, plan_name: validation.plan.name, amount: 0, status: 'ativo', source: 'activation_code', activation_code_id: validation.code.id, starts_at: now, expires_at: expiresAt, payment_method: 'activation_code', created_at: existing?.created_at || now, updated_at: now }, { workspaceId: user.workspaceId, entityId: subId }).catch(() => {});
  return { subscriptionId: subId, plan: { ...planMapped, resources: json(validation.plan.resources_json, []), limitations: json(validation.plan.limitations_json, []) }, expiresAt, durationDays: Number(validation.code.duration_days || 30), redemptionId };
}
function studentBadges(workspaceId, studentId) {
  return mapRows(all('SELECT * FROM badges WHERE workspace_id=? AND student_id=? ORDER BY created_at DESC', [workspaceId, studentId]));
}
function seedBadgeIfMissing(workspaceId, studentId, key, name, icon, description, rarity, unlocked) {
  if (!studentId || get('SELECT id FROM badges WHERE workspace_id=? AND student_id=? AND key=?', [workspaceId, studentId, key])) return;
  run('INSERT INTO badges (id,workspace_id,student_id,key,name,icon,description,criteria,rarity,unlocked_at,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [id('badge'), workspaceId, studentId, key, name, icon, description, description, rarity, unlocked ? nowISO() : '', unlocked ? 'desbloqueada' : 'bloqueada', nowISO()]);
}
function quickHabitFeedback(quick = {}) {
  const positive = ['done','good','high','balanced','completed','ok'];
  let score = 0;
  for (const value of Object.values(quick)) {
    const text = String(value || '').toLowerCase();
    if (positive.some(p => text.includes(p))) score += 2;
    else if (text.includes('middle') || text.includes('near') || text.includes('medio') || text.includes('razoavel')) score += 1;
  }
  const feedback = score >= 14 ? 'Excelente. Você manteve uma rotina forte hoje.' : score >= 8 ? 'Bom esforço. O importante é continuar ajustando.' : 'Tudo bem. Um dia difícil não define sua evolução.';
  return { score, feedback };
}
function paymentLog(workspaceId, paymentId, type, action, userId, metadata = {}) {
  run('INSERT INTO payment_logs (id,workspace_id,payment_id,type,action,user_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)', [id('paylog'), workspaceId, paymentId, type, action, userId || 'system', toJSON(metadata), nowISO()]);
}

function googleConnectionFor(user) {
  if (!user) return null;
  if (SUPER_ROLES.has(user.role)) return get('SELECT * FROM google_connections WHERE workspace_id=? AND status=? ORDER BY updated_at DESC LIMIT 1', [user.workspaceId, 'connected']);
  return get('SELECT * FROM google_connections WHERE workspace_id=? AND user_id=? AND status=? LIMIT 1', [user.workspaceId, user.id, 'connected']);
}

async function googleAccessFor(user) {
  const connection = googleConnectionFor(user);
  if (!connection) throw new Error('Google Calendar não conectado. Conecte a integração no painel.');
  let accessToken = decryptSecret(connection.access_token_encrypted);
  const refreshToken = decryptSecret(connection.refresh_token_encrypted);
  const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
  if (!accessToken || (expiresAt && expiresAt < Date.now() + 90_000)) {
    const refreshed = await refreshGoogleToken(refreshToken);
    accessToken = refreshed.access_token;
    const nextExpires = refreshed.expires_in ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString() : connection.expires_at;
    run('UPDATE google_connections SET access_token_encrypted=?, expires_at=?, updated_at=? WHERE id=?', [encryptSecret(accessToken), nextExpires, nowISO(), connection.id]);
  }
  return { connection, accessToken };
}

function scheduleDateTime(schedule) {
  const duration = Number(schedule.duration_minutes || 60);
  const date = String(schedule.date || new Date().toISOString().slice(0, 10));
  const time = String(schedule.time || '09:00');
  const start = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}`);
  const end = new Date(start.getTime() + duration * 60_000);
  return { start, end, duration };
}

async function createMeetForSchedule(user, scheduleId) {
  const schedule = get('SELECT * FROM schedules WHERE id=?', [scheduleId]);
  if (!schedule || !assertWorkspace(user, schedule.workspace_id)) throw Object.assign(new Error('Agendamento não encontrado.'), { status: 404 });
  if (!ADMIN_ROLES.has(user.role) && !SUPER_ROLES.has(user.role)) throw Object.assign(new Error('Sem permissão para criar evento.'), { status: 403 });
  const student = get('SELECT * FROM students WHERE id=?', [schedule.student_id]);
  const { connection, accessToken } = await googleAccessFor(user);
  const { start, end } = scheduleDateTime(schedule);
  const event = await createGoogleCalendarEvent({
    accessToken,
    calendarId: connection.calendar_id || 'primary',
    event: {
      summary: schedule.title || 'Aula FitPro Elite',
      description: `${schedule.notes || 'Acompanhamento FitPro Elite'}\n\nAluno: ${student?.name || '-'}\nStatus: ${schedule.status || '-'}`,
      start: { dateTime: start.toISOString(), timeZone: process.env.GOOGLE_TIMEZONE || 'America/Sao_Paulo' },
      end: { dateTime: end.toISOString(), timeZone: process.env.GOOGLE_TIMEZONE || 'America/Sao_Paulo' },
      attendees: student?.email ? [{ email: student.email, displayName: student.name }] : [],
      conferenceData: {
        createRequest: {
          requestId: `${schedule.id}-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    }
  });
  const meetLink = event.hangoutLink || event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri || '';
  const eventId = id('cal');
  run('UPDATE schedules SET google_event_id=?, google_meet_link=?, google_html_link=?, online_link=COALESCE(NULLIF(online_link,\'\'),?), sync_status=? WHERE id=?', [event.id || '', meetLink, event.htmlLink || '', meetLink, 'google_synced', schedule.id]);
  run('INSERT INTO calendar_events (id,workspace_id,schedule_id,trainer_id,student_id,provider,provider_event_id,title,starts_at,ends_at,meet_link,html_link,status,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [eventId, schedule.workspace_id, schedule.id, schedule.trainer_id, schedule.student_id, 'google', event.id || '', schedule.title || 'Aula FitPro', start.toISOString(), end.toISOString(), meetLink, event.htmlLink || '', 'created', toJSON({ google: { id: event.id, status: event.status } }), nowISO(), nowISO()]);
  audit(user, 'google_event_created', 'schedule', schedule.id, `Evento Google criado. Meet: ${meetLink || 'não retornado'}`);
  if (student?.user_id) notify(schedule.workspace_id, student.user_id, 'Aula online criada', meetLink ? `Link Google Meet: ${meetLink}` : 'Evento Google criado para sua aula.');
  return { event, meetLink, htmlLink: event.htmlLink || '', bootstrap: bootstrap(user) };
}


const WORKOUT_TEMPLATES = [
  { key: 'iniciante_academia_3x', title: 'Iniciante academia 3x', objective: 'saude_geral', level: 'iniciante', frequency: '3x por semana', days: [
    { name: 'Treino A', focus: 'Full body adaptação', muscleGroup: 'corpo todo', exercises: [
      { name: 'Leg press', muscleGroup: 'quadríceps', category: 'força', equipment: 'máquina', sets: '3', reps: '10-12', rest: '60s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Carga confortável e execução controlada.' },
      { name: 'Puxada frontal', muscleGroup: 'costas', category: 'hipertrofia', equipment: 'cabo/polia', sets: '3', reps: '10-12', rest: '60s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Manter tronco estável.' },
      { name: 'Supino máquina', muscleGroup: 'peito', category: 'hipertrofia', equipment: 'máquina', sets: '3', reps: '10-12', rest: '60s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Não travar cotovelos.' }
    ] },
    { name: 'Treino B', focus: 'Pernas + core', muscleGroup: 'pernas', exercises: [
      { name: 'Agachamento no banco', muscleGroup: 'quadríceps', category: 'força', equipment: 'peso corporal', sets: '3', reps: '10', rest: '60s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Sentar e levantar com controle.' },
      { name: 'Mesa flexora', muscleGroup: 'posteriores', category: 'hipertrofia', equipment: 'máquina', sets: '3', reps: '12', rest: '60s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Evitar impulso.' },
      { name: 'Prancha', muscleGroup: 'core', category: 'core', equipment: 'colchonete', sets: '3', reps: '30s', rest: '45s', rpe: '6', rir: '-', method: 'isometria', notes: 'Manter coluna neutra.' }
    ] },
    { name: 'Treino C', focus: 'Superiores + cardio leve', muscleGroup: 'corpo todo', exercises: [
      { name: 'Remada baixa', muscleGroup: 'costas', category: 'hipertrofia', equipment: 'cabo/polia', sets: '3', reps: '10-12', rest: '60s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Puxar com as costas, não com o pescoço.' },
      { name: 'Desenvolvimento halteres', muscleGroup: 'ombros', category: 'força', equipment: 'halteres', sets: '3', reps: '10', rest: '60s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Amplitude confortável.' },
      { name: 'Esteira leve', muscleGroup: 'cardio', category: 'cardio', equipment: 'esteira', sets: '1', reps: '15min', rest: '-', rpe: '5', rir: '-', method: 'cardio leve', notes: 'Ritmo que permita conversar.' }
    ] }
  ]},
  { key: 'hipertrofia_abc', title: 'Hipertrofia ABC', objective: 'hipertrofia', level: 'intermediario', frequency: '3x por semana', days: [
    { name: 'Treino A', focus: 'Peito, ombros e tríceps', muscleGroup: 'peito', exercises: [
      { name: 'Supino reto', muscleGroup: 'peito', category: 'hipertrofia', equipment: 'barra', sets: '4', reps: '8-12', rest: '90s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Priorizar técnica antes de carga.' },
      { name: 'Desenvolvimento', muscleGroup: 'ombros', category: 'hipertrofia', equipment: 'halteres', sets: '3', reps: '8-12', rest: '75s', rpe: '8', rir: '2', method: 'tradicional', notes: 'Evitar compensação lombar.' },
      { name: 'Tríceps corda', muscleGroup: 'tríceps', category: 'hipertrofia', equipment: 'cabo/polia', sets: '3', reps: '10-15', rest: '60s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Cotovelos estáveis.' }
    ]},
    { name: 'Treino B', focus: 'Costas e bíceps', muscleGroup: 'costas', exercises: [
      { name: 'Puxada frontal', muscleGroup: 'costas', category: 'hipertrofia', equipment: 'cabo/polia', sets: '4', reps: '8-12', rest: '90s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Controle escapular.' },
      { name: 'Remada baixa', muscleGroup: 'costas', category: 'hipertrofia', equipment: 'cabo/polia', sets: '3', reps: '10-12', rest: '75s', rpe: '8', rir: '2', method: 'tradicional', notes: 'Não balançar tronco.' },
      { name: 'Rosca direta', muscleGroup: 'bíceps', category: 'hipertrofia', equipment: 'barra', sets: '3', reps: '10-12', rest: '60s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Subida e descida controladas.' }
    ]},
    { name: 'Treino C', focus: 'Pernas completas', muscleGroup: 'pernas', exercises: [
      { name: 'Agachamento livre', muscleGroup: 'quadríceps', category: 'força', equipment: 'barra', sets: '4', reps: '6-10', rest: '120s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Manter coluna neutra.' },
      { name: 'Leg press', muscleGroup: 'quadríceps', category: 'hipertrofia', equipment: 'máquina', sets: '4', reps: '10-12', rest: '90s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Evitar amplitude dolorosa.' },
      { name: 'Elevação pélvica', muscleGroup: 'glúteos', category: 'hipertrofia', equipment: 'barra', sets: '3', reps: '10-12', rest: '75s', rpe: '8', rir: '2', method: 'tradicional', notes: 'Pausar no topo.' }
    ]}
  ]},
  { key: 'treino_sem_equipamento', title: 'Treino sem equipamento', objective: 'condicionamento', level: 'iniciante', frequency: '3x por semana', days: [
    { name: 'Full body casa', focus: 'Corpo todo sem equipamentos', muscleGroup: 'corpo todo', exercises: [
      { name: 'Agachamento livre', muscleGroup: 'quadríceps', category: 'força', equipment: 'peso corporal', sets: '3', reps: '12-15', rest: '45s', rpe: '6', rir: '3', method: 'circuito', notes: 'Controlar joelhos e coluna.' },
      { name: 'Flexão inclinada', muscleGroup: 'peito', category: 'força', equipment: 'peso corporal', sets: '3', reps: '8-12', rest: '45s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Usar apoio alto se necessário.' },
      { name: 'Prancha', muscleGroup: 'core', category: 'core', equipment: 'colchonete', sets: '3', reps: '25-40s', rest: '45s', rpe: '6', rir: '-', method: 'isometria', notes: 'Interromper se houver dor lombar.' }
    ]}
  ]}
];

WORKOUT_TEMPLATES.push(...[
  { key: 'iniciante_casa_3x', title: 'Iniciante casa 3x', objective: 'saúde geral', level: 'iniciante', frequency: '3x por semana', days: [
    { name: 'Treino A', focus: 'Adaptação sem equipamentos', muscleGroup: 'corpo todo', exercises: [
      { name: 'Agachamento livre', muscleGroup: 'quadríceps', category: 'força', equipment: 'peso corporal', sets: '3', reps: '10-12', rest: '45s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Descer até amplitude confortável.' },
      { name: 'Flexão na parede', muscleGroup: 'peito', category: 'força', equipment: 'peso corporal', sets: '3', reps: '8-12', rest: '45s', rpe: '5', rir: '3', method: 'tradicional', notes: 'Ajustar inclinação conforme nível.' },
      { name: 'Ponte de glúteos', muscleGroup: 'glúteos', category: 'resistência', equipment: 'colchonete', sets: '3', reps: '12-15', rest: '45s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Pausar 1s no topo.' }
    ]},
    { name: 'Treino B', focus: 'Core e mobilidade', muscleGroup: 'core', exercises: [
      { name: 'Prancha joelhos', muscleGroup: 'core', category: 'core', equipment: 'colchonete', sets: '3', reps: '20-30s', rest: '45s', rpe: '6', rir: '-', method: 'isometria', notes: 'Parar se houver dor lombar.' },
      { name: 'Bird dog', muscleGroup: 'lombar', category: 'mobilidade', equipment: 'colchonete', sets: '3', reps: '8 cada lado', rest: '30s', rpe: '5', rir: '3', method: 'tradicional', notes: 'Controle e estabilidade.' },
      { name: 'Alongamento dinâmico', muscleGroup: 'mobilidade', category: 'mobilidade', equipment: 'peso corporal', sets: '1', reps: '8min', rest: '-', rpe: '4', rir: '-', method: 'mobilidade', notes: 'Sem forçar amplitude.' }
    ]},
    { name: 'Treino C', focus: 'Condicionamento leve', muscleGroup: 'corpo todo', exercises: [
      { name: 'Polichinelo adaptado', muscleGroup: 'cardio', category: 'cardio', equipment: 'peso corporal', sets: '4', reps: '30s', rest: '30s', rpe: '6', rir: '-', method: 'circuito', notes: 'Opção sem salto se necessário.' },
      { name: 'Afundo curto', muscleGroup: 'quadríceps', category: 'força', equipment: 'peso corporal', sets: '3', reps: '8 cada perna', rest: '45s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Usar apoio se precisar.' },
      { name: 'Abdominal dead bug', muscleGroup: 'core', category: 'core', equipment: 'colchonete', sets: '3', reps: '8 cada lado', rest: '30s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Lombar estável.' }
    ]}
  ]},
  { key: 'hipertrofia_abcd', title: 'Hipertrofia ABCD', objective: 'hipertrofia', level: 'intermediario', frequency: '4x por semana', days: [
    { name: 'Treino A', focus: 'Peito e tríceps', muscleGroup: 'peito', exercises: [
      { name: 'Supino inclinado halteres', muscleGroup: 'peito', category: 'hipertrofia', equipment: 'halteres', sets: '4', reps: '8-12', rest: '90s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Controle total na descida.' },
      { name: 'Crucifixo máquina', muscleGroup: 'peito', category: 'hipertrofia', equipment: 'máquina', sets: '3', reps: '12-15', rest: '60s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Evitar amplitude dolorosa.' },
      { name: 'Tríceps testa', muscleGroup: 'tríceps', category: 'hipertrofia', equipment: 'barra', sets: '3', reps: '10-12', rest: '60s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Cotovelos alinhados.' }
    ]},
    { name: 'Treino B', focus: 'Costas e bíceps', muscleGroup: 'costas', exercises: [
      { name: 'Barra assistida', muscleGroup: 'costas', category: 'força', equipment: 'máquina', sets: '4', reps: '6-10', rest: '120s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Amplitude controlada.' },
      { name: 'Remada unilateral', muscleGroup: 'costas', category: 'hipertrofia', equipment: 'halteres', sets: '3', reps: '10-12', rest: '75s', rpe: '8', rir: '2', method: 'tradicional', notes: 'Não rotacionar o tronco.' },
      { name: 'Rosca alternada', muscleGroup: 'bíceps', category: 'hipertrofia', equipment: 'halteres', sets: '3', reps: '10-12', rest: '60s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Sem balanço.' }
    ]},
    { name: 'Treino C', focus: 'Pernas anterior', muscleGroup: 'quadríceps', exercises: [
      { name: 'Agachamento guiado', muscleGroup: 'quadríceps', category: 'força', equipment: 'máquina', sets: '4', reps: '8-10', rest: '120s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Joelhos acompanhando a ponta do pé.' },
      { name: 'Cadeira extensora', muscleGroup: 'quadríceps', category: 'hipertrofia', equipment: 'máquina', sets: '3', reps: '12-15', rest: '60s', rpe: '8', rir: '1', method: 'drop-set', notes: 'Drop opcional na última série.' },
      { name: 'Panturrilha em pé', muscleGroup: 'panturrilhas', category: 'hipertrofia', equipment: 'máquina', sets: '4', reps: '12-15', rest: '45s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Pausar no pico.' }
    ]},
    { name: 'Treino D', focus: 'Posterior e glúteos', muscleGroup: 'posteriores', exercises: [
      { name: 'Levantamento terra romeno', muscleGroup: 'posteriores', category: 'força', equipment: 'barra', sets: '4', reps: '8-10', rest: '120s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Coluna neutra sempre.' },
      { name: 'Mesa flexora', muscleGroup: 'posteriores', category: 'hipertrofia', equipment: 'máquina', sets: '3', reps: '10-12', rest: '75s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Controle excêntrico.' },
      { name: 'Abdução de quadril', muscleGroup: 'glúteos', category: 'hipertrofia', equipment: 'máquina', sets: '3', reps: '15-20', rest: '45s', rpe: '8', rir: '1-2', method: 'tradicional', notes: 'Sem impulso.' }
    ]}
  ]},
  { key: 'emagrecimento_cardio', title: 'Emagrecimento + cardio', objective: 'emagrecimento', level: 'iniciante', frequency: '4x por semana', days: [
    { name: 'Força A', focus: 'Full body + cardio leve', muscleGroup: 'corpo todo', exercises: [
      { name: 'Leg press', muscleGroup: 'quadríceps', category: 'força', equipment: 'máquina', sets: '3', reps: '12-15', rest: '60s', rpe: '7', rir: '2', method: 'circuito', notes: 'Ritmo contínuo com técnica.' },
      { name: 'Puxada frontal', muscleGroup: 'costas', category: 'força', equipment: 'cabo/polia', sets: '3', reps: '12', rest: '60s', rpe: '7', rir: '2', method: 'circuito', notes: 'Controle e postura.' },
      { name: 'Esteira inclinada', muscleGroup: 'cardio', category: 'cardio', equipment: 'esteira', sets: '1', reps: '20min', rest: '-', rpe: '6', rir: '-', method: 'cardio moderado', notes: 'Zona confortável.' }
    ]},
    { name: 'Cardio + core', focus: 'Gasto calórico e estabilidade', muscleGroup: 'cardio', exercises: [
      { name: 'Bicicleta ergométrica', muscleGroup: 'cardio', category: 'cardio', equipment: 'bicicleta', sets: '1', reps: '25min', rest: '-', rpe: '6', rir: '-', method: 'cardio moderado', notes: 'Ritmo contínuo.' },
      { name: 'Prancha', muscleGroup: 'core', category: 'core', equipment: 'colchonete', sets: '3', reps: '30s', rest: '45s', rpe: '6', rir: '-', method: 'isometria', notes: 'Core firme.' },
      { name: 'Abdominal infra adaptado', muscleGroup: 'abdômen', category: 'core', equipment: 'colchonete', sets: '3', reps: '10-12', rest: '45s', rpe: '6', rir: '2', method: 'tradicional', notes: 'Sem puxar lombar.' }
    ]}
  ]},
  { key: 'full_body_3x', title: 'Full body 3x', objective: 'saúde geral', level: 'iniciante', frequency: '3x por semana', days: [
    { name: 'Full body A', focus: 'Base técnica', muscleGroup: 'corpo todo', exercises: [
      { name: 'Agachamento goblet', muscleGroup: 'quadríceps', category: 'força', equipment: 'halteres', sets: '3', reps: '10', rest: '60s', rpe: '7', rir: '2', method: 'tradicional', notes: 'Halter próximo ao corpo.' },
      { name: 'Remada curvada halteres', muscleGroup: 'costas', category: 'força', equipment: 'halteres', sets: '3', reps: '10-12', rest: '60s', rpe: '7', rir: '2', method: 'tradicional', notes: 'Escápulas ativas.' },
      { name: 'Supino halteres', muscleGroup: 'peito', category: 'força', equipment: 'halteres', sets: '3', reps: '10-12', rest: '60s', rpe: '7', rir: '2', method: 'tradicional', notes: 'Amplitude confortável.' }
    ]},
    { name: 'Full body B', focus: 'Posterior e ombros', muscleGroup: 'corpo todo', exercises: [
      { name: 'Terra romeno halteres', muscleGroup: 'posteriores', category: 'força', equipment: 'halteres', sets: '3', reps: '10', rest: '75s', rpe: '7', rir: '2', method: 'tradicional', notes: 'Quadril para trás.' },
      { name: 'Desenvolvimento halteres', muscleGroup: 'ombros', category: 'força', equipment: 'halteres', sets: '3', reps: '10', rest: '60s', rpe: '7', rir: '2', method: 'tradicional', notes: 'Evitar dor no ombro.' },
      { name: 'Prancha lateral', muscleGroup: 'core', category: 'core', equipment: 'colchonete', sets: '3', reps: '20s cada lado', rest: '45s', rpe: '6', rir: '-', method: 'isometria', notes: 'Quadril alinhado.' }
    ]},
    { name: 'Full body C', focus: 'Condicionamento controlado', muscleGroup: 'corpo todo', exercises: [
      { name: 'Afundo alternado', muscleGroup: 'quadríceps', category: 'força', equipment: 'peso corporal', sets: '3', reps: '10 cada perna', rest: '60s', rpe: '7', rir: '2', method: 'tradicional', notes: 'Usar apoio se necessário.' },
      { name: 'Puxada elástico', muscleGroup: 'costas', category: 'força', equipment: 'elástico', sets: '3', reps: '12-15', rest: '45s', rpe: '7', rir: '2', method: 'tradicional', notes: 'Controle total.' },
      { name: 'Caminhada acelerada', muscleGroup: 'cardio', category: 'cardio', equipment: 'peso corporal', sets: '1', reps: '20min', rest: '-', rpe: '6', rir: '-', method: 'cardio leve', notes: 'Ritmo sustentável.' }
    ]}
  ]},
  { key: 'mobilidade_correcao', title: 'Mobilidade e correção', objective: 'mobilidade', level: 'iniciante', frequency: '3x por semana', days: [
    { name: 'Mobilidade global', focus: 'Quadril, coluna e ombros', muscleGroup: 'mobilidade', exercises: [
      { name: 'Mobilidade de quadril 90/90', muscleGroup: 'mobilidade', category: 'mobilidade', equipment: 'colchonete', sets: '2', reps: '8 cada lado', rest: '30s', rpe: '4', rir: '-', method: 'mobilidade', notes: 'Sem dor, amplitude gradual.' },
      { name: 'Rotação torácica', muscleGroup: 'mobilidade', category: 'mobilidade', equipment: 'colchonete', sets: '2', reps: '8 cada lado', rest: '30s', rpe: '4', rir: '-', method: 'mobilidade', notes: 'Respirar durante o movimento.' },
      { name: 'Face pull elástico', muscleGroup: 'ombros', category: 'corretivo', equipment: 'elástico', sets: '3', reps: '12-15', rest: '45s', rpe: '5', rir: '3', method: 'tradicional', notes: 'Escápulas para trás e baixo.' }
    ]}
  ]},
  { key: 'retorno_apos_pausa', title: 'Retorno após pausa', objective: 'retorno após pausa', level: 'retorno após inatividade', frequency: '3x por semana', days: [
    { name: 'Retorno A', focus: 'Reintrodução leve', muscleGroup: 'corpo todo', exercises: [
      { name: 'Bicicleta leve', muscleGroup: 'cardio', category: 'cardio', equipment: 'bicicleta', sets: '1', reps: '10min', rest: '-', rpe: '4', rir: '-', method: 'aquecimento', notes: 'Aquecimento sem fadiga.' },
      { name: 'Leg press leve', muscleGroup: 'quadríceps', category: 'força', equipment: 'máquina', sets: '2', reps: '12', rest: '75s', rpe: '5', rir: '4', method: 'tradicional', notes: 'Priorizar confiança e técnica.' },
      { name: 'Remada baixa leve', muscleGroup: 'costas', category: 'força', equipment: 'cabo/polia', sets: '2', reps: '12', rest: '75s', rpe: '5', rir: '4', method: 'tradicional', notes: 'Sem chegar perto da falha.' }
    ]}
  ]},
  { key: 'forca_basico', title: 'Força básico', objective: 'força', level: 'intermediario', frequency: '3x por semana', days: [
    { name: 'Força A', focus: 'Agachamento e empurrar', muscleGroup: 'corpo todo', exercises: [
      { name: 'Agachamento livre', muscleGroup: 'quadríceps', category: 'força', equipment: 'barra', sets: '5', reps: '5', rest: '150s', rpe: '7', rir: '2', method: 'tradicional', notes: 'Técnica acima da carga.' },
      { name: 'Supino reto', muscleGroup: 'peito', category: 'força', equipment: 'barra', sets: '5', reps: '5', rest: '150s', rpe: '7', rir: '2', method: 'tradicional', notes: 'Controle e segurança.' },
      { name: 'Prancha com carga leve', muscleGroup: 'core', category: 'core', equipment: 'colchonete', sets: '3', reps: '30s', rest: '60s', rpe: '7', rir: '-', method: 'isometria', notes: 'Somente se técnica estiver perfeita.' }
    ]}
  ]},
  { key: 'treino_express_30', title: 'Treino express 30 minutos', objective: 'condicionamento', level: 'iniciante', frequency: '3x por semana', days: [
    { name: 'Express A', focus: 'Circuito rápido', muscleGroup: 'corpo todo', exercises: [
      { name: 'Agachamento livre', muscleGroup: 'quadríceps', category: 'força', equipment: 'peso corporal', sets: '3', reps: '12', rest: '30s', rpe: '7', rir: '2', method: 'circuito', notes: 'Movimento fluido.' },
      { name: 'Remada elástico', muscleGroup: 'costas', category: 'força', equipment: 'elástico', sets: '3', reps: '15', rest: '30s', rpe: '7', rir: '2', method: 'circuito', notes: 'Manter postura.' },
      { name: 'Mountain climber adaptado', muscleGroup: 'cardio', category: 'HIIT', equipment: 'peso corporal', sets: '3', reps: '30s', rest: '30s', rpe: '7', rir: '-', method: 'HIIT', notes: 'Sem perder técnica.' }
    ]}
  ]},
  { key: 'elastico_3x', title: 'Treino com elástico', objective: 'saúde geral', level: 'iniciante', frequency: '3x por semana', days: [
    { name: 'Elástico A', focus: 'Força funcional', muscleGroup: 'corpo todo', exercises: [
      { name: 'Agachamento com elástico', muscleGroup: 'quadríceps', category: 'força', equipment: 'elástico', sets: '3', reps: '12-15', rest: '45s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Joelhos estáveis.' },
      { name: 'Puxada elástico', muscleGroup: 'costas', category: 'força', equipment: 'elástico', sets: '3', reps: '12-15', rest: '45s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Escápulas ativas.' },
      { name: 'Elevação lateral elástico', muscleGroup: 'ombros', category: 'hipertrofia', equipment: 'elástico', sets: '3', reps: '12-15', rest: '45s', rpe: '6', rir: '3', method: 'tradicional', notes: 'Sem elevar trapézio.' }
    ]}
  ]},
  { key: 'cardio_core', title: 'Cardio + core', objective: 'condicionamento', level: 'iniciante', frequency: '3x por semana', days: [
    { name: 'Cardio Core', focus: 'Resistência e estabilidade', muscleGroup: 'cardio', exercises: [
      { name: 'Esteira intervalada leve', muscleGroup: 'cardio', category: 'cardio', equipment: 'esteira', sets: '8', reps: '1min forte/1min leve', rest: '-', rpe: '7', rir: '-', method: 'HIIT', notes: 'Sem sprint máximo.' },
      { name: 'Prancha', muscleGroup: 'core', category: 'core', equipment: 'colchonete', sets: '3', reps: '30-45s', rest: '45s', rpe: '6', rir: '-', method: 'isometria', notes: 'Controle respiratório.' },
      { name: 'Abdominal bicicleta', muscleGroup: 'abdômen', category: 'core', equipment: 'colchonete', sets: '3', reps: '12 cada lado', rest: '45s', rpe: '6', rir: '2', method: 'tradicional', notes: 'Sem puxar pescoço.' }
    ]}
  ]},
  { key: 'adaptacao_7_dias', title: 'Adaptação 7 dias', objective: 'saúde geral', level: 'iniciante', frequency: '7 dias', days: [
    { name: 'Dia 1', focus: 'Boas-vindas e movimento leve', muscleGroup: 'corpo todo', exercises: [
      { name: 'Caminhada leve', muscleGroup: 'cardio', category: 'cardio', equipment: 'peso corporal', sets: '1', reps: '15min', rest: '-', rpe: '4', rir: '-', method: 'cardio leve', notes: 'Conhecer o ritmo do aluno.' },
      { name: 'Mobilidade geral', muscleGroup: 'mobilidade', category: 'mobilidade', equipment: 'colchonete', sets: '1', reps: '8min', rest: '-', rpe: '4', rir: '-', method: 'mobilidade', notes: 'Sem dor.' },
      { name: 'Checklist inicial', muscleGroup: 'corpo todo', category: 'educativo', equipment: 'peso corporal', sets: '1', reps: '5min', rest: '-', rpe: '1', rir: '-', method: 'orientação', notes: 'Registrar feedback e restrições.' }
    ]}
  ]}
]);

function workoutTemplateByKey(key) { return WORKOUT_TEMPLATES.find(t => t.key === key) || null; }

function defaultExerciseLibraryItems(workspaceId) {
  const seen = new Set();
  const items = [];
  for (const template of WORKOUT_TEMPLATES) {
    for (const day of (template.days || [])) {
      for (const ex of (day.exercises || [])) {
        const key = String(ex.name || '').toLowerCase().trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        items.push({
          id: `tpl_${key.replace(/[^a-z0-9]+/gi, '_')}`,
          workspaceId,
          trainerId: '',
          name: ex.name,
          description: ex.notes || `Modelo FitPro: ${template.title}`,
          muscleGroup: ex.muscleGroup || day.muscleGroup || '',
          category: ex.category || '',
          equipment: ex.equipment || '',
          level: template.level || 'iniciante',
          videoUrl: '',
          imageUrl: '',
          executionNotes: ex.notes || '',
          commonMistakes: 'Evitar compensações, pressa e amplitude dolorosa.',
          substitutions: ex.substitutions || '',
          cautions: ex.cautions || ex.notes || 'Interromper se houver dor/desconforto fora do normal.',
          source: 'template_fitpro',
          createdAt: '',
          updatedAt: ''
        });
      }
    }
  }
  return items;
}

function exerciseLibraryRows(workspaceId, filters = {}) {
  const dbItems = mapRows(all('SELECT * FROM exercise_library WHERE workspace_id=? ORDER BY name LIMIT 500', [workspaceId])).map(item => ({ ...item, source: 'custom' }));
  const merged = [...dbItems];
  const seen = new Set(dbItems.map(item => String(item.name || '').toLowerCase().trim()));
  for (const item of defaultExerciseLibraryItems(workspaceId)) {
    const key = String(item.name || '').toLowerCase().trim();
    if (!seen.has(key)) merged.push(item);
  }
  const q = String(filters.q || '').toLowerCase().trim();
  const muscleGroup = String(filters.muscleGroup || '').toLowerCase().trim();
  const equipment = String(filters.equipment || '').toLowerCase().trim();
  const level = String(filters.level || '').toLowerCase().trim();
  const category = String(filters.category || '').toLowerCase().trim();
  return merged.filter(item => {
    const haystack = [item.name, item.description, item.muscleGroup, item.category, item.equipment, item.level, item.executionNotes, item.cautions].join(' ').toLowerCase();
    if (q && !haystack.includes(q)) return false;
    if (muscleGroup && !String(item.muscleGroup || '').toLowerCase().includes(muscleGroup)) return false;
    if (equipment && !String(item.equipment || '').toLowerCase().includes(equipment)) return false;
    if (level && !String(item.level || '').toLowerCase().includes(level)) return false;
    if (category && !String(item.category || '').toLowerCase().includes(category)) return false;
    return true;
  }).sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')).slice(0, 500);
}

function workoutInsights(workspaceId, user) {
  if (user.role === 'student') {
    const activePlan = get('SELECT id,title,review_date,status FROM workout_plans WHERE workspace_id=? AND student_id=? AND status=? ORDER BY updated_at DESC LIMIT 1', [workspaceId, user.studentId, 'ativo']);
    const lastLog = get('SELECT * FROM workout_logs WHERE workspace_id=? AND student_id=? ORDER BY created_at DESC LIMIT 1', [workspaceId, user.studentId]);
    return {
      hasActivePlan: Boolean(activePlan),
      activePlanTitle: activePlan?.title || '',
      lastWorkoutAt: lastLog?.created_at || '',
      painReported: lastLog?.pain_reported || '',
      guidance: activePlan ? 'Sua ficha ativa está disponível para execução e registro.' : 'Você ainda não possui ficha ativa. Fale com seu personal.'
    };
  }
  const students = all('SELECT id,name,status FROM students WHERE workspace_id=?', [workspaceId]);
  const activePlans = all('SELECT id,student_id,review_date,status,title FROM workout_plans WHERE workspace_id=? AND status IN (?,?,?)', [workspaceId, 'ativo', 'rascunho', 'em_revisao']);
  const activeStudentIds = new Set(activePlans.filter(p => p.status === 'ativo').map(p => p.student_id).filter(Boolean));
  const today = new Date().toISOString().slice(0, 10);
  const expiredPlans = activePlans.filter(p => p.review_date && p.review_date < today && p.status === 'ativo').length;
  const reviewPlans = activePlans.filter(p => p.status === 'em_revisao').length;
  const recentLogs = mapRows(all('SELECT * FROM workout_logs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 60', [workspaceId]));
  const painAlerts = recentLogs.filter(log => String(log.painReported || '').trim()).slice(0, 8);
  return {
    studentsWithoutPlan: students.filter(st => ['ativo','aprovado'].includes(st.status || '') && !activeStudentIds.has(st.id)).length,
    activePlans: activePlans.filter(p => p.status === 'ativo').length,
    draftPlans: activePlans.filter(p => p.status === 'rascunho').length,
    expiredPlans,
    reviewPlans,
    completedWorkouts: recentLogs.length,
    painAlerts,
    recentLogs: recentLogs.slice(0, 12)
  };
}

function buildWorkoutAiSuggestion(student, body = {}) {
  const objective = sanitizeText(body.objective || student?.goal || 'saúde geral', 100);
  const level = sanitizeText(body.level || student?.level || 'iniciante', 80);
  const location = sanitizeText(body.location || student?.training_place || 'academia completa', 120);
  const frequency = sanitizeText(body.frequencyPerWeek || '3x por semana', 80);
  const template = WORKOUT_TEMPLATES.find(t => String(t.objective).toLowerCase().includes(objective.toLowerCase()) && String(t.level).toLowerCase().includes(level.toLowerCase())) || WORKOUT_TEMPLATES.find(t => String(t.frequency).toLowerCase().includes(String(frequency).slice(0,1))) || WORKOUT_TEMPLATES[0];
  return {
    warning: 'Sugestão de apoio. A IA não substitui o personal, não prescreve sozinha e precisa de revisão profissional antes da publicação.',
    title: `${template.title} — ${student?.name || 'modelo'}`,
    objective,
    level,
    location,
    frequencyPerWeek: frequency,
    division: template.days.map(d => d.name).join(' / '),
    progressionRule: 'Se o aluno concluir todas as séries com boa técnica, sem dor e com RIR maior ou igual a 2, progredir carga ou repetições de forma gradual. Se houver dor/desconforto, manter ou regredir intensidade e revisar execução.',
    reviewFrequency: level.includes('inic') ? '14 dias' : '30 dias',
    safetyNotes: 'Checar restrições, sono, dor muscular e histórico de lesão antes de aumentar intensidade. Interromper exercícios com dor aguda.',
    days: template.days,
    checklist: [
      'Confirmar restrições físicas e disponibilidade do aluno.',
      'Validar exercícios com equipamento disponível.',
      'Definir carga inicial conservadora.',
      'Publicar somente após revisão do personal.',
      'Acompanhar primeiro feedback de dor/desconforto.'
    ]
  };
}

function workoutPlanRows(workspaceId, studentId = null) {
  const visibleStudentStatuses = ['ativo', 'active', 'publicado', 'publicada', 'published'];
  const params = studentId ? [workspaceId, studentId, ...visibleStudentStatuses] : [workspaceId];
  const where = studentId ? `workspace_id=? AND student_id=? AND status IN (${visibleStudentStatuses.map(() => '?').join(',')})` : 'workspace_id=?';
  return mapRows(all(`SELECT * FROM workout_plans WHERE ${where} ORDER BY updated_at DESC, created_at DESC`, params)).map(plan => ({
    ...plan,
    days: workoutDaysForPlan(plan.id),
    versions: mapRows(all('SELECT id,version,reason,created_at,changed_by FROM workout_plan_versions WHERE workout_plan_id=? ORDER BY version DESC LIMIT 5', [plan.id]))
  }));
}
function workoutDaysForPlan(planId) {
  return mapRows(all('SELECT * FROM workout_days WHERE workout_plan_id=? ORDER BY day_order', [planId])).map(day => ({
    ...day,
    exercises: mapRows(all('SELECT * FROM workout_exercises WHERE workout_day_id=? ORDER BY exercise_order', [day.id]))
  }));
}

function workoutDraftRows(workspaceId, trainerId = '') {
  const rows = trainerId
    ? all('SELECT * FROM workout_plan_drafts WHERE workspace_id=? AND trainer_id=? ORDER BY updated_at DESC LIMIT 40', [workspaceId, trainerId])
    : all('SELECT * FROM workout_plan_drafts WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 40', [workspaceId]);
  return mapRows(rows).map(row => ({ ...row, draft: json(row.draftJson || row.draft_json, {}) }));
}
function personalWorkoutTemplateRows(workspaceId, trainerId = '') {
  const rows = trainerId
    ? all('SELECT * FROM personal_workout_templates WHERE workspace_id=? AND trainer_id=? ORDER BY favorite DESC, updated_at DESC LIMIT 80', [workspaceId, trainerId])
    : all('SELECT * FROM personal_workout_templates WHERE workspace_id=? ORDER BY favorite DESC, updated_at DESC LIMIT 80', [workspaceId]);
  return mapRows(rows).map(row => ({ ...row, template: json(row.templateJson || row.template_json, {}) }));
}
function weeklyVolumeForPlan(planSnapshot = {}) {
  const totals = {};
  for (const day of (planSnapshot.days || [])) {
    for (const ex of (day.exercises || [])) {
      const group = String(ex.muscleGroup || ex.muscle_group || ex.category || 'outros').toLowerCase();
      const sets = Math.max(0, Number(String(ex.sets || '0').match(/\d+/)?.[0] || 0));
      totals[group] = (totals[group] || 0) + sets;
    }
  }
  const alerts = [];
  if ((totals.peito || 0) > (totals.costas || 0) + 6) alerts.push('Volume de peito acima de costas. Avalie equilíbrio postural.');
  if (!((totals.core || 0) + (totals['abdômen'] || 0))) alerts.push('Nenhum exercício claro de core/abdômen encontrado.');
  if ((totals.quadríceps || 0) + (totals.posteriores || 0) + (totals['glúteos'] || 0) > 28) alerts.push('Volume alto de pernas. Ajuste se o aluno for iniciante ou estiver em recuperação.');
  return { totals, alerts };
}
function workoutPlanSnapshot(planId) {
  const plan = mapRows(all('SELECT * FROM workout_plans WHERE id=?', [planId]))[0];
  if (!plan) return null;
  return { ...plan, days: workoutDaysForPlan(planId) };
}

function workoutExerciseContext(exerciseId, user) {
  const ex = get('SELECT e.*, d.workout_plan_id, d.id AS day_id, d.name AS day_name FROM workout_exercises e JOIN workout_days d ON d.id=e.workout_day_id WHERE e.id=?', [exerciseId]);
  if (!ex || !assertWorkspace(user, ex.workspace_id)) return null;
  const plan = get('SELECT * FROM workout_plans WHERE id=?', [ex.workout_plan_id]);
  if (!plan || !assertWorkspace(user, plan.workspace_id)) return null;
  return { ex, plan };
}
function versionWorkoutPlanAfterChange(user, planId, reason, now = nowISO()) {
  const plan = get('SELECT * FROM workout_plans WHERE id=?', [planId]);
  if (!plan) return null;
  const version = Number(plan.version || 1) + 1;
  run('UPDATE workout_plans SET version=?, updated_at=? WHERE id=?', [version, now, plan.id]);
  run('INSERT INTO workout_plan_versions (id,workspace_id,workout_plan_id,version,snapshot_json,changed_by,reason,created_at) VALUES (?,?,?,?,?,?,?,?)', [id('wver'), user.workspaceId, plan.id, version, toJSON(workoutPlanSnapshot(plan.id)), user.id, sanitizeText(reason, 300), now]);
  return { ...plan, version };
}
function validateWorkoutPayload(body, publish = false) {
  const errors = [];
  if (!body.title) errors.push('Informe título da ficha.');
  if (!body.objective && !body.goal) errors.push('Defina o objetivo principal.');
  if (!body.studentId && body.targetMode !== 'template') errors.push('Escolha um aluno ou salve como modelo.');
  const days = Array.isArray(body.days) ? body.days : [];
  if (publish && days.length < 1) errors.push('Adicione pelo menos um dia de treino.');
  if (publish && !days.some(d => Array.isArray(d.exercises) && d.exercises.length)) errors.push('Adicione pelo menos um exercício.');
  for (const day of days) {
    for (const ex of (day.exercises || [])) {
      if (!ex.name) errors.push('Todo exercício precisa de nome.');
      if (!ex.sets && !ex.duration) errors.push(`Defina séries ou tempo para ${ex.name || 'exercício'}.`);
      if (!ex.reps && !ex.duration) errors.push(`Defina repetições ou duração para ${ex.name || 'exercício'}.`);
    }
  }
  return [...new Set(errors)];
}
function planStatus(body) {
  const requested = String(body.status || '').toLowerCase();
  if (body.action === 'publish' || ['ativo','active','publicado','publicada','published'].includes(requested)) return 'ativo';
  if (body.action === 'template' || body.targetMode === 'template') return 'modelo';
  return body.status || 'rascunho';
}

function isoDateOnly(value = '') {
  if (!value) return '';
  const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}
function addDaysISO(baseDate = '', offset = 0) {
  const base = isoDateOnly(baseDate) || new Date().toISOString().slice(0, 10);
  const date = new Date(`${base}T00:00:00`);
  date.setDate(date.getDate() + Number(offset || 0));
  return date.toISOString().slice(0, 10);
}
function deriveDayDate(body, day, index) {
  return isoDateOnly(day.trainingDate || day.training_date || day.date) || (body.startDate ? addDaysISO(body.startDate, Number(day.dayNumber || day.day_number || day.order || index + 1) - 1) : '');
}
function deriveDayNumber(day, index) {
  return Number(day.dayNumber || day.day_number || day.order || day.dayOrder || day.day_order || index + 1);
}
function resolveTutorialUrl(exercise = {}) {
  return sanitizeText(exercise.videoUrl || exercise.video_url || exercise.youtubeUrl || exercise.youtube_url || exercise.tutorialUrl || exercise.tutorial_url || '', 500);
}
function youtubeSearchUrl(name = '') {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} execução correta`)}`;
}
function workoutCompletionsFor(workspaceId, studentId = '') {
  const rows = studentId
    ? all('SELECT * FROM workout_exercise_completions WHERE workspace_id=? AND student_id=? ORDER BY updated_at DESC LIMIT 500', [workspaceId, studentId])
    : all('SELECT * FROM workout_exercise_completions WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 800', [workspaceId]);
  return mapRows(rows);
}
function workoutDayProgressFor(workspaceId, studentId = '') {
  const rows = studentId
    ? all('SELECT * FROM workout_day_progress WHERE workspace_id=? AND student_id=? ORDER BY updated_at DESC LIMIT 300', [workspaceId, studentId])
    : all('SELECT * FROM workout_day_progress WHERE workspace_id=? ORDER BY updated_at DESC LIMIT 500', [workspaceId]);
  return mapRows(rows);
}
function recomputeWorkoutDayProgress({ user, plan, day, studentId, now = nowISO() }) {
  const total = Number(get('SELECT COUNT(*) AS total FROM workout_exercises WHERE workout_day_id=?', [day.id])?.total || 0);
  const completed = Number(get('SELECT COUNT(*) AS total FROM workout_exercise_completions WHERE workspace_id=? AND student_id=? AND workout_day_id=? AND completed=1', [user.workspaceId, studentId, day.id])?.total || 0);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const isCompleted = total > 0 && completed >= total;
  const existing = get('SELECT * FROM workout_day_progress WHERE workspace_id=? AND student_id=? AND workout_day_id=?', [user.workspaceId, studentId, day.id]);
  const completedAt = isCompleted ? (existing?.completed_at || now) : '';
  if (existing) run('UPDATE workout_day_progress SET total_exercises=?,completed_exercises=?,progress_percent=?,is_completed=?,completed_at=?,updated_at=? WHERE id=?', [total, completed, percent, isCompleted ? 1 : 0, completedAt, now, existing.id]);
  else run('INSERT INTO workout_day_progress (id,workspace_id,student_id,trainer_id,workout_plan_id,workout_day_id,total_exercises,completed_exercises,progress_percent,is_completed,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [id('wprog'), user.workspaceId, studentId, plan.trainer_id || '', plan.id, day.id, total, completed, percent, isCompleted ? 1 : 0, completedAt, now, now]);
  return { totalExercises: total, completedExercises: completed, progressPercent: percent, isCompleted, completedAt };
}
async function createWorkoutPlan(user, body) {
  if (!ADMIN_ROLES.has(user.role)) throw Object.assign(new Error('Apenas personal/dev pode criar ficha de treino.'), { status: 403 });
  let template = workoutTemplateByKey(body.templateKey);
  if (template && (!body.days || !body.days.length)) {
    body.days = template.days;
    body.objective = body.objective || template.objective;
    body.level = body.level || template.level;
    body.frequencyPerWeek = body.frequencyPerWeek || template.frequency;
    body.title = body.title || template.title;
  }
  const status = planStatus(body);
  const errors = validateWorkoutPayload(body, status === 'ativo');
  if (errors.length) throw Object.assign(new Error(errors.join(' ')), { status: 400 });
  if (body.studentId && !canAccessStudent(user, body.studentId)) throw Object.assign(new Error('Aluno inválido para esta ficha.'), { status: 403 });
  const now = nowISO();
  const trainerId = user.trainerId || get('SELECT id FROM trainers WHERE workspace_id=? LIMIT 1', [user.workspaceId])?.id;
  const planId = id('wplan');
  run('INSERT INTO workout_plans (id,workspace_id,trainer_id,student_id,title,objective,type,level,modality,location,frequency_per_week,estimated_duration,start_date,review_date,status,notes,safety_notes,progression_rule,review_frequency,load_adjustment,weekly_goal,warmup,cardio,cooldown,equipment_needed,motivational_message,version,source_template,published_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
    planId, user.workspaceId, trainerId, body.studentId || null, sanitizeText(body.title, 180), sanitizeText(body.objective || body.goal, 120), body.type || 'personalizada', body.level || 'iniciante', body.modality || 'academia', body.location || 'academia completa', body.frequencyPerWeek || '3x por semana', body.estimatedDuration || '60 min', body.startDate || '', body.reviewDate || '', status, sanitizeText(body.notes, 1200), sanitizeText(body.safetyNotes, 1200), sanitizeText(body.progressionRule, 1200), body.reviewFrequency || '30 dias', sanitizeText(body.loadAdjustment, 600), sanitizeText(body.weeklyGoal, 600), sanitizeText(body.warmup, 600), sanitizeText(body.cardio, 600), sanitizeText(body.cooldown, 600), sanitizeText(body.equipmentNeeded, 600), sanitizeText(body.motivationalMessage, 600), 1, body.templateKey || '', status === 'ativo' ? now : '', now, now
  ]);
  const days = Array.isArray(body.days) ? body.days : [];
  for (let di = 0; di < days.length; di++) {
    const d = days[di];
    const dayId = id('wday');
    run('INSERT INTO workout_days (id,workspace_id,workout_plan_id,name,focus,muscle_group,weekday,day_type,day_order,intensity,estimated_duration,optional,notes,training_date,day_number,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [dayId, user.workspaceId, planId, sanitizeText(d.name || `Treino ${String.fromCharCode(65 + di)}`, 120), sanitizeText(d.focus, 160), d.muscleGroup || d.muscle_group || 'corpo todo', sanitizeText(d.weekday || d.weekDay || '', 40), sanitizeText(d.dayType || d.day_type || (d.exercises?.length ? 'treino' : 'descanso'), 40), Number(d.order || d.dayOrder || d.day_order || di + 1), d.intensity || 'moderada', d.estimatedDuration || d.duration || body.estimatedDuration || '60 min', d.optional ? 1 : 0, sanitizeText(d.notes, 800), deriveDayDate(body, d, di), deriveDayNumber(d, di), now]);
    const exercises = Array.isArray(d.exercises) ? d.exercises : [];
    for (let ei = 0; ei < exercises.length; ei++) {
      const e = exercises[ei];
      const exId = id('wex');
      run('INSERT INTO workout_exercises (id,workspace_id,workout_day_id,exercise_id,name,muscle_group,category,equipment,sets,reps,load,load_unit,rest_seconds,tempo,rpe,rir,method,notes,video_url,image_url,substitutions,cautions,exercise_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [exId, user.workspaceId, dayId, e.exerciseId || null, sanitizeText(e.name, 140), e.muscleGroup || e.muscle_group || '', e.category || '', e.equipment || '', String(e.sets || ''), String(e.reps || e.duration || ''), String(e.load || ''), e.loadUnit || e.load_unit || 'kg', String(e.rest || e.restSeconds || e.rest_seconds || ''), e.tempo || '', String(e.rpe || ''), String(e.rir || ''), e.method || 'tradicional', sanitizeText(e.notes, 1000), resolveTutorialUrl(e), sanitizeText(e.imageUrl || e.image_url, 500), sanitizeText(e.substitutions, 800), sanitizeText(e.cautions, 800), Number(e.order || ei + 1), now]);
      const existing = get('SELECT id FROM exercise_library WHERE workspace_id=? AND LOWER(name)=LOWER(?) LIMIT 1', [user.workspaceId, e.name]);
      if (!existing && e.name) run('INSERT INTO exercise_library (id,workspace_id,trainer_id,name,description,muscle_group,category,equipment,level,video_url,image_url,execution_notes,common_mistakes,substitutions,cautions,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id('exlib'), user.workspaceId, trainerId, sanitizeText(e.name, 140), sanitizeText(e.notes, 400), e.muscleGroup || '', e.category || '', e.equipment || '', body.level || 'iniciante', sanitizeText(e.videoUrl, 500), sanitizeText(e.imageUrl, 500), sanitizeText(e.notes, 800), '', sanitizeText(e.substitutions, 800), sanitizeText(e.cautions, 800), now, now]);
    }
  }
  const snapshot = workoutPlanSnapshot(planId);
  run('INSERT INTO workout_plan_versions (id,workspace_id,workout_plan_id,version,snapshot_json,changed_by,reason,created_at) VALUES (?,?,?,?,?,?,?,?)', [id('wver'), user.workspaceId, planId, 1, toJSON(snapshot), user.id, status === 'ativo' ? 'Publicação inicial' : 'Rascunho inicial', now]);
  // Espelho compatível com cards antigos de treino
  const flatExercises = (snapshot?.days || []).flatMap(day => (day.exercises || []).map(ex => ({ name: ex.name, sets: ex.sets, reps: ex.reps, rest: ex.restSeconds, note: `${day.name} • ${ex.method || ''}` })));
  run('INSERT INTO workouts (id,workspace_id,trainer_id,student_id,title,goal,level,method,estimated_minutes,intensity,status,exercises_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [id('workout'), user.workspaceId, trainerId, body.studentId || null, sanitizeText(body.title, 160), sanitizeText(body.objective || body.goal, 100), body.level || 'iniciante', body.type || 'personalizada', Number(String(body.estimatedDuration || '60').replace(/\D/g,'') || 60), body.intensity || 'moderada', status === 'modelo' ? 'template' : status, toJSON(flatExercises), now]);
  if (status === 'ativo' && body.studentId) {
    const st = get('SELECT user_id,name FROM students WHERE id=?', [body.studentId]);
    if (st?.user_id) notify(user.workspaceId, st.user_id, 'Nova ficha de treino liberada', `${body.title} já está disponível no FitPro.`);
  }
  audit(user, status === 'ativo' ? 'workout_plan_published' : 'workout_plan_saved', 'workout_plan', planId, `Ficha ${body.title} criada com ${days.length} dia(s).`);
  databaseAdapter.mirror('workout_plans', { id: planId, workspace_id: user.workspaceId, trainer_id: trainerId, student_id: body.studentId || null, title: body.title, status, created_at: now }, { workspaceId: user.workspaceId, entityId: planId }).catch(() => {});
  return { id: planId, bootstrap: bootstrap(user), plan: workoutPlanSnapshot(planId) };
}


async function updateWorkoutPlanFull(user, plan, body) {
  if (!ADMIN_ROLES.has(user.role)) throw Object.assign(new Error('Apenas personal/dev pode editar ficha de treino.'), { status: 403 });
  if (!plan || !assertWorkspace(user, plan.workspace_id)) throw Object.assign(new Error('Ficha não encontrada.'), { status: 404 });
  if (body.studentId && !canAccessStudent(user, body.studentId)) throw Object.assign(new Error('Aluno inválido para esta ficha.'), { status: 403 });
  const status = planStatus(body);
  const days = Array.isArray(body.days) ? body.days : [];
  const errors = validateWorkoutPayload(body, status === 'ativo');
  if (errors.length) throw Object.assign(new Error(errors.join(' ')), { status: 400 });
  const now = nowISO();
  const nextVersion = Number(plan.version || 1) + 1;
  const before = workoutPlanSnapshot(plan.id);
  run('INSERT INTO workout_plan_versions (id,workspace_id,workout_plan_id,version,snapshot_json,changed_by,reason,created_at) VALUES (?,?,?,?,?,?,?,?)', [id('wver'), user.workspaceId, plan.id, nextVersion, toJSON(before), user.id, sanitizeText(body.reason || 'Edição completa em etapas pelo personal.', 300), now]);
  run('UPDATE workout_plans SET student_id=?,title=?,objective=?,type=?,level=?,modality=?,location=?,frequency_per_week=?,estimated_duration=?,start_date=?,review_date=?,status=?,notes=?,safety_notes=?,progression_rule=?,review_frequency=?,load_adjustment=?,weekly_goal=?,warmup=?,cardio=?,cooldown=?,equipment_needed=?,motivational_message=?,version=?,source_template=?,published_at=CASE WHEN ? = ? THEN COALESCE(NULLIF(published_at,\'\'), ?) ELSE published_at END,updated_at=? WHERE id=?', [
    body.studentId || null, sanitizeText(body.title, 180), sanitizeText(body.objective || body.goal, 120), body.type || 'personalizada', body.level || 'iniciante', body.modality || 'academia', body.location || 'academia completa', body.frequencyPerWeek || '3x por semana', body.estimatedDuration || '60 min', body.startDate || '', body.reviewDate || '', status, sanitizeText(body.notes, 1200), sanitizeText(body.safetyNotes, 1200), sanitizeText(body.progressionRule, 1200), body.reviewFrequency || '30 dias', sanitizeText(body.loadAdjustment, 600), sanitizeText(body.weeklyGoal, 600), sanitizeText(body.warmup, 600), sanitizeText(body.cardio, 600), sanitizeText(body.cooldown, 600), sanitizeText(body.equipmentNeeded, 600), sanitizeText(body.motivationalMessage, 600), nextVersion, body.templateKey || plan.source_template || '', status, 'ativo', now, now, plan.id
  ]);
  run('DELETE FROM workout_exercises WHERE workout_day_id IN (SELECT id FROM workout_days WHERE workout_plan_id=?)', [plan.id]);
  run('DELETE FROM workout_days WHERE workout_plan_id=?', [plan.id]);
  const trainerId = user.trainerId || plan.trainer_id || get('SELECT id FROM trainers WHERE workspace_id=? LIMIT 1', [user.workspaceId])?.id;
  for (let di = 0; di < days.length; di++) {
    const d = days[di];
    const dayId = id('wday');
    run('INSERT INTO workout_days (id,workspace_id,workout_plan_id,name,focus,muscle_group,weekday,day_type,day_order,intensity,estimated_duration,optional,notes,training_date,day_number,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [dayId, user.workspaceId, plan.id, sanitizeText(d.name || `Treino ${String.fromCharCode(65 + di)}`, 120), sanitizeText(d.focus, 160), d.muscleGroup || d.muscle_group || 'corpo todo', sanitizeText(d.weekday || d.weekDay || '', 40), sanitizeText(d.dayType || d.day_type || (d.exercises?.length ? 'treino' : 'descanso'), 40), Number(d.order || d.dayOrder || d.day_order || di + 1), d.intensity || 'moderada', d.estimatedDuration || d.duration || body.estimatedDuration || '60 min', d.optional ? 1 : 0, sanitizeText(d.notes, 800), deriveDayDate(body, d, di), deriveDayNumber(d, di), now]);
    const exercises = Array.isArray(d.exercises) ? d.exercises : [];
    for (let ei = 0; ei < exercises.length; ei++) {
      const e = exercises[ei];
      const exId = id('wex');
      run('INSERT INTO workout_exercises (id,workspace_id,workout_day_id,exercise_id,name,muscle_group,category,equipment,sets,reps,load,load_unit,rest_seconds,tempo,rpe,rir,method,notes,video_url,image_url,substitutions,cautions,exercise_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [exId, user.workspaceId, dayId, e.exerciseId || null, sanitizeText(e.name, 140), e.muscleGroup || e.muscle_group || '', e.category || '', e.equipment || '', String(e.sets || ''), String(e.reps || e.duration || ''), String(e.load || ''), e.loadUnit || e.load_unit || 'kg', String(e.rest || e.restSeconds || e.rest_seconds || ''), e.tempo || '', String(e.rpe || ''), String(e.rir || ''), e.method || 'tradicional', sanitizeText(e.notes, 1000), resolveTutorialUrl(e), sanitizeText(e.imageUrl || e.image_url, 500), sanitizeText(e.substitutions, 800), sanitizeText(e.cautions, 800), Number(e.order || ei + 1), now]);
      const existing = get('SELECT id FROM exercise_library WHERE workspace_id=? AND LOWER(name)=LOWER(?) LIMIT 1', [user.workspaceId, e.name]);
      if (!existing && e.name) run('INSERT INTO exercise_library (id,workspace_id,trainer_id,name,description,muscle_group,category,equipment,level,video_url,image_url,execution_notes,common_mistakes,substitutions,cautions,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id('exlib'), user.workspaceId, trainerId, sanitizeText(e.name, 140), sanitizeText(e.notes, 400), e.muscleGroup || '', e.category || '', e.equipment || '', body.level || 'iniciante', sanitizeText(e.videoUrl, 500), sanitizeText(e.imageUrl, 500), sanitizeText(e.notes, 800), '', sanitizeText(e.substitutions, 800), sanitizeText(e.cautions, 800), now, now]);
    }
  }
  if (status === 'ativo' && body.studentId) {
    const st = get('SELECT user_id,name FROM students WHERE id=?', [body.studentId]);
    if (st?.user_id) notify(user.workspaceId, st.user_id, 'Ficha de treino atualizada', `${body.title} foi atualizada pelo personal.`);
  }
  audit(user, 'workout_plan_full_updated', 'workout_plan', plan.id, `Ficha editada em etapas com ${days.length} dia(s).`);
  databaseAdapter.mirror('workout_plans', { id: plan.id, workspace_id: user.workspaceId, trainer_id: trainerId, student_id: body.studentId || null, title: body.title, status, updated_at: now }, { workspaceId: user.workspaceId, entityId: plan.id }).catch(() => {});
  return { bootstrap: bootstrap(user), plan: workoutPlanSnapshot(plan.id) };
}

function bootstrap(user) {
  const workspaceId = user.role === 'student' ? user.workspaceId : user.workspaceId;
  const workspace = get('SELECT * FROM workspaces WHERE id = ?', [workspaceId]);
  const settings = {
    brandName: workspace?.brand_name,
    primaryColor: workspace?.primary_color,
    secondaryColor: workspace?.secondary_color,
    whatsapp: workspace?.whatsapp,
    slug: workspace?.slug,
    plan: workspace?.plan,
    status: workspace?.status
  };

  const base = {
    user,
    settings,
    workspaces: SUPER_ROLES.has(user.role) ? mapRows(all('SELECT * FROM workspaces')) : [mapRows([workspace])[0]],
    trainers: mapRows(tableAll('trainers', workspaceId)),
    plans: all('SELECT * FROM plans WHERE workspace_id = ?', [workspaceId]).map(p => ({ ...mapRows([p])[0], benefits: json(p.benefits_json, []) })),
    integrations: mapRows(all('SELECT id,workspace_id,key,status,public_config_json,last_test_at,created_at FROM integration_settings WHERE workspace_id = ?', [workspaceId])).map(i => ({ ...i, publicConfig: json(i.publicConfigJson, {}) })),
    integrationDashboard: buildIntegrationDashboard(user),
    mercadoPagoWebhookEvents: SUPER_ROLES.has(user.role) ? mapRows(all('SELECT id,event_key,request_id,event_type,resource_id,external_reference,payment_id,mercado_pago_status,signature_valid,processed_status,error_message,received_at,processed_at FROM mercado_pago_webhook_events ORDER BY received_at DESC LIMIT 80')) : [],
    whatsappWebhookEvents: SUPER_ROLES.has(user.role) ? mapRows(all('SELECT id,event_key,webhook_type,message_id,from_phone,to_phone,contact_name,status,text,matched_student_id,matched_user_id,processed_status,error_message,received_at,processed_at FROM whatsapp_webhook_events ORDER BY received_at DESC LIMIT 80')) : [],
    whatsappAiReplies: SUPER_ROLES.has(user.role) ? mapRows(all('SELECT id,workspace_id,student_id,inbound_message_id,inbound_text,ai_answer,provider,whatsapp_message_id,status,error_message,created_at FROM whatsapp_ai_replies ORDER BY created_at DESC LIMIT 80')) : [],
    whatsappTemplates: SUPER_ROLES.has(user.role) || ADMIN_ROLES.has(user.role) ? whatsappApprovedTemplates().map(t => ({ key: t.key, label: t.label, description: t.description, envName: t.envName, configured: t.configured, name: t.configured ? t.name : '', language: t.language, suggestedParams: t.suggestedParams })) : [],
    whatsappTemplateSends: SUPER_ROLES.has(user.role) ? mapRows(all('SELECT id,workspace_id,template_key,template_name,language,to_phone,student_id,status,provider_message_id,error_message,sent_by,created_at FROM whatsapp_template_sends ORDER BY created_at DESC LIMIT 80')) : [],
    automations: mapRows(tableAll('automation_rules', workspaceId)),
    rewards: mapRows(all('SELECT * FROM reward_items WHERE workspace_id = ? AND active=1 ORDER BY points', [workspaceId])),
    rewardRedemptions: mapRows(all('SELECT * FROM reward_redemptions WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100', [workspaceId])),
    giveaways: all('SELECT * FROM giveaways WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId]).map(g => ({ ...mapRows([g])[0], winners: json(g.winners_json, []) })),
    giveawayEntries: mapRows(all('SELECT * FROM giveaway_entries WHERE workspace_id = ? ORDER BY chances DESC', [workspaceId])),
    challengeCheckins: mapRows(all('SELECT * FROM challenge_checkins WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100', [workspaceId])),
    pointLedger: mapRows(all('SELECT * FROM point_ledger WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 150', [workspaceId])),
    antifraudEvents: mapRows(all('SELECT * FROM antifraud_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100', [workspaceId])),
    pushSubscriptions: SUPER_ROLES.has(user.role) || ADMIN_ROLES.has(user.role) ? mapRows(all('SELECT id,workspace_id,user_id,status,last_sent_at,last_error,created_at,updated_at FROM push_subscriptions WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 100', [workspaceId])) : [],
    tenantBranding: mapRows(all('SELECT * FROM tenant_branding WHERE workspace_id = ? LIMIT 1', [workspaceId]))[0] || null,
    referralCodes: mapRows(all('SELECT * FROM referral_codes WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100', [workspaceId])),
    coupons: mapRows(all('SELECT * FROM coupons WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100', [workspaceId])),
    deviceConnections: mapRows(all('SELECT * FROM device_connections WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 100', [workspaceId])).map(d => ({ ...d, metrics: json(d.metricsJson, {}) })),
    healthMetrics: mapRows(all('SELECT * FROM health_metrics WHERE workspace_id = ? ORDER BY metric_date DESC LIMIT 150', [workspaceId])),
    googleConnections: mapRows(all('SELECT id,workspace_id,user_id,trainer_id,google_email,calendar_id,status,last_sync_at,created_at,updated_at FROM google_connections WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 50', [workspaceId])),
    workoutPlans: user.role === 'student' ? [] : workoutPlanRows(workspaceId),
    exerciseLibrary: exerciseLibraryRows(workspaceId),
    workoutTemplates: WORKOUT_TEMPLATES.map(t => ({ key: t.key, title: t.title, objective: t.objective, level: t.level, frequency: t.frequency, modality: t.modality || 'academia', location: t.location || '', duration: t.duration || t.estimatedDuration || '60 min', warmup: t.warmup || '', cardio: t.cardio || '', cooldown: t.cooldown || '', safetyNotes: t.safetyNotes || '', progressionRule: t.progressionRule || '', daysCount: t.days.length, days: t.days })),
    workoutDrafts: ADMIN_ROLES.has(user.role) || SUPER_ROLES.has(user.role) ? workoutDraftRows(workspaceId, user.trainerId || '') : [],
    personalWorkoutTemplates: ADMIN_ROLES.has(user.role) || SUPER_ROLES.has(user.role) ? personalWorkoutTemplateRows(workspaceId, user.trainerId || '') : [],
    workoutInsights: workoutInsights(workspaceId, user),
    workoutExerciseCompletions: SUPER_ROLES.has(user.role) || ADMIN_ROLES.has(user.role) ? workoutCompletionsFor(workspaceId) : [],
    workoutDayProgress: SUPER_ROLES.has(user.role) || ADMIN_ROLES.has(user.role) ? workoutDayProgressFor(workspaceId) : [],
    workoutLogs: mapRows(all('SELECT * FROM workout_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100', [workspaceId])),
    calendarEvents: mapRows(all('SELECT * FROM calendar_events WHERE workspace_id = ? ORDER BY starts_at DESC LIMIT 100', [workspaceId])),
    notificationPreferences: mapRows(all('SELECT * FROM notification_preferences WHERE workspace_id = ? AND user_id = ?', [workspaceId, user.id])),
    notifications: mapRows(all('SELECT * FROM notifications WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50', [workspaceId, user.id])),
    systemStatus: { databaseMode: databaseAdapter.mode, sync: syncSummary(), statuses: mapRows(systemStatusRows()), pendingSync: mapRows(listSyncQueue('pending').slice(0, 20)) },
    users: publicUsers(workspaceId),
    trainerPlans: trainerPlans(workspaceId),
    platformPlans: platformPlans(workspaceId),
    platformActivationCodes: SUPER_ROLES.has(user.role) ? all('SELECT * FROM platform_activation_codes WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200', [workspaceId]).map(row => mapActivationCode(row, true)) : [],
    activationCodeRedemptions: SUPER_ROLES.has(user.role) ? mapRows(all('SELECT * FROM activation_code_redemptions WHERE workspace_id=? ORDER BY redeemed_at DESC LIMIT 200', [workspaceId])) : [],
    trainerPaymentSettings: mapRows(all('SELECT * FROM trainer_payment_settings WHERE workspace_id=? ORDER BY updated_at DESC', [workspaceId]))[0] || null,
    platformSubscriptions: SUPER_ROLES.has(user.role) ? mapRows(all('SELECT * FROM platform_subscriptions WHERE workspace_id=? ORDER BY due_date DESC LIMIT 100', [workspaceId])) : mapRows(all('SELECT * FROM platform_subscriptions WHERE workspace_id=? AND trainer_id=? ORDER BY due_date DESC LIMIT 20', [workspaceId, user.trainerId || ''])),
    studentPayments: SUPER_ROLES.has(user.role) || ADMIN_ROLES.has(user.role) ? mapRows(all('SELECT * FROM student_payments WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200', [workspaceId])) : [],
    paymentLogs: SUPER_ROLES.has(user.role) || ADMIN_ROLES.has(user.role) ? mapRows(all('SELECT * FROM payment_logs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200', [workspaceId])) : []
  };

  if (user.role === 'student') {
    const studentId = user.studentId;
    const student = get('SELECT * FROM students WHERE id = ?', [studentId]);
    return {
      ...base,
      students: [mapStudent(student)],
      workouts: mapRows(all('SELECT * FROM workouts WHERE workspace_id = ? AND (student_id = ? OR student_id IS NULL) ORDER BY created_at DESC', [workspaceId, studentId])).map(w => ({ ...w, exercises: json(w.exercisesJson, []) })),
      workoutLogs: mapRows(all('SELECT * FROM workout_logs WHERE workspace_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 50', [workspaceId, studentId])),
      workoutExerciseCompletions: workoutCompletionsFor(workspaceId, studentId),
      workoutDayProgress: workoutDayProgressFor(workspaceId, studentId),
      workoutPlans: workoutPlanRows(workspaceId, studentId),
      schedules: mapRows(all('SELECT * FROM schedules WHERE workspace_id = ? AND student_id = ? ORDER BY date,time', [workspaceId, studentId])),
      assessments: mapRows(all('SELECT * FROM assessments WHERE workspace_id = ? AND student_id = ? ORDER BY date', [workspaceId, studentId])),
      payments: all('SELECT * FROM payments WHERE workspace_id = ? AND student_id = ? ORDER BY due_date DESC', [workspaceId, studentId]).map(cleanPayment),
      contents: all('SELECT * FROM contents WHERE workspace_id = ? ORDER BY featured DESC,created_at DESC', [workspaceId]).map(c => ({ ...mapRows([c])[0], accessPlanIds: json(c.access_plan_ids_json, []), studentAccessIds: json(c.student_access_ids_json, []), completedBy: json(c.completed_by_json, []) })),
      posts: all('SELECT * FROM community_posts WHERE workspace_id = ? AND (visibility = ? OR student_id = ?) ORDER BY pinned DESC,created_at DESC', [workspaceId, 'publico', studentId]).map(mapCommunityPost),
      messages: mapRows(all('SELECT * FROM messages WHERE workspace_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 100', [workspaceId, studentId])),
      leads: [],
      challenges: all('SELECT * FROM challenges WHERE workspace_id = ?', [workspaceId]).map(c => ({ ...mapRows([c])[0], participants: json(c.participants_json, []) })),
      habits: mapRows(all('SELECT * FROM habits WHERE workspace_id = ? AND student_id = ? ORDER BY date DESC LIMIT 30', [workspaceId, studentId])).map(h => ({ ...h, quickCheckin: json(h.quickCheckinJson || '{}', {}), supplementsTaken: json(h.supplementsTakenJson || '[]', []) })),
      supplements: mapRows(all('SELECT * FROM supplements WHERE workspace_id = ? AND student_id = ? ORDER BY created_at DESC', [workspaceId, studentId])),
      auditLogs: [],
      onboarding: onboardingStatusFor(student),
      trainerPlans: trainerPlans(workspaceId, student?.trainer_id || student?.requested_trainer_id || ''),
      trainerPaymentSettings: student?.trainer_id ? (mapRows(all('SELECT * FROM trainer_payment_settings WHERE workspace_id=? AND trainer_id=? LIMIT 1', [workspaceId, student.trainer_id]))[0] || null) : null,
      studentPayments: mapRows(all('SELECT * FROM student_payments WHERE workspace_id=? AND student_id=? ORDER BY created_at DESC LIMIT 30', [workspaceId, studentId])),
      badges: studentBadges(workspaceId, studentId)
    };
  }

  return {
    ...base,
    students: all('SELECT * FROM students WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId]).map(mapStudent),
    workouts: mapRows(all('SELECT * FROM workouts WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId])).map(w => ({ ...w, exercises: json(w.exercisesJson, []) })),
    schedules: mapRows(all('SELECT * FROM schedules WHERE workspace_id = ? ORDER BY date,time', [workspaceId])),
    assessments: mapRows(all('SELECT * FROM assessments WHERE workspace_id = ? ORDER BY date', [workspaceId])),
    payments: all('SELECT * FROM payments WHERE workspace_id = ? ORDER BY due_date DESC', [workspaceId]).map(cleanPayment),
    contents: all('SELECT * FROM contents WHERE workspace_id = ? ORDER BY featured DESC,created_at DESC', [workspaceId]).map(c => ({ ...mapRows([c])[0], accessPlanIds: json(c.access_plan_ids_json, []), studentAccessIds: json(c.student_access_ids_json, []), completedBy: json(c.completed_by_json, []) })),
    posts: all('SELECT * FROM community_posts WHERE workspace_id = ? ORDER BY pinned DESC,created_at DESC', [workspaceId]).map(mapCommunityPost),
    messages: mapRows(all('SELECT * FROM messages WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200', [workspaceId])),
    leads: mapRows(all('SELECT * FROM leads WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId])),
    challenges: all('SELECT * FROM challenges WHERE workspace_id = ?', [workspaceId]).map(c => ({ ...mapRows([c])[0], participants: json(c.participants_json, []) })),
    habits: mapRows(all('SELECT * FROM habits WHERE workspace_id = ? ORDER BY date DESC LIMIT 100', [workspaceId])).map(h => ({ ...h, quickCheckin: json(h.quickCheckinJson || '{}', {}), supplementsTaken: json(h.supplementsTakenJson || '[]', []) })),
    supplements: mapRows(all('SELECT * FROM supplements WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId])),
    auditLogs: mapRows(all('SELECT * FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200', [workspaceId])),
    badges: mapRows(all('SELECT * FROM badges WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200', [workspaceId]))
  };
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/api/health' || pathname === '/health') {
    return send(res, 200, { ok: true, app: 'FitPro API', env: config.nodeEnv, now: nowISO(), mode: 'fullstack' });
  }

  if (!isAllowedOrigin(req.headers.origin || '')) return send(res, 403, { error: 'Origem não permitida pelo CORS.' });


  if (pathname.startsWith('/api/public/personal/') && req.method === 'GET') {
    const slug = decodeURIComponent(pathname.split('/').pop() || '');
    const trainer = get('SELECT * FROM trainers WHERE profile_slug=? AND COALESCE(public_profile_enabled,1)=1 LIMIT 1', [slug]);
    if (!trainer) return send(res, 404, { error: 'Perfil público do personal não encontrado.' });
    const branding = get('SELECT * FROM tenant_branding WHERE workspace_id=? LIMIT 1', [trainer.workspace_id]);
    const plans = all('SELECT * FROM plans WHERE workspace_id=? AND active=1 ORDER BY price', [trainer.workspace_id]).map(p => ({ ...mapRows([p])[0], benefits: json(p.benefits_json, []) }));
    return send(res, 200, { profile: publicTrainerProfile(trainer, branding, plans) });
  }

  if (pathname === '/api/public/coupons/validate' && req.method === 'POST') {
    const body = await readBody(req);
    const workspace = get('SELECT * FROM workspaces LIMIT 1');
    const coupon = activeCoupon(body.code, workspace.id);
    if (!coupon) return send(res, 404, { error: 'Cupom inválido, expirado ou indisponível.' });
    const amount = Number(body.amount || 0);
    const discount = coupon.discount_type === 'fixed' ? Number(coupon.discount_value || 0) : amount * (Number(coupon.discount_value || 0) / 100);
    return send(res, 200, { ok: true, coupon: mapRows([coupon])[0], discount: Math.max(0, Number(discount.toFixed(2))), finalAmount: Math.max(0, amount - discount) });
  }

  if (pathname === '/api/public/trainers' && req.method === 'GET') {
    const workspace = get('SELECT * FROM workspaces LIMIT 1');
    const trainers = mapRows(all('SELECT id,name,email,phone,city,state,specialty,bio,modalities,active,premium,ai_enabled,brand_name,whatsapp,instagram,service_area,max_students,avatar_url FROM trainers WHERE workspace_id=? AND COALESCE(active,1)=1', [workspace.id]));
    const plans = all('SELECT * FROM plans WHERE workspace_id=? AND active=1 ORDER BY price', [workspace.id]).map(p => ({ ...mapRows([p])[0], benefits: json(p.benefits_json, []) }));
    return send(res, 200, { trainers, plans });
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const row = get('SELECT * FROM users WHERE email = ?', [email]);
    if (!row) return send(res, 401, { error: 'E-mail ou senha inválidos.' });
    if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
      return send(res, 423, { error: 'Conta bloqueada temporariamente por muitas tentativas.' });
    }
    if (!verifyPassword(password, row.password_hash)) {
      const failed = Number(row.failed_logins || 0) + 1;
      const lockedUntil = failed >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
      run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', [failed, lockedUntil, row.id]);
      return send(res, 401, { error: 'E-mail ou senha inválidos.' });
    }
    run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', [row.id]);
    const user = normalizeUser(row);
    const token = createToken({ sub: row.id, role: row.role, workspaceId: row.workspace_id });
    audit(user, 'login', 'user', row.id, 'Login realizado com sucesso.');
    return send(res, 200, { token, user }, { 'Set-Cookie': `${config.cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=${config.nodeEnv === 'production' ? 'None; Secure' : 'Lax'}; Path=/; Max-Age=${config.tokenTtlSeconds}` });
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const user = authUser(req);
    if (user) audit(user, 'logout', 'user', user.id, 'Logout realizado.');
    return send(res, 200, { ok: true }, { 'Set-Cookie': `${config.cookieName}=; HttpOnly; SameSite=${config.nodeEnv === 'production' ? 'None; Secure' : 'Lax'}; Path=/; Max-Age=0` });
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await readBody(req);
    const workspace = get('SELECT * FROM workspaces LIMIT 1');
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !body.password || String(body.password).length < 6) return send(res, 422, { error: 'Informe e-mail e senha com no mínimo 6 caracteres.' });
    if (get('SELECT id FROM users WHERE email = ?', [email])) return send(res, 409, { error: 'Este e-mail já está cadastrado.' });
    const accountType = String(body.accountType || 'student').toLowerCase();
    if (accountType === 'trainer' || accountType === 'personal') {
      const userId = id('user');
      const trainerId = id('trainer');
      const now = nowISO();
      const name = sanitizeText(body.name || 'Novo personal', 120);
      const brandName = sanitizeText(body.brandName || body.professionalName || name, 140);
      const planCode = String(body.platformPlanCode || 'fitpro_start').toLowerCase();
      const plan = get('SELECT * FROM platform_plans WHERE workspace_id=? AND code=? LIMIT 1', [workspace.id, planCode]) || get('SELECT * FROM platform_plans WHERE workspace_id=? AND code=? LIMIT 1', [workspace.id, 'fitpro_start']);
      run('INSERT INTO users (id,workspace_id,trainer_id,name,email,password_hash,role,avatar,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [userId, workspace.id, trainerId, name, email, hashPassword(String(body.password)), 'trainer', '', now]);
      run('INSERT INTO trainers (id,user_id,workspace_id,name,email,phone,specialty,bio,created_at,city,state,modalities,active,premium,ai_enabled,requires_password_change,brand_name,whatsapp,service_area,max_students,platform_subscription_status,platform_plan_name,platform_plan_amount,payment_blocked_at,public_profile_enabled,profile_slug) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [trainerId, userId, workspace.id, name, email, sanitizeText(body.phone, 30), sanitizeText(body.specialty, 220), sanitizeText(body.bio, 1000), now, sanitizeText(body.city, 100), sanitizeText(body.state, 40), sanitizeText(body.modalities || 'online', 120), 1, 0, 0, 0, brandName, sanitizeText(body.phone, 30), sanitizeText(body.serviceArea, 180), plan?.student_limit || 10, 'pendente', plan?.name || 'FitPro Start', Number(plan?.price || 49.99), now, 1, slugify(brandName || name)]);
      if (plan) run('INSERT INTO platform_subscriptions (id,workspace_id,trainer_id,plan_name,amount,status,due_date,paid_at,mercado_pago_payment_id,created_at,updated_at,platform_plan_id,source,starts_at,expires_at,payment_method,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id('platsub'), workspace.id, trainerId, plan.name, Number(plan.price || 0), 'pendente', new Date(Date.now() + 7 * 86400000).toISOString().slice(0,10), '', '', now, now, plan.id, 'pending_checkout', now, '', 'mercado_pago', toJSON({ reason: 'trainer_self_signup', selectedPlanCode: planCode })]);
      audit({ id: userId, workspaceId: workspace.id, trainerId }, 'trainer_self_signup_pending_activation', 'trainer', trainerId, `Personal ${name} criou conta e precisa ativar plano/código.`);
      notify(workspace.id, 'user_admin', 'Novo personal aguardando ativação', `${name} criou conta como personal e escolheu ${plan?.name || 'FitPro Start'}.`);
      const user = normalizeUser(get('SELECT * FROM users WHERE id = ?', [userId]));
      const token = createToken({ sub: userId, role: 'trainer', workspaceId: workspace.id });
      return send(res, 201, { token, user }, { 'Set-Cookie': `${config.cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=${config.nodeEnv === 'production' ? 'None; Secure' : 'Lax'}; Path=/; Max-Age=${config.tokenTtlSeconds}` });
    }
    const userId = id('user');
    const studentId = id('student');
    const now = nowISO();
    const name = sanitizeText(body.name || 'Novo aluno', 120);
    run('INSERT INTO users (id,workspace_id,student_id,name,email,password_hash,role,avatar,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [userId, workspace.id, studentId, name, email, hashPassword(String(body.password)), 'student', '', now]);
    const plan = get('SELECT id FROM plans WHERE workspace_id = ? AND featured = 1 LIMIT 1', [workspace.id]) || get('SELECT id FROM plans WHERE workspace_id = ? LIMIT 1', [workspace.id]) || { id: '' };
    run('INSERT INTO students (id,user_id,workspace_id,trainer_id,name,email,phone,city,goal,birthdate,height,initial_weight,current_weight,level,restrictions,plan_id,status,last_activity_at,consents_json,created_at,state,neighborhood,modality,training_place,availability,preferred_payment_day,payment_method,request_message,request_status,onboarding_stage,requested_trainer_id,requested_trainer_plan_id,payment_flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [studentId, userId, workspace.id, '', name, email, sanitizeText(body.phone, 30), sanitizeText(body.city, 100), sanitizeText(body.goal, 200), body.birthdate || '', Number(body.height || 0), Number(body.weight || 0), Number(body.weight || 0), body.level || 'iniciante', sanitizeText(body.restrictions, 500), '', 'sem_personal', now, toJSON({ terms: Boolean(body.terms), lgpd: Boolean(body.lgpd), photos: Boolean(body.photos), notifications: Boolean(body.notifications) }), now, sanitizeText(body.state, 40), sanitizeText(body.neighborhood, 120), sanitizeText(body.modality || 'online', 40), sanitizeText(body.trainingPlace || '', 80), sanitizeText(body.availability || '', 160), sanitizeText(body.preferredPaymentDay || '', 40), sanitizeText(body.paymentMethod || 'pix_manual', 80), sanitizeText(body.requestMessage || '', 800), 'sem_personal', 'perfil_basico', '', '', 'student_to_trainer_pix']);
    seedBadgeIfMissing(workspace.id, studentId, 'primeiro_acesso', 'Primeiro acesso', '🚀', 'Conta criada no FitPro Elite.', 'comum', true);
    audit({ id: userId, workspaceId: workspace.id }, 'student_account_created_without_trainer', 'student', studentId, 'Aluno criou conta e será direcionado ao onboarding antes de ver dashboard completo.');
    notify(workspace.id, 'user_admin', 'Novo aluno sem personal', `${name} criou conta e precisa escolher um personal.`);
    const user = normalizeUser(get('SELECT * FROM users WHERE id = ?', [userId]));
    const token = createToken({ sub: userId, role: 'student', workspaceId: workspace.id });
    return send(res, 201, { token, user }, { 'Set-Cookie': `${config.cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=${config.nodeEnv === 'production' ? 'None; Secure' : 'Lax'}; Path=/; Max-Age=${config.tokenTtlSeconds}` });
  }

  if (pathname === '/api/me' && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return send(res, 200, { user });
  }

  if (pathname === '/api/bootstrap' && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return send(res, 200, bootstrap(user));
  }

  if (pathname === '/api/leads' && req.method === 'POST') {
    const body = await readBody(req);
    const workspace = get('SELECT * FROM workspaces LIMIT 1');
    const leadId = id('lead');
    run('INSERT INTO leads (id,workspace_id,name,phone,email,goal,origin,status,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [leadId, workspace.id, sanitizeText(body.name, 120), sanitizeText(body.phone, 30), sanitizeText(body.email, 120), sanitizeText(body.goal, 200), sanitizeText(body.origin || 'Landing page', 100), 'novo', sanitizeText(body.note, 500), nowISO()]);
    audit({ id: 'public', workspaceId: workspace.id }, 'lead_created', 'lead', leadId, 'Lead criado via landing page.');
    return send(res, 201, { id: leadId, message: 'Lead criado. O personal poderá chamar pelo WhatsApp.' });
  }

  if (pathname === '/api/students' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const studentId = id('student');
    const email = String(body.email || `${studentId}@fitpro.local`).toLowerCase();
    const now = nowISO();
    const trainer = get('SELECT id FROM trainers WHERE workspace_id = ? LIMIT 1', [user.workspaceId]);
    const plan = body.planId || get('SELECT id FROM plans WHERE workspace_id = ? LIMIT 1', [user.workspaceId])?.id;
    run('INSERT INTO students (id,workspace_id,trainer_id,name,email,phone,city,goal,birthdate,height,initial_weight,current_weight,level,restrictions,plan_id,status,last_activity_at,consents_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [studentId, user.workspaceId, trainer.id, sanitizeText(body.name, 120), email, sanitizeText(body.phone,30), sanitizeText(body.city,100), sanitizeText(body.goal,200), body.birthdate || '', Number(body.height || 0), Number(body.initialWeight || 0), Number(body.currentWeight || body.initialWeight || 0), body.level || 'iniciante', sanitizeText(body.restrictions,500), plan, body.status || 'ativo', now, toJSON({ terms:true, lgpd:true, photos:false, notifications:true }), now]);
    audit(user, 'student_created', 'student', studentId, `Aluno ${body.name} criado pelo admin.`);
    return send(res, 201, { id: studentId, bootstrap: bootstrap(user) });
  }


  if (pathname === '/api/workout-templates' && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return send(res, 200, { templates: WORKOUT_TEMPLATES });
  }

  if (pathname === '/api/exercise-library' && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const exercises = exerciseLibraryRows(user.workspaceId, {
      q: url.searchParams.get('q') || '',
      muscleGroup: url.searchParams.get('muscleGroup') || '',
      equipment: url.searchParams.get('equipment') || '',
      level: url.searchParams.get('level') || '',
      category: url.searchParams.get('category') || ''
    });
    return send(res, 200, { exercises });
  }

  if (pathname === '/api/exercise-library' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    if (!body.name) return send(res, 400, { error: 'Informe o nome do exercício.' });
    const existing = get('SELECT id FROM exercise_library WHERE workspace_id=? AND LOWER(name)=LOWER(?) LIMIT 1', [user.workspaceId, body.name]);
    if (existing) return send(res, 409, { error: 'Este exercício já existe na biblioteca.' });
    const trainerId = user.trainerId || get('SELECT id FROM trainers WHERE workspace_id=? LIMIT 1', [user.workspaceId])?.id || null;
    const exerciseId = id('exlib');
    const now = nowISO();
    run('INSERT INTO exercise_library (id,workspace_id,trainer_id,name,description,muscle_group,category,equipment,level,video_url,image_url,execution_notes,common_mistakes,substitutions,cautions,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
      exerciseId, user.workspaceId, trainerId, sanitizeText(body.name, 140), sanitizeText(body.description, 800), sanitizeText(body.muscleGroup || body.muscle_group, 80), sanitizeText(body.category, 80), sanitizeText(body.equipment, 80), sanitizeText(body.level, 80), resolveTutorialUrl(body), sanitizeText(body.imageUrl || body.image_url, 500), sanitizeText(body.executionNotes || body.execution_notes, 1000), sanitizeText(body.commonMistakes || body.common_mistakes, 1000), sanitizeText(body.substitutions, 1000), sanitizeText(body.cautions, 1000), now, now
    ]);
    audit(user, 'exercise_library_created', 'exercise_library', exerciseId, `Exercício criado: ${body.name}`);
    return send(res, 201, { id: exerciseId, bootstrap: bootstrap(user), exercises: exerciseLibraryRows(user.workspaceId) });
  }


  if (pathname === '/api/workout-drafts' && req.method === 'GET') {
    const user = requireAdmin(req, res); if (!user) return;
    return send(res, 200, { drafts: workoutDraftRows(user.workspaceId, user.trainerId || '') });
  }

  if (pathname === '/api/workout-drafts' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const trainerId = user.trainerId || get('SELECT id FROM trainers WHERE workspace_id=? LIMIT 1', [user.workspaceId])?.id || user.id;
    const now = nowISO();
    const studentId = sanitizeText(body.studentId || body.draft?.studentId || '', 80);
    const planId = sanitizeText(body.workoutPlanId || body.planId || body.draft?.planId || '', 80);
    const existing = get('SELECT * FROM workout_plan_drafts WHERE workspace_id=? AND trainer_id=? AND COALESCE(student_id,\'\')=? AND COALESCE(workout_plan_id,\'\')=? LIMIT 1', [user.workspaceId, trainerId, studentId, planId]);
    const draftJson = toJSON(body.draft || body);
    if (existing) {
      run('UPDATE workout_plan_drafts SET title=?,status=?,draft_json=?,source=?,last_step=?,updated_at=? WHERE id=?', [sanitizeText(body.title || body.draft?.title || existing.title || 'Rascunho de ficha', 180), sanitizeText(body.status || 'rascunho', 40), draftJson, sanitizeText(body.source || 'editor', 80), Number(body.lastStep || body.draft?.step || 1), now, existing.id]);
      audit(user, 'workout_draft_autosaved', 'workout_plan_draft', existing.id, 'Rascunho salvo automaticamente no backend.');
      return send(res, 200, { id: existing.id, bootstrap: bootstrap(user), draft: workoutDraftRows(user.workspaceId, trainerId).find(d => d.id === existing.id) });
    }
    const draftId = id('wdraft');
    run('INSERT INTO workout_plan_drafts (id,workspace_id,trainer_id,student_id,workout_plan_id,title,status,draft_json,source,last_step,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [draftId, user.workspaceId, trainerId, studentId || null, planId || null, sanitizeText(body.title || body.draft?.title || 'Rascunho de ficha', 180), sanitizeText(body.status || 'rascunho', 40), draftJson, sanitizeText(body.source || 'editor', 80), Number(body.lastStep || body.draft?.step || 1), now, now]);
    audit(user, 'workout_draft_created', 'workout_plan_draft', draftId, 'Rascunho criado no backend.');
    return send(res, 201, { id: draftId, bootstrap: bootstrap(user), draft: workoutDraftRows(user.workspaceId, trainerId).find(d => d.id === draftId) });
  }

  const workoutDraftDeleteMatch = pathname.match(/^\/api\/workout-drafts\/([^/]+)$/);
  if (workoutDraftDeleteMatch && req.method === 'DELETE') {
    const user = requireAdmin(req, res); if (!user) return;
    const draft = get('SELECT * FROM workout_plan_drafts WHERE id=?', [workoutDraftDeleteMatch[1]]);
    if (!draft || !assertWorkspace(user, draft.workspace_id)) return send(res, 404, { error: 'Rascunho não encontrado.' });
    run('DELETE FROM workout_plan_drafts WHERE id=?', [draft.id]);
    audit(user, 'workout_draft_deleted', 'workout_plan_draft', draft.id, 'Rascunho descartado.');
    return send(res, 200, { bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/workout-plans/bulk-apply' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const studentIds = Array.isArray(body.studentIds) ? body.studentIds.map(String).filter(Boolean) : [];
    if (!studentIds.length) return send(res, 400, { error: 'Selecione pelo menos um aluno.' });
    const basePayload = body.planPayload || body.payload || {};
    const created = [];
    for (const studentId of studentIds) {
      if (!canAccessStudent(user, studentId)) return send(res, 403, { error: `Sem acesso ao aluno ${studentId}.` });
      const student = get('SELECT name FROM students WHERE id=?', [studentId]);
      const payload = { ...basePayload, studentId, title: sanitizeText((body.title || basePayload.title || 'Plano FitPro') + (student?.name ? ` · ${student.name}` : ''), 180), status: body.status || basePayload.status || 'rascunho', action: body.publish ? 'publish' : (body.action || basePayload.action || 'draft'), targetMode: 'student', startDate: body.startDate || basePayload.startDate || '' };
      const result = await createWorkoutPlan(user, payload);
      created.push(result.id);
    }
    audit(user, 'workout_plan_bulk_applied', 'workout_plan', created.join(','), `Plano aplicado para ${created.length} aluno(s).`);
    return send(res, 201, { created, bootstrap: bootstrap(user) });
  }

  const saveWorkoutTemplateMatch = pathname.match(/^\/api\/workout-plans\/([^/]+)\/save-template$/);
  if (saveWorkoutTemplateMatch && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const plan = workoutPlanSnapshot(saveWorkoutTemplateMatch[1]);
    if (!plan || !assertWorkspace(user, plan.workspaceId || plan.workspace_id)) return send(res, 404, { error: 'Ficha não encontrada.' });
    const trainerId = user.trainerId || plan.trainerId || plan.trainer_id || get('SELECT id FROM trainers WHERE workspace_id=? LIMIT 1', [user.workspaceId])?.id || user.id;
    const now = nowISO();
    const tplId = id('ptpl');
    run('INSERT INTO personal_workout_templates (id,workspace_id,trainer_id,title,objective,source_plan_id,template_json,favorite,usage_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [tplId, user.workspaceId, trainerId, sanitizeText(body.title || plan.title || 'Modelo do personal', 180), sanitizeText(body.objective || plan.objective || '', 120), plan.id, toJSON({ ...plan, studentId: '', student_id: '', versions: [], progress: [] }), body.favorite ? 1 : 0, 0, now, now]);
    audit(user, 'personal_workout_template_saved', 'personal_workout_template', tplId, `Modelo salvo: ${body.title || plan.title}`);
    return send(res, 201, { id: tplId, bootstrap: bootstrap(user) });
  }

  const favoriteTemplateMatch = pathname.match(/^\/api\/personal-workout-templates\/([^/]+)\/favorite$/);
  if (favoriteTemplateMatch && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const tpl = get('SELECT * FROM personal_workout_templates WHERE id=?', [favoriteTemplateMatch[1]]);
    if (!tpl || !assertWorkspace(user, tpl.workspace_id)) return send(res, 404, { error: 'Modelo não encontrado.' });
    run('UPDATE personal_workout_templates SET favorite=?,updated_at=? WHERE id=?', [body.favorite === false ? 0 : 1, nowISO(), tpl.id]);
    audit(user, 'personal_workout_template_favorite_changed', 'personal_workout_template', tpl.id, body.favorite === false ? 'Removido dos favoritos.' : 'Favoritado.');
    return send(res, 200, { bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/workout-plans/ai-suggestion' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const student = body.studentId ? get('SELECT * FROM students WHERE id=?', [body.studentId]) : null;
    if (body.studentId && !canAccessStudent(user, body.studentId)) return send(res, 403, { error: 'Aluno inválido para sugestão.' });
    const suggestion = buildWorkoutAiSuggestion(student, body);
    audit(user, 'workout_ai_suggestion_generated', 'workout_plan', body.studentId || 'template', `Sugestão gerada para ${suggestion.objective}/${suggestion.level}.`);
    return send(res, 200, { suggestion });
  }

  if (pathname === '/api/workout-plans' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    try {
      const result = await createWorkoutPlan(user, await readBody(req));
      return send(res, 201, result);
    } catch (error) {
      return send(res, error.status || 500, { error: error.message || 'Não foi possível criar ficha de treino.' });
    }
  }

  const workoutPlanMatch = pathname.match(/^\/api\/workout-plans\/([^/]+)$/);
  if (workoutPlanMatch && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const plan = get('SELECT * FROM workout_plans WHERE id=?', [workoutPlanMatch[1]]);
    if (!plan || !assertWorkspace(user, plan.workspace_id)) return send(res, 404, { error: 'Ficha não encontrada.' });
    if (user.role === 'student' && plan.student_id && plan.student_id !== user.studentId) return send(res, 403, { error: 'Você não pode acessar esta ficha.' });
    return send(res, 200, { plan: workoutPlanSnapshot(plan.id) });
  }

  if (workoutPlanMatch && req.method === 'PATCH') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const plan = get('SELECT * FROM workout_plans WHERE id=?', [workoutPlanMatch[1]]);
    if (!plan || !assertWorkspace(user, plan.workspace_id)) return send(res, 404, { error: 'Ficha não encontrada.' });
    if (body.fullEdit || Array.isArray(body.days)) {
      try {
        const result = await updateWorkoutPlanFull(user, plan, body);
        return send(res, 200, result);
      } catch (error) {
        return send(res, error.status || 500, { error: error.message || 'Não foi possível atualizar ficha de treino.' });
      }
    }
    const nextStatus = body.status || plan.status;
    const now = nowISO();
    const version = Number(plan.version || 1) + 1;
    const snapshot = workoutPlanSnapshot(plan.id);
    run('INSERT INTO workout_plan_versions (id,workspace_id,workout_plan_id,version,snapshot_json,changed_by,reason,created_at) VALUES (?,?,?,?,?,?,?,?)', [id('wver'), user.workspaceId, plan.id, version, toJSON(snapshot), user.id, sanitizeText(body.reason || `Status alterado para ${nextStatus}`, 300), now]);
    run('UPDATE workout_plans SET status=?, version=?, updated_at=?, published_at=CASE WHEN ? = ? THEN ? ELSE published_at END WHERE id=?', [nextStatus, version, now, nextStatus, 'ativo', now, plan.id]);
    audit(user, 'workout_plan_status_changed', 'workout_plan', plan.id, `Status: ${nextStatus}`);
    return send(res, 200, { bootstrap: bootstrap(user), plan: workoutPlanSnapshot(plan.id) });
  }

  const workoutVersionsMatch = pathname.match(/^\/api\/workout-plans\/([^/]+)\/versions$/);
  if (workoutVersionsMatch && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const plan = get('SELECT * FROM workout_plans WHERE id=?', [workoutVersionsMatch[1]]);
    if (!plan || !assertWorkspace(user, plan.workspace_id)) return send(res, 404, { error: 'Ficha não encontrada.' });
    if (user.role === 'student' && plan.student_id !== user.studentId) return send(res, 403, { error: 'Você não pode acessar versões desta ficha.' });
    const versions = mapRows(all('SELECT * FROM workout_plan_versions WHERE workout_plan_id=? ORDER BY version DESC LIMIT 30', [plan.id])).map(v => ({ ...v, snapshot: json(v.snapshotJson, null) }));
    return send(res, 200, { versions });
  }

  const workoutDuplicateMatch = pathname.match(/^\/api\/workout-plans\/([^/]+)\/duplicate$/);
  if (workoutDuplicateMatch && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const plan = workoutPlanSnapshot(workoutDuplicateMatch[1]);
    if (!plan || !assertWorkspace(user, plan.workspaceId || plan.workspace_id)) return send(res, 404, { error: 'Ficha não encontrada.' });
    const payload = {
      ...plan,
      studentId: body.studentId ?? plan.studentId ?? plan.student_id ?? '',
      title: sanitizeText(body.title || `${plan.title} — cópia`, 180),
      status: 'rascunho',
      action: 'draft',
      targetMode: body.targetMode || ((body.studentId || plan.studentId) ? 'student' : 'template'),
      days: (plan.days || []).map(day => ({ ...day, exercises: (day.exercises || []).map(ex => ({ ...ex })) })),
      reason: body.reason || 'Ficha duplicada pelo personal.'
    };
    const result = await createWorkoutPlan(user, payload);
    audit(user, 'workout_plan_duplicated', 'workout_plan', result.id, `Origem: ${plan.id}`);
    return send(res, 201, result);
  }

  const workoutArchiveMatch = pathname.match(/^\/api\/workout-plans\/([^/]+)\/archive$/);
  if (workoutArchiveMatch && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const plan = get('SELECT * FROM workout_plans WHERE id=?', [workoutArchiveMatch[1]]);
    if (!plan || !assertWorkspace(user, plan.workspace_id)) return send(res, 404, { error: 'Ficha não encontrada.' });
    const now = nowISO();
    const version = Number(plan.version || 1) + 1;
    run('INSERT INTO workout_plan_versions (id,workspace_id,workout_plan_id,version,snapshot_json,changed_by,reason,created_at) VALUES (?,?,?,?,?,?,?,?)', [id('wver'), user.workspaceId, plan.id, version, toJSON(workoutPlanSnapshot(plan.id)), user.id, sanitizeText(body.reason || 'Ficha arquivada pelo personal.', 300), now]);
    run('UPDATE workout_plans SET status=?, version=?, updated_at=? WHERE id=?', ['arquivado', version, now, plan.id]);
    audit(user, 'workout_plan_archived', 'workout_plan', plan.id, body.reason || 'Arquivamento manual.');
    return send(res, 200, { bootstrap: bootstrap(user), plan: workoutPlanSnapshot(plan.id) });
  }

  const workoutRestoreMatch = pathname.match(/^\/api\/workout-plans\/([^/]+)\/restore-version$/);
  if (workoutRestoreMatch && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const plan = get('SELECT * FROM workout_plans WHERE id=?', [workoutRestoreMatch[1]]);
    if (!plan || !assertWorkspace(user, plan.workspace_id)) return send(res, 404, { error: 'Ficha não encontrada.' });
    const versionRow = body.versionId ? get('SELECT * FROM workout_plan_versions WHERE id=? AND workout_plan_id=?', [body.versionId, plan.id]) : get('SELECT * FROM workout_plan_versions WHERE workout_plan_id=? ORDER BY version DESC LIMIT 1', [plan.id]);
    if (!versionRow) return send(res, 404, { error: 'Versão não encontrada.' });
    const snapshot = json(versionRow.snapshot_json, null);
    if (!snapshot) return send(res, 422, { error: 'Snapshot inválido para restauração.' });
    const now = nowISO();
    const newVersion = Number(plan.version || 1) + 1;
    run('DELETE FROM workout_exercises WHERE workout_day_id IN (SELECT id FROM workout_days WHERE workout_plan_id=?)', [plan.id]);
    run('DELETE FROM workout_days WHERE workout_plan_id=?', [plan.id]);
    run('UPDATE workout_plans SET title=?,objective=?,type=?,level=?,modality=?,location=?,frequency_per_week=?,estimated_duration=?,start_date=?,review_date=?,status=?,notes=?,safety_notes=?,progression_rule=?,review_frequency=?,load_adjustment=?,weekly_goal=?,warmup=?,cardio=?,cooldown=?,equipment_needed=?,motivational_message=?,version=?,updated_at=? WHERE id=?', [
      sanitizeText(snapshot.title, 180), sanitizeText(snapshot.objective, 120), snapshot.type || 'personalizada', snapshot.level || 'iniciante', snapshot.modality || 'academia', snapshot.location || '', snapshot.frequencyPerWeek || snapshot.frequency_per_week || '', snapshot.estimatedDuration || snapshot.estimated_duration || '', snapshot.startDate || snapshot.start_date || '', snapshot.reviewDate || snapshot.review_date || '', 'em_revisao', sanitizeText(snapshot.notes, 1200), sanitizeText(snapshot.safetyNotes || snapshot.safety_notes, 1200), sanitizeText(snapshot.progressionRule || snapshot.progression_rule, 1200), snapshot.reviewFrequency || snapshot.review_frequency || '30 dias', sanitizeText(snapshot.loadAdjustment || snapshot.load_adjustment, 600), sanitizeText(snapshot.weeklyGoal || snapshot.weekly_goal, 600), sanitizeText(snapshot.warmup, 600), sanitizeText(snapshot.cardio, 600), sanitizeText(snapshot.cooldown, 600), sanitizeText(snapshot.equipmentNeeded || snapshot.equipment_needed, 600), sanitizeText(snapshot.motivationalMessage || snapshot.motivational_message, 600), newVersion, now, plan.id
    ]);
    for (let di = 0; di < (snapshot.days || []).length; di++) {
      const d = snapshot.days[di];
      const dayId = id('wday');
      run('INSERT INTO workout_days (id,workspace_id,workout_plan_id,name,focus,muscle_group,weekday,day_type,day_order,intensity,estimated_duration,optional,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [dayId, user.workspaceId, plan.id, sanitizeText(d.name || `Treino ${di + 1}`, 120), sanitizeText(d.focus, 160), d.muscleGroup || d.muscle_group || '', sanitizeText(d.weekday || d.weekDay || '', 40), sanitizeText(d.dayType || d.day_type || (d.exercises?.length ? 'treino' : 'descanso'), 40), Number(d.dayOrder || d.day_order || di + 1), d.intensity || 'moderada', d.estimatedDuration || d.estimated_duration || '', d.optional ? 1 : 0, sanitizeText(d.notes, 800), now]);
      for (let ei = 0; ei < (d.exercises || []).length; ei++) {
        const e = d.exercises[ei];
        run('INSERT INTO workout_exercises (id,workspace_id,workout_day_id,exercise_id,name,muscle_group,category,equipment,sets,reps,load,load_unit,rest_seconds,tempo,rpe,rir,method,notes,video_url,image_url,substitutions,cautions,exercise_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id('wex'), user.workspaceId, dayId, e.exerciseId || e.exercise_id || null, sanitizeText(e.name, 140), e.muscleGroup || e.muscle_group || '', e.category || '', e.equipment || '', String(e.sets || ''), String(e.reps || ''), String(e.load || ''), e.loadUnit || e.load_unit || 'kg', String(e.restSeconds || e.rest_seconds || e.rest || ''), e.tempo || '', String(e.rpe || ''), String(e.rir || ''), e.method || 'tradicional', sanitizeText(e.notes, 1000), resolveTutorialUrl(e), sanitizeText(e.imageUrl || e.image_url, 500), sanitizeText(e.substitutions, 800), sanitizeText(e.cautions, 800), Number(e.exerciseOrder || e.exercise_order || ei + 1), now]);
      }
    }
    run('INSERT INTO workout_plan_versions (id,workspace_id,workout_plan_id,version,snapshot_json,changed_by,reason,created_at) VALUES (?,?,?,?,?,?,?,?)', [id('wver'), user.workspaceId, plan.id, newVersion, toJSON(workoutPlanSnapshot(plan.id)), user.id, sanitizeText(body.reason || `Restaurada a partir da versão v${versionRow.version}`, 300), now]);
    audit(user, 'workout_plan_version_restored', 'workout_plan', plan.id, `Versão restaurada: ${versionRow.version}`);
    return send(res, 200, { bootstrap: bootstrap(user), plan: workoutPlanSnapshot(plan.id) });
  }


  const workoutExerciseAddMatch = pathname.match(/^\/api\/workout-days\/([^/]+)\/exercises$/);
  if (workoutExerciseAddMatch && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const day = get('SELECT d.*, p.trainer_id, p.student_id, p.id AS plan_id FROM workout_days d JOIN workout_plans p ON p.id=d.workout_plan_id WHERE d.id=?', [workoutExerciseAddMatch[1]]);
    if (!day || !assertWorkspace(user, day.workspace_id)) return send(res, 404, { error: 'Dia/treino não encontrado.' });
    if (body.name && get('SELECT id FROM workout_exercises WHERE workout_day_id=? AND LOWER(name)=LOWER(?) LIMIT 1', [day.id, body.name])) return send(res, 409, { error: 'Este exercício já está neste treino.' });
    const now = nowISO();
    const order = Number(body.order || (get('SELECT COALESCE(MAX(exercise_order),0)+1 AS next_order FROM workout_exercises WHERE workout_day_id=?', [day.id])?.next_order || 1));
    const exId = id('wex');
    run('INSERT INTO workout_exercises (id,workspace_id,workout_day_id,exercise_id,name,muscle_group,category,equipment,sets,reps,load,load_unit,rest_seconds,tempo,rpe,rir,method,notes,video_url,image_url,substitutions,cautions,exercise_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [exId, user.workspaceId, day.id, body.exerciseId || body.exercise_id || null, sanitizeText(body.name, 140), sanitizeText(body.muscleGroup || body.muscle_group, 80), sanitizeText(body.category, 80), sanitizeText(body.equipment, 80), String(body.sets || '3'), String(body.reps || '10-12'), sanitizeText(body.load, 80), body.loadUnit || body.load_unit || 'kg', String(body.rest || body.restSeconds || body.rest_seconds || '60s'), sanitizeText(body.tempo, 40), String(body.rpe || ''), String(body.rir || ''), body.method || 'tradicional', sanitizeText(body.notes || body.executionNotes || body.execution_notes, 1000), resolveTutorialUrl(body), sanitizeText(body.imageUrl || body.image_url, 500), sanitizeText(body.substitutions, 800), sanitizeText(body.cautions, 800), order, now]);
    const plan = get('SELECT * FROM workout_plans WHERE id=?', [day.plan_id]);
    const version = Number(plan?.version || 1) + 1;
    if (plan) {
      run('UPDATE workout_plans SET version=?, updated_at=? WHERE id=?', [version, now, plan.id]);
      run('INSERT INTO workout_plan_versions (id,workspace_id,workout_plan_id,version,snapshot_json,changed_by,reason,created_at) VALUES (?,?,?,?,?,?,?,?)', [id('wver'), user.workspaceId, plan.id, version, toJSON(workoutPlanSnapshot(plan.id)), user.id, `Exercício adicionado: ${sanitizeText(body.name, 120)}`, now]);
    }
    audit(user, 'workout_exercise_added', 'workout_day', day.id, `Exercício adicionado: ${body.name}`);
    return send(res, 201, { id: exId, bootstrap: bootstrap(user), plan: workoutPlanSnapshot(day.plan_id) });
  }



  const workoutExerciseCompletionMatch = pathname.match(/^\/api\/workout-exercises\/([^/]+)\/completion$/);
  if (workoutExerciseCompletionMatch && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const ex = get('SELECT e.*, d.id AS day_id, d.workout_plan_id, d.name AS day_name, p.student_id, p.trainer_id, p.status AS plan_status FROM workout_exercises e JOIN workout_days d ON d.id=e.workout_day_id JOIN workout_plans p ON p.id=d.workout_plan_id WHERE e.id=?', [workoutExerciseCompletionMatch[1]]);
    if (!ex || !assertWorkspace(user, ex.workspace_id)) return send(res, 404, { error: 'Exercício não encontrado.' });
    const studentId = user.role === 'student' ? user.studentId : (body.studentId || ex.student_id);
    if (!studentId || !canAccessStudent(user, studentId)) return send(res, 403, { error: 'Sem permissão para marcar este exercício.' });
    if (user.role === 'student' && ex.student_id && ex.student_id !== user.studentId) return send(res, 403, { error: 'Este exercício não pertence ao aluno logado.' });
    const completed = body.completed === false || body.completed === 0 || body.completed === 'false' ? 0 : 1;
    const now = nowISO();
    const existing = get('SELECT * FROM workout_exercise_completions WHERE workspace_id=? AND student_id=? AND workout_day_id=? AND workout_exercise_id=?', [user.workspaceId, studentId, ex.day_id, ex.id]);
    if (existing) run('UPDATE workout_exercise_completions SET completed=?,completed_at=?,updated_at=? WHERE id=?', [completed, completed ? now : '', now, existing.id]);
    else run('INSERT INTO workout_exercise_completions (id,workspace_id,student_id,trainer_id,workout_plan_id,workout_day_id,workout_exercise_id,completed,completed_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [id('wexc'), user.workspaceId, studentId, ex.trainer_id || '', ex.workout_plan_id, ex.day_id, ex.id, completed, completed ? now : '', now, now]);
    const plan = get('SELECT * FROM workout_plans WHERE id=?', [ex.workout_plan_id]);
    const day = get('SELECT * FROM workout_days WHERE id=?', [ex.day_id]);
    const progress = recomputeWorkoutDayProgress({ user, plan, day, studentId, now });
    if (progress.isCompleted) {
      const existingLog = get('SELECT id FROM workout_logs WHERE workspace_id=? AND student_id=? AND workout_plan_id=? AND workout_day_id=? AND date(completed_at)=date(?) LIMIT 1', [user.workspaceId, studentId, plan.id, day.id, now]);
      if (!existingLog) {
        const logId = id('wlog');
        run('INSERT INTO workout_logs (id,workspace_id,workout_plan_id,workout_day_id,student_id,completed_at,notes,difficulty,pain_reported,created_at,points_awarded,duration_minutes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [logId, user.workspaceId, plan.id, day.id, studentId, now, 'Treino concluído por marcação de todos os exercícios.', 'concluído', '', now, 20, Number(String(day.estimated_duration || plan.estimated_duration || '0').replace(/\D/g,'') || 0)]);
        const doneExercises = all('SELECT id FROM workout_exercises WHERE workout_day_id=? ORDER BY exercise_order', [day.id]);
        for (const row of doneExercises) run('INSERT INTO workout_exercise_logs (id,workspace_id,workout_log_id,workout_exercise_id,completed,load_used,reps_done,difficulty,notes,created_at,pain_reported,workout_day_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [id('wexlog'), user.workspaceId, logId, row.id, 1, '', '', 'concluído', 'Marcado pelo aluno na ficha interativa.', now, '', day.id]);
        addStudentPoints(studentId, 20, 'Treino do dia concluído', user, { source: 'workout_day_completion', referenceId: logId, ruleKey: `workout_day_completion:${day.id}:${studentId}:${now.slice(0,10)}` });
        if (plan.trainer_id) {
          const trainerUser = get('SELECT user_id FROM trainers WHERE id=?', [plan.trainer_id]);
          if (trainerUser?.user_id) notify(user.workspaceId, trainerUser.user_id, 'Treino do aluno concluído', `Aluno concluiu todos os exercícios de ${plan.title}.`);
        }
      }
    }
    audit(user, completed ? 'workout_exercise_completed' : 'workout_exercise_unchecked', 'workout_exercise', ex.id, `${ex.name} • progresso ${progress.completedExercises}/${progress.totalExercises}`);
    return send(res, 200, { bootstrap: bootstrap(user), progress, completed: Boolean(completed) });
  }

  const workoutExercisePatchMatch = pathname.match(/^\/api\/workout-exercises\/([^/]+)$/);
  if (workoutExercisePatchMatch && req.method === 'PATCH') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const ctx = workoutExerciseContext(workoutExercisePatchMatch[1], user);
    if (!ctx) return send(res, 404, { error: 'Exercício não encontrado.' });
    const now = nowISO();
    run('UPDATE workout_exercises SET name=?, muscle_group=?, category=?, equipment=?, sets=?, reps=?, load=?, load_unit=?, rest_seconds=?, tempo=?, rpe=?, rir=?, method=?, notes=?, video_url=?, tutorial_url=?, youtube_url=?, substitutions=?, cautions=? WHERE id=?', [
      sanitizeText(body.name || ctx.ex.name, 140), sanitizeText(body.muscleGroup || body.muscle_group || ctx.ex.muscle_group, 80), sanitizeText(body.category || ctx.ex.category, 80), sanitizeText(body.equipment || ctx.ex.equipment, 80), String(body.sets ?? ctx.ex.sets ?? ''), String(body.reps ?? ctx.ex.reps ?? ''), sanitizeText(body.load ?? ctx.ex.load, 80), body.loadUnit || body.load_unit || ctx.ex.load_unit || 'kg', String(body.restSeconds || body.rest_seconds || body.rest || ctx.ex.rest_seconds || ''), sanitizeText(body.tempo || ctx.ex.tempo, 40), String(body.rpe ?? ctx.ex.rpe ?? ''), String(body.rir ?? ctx.ex.rir ?? ''), body.method || ctx.ex.method || 'tradicional', sanitizeText(body.notes ?? ctx.ex.notes, 1000), resolveTutorialUrl(body) || ctx.ex.video_url || '', resolveTutorialUrl(body) || ctx.ex.tutorial_url || '', resolveTutorialUrl(body) || ctx.ex.youtube_url || '', sanitizeText(body.substitutions ?? ctx.ex.substitutions, 800), sanitizeText(body.cautions ?? ctx.ex.cautions, 800), ctx.ex.id
    ]);
    versionWorkoutPlanAfterChange(user, ctx.plan.id, body.reason || `Exercício editado: ${body.name || ctx.ex.name}`, now);
    audit(user, 'workout_exercise_updated', 'workout_exercise', ctx.ex.id, `Exercício editado: ${body.name || ctx.ex.name}`);
    return send(res, 200, { bootstrap: bootstrap(user), plan: workoutPlanSnapshot(ctx.plan.id) });
  }

  const workoutExerciseReplaceMatch = pathname.match(/^\/api\/workout-exercises\/([^/]+)\/replace$/);
  if (workoutExerciseReplaceMatch && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const ctx = workoutExerciseContext(workoutExerciseReplaceMatch[1], user);
    if (!ctx) return send(res, 404, { error: 'Exercício não encontrado.' });
    const lib = get('SELECT * FROM exercise_library WHERE id=? AND workspace_id=?', [body.libraryExerciseId || body.exerciseId, user.workspaceId]);
    if (!lib) return send(res, 404, { error: 'Exercício substituto não encontrado na biblioteca.' });
    if (get('SELECT id FROM workout_exercises WHERE workout_day_id=? AND id<>? AND LOWER(name)=LOWER(?) LIMIT 1', [ctx.ex.workout_day_id, ctx.ex.id, lib.name])) return send(res, 409, { error: 'Este exercício já existe neste treino.' });
    const now = nowISO();
    run('UPDATE workout_exercises SET exercise_id=?, name=?, muscle_group=?, category=?, equipment=?, sets=?, reps=?, load=?, load_unit=?, rest_seconds=?, notes=?, video_url=?, image_url=?, substitutions=?, cautions=? WHERE id=?', [
      lib.id, sanitizeText(lib.name, 140), sanitizeText(lib.muscle_group, 80), sanitizeText(lib.category, 80), sanitizeText(lib.equipment, 80), String(body.sets || ctx.ex.sets || '3'), String(body.reps || ctx.ex.reps || '10-12'), sanitizeText(body.load || ctx.ex.load || '', 80), ctx.ex.load_unit || 'kg', String(body.restSeconds || body.rest || ctx.ex.rest_seconds || '60s'), sanitizeText(lib.execution_notes || lib.description || ctx.ex.notes, 1000), sanitizeText(lib.video_url, 500), sanitizeText(lib.image_url, 500), sanitizeText(lib.substitutions, 800), sanitizeText(lib.cautions, 800), ctx.ex.id
    ]);
    versionWorkoutPlanAfterChange(user, ctx.plan.id, `Exercício substituído: ${ctx.ex.name} → ${lib.name}`, now);
    audit(user, 'workout_exercise_replaced', 'workout_exercise', ctx.ex.id, `${ctx.ex.name} -> ${lib.name}`);
    return send(res, 200, { bootstrap: bootstrap(user), plan: workoutPlanSnapshot(ctx.plan.id) });
  }

  const workoutExerciseDuplicateMatch = pathname.match(/^\/api\/workout-exercises\/([^/]+)\/duplicate$/);
  if (workoutExerciseDuplicateMatch && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const ctx = workoutExerciseContext(workoutExerciseDuplicateMatch[1], user);
    if (!ctx) return send(res, 404, { error: 'Exercício não encontrado.' });
    const now = nowISO();
    const order = Number(get('SELECT COALESCE(MAX(exercise_order),0)+1 AS next_order FROM workout_exercises WHERE workout_day_id=?', [ctx.ex.workout_day_id])?.next_order || 1);
    const newId = id('wex');
    run('INSERT INTO workout_exercises (id,workspace_id,workout_day_id,exercise_id,name,muscle_group,category,equipment,sets,reps,load,load_unit,rest_seconds,tempo,rpe,rir,method,notes,video_url,image_url,substitutions,cautions,exercise_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [newId, user.workspaceId, ctx.ex.workout_day_id, ctx.ex.exercise_id || null, sanitizeText(`${ctx.ex.name} (cópia)`, 140), ctx.ex.muscle_group || '', ctx.ex.category || '', ctx.ex.equipment || '', String(ctx.ex.sets || ''), String(ctx.ex.reps || ''), String(ctx.ex.load || ''), ctx.ex.load_unit || 'kg', String(ctx.ex.rest_seconds || ''), ctx.ex.tempo || '', String(ctx.ex.rpe || ''), String(ctx.ex.rir || ''), ctx.ex.method || 'tradicional', sanitizeText(ctx.ex.notes, 1000), sanitizeText(ctx.ex.video_url, 500), sanitizeText(ctx.ex.image_url, 500), sanitizeText(ctx.ex.substitutions, 800), sanitizeText(ctx.ex.cautions, 800), order, now]);
    versionWorkoutPlanAfterChange(user, ctx.plan.id, `Exercício duplicado: ${ctx.ex.name}`, now);
    audit(user, 'workout_exercise_duplicated', 'workout_exercise', ctx.ex.id, `Cópia criada: ${newId}`);
    return send(res, 201, { id: newId, bootstrap: bootstrap(user), plan: workoutPlanSnapshot(ctx.plan.id) });
  }

  const workoutExerciseMoveMatch = pathname.match(/^\/api\/workout-exercises\/([^/]+)\/move$/);
  if (workoutExerciseMoveMatch && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const ctx = workoutExerciseContext(workoutExerciseMoveMatch[1], user);
    if (!ctx) return send(res, 404, { error: 'Exercício não encontrado.' });
    const list = all('SELECT id,exercise_order FROM workout_exercises WHERE workout_day_id=? ORDER BY exercise_order,id', [ctx.ex.workout_day_id]);
    const index = list.findIndex(row => row.id === ctx.ex.id);
    const targetIndex = body.direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= list.length) return send(res, 200, { bootstrap: bootstrap(user), plan: workoutPlanSnapshot(ctx.plan.id), message: 'Ordem mantida.' });
    const current = list[index]; const target = list[targetIndex];
    run('UPDATE workout_exercises SET exercise_order=? WHERE id=?', [target.exercise_order, current.id]);
    run('UPDATE workout_exercises SET exercise_order=? WHERE id=?', [current.exercise_order, target.id]);
    const now = nowISO();
    versionWorkoutPlanAfterChange(user, ctx.plan.id, `Exercício reordenado: ${ctx.ex.name}`, now);
    audit(user, 'workout_exercise_moved', 'workout_exercise', ctx.ex.id, body.direction === 'up' ? 'Movido para cima' : 'Movido para baixo');
    return send(res, 200, { bootstrap: bootstrap(user), plan: workoutPlanSnapshot(ctx.plan.id) });
  }

  const workoutExerciseDeleteMatch = pathname.match(/^\/api\/workout-exercises\/([^/]+)$/);
  if (workoutExerciseDeleteMatch && req.method === 'DELETE') {
    const user = requireAdmin(req, res); if (!user) return;
    const ex = get('SELECT e.*, d.workout_plan_id FROM workout_exercises e JOIN workout_days d ON d.id=e.workout_day_id WHERE e.id=?', [workoutExerciseDeleteMatch[1]]);
    if (!ex || !assertWorkspace(user, ex.workspace_id)) return send(res, 404, { error: 'Exercício não encontrado.' });
    const now = nowISO();
    const plan = get('SELECT * FROM workout_plans WHERE id=?', [ex.workout_plan_id]);
    run('DELETE FROM workout_exercises WHERE id=?', [ex.id]);
    if (plan) {
      const version = Number(plan.version || 1) + 1;
      run('UPDATE workout_plans SET version=?, updated_at=? WHERE id=?', [version, now, plan.id]);
      run('INSERT INTO workout_plan_versions (id,workspace_id,workout_plan_id,version,snapshot_json,changed_by,reason,created_at) VALUES (?,?,?,?,?,?,?,?)', [id('wver'), user.workspaceId, plan.id, version, toJSON(workoutPlanSnapshot(plan.id)), user.id, `Exercício removido: ${ex.name}`, now]);
    }
    audit(user, 'workout_exercise_removed', 'workout_exercise', ex.id, `Exercício removido: ${ex.name}`);
    return send(res, 200, { bootstrap: bootstrap(user), plan: workoutPlanSnapshot(ex.workout_plan_id) });
  }

  const workoutLogMatch = pathname.match(/^\/api\/workout-plans\/([^/]+)\/logs$/);
  if (workoutLogMatch && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const plan = get('SELECT * FROM workout_plans WHERE id=?', [workoutLogMatch[1]]);
    if (!plan || !assertWorkspace(user, plan.workspace_id)) return send(res, 404, { error: 'Ficha não encontrada.' });
    const studentId = user.role === 'student' ? user.studentId : body.studentId;
    if (!studentId || !canAccessStudent(user, studentId)) return send(res, 403, { error: 'Sem permissão para registrar treino.' });
    if (user.role === 'student' && plan.student_id && plan.student_id !== user.studentId) return send(res, 403, { error: 'Esta ficha não pertence ao aluno logado.' });
    const logId = id('wlog');
    const now = nowISO();
    const points = 20;
    run('INSERT INTO workout_logs (id,workspace_id,workout_plan_id,workout_day_id,student_id,completed_at,notes,difficulty,pain_reported,created_at,points_awarded,duration_minutes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [logId, user.workspaceId, plan.id, body.workoutDayId || null, studentId, now, sanitizeText(body.notes, 800), sanitizeText(body.difficulty, 80), sanitizeText(body.painReported, 500), now, points, Number(body.durationMinutes || 0)]);
    for (const ex of (Array.isArray(body.exercises) ? body.exercises : [])) {
      run('INSERT INTO workout_exercise_logs (id,workspace_id,workout_log_id,workout_exercise_id,completed,load_used,reps_done,difficulty,notes,created_at,pain_reported,workout_day_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [id('wexlog'), user.workspaceId, logId, ex.workoutExerciseId || null, ex.completed ? 1 : 0, sanitizeText(ex.loadUsed, 80), sanitizeText(ex.repsDone, 80), sanitizeText(ex.difficulty, 80), sanitizeText(ex.notes, 400), now, sanitizeText(ex.painReported, 300), body.workoutDayId || null]);
    }
    const pointResult = addStudentPoints(studentId, points, 'Treino concluído registrado', user, { source: 'workout_log', referenceId: logId, ruleKey: `workout_log:${logId}` });
    if (body.painReported || (Array.isArray(body.exercises) && body.exercises.some(ex => ex.painReported))) recordAntifraudEvent({ workspaceId: user.workspaceId, studentId, actorId: user.id, eventType: 'workout_pain_feedback', severity: 'medium', message: 'Aluno registrou dor/desconforto em treino.', metadata: { workoutPlanId: plan.id, logId } });
    const trainerUser = plan.trainer_id ? get('SELECT user_id FROM trainers WHERE id=?', [plan.trainer_id]) : null;
    if (trainerUser?.user_id) notify(user.workspaceId, trainerUser.user_id, 'Treino concluído', body.painReported ? 'Aluno concluiu treino e relatou dor/desconforto. Verifique o feedback.' : 'Um aluno registrou conclusão e feedback de treino.');
    audit(user, 'workout_log_created', 'workout_plan', plan.id, `Aluno registrou conclusão de treino. Pontos: ${pointResult.ok ? points : 0}`);
    return send(res, 201, { id: logId, bootstrap: bootstrap(user), points: pointResult.ok ? points : 0, pointResult });
  }

  if (pathname === '/api/workouts' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const workoutId = id('workout');
    run('INSERT INTO workouts (id,workspace_id,trainer_id,student_id,title,goal,level,method,estimated_minutes,intensity,status,exercises_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [workoutId, user.workspaceId, user.trainerId || get('SELECT id FROM trainers WHERE workspace_id=? LIMIT 1',[user.workspaceId])?.id, body.studentId || null, sanitizeText(body.title, 160), sanitizeText(body.goal, 100), body.level || 'iniciante', body.method || 'Personalizado', Number(body.estimatedMinutes || 45), body.intensity || 'medio', body.status || 'ativo', toJSON(body.exercises || []), nowISO()]);
    audit(user, 'workout_created', 'workout', workoutId, 'Ficha de treino criada.');
    return send(res, 201, { id: workoutId, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/schedules' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const scheduleId = id('session');
    if (!body.studentId || !canAccessStudent(user, body.studentId)) return send(res, 403, { error: 'Aluno inválido para este workspace.' });
    const conflict = get('SELECT id FROM schedules WHERE workspace_id=? AND date=? AND time=? AND status != ?', [user.workspaceId, body.date, body.time, 'cancelado']);
    if (conflict) return send(res, 409, { error: 'Já existe agendamento nesse horário.' });
    run('INSERT INTO schedules (id,workspace_id,trainer_id,student_id,title,date,time,type,status,location,online_link,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', [scheduleId, user.workspaceId, user.trainerId || get('SELECT id FROM trainers WHERE workspace_id=? LIMIT 1',[user.workspaceId])?.id, body.studentId, sanitizeText(body.title, 160), body.date, body.time, body.type || 'presencial', body.status || 'pendente', sanitizeText(body.location,200), sanitizeText(body.onlineLink,300), sanitizeText(body.notes,500), nowISO()]);
    audit(user, 'schedule_created', 'schedule', scheduleId, 'Agendamento criado.');
    const st = get('SELECT user_id FROM students WHERE id=?', [body.studentId]); if (st?.user_id) notify(user.workspaceId, st.user_id, 'Nova aula agendada', `${body.title} em ${body.date} às ${body.time}.`);
    return send(res, 201, { id: scheduleId, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/assessments' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const studentId = user.role === 'student' ? user.studentId : body.studentId;
    if (!studentId || !canAccessStudent(user, studentId)) return send(res, 403, { error: 'Você não pode registrar avaliação para este aluno.' });
    const student = get('SELECT * FROM students WHERE id=?', [studentId]);
    const assessmentId = id('assessment');
    const bmi = bmiInfo(Number(body.weight || student?.current_weight || 0), Number(student?.height || body.height || 0));
    let photo = { storagePath: '', mime: '', size: 0, fileName: sanitizeText(body.photoName, 120), provider: 'none' };
    if (body.photoDataUrl) {
      try {
        const bucket = process.env.SUPABASE_STORAGE_BUCKET_PROGRESS || 'progress-photos';
        const objectPath = `${user.workspaceId}/${studentId}/${assessmentId}/${safeFileName(body.photoName || 'evolucao.webp')}`;
        photo = await savePrivateDataUrl({ dataUrl: body.photoDataUrl, fileName: body.photoName || 'evolucao', allowedTypes: AVATAR_TYPES, maxBytes: 6 * 1024 * 1024, localSubdir: 'progress', bucket, objectPath, workspaceId: user.workspaceId, ownerId: studentId });
      } catch (error) {
        return send(res, error.status || 500, { error: error.message || 'Não foi possível salvar foto de evolução.' });
      }
    }
    const timeline = [{ type: 'avaliacao', title: 'Avaliação registrada', date: nowISO(), description: 'Nova atualização da linha de evolução.' }];
    const aiSummary = `Início registrado com foco em constância. IMC ${bmi.bmi || '-'} (${bmi.classification}). Use estes dados como referência geral, sem substituir avaliação profissional.`;
    run('INSERT INTO assessments (id,workspace_id,student_id,date,weight,body_fat,lean_mass,waist,abdomen,hip,chest,right_arm,left_arm,right_thigh,left_thigh,calf,photo_name,energy,sleep,soreness,mood,notes,professional_notes,created_at,bmi,bmi_classification,ai_summary,timeline_json,photo_path,photo_mime_type,photo_size) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [assessmentId, user.workspaceId, studentId, body.date || new Date().toISOString().slice(0,10), Number(body.weight || 0), Number(body.bodyFat || 0), Number(body.leanMass || 0), Number(body.waist || 0), Number(body.abdomen || 0), Number(body.hip || 0), Number(body.chest || 0), Number(body.rightArm || 0), Number(body.leftArm || 0), Number(body.rightThigh || 0), Number(body.leftThigh || 0), Number(body.calf || 0), photo.fileName || sanitizeText(body.photoName,120), Number(body.energy || 5), Number(body.sleep || 5), Number(body.soreness || 0), sanitizeText(body.mood,80), sanitizeText(body.notes,800), ADMIN_ROLES.has(user.role) ? sanitizeText(body.professionalNotes,800) : '', nowISO(), bmi.bmi, bmi.classification, aiSummary, toJSON(timeline), photo.storagePath || '', photo.mime || '', Number(photo.size || 0)]);
    databaseAdapter.mirror('assessments', { id: assessmentId, workspace_id: user.workspaceId, student_id: studentId, weight: Number(body.weight || 0), bmi: bmi.bmi, bmi_classification: bmi.classification, photo_path: photo.storagePath || '', created_at: nowISO() }, { workspaceId: user.workspaceId, entityId: assessmentId }).catch(() => {});
    audit(user, 'assessment_created', 'assessment', assessmentId, `Avaliação física registrada. Storage: ${photo.provider}`);
    return send(res, 201, { id: assessmentId, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/payments' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    if (!body.studentId || !canAccessStudent(user, body.studentId)) return send(res, 403, { error: 'Aluno inválido.' });
    const payId = id('pay');
    run('INSERT INTO payments (id,workspace_id,student_id,plan_id,amount,due_date,status,external_link,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [payId, user.workspaceId, body.studentId, body.planId, Number(body.amount || 0), body.dueDate, body.status || 'pendente', sanitizeText(body.externalLink,300), sanitizeText(body.note,500), nowISO()]);
    paymentHistory(payId, user.id, 'Cobrança criada', `Valor: R$ ${Number(body.amount || 0).toFixed(2)}`);
    audit(user, 'payment_created', 'payment', payId, 'Cobrança manual criada.');
    return send(res, 201, { id: payId, bootstrap: bootstrap(user) });
  }

  const proofUpload = pathname.match(/^\/api\/payments\/([^/]+)\/(proof|receipt)$/);
  if (proofUpload && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const payment = get('SELECT * FROM payments WHERE id = ?', [proofUpload[1]]);
    if (!payment) return send(res, 404, { error: 'Pagamento não encontrado.' });
    if (!assertWorkspace(user, payment.workspace_id) || (user.role === 'student' && user.studentId !== payment.student_id)) return send(res, 403, { error: 'Você não pode enviar comprovante para este pagamento.' });
    const body = await readBody(req);
    const parsed = parseDataUrl(body.dataUrl);
    if (!parsed) return send(res, 422, { error: 'Arquivo inválido. Envie imagem ou PDF em base64.' });
    if (!PUBLIC_TYPES.has(parsed.mime)) return send(res, 422, { error: 'Tipo de arquivo não permitido. Use imagem ou PDF.' });
    if (parsed.buffer.length > 8 * 1024 * 1024) return send(res, 413, { error: 'Comprovante deve ter no máximo 8MB.' });
    const fileName = safeFileName(body.fileName || 'comprovante');
    let storagePath = path.join(config.uploadsDir, 'proofs', fileName);
    let storageNote = 'local';
    if (hasSupabaseAdmin() && process.env.SUPABASE_STORAGE_BUCKET_PROOFS) {
      const objectPath = `${payment.workspace_id}/${payment.student_id}/${payment.id}/${fileName}`;
      try {
        await uploadPrivateObject(process.env.SUPABASE_STORAGE_BUCKET_PROOFS, objectPath, parsed.buffer, parsed.mime);
        storagePath = `supabase://${process.env.SUPABASE_STORAGE_BUCKET_PROOFS}/${objectPath}`;
        storageNote = 'supabase_storage';
      } catch (error) {
        integrationLog(payment.workspace_id, 'supabase_storage', 'proof_upload', 'error', payment.id, error.message);
        fs.writeFileSync(storagePath, parsed.buffer);
        recordStorageFallback({ workspaceId: payment.workspace_id, ownerId: payment.student_id, bucket: process.env.SUPABASE_STORAGE_BUCKET_PROOFS, objectPath, localPath: storagePath, mimeType: parsed.mime, size: parsed.buffer.length, reason: error.message });
      }
    } else {
      fs.writeFileSync(storagePath, parsed.buffer);
      if (process.env.SUPABASE_STORAGE_BUCKET_PROOFS) recordStorageFallback({ workspaceId: payment.workspace_id, ownerId: payment.student_id, bucket: process.env.SUPABASE_STORAGE_BUCKET_PROOFS, objectPath: `${payment.workspace_id}/${payment.student_id}/${payment.id}/${fileName}`, localPath: storagePath, mimeType: parsed.mime, size: parsed.buffer.length, reason: 'Supabase Storage não configurado no backend.' });
    }
    const proofPatch = { proof_name: sanitizeText(body.fileName || fileName, 120), proof_mime_type: parsed.mime, proof_size: parsed.buffer.length, proof_path: storagePath, proof_uploaded_at: nowISO(), proof_student_note: sanitizeText(body.note, 800), status: 'em_analise' };
    run('UPDATE payments SET proof_name=?, proof_mime_type=?, proof_size=?, proof_path=?, proof_uploaded_at=?, proof_student_note=?, status=? WHERE id=?', [proofPatch.proof_name, proofPatch.proof_mime_type, proofPatch.proof_size, proofPatch.proof_path, proofPatch.proof_uploaded_at, proofPatch.proof_student_note, proofPatch.status, payment.id]);
    databaseAdapter.mirror('payments', { id: payment.id, workspace_id: payment.workspace_id, student_id: payment.student_id, ...proofPatch }, { workspaceId: payment.workspace_id, entityId: payment.id }).catch(() => {});
    integrationLog(payment.workspace_id, 'storage', 'proof_upload', 'ok', payment.id, storageNote);
    paymentHistory(payment.id, user.id, 'Comprovante enviado', body.fileName || fileName);
    audit(user, 'payment_proof_uploaded', 'payment', payment.id, 'Comprovante privado enviado.');
    const admins = all('SELECT id FROM users WHERE workspace_id=? AND role IN (?,?)', [payment.workspace_id, 'admin', 'super_admin']);
    admins.forEach(a => notify(payment.workspace_id, a.id, 'Comprovante enviado', 'Um pagamento manual está aguardando análise.'));
    return send(res, 201, { ok: true, bootstrap: bootstrap(user) });
  }

  const proofGet = pathname.match(/^\/api\/payments\/([^/]+)\/(proof|receipt)$/);
  if (proofGet && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const payment = get('SELECT * FROM payments WHERE id = ?', [proofGet[1]]);
    if (!payment || !payment.proof_path) return send(res, 404, { error: 'Comprovante não encontrado.' });
    if (!assertWorkspace(user, payment.workspace_id) || (user.role === 'student' && user.studentId !== payment.student_id)) return send(res, 403, { error: 'Você não pode acessar este comprovante.' });
    const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    paymentHistory(payment.id, user.id, disposition === 'attachment' ? 'Comprovante baixado' : 'Comprovante visualizado', payment.proof_name || 'arquivo');
    audit(user, disposition === 'attachment' ? 'payment_proof_downloaded' : 'payment_proof_viewed', 'payment', payment.id, 'Acesso ao comprovante via rota protegida.');
    run('UPDATE payments SET proof_viewed_at=?, proof_viewed_by=? WHERE id=?', [nowISO(), user.id, payment.id]);
    if (String(payment.proof_path).startsWith('supabase://')) {
      const [, rest] = String(payment.proof_path).split('supabase://');
      const [bucket, ...parts] = rest.split('/');
      const objectPath = parts.join('/');
      try {
        const signed = await createSignedUrl(bucket, objectPath, disposition === 'attachment' ? 60 : 300);
        const signedUrl = signed?.signedURL || signed?.signedUrl || signed?.url || '';
        if (!signedUrl) throw new Error('Storage não retornou URL assinada.');
        res.writeHead(302, { Location: signedUrl, ...corsHeaders(req), 'Cache-Control': 'private, no-store' });
        return res.end();
      } catch (error) {
        integrationLog(payment.workspace_id, 'supabase_storage', 'proof_signed_url', 'error', payment.id, error.message);
        return send(res, 502, { error: 'Não foi possível gerar acesso seguro ao comprovante.' });
      }
    }
    if (!fs.existsSync(payment.proof_path)) return send(res, 404, { error: 'Arquivo privado não localizado no storage.' });
    const buffer = fs.readFileSync(payment.proof_path);
    res.writeHead(200, {
      'Content-Type': payment.proof_mime_type || 'application/octet-stream',
      'Content-Length': buffer.length,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(payment.proof_name || 'comprovante')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(req)
    });
    return res.end(buffer);
  }

  const paymentAction = pathname.match(/^\/api\/payments\/([^/]+)\/(approve|reject|history)$/);
  if (paymentAction) {
    const payment = get('SELECT * FROM payments WHERE id = ?', [paymentAction[1]]);
    if (!payment) return send(res, 404, { error: 'Pagamento não encontrado.' });
    if (paymentAction[2] === 'history' && req.method === 'GET') {
      const user = requireAuth(req, res); if (!user) return;
      if (!assertWorkspace(user, payment.workspace_id) || (user.role === 'student' && user.studentId !== payment.student_id)) return send(res, 403, { error: 'Sem acesso ao histórico.' });
      return send(res, 200, { history: mapRows(all('SELECT * FROM payment_history WHERE payment_id=? ORDER BY created_at', [payment.id])) });
    }
    const user = requireAdmin(req, res); if (!user) return;
    if (!assertWorkspace(user, payment.workspace_id)) return send(res, 403, { error: 'Pagamento fora do seu workspace.' });
    if (!payment.proof_path) return send(res, 409, { error: 'Não é permitido aprovar/reprovar sem comprovante.' });
    const body = await readBody(req);
    if (paymentAction[2] === 'approve' && req.method === 'POST') {
      run('UPDATE payments SET status=?, reviewed_by=?, reviewed_at=?, note=? WHERE id=?', ['aprovado', user.id, nowISO(), sanitizeText(body.note || 'Pagamento aprovado manualmente.', 500), payment.id]);
      paymentHistory(payment.id, user.id, 'Pagamento aprovado', body.note || 'Acesso liberado após validação do comprovante.');
      audit(user, 'payment_approved', 'payment', payment.id, 'Pagamento manual aprovado.');
      const st = get('SELECT user_id FROM students WHERE id=?', [payment.student_id]); if (st?.user_id) notify(payment.workspace_id, st.user_id, 'Pagamento aprovado', 'Seu pagamento foi aprovado e seu acesso está ativo.');
      return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
    }
    if (paymentAction[2] === 'reject' && req.method === 'POST') {
      const reason = sanitizeText(body.reason || body.note || 'Comprovante recusado pelo personal.', 800);
      run('UPDATE payments SET status=?, reviewed_by=?, reviewed_at=?, note=? WHERE id=?', ['recusado', user.id, nowISO(), reason, payment.id]);
      paymentHistory(payment.id, user.id, 'Pagamento recusado', reason);
      audit(user, 'payment_rejected', 'payment', payment.id, reason);
      const st = get('SELECT user_id FROM students WHERE id=?', [payment.student_id]); if (st?.user_id) notify(payment.workspace_id, st.user_id, 'Pagamento recusado', reason);
      return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
    }
  }


  if (pathname === '/api/profile/avatar/status' && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const row = get('SELECT id,workspace_id,student_id,trainer_id,avatar,avatar_public_url,avatar_storage_path,avatar_mime_type,avatar_size,avatar_data_url,avatar_updated_at,avatar_storage_provider FROM users WHERE id=?', [user.id]);
    const linkedStudent = row?.student_id ? get('SELECT avatar_url FROM students WHERE id=?', [row.student_id]) : null;
    const linkedTrainer = row?.trainer_id ? get('SELECT avatar_url FROM trainers WHERE id=?', [row.trainer_id]) : null;
    const storagePath = row?.avatar_storage_path || '';
    const storageReachable = Boolean(row?.avatar_public_url || avatarUrlFromStoragePath(storagePath) || (storagePath && fs.existsSync(storagePath)) || row?.avatar_data_url);
    const avatar = avatarClientUrlFromRow(row) || linkedStudent?.avatar_url || linkedTrainer?.avatar_url || '';
    const linkedAvatar = linkedStudent?.avatar_url || linkedTrainer?.avatar_url || '';
    const nextBootstrap = bootstrap(normalizeUser(get('SELECT * FROM users WHERE id=?', [user.id])));
    const bootstrapAvatar = nextBootstrap?.user?.avatar || '';
    return send(res, 200, {
      ok: Boolean(avatar && bootstrapAvatar && (storageReachable || String(avatar).startsWith('/api/profile/avatar/'))),
      avatar,
      linkedAvatar,
      bootstrapAvatar,
      storageReachable,
      storageProvider: row?.avatar_storage_provider || (row?.avatar_public_url ? 'supabase_public_url' : row?.avatar_data_url ? 'embedded_fallback' : ''),
      updatedAt: row?.avatar_updated_at || '',
      size: row?.avatar_size || 0,
      checks: { usersAvatar: Boolean(row?.avatar), publicUrl: Boolean(row?.avatar_public_url), linkedProfileAvatar: Boolean(linkedAvatar), storagePath: Boolean(storagePath), dataUrlFallback: Boolean(row?.avatar_data_url), bootstrapAvatar: Boolean(bootstrapAvatar), noTokenInUrl: !String(avatar).includes('access_token'), notUserIdOnly: !/^user_[a-z0-9_-]+$/i.test(String(avatar || '')) },
      bootstrap: nextBootstrap
    });
  }

  if (pathname === '/api/profile/avatar/repair' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const row = get('SELECT id,workspace_id,student_id,trainer_id,avatar,avatar_public_url,avatar_storage_path,avatar_mime_type,avatar_size,avatar_data_url,avatar_updated_at,avatar_storage_provider FROM users WHERE id=?', [user.id]);
    if (!row) return send(res, 404, { error: 'Usuário não encontrado para reparar avatar.' });
    const linkedStudent = row.student_id ? get('SELECT avatar_url FROM students WHERE id=?', [row.student_id]) : null;
    const linkedTrainer = row.trainer_id ? get('SELECT avatar_url FROM trainers WHERE id=?', [row.trainer_id]) : null;
    const storagePath = row.avatar_storage_path || '';
    const hasStorage = Boolean(row.avatar_public_url || avatarUrlFromStoragePath(storagePath) || (storagePath && fs.existsSync(storagePath)) || row.avatar_data_url);
    const avatar = avatarClientUrlFromRow(row) || linkedStudent?.avatar_url || linkedTrainer?.avatar_url || (hasStorage ? `/api/profile/avatar/${user.id}` : '');
    if (!avatar) {
      return send(res, 409, {
        error: 'Nenhum avatar salvo foi encontrado para reparar. Envie a foto novamente.',
        repaired: false,
        checks: { usersAvatar: Boolean(row.avatar), linkedStudentAvatar: Boolean(linkedStudent?.avatar_url), linkedTrainerAvatar: Boolean(linkedTrainer?.avatar_url), storagePath: Boolean(storagePath), dataUrlFallback: Boolean(row.avatar_data_url) },
        bootstrap: bootstrap(normalizeUser(get('SELECT * FROM users WHERE id=?', [user.id])))
      });
    }
    const updatedAt = nowISO();
    run("UPDATE users SET avatar=?, avatar_public_url=CASE WHEN ? LIKE 'http%' THEN ? ELSE avatar_public_url END, avatar_updated_at=COALESCE(avatar_updated_at, ?) WHERE id=?", [avatar, avatar, avatar, updatedAt, user.id]);
    propagateUserAvatar({ user, avatarUrl: avatar });
    const persisted = get('SELECT id,avatar,avatar_public_url,avatar_storage_path,avatar_size,avatar_updated_at FROM users WHERE id=?', [user.id]);
    audit(user, 'profile_avatar_repaired', 'user', user.id, 'Avatar ressincronizado entre users, perfil vinculado, comentários e reactions.');
    return send(res, 200, {
      ok: true,
      repaired: true,
      avatar,
      persisted: { avatar: persisted?.avatar || avatar, publicUrl: persisted?.avatar_public_url || '', storagePath: persisted?.avatar_storage_path || row.avatar_storage_path || '', size: persisted?.avatar_size || row.avatar_size || 0, updatedAt: persisted?.avatar_updated_at || updatedAt },
      checks: { usersAvatar: Boolean(persisted?.avatar || row.avatar), publicUrl: Boolean(persisted?.avatar_public_url || row.avatar_public_url), linkedProfileAvatar: Boolean(linkedStudent?.avatar_url || linkedTrainer?.avatar_url), storageReachable: hasStorage, dataUrlFallback: Boolean(row.avatar_data_url), noTokenInUrl: !String(avatar).includes('access_token'), notUserIdOnly: !/^user_[a-z0-9_-]+$/i.test(String(avatar || '')) },
      bootstrap: bootstrap(normalizeUser(get('SELECT * FROM users WHERE id=?', [user.id])))
    });
  }


  if (pathname === '/api/profile/avatar' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    try {
      const bucket = supabaseAvatarBucket();
      const parsed = parseDataUrl(body.dataUrl || '');
      const originalName = safeFileName(body.fileName || 'avatar.webp');
      const ext = parsed?.mime === 'image/png' ? 'png' : parsed?.mime === 'image/jpeg' ? 'jpg' : 'webp';
      const objectPath = `${user.workspaceId}/${user.id}/avatar-${Date.now()}.${ext}`;
      const saved = await savePrivateDataUrl({
        dataUrl: body.dataUrl,
        fileName: originalName,
        allowedTypes: AVATAR_TYPES,
        maxBytes: 3 * 1024 * 1024,
        localSubdir: 'avatars',
        bucket,
        objectPath,
        workspaceId: user.workspaceId,
        ownerId: user.id,
        reasonWhenLocal: 'Supabase Storage de avatars não configurado ou indisponível.'
      });
      const avatarUrl = saved.provider === 'supabase_storage' && saved.publicUrl ? saved.publicUrl : `/api/profile/avatar/${user.id}`;
      const dbDataUrl = saved.provider === 'supabase_storage' ? '' : String(body.dataUrl || '');
      const updatedAt = nowISO();
      run('UPDATE users SET avatar=?, avatar_public_url=?, avatar_storage_path=?, avatar_mime_type=?, avatar_size=?, avatar_data_url=?, avatar_updated_at=?, avatar_storage_provider=? WHERE id=?', [avatarUrl, saved.publicUrl || '', saved.storagePath, saved.mime, saved.size, dbDataUrl, updatedAt, saved.provider, user.id]);
      propagateUserAvatar({ user, avatarUrl });
      databaseAdapter.mirror('users', { id: user.id, workspace_id: user.workspaceId, avatar: avatarUrl, avatar_public_url: saved.publicUrl || '', avatar_storage_path: saved.storagePath, avatar_mime_type: saved.mime, avatar_size: saved.size, avatar_updated_at: updatedAt, avatar_storage_provider: saved.provider }, { workspaceId: user.workspaceId, entityId: user.id }).catch(() => {});
      if (user.studentId) databaseAdapter.mirror('students', { id: user.studentId, workspace_id: user.workspaceId, avatar_url: avatarUrl, updated_at: updatedAt }, { workspaceId: user.workspaceId, entityId: user.studentId }).catch(() => {});
      if (user.trainerId) databaseAdapter.mirror('trainers', { id: user.trainerId, workspace_id: user.workspaceId, avatar_url: avatarUrl, updated_at: updatedAt }, { workspaceId: user.workspaceId, entityId: user.trainerId }).catch(() => {});
      const persisted = get('SELECT id,avatar,avatar_public_url,avatar_storage_path,avatar_size,avatar_updated_at,avatar_storage_provider FROM users WHERE id=?', [user.id]);
      if (!persisted?.avatar || /^user_[a-z0-9_-]+$/i.test(String(persisted.avatar || ''))) {
        throw Object.assign(new Error('Avatar salvo, mas users.avatar não recebeu URL/caminho válido.'), { status: 500 });
      }
      integrationLog(user.workspaceId, 'supabase_storage', 'avatar_upload', saved.provider === 'supabase_storage' ? 'ok' : 'warn', user.id, `${saved.provider} • ${saved.size} bytes • bucket ${bucket}`);
      audit(user, 'profile_avatar_uploaded_supabase', 'user', user.id, `Foto de perfil salva via ${saved.provider}, persistida no banco e propagada no bootstrap.`);
      return send(res, 200, {
        ok: true,
        avatarUrl,
        publicUrl: saved.publicUrl || '',
        storageProvider: saved.provider,
        storagePath: saved.storagePath,
        persisted: { avatar: persisted.avatar, publicUrl: persisted.avatar_public_url || '', storagePath: persisted.avatar_storage_path || '', size: persisted.avatar_size, updatedAt: persisted.avatar_updated_at, provider: persisted.avatar_storage_provider },
        bootstrap: bootstrap(normalizeUser(get('SELECT * FROM users WHERE id=?', [user.id])))
      });
    } catch (error) {
      return send(res, error.status || 500, { error: error.message || 'Não foi possível salvar avatar.' });
    }
  }

  const avatarGet = pathname.match(/^\/api\/profile\/avatar\/([^/]+)$/);
  if (avatarGet && req.method === 'GET') {
    const targetId = sanitizeText(decodeURIComponent(avatarGet[1] || ''), 120);
    const target = get('SELECT id,workspace_id,name,avatar,avatar_public_url,avatar_storage_path,avatar_mime_type,avatar_data_url FROM users WHERE id=?', [targetId]);
    const fallbackSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="26" fill="#0b1b12"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="28" font-weight="800" fill="#00e676">FP</text></svg>`);
    const sendAvatarFallback = (status = 404) => { res.writeHead(status, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Length': fallbackSvg.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...corsHeaders(req) }); return res.end(fallbackSvg); };
    if (!target) return sendAvatarFallback(404);
    const publicAvatar = avatarClientUrlFromRow(target);
    if (publicAvatar && /^https?:\/\//.test(publicAvatar)) {
      res.writeHead(302, { Location: publicAvatar, ...corsHeaders(req), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end();
    }
    if (target.avatar_storage_path && (String(target.avatar_storage_path).startsWith('supabase://') || fs.existsSync(target.avatar_storage_path))) {
      return servePrivateStoragePath({ req, res, storagePath: target.avatar_storage_path, mimeType: target.avatar_mime_type || 'image/webp', fileName: `${target.name || 'avatar'}.webp`, disposition: 'inline', workspaceId: target.workspace_id, relatedId: target.id });
    }
    const embedded = parseDataUrl(target.avatar_data_url || '');
    if (embedded) {
      res.writeHead(200, {
        'Content-Type': target.avatar_mime_type || embedded.mime || 'image/webp',
        'Content-Length': embedded.buffer.length,
        'Content-Disposition': `inline; filename="${encodeURIComponent(target.name || 'avatar')}.webp"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        ...corsHeaders(req)
      });
      return res.end(embedded.buffer);
    }
    return sendAvatarFallback(404);
  }


  if (pathname === '/api/student/onboarding/request-personal' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    if (user.role !== 'student') return send(res, 403, { error: 'Somente aluno pode solicitar acompanhamento.' });
    const body = await readBody(req);
    const student = get('SELECT * FROM students WHERE id=?', [user.studentId]);
    if (!student) return send(res, 404, { error: 'Aluno não encontrado.' });
    const trainer = get('SELECT * FROM trainers WHERE id=? AND workspace_id=? AND COALESCE(active,1)=1', [body.trainerId || '', user.workspaceId]);
    if (!trainer) return send(res, 404, { error: 'Personal indisponível.' });
    const trainerPlan = body.trainerPlanId ? get('SELECT * FROM trainer_plans WHERE id=? AND trainer_id=? AND status=?', [body.trainerPlanId, trainer.id, 'ativo']) : get('SELECT * FROM trainer_plans WHERE trainer_id=? AND status=? ORDER BY price LIMIT 1', [trainer.id, 'ativo']);
    const now = nowISO();
    run('UPDATE students SET trainer_id=?, requested_trainer_id=?, requested_trainer_plan_id=?, city=?, state=?, modality=?, goal=?, level=?, plan_id=?, status=?, request_status=?, onboarding_stage=?, payment_method=?, request_message=?, preferred_payment_day=? WHERE id=?', [trainer.id, trainer.id, trainerPlan?.id || '', sanitizeText(body.city || student.city || '', 120), sanitizeText(body.state || student.state || '', 30), sanitizeText(body.modality || student.modality || 'online', 40), sanitizeText(body.goal || student.goal || '', 160), sanitizeText(body.level || student.level || 'iniciante', 40), trainerPlan?.id || student.plan_id || '', 'aguardando_aprovacao', 'aguardando_aprovacao', 'aguardando_aprovacao', sanitizeText(body.paymentMethod || 'pix_manual', 60), sanitizeText(body.message || body.requestMessage || '', 800), sanitizeText(body.preferredPaymentDay || student.preferred_payment_day || 'combinar', 40), student.id]);
    seedBadgeIfMissing(user.workspaceId, student.id, 'primeiro_personal_escolhido', 'Primeiro personal escolhido', '🤝', 'Aluno enviou solicitação para um personal.', 'comum', true);
    audit(user, 'student_personal_requested', 'student', student.id, `Solicitação enviada para ${trainer.name}.`);
    if (trainer.user_id) notify(user.workspaceId, trainer.user_id, 'Nova solicitação de acompanhamento', `${student.name} solicitou acompanhamento. Plano: ${trainerPlan?.name || 'a combinar'}.`);
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/student/onboarding/cancel-request' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    if (user.role !== 'student') return send(res, 403, { error: 'Somente aluno pode cancelar sua solicitação.' });
    const student = get('SELECT * FROM students WHERE id=?', [user.studentId]);
    if (!student) return send(res, 404, { error: 'Aluno não encontrado.' });
    run("UPDATE students SET trainer_id='', requested_trainer_id='', requested_trainer_plan_id='', status='sem_personal', request_status='sem_personal', onboarding_stage='perfil_basico' WHERE id=?", [student.id]);
    audit(user, 'student_personal_request_cancelled', 'student', student.id, 'Aluno cancelou solicitação de personal.');
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/habits/quick-checkin' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const studentId = user.role === 'student' ? user.studentId : body.studentId;
    if (!studentId || !canAccessStudent(user, studentId)) return send(res, 403, { error: 'Sem acesso ao hábito deste aluno.' });
    const student = get('SELECT * FROM students WHERE id=?', [studentId]);
    const quick = body.quick || body;
    const result = quickHabitFeedback(quick);
    const date = body.date || new Date().toISOString().slice(0, 10);
    const habitId = id('habit');
    const advanced = body.advanced || {};
    run('INSERT INTO habits (id,workspace_id,student_id,date,water_ml,sleep_hours,steps,meals,mood,energy,notes,created_at,protein_g,carbs_g,fat_g,calories,fiber_g,supplements_taken_json,quick_checkin_json,quick_score,quick_feedback,advanced_mode) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [habitId, user.workspaceId, studentId, date, Number(advanced.waterMl || 0), Number(advanced.sleepHours || 0), Number(advanced.steps || 0), Number(advanced.meals || 0), sanitizeText(quick.mood || '', 80), Number(advanced.energy || 0), sanitizeText(body.notes || advanced.notes || '', 800), nowISO(), Number(advanced.proteinG || 0), Number(advanced.carbsG || 0), Number(advanced.fatG || 0), Number(advanced.calories || 0), Number(advanced.fiberG || 0), toJSON(quick.supplements || []), toJSON(quick), result.score, result.feedback, Object.keys(advanced).length ? 1 : 0]);
    seedBadgeIfMissing(user.workspaceId, studentId, 'habito_registrado', 'Hábito registrado', '💧', 'Aluno registrou um check-in de rotina.', 'comum', true);
    audit(user, 'habit_quick_checkin_created', 'habit', habitId, `Check-in rápido salvo. Score: ${result.score}.`);
    if (student?.user_id && user.id !== student.user_id) notify(user.workspaceId, student.user_id, 'Check-in de hábitos salvo', result.feedback);
    return send(res, 201, { ok: true, feedback: result.feedback, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/trainer/payment-settings' && req.method === 'PUT') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const trainerId = user.trainerId || sanitizeText(body.trainerId || '', 80);
    const trainer = get('SELECT * FROM trainers WHERE id=? AND workspace_id=?', [trainerId, user.workspaceId]);
    if (!trainer && !SUPER_ROLES.has(user.role)) return send(res, 404, { error: 'Personal não encontrado.' });
    const existing = get('SELECT * FROM trainer_payment_settings WHERE trainer_id=?', [trainerId]);
    const now = nowISO();
    if (existing) run('UPDATE trainer_payment_settings SET pix_key_type=?,pix_key=?,receiver_name=?,bank_name=?,document_optional=?,instructions=?,qr_code_url=?,accepts_manual_payment=?,accepts_receipt=?,updated_at=? WHERE id=?', [body.pixKeyType || '', sanitizeText(body.pixKey || '', 200), sanitizeText(body.receiverName || trainer?.name || '', 160), sanitizeText(body.bankName || '', 160), sanitizeText(body.documentOptional || '', 80), sanitizeText(body.instructions || '', 800), sanitizeText(body.qrCodeUrl || '', 800), body.acceptsManualPayment === false ? 0 : 1, body.acceptsReceipt === false ? 0 : 1, now, existing.id]);
    else run('INSERT INTO trainer_payment_settings (id,workspace_id,trainer_id,pix_key_type,pix_key,receiver_name,bank_name,document_optional,instructions,qr_code_url,accepts_manual_payment,accepts_receipt,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id('payset'), user.workspaceId, trainerId, body.pixKeyType || '', sanitizeText(body.pixKey || '', 200), sanitizeText(body.receiverName || trainer?.name || '', 160), sanitizeText(body.bankName || '', 160), sanitizeText(body.documentOptional || '', 80), sanitizeText(body.instructions || '', 800), sanitizeText(body.qrCodeUrl || '', 800), body.acceptsManualPayment === false ? 0 : 1, body.acceptsReceipt === false ? 0 : 1, now, now]);
    audit(user, 'trainer_payment_settings_saved', 'trainer', trainerId, 'Configurações Pix do personal salvas.');
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/trainer/plans' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const trainerId = user.trainerId || body.trainerId;
    if (!trainerId) return send(res, 422, { error: 'Informe o personal.' });
    const planId = id('trainer_plan');
    const now = nowISO();
    run('INSERT INTO trainer_plans (id,workspace_id,trainer_id,name,price,billing_cycle,description,benefits_json,classes_limit,contents_included,support_included,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [planId, user.workspaceId, trainerId, sanitizeText(body.name || 'Plano do aluno', 120), Number(body.price || 0), sanitizeText(body.billingCycle || 'mensal', 40), sanitizeText(body.description || '', 700), toJSON(String(body.benefits || '').split('\n').map(x => x.trim()).filter(Boolean)), sanitizeText(body.classesLimit || '', 120), sanitizeText(body.contentsIncluded || '', 200), sanitizeText(body.supportIncluded || '', 200), body.status || 'ativo', now, now]);
    audit(user, 'trainer_plan_created', 'trainer_plan', planId, 'Plano do personal para aluno criado.');
    return send(res, 201, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/platform-plans' && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return send(res, 200, { plans: platformPlans(user.workspaceId), bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/platform-subscriptions/checkout' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    if (!user.trainerId) return send(res, 403, { error: 'Apenas personal pode iniciar assinatura da plataforma por este fluxo.' });
    const body = await readBody(req);
    const plan = platformPlanByIdOrCode(user.workspaceId, body.platformPlanId || body.planId || body.code || 'fitpro_start');
    if (!plan || plan.status !== 'ativo') return send(res, 404, { error: 'Plano da plataforma não encontrado ou inativo.' });
    const trainer = get('SELECT * FROM trainers WHERE id=? AND workspace_id=?', [user.trainerId, user.workspaceId]);
    if (!trainer) return send(res, 404, { error: 'Personal não encontrado.' });
    const now = nowISO();
    const existing = get('SELECT * FROM platform_subscriptions WHERE workspace_id=? AND trainer_id=? ORDER BY created_at DESC LIMIT 1', [user.workspaceId, user.trainerId]);
    const subId = existing?.id || id('platform_sub');
    const dueDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0,10);
    if (existing) run('UPDATE platform_subscriptions SET platform_plan_id=?,plan_name=?,amount=?,status=?,source=?,activation_code_id=NULL,due_date=?,starts_at=COALESCE(starts_at,?),expires_at=NULL,payment_method=?,metadata=?,updated_at=? WHERE id=?', [plan.id, plan.name, Number(plan.price || 0), 'pendente', 'mercado_pago', dueDate, now, 'mercado_pago', toJSON({ planCode: plan.code, flow: 'personal_to_platform' }), now, subId]);
    else run('INSERT INTO platform_subscriptions (id,workspace_id,trainer_id,plan_name,amount,status,due_date,paid_at,mercado_pago_payment_id,created_at,updated_at,platform_plan_id,source,activation_code_id,starts_at,expires_at,payment_method,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [subId, user.workspaceId, user.trainerId, plan.name, Number(plan.price || 0), 'pendente', dueDate, '', '', now, now, plan.id, 'mercado_pago', '', now, '', 'mercado_pago', toJSON({ planCode: plan.code, flow: 'personal_to_platform' })]);
    run('UPDATE trainers SET platform_subscription_status=?, platform_plan_name=?, platform_plan_amount=? WHERE id=?', ['pendente', plan.name, Number(plan.price || 0), user.trainerId]);
    paymentLog(user.workspaceId, subId, 'platform_subscription', 'checkout_requested', user.id, { planId: plan.id, amount: plan.price });
    try {
      const preference = await createMercadoPagoPreference({ payment: { id: subId, workspace_id: user.workspaceId, plan_id: plan.id, student_id: user.trainerId, amount: Number(plan.price || 0) }, student: { name: trainer.name, email: trainer.email }, plan, notificationUrl: `${config.apiUrl}/api/mercado-pago/webhook` });
      const initPoint = preference.init_point || preference.sandbox_init_point || '';
      run('UPDATE platform_subscriptions SET mercado_pago_payment_id=?, metadata=?, updated_at=? WHERE id=?', [preference.id || '', toJSON({ preferenceId: preference.id || '', initPoint, planCode: plan.code, flow: 'personal_to_platform' }), nowISO(), subId]);
      audit(user, 'platform_subscription_checkout_created', 'platform_subscription', subId, `Checkout Mercado Pago criado para ${plan.name}.`);
      return send(res, 200, { ok: true, initPoint, preferenceId: preference.id || '', subscriptionId: subId, bootstrap: bootstrap(user) });
    } catch (error) {
      paymentLog(user.workspaceId, subId, 'platform_subscription', 'checkout_error', user.id, { error: error.message });
      const message = error.message || 'Mercado Pago ainda não configurado no backend.';
      audit(user, 'platform_subscription_checkout_guided_fallback', 'platform_subscription', subId, message);
      return send(res, 200, { ok: false, checkoutConfigured: false, message: `${message} Use código de ativação ou pagamento manual enquanto a integração não estiver pronta.`, subscriptionId: subId, bootstrap: bootstrap(user) });
    }
  }

  if (pathname === '/api/platform-activation-codes/validate' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    if (user.role === 'student') return send(res, 403, { error: 'Aluno não pode validar código de plano do personal.' });
    const body = await readBody(req);
    const validation = activationCodeValidation({ workspaceId: user.workspaceId, code: body.code, user, trainerId: user.trainerId || body.trainerId || '' });
    if (!validation.valid) {
      audit(user, 'platform_activation_code_validate_failed', 'platform_activation_code', 'unknown', validation.reason);
      return send(res, 422, { valid: false, message: validation.reason });
    }
    const expiresAt = new Date(Date.now() + Number(validation.code.duration_days || 30) * 86400000).toISOString();
    return send(res, 200, { valid: true, plan: mapRows([validation.plan])[0].name, planId: validation.plan.id, durationDays: Number(validation.code.duration_days || 30), expiresAt, message: `Código válido para ${validation.plan.name} por ${validation.code.duration_days} dias.` });
  }

  if (pathname === '/api/platform-activation-codes/redeem' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    if (!user.trainerId) return send(res, 403, { error: 'Somente personal pode resgatar código de ativação do próprio plano.' });
    const body = await readBody(req);
    try {
      const result = applyActivationCode({ user, code: body.code });
      notify(user.workspaceId, user.id, 'Código ativado com sucesso', `Seu acesso ${result.plan.name} foi liberado até ${result.expiresAt.slice(0,10)}.`);
      return send(res, 200, { ok: true, ...result, bootstrap: bootstrap(user) });
    } catch (error) {
      audit(user, 'platform_activation_code_redeem_failed', 'platform_activation_code', 'unknown', error.message || String(error));
      return send(res, 422, { error: error.message || String(error), bootstrap: bootstrap(user) });
    }
  }

  if (pathname === '/api/admin/platform-activation-codes' && req.method === 'GET') {
    const user = requireSuper(req, res); if (!user) return;
    const codes = all('SELECT * FROM platform_activation_codes WHERE workspace_id=? ORDER BY created_at DESC LIMIT 300', [user.workspaceId]).map(row => mapActivationCode(row, true));
    const redemptions = mapRows(all('SELECT * FROM activation_code_redemptions WHERE workspace_id=? ORDER BY redeemed_at DESC LIMIT 300', [user.workspaceId]));
    return send(res, 200, { codes, redemptions, platformPlans: platformPlans(user.workspaceId), bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/admin/platform-activation-codes' && req.method === 'POST') {
    const user = requireSuper(req, res); if (!user) return;
    const body = await readBody(req);
    const plan = platformPlanByIdOrCode(user.workspaceId, body.platformPlanId || body.planId || body.planCode || 'fitpro_plus');
    if (!plan) return send(res, 404, { error: 'Plano da plataforma não encontrado.' });
    const durationDays = Math.max(1, Number(body.durationDays || 30));
    const rawCode = body.code ? normalizeActivationCode(body.code) : generateActivationCode(plan.code, durationDays);
    if (!rawCode || rawCode.length < 8) return send(res, 422, { error: 'Código muito curto. Use ao menos 8 caracteres.' });
    if (get('SELECT id FROM platform_activation_codes WHERE UPPER(code)=?', [rawCode])) return send(res, 409, { error: 'Este código já existe.' });
    const codeId = id('act_code');
    const now = nowISO();
    run('INSERT INTO platform_activation_codes (id,workspace_id,code,name,type,platform_plan_id,duration_days,max_uses,used_count,status,expires_at,assigned_trainer_id,created_by,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [codeId, user.workspaceId, rawCode, sanitizeText(body.name || `Liberação ${plan.name}`, 140), sanitizeText(body.type || 'cortesia', 60), plan.id, durationDays, Math.max(1, Number(body.maxUses || 1)), 0, body.status || 'ativo', body.expiresAt || '', sanitizeText(body.assignedTrainerId || '', 80), user.id, sanitizeText(body.notes || '', 1000), now, now]);
    audit(user, 'platform_activation_code_created', 'platform_activation_code', codeId, `Código criado para ${plan.name} por ${durationDays} dias.`);
    paymentLog(user.workspaceId, codeId, 'platform_activation_code', 'created', user.id, { code: rawCode, planId: plan.id, durationDays });
    return send(res, 201, { ok: true, code: mapActivationCode(get('SELECT * FROM platform_activation_codes WHERE id=?', [codeId]), true), bootstrap: bootstrap(user) });
  }

  const adminActivationCodeAction = pathname.match(/^\/api\/admin\/platform-activation-codes\/([^/]+)$/);
  if (adminActivationCodeAction && req.method === 'PATCH') {
    const user = requireSuper(req, res); if (!user) return;
    const body = await readBody(req);
    const row = get('SELECT * FROM platform_activation_codes WHERE id=? AND workspace_id=?', [adminActivationCodeAction[1], user.workspaceId]);
    if (!row) return send(res, 404, { error: 'Código não encontrado.' });
    const nextStatus = sanitizeText(body.status || '', 40);
    if (!['ativo','inativo','cancelado','bloqueado'].includes(nextStatus)) return send(res, 422, { error: 'Status inválido para código.' });
    run('UPDATE platform_activation_codes SET status=?, updated_at=? WHERE id=?', [nextStatus, nowISO(), row.id]);
    audit(user, 'platform_activation_code_status_changed', 'platform_activation_code', row.id, `Status alterado para ${nextStatus}.`);
    paymentLog(user.workspaceId, row.id, 'platform_activation_code', `status_${nextStatus}`, user.id, { previous: row.status });
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/community-posts' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const postId = id('post');
    const studentId = user.role === 'student' ? user.studentId : body.studentId || null;
    run('INSERT INTO community_posts (id,workspace_id,student_id,author,category,text,visibility,likes_json,comments_json,pinned,reported,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [postId, user.workspaceId, studentId, user.name, body.category || 'Vitória', sanitizeText(body.text, 1200), body.visibility || 'publico', toJSON([]), toJSON([]), user.role === 'student' ? 0 : Number(body.pinned || 0), 0, nowISO()]);
    audit(user, 'community_post_created', 'community_post', postId, 'Post publicado.');
    return send(res, 201, { id: postId, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/messages' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const studentId = user.role === 'student' ? user.studentId : body.studentId;
    if (!studentId || !canAccessStudent(user, studentId)) return send(res, 403, { error: 'Conversa inválida.' });
    const msgId = id('msg');
    run('INSERT INTO messages (id,workspace_id,student_id,sender_id,text,resolved,created_at) VALUES (?,?,?,?,?,?,?)', [msgId, user.workspaceId, studentId, user.id, sanitizeText(body.text, 1200), 0, nowISO()]);
    audit(user, 'message_sent', 'message', msgId, 'Mensagem interna enviada.');
    return send(res, 201, { id: msgId, bootstrap: bootstrap(user) });
  }


  const studentDecision = pathname.match(/^\/api\/students\/([^/]+)\/(approve|reject)$/);
  if (studentDecision && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const student = get('SELECT * FROM students WHERE id = ?', [studentDecision[1]]);
    if (!student) return send(res, 404, { error: 'Aluno não encontrado.' });
    if (!assertWorkspace(user, student.workspace_id)) return send(res, 403, { error: 'Aluno fora do seu workspace.' });
    const body = await readBody(req);
    if (studentDecision[2] === 'approve') {
      run('UPDATE students SET status=?, request_status=?, onboarding_stage=?, approved_at=?, approved_by=? WHERE id=?', ['ativo', 'aprovado', 'acesso_liberado', nowISO(), user.id, student.id]);
      const plan = student.requested_trainer_plan_id ? get('SELECT * FROM trainer_plans WHERE id=?', [student.requested_trainer_plan_id]) : get('SELECT * FROM trainer_plans WHERE trainer_id=? AND status=? ORDER BY price LIMIT 1', [student.trainer_id, 'ativo']);
      if (plan && !get('SELECT id FROM student_payments WHERE student_id=? AND trainer_plan_id=? AND status IN (?,?,?) LIMIT 1', [student.id, plan.id, 'aguardando_comprovante', 'em_analise', 'aprovado'])) {
        const spId = id('student_pay');
        run('INSERT INTO student_payments (id,workspace_id,student_id,trainer_id,trainer_plan_id,amount,due_date,status,receipt_url,receipt_file_name,payment_method,reviewed_by,reviewed_at,rejection_reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [spId, student.workspace_id, student.id, student.trainer_id, plan.id, Number(plan.price || 0), new Date(Date.now()+3*86400000).toISOString().slice(0,10), 'aguardando_comprovante', '', '', 'pix_manual', '', '', '', nowISO(), nowISO()]);
        paymentLog(student.workspace_id, spId, 'student_to_trainer', 'created_after_approval', user.id, { studentId: student.id, trainerId: student.trainer_id, planId: plan.id });
      }
      seedBadgeIfMissing(student.workspace_id, student.id, 'primeiro_personal_aprovado', 'Personal aprovado', '✅', 'O personal aprovou o acompanhamento.', 'raro', true);
      audit(user, 'student_request_approved', 'student', student.id, 'Solicitação de aluno aprovada pelo personal.');
      if (student.user_id) notify(student.workspace_id, student.user_id, 'Solicitação aprovada', 'Seu personal aprovou seu acompanhamento. Você já pode acessar o painel completo.');
      return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
    }
    const reason = sanitizeText(body.reason || 'Solicitação recusada pelo personal.', 600);
    run('UPDATE students SET status=?, request_status=?, onboarding_stage=? WHERE id=?', ['recusado', 'recusado', 'recusado', student.id]);
    audit(user, 'student_request_rejected', 'student', student.id, reason);
    if (student.user_id) notify(student.workspace_id, student.user_id, 'Solicitação recusada', reason);
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/trainers' && req.method === 'POST') {
    const user = requireSuper(req, res); if (!user) return;
    const body = await readBody(req);
    const workspace = get('SELECT * FROM workspaces LIMIT 1');
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !body.password || String(body.password).length < 6) return send(res, 422, { error: 'Informe e-mail e senha inicial com no mínimo 6 caracteres.' });
    if (get('SELECT id FROM users WHERE email=?', [email])) return send(res, 409, { error: 'E-mail já existe.' });
    const trainerId = id('trainer'); const userId = id('user'); const now = nowISO(); const name = sanitizeText(body.name || 'Novo personal', 120);
    run('INSERT INTO users (id,workspace_id,trainer_id,name,email,password_hash,role,avatar,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [userId, workspace.id, trainerId, name, email, hashPassword(String(body.password)), 'trainer', '', now]);
    run('INSERT INTO trainers (id,user_id,workspace_id,name,email,phone,specialty,bio,created_at,city,state,modalities,active,premium,ai_enabled,requires_password_change) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [trainerId, userId, workspace.id, name, email, sanitizeText(body.phone, 30), sanitizeText(body.specialty, 200), sanitizeText(body.bio || '', 800), now, sanitizeText(body.city || '', 100), sanitizeText(body.state || '', 30), sanitizeText(body.modalities || 'online,hibrido', 120), Number(body.active ?? 1), Number(body.premium || 0), Number(body.aiEnabled || 0), Number(body.requiresPasswordChange ?? 1)]);
    audit(user, 'trainer_created', 'trainer', trainerId, 'Personal criado pelo Dev/Super Admin.');
    return send(res, 201, { ok: true, trainerId, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/settings' && req.method === 'PUT') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    run('UPDATE workspaces SET brand_name=?, primary_color=?, secondary_color=?, whatsapp=? WHERE id=?', [sanitizeText(body.brandName, 160), sanitizeText(body.primaryColor, 20), sanitizeText(body.secondaryColor, 20), sanitizeText(body.whatsapp, 30), user.workspaceId]);
    audit(user, 'workspace_settings_updated', 'workspace', user.workspaceId, 'Configurações do site atualizadas.');
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }






  if (pathname === '/api/profile' && req.method === 'PUT') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const name = sanitizeText(body.name || user.name, 120);
    run('UPDATE users SET name=? WHERE id=?', [name, user.id]);
    if (user.role === 'student' && user.studentId) {
      run('UPDATE students SET name=?, phone=?, city=?, state=?, goal=?, current_weight=?, level=?, training_place=?, availability=?, restrictions=? WHERE id=?', [name, sanitizeText(body.phone,30), sanitizeText(body.city,100), sanitizeText(body.state,40), sanitizeText(body.goal,200), Number(body.currentWeight || body.current_weight || 0), sanitizeText(body.level,80), sanitizeText(body.trainingPlace || body.training_place,120), sanitizeText(body.availability,160), sanitizeText(body.restrictions,800), user.studentId]);
    }
    if ((user.role === 'trainer' || user.role === 'admin') && user.trainerId) {
      run('UPDATE trainers SET name=?, phone=?, city=?, state=?, specialty=?, bio=?, modalities=?, brand_name=?, whatsapp=?, instagram=?, service_area=? WHERE id=?', [name, sanitizeText(body.phone,30), sanitizeText(body.city,100), sanitizeText(body.state,40), sanitizeText(body.specialty,160), sanitizeText(body.bio,800), sanitizeText(body.modalities,160), sanitizeText(body.brandName || body.brand_name,160), sanitizeText(body.whatsapp,30), sanitizeText(body.instagram,160), sanitizeText(body.serviceArea || body.service_area,240), user.trainerId]);
    }
    audit(user, 'profile_updated', 'user', user.id, 'Perfil atualizado pelo usuário.');
    return send(res, 200, { ok: true, bootstrap: bootstrap(normalizeUser(get('SELECT * FROM users WHERE id=?', [user.id]))) });
  }

  if (pathname === '/api/habits' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const studentId = user.role === 'student' ? user.studentId : body.studentId;
    if (!studentId || !canAccessStudent(user, studentId)) return send(res, 403, { error: 'Sem acesso ao hábito deste aluno.' });
    const habitId = id('habit');
    const date = body.date || new Date().toISOString().slice(0,10);
    run('INSERT INTO habits (id,workspace_id,student_id,date,water_ml,sleep_hours,steps,meals,mood,energy,notes,protein_g,carbs_g,fat_g,calories,fiber_g,supplements_taken_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [habitId, user.workspaceId, studentId, date, Number(body.waterMl || body.water_ml || 0), Number(body.sleepHours || body.sleep_hours || 0), Number(body.steps || 0), Number(body.meals || 0), sanitizeText(body.mood,80), Number(body.energy || 0), sanitizeText(body.notes,800), Number(body.proteinG || body.protein_g || 0), Number(body.carbsG || body.carbs_g || 0), Number(body.fatG || body.fat_g || 0), Number(body.calories || 0), Number(body.fiberG || body.fiber_g || 0), toJSON(body.supplementsTaken || []), nowISO()]);
    addStudentPoints(studentId, 15, 'Hábito diário registrado', user, { source: 'habit', referenceId: habitId, ruleKey: `habit:${studentId}:${date}` });
    audit(user, 'habit_logged', 'habit', habitId, 'Rotina diária registrada.');
    return send(res, 201, { id: habitId, bootstrap: bootstrap(user) });
  }

  const supplementTaken = pathname.match(/^\/api\/supplements\/([^/]+)\/taken$/);
  if (supplementTaken && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const supplement = get('SELECT * FROM supplements WHERE id=?', [supplementTaken[1]]);
    if (!supplement || !canAccessStudent(user, supplement.student_id)) return send(res, 404, { error: 'Suplemento não encontrado.' });
    addStudentPoints(supplement.student_id, 5, 'Suplemento marcado como tomado', user, { source: 'supplement', referenceId: supplement.id, ruleKey: `supplement:${supplement.student_id}:${supplement.id}:${new Date().toISOString().slice(0,10)}` });
    audit(user, 'supplement_taken', 'supplement', supplement.id, 'Aluno marcou suplemento como tomado.');
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  const communityReact = pathname.match(/^\/api\/community-posts\/([^/]+)\/(react|comment)$/);
  if (communityReact) {
    const user = requireAuth(req, res); if (!user) return;
    const post = get('SELECT * FROM community_posts WHERE id=?', [communityReact[1]]);
    if (!post || !assertWorkspace(user, post.workspace_id)) return send(res, 404, { error: 'Publicação não encontrada.' });
    const body = await readBody(req);
    if (communityReact[2] === 'react' && req.method === 'POST') {
      const reaction = sanitizeText(body.reaction || body.emoji || '🔥', 20);
      const type = sanitizeText(body.reactionType || reaction, 40);
      const existing = get('SELECT * FROM community_reactions WHERE post_id=? AND user_id=? AND reaction_type=?', [post.id, user.id, type]);
      if (existing && existing.emoji === reaction) {
        run('DELETE FROM community_reactions WHERE id=?', [existing.id]);
        audit(user, 'community_reaction_removed', 'community_post', post.id, reaction);
      } else if (existing) {
        run('UPDATE community_reactions SET emoji=?, user_name=?, user_avatar=?, created_at=? WHERE id=?', [reaction, user.name, user.avatar || '', nowISO(), existing.id]);
        audit(user, 'community_reaction_changed', 'community_post', post.id, reaction);
      } else {
        run('INSERT INTO community_reactions (id,workspace_id,post_id,user_id,user_name,user_avatar,emoji,reaction_type,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [id('react'), post.workspace_id, post.id, user.id, user.name, user.avatar || '', reaction, type, nowISO()]);
        audit(user, 'community_reaction_added', 'community_post', post.id, reaction);
      }
      const grouped = {};
      for (const r of all('SELECT emoji,user_id FROM community_reactions WHERE post_id=?', [post.id])) {
        if (!grouped[r.emoji]) grouped[r.emoji] = [];
        grouped[r.emoji].push(r.user_id);
      }
      run('UPDATE community_posts SET reactions_json=? WHERE id=?', [toJSON(grouped), post.id]);
      return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
    }
    if (communityReact[2] === 'comment' && req.method === 'POST') {
      const comments = json(post.comments_json, []);
      comments.push({ id: id('comment'), userId: user.id, author: user.name, avatar: user.avatar || '', text: sanitizeText(body.text, 600), parentId: body.parentId || '', createdAt: nowISO() });
      run('UPDATE community_posts SET comments_json=? WHERE id=?', [toJSON(comments), post.id]);
      audit(user, 'community_comment', 'community_post', post.id, 'Comentário publicado.');
      return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
    }
  }

  const challengeCheckin = pathname.match(/^\/api\/challenges\/([^/]+)\/checkins$/);
  if (challengeCheckin && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    if (user.role !== 'student') return send(res, 403, { error: 'Somente aluno pode enviar check-in.' });
    const challenge = get('SELECT * FROM challenges WHERE id=?', [challengeCheckin[1]]);
    if (!challenge || !assertWorkspace(user, challenge.workspace_id)) return send(res, 404, { error: 'Desafio não encontrado.' });
    const body = await readBody(req);
    const checkId = id('check');
    run('INSERT INTO challenge_checkins (id,workspace_id,challenge_id,student_id,user_id,status,note,photo_name,points,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [checkId, user.workspaceId, challenge.id, user.studentId, user.id, 'aguardando_aprovacao', sanitizeText(body.note,800), sanitizeText(body.photoName,120), Number(body.points || 20), nowISO()]);
    audit(user, 'challenge_checkin_submitted', 'challenge', challenge.id, 'Check-in enviado para aprovação do personal.');
    return send(res, 201, { id: checkId, bootstrap: bootstrap(user) });
  }

  const checkinReview = pathname.match(/^\/api\/challenge-checkins\/([^/]+)\/(approve|reject)$/);
  if (checkinReview && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const checkin = get('SELECT * FROM challenge_checkins WHERE id=?', [checkinReview[1]]);
    if (!checkin || !assertWorkspace(user, checkin.workspace_id)) return send(res, 404, { error: 'Check-in não encontrado.' });
    const body = await readBody(req);
    const status = checkinReview[2] === 'approve' ? 'aprovado' : 'recusado';
    run('UPDATE challenge_checkins SET status=?, reviewed_by=?, reviewed_at=? WHERE id=?', [status, user.id, nowISO(), checkin.id]);
    if (status === 'aprovado') addStudentPoints(checkin.student_id, Number(checkin.points || 20), 'Check-in de desafio aprovado', user, { source: 'challenge_checkin', referenceId: checkin.id, ruleKey: `challenge_checkin:${checkin.id}` });
    audit(user, status === 'aprovado' ? 'challenge_checkin_approved' : 'challenge_checkin_rejected', 'challenge_checkin', checkin.id, sanitizeText(body.reason || '', 500));
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  const redemptionReview = pathname.match(/^\/api\/reward-redemptions\/([^/]+)\/(approve|reject)$/);
  if (redemptionReview && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const redemption = get('SELECT * FROM reward_redemptions WHERE id=?', [redemptionReview[1]]);
    if (!redemption || !assertWorkspace(user, redemption.workspace_id)) return send(res, 404, { error: 'Resgate não encontrado.' });
    const body = await readBody(req);
    const status = redemptionReview[2] === 'approve' ? 'aprovado' : 'recusado';
    if (status === 'aprovado') {
      const student = get('SELECT * FROM students WHERE id=?', [redemption.student_id]);
      if (student && Number(student.fit_points || 0) < Number(redemption.points || 0)) {
        recordAntifraudEvent({ workspaceId: redemption.workspace_id, studentId: redemption.student_id, actorId: user.id, eventType: 'reward_insufficient_points', severity: 'medium', message: 'Tentativa de aprovar resgate sem saldo suficiente.', metadata: { redemptionId: redemption.id, points: redemption.points, balance: student.fit_points } });
        return send(res, 409, { error: 'Aluno não possui pontos suficientes para aprovar este resgate.' });
      }
      if (student) run('UPDATE students SET fit_points=? WHERE id=?', [Math.max(0, Number(student.fit_points || 0) - Number(redemption.points || 0)), redemption.student_id]);
    }
    run('UPDATE reward_redemptions SET status=?, reviewed_by=?, reviewed_at=?, note=? WHERE id=?', [status, user.id, nowISO(), sanitizeText(body.reason || body.note || '', 500), redemption.id]);
    audit(user, status === 'aprovado' ? 'reward_redemption_approved' : 'reward_redemption_rejected', 'reward_redemption', redemption.id, 'Resgate revisado pelo personal.');
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  const giveawayDraw = pathname.match(/^\/api\/giveaways\/([^/]+)\/draw$/);
  if (giveawayDraw && req.method === 'POST') {
    const user = requireSuper(req, res); if (!user) return;
    const giveaway = get('SELECT * FROM giveaways WHERE id=?', [giveawayDraw[1]]);
    if (!giveaway || !assertWorkspace(user, giveaway.workspace_id)) return send(res, 404, { error: 'Sorteio não encontrado.' });
    const entries = all('SELECT * FROM giveaway_entries WHERE giveaway_id=? ORDER BY chances DESC', [giveaway.id]);
    if (!entries.length) return send(res, 409, { error: 'Sorteio sem participantes.' });
    const winner = entries[0];
    run('UPDATE giveaways SET status=?, winners_json=? WHERE id=?', ['sorteado', toJSON([winner.student_id]), giveaway.id]);
    audit(user, 'giveaway_drawn', 'giveaway', giveaway.id, `Vencedor: ${winner.student_id}`);
    return send(res, 200, { winnerStudentId: winner.student_id, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/ai/help' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const question = sanitizeText(body.question || body.prompt || '', 1200);
    if (!question) return send(res, 422, { error: 'Informe uma pergunta para o assistente.' });
    const result = await askOpenAI({ prompt: question, role: user.role });
    run('INSERT INTO ai_help_logs (id,workspace_id,user_id,question,answer,provider,created_at) VALUES (?,?,?,?,?,?,?)', [id('ai'), user.workspaceId, user.id, question, result.answer, result.provider, nowISO()]);
    audit(user, 'ai_help_asked', 'ai_help', user.id, `Assistente IA respondeu via ${result.provider}.`);
    return send(res, 200, { answer: result.answer, provider: result.provider, warning: 'Resposta de apoio. Não substitui personal, médico, nutricionista ou fisioterapeuta.' });
  }

  const contentComplete = pathname.match(/^\/api\/contents\/([^/]+)\/complete$/);
  if (contentComplete && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const content = get('SELECT * FROM contents WHERE id=?', [contentComplete[1]]);
    if (!content || !assertWorkspace(user, content.workspace_id)) return send(res, 404, { error: 'Conteúdo não encontrado.' });
    const completed = json(content.completed_by_json, []);
    const firstCompletion = !completed.includes(user.id);
    if (firstCompletion) completed.push(user.id);
    run('UPDATE contents SET completed_by_json=?, views=COALESCE(views,0)+1 WHERE id=?', [toJSON(completed), content.id]);
    if (firstCompletion && user.role === 'student' && user.studentId) addStudentPoints(user.studentId, 10, 'Conteúdo concluído', user, { source: 'content', referenceId: content.id, ruleKey: `content:${content.id}:${user.studentId}` });
    audit(user, 'content_completed', 'content', content.id, 'Conteúdo concluído sem bloquear botão Rever.');
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  const rewardRedeem = pathname.match(/^\/api\/rewards\/([^/]+)\/redeem$/);
  if (rewardRedeem && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    if (user.role !== 'student') return send(res, 403, { error: 'Somente aluno pode solicitar resgate.' });
    const reward = get('SELECT * FROM reward_items WHERE id=?', [rewardRedeem[1]]);
    if (!reward || !assertWorkspace(user, reward.workspace_id)) return send(res, 404, { error: 'Recompensa não encontrada.' });
    if (Number(get('SELECT fit_points FROM students WHERE id=?', [user.studentId])?.fit_points || 0) < Number(reward.points || 0)) return send(res, 409, { error: 'Você ainda não possui pontos suficientes para esta recompensa.' });
    if (get('SELECT id FROM reward_redemptions WHERE student_id=? AND reward_id=? AND status=?', [user.studentId, reward.id, 'aguardando_aprovacao'])) return send(res, 409, { error: 'Você já possui um resgate pendente para esta recompensa.' });
    const redemptionId = id('red');
    run('INSERT INTO reward_redemptions (id,workspace_id,student_id,reward_id,points,status,note,created_at) VALUES (?,?,?,?,?,?,?,?)', [redemptionId, user.workspaceId, user.studentId, reward.id, reward.points, 'aguardando_aprovacao', 'Solicitação de resgate enviada ao personal.', nowISO()]);
    audit(user, 'reward_redeemed_requested', 'reward', reward.id, 'Aluno solicitou resgate de recompensa.');
    return send(res, 201, { id: redemptionId, bootstrap: bootstrap(user) });
  }

  const mpPreference = pathname.match(/^\/api\/payments\/([^/]+)\/mercado-pago-preference$/);
  if (mpPreference && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const payment = get('SELECT * FROM payments WHERE id=?', [mpPreference[1]]);
    if (!payment || !assertWorkspace(user, payment.workspace_id) || (user.role === 'student' && user.studentId !== payment.student_id)) return send(res, 404, { error: 'Pagamento não encontrado.' });
    const student = get('SELECT * FROM students WHERE id=?', [payment.student_id]);
    const plan = get('SELECT * FROM plans WHERE id=?', [payment.plan_id]);
    try {
      const pref = await createMercadoPagoPreference({ payment, student, plan, notificationUrl: `${config.apiUrl}/api/mercado-pago/webhook` });
      const initPoint = pref.init_point || pref.sandbox_init_point || '';
      run('UPDATE payments SET external_link=?, mercado_pago_preference_id=?, mercado_pago_status=?, payment_provider=?, checkout_created_at=? WHERE id=?', [initPoint, pref.id || '', pref.status || 'created', 'mercado_pago', nowISO(), payment.id]);
      paymentHistory(payment.id, user.id, 'Checkout Mercado Pago criado', `Preference: ${pref.id || 'sem id'} • link ${initPoint ? 'gerado' : 'não retornado'}`);
      integrationLog(payment.workspace_id, 'mercado_pago', 'create_preference', 'ok', payment.id, pref.id || 'preference_created');
      return send(res, 200, { id: pref.id, initPoint, bootstrap: bootstrap(user) });
    } catch (error) { integrationLog(payment.workspace_id, 'mercado_pago', 'create_preference', 'error', payment.id, error.message); return send(res, 502, { error: error.message }); }
  }


  const mpSubscription = pathname.match(/^\/api\/payments\/([^/]+)\/mercado-pago-subscription$/);
  if (mpSubscription && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const payment = get('SELECT * FROM payments WHERE id=?', [mpSubscription[1]]);
    if (!payment || !assertWorkspace(user, payment.workspace_id) || (user.role === 'student' && user.studentId !== payment.student_id)) return send(res, 404, { error: 'Pagamento não encontrado.' });
    const student = get('SELECT * FROM students WHERE id=?', [payment.student_id]);
    const plan = get('SELECT * FROM plans WHERE id=?', [payment.plan_id]);
    try {
      const preapproval = await createMercadoPagoPreapproval({ payment, student, plan, notificationUrl: `${config.apiUrl}/api/mercado-pago/webhook` });
      const initPoint = preapproval.init_point || preapproval.sandbox_init_point || preapproval.preapproval_url || '';
      run('UPDATE payments SET external_link=?, mercado_pago_preapproval_id=?, mercado_pago_status=?, payment_provider=?, checkout_created_at=? WHERE id=?', [initPoint, preapproval.id || '', preapproval.status || 'pending', 'mercado_pago', nowISO(), payment.id]);
      paymentHistory(payment.id, user.id, 'Assinatura Mercado Pago criada', `Preapproval: ${preapproval.id || 'sem id'} • link ${initPoint ? 'gerado' : 'não retornado'}`);
      integrationLog(payment.workspace_id, 'mercado_pago', 'create_preapproval', 'ok', payment.id, preapproval.id || 'preapproval_created');
      return send(res, 200, { id: preapproval.id, initPoint, bootstrap: bootstrap(user) });
    } catch (error) {
      integrationLog(payment.workspace_id, 'mercado_pago', 'create_preapproval', 'error', payment.id, error.message);
      return send(res, 502, { error: error.message, bootstrap: bootstrap(user) });
    }
  }

  if (pathname === '/api/admin/whatsapp/templates' && req.method === 'GET') {
    const user = requireAdmin(req, res); if (!user) return;
    const sends = mapRows(all('SELECT id,workspace_id,template_key,template_name,language,to_phone,student_id,status,provider_message_id,error_message,sent_by,created_at FROM whatsapp_template_sends WHERE workspace_id=? ORDER BY created_at DESC LIMIT 80', [user.workspaceId]));
    return send(res, 200, { templates: whatsappApprovedTemplates().map(t => ({ key: t.key, label: t.label, description: t.description, envName: t.envName, configured: t.configured, name: t.configured ? t.name : '', language: t.language, suggestedParams: t.suggestedParams })), sends, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/admin/whatsapp/ai-replies' && req.method === 'GET') {
    const user = requireAdmin(req, res); if (!user) return;
    const rows = mapRows(all('SELECT id,workspace_id,student_id,inbound_message_id,inbound_text,ai_answer,provider,whatsapp_message_id,status,error_message,created_at FROM whatsapp_ai_replies WHERE workspace_id=? ORDER BY created_at DESC LIMIT 120', [user.workspaceId]));
    return send(res, 200, { replies: rows, enabled: whatsappAiEnabled(), bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/admin/whatsapp/templates/send' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const templateKey = sanitizeText(body.templateKey || body.template || '', 120);
    if (!templateKey) return send(res, 422, { error: 'Informe o templateKey configurado.' });
    let student = null;
    if (body.studentId) {
      student = get('SELECT * FROM students WHERE id=?', [body.studentId]);
      if (!student || !assertWorkspace(user, student.workspace_id)) return send(res, 404, { error: 'Aluno não encontrado.' });
    }
    let context = body.context || {};
    if (body.paymentId) context = { ...templateContextForPayment(body.paymentId), ...context };
    if (student) context = { ...context, student };
    const to = String(body.to || student?.phone || '').replace(/\D/g, '');
    if (!to) return send(res, 422, { error: 'Informe telefone de destino ou selecione aluno com WhatsApp.' });
    const template = whatsappApprovedTemplates().find(t => t.key === templateKey || t.name === templateKey);
    try {
      const bodyParams = Array.isArray(body.bodyParams) ? body.bodyParams : whatsappTemplateBodyParams(templateKey, context);
      const result = await sendWhatsAppApprovedTemplate({ to, templateKey, language: body.language || template?.language, components: body.components, bodyParams, context });
      const providerMessageId = result?.messages?.[0]?.id || '';
      recordWhatsappTemplateSend({ workspaceId: user.workspaceId, templateKey, templateName: template?.name || templateKey, language: body.language || template?.language || 'pt_BR', toPhone: to, studentId: student?.id || '', status: 'sent', providerMessageId, payload: { bodyParams }, sentBy: user.id });
      integrationLog(user.workspaceId, 'whatsapp_templates', 'send_approved_template', 'ok', student?.id || to, `Template ${templateKey} enviado.`);
      return send(res, 200, { ok: true, result, bootstrap: bootstrap(user) });
    } catch (error) {
      recordWhatsappTemplateSend({ workspaceId: user.workspaceId, templateKey, templateName: template?.name || templateKey, language: body.language || template?.language || 'pt_BR', toPhone: to, studentId: student?.id || '', status: 'error', errorMessage: error.message || String(error), sentBy: user.id });
      integrationLog(user.workspaceId, 'whatsapp_templates', 'send_approved_template', 'error', student?.id || to, error.message || String(error));
      return send(res, 502, { error: error.message || String(error), bootstrap: bootstrap(user) });
    }
  }

  if (pathname === '/api/whatsapp/send-template' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const to = String(body.to || '').replace(/\D/g, '');
    if (!to) return send(res, 422, { error: 'Informe o telefone de destino.' });
    try {
      const result = await sendWhatsAppTemplate({ to, templateName: body.templateName, language: body.language || 'pt_BR', components: body.components || [] });
      integrationLog(user.workspaceId, 'whatsapp', 'send_template', 'ok', to, body.templateName || 'template');
      return send(res, 200, { ok: true, result });
    } catch (error) {
      integrationLog(user.workspaceId, 'whatsapp', 'send_template', 'error', to, error.message);
      return send(res, 502, { error: error.message });
    }
  }

  if (pathname === '/api/email/send-template' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    try {
      const ctx = body.paymentId ? templateContextForPayment(body.paymentId) : body.context || {};
      const result = await sendEmailTemplate({ to: body.to || ctx.student?.email || process.env.EMAIL_FROM, template: body.template || 'payment_pending', context: ctx });
      integrationLog(user.workspaceId, 'email', 'send_template', 'ok', body.to || ctx.student?.email || '', body.template || 'payment_pending');
      return send(res, 200, { ok: true, result });
    } catch (error) {
      integrationLog(user.workspaceId, 'email', 'send_template', 'error', body.to || '', error.message);
      return send(res, 502, { error: error.message });
    }
  }

  if (pathname === '/api/whatsapp/send' && req.method === 'POST') { const user = requireAdmin(req, res); if (!user) return; const body = await readBody(req); const to = String(body.to || '').replace(/\D/g, ''); if (!to) return send(res, 422, { error: 'Informe o telefone de destino.' }); try { const result = await sendWhatsAppText({ to, text: sanitizeText(body.text || 'Olá! Mensagem enviada pelo FitPro Elite.', 1200) }); integrationLog(user.workspaceId, 'whatsapp', 'send_text', 'ok', to, 'Mensagem enviada via WhatsApp Business.'); return send(res, 200, { ok: true, result }); } catch (error) { integrationLog(user.workspaceId, 'whatsapp', 'send_text', 'error', to, error.message); return send(res, 502, { error: error.message }); } }

  if (pathname === '/api/email/send' && req.method === 'POST') { const user = requireAdmin(req, res); if (!user) return; const body = await readBody(req); try { const result = await sendEmail({ to: body.to, subject: sanitizeText(body.subject || 'FitPro Elite', 160), html: String(body.html || '<p>Mensagem FitPro Elite.</p>') }); integrationLog(user.workspaceId, 'email', 'send', 'ok', body.to, 'E-mail enviado via Resend.'); return send(res, 200, { ok: true, result }); } catch (error) { integrationLog(user.workspaceId, 'email', 'send', 'error', body.to || '', error.message); return send(res, 502, { error: error.message }); } }


  if (pathname === '/api/google/status' && req.method === 'GET') {
    const user = requireAdmin(req, res); if (!user) return;
    const rows = mapRows(all('SELECT id,google_email,calendar_id,status,last_sync_at,updated_at FROM google_connections WHERE workspace_id=? ORDER BY updated_at DESC', [user.workspaceId]));
    return send(res, 200, { configured: googleConfigured(), connections: rows, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/google/auth-url' && req.method === 'GET') {
    const user = requireAdmin(req, res); if (!user) return;
    try {
      const state = Buffer.from(JSON.stringify({ userId: user.id, workspaceId: user.workspaceId, trainerId: user.trainerId || '' })).toString('base64url');
      return send(res, 200, { url: googleAuthUrl({ state }) });
    } catch (error) {
      return send(res, 501, { error: error.message || 'Google Calendar/Meet não configurado.' });
    }
  }

  if (pathname === '/api/google/callback' && req.method === 'GET') {
    const code = url.searchParams.get('code') || '';
    const stateRaw = url.searchParams.get('state') || '';
    if (!code) return send(res, 422, { error: 'Código Google ausente.' });
    try {
      const state = stateRaw ? JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8')) : {};
      const user = state.userId ? normalizeUser(get('SELECT * FROM users WHERE id=?', [state.userId])) : null;
      if (!user) return send(res, 401, { error: 'Usuário do callback Google não encontrado.' });
      const tokens = await exchangeGoogleCode(code);
      const profile = tokens.access_token ? await fetchGoogleProfile(tokens.access_token).catch(() => ({})) : {};
      const connectionId = id('google');
      const expiresAt = tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : '';
      const existing = get('SELECT id FROM google_connections WHERE workspace_id=? AND user_id=?', [user.workspaceId, user.id]);
      if (existing) {
        run('UPDATE google_connections SET google_email=?, access_token_encrypted=?, refresh_token_encrypted=COALESCE(NULLIF(?,\'\'),refresh_token_encrypted), token_type=?, scope=?, expires_at=?, calendar_id=COALESCE(calendar_id,\'primary\'), status=?, last_sync_at=?, updated_at=? WHERE id=?', [profile.email || '', encryptSecret(tokens.access_token || ''), encryptSecret(tokens.refresh_token || ''), tokens.token_type || 'Bearer', tokens.scope || '', expiresAt, 'connected', nowISO(), nowISO(), existing.id]);
      } else {
        run('INSERT INTO google_connections (id,workspace_id,user_id,trainer_id,google_email,access_token_encrypted,refresh_token_encrypted,token_type,scope,expires_at,calendar_id,status,last_sync_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [connectionId, user.workspaceId, user.id, user.trainerId || '', profile.email || '', encryptSecret(tokens.access_token || ''), encryptSecret(tokens.refresh_token || ''), tokens.token_type || 'Bearer', tokens.scope || '', expiresAt, 'primary', 'connected', nowISO(), nowISO(), nowISO()]);
      }
      run('UPDATE integration_settings SET status=?, last_test_at=?, provider_status_json=? WHERE workspace_id=? AND key LIKE ?', ['conectado', nowISO(), toJSON({ googleEmail: profile.email || '', calendar: 'primary', connectedAt: nowISO() }), user.workspaceId, '%google%']);
      integrationLog(user.workspaceId, 'google', 'oauth_callback', 'ok', profile.email || user.email, 'Google Calendar conectado com sucesso.');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body style="font-family:system-ui;background:#020617;color:#e5f7ee;padding:32px"><h1>Google conectado ao FitPro Elite</h1><p>Você pode fechar esta janela e voltar ao painel.</p></body></html>');
      return;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><html><body style="font-family:system-ui;background:#020617;color:#fee2e2;padding:32px"><h1>Falha ao conectar Google</h1><p>${String(error.message || 'Erro desconhecido')}</p></body></html>`);
      return;
    }
  }

  if (pathname === '/api/google/disconnect' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    run('UPDATE google_connections SET status=?, updated_at=? WHERE workspace_id=? AND user_id=?', ['disconnected', nowISO(), user.workspaceId, user.id]);
    integrationLog(user.workspaceId, 'google', 'disconnect', 'ok', user.email, 'Google Calendar desconectado pelo usuário.');
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  const googleMeetMatch = pathname.match(/^\/api\/schedules\/([^/]+)\/google-meet$/);
  if (googleMeetMatch && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    try {
      const result = await createMeetForSchedule(user, googleMeetMatch[1]);
      return send(res, 201, result);
    } catch (error) {
      integrationLog(user.workspaceId, 'google', 'create_event', 'error', googleMeetMatch[1], error.message);
      return send(res, error.status || 502, { error: error.message || 'Falha ao criar evento Google.' });
    }
  }


  const contentMedia = pathname.match(/^\/api\/contents\/([^/]+)\/media$/);
  if (contentMedia && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const content = get('SELECT * FROM contents WHERE id=?', [contentMedia[1]]);
    if (!content || !assertWorkspace(user, content.workspace_id)) return send(res, 404, { error: 'Conteúdo não encontrado.' });
    const body = await readBody(req);
    try {
      const bucket = process.env.SUPABASE_STORAGE_BUCKET_CONTENTS || 'content-files';
      const objectPath = `${content.workspace_id}/${content.id}/${Date.now()}-${safeFileName(body.fileName || 'conteudo')}`;
      const saved = await savePrivateDataUrl({ dataUrl: body.dataUrl, fileName: body.fileName || 'conteudo', allowedTypes: PUBLIC_TYPES, maxBytes: 25 * 1024 * 1024, localSubdir: 'contents', bucket, objectPath, workspaceId: content.workspace_id, ownerId: user.id });
      run('UPDATE contents SET media_path=?, media_mime_type=?, media_size=?, thumbnail_url=COALESCE(NULLIF(thumbnail_url,\'\'),?) WHERE id=?', [saved.storagePath, saved.mime, saved.size, body.thumbnailUrl || '', content.id]);
      databaseAdapter.mirror('contents', { id: content.id, workspace_id: content.workspace_id, media_path: saved.storagePath, media_mime_type: saved.mime, media_size: saved.size, thumbnail_url: body.thumbnailUrl || content.thumbnail_url || '' }, { workspaceId: content.workspace_id, entityId: content.id }).catch(() => {});
      audit(user, 'content_media_uploaded', 'content', content.id, `Mídia enviada. Storage: ${saved.provider}`);
      return send(res, 201, { ok: true, storageProvider: saved.provider, bootstrap: bootstrap(user) });
    } catch (error) {
      return send(res, error.status || 500, { error: error.message || 'Não foi possível salvar mídia do conteúdo.' });
    }
  }

  const contentMediaGet = pathname.match(/^\/api\/contents\/([^/]+)\/media$/);
  if (contentMediaGet && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const content = get('SELECT * FROM contents WHERE id=?', [contentMediaGet[1]]);
    if (!content || !assertWorkspace(user, content.workspace_id)) return send(res, 404, { error: 'Conteúdo não encontrado.' });
    if (!content.media_path) return send(res, 404, { error: 'Conteúdo ainda não possui mídia privada.' });
    return servePrivateStoragePath({ req, res, storagePath: content.media_path, mimeType: content.media_mime_type || 'application/octet-stream', fileName: `${content.title || 'conteudo'}`, disposition: url.searchParams.get('download') === '1' ? 'attachment' : 'inline', workspaceId: content.workspace_id, relatedId: content.id });
  }

  const assessmentPhotoGet = pathname.match(/^\/api\/assessments\/([^/]+)\/photo$/);
  if (assessmentPhotoGet && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const assessment = get('SELECT * FROM assessments WHERE id=?', [assessmentPhotoGet[1]]);
    if (!assessment || !canAccessStudent(user, assessment.student_id)) return send(res, 404, { error: 'Foto de evolução não encontrada.' });
    if (!assessment.photo_path) return send(res, 404, { error: 'Avaliação sem foto privada.' });
    return servePrivateStoragePath({ req, res, storagePath: assessment.photo_path, mimeType: assessment.photo_mime_type || 'image/webp', fileName: assessment.photo_name || 'evolucao', disposition: url.searchParams.get('download') === '1' ? 'attachment' : 'inline', workspaceId: assessment.workspace_id, relatedId: assessment.id });
  }


  if (pathname === '/api/supabase/migrate-key-tables' && req.method === 'POST') {
    const user = requireSuper(req, res); if (!user) return;
    try {
      const result = await mirrorKeyTablesToSupabase(user);
      return send(res, 200, { ok: true, result, bootstrap: bootstrap(user) });
    } catch (error) {
      integrationLog(user.workspaceId, 'supabase', 'migrate_key_tables', 'error', 'supabase', error.message);
      return send(res, 502, { error: error.message, bootstrap: bootstrap(user) });
    }
  }


  if (pathname === '/api/push/vapid-public-key' && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    return send(res, 200, { ok: true, enabled: config.pushEnabled, publicKey: config.vapidPublicKey || '', mode: config.vapidPublicKey ? 'web_push_ready' : 'local_notification_only' });
  }

  if (pathname === '/api/push/subscribe' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const subscription = body.subscription || body;
    const endpoint = sanitizeText(subscription?.endpoint || body.endpoint || '', 600);
    if (!endpoint) return send(res, 422, { error: 'Subscription inválida.' });
    const subId = id('push');
    const existing = get('SELECT id FROM push_subscriptions WHERE endpoint=?', [endpoint]);
    if (existing) run('UPDATE push_subscriptions SET user_id=?, workspace_id=?, subscription_json=?, user_agent=?, status=?, updated_at=? WHERE endpoint=?', [user.id, user.workspaceId, toJSON(subscription), sanitizeText(req.headers['user-agent'] || '', 300), 'active', nowISO(), endpoint]);
    else run('INSERT INTO push_subscriptions (id,workspace_id,user_id,endpoint,subscription_json,user_agent,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', [subId, user.workspaceId, user.id, endpoint, toJSON(subscription), sanitizeText(req.headers['user-agent'] || '', 300), 'active', nowISO(), nowISO()]);
    run('INSERT OR REPLACE INTO notification_preferences (id,workspace_id,user_id,push_enabled,email_enabled,whatsapp_enabled,updated_at) VALUES (COALESCE((SELECT id FROM notification_preferences WHERE user_id=?),?),?,?,?,?,?,?)', [user.id, id('pref'), user.workspaceId, user.id, 1, 1, 1, nowISO()]);
    audit(user, 'push_subscribed', 'push_subscription', existing?.id || subId, 'Usuário habilitou notificações PWA.');
    return send(res, 200, { ok: true, mode: config.vapidPublicKey ? 'web_push_ready' : 'local_notification_only', bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/push/unsubscribe' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const endpoint = sanitizeText(body.endpoint || '', 600);
    if (endpoint) run('UPDATE push_subscriptions SET status=?, updated_at=? WHERE endpoint=? AND user_id=?', ['inactive', nowISO(), endpoint, user.id]);
    run('UPDATE notification_preferences SET push_enabled=0, updated_at=? WHERE user_id=?', [nowISO(), user.id]);
    audit(user, 'push_unsubscribed', 'push_subscription', user.id, 'Usuário desativou notificações PWA.');
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/push/test' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const subs = all('SELECT * FROM push_subscriptions WHERE user_id=? AND status=?', [user.id, 'active']);
    notify(user.workspaceId, user.id, 'Teste de notificação FitPro', 'Se as notificações estiverem ativas, este alerta também aparece no app.', { type: 'push_test', actionUrl: '/dashboard' });
    for (const sub of subs) run('UPDATE push_subscriptions SET last_sent_at=?, last_error=? WHERE id=?', [nowISO(), config.vapidPublicKey ? 'Envio remoto preparado; configurar Web Push provider no próximo deploy.' : 'Sem VAPID_PUBLIC_KEY: usando notificação local/in-app.', sub.id]);
    integrationLog(user.workspaceId, 'push', 'test', 'ok', user.id, `${subs.length} inscrição(ões) encontradas.`);
    return send(res, 200, { ok: true, subscriptions: subs.length, remoteReady: Boolean(config.vapidPublicKey), bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/points/ledger' && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const studentId = url.searchParams.get('studentId') || user.studentId || '';
    if (studentId && !canAccessStudent(user, studentId)) return send(res, 403, { error: 'Sem acesso ao extrato de pontos deste aluno.' });
    const rows = studentId ? all('SELECT * FROM point_ledger WHERE student_id=? ORDER BY created_at DESC LIMIT 200', [studentId]) : all('SELECT * FROM point_ledger WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200', [user.workspaceId]);
    return send(res, 200, { ledger: mapRows(rows).map(row => ({ ...row, riskFlags: json(row.riskFlagsJson, []) })) });
  }

  if (pathname === '/api/antifraud/events' && req.method === 'GET') {
    const user = requireAdmin(req, res); if (!user) return;
    const rows = all('SELECT * FROM antifraud_events WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200', [user.workspaceId]);
    return send(res, 200, { events: mapRows(rows).map(row => ({ ...row, metadata: json(row.metadataJson, {}) })) });
  }

  if (pathname === '/api/antifraud/review' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const eventId = sanitizeText(body.eventId || '', 80);
    const event = get('SELECT * FROM antifraud_events WHERE id=?', [eventId]);
    if (!event || !assertWorkspace(user, event.workspace_id)) return send(res, 404, { error: 'Evento antifraude não encontrado.' });
    run('UPDATE antifraud_events SET reviewed_by=?, reviewed_at=? WHERE id=?', [user.id, nowISO(), eventId]);
    audit(user, 'antifraud_event_reviewed', 'antifraud_event', eventId, 'Evento antifraude revisado.');
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }



  if (pathname === '/api/admin/workspace-audit' && req.method === 'POST') {
    const user = requireSuper(req, res); if (!user) return;
    const body = await readBody(req).catch(() => ({}));
    const workspaceId = sanitizeText(body.workspaceId || user.workspaceId, 120);
    const workspace = get('SELECT * FROM workspaces WHERE id=?', [workspaceId]) || get('SELECT * FROM workspaces WHERE id=?', [user.workspaceId]);
    const flags = integrationFlags();
    const avatarRows = all('SELECT id,avatar,avatar_public_url,avatar_storage_path,avatar_storage_provider,avatar_data_url FROM users WHERE workspace_id=? LIMIT 100', [workspace?.id || user.workspaceId]);
    const supabaseAvatarRows = avatarRows.filter(r => r.avatar_storage_provider === 'supabase_storage' || String(r.avatar || '').includes('/storage/v1/object/public/') || r.avatar_public_url);
    const paymentsPending = get('SELECT COUNT(*) as total FROM payments WHERE workspace_id=? AND status IN (?,?,?)', [workspace?.id || user.workspaceId, 'pendente', 'aguardando_comprovante', 'em_analise'])?.total || 0;
    const checks = [
      { key: 'api_health', label: 'Health da API', status: 'ok', statusLabel: 'online', detail: `/health e /api/health continuam antes de rotas protegidas.` },
      { key: 'database', label: 'Banco de dados', status: 'ok', statusLabel: databaseAdapter.mode, detail: `Modo atual: ${databaseAdapter.mode}. SQLite fallback preservado.` },
      { key: 'auth', label: 'Sessão/Auth', status: user?.id ? 'ok' : 'danger', statusLabel: user?.id ? 'autenticado' : 'falhou', detail: user?.id ? `Usuário ${user.email || user.id} autenticado.` : 'Sem usuário autenticado.' },
      { key: 'avatars', label: 'Uploads/avatar', status: supabaseAvatarRows.length ? 'ok' : (avatarRows.some(r => r.avatar || r.avatar_storage_path || r.avatar_data_url) ? 'warn' : 'warn'), statusLabel: supabaseAvatarRows.length ? `${supabaseAvatarRows.length} no Supabase` : (avatarRows.length ? `${avatarRows.length} com fallback` : 'sem dados'), detail: supabaseAvatarRows.length ? 'Avatar está usando Supabase Storage/public URL e banco sincronizado.' : 'Sem avatar Supabase confirmado. Reenvie a foto após configurar bucket avatars.' },
      { key: 'payments', label: 'Pagamentos/comprovantes', status: Number(paymentsPending) ? 'warn' : 'ok', statusLabel: Number(paymentsPending) ? `${paymentsPending} pendente(s)` : 'sem fila', detail: 'Aprovação/reprovação manual e logs continuam no backend.' },
      { key: 'mercadopago', label: 'Mercado Pago', status: flags.mercadoPago ? 'ok' : 'warn', statusLabel: flags.mercadoPago ? 'configurado' : 'ausente', detail: flags.mercadoPago ? 'Access token está configurado no backend.' : 'Configure MERCADO_PAGO_ACCESS_TOKEN no Railway para checkout automático.' },
      { key: 'whatsapp', label: 'WhatsApp', status: flags.whatsapp || flags.whatsappBusiness ? 'ok' : 'warn', statusLabel: flags.whatsappBusiness ? 'business' : flags.whatsapp ? 'básico' : 'ausente', detail: 'Tokens não são exibidos. Botões usam contexto aluno/personal quando há telefone.' },
      { key: 'resend', label: 'Resend/E-mail', status: flags.email ? 'ok' : 'warn', statusLabel: flags.email ? 'configurado' : 'ausente', detail: 'Configure RESEND_API_KEY/EMAIL_FROM para disparos reais.' },
      { key: 'supabase', label: 'Supabase', status: flags.supabase ? 'ok' : 'warn', statusLabel: flags.supabase ? `configurado • bucket ${supabaseAvatarBucket()}` : 'fallback SQLite', detail: flags.supabase ? 'Service role configurada no backend. Avatars usam Supabase Storage primeiro.' : 'Configure SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY no Railway para avatar definitivo.' },
      { key: 'openai', label: 'OpenAI/IA', status: flags.openai ? 'ok' : 'warn', statusLabel: flags.openai ? 'configurado' : 'fallback seguro', detail: 'Assistente usa fallback seguro quando não há chave.' }
    ];
    const summary = checks.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, { ok: 0, warn: 0, danger: 0 });
    integrationLog(user.workspaceId, 'workspace_audit', 'run', 'ok', workspace?.id || user.workspaceId, 'Auditoria de workspace executada sem expor secrets.');
    audit(user, 'workspace_audit_run', 'workspace', workspace?.id || user.workspaceId, 'Auditoria operacional executada pelo Dev/Super Admin.');
    return send(res, 200, { ok: true, audit: { workspaceId: workspace?.id || user.workspaceId, workspaceName: workspace?.brand_name || 'FitPro Elite', checkedAt: nowISO(), environment: config.nodeEnv, summary, checks }, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/admin/integrations/status' && req.method === 'GET') {
    const user = requireSuper(req, res); if (!user) return;
    const dashboard = buildIntegrationDashboard(user);
    const [supabaseHealth, proofsBucket, avatarsBucket, progressBucket, contentsBucket] = await Promise.all([
      supabaseHealthCheck().catch(error => ({ ok: false, error: error.message })),
      bucketStatus(process.env.SUPABASE_STORAGE_BUCKET_PROOFS || 'payment-proofs').catch(error => ({ ok: false, error: error.message })),
      bucketStatus(process.env.SUPABASE_STORAGE_BUCKET_AVATARS || 'avatars').catch(error => ({ ok: false, error: error.message })),
      bucketStatus(process.env.SUPABASE_STORAGE_BUCKET_PROGRESS || 'progress-photos').catch(error => ({ ok: false, error: error.message })),
      bucketStatus(process.env.SUPABASE_STORAGE_BUCKET_CONTENTS || 'content-files').catch(error => ({ ok: false, error: error.message }))
    ]);
    dashboard.live = {
      supabase: supabaseHealth,
      storageBuckets: { proofs: proofsBucket, avatars: avatarsBucket, progress: progressBucket, contents: contentsBucket },
      database: { mode: databaseAdapter.mode, sync: syncSummary() }
    };
    integrationLog(user.workspaceId, 'integrations', 'status_refresh', 'ok', 'dashboard', 'Central de integrações atualizada pelo dev.');
    return send(res, 200, { ok: true, dashboard, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/admin/integrations/logs' && req.method === 'GET') {
    const user = requireSuper(req, res); if (!user) return;
    const integration = normalizeIntegrationKey(url.searchParams.get('integration') || '');
    const status = sanitizeText(url.searchParams.get('status') || '', 40);
    const params = [user.workspaceId];
    let where = 'workspace_id=?';
    if (integration) { where += ' AND LOWER(integration) LIKE ?'; params.push(`%${integration}%`); }
    if (status) { where += ' AND status=?'; params.push(status); }
    const rows = mapRows(all(`SELECT * FROM integration_logs WHERE ${where} ORDER BY created_at DESC LIMIT 120`, params));
    return send(res, 200, { ok: true, logs: rows });
  }

  if (pathname === '/api/admin/integrations/test' && req.method === 'POST') {
    const user = requireSuper(req, res); if (!user) return;
    const body = await readBody(req);
    const result = await runIntegrationTest(user, body.integration || body.key || '', body);
    return send(res, 200, { ok: Boolean(result.ok), result, dashboard: buildIntegrationDashboard(user), bootstrap: bootstrap(user) });
  }

  const adminIntegrationMatch = pathname.match(/^\/api\/admin\/integrations\/test\/([a-zA-Z0-9_-]+)$/);
  if (adminIntegrationMatch && req.method === 'POST') {
    const user = requireSuper(req, res); if (!user) return;
    const body = await readBody(req).catch(() => ({}));
    const result = await runIntegrationTest(user, adminIntegrationMatch[1], body);
    return send(res, 200, { ok: Boolean(result.ok), result, dashboard: buildIntegrationDashboard(user), bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/admin/mercado-pago/webhooks' && req.method === 'GET') {
    const user = requireSuper(req, res); if (!user) return;
    const rows = mapRows(all('SELECT id,event_key,request_id,event_type,resource_id,external_reference,payment_id,mercado_pago_status,signature_valid,processed_status,error_message,received_at,processed_at FROM mercado_pago_webhook_events ORDER BY received_at DESC LIMIT 80'));
    return send(res, 200, { ok: true, events: rows });
  }

  if (pathname === '/api/integrations/status' && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const flags = integrationFlags();
    const [supabaseHealth, proofsBucket, avatarsBucket, progressBucket, contentsBucket] = await Promise.all([
      supabaseHealthCheck(),
      bucketStatus(process.env.SUPABASE_STORAGE_BUCKET_PROOFS || 'payment-proofs'),
      bucketStatus(process.env.SUPABASE_STORAGE_BUCKET_AVATARS || 'avatars'),
      bucketStatus(process.env.SUPABASE_STORAGE_BUCKET_PROGRESS || 'progress-photos'),
      bucketStatus(process.env.SUPABASE_STORAGE_BUCKET_CONTENTS || 'content-files')
    ]);
    const status = {
      api: { ok: true, env: config.nodeEnv, apiUrl: config.apiUrl, appUrl: config.appUrl, corsOrigins: config.allowedOrigins },
      database: { mode: databaseAdapter.mode, supabasePrimary: supabaseHealth.ok, fallback: !supabaseHealth.ok, sync: syncSummary(), lastStatuses: mapRows(systemStatusRows()) },
      supabase: { ...supabasePublicStatus(), health: supabaseHealth, storageBuckets: { proofs: proofsBucket, avatars: avatarsBucket, progress: progressBucket, contents: contentsBucket } },
      mercadoPago: { configured: flags.mercadoPago, webhook: `${config.apiUrl}/api/mercado-pago/webhook` },
      whatsapp: { configured: flags.whatsapp, businessConfigured: flags.whatsappBusiness, webhook: `${config.apiUrl}/api/whatsapp/webhook` },
      email: { configured: flags.email, from: process.env.EMAIL_FROM || '' },
      ai: { configured: flags.openai, mode: flags.openai ? 'openai' : 'fallback seguro' },
      google: { configured: flags.google, authUrlReady: flags.google },
      logs: mapRows(all('SELECT * FROM integration_logs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 30', [user.workspaceId]))
    };
    return send(res, 200, status);
  }

  if (pathname === '/api/system/status' && req.method === 'GET') {
    const user = requireSuper(req, res); if (!user) return;
    const supabase = await supabaseHealthCheck();
    return send(res, 200, {
      api: { ok: true, env: config.nodeEnv, port: config.port, apiUrl: config.apiUrl },
      database: { primary: 'supabase', fallback: 'sqlite', activeMode: supabase.ok ? 'supabase' : 'sqlite_fallback', supabase, sync: syncSummary() },
      storage: {
        proofs: await bucketStatus(process.env.SUPABASE_STORAGE_BUCKET_PROOFS || 'payment-proofs'),
        avatars: await bucketStatus(process.env.SUPABASE_STORAGE_BUCKET_AVATARS || 'avatars'),
        progress: await bucketStatus(process.env.SUPABASE_STORAGE_BUCKET_PROGRESS || 'progress-photos'),
        contents: await bucketStatus(process.env.SUPABASE_STORAGE_BUCKET_CONTENTS || 'content-files'),
        fallbackFiles: mapRows(all('SELECT * FROM storage_fallback_files ORDER BY created_at DESC LIMIT 50'))
      },
      queue: mapRows(listSyncQueue().slice(0, 100)),
      statuses: mapRows(systemStatusRows())
    });
  }

  if (pathname === '/api/sync/run' && req.method === 'POST') {
    const user = requireSuper(req, res); if (!user) return;
    const result = await processAllSyncQueues(50);
    audit(user, 'sync_queue_processed', 'sync_queue', 'manual', JSON.stringify(result).slice(0, 800));
    return send(res, 200, { ok: true, result, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/storage/sync' && req.method === 'POST') {
    const user = requireSuper(req, res); if (!user) return;
    const result = await processStorageFallback(50);
    audit(user, 'storage_fallback_processed', 'storage_fallback_files', 'manual', JSON.stringify(result).slice(0, 800));
    return send(res, 200, { ok: true, result, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/sync/queue' && req.method === 'GET') {
    const user = requireSuper(req, res); if (!user) return;
    return send(res, 200, { summary: syncSummary(), items: mapRows(listSyncQueue()) });
  }



  if (pathname === '/api/integrations/action' && req.method === 'POST') {
    const user = requireSuper(req, res); if (!user) return;
    const body = await readBody(req);
    const key = sanitizeText(body.key || body.integration || '', 80);
    const actionName = sanitizeText(body.action || 'test', 80);
    if (!key) return send(res, 422, { error: 'Informe a integração.' });
    let result = { ok: false, message: 'Integração sem teste implementado.' };
    try {
      if (key.includes('supabase')) {
        const health = await supabaseHealthCheck();
        result = { ok: Boolean(health.ok), message: health.ok ? 'Supabase respondeu com sucesso.' : (health.error || 'Supabase indisponível.'), details: health };
      } else if (key.includes('mercado')) {
        const payment = get('SELECT * FROM payments WHERE workspace_id=? ORDER BY created_at DESC LIMIT 1', [user.workspaceId]);
        if (!payment) throw new Error('Nenhuma cobrança encontrada para testar Mercado Pago.');
        const student = get('SELECT * FROM students WHERE id=?', [payment.student_id]);
        const plan = get('SELECT * FROM plans WHERE id=?', [payment.plan_id]);
        const pref = await createMercadoPagoPreference({ payment, student, plan, notificationUrl: `${config.apiUrl}/api/mercado-pago/webhook` });
        run('UPDATE payments SET external_link=? WHERE id=?', [pref.init_point || pref.sandbox_init_point || '', payment.id]);
        result = { ok: true, message: 'Preference criada para a cobrança mais recente.', preferenceId: pref.id || '', initPoint: pref.init_point || pref.sandbox_init_point || '' };
      } else if (key.includes('whatsapp')) {
        const trainer = get('SELECT * FROM trainers WHERE workspace_id=? ORDER BY created_at DESC LIMIT 1', [user.workspaceId]);
        const to = String(body.to || trainer?.phone || process.env.WHATSAPP_PHONE || '').replace(/\D/g, '');
        if (!to) throw new Error('Nenhum telefone disponível para teste de WhatsApp.');
        const wa = await sendWhatsAppText({ to, text: 'Teste de integração FitPro Elite: API e WhatsApp Business configurados.' });
        result = { ok: true, message: 'Mensagem de teste enviada via WhatsApp Business.', providerResult: wa };
      } else if (key.includes('email') || key.includes('resend')) {
        const to = body.to || process.env.EMAIL_FROM;
        if (!to) throw new Error('EMAIL_FROM ou destinatário de teste não configurado.');
        const email = await sendEmail({ to, subject: 'Teste FitPro Elite', html: '<p>Integração de e-mail FitPro Elite funcionando.</p>' });
        result = { ok: true, message: 'E-mail de teste enviado.', providerResult: email };
      } else if (key.includes('openai') || key.includes('ia')) {
        const ai = await askOpenAI({ prompt: 'Responda em uma frase: a integração do FitPro está funcionando?', role: user.role });
        result = { ok: true, message: 'Assistente IA respondeu com segurança.', provider: ai.provider, answer: ai.answer };
      } else if (key.includes('google')) {
        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI) throw new Error('Google Calendar/Meet ainda sem credenciais.');
        result = { ok: true, message: 'Credenciais Google básicas detectadas. Use /api/google/auth-url para iniciar OAuth.' };
      } else {
        result = { ok: true, message: `Ação ${actionName} registrada para ${key}.` };
      }
      integrationLog(user.workspaceId, key, actionName, result.ok ? 'ok' : 'warn', key, result.message);
      return send(res, 200, { ok: result.ok, result, bootstrap: bootstrap(user) });
    } catch (error) {
      integrationLog(user.workspaceId, key, actionName, 'error', key, error.message);
      return send(res, 502, { error: error.message, bootstrap: bootstrap(user) });
    }
  }

  if (pathname === '/api/automations/run' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    const body = await readBody(req);
    const channels = Array.isArray(body.channels) ? body.channels : ['internal'];
    const pendingPayments = all('SELECT * FROM payments WHERE workspace_id=? AND status IN (?,?,?) ORDER BY due_date LIMIT 25', [user.workspaceId, 'pendente', 'aguardando_comprovante', 'em_analise']);
    const inactiveStudents = all('SELECT * FROM students WHERE workspace_id=? AND status IN (?,?) ORDER BY last_activity_at LIMIT 25', [user.workspaceId, 'ativo', 'aprovado']);
    let notificationsCreated = 0;
    let externalMessages = 0;
    const errors = [];
    for (const payment of pendingPayments) {
      const result = await notifyPaymentChannels({ user, payment, template: 'payment_pending', channels });
      if (result.internal) notificationsCreated++;
      if (result.whatsapp || result.email) externalMessages++;
      errors.push(...result.errors);
      paymentHistory(payment.id, user.id, 'automation_payment_reminder', `Automação registrou cobrança pendente. Canais: ${channels.join(',')}`);
    }
    for (const student of inactiveStudents.slice(0, 10)) {
      const last = student.last_activity_at ? new Date(student.last_activity_at).getTime() : 0;
      const days = last ? Math.floor((Date.now() - last) / 86400000) : 999;
      if (days >= 7 && student.user_id) {
        notify(user.workspaceId, student.user_id, 'Missão rápida FitPro', 'Volte com uma ação pequena hoje: água, caminhada ou check-in curto.');
        notificationsCreated++;
        if (channels.includes('whatsapp') && student.phone) {
          try { await sendWhatsAppText({ to: student.phone, text: whatsappTemplates.inactive_student({ student }) }); externalMessages++; }
          catch (error) { errors.push(`WhatsApp inativo ${student.id}: ${error.message}`); integrationLog(user.workspaceId, 'whatsapp', 'inactive_student', 'error', student.id, error.message); }
        }
      }
    }
    integrationLog(user.workspaceId, 'automations', 'manual_run', errors.length ? 'warn' : 'ok', today, `${pendingPayments.length} cobranças • ${notificationsCreated} internas • ${externalMessages} externas.`);
    audit(user, 'automations_run', 'automation_rules', 'manual', `${pendingPayments.length} pagamentos • ${notificationsCreated} notificações • ${externalMessages} externas.`);
    return send(res, 200, { ok: true, processedPayments: pendingPayments.length, notificationsCreated, externalMessages, errors, bootstrap: bootstrap(user) });
  }

  const leadConvert = pathname.match(/^\/api\/leads\/([^/]+)\/convert$/);
  if (leadConvert && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const lead = get('SELECT * FROM leads WHERE id=?', [leadConvert[1]]);
    if (!lead || !assertWorkspace(user, lead.workspace_id)) return send(res, 404, { error: 'Lead não encontrado.' });
    const body = await readBody(req);
    const trainer = get('SELECT * FROM trainers WHERE workspace_id=? ORDER BY created_at DESC LIMIT 1', [user.workspaceId]);
    const plan = get('SELECT * FROM plans WHERE workspace_id=? AND active=1 ORDER BY featured DESC, price LIMIT 1', [user.workspaceId]);
    const studentId = id('stu');
    run('INSERT INTO students (id,workspace_id,trainer_id,name,email,phone,city,goal,level,plan_id,status,last_activity_at,consents_json,created_at,request_status,onboarding_stage,payment_method,request_message) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [studentId, user.workspaceId, trainer?.id || user.trainerId || 'trainer_leandro', lead.name, lead.email || '', lead.phone || '', sanitizeText(body.city || '', 120), lead.goal || '', 'iniciante', plan?.id || 'plan_basic', 'aguardando_aprovacao', nowISO(), toJSON({ leadConverted: true }), nowISO(), 'aguardando_aprovacao', 'aguardando_aprovacao', 'a_combinar', lead.note || 'Lead convertido pelo CRM.']);
    run('UPDATE leads SET status=?, note=? WHERE id=?', ['convertido', 'Convertido em solicitação de aluno pelo personal.', lead.id]);
    audit(user, 'lead_converted', 'lead', lead.id, `Novo aluno: ${studentId}`);
    return send(res, 201, { id: studentId, bootstrap: bootstrap(user) });
  }

  const paymentReminder = pathname.match(/^\/api\/payments\/([^/]+)\/(send-whatsapp-reminder|send-email-reminder)$/);
  if (paymentReminder && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const payment = get('SELECT * FROM payments WHERE id=?', [paymentReminder[1]]);
    if (!payment || !assertWorkspace(user, payment.workspace_id)) return send(res, 404, { error: 'Pagamento não encontrado.' });
    const student = get('SELECT * FROM students WHERE id=?', [payment.student_id]);
    const body = await readBody(req);
    try {
      if (paymentReminder[2] === 'send-whatsapp-reminder') {
        const to = String(student?.phone || body.to || '').replace(/\D/g, '');
        if (!to) throw new Error('Aluno sem WhatsApp cadastrado.');
        const result = await sendWhatsAppText({ to, text: body.text ? sanitizeText(body.text, 1200) : whatsappTemplates.payment_pending({ student, payment }) });
        integrationLog(user.workspaceId, 'whatsapp', 'payment_reminder', 'ok', payment.id, 'Lembrete de pagamento enviado.');
        return send(res, 200, { ok: true, result, bootstrap: bootstrap(user) });
      }
      const to = student?.email || body.to;
      if (!to) throw new Error('Aluno sem e-mail cadastrado.');
      const result = await sendEmailTemplate({ to, template: 'payment_pending', context: { student, payment } });
      integrationLog(user.workspaceId, 'email', 'payment_reminder', 'ok', payment.id, 'E-mail de pagamento enviado.');
      return send(res, 200, { ok: true, result, bootstrap: bootstrap(user) });
    } catch (error) {
      integrationLog(user.workspaceId, paymentReminder[2].includes('whatsapp') ? 'whatsapp' : 'email', 'payment_reminder', 'error', payment.id, error.message);
      return send(res, 502, { error: error.message, bootstrap: bootstrap(user) });
    }
  }

  if (pathname === '/api/mercado-pago/webhook' && req.method === 'GET') {
    return send(res, 200, {
      ok: true,
      provider: 'mercado_pago',
      webhook: `${config.apiUrl}/api/mercado-pago/webhook`,
      signature: process.env.MERCADO_PAGO_WEBHOOK_SECRET ? 'configurada' : 'ausente',
      mode: config.nodeEnv,
      message: 'Webhook Mercado Pago ativo. Use POST para notificações oficiais.'
    });
  }

  if (pathname === '/api/mercado-pago/webhook' && req.method === 'POST') {
    const signature = validateMercadoPagoWebhook(req, url);
    const requestId = signature.requestId || String(req.headers['x-request-id'] || '');
    let body = {};
    try { body = await readBody(req); } catch (error) { return send(res, error.status || 400, { ok: false, error: error.message || 'JSON inválido.' }); }

    const eventType = body?.type || body?.action || body?.topic || url.searchParams.get('type') || url.searchParams.get('topic') || '';
    const eventKind = mercadoPagoEventKind(eventType, url.searchParams.get('topic') || '');
    const dataId = String(body?.data?.id || body?.id || body?.payment_id || url.searchParams.get('data.id') || url.searchParams.get('id') || '').trim();
    const eventKey = String(body?.id || requestId || `${eventType}:${dataId}:${body?.action || ''}`).slice(0, 180) || id('mp_evt');

    if (signature.required && !signature.valid) {
      recordMercadoPagoEvent({ eventKey, requestId, eventType, resourceId: dataId, signatureValid: false, processedStatus: 'rejected_signature', payload: { type: eventType, data: body?.data || {}, query: Object.fromEntries(url.searchParams.entries()) }, error: signature.reason });
      integrationLog('ws_fitpro_elite', 'mercado_pago', 'webhook_signature', 'error', dataId || eventKey, signature.reason);
      audit({ id: 'mercado_pago', workspaceId: 'ws_fitpro_elite' }, 'mercado_pago_webhook_rejected', 'integration', 'mercado_pago', signature.reason);
      return send(res, 401, { ok: false, error: 'Assinatura Mercado Pago inválida.' });
    }

    const firstRecord = recordMercadoPagoEvent({ eventKey, requestId, eventType, resourceId: dataId, signatureValid: signature.valid, processedStatus: 'received', payload: { type: eventType, action: body?.action || '', data: body?.data || {}, query: Object.fromEntries(url.searchParams.entries()) } });
    if (firstRecord.duplicate && firstRecord.row?.processed_status === 'processed') {
      integrationLog('ws_fitpro_elite', 'mercado_pago', 'webhook_duplicate', 'ok', dataId || eventKey, 'Evento duplicado ignorado com segurança.');
      return send(res, 200, { ok: true, duplicate: true, updatedPayment: firstRecord.row.payment_id || '' });
    }

    let mpPayload = null;
    let externalReference = body?.data?.external_reference || body?.external_reference || '';
    let status = body?.data?.status || body?.status || '';
    let statusDetail = body?.data?.status_detail || body?.status_detail || '';
    let preapprovalId = '';
    let preferenceId = '';
    let paymentId = '';
    let processedStatus = 'processed_without_payment';
    let errorMessage = '';

    try {
      mpPayload = await fetchMercadoPagoResource(eventKind, dataId);
      if (mpPayload) {
        externalReference = mpPayload?.external_reference || mpPayload?.metadata?.fitpro_payment_id || externalReference;
        status = mpPayload?.status || status;
        statusDetail = mpPayload?.status_detail || statusDetail;
        preapprovalId = mpPayload?.preapproval_id || (eventKind === 'preapproval' ? mpPayload?.id : '') || '';
        preferenceId = mpPayload?.preference_id || mpPayload?.collector_id || '';
      }
    } catch (error) {
      processedStatus = 'fetch_error';
      errorMessage = error.message || 'Falha ao consultar Mercado Pago.';
      integrationLog('ws_fitpro_elite', 'mercado_pago', 'webhook_fetch_detail', 'error', dataId, errorMessage);
    }

    const payment = findPaymentByMercadoPagoReference({ externalReference, dataId, preapprovalId, preferenceId });
    const platformSubscription = payment ? null : findPlatformSubscriptionByMercadoPagoReference({ externalReference, dataId, preferenceId });
    if (payment) {
      const mappedStatus = paymentStatusFromMercadoPago(status || (eventKind === 'chargeback' ? 'charged_back' : ''));
      const paidAt = mappedStatus === 'aprovado' ? (payment.paid_at || nowISO()) : payment.paid_at || null;
      const lastPayload = JSON.stringify({ eventType, eventKind, dataId, externalReference, status, statusDetail, mp: mpPayload ? { id: mpPayload.id, status: mpPayload.status, status_detail: mpPayload.status_detail, external_reference: mpPayload.external_reference, payment_method_id: mpPayload.payment_method_id, transaction_amount: mpPayload.transaction_amount, date_approved: mpPayload.date_approved } : null }).slice(0, 6000);
      run("UPDATE payments SET status=?, mercado_pago_id=COALESCE(NULLIF(?,''), mercado_pago_id), mercado_pago_preapproval_id=COALESCE(NULLIF(?,''), mercado_pago_preapproval_id), mercado_pago_preference_id=COALESCE(NULLIF(?,''), mercado_pago_preference_id), mercado_pago_status=?, mercado_pago_status_detail=?, mercado_pago_last_event_id=?, mercado_pago_last_event_type=?, mercado_pago_last_payload_json=?, payment_provider=?, reviewed_at=?, paid_at=?, last_webhook_at=? WHERE id=?",
        [mappedStatus, eventKind === 'payment' || eventKind === 'chargeback' ? String(dataId) : '', preapprovalId || (eventKind === 'preapproval' ? String(dataId) : ''), preferenceId, String(status || ''), String(statusDetail || ''), eventKey, String(eventType || eventKind), lastPayload, 'mercado_pago', nowISO(), paidAt, nowISO(), payment.id]);
      paymentHistory(payment.id, 'mercado_pago', `Mercado Pago: ${mappedStatus}`, `Webhook ${eventType || eventKind} • status ${status || 'sem status'} • recurso ${dataId || '-'}`);
      const fresh = get('SELECT * FROM payments WHERE id=?', [payment.id]);
      await notifyPaymentChannels({ user: { id: 'mercado_pago', workspaceId: payment.workspace_id }, payment: fresh, template: paymentStatusTone(mappedStatus), reason: statusDetail || status || mappedStatus, channels: ['internal'] });
      paymentId = payment.id;
      processedStatus = 'processed';
    } else if (platformSubscription) {
      const mappedStatus = paymentStatusFromMercadoPago(status || '');
      const platformStatus = mappedStatus === 'aprovado' ? 'ativo' : mappedStatus === 'recusado' ? 'recusado' : mappedStatus === 'cancelado' ? 'cancelado' : mappedStatus === 'reembolsado' ? 'reembolsado' : 'pendente';
      const startsAt = platformStatus === 'ativo' ? nowISO() : (platformSubscription.starts_at || '');
      const expiresAt = platformStatus === 'ativo' ? new Date(Date.now() + 30 * 86400000).toISOString() : (platformSubscription.expires_at || '');
      run("UPDATE platform_subscriptions SET status=?, paid_at=CASE WHEN ?='ativo' THEN COALESCE(NULLIF(paid_at,''),?) ELSE paid_at END, mercado_pago_payment_id=COALESCE(NULLIF(?,''),mercado_pago_payment_id), starts_at=COALESCE(NULLIF(?,''),starts_at), expires_at=COALESCE(NULLIF(?,''),expires_at), metadata=?, updated_at=? WHERE id=?", [platformStatus, platformStatus, nowISO(), dataId || preferenceId, startsAt, expiresAt, toJSON({ eventType, eventKind, dataId, externalReference, status, statusDetail, mercadoPago: mpPayload ? { id: mpPayload.id, status: mpPayload.status, external_reference: mpPayload.external_reference } : null }), nowISO(), platformSubscription.id]);
      if (platformStatus === 'ativo') run('UPDATE trainers SET platform_subscription_status=?, platform_plan_name=?, platform_plan_amount=?, payment_blocked_at=NULL WHERE id=?', ['ativo', platformSubscription.plan_name, Number(platformSubscription.amount || 0), platformSubscription.trainer_id]);
      paymentLog(platformSubscription.workspace_id, platformSubscription.id, 'platform_subscription', `mercado_pago_${platformStatus}`, 'mercado_pago', { dataId, externalReference, status, statusDetail });
      paymentId = platformSubscription.id;
      processedStatus = 'processed_platform_subscription';
    } else if (!errorMessage) {
      processedStatus = 'unmatched';
      errorMessage = 'Webhook recebido, mas nenhuma cobrança FitPro correspondente foi localizada.';
    }

    recordMercadoPagoEvent({ eventKey, requestId, eventType, resourceId: dataId, externalReference, paymentId, status, signatureValid: signature.valid, processedStatus, payload: { type: eventType, action: body?.action || '', data: body?.data || {}, mercadoPago: mpPayload ? { id: mpPayload.id, status: mpPayload.status, status_detail: mpPayload.status_detail, external_reference: mpPayload.external_reference } : null }, error: errorMessage });
    integrationLog('ws_fitpro_elite', 'mercado_pago', 'webhook_received', paymentId ? 'ok' : (processedStatus === 'unmatched' ? 'warn' : 'error'), paymentId || dataId || 'mercado_pago', JSON.stringify({ eventType, dataId, externalReference, status, processedStatus, paymentId }).slice(0, 1000));
    audit({ id: 'mercado_pago', workspaceId: payment?.workspace_id || platformSubscription?.workspace_id || 'ws_fitpro_elite' }, 'mercado_pago_webhook_received', 'integration', 'mercado_pago', JSON.stringify({ type: eventType, dataId, paymentId, processedStatus }).slice(0, 800));
    return send(res, 200, { ok: true, processedStatus, updatedPayment: paymentId });
  }

  if (pathname === '/api/whatsapp/webhook' && req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders(req) });
      return res.end(challenge || '');
    }
    return send(res, 403, { error: 'Token de verificação inválido.' });
  }

  if (pathname === '/api/whatsapp/webhook' && req.method === 'POST') {
    let body = {};
    try { body = await readBody(req); } catch (error) {
      integrationLog('ws_fitpro_elite', 'whatsapp', 'webhook_invalid_json', 'error', 'whatsapp', error.message || 'JSON inválido.');
      return send(res, error.status || 400, { ok: false, error: error.message || 'JSON inválido.' });
    }
    const result = await processWhatsAppWebhookPayload(body);
    return send(res, 200, { ok: true, result });
  }


  if (pathname === '/api/tenant/branding' && req.method === 'PUT') {
    const user = requireSuper(req, res); if (!user) return;
    const body = await readBody(req);
    const workspaceId = user.workspaceId || 'ws_fitpro_elite';
    const existing = get('SELECT id FROM tenant_branding WHERE workspace_id=?', [workspaceId]);
    const payload = {
      id: existing?.id || id('brand'), workspace_id: workspaceId,
      public_slug: sanitizeText(body.publicSlug || body.slug || 'fitpro-elite', 80).toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
      headline: sanitizeText(body.headline || 'Acompanhamento fitness premium', 180),
      public_description: sanitizeText(body.publicDescription || body.description || '', 1200),
      primary_color: sanitizeText(body.primaryColor || '#00e676', 20),
      accent_color: sanitizeText(body.accentColor || '#16a34a', 20),
      custom_domain: sanitizeText(body.customDomain || '', 120),
      whatsapp_cta: sanitizeText(body.whatsappCta || 'Quero iniciar meu acompanhamento FitPro', 180),
      active: body.active === false ? 0 : 1,
      updated_at: nowISO(), created_at: nowISO()
    };
    if (existing) run('UPDATE tenant_branding SET public_slug=?,headline=?,public_description=?,primary_color=?,accent_color=?,custom_domain=?,whatsapp_cta=?,active=?,updated_at=? WHERE workspace_id=?', [payload.public_slug,payload.headline,payload.public_description,payload.primary_color,payload.accent_color,payload.custom_domain,payload.whatsapp_cta,payload.active,payload.updated_at,workspaceId]);
    else run('INSERT INTO tenant_branding (id,workspace_id,public_slug,headline,public_description,primary_color,accent_color,custom_domain,whatsapp_cta,active,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [payload.id,payload.workspace_id,payload.public_slug,payload.headline,payload.public_description,payload.primary_color,payload.accent_color,payload.custom_domain,payload.whatsapp_cta,payload.active,payload.updated_at,payload.created_at]);
    audit(user, 'tenant_branding_updated', 'tenant_branding', workspaceId, JSON.stringify({ publicSlug: payload.public_slug }));
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/coupons' && req.method === 'POST') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    const code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
    if (!code) return send(res, 400, { error: 'Informe um código de cupom válido.' });
    const payload = { id: id('coupon'), workspace_id: user.workspaceId, code, description: sanitizeText(body.description || 'Cupom FitPro', 250), discount_type: body.discountType === 'fixed' ? 'fixed' : 'percent', discount_value: Number(body.discountValue || 0), min_amount: Number(body.minAmount || 0), max_uses: Number(body.maxUses || 0), uses: 0, active: 1, expires_at: body.expiresAt || '', created_at: nowISO() };
    run('INSERT INTO coupons (id,workspace_id,code,description,discount_type,discount_value,min_amount,max_uses,uses,active,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [payload.id,payload.workspace_id,payload.code,payload.description,payload.discount_type,payload.discount_value,payload.min_amount,payload.max_uses,payload.uses,payload.active,payload.expires_at,payload.created_at]);
    audit(user, 'coupon_created', 'coupon', payload.id, JSON.stringify({ code: payload.code }));
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/referrals' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const codeBase = String(body.code || `${user.name || 'FITPRO'}${Math.floor(Math.random()*900+100)}`).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32);
    const code = codeBase || `FITPRO${Date.now().toString(36).toUpperCase()}`;
    const payload = { id: id('ref'), workspace_id: user.workspaceId, trainer_id: user.trainerId || '', student_id: user.studentId || '', code, reward_points: Number(body.rewardPoints || 100), discount_percent: Number(body.discountPercent || 0), max_uses: Number(body.maxUses || 0), uses: 0, active: 1, expires_at: body.expiresAt || '', created_at: nowISO() };
    run('INSERT INTO referral_codes (id,workspace_id,trainer_id,student_id,code,reward_points,discount_percent,max_uses,uses,active,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [payload.id,payload.workspace_id,payload.trainer_id,payload.student_id,payload.code,payload.reward_points,payload.discount_percent,payload.max_uses,payload.uses,payload.active,payload.expires_at,payload.created_at]);
    audit(user, 'referral_created', 'referral_code', payload.id, JSON.stringify({ code: payload.code }));
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/device-connections' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const studentId = user.role === 'student' ? user.studentId : body.studentId;
    if (!studentId || !canAccessStudent(user, studentId)) return send(res, 403, { error: 'Sem permissão para conectar dispositivo deste aluno.' });
    const provider = sanitizeText(body.provider || 'manual_fitpro', 80);
    const metrics = body.metrics || {};
    const existing = get('SELECT id FROM device_connections WHERE student_id=? AND provider=?', [studentId, provider]);
    if (existing) run('UPDATE device_connections SET status=?,last_sync_at=?,metrics_json=?,updated_at=? WHERE id=?', ['connected', nowISO(), toJSON(metrics), nowISO(), existing.id]);
    else run('INSERT INTO device_connections (id,workspace_id,student_id,provider,status,last_sync_at,metrics_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', [id('device'), user.workspaceId, studentId, provider, 'connected', nowISO(), toJSON(metrics), nowISO(), nowISO()]);
    audit(user, 'device_connected', 'device_connection', studentId, JSON.stringify({ provider }));
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/health-metrics' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const studentId = user.role === 'student' ? user.studentId : body.studentId;
    if (!studentId || !canAccessStudent(user, studentId)) return send(res, 403, { error: 'Sem permissão para registrar métricas deste aluno.' });
    const metricDate = body.metricDate || new Date().toISOString().slice(0,10);
    const payload = { id: id('metric'), workspace_id: user.workspaceId, student_id: studentId, source: sanitizeText(body.source || 'manual_fitpro', 80), metric_date: metricDate, steps: Number(body.steps || 0), calories: Number(body.calories || 0), active_minutes: Number(body.activeMinutes || 0), sleep_hours: Number(body.sleepHours || 0), heart_rate_avg: Number(body.heartRateAvg || 0), metadata_json: toJSON(body.metadata || {}), created_at: nowISO() };
    run('INSERT INTO health_metrics (id,workspace_id,student_id,source,metric_date,steps,calories,active_minutes,sleep_hours,heart_rate_avg,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [payload.id,payload.workspace_id,payload.student_id,payload.source,payload.metric_date,payload.steps,payload.calories,payload.active_minutes,payload.sleep_hours,payload.heart_rate_avg,payload.metadata_json,payload.created_at]);
    audit(user, 'health_metric_created', 'health_metric', payload.id, JSON.stringify({ source: payload.source, metricDate }));
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/dev/reset-seed' && req.method === 'POST') {
    const user = requireSuper(req, res); if (!user) return;
    return send(res, 200, { message: 'Use npm run reset:db e reinicie o servidor para recriar o seed controlado local.' });
  }

  return send(res, 404, { error: 'Rota não encontrada.' });
}

function serveStatic(req, res, url) {
  const dist = path.join(config.root, 'dist');
  let filePath = path.join(dist, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!filePath.startsWith(dist) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(dist, 'index.html');
  if (!fs.existsSync(filePath)) return send(res, 404, { error: 'Build não encontrado. Rode npm run build ou use npm run dev.' });
  const ext = path.extname(filePath);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    applyCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Healthcheck precisa responder antes de qualquer auth, body parser, rota protegida ou SPA fallback.
    // A Railway usa esse endpoint para decidir se o container está saudável.
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return send(res, 200, {
        ok: true,
        app: 'FitPro API',
        env: config.nodeEnv,
        now: nowISO(),
        host: process.env.HOST || '0.0.0.0',
        port: Number(process.env.PORT || config.port || 3333),
        mode: 'fullstack'
      });
    }

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204, { ...corsHeaders(req), 'Cache-Control': 'public, max-age=86400' });
      res.end();
      return;
    }

    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || 500;
    console.error('Erro tratado no handler principal:', error);
    return send(res, status, { error: status === 500 ? 'Erro interno tratado com segurança.' : error.message });
  }
});

const syncTimer = startBackgroundSync();
if (syncTimer) console.log(`FitPro sync automático ativo a cada ${process.env.SYNC_INTERVAL_SECONDS}s.`);

const PORT = Number(process.env.PORT || config.port || 3333);
const HOST = process.env.HOST || '0.0.0.0';

server.on('error', (error) => {
  console.error('Falha ao iniciar FitPro API:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection tratado:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception tratado:', error);
});

server.listen(PORT, HOST, () => {
  console.log(`FitPro API rodando em ${HOST}:${PORT} • env=${config.nodeEnv}`);
});
