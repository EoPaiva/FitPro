# FitPro Elite Fullstack

Base fullstack real da Fase 1 do FitPro Elite: plataforma premium para personal trainers, alunos e gestão fitness.

Esta versão substitui a demo apenas em `localStorage` por uma base com:

- Frontend em Vite + TypeScript.
- Backend HTTP em Node.js.
- Banco SQLite local usando `node:sqlite`.
- Autenticação com senha hash PBKDF2.
- Token assinado estilo JWT com expiração.
- Cookie HttpOnly + Bearer token no frontend.
- Controle de permissões por role: `student`, `admin`, `super_admin`, `dev`.
- Isolamento por workspace.
- Pagamentos manuais com comprovantes privados.
- Preview de imagem/PDF, abrir em nova aba e baixar comprovante.
- Aprovação/reprovação com histórico e logs.
- Notificações internas.
- CRUDs base para alunos, treinos, agenda, avaliações, pagamentos, posts e mensagens.
- CRM/leads, integrações, automações e relatórios em base preparada.

## Requisitos

Use Node.js 22.5+ porque o projeto usa `node:sqlite`.

```bash
node -v
```

## Instalação

```bash
npm install
cp .env.example .env
npm run dev
```

Acesse:

```text
http://localhost:5173
```

A API roda em:

```text
http://localhost:3333
```

## Contas demo

```text
Aluno:
aluno@fitpro.dev / 123456

Personal/Admin:
leandro@fitpro.dev / Leandro123
admin@fitpro.dev / 123456

Dev:
upaiva@dev / *********@

Super Admin:
super@fitpro.dev / 123456
```

## Comprovantes privados

O fluxo correto está implementado:

Personal acessa Pagamentos
→ vê pagamento pendente/em análise
→ clica em Ver comprovante
→ abre modal com preview
→ pode abrir em nova aba ou baixar
→ aprova ou reprova
→ sistema atualiza status
→ aluno recebe notificação
→ histórico e log são gravados

A rota protegida é:

```text
GET /api/payments/:id/proof
GET /api/payments/:id/proof?download=1
```

Regras aplicadas:

- Aluno só acessa comprovante do próprio pagamento.
- Personal/admin só acessa comprovantes do seu workspace.
- Dev/super admin pode acessar para suporte/auditoria.
- Arquivo fica em `uploads/private/proofs`, fora de `public`.
- Toda visualização, download, aprovação e reprovação gera histórico/log.

## Scripts

```bash
npm run dev          # API + Vite
npm run server       # apenas API
npm run client       # apenas frontend
npm run type-check   # valida TypeScript frontend
npm run build        # type-check + build Vite
npm run start        # serve API e dist após build
npm run reset:db     # remove banco e uploads; seed recria no próximo start
```

## Estrutura

```text
server/
  config.mjs      # env e caminhos seguros
  db.mjs          # schema SQLite
  index.mjs       # API, auth, permissões e rotas
  security.mjs    # hash, token, sanitização e nomes seguros
  seed.mjs        # dados fictícios
src/
  api.ts          # cliente HTTP tipado
  main.ts         # interface da plataforma
  styles.css      # design system dark fitness
uploads/private/  # arquivos privados locais
public/           # manifest e favicon
```

## O que já é real nesta versão

- API funcionando.
- Banco persistente local.
- Auth com hash e token.
- Bloqueio por tentativas de login.
- Rotas protegidas.
- Permissões por role.
- Upload privado de comprovante.
- Histórico financeiro.
- Logs de auditoria.
- Notificações internas.
- Dados demo fictícios.

## O que ainda é próxima fase para produção total

- Trocar SQLite local por PostgreSQL/Supabase em produção.
- Usar storage privado profissional: Supabase Storage, S3 ou Cloudinary assinado.
- Implementar Mercado Pago Sandbox + webhooks reais.
- Integrar e-mail transacional.
- Integrar Google Calendar/Meet.
- Implementar WhatsApp Business API oficial.
- Ampliar CRUDs para edição/exclusão completa em todos os módulos.
- Criar testes automatizados E2E.
- Implementar assinatura recorrente, cupons, contratos e assinatura digital.

## Segurança

Esta versão é uma base real de desenvolvimento, mas ainda não deve receber dados reais de saúde/pagamento sem configurar produção corretamente.

Antes de produção:

- Troque `JWT_SECRET`.
- Configure HTTPS.
- Use banco gerenciado.
- Use storage privado real.
- Configure backups.
- Configure logs de erro e monitoramento.
- Revise CORS e domínio.
- Rode testes de permissão aluno/admin/dev.

## Solução de problema no Windows: `spawn EINVAL`

Se `npm run dev` falhar no Windows com `Error: spawn EINVAL`, rode em dois terminais separados:

Terminal 1:

```bash
npm run dev:api
```

Terminal 2:

```bash
npm run dev:client
```

Acesse `http://localhost:5173`. A API roda em `http://localhost:3333`.

Recomendação: use uma versão LTS do Node.js, como Node 22 ou Node 24. O Node 26 pode apresentar incompatibilidades com scripts de desenvolvimento em alguns ambientes Windows.
