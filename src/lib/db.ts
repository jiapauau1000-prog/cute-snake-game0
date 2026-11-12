import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim() ?? '';

type DbGlobal = {
  __manluPgPool?: pg.Pool;
  __manluPglite?: Promise<PGlite>;
};

const dbGlobal = globalThis as typeof globalThis & DbGlobal;

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (databaseUrl !== '') {
    dbGlobal.__manluPgPool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
    return (await dbGlobal.__manluPgPool.query(text, params)).rows as T[];
  }
  dbGlobal.__manluPglite ??= startLocal().catch((error: unknown) => {
    dbGlobal.__manluPglite = undefined;
    throw error;
  });
  return (await (await dbGlobal.__manluPglite).query<T>(text, params)).rows;
}

async function startLocal(): Promise<PGlite> {
  const db = new PGlite();
  const files = (await readdir('migrations').catch(() => []))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(await readFile(`migrations/${file}`, 'utf8'));
  }
  return db;
}
