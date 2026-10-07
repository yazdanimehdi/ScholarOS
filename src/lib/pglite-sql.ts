import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { Sql } from './db';

/** Tests: an in-process Postgres behind the postgres.js surface the app uses (see Sql). */
export function pgliteSql(db: PGlite | Transaction = new PGlite()): Sql {
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((out, s, i) => `${out}$${i}${s}`);
    return (await db.query(text, values)).rows;
  }) as Sql;
  // A nested begin (inside a transaction) just runs in the outer one, like a savepoint-free postgres.js tx.
  sql.begin = (fn) => ('transaction' in db ? db.transaction((tx) => fn(pgliteSql(tx))) : fn(sql));
  sql.unsafe = (query) => db.exec(query);
  return sql;
}
