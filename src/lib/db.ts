import postgres from 'postgres';

/** The slice of postgres.js the app uses: tagged-template queries, transactions, raw multi-statement SQL. */
export interface Sql {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are typed per query
  <T = any>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  begin<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  unsafe(query: string): Promise<unknown>;
}

let pool: Sql | null = null;
let testSql: Sql | null = null;

/** Tests swap the connection; production code never calls this. */
export function setSqlForTests(sql: Sql | null): void {
  testSql = sql;
}

/** One small pool per function instance, created on first use (the build never connects). */
export function getSql(): Sql {
  if (testSql) return testSql;
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  // prepare: false — poolers in transaction mode (Neon, PgBouncer) can't keep prepared statements.
  return (pool ??= postgres(process.env.DATABASE_URL, {
    max: 5,
    idle_timeout: 20,
    prepare: false,
  }) as unknown as Sql);
}

const UNREACHABLE = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNRESET',
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  '57P01', // admin shutdown
  '57P03', // cannot connect now
  '53300', // too many connections
]);

/** True for "the database can't be reached right now", as opposed to a bad query. */
export function isUnreachable(e: unknown): boolean {
  return typeof e === 'object' && e !== null && UNREACHABLE.has(String((e as { code?: unknown }).code));
}
