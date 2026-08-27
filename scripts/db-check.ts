/**
 * Preflight de infraestrutura (Task 1).
 *
 * Responde, antes de existir qualquer migration, tres perguntas que mudam o
 * plano de implementacao:
 *
 *   1. O MySQL da Locaweb aceita conexao remota? (decide onde a API roda)
 *   2. A versao suporta coluna JSON nativa? (decide `Json` vs `Text` no Prisma)
 *   3. O TLS do servidor tem certificado verificavel? (decide `sslaccept` na URL)
 *
 * O script nunca imprime a senha: a URL e desmontada e apenas host, porta,
 * usuario e schema aparecem na saida.
 *
 * Uso: npm run db:check
 */
import { createConnection, type Connection } from 'mysql2/promise';
import { config as loadEnv } from 'dotenv';

// Sem __dirname: o carregador pode tratar este arquivo como ESM. Os scripts npm
// rodam com cwd na raiz do pacote, que e onde o .env vive.
loadEnv();

/** Versao minima do MySQL com suporte a coluna JSON nativa. */
const MIN_JSON_VERSION = { major: 5, minor: 7, patch: 8 } as const;

/** Acima disso, vale avisar sobre escolha de regiao no deploy da API. */
const LATENCY_WARN_MS = 80;

/** Round-trips usados para medir latencia; o primeiro e descartado. */
const LATENCY_SAMPLES = 6;

type TlsMode = 'strict' | 'relaxed' | 'disabled';

interface ConnectionTarget {
  host: string;
  port: number;
  user: string;
  database: string;
  password: string;
  /** `sslaccept` presente na query string da DATABASE_URL, se houver. */
  declaredSslAccept: string | null;
}

interface ServerFacts {
  version: string;
  versionComment: string;
  isMariaDb: boolean;
  characterSet: string;
  collation: string;
  maxAllowedPacketMb: number;
  latencyMs: number[];
  /** Tabelas ja existentes no schema. Vazio significa migration inicial sem risco. */
  existingTables: string[];
  grants: string[];
}

class PreflightError extends Error {
  constructor(
    message: string,
    readonly hint: string,
  ) {
    super(message);
    this.name = 'PreflightError';
  }
}

function parseDatabaseUrl(raw: string | undefined): ConnectionTarget {
  if (!raw) {
    throw new PreflightError(
      'DATABASE_URL nao esta definida.',
      'Copie .env.example para .env e preencha a DATABASE_URL.',
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PreflightError(
      'DATABASE_URL nao e uma URL valida.',
      'Caracteres especiais na senha precisam ser percent-encoded: @ -> %40, ! -> %21, # -> %23.',
    );
  }

  if (url.protocol !== 'mysql:') {
    throw new PreflightError(
      `Protocolo inesperado na DATABASE_URL: ${url.protocol}`,
      'A URL precisa comecar com mysql://',
    );
  }

  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new PreflightError(
      'A DATABASE_URL nao informa o schema.',
      'O schema vai depois da porta: mysql://user:pass@host:3306/NOME_DO_SCHEMA',
    );
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    database,
    password: decodeURIComponent(url.password),
    declaredSslAccept: url.searchParams.get('sslaccept'),
  };
}

function sslOptionsFor(mode: TlsMode) {
  switch (mode) {
    case 'strict':
      return { ssl: { rejectUnauthorized: true } };
    case 'relaxed':
      return { ssl: { rejectUnauthorized: false } };
    case 'disabled':
      return {};
  }
}

async function connectWith(target: ConnectionTarget, mode: TlsMode): Promise<Connection> {
  return createConnection({
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: target.database,
    connectTimeout: 15_000,
    ...sslOptionsFor(mode),
  });
}

/** Erros de TLS valem retry num modo mais permissivo; os outros nao. */
function isTlsError(error: unknown): boolean {
  const code = (error as { code?: string }).code ?? '';
  const message = (error as { message?: string }).message ?? '';
  return (
    code.startsWith('DEPTH_ZERO') ||
    code.startsWith('SELF_SIGNED') ||
    code.startsWith('UNABLE_TO_VERIFY') ||
    code.startsWith('CERT_') ||
    code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
    code === 'ERR_SSL_WRONG_VERSION_NUMBER' ||
    code === 'HANDSHAKE_NO_SSL_SUPPORT' ||
    /certificate|SSL|TLS/i.test(message)
  );
}

function describeConnectionFailure(error: unknown): PreflightError {
  const code = (error as { code?: string }).code ?? 'UNKNOWN';
  const message = (error as { message?: string }).message ?? String(error);

  const hints: Record<string, string> = {
    ETIMEDOUT:
      'Timeout de rede. A porta 3306 provavelmente esta bloqueada para origens externas. ' +
      'Task 14 muda: a API precisa rodar dentro da infra da Locaweb, ou o banco migra para o provedor da API.',
    ECONNREFUSED:
      'Conexao recusada. O servico responde no host mas nao nessa porta, ou o bind e apenas local. ' +
      'Confirme host e porta no painel da Locaweb.',
    ENOTFOUND: 'Host nao resolvido. Verifique o endereco na DATABASE_URL.',
    ER_ACCESS_DENIED_ERROR:
      'Credenciais recusadas. Isso e permissao, nao rede: a porta esta acessivel. ' +
      'No painel da Locaweb, confirme a senha e se o usuario aceita conexao do host de origem (%).',
    ER_HOST_NOT_PRIVILEGED:
      'O servidor recusou este IP de origem. O usuario existe mas esta restrito por host. ' +
      'Libere o IP de saida no painel ou use o padrao de host %.',
    ER_DBACCESS_DENIED_ERROR:
      'O usuario conecta mas nao tem permissao no schema informado. Ajuste os grants no painel.',
    ER_BAD_DB_ERROR:
      'O schema informado na DATABASE_URL nao existe no servidor. Confirme o nome exato no painel.',
    ER_NOT_SUPPORTED_AUTH_MODE:
      'Plugin de autenticacao nao suportado pelo driver. Normalmente se resolve trocando o plugin do usuario para mysql_native_password.',
  };

  return new PreflightError(
    `Falha ao conectar (${code}): ${message}`,
    hints[code] ?? 'Erro nao mapeado. A mensagem acima e o ponto de partida.',
  );
}

/**
 * Tenta strict, depois relaxed, depois sem TLS. Retorna o primeiro modo que
 * conecta, porque e exatamente esse que a DATABASE_URL do Prisma deve refletir.
 */
async function connectBestEffort(
  target: ConnectionTarget,
): Promise<{ connection: Connection; mode: TlsMode; rejected: TlsMode[] }> {
  const order: TlsMode[] = ['strict', 'relaxed', 'disabled'];
  const rejected: TlsMode[] = [];
  let lastError: unknown;

  for (const mode of order) {
    try {
      const connection = await connectWith(target, mode);
      return { connection, mode, rejected };
    } catch (error) {
      lastError = error;
      // Erro que nao e de TLS nao melhora afrouxando o TLS: aborta.
      if (!isTlsError(error)) {
        throw describeConnectionFailure(error);
      }
      rejected.push(mode);
    }
  }

  throw describeConnectionFailure(lastError);
}

async function scalar(connection: Connection, sql: string): Promise<Record<string, unknown>> {
  const [rows] = await connection.query(sql);
  const first = Array.isArray(rows) ? rows[0] : undefined;
  return (first ?? {}) as Record<string, unknown>;
}

async function collectFacts(connection: Connection): Promise<ServerFacts> {
  const versionRow = await scalar(
    connection,
    'SELECT VERSION() AS version, @@version_comment AS versionComment',
  );
  const charsetRow = await scalar(
    connection,
    'SELECT @@character_set_database AS characterSet, @@collation_database AS collation',
  );
  const packetRow = await scalar(connection, 'SELECT @@max_allowed_packet AS maxAllowedPacket');

  const latencyMs: number[] = [];
  for (let i = 0; i < LATENCY_SAMPLES; i += 1) {
    const startedAt = process.hrtime.bigint();
    await connection.query('SELECT 1');
    const elapsed = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    latencyMs.push(elapsed);
  }

  const [tableRows] = await connection.query(
    'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME',
  );
  const existingTables = (tableRows as Array<{ name: string }>).map((row) => row.name);

  // Saber se o usuario pode ALTER/CREATE decide se a migration roda direto ou
  // se algo precisa ser feito pelo painel da Locaweb.
  let grants: string[] = [];
  try {
    const [grantRows] = await connection.query('SHOW GRANTS FOR CURRENT_USER()');
    grants = (grantRows as Array<Record<string, string>>).map(
      (row) => Object.values(row)[0] ?? '',
    );
  } catch {
    grants = [];
  }

  const version = String(versionRow.version ?? 'desconhecida');
  const versionComment = String(versionRow.versionComment ?? '');

  return {
    version,
    versionComment,
    isMariaDb: /mariadb/i.test(version) || /mariadb/i.test(versionComment),
    characterSet: String(charsetRow.characterSet ?? 'desconhecido'),
    collation: String(charsetRow.collation ?? 'desconhecida'),
    maxAllowedPacketMb: Number(packetRow.maxAllowedPacket ?? 0) / (1024 * 1024),
    latencyMs,
    existingTables,
    grants,
  };
}

/** Confirma na pratica o que a versao promete: cria e descarta uma tabela temporaria com coluna JSON. */
async function probeJsonColumn(connection: Connection): Promise<{ supported: boolean; detail: string }> {
  try {
    await connection.query('CREATE TEMPORARY TABLE travion_json_probe (payload JSON NULL)');
    await connection.query(
      'INSERT INTO travion_json_probe (payload) VALUES (CAST(\'{"ok":true}\' AS JSON))',
    );
    const row = await scalar(
      connection,
      "SELECT JSON_EXTRACT(payload, '$.ok') AS ok FROM travion_json_probe LIMIT 1",
    );
    await connection.query('DROP TEMPORARY TABLE travion_json_probe');
    return {
      supported: true,
      detail: `coluna JSON criada, gravada e lida com JSON_EXTRACT (retorno: ${JSON.stringify(row.ok)})`,
    };
  } catch (error) {
    const message = (error as { message?: string }).message ?? String(error);
    return { supported: false, detail: message };
  }
}

function parseVersionNumbers(version: string): { major: number; minor: number; patch: number } | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function versionSupportsJson(version: string): boolean {
  const parsed = parseVersionNumbers(version);
  if (!parsed) return false;
  const { major, minor, patch } = parsed;
  if (major !== MIN_JSON_VERSION.major) return major > MIN_JSON_VERSION.major;
  if (minor !== MIN_JSON_VERSION.minor) return minor > MIN_JSON_VERSION.minor;
  return patch >= MIN_JSON_VERSION.patch;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  }
  return sorted[middle] ?? 0;
}

function recommendedSslAccept(mode: TlsMode): string {
  switch (mode) {
    case 'strict':
      return 'sslaccept=strict';
    case 'relaxed':
      return 'sslaccept=accept_invalid_certs';
    case 'disabled':
      return 'sem parametro de ssl (conexao em texto claro)';
  }
}

function line(label: string, value: string): string {
  return `  ${label.padEnd(22, '.')} ${value}`;
}

async function main(): Promise<void> {
  const target = parseDatabaseUrl(process.env.DATABASE_URL);

  console.log('\nPreflight do MySQL — Travion');
  console.log(line('host', `${target.host}:${target.port}`));
  console.log(line('usuario', target.user));
  console.log(line('schema', target.database));
  console.log(line('sslaccept na URL', target.declaredSslAccept ?? 'ausente'));
  console.log('');

  const { connection, mode, rejected } = await connectBestEffort(target);

  try {
    if (rejected.length > 0) {
      console.log(`  TLS: modo "${rejected.join('", "')}" recusado pelo servidor.`);
    }
    console.log(line('conexao', `OK em modo TLS "${mode}"`));

    const facts = await collectFacts(connection);
    const probe = await probeJsonColumn(connection);
    const latency = median(facts.latencyMs);

    console.log(line('versao', facts.version));
    if (facts.versionComment) {
      console.log(line('build', facts.versionComment));
    }
    console.log(line('engine', facts.isMariaDb ? 'MariaDB' : 'MySQL'));
    console.log(line('charset do schema', facts.characterSet));
    console.log(line('collation', facts.collation));
    console.log(line('max_allowed_packet', `${facts.maxAllowedPacketMb.toFixed(1)} MB`));
    console.log(line('latencia (mediana)', `${latency.toFixed(1)} ms`));
    console.log(line('coluna JSON', probe.supported ? 'suportada' : 'NAO suportada'));
    console.log(`      ${probe.detail}`);
    console.log(
      line(
        'tabelas no schema',
        facts.existingTables.length === 0
          ? 'nenhuma (schema vazio)'
          : `${facts.existingTables.length}: ${facts.existingTables.join(', ')}`,
      ),
    );
    for (const grant of facts.grants) {
      console.log(`      grant: ${grant}`);
    }

    console.log('\nConsequencias para o plano\n');

    // Onde a API roda.
    console.log(
      '  Hosting: conexao remota liberada, então a API pode rodar fora da Locaweb\n' +
        '  (Railway/Render) apontando para este banco. Task 14 segue como planejado.',
    );

    // sslaccept na DATABASE_URL do Prisma.
    const recommended = recommendedSslAccept(mode);
    if (target.declaredSslAccept && recommended.includes(target.declaredSslAccept)) {
      console.log(`\n  TLS: a URL ja esta correta (${recommended}).`);
    } else {
      console.log(
        `\n  TLS: ajuste a DATABASE_URL para ${recommended}.\n` +
          `  O modo declarado na URL era "${target.declaredSslAccept ?? 'ausente'}".`,
      );
    }
    if (mode === 'disabled') {
      console.log(
        '  ATENCAO: o servidor nao negociou TLS. Com a porta 3306 exposta na internet,\n' +
          '  credenciais e dados de lead trafegam em claro. Vale abrir chamado na Locaweb\n' +
          '  pedindo TLS, ou tunel SSH, antes de subir dados reais.',
      );
    }

    // Json vs Text no Prisma.
    const versionOk = versionSupportsJson(facts.version);
    if (probe.supported && versionOk && !facts.isMariaDb) {
      console.log(
        '\n  Prisma: `answers` e `destinations` podem usar o tipo `Json`. Task 9 sem ajuste.',
      );
    } else if (probe.supported && facts.isMariaDb) {
      console.log(
        '\n  Prisma: o servidor e MariaDB, onde JSON e apelido de LONGTEXT com CHECK.\n' +
          '  O tipo `Json` do Prisma funciona para gravar e ler, mas nao ha busca indexada\n' +
          '  por caminho dentro do JSON. Suficiente para `answers` e `destinations`.',
      );
    } else {
      console.log(
        '\n  Prisma: sem coluna JSON. Troque `answers` e `destinations` para `String @db.Text`\n' +
          '  e serialize no leads.repository.ts. Ajuste pequeno, restrito ao Task 9.',
      );
    }

    // Charset.
    if (!/utf8mb4/i.test(facts.characterSet)) {
      const canAlter = facts.grants.some((grant) => /\ball privileges\b|\balter\b/i.test(grant));
      console.log(
        `\n  Charset: o schema esta em ${facts.characterSet}, nao utf8mb4. Tabelas criadas pela\n` +
          '  migration herdam esse default, e nome brasileiro com acento (Joao Conceicao)\n' +
          '  seria gravado errado. Corrija antes da primeira migration:\n' +
          `  ALTER DATABASE \`${target.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
      );
      console.log(
        facts.existingTables.length === 0
          ? '  O schema esta vazio, então esse ALTER so troca o default e nao converte dado nenhum.'
          : `  Ha ${facts.existingTables.length} tabela(s) no schema: o ALTER DATABASE nao as converte,\n` +
            '  cada uma precisaria de ALTER TABLE ... CONVERT TO CHARACTER SET utf8mb4.',
      );
      console.log(
        canAlter
          ? '  O usuario tem privilegio para rodar esse ALTER.'
          : '  O usuario aparenta nao ter privilegio de ALTER: rode pelo painel da Locaweb.',
      );
    }

    // Latencia.
    if (latency > LATENCY_WARN_MS) {
      console.log(
        `\n  Latencia: ${latency.toFixed(0)} ms por round-trip. A listagem do admin paga isso\n` +
          '  varias vezes por request. Escolha a regiao do provedor da API mais proxima\n' +
          '  de Sao Paulo no Task 14.',
      );
    }

    console.log('');
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  if (error instanceof PreflightError) {
    console.error(`\n  ${error.message}\n`);
    console.error(`  ${error.hint}\n`);
  } else {
    console.error('\n  Falha inesperada no preflight:\n');
    console.error(error);
    console.error('');
  }
  process.exitCode = 1;
});
