# FitPro Elite — Sprint 23 Correções Críticas + Footer + Permissões

## 🟢 Implementado

🟢 Corrigido o fluxo de avatar para evitar `access_token` em URL de imagem.

🟢 Avatar deixou de usar `user_id` puro como `src` de `<img>` e agora normaliza valores internos para `/api/profile/avatar/:id`.

🟢 Endpoint `/api/profile/avatar/:id` ficou público para leitura de imagem segura, retorna `image/*` ou SVG fallback e não retorna JSON para `<img>`.

🟢 Upload de avatar agora salva URL estável `/api/profile/avatar/:id`, preservando storage/caminho interno no backend.

🟢 Tela de login recebeu reforço de centralização e contenção visual para reduzir desalinhamento do card e dos rastros da logo.

🟢 Footer global foi reduzido para formato compacto de duas linhas com links essenciais.

🟢 Links do footer Termos, Privacidade, LGPD, Cookies e Suporte agora abrem conteúdo real em modal premium.

🟢 Adicionado banner de cookies discreto com aceitar todos, rejeitar não necessários e personalizar.

🟢 Preferências de cookies são persistidas no `localStorage` e respeitadas após F5/reload.

🟢 Botão “Escolher plano e pagar agora” agora trata o retorno do Mercado Pago de forma clara: abre `initPoint` quando configurado ou mostra aviso elegante quando o backend ainda não tem credenciais.

🟢 Backend do checkout Mercado Pago deixa de retornar erro bruto quando não configurado e passa a retornar estado guiado seguro.

🟢 Botão “Auditar workspace” ganhou endpoint real `/api/admin/workspace-audit` exclusivo para Dev/Super Admin.

🟢 Auditoria do workspace verifica API, banco, auth, avatar/uploads, pagamentos, Mercado Pago, WhatsApp, Resend, Supabase e OpenAI sem expor secrets.

🟢 Título da aba agora é calculado dinamicamente por perfil/workspace, evitando “Leandro Performance” em qualquer conta.

🟢 Headers internos passaram a usar nome dinâmico do workspace/usuário com fallback FitPro Elite.

🟢 Agenda, Automações, Logs e Integrações foram removidos da navegação e dos dashboards de Personal e Aluno.

🟢 Agenda, Automações, Logs e Integrações permanecem no Dev/Super Admin.

🟢 Foi adicionado bloqueio por role para módulos técnicos, com tela elegante de acesso restrito.

🟢 Personal mantém foco em Pulse Coach, Coach Invisível, Solicitações, Alunos, Treinos, Pagamentos, Plano FitPro, Conteúdos, Comunidade, Mensagens, Relatórios, CRM/Leads, Sorteios, Recompensas, Perfil, WhatsApp e Assistente IA.

🟢 Aluno mantém foco em Visão Geral, Meus Treinos, Meu Personal/Mensagens, Comunidade, Desafios, Recompensas, Progresso, Perfil, WhatsApp e Assistente IA quando aplicável.

## 🟡 Parcial / em espera

🟡 Termos, Privacidade, LGPD e Cookies estão funcionais em frontend/modal; backend dedicado para requisições LGPD fica preparado para etapa futura.

🟡 O botão de pagamento Mercado Pago depende das variáveis reais no Railway/backend para abrir checkout automático.

🟡 A auditoria de workspace mostra status e alertas operacionais, mas testes mais profundos por integração podem evoluir nas próximas sprints.

🟡 A correção de avatar remove a causa provável do CORB (`user_id`/token na URL), mas precisa validação real em produção com upload, F5, logout/login e troca de conta.

🟡 Fichas inteligentes, templates semanais, wizard por etapas e autosave continuam planejados para Sprint 24.

## 🔴 Pendente

🔴 Supabase-first 100%.

🔴 Marketplace/split Mercado Pago.

🔴 Comissão automática da plataforma.

🔴 KYC/conta conectada do personal.

🔴 Multi-tenant completo.

🔴 Push notifications avançado.

🔴 Antifraude avançado.

🔴 PDF de avaliação física.

🔴 Google Calendar/Meet avançado.

🔴 Implementação completa das 14 fichas pré-montadas por dia da semana.

🔴 Wizard de ficha de treino com autosave de rascunho.

🔴 Backend dedicado para solicitações LGPD.

🔴 README novo, pois a regra atual é não criar README.

## Arquivos alterados

- `src/main.ts`
- `src/api.ts`
- `src/styles.css`
- `server/index.mjs`

## Arquivos criados

- `docs/RELATORIO_SPRINT_23_CORRECOES_CRITICAS_FOOTER_PERMISSOES.md`

## Como testar

1. Fazer login como aluno, personal, Leandro/trial e Dev/Super Admin.
2. Enviar avatar, esperar alguns segundos, pressionar F5 e fazer logout/login.
3. Confirmar que o console não mostra mais request de avatar com `access_token` na URL.
4. Confirmar que a imagem carrega via `/api/profile/avatar/:id` e não como `user_xxx` puro.
5. Clicar em “Escolher plano e pagar agora”.
6. Se Mercado Pago estiver configurado, o checkout deve abrir; se não, deve aparecer aviso claro.
7. Clicar em “Auditar workspace” no Dev/Super Admin e validar modal com checagens.
8. Verificar que aluno/personal não veem Agenda, Automações, Logs e Integrações.
9. Tentar acessar módulo técnico sem role dev/super admin e confirmar tela de acesso restrito.
10. Verificar footer compacto em login, aluno, personal, ajuda e Super Admin.
11. Clicar em Termos, Privacidade, LGPD, Cookies e Suporte.
12. Testar banner de cookies, salvar preferências e recarregar página.
13. Confirmar que a aba/janela não fica como “Leandro Performance” em contas que não sejam do Leandro.

## Testes realizados nesta entrega

- `npm run type-check`
- `node --check server/index.mjs`
- `node --check server/db.mjs`
- `node --check server/integrations.mjs`
- `node --check server/security.mjs`

## Observação de build

O build Vite deve ser executado após instalar dependências no ambiente local/produtivo:

```bash
npm install --registry https://registry.npmjs.org/
npm run build
```

Neste ambiente de geração, o binário do Vite não ficou disponível sem instalação completa de `node_modules`.
