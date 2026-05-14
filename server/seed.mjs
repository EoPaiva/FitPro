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
    [adminTrainerId, adminUserId, workspaceId, 'Leandro Performance', 'leandro@fitpro.local', '35 98804-2182', 'Hipertrofia, emagrecimento e condicionamento', 'Personal trainer focado em evolução real, check-ins, rotina e acompanhamento premium.', now]);

  run('UPDATE trainers SET brand_name=?, whatsapp=?, instagram=?, service_area=?, max_students=?, profile_slug=?, public_profile_enabled=1 WHERE id=?',
    ['Leandro Performance', '5535988042182', 'https://instagram.com/', 'Poços de Caldas, online e híbrido', 40, 'leandro-performance', adminTrainerId]);
  run('UPDATE workspaces SET public_slug=?, custom_domain=?, marketplace_enabled=1 WHERE id=?', ['leandro-performance', '', workspaceId]);

  const trainerPlanBasic = 'trainer_plan_leandro_basic';
  const trainerPlanPro = 'trainer_plan_leandro_pro';
  run('INSERT INTO trainer_payment_settings (id,workspace_id,trainer_id,pix_key_type,pix_key,receiver_name,bank_name,document_optional,instructions,qr_code_url,accepts_manual_payment,accepts_receipt,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ['payset_leandro', workspaceId, adminTrainerId, 'telefone', '5535988042182', 'Leandro Performance', '', '', 'Envie o Pix e anexe o comprovante. O acesso é liberado após aprovação do personal.', '', 1, 1, now, now]);
  run('INSERT INTO trainer_plans (id,workspace_id,trainer_id,name,price,billing_cycle,description,benefits_json,classes_limit,contents_included,support_included,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [trainerPlanBasic, workspaceId, adminTrainerId, 'Plano Básico do Aluno', 79, 'mensal', 'Treinos e acompanhamento inicial.', toJSON(['Treino base', 'Comunidade', 'Check-in semanal']), '1 treino ativo', 'Conteúdos essenciais', 'Chat básico', 'ativo', now, now]);
  run('INSERT INTO trainer_plans (id,workspace_id,trainer_id,name,price,billing_cycle,description,benefits_json,classes_limit,contents_included,support_included,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [trainerPlanPro, workspaceId, adminTrainerId, 'Plano Pro do Aluno', 149, 'mensal', 'Acompanhamento completo com rotina, avaliações e conteúdos.', toJSON(['Treino personalizado', 'Avaliação mensal', 'Chat com personal', 'FitPro Academy']), 'fichas personalizadas', 'Conteúdos premium', 'Chat + WhatsApp', 'ativo', now, now]);
  run('INSERT INTO platform_subscriptions (id,workspace_id,trainer_id,plan_name,amount,status,due_date,paid_at,mercado_pago_payment_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ['sub_platform_leandro', workspaceId, adminTrainerId, 'FitPro Start', 49.99, 'trial', new Date(Date.now()+7*86400000).toISOString().slice(0,10), '', '', now, now]);

  const users = [
    [adminUserId, workspaceId, null, adminTrainerId, 'Leandro Personal', 'leandro@fitpro.local', hashPassword('Leandro123'), 'trainer', 0, null, '', now],
    ['user_trainer_alias', workspaceId, null, adminTrainerId, 'Leandro Personal Alias', 'leandro@fitpro.dev', hashPassword('Leandro123'), 'trainer', 0, null, '', now],
    ['user_admin_demo', workspaceId, null, adminTrainerId, 'Admin FitPro', 'admin@fitpro.dev', hashPassword('123456'), 'admin', 0, null, 'AD', now],
    [superUserId, workspaceId, null, null, 'Super Admin FitPro', 'super@fitpro.dev', hashPassword('123456'), 'super_admin', 0, null, 'SA', now],
    [devUserId, workspaceId, null, null, 'uPaiva Dev', 'upaiva@dev', hashPassword('99221542Mat@'), 'dev', 0, null, '', now],
    [studentUserId, workspaceId, studentId, null, 'Júlia Teste', 'aluno@fitpro.dev', hashPassword('123456'), 'student', 0, null, '', now]
  ];
  for (const u of users) run('INSERT INTO users (id,workspace_id,student_id,trainer_id,name,email,password_hash,role,failed_logins,locked_until,avatar,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', u);

  const plans = [
    [planBasic, workspaceId, 'Básico', 79, 30, 'Acesso inicial com treinos, comunidade e check-ins semanais.', ['Treinos base', 'Comunidade', '1 avaliação mensal'], 'Até 1 aluno de teste local', 0, 1, now],
    [planPro, workspaceId, 'Pro', 149, 30, 'Acompanhamento personalizado com conteúdo, avaliações e mensagens.', ['Treino personalizado', 'Chat com personal', 'Conteúdo premium', 'Pagamentos manuais'], 'Plano recomendado', 1, 1, now],
    [planPremium, workspaceId, 'Premium', 249, 30, 'Experiência completa com relatórios, desafios, hábitos e suporte prioritário.', ['Tudo do Pro', 'Relatórios avançados', 'Desafios', 'Hábitos e suplementos'], 'Sem limite no workspace', 0, 1, now]
  ];
  for (const p of plans) run('INSERT INTO plans (id,workspace_id,name,price,duration_days,description,benefits_json,limits_text,featured,active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [p[0],p[1],p[2],p[3],p[4],p[5],toJSON(p[6]),p[7],p[8],p[9],p[10]]);

  run('INSERT INTO students (id,user_id,workspace_id,trainer_id,name,email,phone,city,goal,birthdate,height,initial_weight,current_weight,level,restrictions,plan_id,status,last_activity_at,consents_json,created_at,request_status,onboarding_stage,requested_trainer_id,requested_trainer_plan_id,payment_flow) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [studentId, studentUserId, workspaceId, adminTrainerId, 'Júlia Teste', 'aluno@fitpro.dev', '35 99999-0000', 'Poços de Caldas / MG', 'Ganhar massa magra e melhorar condicionamento', '2001-04-10', 1.67, 63.5, 61.8, 'intermediario', 'Sem restrições relevantes. Registro de teste local.', planPro, 'ativo', now, toJSON({ terms: true, lgpd: true, photos: true, notifications: true }), now, 'aprovado', 'acesso_liberado', adminTrainerId, trainerPlanPro, 'student_to_trainer_pix']);

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
    ['session_2', workspaceId, adminTrainerId, studentId, 'Check-in online', after, '08:30', 'online', 'pendente', 'Google Meet', 'https://meet.google.com/checkout-teste-fitpro', 'Revisar medidas e carga.', now]);

  for (const [i, weight, fat] of [[28, 63.5, 24.2], [18, 62.6, 23.4], [7, 61.8, 22.9]]) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    run('INSERT INTO assessments (id,workspace_id,student_id,date,weight,body_fat,lean_mass,waist,abdomen,hip,chest,right_arm,left_arm,right_thigh,left_thigh,calf,photo_name,energy,sleep,soreness,mood,notes,professional_notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [id('assessment'), workspaceId, studentId, date, weight, fat, weight * (1 - fat/100), 72, 78, 96, 89, 29, 28.5, 55, 54.5, 35, null, 8, 7, 3, 'motivada', 'Registro inicial de evolução.', 'Manter progressão sem dor.', now]);
  }

  const paymentId = 'pay_julia_pro';
  const svgProof = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#0b1220"/><text x="50" y="80" fill="#00e676" font-size="38" font-family="Arial">Comprovante PIX Teste</text><text x="50" y="150" fill="#fff" font-size="26" font-family="Arial">Aluno: Júlia Teste</text><text x="50" y="200" fill="#fff" font-size="26" font-family="Arial">Plano: Pro</text><text x="50" y="250" fill="#fff" font-size="26" font-family="Arial">Valor: R$ 149,00</text><text x="50" y="300" fill="#cbd5e1" font-size="22" font-family="Arial">Arquivo de teste local para validação do modal de comprovantes.</text></svg>`;
  const proofPath = path.join(config.uploadsDir, 'proofs', 'pix_julia_teste.svg');
  fs.writeFileSync(proofPath, svgProof);
  run('INSERT INTO payments (id,workspace_id,student_id,plan_id,amount,due_date,status,proof_name,proof_mime_type,proof_size,proof_path,proof_uploaded_at,proof_student_note,external_link,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [paymentId, workspaceId, studentId, planPro, 149, new Date(Date.now() + 2 * 86400000).toISOString().slice(0,10), 'em_analise', 'pix_julia_teste.svg', 'image/svg+xml', Buffer.byteLength(svgProof), proofPath, now, 'Pagamento via Pix realizado às 18:42.', 'https://mpago.la/checkout-teste-fitpro', 'Aguardando validação manual do personal.', now]);
  run('INSERT INTO student_payments (id,workspace_id,student_id,trainer_id,trainer_plan_id,amount,due_date,status,receipt_url,receipt_file_name,payment_method,reviewed_by,reviewed_at,rejection_reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    ['student_pay_julia_pro', workspaceId, studentId, adminTrainerId, trainerPlanPro, 149, new Date(Date.now() + 2 * 86400000).toISOString().slice(0,10), 'em_analise', '/api/payments/pay_julia_pro/proof', 'pix_julia_teste.svg', 'pix_manual', '', '', '', now, now]);

  const history = [
    ['Cobrança criada', 'Plano Pro gerado para Júlia Teste.'],
    ['Comprovante enviado', 'pix_julia_teste.svg anexado pelo aluno.']
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


  const rewards = [
    ['reward_avaliacao_bonus', workspaceId, 'Avaliação bônus', 'Resgate uma avaliação física extra com o personal.', 800, 'servico', 1, 30, now],
    ['reward_live_exclusiva', workspaceId, 'Live exclusiva', 'Acesso a uma live fechada de técnica e dúvidas.', 600, 'conteudo', 1, 100, now],
    ['reward_ebook', workspaceId, 'E-book FitPro', 'Material digital premium liberado pelo personal.', 350, 'digital', 1, 200, now],
    ['reward_desconto', workspaceId, 'Desconto no próximo mês', 'Cupom interno sujeito à aprovação do personal.', 1200, 'desconto', 1, 20, now]
  ];
  for (const r of rewards) run('INSERT INTO reward_items (id,workspace_id,title,description,points,type,active,stock,created_at) VALUES (?,?,?,?,?,?,?,?,?)', r);

  run('INSERT INTO giveaways (id,workspace_id,title,prize,description,scope,status,starts_at,ends_at,winners_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ['giveaway_global_30d', workspaceId, 'Sorteio Performance 30D', 'Aula bônus + kit digital', 'Sorteio auditável para alunos ativos, com chances extras por engajamento validado.', 'global', 'ativo', new Date().toISOString().slice(0,10), new Date(Date.now()+30*86400000).toISOString().slice(0,10), toJSON([]), now]);
  run('INSERT INTO giveaway_entries (id,workspace_id,giveaway_id,student_id,chances,reason,created_at) VALUES (?,?,?,?,?,?,?)',
    ['entry_julia_30d', workspaceId, 'giveaway_global_30d', studentId, 4, 'Treino concluído, pagamento em dia e avaliação registrada.', now]);
  run('INSERT INTO integration_logs (id,workspace_id,integration,action,status,related_id,message,created_at) VALUES (?,?,?,?,?,?,?,?)',
    [id('ilog'), workspaceId, 'system', 'seed_integrations_ready', 'ok', workspaceId, 'Integrações preparadas por env, sem expor secrets.', now]);


  run('INSERT INTO tenant_branding (id,workspace_id,public_slug,headline,public_description,primary_color,accent_color,whatsapp_cta,active,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    ['brand_leandro', workspaceId, 'leandro-performance', 'Acompanhamento premium para evolução real', 'Treinos, avaliações, hábitos e suporte com o personal Leandro Performance.', '#00e676', '#16a34a', 'Quero iniciar meu acompanhamento FitPro', 1, now, now]);
  run('INSERT INTO referral_codes (id,workspace_id,trainer_id,student_id,code,reward_points,discount_percent,max_uses,uses,active,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ['ref_julia_fitpro', workspaceId, adminTrainerId, studentId, 'JULIAFIT', 150, 5, 30, 0, 1, new Date(Date.now()+90*86400000).toISOString(), now]);
  run('INSERT INTO coupons (id,workspace_id,code,description,discount_type,discount_value,min_amount,max_uses,uses,active,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ['coupon_boasvindas', workspaceId, 'FITPRO10', 'Cupom de boas-vindas controlado pelo personal.', 'percent', 10, 79, 50, 0, 1, new Date(Date.now()+45*86400000).toISOString(), now]);
  run('INSERT INTO device_connections (id,workspace_id,student_id,provider,status,last_sync_at,metrics_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    ['device_julia_manual', workspaceId, studentId, 'manual_fitpro', 'connected', now, toJSON({ steps: 8200, activeMinutes: 42, sleepHours: 7.2 }), now, now]);
  run('INSERT INTO health_metrics (id,workspace_id,student_id,source,metric_date,steps,calories,active_minutes,sleep_hours,heart_rate_avg,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ['metric_julia_today', workspaceId, studentId, 'manual_fitpro', new Date().toISOString().slice(0,10), 8200, 520, 42, 7.2, 78, toJSON({ note: 'Métrica manual preparada para integração futura com wearables.' }), now]);

  run('INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity,entity_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)', [id('log'), workspaceId, 'system', 'seed_demo_created', 'workspace', workspaceId, 'Dados de teste local criados para desenvolvimento controlado.', now]);
  console.log('Seed FitPro criado com sucesso.');
}

if (import.meta.url === `file://${process.argv[1]}`) seedIfNeeded();
