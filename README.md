# API da calculadora Travion

A API é a fonte do catálogo, das regras de cálculo e dos destinos para o site e o app Flutter.

## Fluxo público

1. `GET /api/calculator/quiz`: retorna `version` e as nove `questions`, com opções e identificadores.
2. `POST /api/leads`: recebe contato, consentimento, tracking e `submissionId` (UUID criado pelo cliente). Retorna `{ id }`.
3. `PATCH /api/leads/:id/step`: recebe `{ step: questionId, answer: optionId }`. Valida a opção antes de salvar.
4. `POST /api/leads/:id/complete`: valida as nove respostas salvas, calcula e persiste a faixa e os destinos. Retorna `{ estimate, recommendations, travelStyle }`.

Reenvie o mesmo `submissionId` após falha de conexão. A API devolve o lead existente quando email e telefone correspondem. “Refazer” deve criar outro UUID. Clientes sem `submissionId` mantêm a proteção antiga contra email repetido por cinco minutos.

O app envia `utmSource=travion_app` e `utmMedium=app`. Esses leads usam a mesma tabela e o mesmo painel administrativo do site, sem criar contas de cliente. Não há chave de serviço nas chamadas públicas.

O site envia telefones de qualquer país em formato E.164 (por exemplo, `+14165550123` ou `+5512997643952`). A API valida o código do país e o número completo. Números brasileiros nacionais de 10 ou 11 dígitos continuam aceitos para compatibilidade com versões existentes do app. A coluna atual comporta o formato internacional, sem migração. Publique a API antes do frontend que envia o novo formato.

## Verificação

```sh
npm ci
npm run typecheck
npm test -- --runInBand
npm run build
```

## Publicação

Publique esta API e a nova versão do site na mesma janela, antes de distribuir o app. Configure a API pública em HTTPS e o `CORS_ORIGIN` para a origem do site. No Flutter, configure `CALCULATOR_API_URL`, `CALCULATOR_WEB_URL` e `CALCULATOR_WHATSAPP` conforme o README do app.

Esta alteração usa o ID UUID e as colunas existentes de Lead; não exige migração de estrutura do banco. Valide em homologação o fluxo até o painel de leads e a abertura de WhatsApp em Android e iOS antes da publicação.
