# Integração com o Portal Travion

Configure `TRAVION_SERVICE_KEY` com 32–256 caracteres aleatórios. Compartilhe o mesmo valor exclusivamente com o backend Travion (`Calculator__ServiceKey`). Chave ausente desabilita o acesso da integração.

Os novos endpoints não alteram captura pública, sessão do administrador antigo ou banco de dados:

- `GET /api/integration/leads?page=1&pageSize=20&search=&from=&to=`
- `PATCH /api/integration/leads/:id` — dados de contato e respostas permitidas, sem mass assignment de status, consentimento ou tracking.
- `PATCH /api/integration/leads/:id/validate` — `{ "validated": true }`.
- `PATCH /api/integration/leads/bulk-validate` — até 100 UUIDs e `validated` booleano.

Autenticação: header `X-Service-Key`, comparação de hashes em tempo constante. Limite de 240 requisições por minuto no guard existente. Use HTTPS entre serviços. Não exponha essa chave no frontend, nos logs ou em arquivos versionados. Rotacione nos dois backends simultaneamente.

Validação: `npm run typecheck` e `npm test -- --runInBand`.
