import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { all, get, json, run, toJSON } from './db.mjs';
import { seedIfNeeded } from './seed.mjs';
import { createToken, hashPassword, id, nowISO, safeFileName, sanitizeText, verifyPassword, verifyToken } from './security.mjs';

seedIfNeeded();

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'dev']);
const SUPER_ROLES = new Set(['super_admin', 'dev']);
const MAX_JSON_BYTES = 12 * 1024 * 1024;
const PUBLIC_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/pdf']);
const AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    ...corsHeaders(),
    ...headers
  });
  res.end(body);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': config.appOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  };
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
  const match = cookie.match(/(?:^|;)\s*fitpro_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function tokenFromReq(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return cookieToken(req);
}

function normalizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    studentId: row.student_id,
    trainerId: row.trainer_id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatar: row.avatar,
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
  if (user.role === 'admin') return user.workspaceId === student.workspace_id;
  return false;
}

function audit(user, action, entity, entityId, metadata = '') {
  const workspaceId = user?.workspaceId || 'ws_fitpro_elite';
  run('INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity,entity_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)',
    [id('log'), workspaceId, user?.id || 'system', action, entity, entityId, metadata, nowISO()]);
}

function paymentHistory(paymentId, actorId, action, note = '') {
  run('INSERT INTO payment_history (id,payment_id,actor_id,action,note,created_at) VALUES (?,?,?,?,?,?)',
    [id('ph'), paymentId, actorId || 'system', action, note, nowISO()]);
}

function notify(workspaceId, userId, title, body = '') {
  run('INSERT INTO notifications (id,workspace_id,user_id,title,body,created_at) VALUES (?,?,?,?,?,?)',
    [id('not'), workspaceId, userId, title, body, nowISO()]);
}

function parseDataUrl(dataUrl = '') {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  return { mime, buffer };
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

function mapRows(rows) {
  return rows.map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
    return out;
  });
}
function mapStudent(row) {
  if (!row) return null;
  const mapped = mapRows([row])[0];
  const userRow = row.user_id ? get('SELECT id,name,avatar FROM users WHERE id=?', [row.user_id]) : null;
  return { ...mapped, avatar: userRow?.avatar || '', consents: json(row.consents_json, {}) };
}
function publicUsers(workspaceId) {
  return mapRows(all('SELECT id,workspace_id,student_id,trainer_id,name,email,role,avatar,created_at FROM users WHERE workspace_id=?', [workspaceId]));
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
    automations: mapRows(tableAll('automation_rules', workspaceId)),
    notifications: mapRows(all('SELECT * FROM notifications WHERE workspace_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50', [workspaceId, user.id])),
    users: publicUsers(workspaceId)
  };

  if (user.role === 'student') {
    const studentId = user.studentId;
    const student = get('SELECT * FROM students WHERE id = ?', [studentId]);
    return {
      ...base,
      students: [mapStudent(student)],
      workouts: mapRows(all('SELECT * FROM workouts WHERE workspace_id = ? AND (student_id = ? OR student_id IS NULL) ORDER BY created_at DESC', [workspaceId, studentId])).map(w => ({ ...w, exercises: json(w.exercisesJson, []) })),
      schedules: mapRows(all('SELECT * FROM schedules WHERE workspace_id = ? AND student_id = ? ORDER BY date,time', [workspaceId, studentId])),
      assessments: mapRows(all('SELECT * FROM assessments WHERE workspace_id = ? AND student_id = ? ORDER BY date', [workspaceId, studentId])),
      payments: all('SELECT * FROM payments WHERE workspace_id = ? AND student_id = ? ORDER BY due_date DESC', [workspaceId, studentId]).map(cleanPayment),
      contents: all('SELECT * FROM contents WHERE workspace_id = ? ORDER BY featured DESC,created_at DESC', [workspaceId]).map(c => ({ ...mapRows([c])[0], accessPlanIds: json(c.access_plan_ids_json, []), studentAccessIds: json(c.student_access_ids_json, []), completedBy: json(c.completed_by_json, []) })),
      posts: all('SELECT * FROM community_posts WHERE workspace_id = ? AND (visibility = ? OR student_id = ?) ORDER BY pinned DESC,created_at DESC', [workspaceId, 'publico', studentId]).map(p => ({ ...mapRows([p])[0], likes: json(p.likes_json, []), comments: json(p.comments_json, []) })),
      messages: mapRows(all('SELECT * FROM messages WHERE workspace_id = ? AND student_id = ? ORDER BY created_at DESC LIMIT 100', [workspaceId, studentId])),
      leads: [],
      challenges: all('SELECT * FROM challenges WHERE workspace_id = ?', [workspaceId]).map(c => ({ ...mapRows([c])[0], participants: json(c.participants_json, []) })),
      habits: mapRows(all('SELECT * FROM habits WHERE workspace_id = ? AND student_id = ? ORDER BY date DESC LIMIT 30', [workspaceId, studentId])),
      supplements: mapRows(all('SELECT * FROM supplements WHERE workspace_id = ? AND student_id = ? ORDER BY created_at DESC', [workspaceId, studentId])),
      auditLogs: []
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
    posts: all('SELECT * FROM community_posts WHERE workspace_id = ? ORDER BY pinned DESC,created_at DESC', [workspaceId]).map(p => ({ ...mapRows([p])[0], likes: json(p.likes_json, []), comments: json(p.comments_json, []) })),
    messages: mapRows(all('SELECT * FROM messages WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200', [workspaceId])),
    leads: mapRows(all('SELECT * FROM leads WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId])),
    challenges: all('SELECT * FROM challenges WHERE workspace_id = ?', [workspaceId]).map(c => ({ ...mapRows([c])[0], participants: json(c.participants_json, []) })),
    habits: mapRows(all('SELECT * FROM habits WHERE workspace_id = ? ORDER BY date DESC LIMIT 100', [workspaceId])),
    supplements: mapRows(all('SELECT * FROM supplements WHERE workspace_id = ? ORDER BY created_at DESC', [workspaceId])),
    auditLogs: mapRows(all('SELECT * FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200', [workspaceId]))
  };
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const pathname = url.pathname;

  if (pathname === '/api/health') return send(res, 200, { ok: true, now: nowISO(), mode: 'fullstack' });

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
    return send(res, 200, { token, user }, { 'Set-Cookie': `fitpro_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${config.tokenTtlHours * 3600}` });
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const user = authUser(req);
    if (user) audit(user, 'logout', 'user', user.id, 'Logout realizado.');
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'fitpro_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    const body = await readBody(req);
    const workspace = get('SELECT * FROM workspaces LIMIT 1');
    const trainer = get('SELECT * FROM trainers WHERE workspace_id = ? LIMIT 1', [workspace.id]);
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !body.password || String(body.password).length < 6) return send(res, 422, { error: 'Informe e-mail e senha com no mínimo 6 caracteres.' });
    if (get('SELECT id FROM users WHERE email = ?', [email])) return send(res, 409, { error: 'Este e-mail já está cadastrado.' });
    const userId = id('user');
    const studentId = id('student');
    const now = nowISO();
    const name = sanitizeText(body.name || 'Novo aluno', 120);
    run('INSERT INTO users (id,workspace_id,student_id,name,email,password_hash,role,avatar,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [userId, workspace.id, studentId, name, email, hashPassword(String(body.password)), 'student', name.split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase(), now]);
    const plan = get('SELECT id FROM plans WHERE workspace_id = ? AND featured = 1 LIMIT 1', [workspace.id]) || get('SELECT id FROM plans WHERE workspace_id = ? LIMIT 1', [workspace.id]);
    run('INSERT INTO students (id,user_id,workspace_id,trainer_id,name,email,phone,city,goal,birthdate,height,initial_weight,current_weight,level,restrictions,plan_id,status,last_activity_at,consents_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [studentId, userId, workspace.id, trainer.id, name, email, sanitizeText(body.phone, 30), sanitizeText(body.city, 100), sanitizeText(body.goal, 200), body.birthdate || '', Number(body.height || 0), Number(body.weight || 0), Number(body.weight || 0), body.level || 'iniciante', sanitizeText(body.restrictions, 500), plan.id, 'ativo', now, toJSON({ terms: Boolean(body.terms), lgpd: Boolean(body.lgpd), photos: Boolean(body.photos), notifications: Boolean(body.notifications) }), now]);
    audit({ id: userId, workspaceId: workspace.id }, 'register_student', 'student', studentId, 'Aluno cadastrado pelo formulário público.');
    notify(workspace.id, 'user_admin', 'Novo aluno cadastrado', `${name} criou uma conta no FitPro.`);
    const user = normalizeUser(get('SELECT * FROM users WHERE id = ?', [userId]));
    const token = createToken({ sub: userId, role: 'student', workspaceId: workspace.id });
    return send(res, 201, { token, user }, { 'Set-Cookie': `fitpro_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${config.tokenTtlHours * 3600}` });
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
    const email = String(body.email || `${studentId}@demo.local`).toLowerCase();
    const now = nowISO();
    const trainer = get('SELECT id FROM trainers WHERE workspace_id = ? LIMIT 1', [user.workspaceId]);
    const plan = body.planId || get('SELECT id FROM plans WHERE workspace_id = ? LIMIT 1', [user.workspaceId])?.id;
    run('INSERT INTO students (id,workspace_id,trainer_id,name,email,phone,city,goal,birthdate,height,initial_weight,current_weight,level,restrictions,plan_id,status,last_activity_at,consents_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [studentId, user.workspaceId, trainer.id, sanitizeText(body.name, 120), email, sanitizeText(body.phone,30), sanitizeText(body.city,100), sanitizeText(body.goal,200), body.birthdate || '', Number(body.height || 0), Number(body.initialWeight || 0), Number(body.currentWeight || body.initialWeight || 0), body.level || 'iniciante', sanitizeText(body.restrictions,500), plan, body.status || 'ativo', now, toJSON({ terms:true, lgpd:true, photos:false, notifications:true }), now]);
    audit(user, 'student_created', 'student', studentId, `Aluno ${body.name} criado pelo admin.`);
    return send(res, 201, { id: studentId, bootstrap: bootstrap(user) });
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
    const assessmentId = id('assessment');
    run('INSERT INTO assessments (id,workspace_id,student_id,date,weight,body_fat,lean_mass,waist,abdomen,hip,chest,right_arm,left_arm,right_thigh,left_thigh,calf,photo_name,energy,sleep,soreness,mood,notes,professional_notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [assessmentId, user.workspaceId, studentId, body.date || new Date().toISOString().slice(0,10), Number(body.weight || 0), Number(body.bodyFat || 0), Number(body.leanMass || 0), Number(body.waist || 0), Number(body.abdomen || 0), Number(body.hip || 0), Number(body.chest || 0), Number(body.rightArm || 0), Number(body.leftArm || 0), Number(body.rightThigh || 0), Number(body.leftThigh || 0), Number(body.calf || 0), sanitizeText(body.photoName,120), Number(body.energy || 5), Number(body.sleep || 5), Number(body.soreness || 0), sanitizeText(body.mood,80), sanitizeText(body.notes,800), ADMIN_ROLES.has(user.role) ? sanitizeText(body.professionalNotes,800) : '', nowISO()]);
    audit(user, 'assessment_created', 'assessment', assessmentId, 'Avaliação física registrada.');
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

  const proofUpload = pathname.match(/^\/api\/payments\/([^/]+)\/proof$/);
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
    const filePath = path.join(config.uploadsDir, 'proofs', fileName);
    fs.writeFileSync(filePath, parsed.buffer);
    run('UPDATE payments SET proof_name=?, proof_mime_type=?, proof_size=?, proof_path=?, proof_uploaded_at=?, proof_student_note=?, status=? WHERE id=?', [sanitizeText(body.fileName || fileName, 120), parsed.mime, parsed.buffer.length, filePath, nowISO(), sanitizeText(body.note, 800), 'em_analise', payment.id]);
    paymentHistory(payment.id, user.id, 'Comprovante enviado', body.fileName || fileName);
    audit(user, 'payment_proof_uploaded', 'payment', payment.id, 'Comprovante privado enviado.');
    const admins = all('SELECT id FROM users WHERE workspace_id=? AND role IN (?,?)', [payment.workspace_id, 'admin', 'super_admin']);
    admins.forEach(a => notify(payment.workspace_id, a.id, 'Comprovante enviado', 'Um pagamento manual está aguardando análise.'));
    return send(res, 201, { ok: true, bootstrap: bootstrap(user) });
  }

  const proofGet = pathname.match(/^\/api\/payments\/([^/]+)\/proof$/);
  if (proofGet && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const payment = get('SELECT * FROM payments WHERE id = ?', [proofGet[1]]);
    if (!payment || !payment.proof_path) return send(res, 404, { error: 'Comprovante não encontrado.' });
    if (!assertWorkspace(user, payment.workspace_id) || (user.role === 'student' && user.studentId !== payment.student_id)) return send(res, 403, { error: 'Você não pode acessar este comprovante.' });
    if (!fs.existsSync(payment.proof_path)) return send(res, 404, { error: 'Arquivo privado não localizado no storage.' });
    const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    paymentHistory(payment.id, user.id, disposition === 'attachment' ? 'Comprovante baixado' : 'Comprovante visualizado', payment.proof_name || 'arquivo');
    audit(user, disposition === 'attachment' ? 'payment_proof_downloaded' : 'payment_proof_viewed', 'payment', payment.id, 'Acesso ao comprovante via rota protegida.');
    run('UPDATE payments SET proof_viewed_at=?, proof_viewed_by=? WHERE id=?', [nowISO(), user.id, payment.id]);
    const buffer = fs.readFileSync(payment.proof_path);
    res.writeHead(200, {
      'Content-Type': payment.proof_mime_type || 'application/octet-stream',
      'Content-Length': buffer.length,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(payment.proof_name || 'comprovante')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders()
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


  if (pathname === '/api/profile/avatar' && req.method === 'POST') {
    const user = requireAuth(req, res); if (!user) return;
    const body = await readBody(req);
    const parsed = parseDataUrl(body.dataUrl);
    if (!parsed) return send(res, 422, { error: 'Imagem inválida. Envie PNG, JPG ou WebP em base64.' });
    if (!AVATAR_TYPES.has(parsed.mime)) return send(res, 422, { error: 'Tipo de imagem não permitido. Use PNG, JPG ou WebP.' });
    if (parsed.buffer.length > 3 * 1024 * 1024) return send(res, 413, { error: 'Foto de perfil deve ter no máximo 3MB.' });
    const ext = parsed.mime === 'image/png' ? '.png' : parsed.mime === 'image/webp' ? '.webp' : '.jpg';
    const dir = path.join(config.uploadsDir, 'avatars');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${user.id}${ext}`);
    fs.writeFileSync(filePath, parsed.buffer);
    const avatarUrl = `/api/profile/avatar/${user.id}?v=${Date.now()}`;
    run('UPDATE users SET avatar=? WHERE id=?', [avatarUrl, user.id]);
    audit(user, 'profile_avatar_uploaded', 'user', user.id, 'Foto de perfil atualizada.');
    return send(res, 200, { ok: true, avatarUrl, bootstrap: bootstrap(normalizeUser(get('SELECT * FROM users WHERE id=?', [user.id]))) });
  }

  const avatarGet = pathname.match(/^\/api\/profile\/avatar\/([^/]+)$/);
  if (avatarGet && req.method === 'GET') {
    const user = requireAuth(req, res); if (!user) return;
    const target = get('SELECT id,workspace_id,name FROM users WHERE id=?', [avatarGet[1]]);
    if (!target) return send(res, 404, { error: 'Avatar não encontrado.' });
    if (!assertWorkspace(user, target.workspace_id) && user.id !== target.id) return send(res, 403, { error: 'Sem acesso ao avatar.' });
    const dir = path.join(config.uploadsDir, 'avatars');
    const candidates = ['.png', '.jpg', '.webp'].map(ext => path.join(dir, `${target.id}${ext}`));
    const filePath = candidates.find(f => fs.existsSync(f));
    if (!filePath) return send(res, 404, { error: 'Avatar ainda não enviado.' });
    const ext = path.extname(filePath);
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const buffer = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': buffer.length,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders()
    });
    return res.end(buffer);
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

  if (pathname === '/api/settings' && req.method === 'PUT') {
    const user = requireAdmin(req, res); if (!user) return;
    const body = await readBody(req);
    run('UPDATE workspaces SET brand_name=?, primary_color=?, secondary_color=?, whatsapp=? WHERE id=?', [sanitizeText(body.brandName, 160), sanitizeText(body.primaryColor, 20), sanitizeText(body.secondaryColor, 20), sanitizeText(body.whatsapp, 30), user.workspaceId]);
    audit(user, 'workspace_settings_updated', 'workspace', user.workspaceId, 'Configurações do site atualizadas.');
    return send(res, 200, { ok: true, bootstrap: bootstrap(user) });
  }

  if (pathname === '/api/dev/reset-demo' && req.method === 'POST') {
    const user = requireSuper(req, res); if (!user) return;
    return send(res, 200, { message: 'Use npm run reset:db e reinicie o servidor para recriar o seed demo.' });
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
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    return serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || 500;
    console.error(error);
    return send(res, status, { error: status === 500 ? 'Erro interno tratado com segurança.' : error.message });
  }
});

server.listen(config.port, () => {
  console.log(`FitPro API rodando em http://localhost:${config.port}`);
});
