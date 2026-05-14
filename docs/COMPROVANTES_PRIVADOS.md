# Comprovantes privados

## Problema corrigido

Antes, o comprovante aparecia apenas como texto na tabela. Agora, quando existe arquivo enviado, ele é clicável e abre um modal de análise.

## Fluxo implementado

1. Aluno envia imagem/PDF do comprovante.
2. Backend valida MIME type e tamanho.
3. Arquivo é gravado fora da pasta pública.
4. Pagamento muda para `em_analise`.
5. Personal/admin abre o modal de comprovante.
6. Sistema registra visualização no histórico e no audit log.
7. Personal pode aprovar, reprovar, baixar ou abrir em nova aba.
8. Aluno recebe notificação interna.

## Endpoints

```text
POST /api/payments/:id/proof
GET  /api/payments/:id/proof
GET  /api/payments/:id/proof?download=1
POST /api/payments/:id/approve
POST /api/payments/:id/reject
GET  /api/payments/:id/history
```

## Permissões

- `student`: próprio pagamento.
- `admin`: pagamentos do workspace.
- `super_admin` e `dev`: suporte/auditoria.

## Próxima evolução

Em produção, trocar armazenamento local por Supabase Storage, S3 ou Cloudinary com signed URLs curtas e política de acesso por workspace/aluno.
