// TODO: Migrate from pure SQL to kysely.

// import { Kysely, sql, Transaction, PostgresDialect } from 'kysely';
// import { Pool } from 'pg';
// import { DB } from '../types/database/database-gen';

// db client

// const dialect = new PostgresDialect({
//   pool: new Pool({
//     connectionString: process.env.DATABASE_URL,
//     ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
//     max: 10,
//   }),
// });

// export const db = new Kysely<DB>({
//   dialect,
// });

// Helper

// interface RlsUser {
//   sub: string;
//   role: string;
//   [key: string]: unknown;
// }

// export async function withUserContext<T>(
//   db: Kysely<DB>,
//   user: RlsUser,
//   callback: (trx: Transaction<DB>) => Promise<T>
// ): Promise<T> {
//   return await db.transaction().execute(async (trx) => {
//     await sql`
//       SELECT
//         set_config('role', ${user.role}, true),
//         set_config('request.jwt.claims', ${JSON.stringify(user)}, true)
//     `.execute(trx);

//     return await callback(trx);
//   });
// }

// Plugin
// import fp from 'fastify-plugin';
// import { Kysely } from 'kysely';
// import { db } from '../lib/db';
// import { DB } from '../types/database/database-gen';

// declare module 'fastify' {
//   interface FastifyInstance {
//     db: Kysely<DB>;
//   }
// }
