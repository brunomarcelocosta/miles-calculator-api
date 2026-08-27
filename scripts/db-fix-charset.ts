/**
 * Corrige o charset default do schema para utf8mb4 (Task 1).
 *
 * O preflight encontrou o schema `travion` em latin1. Tabelas criadas pela
 * migration do Prisma herdam o default do schema, e latin1 grava errado
 * qualquer nome com acento — que e a regra, nao a excecao, num formulario
 * brasileiro.
 *
 * O script e idempotente e conservador:
 *   - nao faz nada se o schema ja estiver em utf8mb4;
 *   - recusa converter tabelas existentes sem --convert-tables explicito,
 *     porque ALTER TABLE ... CONVERT reescreve dados e trava a tabela.
 *
 * Uso: npm run db:fix-charset
 */
import { createConnection, type Connection } from 'mysql2/promise';
import { config as loadEnv } from 'dotenv';

loadEnv();

const TARGET_CHARSET = 'utf8mb4';
const TARGET_COLLATION = 'utf8mb4_unicode_ci';

interface Target {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  allowInvalidCert: boolean;
}

function parseTarget(raw: string | undefined): Target {
  if (!raw) throw new Error('DATABASE_URL nao esta definida.');
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new Error('A DATABASE_URL nao informa o schema.');
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    allowInvalidCert: url.searchParams.get('sslaccept') !== 'strict',
  };
}

async function connect(target: Target): Promise<Connection> {
  return createConnection({
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: target.database,
    connectTimeout: 15_000,
    ssl: { rejectUnauthorized: !target.allowInvalidCert },
  });
}

/**
 * O nome do schema nao pode ser parametrizado num ALTER DATABASE, então ele e
 * validado contra a lista real de schemas antes de entrar na query. Isso evita
 * interpolar texto arbitrario em SQL.
 */
async function assertKnownSchema(connection: Connection, database: string): Promise<void> {
  const [rows] = await connection.query(
    'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
    [database],
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`O schema "${database}" nao existe neste servidor.`);
  }
  if (!/^[A-Za-z0-9_$]+$/.test(database)) {
    throw new Error(`O nome do schema "${database}" tem caractere inesperado; abortando por seguranca.`);
  }
}

async function main(): Promise<void> {
  const convertTables = process.argv.includes('--convert-tables');
  const target = parseTarget(process.env.DATABASE_URL);
  const connection = await connect(target);

  try {
    await assertKnownSchema(connection, target.database);

    const [beforeRows] = await connection.query(
      'SELECT @@character_set_database AS charset, @@collation_database AS collation',
    );
    const before = (Array.isArray(beforeRows) ? beforeRows[0] : {}) as Record<string, string>;

    console.log(`\nSchema "${target.database}"`);
    console.log(`  antes: ${before.charset} / ${before.collation}`);

    if (before.charset === TARGET_CHARSET) {
      console.log(`  ja esta em ${TARGET_CHARSET}, nada a fazer.\n`);
      return;
    }

    const [tableRows] = await connection.query(
      'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
    );
    const tables = (tableRows as Array<{ name: string }>).map((row) => row.name);

    if (tables.length > 0 && !convertTables) {
      console.log(
        `\n  O schema tem ${tables.length} tabela(s): ${tables.join(', ')}.\n` +
          '  ALTER DATABASE troca apenas o default e nao converte essas tabelas.\n' +
          '  Para converter tambem os dados existentes, rode com --convert-tables\n' +
          '  (reescreve as tabelas e as trava durante a operacao).\n',
      );
    }

    await connection.query(
      `ALTER DATABASE \`${target.database}\` CHARACTER SET ${TARGET_CHARSET} COLLATE ${TARGET_COLLATION}`,
    );

    if (tables.length > 0 && convertTables) {
      for (const table of tables) {
        if (!/^[A-Za-z0-9_$]+$/.test(table)) {
          console.log(`  ignorando tabela com nome inesperado: ${table}`);
          continue;
        }
        console.log(`  convertendo tabela ${table}...`);
        await connection.query(
          `ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET ${TARGET_CHARSET} COLLATE ${TARGET_COLLATION}`,
        );
      }
    }

    // Reconecta: as variaveis de sessao guardam o charset lido na conexao.
    await connection.end();
    const verify = await connect(target);
    try {
      const [afterRows] = await verify.query(
        'SELECT @@character_set_database AS charset, @@collation_database AS collation',
      );
      const after = (Array.isArray(afterRows) ? afterRows[0] : {}) as Record<string, string>;
      console.log(`  depois: ${after.charset} / ${after.collation}`);
      if (after.charset !== TARGET_CHARSET) {
        console.log('\n  O ALTER rodou mas o default nao mudou. Verifique privilegios no painel.\n');
        process.exitCode = 1;
        return;
      }
      console.log('  OK: a migration inicial ja nasce em utf8mb4.\n');
    } finally {
      await verify.end();
    }
    return;
  } finally {
    // O `end()` no caminho de sucesso ja ocorreu; ignorar erro de fechar duas vezes.
    await connection.end().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error('\n  Falha ao ajustar o charset:');
  console.error(`  ${(error as Error).message}\n`);
  process.exitCode = 1;
});
