# FitPro Elite — Relatório das implementações que estavam em espera

## Implementado
- Endpoints server-side para Mercado Pago Preference e webhook básico.
- Endpoints server-side para WhatsApp Business envio de texto e webhook existente.
- Endpoint server-side para Resend/e-mail transacional.
- Endpoint server-side de IA com OpenAI e fallback seguro quando não houver chave.
- Endpoint de Google Calendar auth-url preparado, sem concluir fluxo OAuth por depender de credenciais Google.
- Storage híbrido de comprovantes: local protegido e Supabase Storage privado quando buckets estiverem configurados.
- Tabelas SQLite para recompensas, resgates, sorteios, entradas, check-ins de desafio, logs de integração e logs de IA.
- Seed com recompensas, sorteio global e logs de integração.
- Loja de recompensas usando dados do backend e resgate pelo aluno.
- Conteúdo concluído pode ser marcado por endpoint, mantendo botão Rever acessível.
- Status de integrações sem expor secrets.

## Implementado parcialmente
- Supabase/PostgreSQL: adaptador e SQL existem; migração total do SQLite ainda não foi ativada.
- Supabase Storage: upload de comprovantes usa bucket se SUPABASE_STORAGE_BUCKET_PROOFS existir; avatars/fotos de evolução ainda precisam migração completa.
- Mercado Pago: preference e webhook base existem; conciliação completa por eventos e assinatura recorrente ainda ficam para fase seguinte.
- WhatsApp Business: envio server-side e webhook base existem; automações completas por gatilho ainda ficam para fase seguinte.
- Resend: endpoint de envio existe; templates transacionais completos ainda ficam para fase seguinte.
- OpenAI: assistente usa backend com fallback seguro; RAG/base de conhecimento ainda fica para fase seguinte.
- Google Calendar/Meet: auth URL preparada; fluxo OAuth/token/eventos depende das credenciais Google.

## Em espera
- Migração completa para PostgreSQL/Supabase como fonte principal.
- Assinaturas recorrentes Mercado Pago.
- Automação real de WhatsApp por gatilhos.
- Templates finais de e-mail e recuperação de senha completa.
- Push notification/PWA avançado.
- Google Calendar/Meet com criação real de eventos.

## Segurança
- Nenhuma key real foi adicionada.
- .env real não foi incluído.
- README.md continua removido conforme regra do prompt.
