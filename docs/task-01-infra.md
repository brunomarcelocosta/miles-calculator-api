# Task 1 — Preflight de infraestrutura

Executado com `npm run db:check` contra o MySQL de producao da Locaweb.
Este documento registra o que foi medido e o que cada achado decide no plano.

## O que o servidor respondeu

| Item | Valor |
| --- | --- |
| Host | `179.188.16.9:3306` |
| Usuario | `travion` |
| Schema | `travion` |
| Versao | `5.7.32-35-log` — Percona Server (GPL), Release 35 |
| Engine | MySQL (nao MariaDB) |
| Charset do schema | `latin1` na primeira leitura, corrigido para `utf8mb4` |
| Collation | `latin1_general_ci` → `utf8mb4_unicode_ci` |
| `max_allowed_packet` | 32 MB |
| Latencia (mediana de 5 round-trips) | ~179 ms |
| Coluna JSON | suportada — probe criou, gravou e leu com `JSON_EXTRACT` |
| Tabelas no schema | nenhuma |
| Grants | `USAGE ON *.*` + `ALL PRIVILEGES ON travion.*` para `'travion'@'%'` |

## Decisoes

### 1. Onde a API roda: fora da Locaweb

A porta 3306 aceita conexao da internet e as credenciais foram aceitas. Isso
libera o desenho original: **API na Railway, banco na Locaweb**. Nao ha
necessidade de mover o banco nem de hospedar a API dentro da infra da Locaweb.

DNS pretendido, a ser apontado no Task 14:

```
calculadora.travion.com.br   →   Vercel   (frontend, repo Miles-Calculator)
api.travion.com.br           →   Railway  (backend, repo Travion-API)
```

Os dois sob o mesmo dominio registravel, que e o que permite a sessao do portal
admin viver em cookie `httpOnly` com `SameSite=Lax`, sem token em `localStorage`.

### 2. TLS: `accept_invalid_certs`, nao `strict` — desvio do plano

O plano previa `sslaccept=strict`. **Nao funciona.** O servidor nao apresenta
certificado que o Node consiga validar, e a conexao estrita e recusada no
handshake. O `db-check` tenta `strict`, depois `relaxed`, depois sem TLS, e
reporta o primeiro que conecta — foi `relaxed`.

A `DATABASE_URL` ficou:

```
mysql://travion:***@179.188.16.9:3306/travion?sslaccept=accept_invalid_certs&connection_limit=5&pool_timeout=20
```

O que isso significa na pratica: o trafego **e cifrado**, mas sem validacao da
cadeia de certificados, então nao ha protecao contra man-in-the-middle. Somado a
`'travion'@'%'` (qualquer host de origem) e a ausencia de liberacao por IP no
painel, a senha e a unica barreira real do banco.

Mitigacoes pendentes, em ordem de retorno:

1. Rotacionar a senha depois do primeiro deploy. A atual circulou em chat.
2. Abrir chamado na Locaweb pedindo certificado valido ou tunel SSH.
3. Se o painel ganhar liberacao por IP, restringir aos IPs de saida da Railway.

### 3. Coluna `Json` no Prisma: mantida

Percona 5.7.32 esta acima de 5.7.8, e o probe confirmou na pratica, nao so pela
versao. Os campos `answers` e `destinations` do modelo `Lead` seguem como `Json`.
Task 9 sem ajuste.

### 4. Charset: corrigido antes da primeira migration

O schema estava em `latin1`. Tabelas criadas pela migration herdam o default do
schema, então `João`, `Conceição` e `Muñoz` seriam gravados errado — num
formulario brasileiro isso e a regra, nao a excecao.

Corrigido com `npm run db:fix-charset`, que rodou:

```sql
ALTER DATABASE `travion` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Seguro porque o schema estava vazio: o comando trocou apenas o default e nao
converteu nem reescreveu dado nenhum. O script e idempotente e se recusa a
converter tabelas existentes sem `--convert-tables` explicito.

### 5. Latencia de ~179 ms: escolher regiao no deploy

Cada round-trip ao banco custa ~179 ms daqui. A listagem paginada do admin faz
mais de uma query por request, então isso aparece direto na percepcao de uso.

Consequencias para o Task 14:

- Escolher a regiao da Railway mais proxima de Sao Paulo (`us-east` e o menor
  salto disponivel hoje; `southamerica-east` quando disponivel no plano).
- Manter `connection_limit=5` com pool reaproveitado, nunca conexao por request.
- Na listagem, resolver `total` e `items` em uma unica ida quando possivel, para
  nao pagar a latencia duas vezes.

Parte da medicao e distancia do meu ambiente local, não da Railway. O numero real
de producao deve ser remedido apos o deploy.

## Como reproduzir

```bash
npm install
cp .env.example .env    # preencher DATABASE_URL
npm run db:check        # preflight, so leitura + tabela temporaria
npm run db:fix-charset  # idempotente; nao faz nada se ja estiver utf8mb4
```

Nenhum dos scripts imprime a senha: a `DATABASE_URL` e desmontada e apenas host,
porta, usuario e schema aparecem na saida.
