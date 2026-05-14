import { get, all, run, json, toJSON } from './db.mjs';
import { mirrorToSupabaseOrQueue } from './sync.mjs';

function camel(row = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) out[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = value;
  return out;
}

export const databaseAdapter = {
  mode: 'supabase-primary-sqlite-fallback',

  async mirror(entity, payload, { workspaceId = payload.workspace_id || payload.workspaceId || 'ws_fitpro_elite', action = 'upsert', entityId = payload.id || payload.entity_id || '' } = {}) {
    return mirrorToSupabaseOrQueue({ workspaceId, entity, action, entityId, payload });
  },

  async createStudent(payload) {
    run(
      'INSERT INTO students (id,user_id,workspace_id,trainer_id,name,email,phone,city,state,goal,birthdate,height,initial_weight,current_weight,level,restrictions,plan_id,status,last_activity_at,consents_json,created_at,neighborhood,modality,training_place,availability,preferred_payment_day,payment_method,request_message,onboarding_stage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [payload.id, payload.user_id || null, payload.workspace_id, payload.trainer_id, payload.name, payload.email, payload.phone || '', payload.city || '', payload.state || '', payload.goal || '', payload.birthdate || '', Number(payload.height || 0), Number(payload.initial_weight || 0), Number(payload.current_weight || payload.initial_weight || 0), payload.level || 'iniciante', payload.restrictions || '', payload.plan_id || '', payload.status || 'aguardando_aprovacao', payload.last_activity_at || null, payload.consents_json || toJSON({ terms:true, lgpd:true }), payload.created_at, payload.neighborhood || '', payload.modality || '', payload.training_place || '', payload.availability || '', payload.preferred_payment_day || '', payload.payment_method || '', payload.request_message || '', payload.onboarding_stage || 'aguardando_aprovacao']
    );
    return this.mirror('students', payload, { workspaceId: payload.workspace_id, entityId: payload.id });
  },

  async updateStudentStatus({ studentId, status, reviewedBy = '', blockedReason = '', workspaceId = 'ws_fitpro_elite' }) {
    run('UPDATE students SET status=?, approved_at=?, approved_by=?, blocked_reason=?, onboarding_stage=? WHERE id=?', [status, status === 'aprovado' ? new Date().toISOString() : null, reviewedBy, blockedReason, status, studentId]);
    return this.mirror('students', { id: studentId, status, approved_at: status === 'aprovado' ? new Date().toISOString() : null, approved_by: reviewedBy, blocked_reason: blockedReason, onboarding_stage: status }, { workspaceId, entityId: studentId });
  },

  async createPayment(payload) {
    run('INSERT INTO payments (id,workspace_id,student_id,plan_id,amount,due_date,status,external_link,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [payload.id, payload.workspace_id, payload.student_id, payload.plan_id, Number(payload.amount || 0), payload.due_date, payload.status || 'pendente', payload.external_link || '', payload.note || '', payload.created_at]);
    return this.mirror('payments', payload, { workspaceId: payload.workspace_id, entityId: payload.id });
  },

  async updatePaymentProof(payment, patch) {
    run('UPDATE payments SET proof_name=?, proof_mime_type=?, proof_size=?, proof_path=?, proof_uploaded_at=?, proof_student_note=?, status=? WHERE id=?', [patch.proof_name, patch.proof_mime_type, patch.proof_size, patch.proof_path, patch.proof_uploaded_at, patch.proof_student_note, patch.status, payment.id]);
    return this.mirror('payments', { id: payment.id, ...patch }, { workspaceId: payment.workspace_id, entityId: payment.id });
  },

  async addPaymentHistory(payload) {
    run('INSERT INTO payment_history (id,payment_id,actor_id,action,note,created_at) VALUES (?,?,?,?,?,?)', [payload.id, payload.payment_id, payload.actor_id, payload.action, payload.note || '', payload.created_at]);
    return this.mirror('payment_history', payload, { workspaceId: payload.workspace_id || 'ws_fitpro_elite', entityId: payload.id });
  },

  async addAuditLog(payload) {
    run('INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity,entity_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)', [payload.id, payload.workspace_id, payload.actor_id, payload.action, payload.entity, payload.entity_id, payload.metadata || '', payload.created_at]);
    return this.mirror('audit_logs', payload, { workspaceId: payload.workspace_id, entityId: payload.id });
  },

  async addNotification(payload) {
    run('INSERT INTO notifications (id,workspace_id,user_id,title,body,created_at) VALUES (?,?,?,?,?,?)', [payload.id, payload.workspace_id, payload.user_id, payload.title, payload.body || '', payload.created_at]);
    return this.mirror('notifications', payload, { workspaceId: payload.workspace_id, entityId: payload.id });
  },

  studentsByWorkspace(workspaceId) { return all('SELECT * FROM students WHERE workspace_id=?', [workspaceId]).map(camel); },
  pendingSync() { return all('SELECT * FROM sync_queue WHERE status IN (?,?) ORDER BY created_at DESC LIMIT 100', ['pending','error']).map(camel); },
  status() { return { syncQueue: this.pendingSync() }; }
};
