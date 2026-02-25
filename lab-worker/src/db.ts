import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import type { Database, Env } from './types';

export function createDb(env: Env): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new D1Dialect({ database: env.DB }) as any,
  });
}
