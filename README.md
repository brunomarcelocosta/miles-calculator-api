# API da calculadora Travion

A API é a fonte do catálogo, das regras de cálculo e dos destinos para o site e o app Flutter.

## Fluxo público

1. `GET /api/calculator/quiz`: retorna `version` e as nove `questions`, com opções e identificadores.
2. `POST /api/leads`: recebe contato, consentimento, tracking e `submissionId` (UUID criado pelo cliente). Retorna `{ id }`.
3. `PATCH /api/leads/:id/step`: recebe `{ step: questionId, answer: optionId }`. Valida a opção antes de salvar.
4. `POST /api/leads/:id/complete`: valida as nove respostas salvas, calcula e persiste a faixa e os destinos. Retorna `{ estimate, recommendations, travelStyle }`.

Reenvie o mesmo `submissionId` após falha de conexão. A API devolve o lead existente quando email e telefone correspondem. “Refazer” deve criar outro UUID. Clientes sem `submissionId` mantêm a proteção antiga contra email repetido por cinco minutos.

O app envia `utmSource=travion_app` e `utmMedium=app`. Esses leads usam a mesma tabela e o portal em portal.travion.com.br, sem criar contas de cliente. Não há chave de serviço nas chamadas públicas.

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

## Diagnóstico v2

Novos leads usam `quizVersion: 2` e `preferredChannel: whatsapp | email`, com nome e o canal selecionado. A versão é fixada no lead; payloads sem versão mantêm o contrato v1. `GET /api/calculator/quiz?version=2` publica o catálogo. `PATCH /api/leads/:id/step` aceita `{quizVersion:2,step,answer}` com respostas agrupadas ou escalares. A conclusão devolve indicadores, conclusão, segmento e resumo, sem estimativa de milhas.

O catálogo canônico é `src/domain/diagnostic/catalog.json`. Execute `npm run catalog:sync` no workspace com os três repositórios para atualizar as cópias da calculadora e portal; `catalog:check` verifica equivalência.

Na inicialização, a migração aditiva `migrate-diagnostic.ts` adiciona as colunas v2 sob trava MySQL. Não remove dados; leads antigos recebem versão 1. Campos de contato ausentes usam NULL. Sessões v1 continuam suportadas.

O painel e a autenticação administrativa antigos foram removidos. `/api/integration/leads` continua protegido pela chave privada do portal, incluindo filtros `segment=educate|activate|optimize` e `completion=complete|incomplete`. A tabela histórica AdminUser fica preservada, sem endpoints de acesso.
