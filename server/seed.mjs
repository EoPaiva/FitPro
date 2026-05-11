import fs from 'node:fs';
import path from 'node:path';
import { db, get, run, toJSON } from './db.mjs';
import { config } from './config.mjs';
import { hashPassword, id, nowISO } from './security.mjs';

const reset = process.argv.includes('--reset');
if (reset && fs.existsSync(config.dbPath)) {
  db.close();
  fs.rmSync(config.dbPath, { force: true });
  fs.rmSync(path.join(config.uploadsDir, 'proofs'), { recursive: true, force: true });
  fs.mkdirSync(path.join(config.uploadsDir, 'proofs'), { recursive: true });
  console.log('Banco e uploads removidos. Rode o servidor novamente para recriar.');
  process.exit(0);
}

export function seedIfNeeded() {
  const count = get('SELECT COUNT(*) as total FROM users')?.total ?? 0;
  if (count > 0) return;

  const now = nowISO();
  const workspaceId = 'ws_fitpro_elite';
  const adminTrainerId = 'trainer_leandro';
  const adminUserId = 'user_admin';
  const superUserId = 'user_super';
  const devUserId = 'user_dev_upaiva';
  const studentUserId = 'user_julia';
  const studentId = 'student_julia';
  const planBasic = 'plan_basic';
  const planPro = 'plan_pro';
  const planPremium = 'plan_premium';

  run('INSERT INTO workspaces (id,slug,brand_name,owner_trainer_id,plan,status,primary_color,secondary_color,whatsapp,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [workspaceId, 'leandro-personal', 'FitPro Elite • Leandro Performance', adminTrainerId, 'Elite', 'ativo', '#00e676', '#16a34a', '5535988042182', now]);

  run('INSERT INTO trainers (id,user_id,workspace_id,name,email,phone,specialty,bio,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    [adminTrainerId, adminUserId, workspaceId, 'Leandro Performance', 'leandro@fitpro.dev', '35 98804-2182', 'Hipertrofia, emagrecimento e condicionamento', 'Personal trainer focado em evolução real, check-ins, rotina e acompanhamento premium.', now]);

  const users = [
    [adminUserId, workspaceId, null, adminTrainerId, 'Leandro Personal', 'leandro@fitpro.dev', hashPassword('Leandro123'), 'admin', 0, null, 'LP', now],
    ['user_admin_demo', workspaceId, null, adminTrainerId, 'Admin FitPro', 'admin@fitpro.dev', hashPassword('123456'), 'admin', 0, null, 'AD', now],
    [superUserId, workspaceId, null, null, 'Super Admin FitPro', 'super@fitpro.dev', hashPassword('123456'), 'super_admin', 0, null, 'SA', now],
    [devUserId, workspaceId, null, null, 'uPaiva Dev', 'upaiva@dev', hashPassword('99221542Mat@'), 'dev', 0, null, 'UP', now],
    [studentUserId, workspaceId, studentId, null, 'Júlia Demo', 'aluno@fitpro.dev', hashPassword('123456'), 'student', 0, null, 'JD', now]
  ];
  for (const u of users) run('INSERT INTO users (id,workspace_id,student_id,trainer_id,name,email,password_hash,role,failed_logins,locked_until,avatar,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', u);

  const plans = [
    [planBasic, workspaceId, 'Básico', 79, 30, 'Acesso inicial com treinos, comunidade e check-ins semanais.', ['Treinos base', 'Comunidade', '1 avaliação mensal'], 'Até 1 aluno demo', 0, 1, now],
    [planPro, workspaceId, 'Pro', 149, 30, 'Acompanhamento personalizado com conteúdo, avaliações e mensagens.', ['Treino personalizado', 'Chat com personal', 'Conteúdo premium', 'Pagamentos manuais'], 'Plano recomendado', 1, 1, now],
    [planPremium, workspaceId, 'Premium', 249, 30, 'Experiência completa com relatórios, desafios, hábitos e suporte prioritário.', ['Tudo do Pro', 'Relatórios avançados', 'Desafios', 'Hábitos e suplementos'], 'Sem limite no workspace', 0, 1, now]
  ];
  for (const p of plans) run('INSERT INTO plans (id,workspace_id,name,price,duration_days,description,benefits_json,limits_text,featured,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [p[0],p[1],p[2],p[3],p[4],p[5],toJSON(p[6]),p[7],p[8],p[9],p[10]]);

  run('INSERT INTO students (id,user_id,workspace_id,trainer_id,name,email,phone,city,goal,birthdate,height,initial_weight,current_weight,level,restrictions,plan_id,status,last_activity_at,consents_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [studentId, studentUserId, workspaceId, adminTrainerId, 'Júlia Demo', 'aluno@fitpro.dev', '35 99999-0000', 'Poços de Caldas / MG', 'Ganhar massa magra e melhorar condicionamento', '2001-04-10', 1.67, 63.5, 61.8, 'intermediario', 'Sem restrições relevantes. Aviso: dados fictícios.', planPro, 'ativo', now, toJSON({ terms: true, lgpd: true, photos: true, notifications: true }), now]);

  const workoutExercises = [
    { id: id('we'), name: 'Agachamento livre', sets: '4', reps: '8-10', load: 'Progressiva', rest: '90s', note: 'Foco em amplitude e controle.', completedByStudent: false },
    { id: id('we'), name: 'Leg press', sets: '4', reps: '10-12', load: 'Moderada', rest: '75s', note: 'Evitar travar joelhos.', completedByStudent: false },
    { id: id('we'), name: 'Cadeira extensora', sets: '3', reps: '12-15', load: 'Controle total', rest: '60s', note: 'Segurar 1s no pico.', completedByStudent: false }
  ];
  run('INSERT INTO workouts (id,workspace_id,trainer_id,student_id,title,goal,level,method,estimated_minutes,intensity,status,exercises_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ['workout_pernas_julia', workspaceId, adminTrainerId, studentId, 'Treino A • Pernas Performance', 'Hipertrofia', 'Intermediário', 'Força + hipertrofia', 58, 'alto', 'ativo', toJSON(workoutExercises), now]);
  run('INSERT INTO workouts (id,workspace_id,trainer_id,student_id,title,goal,level,method,estimated_minutes,intensity,status,exercises_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ['workout_provisorio', workspaceId, adminTrainerId, studentId, 'Treino provisório • adaptação', 'Retomada', 'Iniciante', 'Circuito leve', 35, 'medio', 'provisorio', toJSON([{ id: id('we'), name: 'Mobilidade geral', sets: '2', reps: '8 min', load: 'Livre', rest: '30s', note: 'Usado até o personal liberar ficha definitiva.' }]), now]);

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const after = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  run('INSERT INTO schedules (id,workspace_id,trainer_id,student_id,title,date,time,type,status,location,online_link,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ['session_1', workspaceId, adminTrainerId, studentId, 'Aula presencial • inferiores', tomorrow, '19:00', 'presencial', 'confirmado', 'Academia Performance', '', 'Chegar 10 min antes.', now]);
  run('INSERT INTO schedules (id,workspace_id,trainer_id,student_id,title,date,time,type,status,location,online_link,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ['session_2', workspaceId, adminTrainerId, studentId, 'Check-in online', after, '08:30', 'online', 'pendente', 'Google Meet', 'https://meet.google.com/demo-fitpro', 'Revisar medidas e carga.', now]);

  for (const [i, weight, fat] of [[28, 63.5, 24.2], [18, 62.6, 23.4], [7, 61.8, 22.9]]) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    run('INSERT INTO assessments (id,workspace_id,student_id,date,weight,body_fat,lean_mass,waist,abdomen,hip,chest,right_arm,left_arm,right_thigh,left_thigh,calf,photo_name,energy,sleep,soreness,mood,notes,professional_notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id('assessment'), workspaceId, studentId, date, weight, fat, weight * (1 - fat/100), 72, 78, 96, 89, 29, 28.5, 55, 54.5, 35, null, 8, 7, 3, 'motivada', 'Dados demo de evolução.', 'Manter progressão sem dor.', now]);
  }

  const paymentId = 'pay_julia_pro';
  const svgProof = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#0b1220"/><text x="50" y="80" fill="#00e676" font-size="38" font-family="Arial">Comprovante PIX Demo</text><text x="50" y="150" fill="#fff" font-size="26" font-family="Arial">Aluno: Júlia Demo</text><text x="50" y="200" fill="#fff" font-size="26" font-family="Arial">Plano: Pro</text><text x="50" y="250" fill="#fff" font-size="26" font-family="Arial">Valor: R$ 149,00</text><text x="50" y="300" fill="#cbd5e1" font-size="22" font-family="Arial">Arquivo fictício para validação do modal de comprovantes.</text></svg>`;
  const proofPath = path.join(config.uploadsDir, 'proofs', 'pix_julia_demo.svg');
  fs.writeFileSync(proofPath, svgProof);
  run('INSERT INTO payments (id,workspace_id,student_id,plan_id,amount,due_date,status,proof_name,proof_mime_type,proof_size,proof_path,proof_uploaded_at,proof_student_note,external_link,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [paymentId, workspaceId, studentId, planPro, 149, new Date(Date.now() + 2 * 86400000).toISOString().slice(0,10), 'em_analise', 'pix_julia_demo.svg', 'image/svg+xml', Buffer.byteLength(svgProof), proofPath, now, 'Pagamento via Pix realizado às 18:42.', 'https://mpago.la/demo-fitpro', 'Aguardando validação manual do personal.', now]);
  const history = [
    ['Cobrança criada', 'Plano Pro gerado para Júlia Demo.'],
    ['Comprovante enviado', 'pix_julia_demo.svg anexado pelo aluno.']
  ];
  for (const [action, note] of history) run('INSERT INTO payment_history (id,payment_id,actor_id,action,note,created_at) VALUES (?,?,?,?,?,?)', [id('ph'), paymentId, studentUserId, action, note, now]);

  run('INSERT INTO contents (id,workspace_id,title,description,category,type,url,access_plan_ids_json,student_access_ids_json,featured,completed_by_json,views,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ['content_hiit', workspaceId, 'FitPro Academy • HIIT 20 minutos', 'Aula gravada para condicionamento e queima calórica.', 'Treino', 'video', 'https://www.youtube.com/embed/ml6cT4AZdqI', toJSON([planPro, planPremium]), toJSON([]), 1, toJSON([]), 42, now]);
  run('INSERT INTO community_posts (id,workspace_id,student_id,author,category,text,visibility,likes_json,comments_json,pinned,reported,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ['post_welcome', workspaceId, studentId, 'Leandro Performance', 'Aviso', 'Bem-vindos ao FitPro Elite. Publiquem check-ins, dúvidas e vitórias com responsabilidade.', 'publico', toJSON([]), toJSON([]), 1, 0, now]);
  run('INSERT INTO messages (id,workspace_id,student_id,sender_id,text,resolved,created_at) VALUES (?,?,?,?,?,?,?)',
    ['msg_1', workspaceId, studentId, adminUserId, 'Júlia, seu treino A está liberado. Me avise se sentir qualquer desconforto.', 0, now]);
  run('INSERT INTO leads (id,workspace_id,name,phone,email,goal,origin,status,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ['lead_demo', workspaceId, 'Camila Lead', '35 98888-1111', 'camila@email.com', 'Emagrecimento', 'Landing page', 'novo', 'Pediu aula experimental.', now]);
  run('INSERT INTO challenges (id,workspace_id,title,description,metric,target,reward,start_date,end_date,participants_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ['challenge_20', workspaceId, '20 treinos em 30 dias', 'Complete 20 check-ins de treino e ganhe badge elite.', 'treinos', 20, 'Badge Performance + certificado', new Date().toISOString().slice(0,10), new Date(Date.now()+30*86400000).toISOString().slice(0,10), toJSON([{ studentId, progress: 7, points: 420 }]), now]);
  run('INSERT INTO habits (id,workspace_id,student_id,date,water_ml,sleep_hours,steps,meals,mood,energy,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ['habit_today', workspaceId, studentId, new Date().toISOString().slice(0,10), 2100, 7.2, 8200, 4, 'boa', 8, 'Rotina dentro da meta.', now]);
  run('INSERT INTO supplements (id,workspace_id,student_id,name,objective,schedule_text,frequency,notes,validated_by_professional,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ['supp_creatina', workspaceId, studentId, 'Creatina', 'Suporte de performance', 'Após almoço', 'Diário', 'Recomendação geral. Validar com nutricionista/médico quando necessário.', 0, 1, now]);

  const integrations = [
    ['WhatsApp Link', 'conectado', { phone: '5535988042182', defaultMessage: 'Olá, quero falar sobre meu acompanhamento FitPro.' }],
    ['Mercado Pago', 'desconectado', { mode: 'sandbox pendente', safe: true }],
    ['Google Calendar', 'desconectado', { future: true }],
    ['E-mail transacional', 'desconectado', { provider: 'Resend/SendGrid futuro' }],
    ['IA', 'desconectado', { consentRequired: true }]
  ];
  for (const [key, status, cfg] of integrations) run('INSERT INTO integration_settings (id,workspace_id,key,status,public_config_json,last_test_at,created_at) VALUES (?,?,?,?,?,?,?)', [id('int'), workspaceId, key, status, toJSON(cfg), null, now]);

  const automations = [
    ['Boas-vindas', 'novo_cadastro', 'interno', 'Bem-vindo ao FitPro Elite! Complete seu onboarding.'],
    ['Cobrança antes do vencimento', 'pagamento_pendente', 'whatsapp_link', 'Olá, seu pagamento está próximo do vencimento.'],
    ['Aluno inativo 7 dias', 'aluno_inativo', 'interno', 'Sentimos sua falta. Vamos retomar a rotina?']
  ];
  for (const a of automations) run('INSERT INTO automation_rules (id,workspace_id,name,trigger_name,channel,message,active,created_at) VALUES (?,?,?,?,?,?,?,?)', [id('auto'), workspaceId, ...a, 1, now]);

  run('INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity,entity_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)', [id('log'), workspaceId, 'system', 'seed_demo_created', 'workspace', workspaceId, 'Dados fictícios criados para modo demo seguro.', now]);
  console.log('Seed FitPro criado com sucesso.');
}

if (import.meta.url === `file://${process.argv[1]}`) seedIfNeeded();
