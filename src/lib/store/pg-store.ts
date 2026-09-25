import postgres from "postgres";
import type { DocStore } from "./types";

/**
 * PostgreSQL store: one JSONB table keyed by (collection, id).
 * Works with any Postgres (Neon via Vercel Storage, Supabase, RDS…).
 */
export function createPgStore(url: string): DocStore {
  const sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    prepare: false, // compatible with transaction poolers (Neon/Supabase pgbouncer)
    ssl: /localhost|127\.0\.0\.1|host=\/|@\/|sslmode=disable/.test(url) ? false : "require",
    onnotice: () => undefined,
  });

  let ready: Promise<unknown> | null = null;
  const init = () =>
    (ready ??= sql`
      create table if not exists documents (
        collection text not null,
        id text not null,
        data jsonb not null,
        updated_at timestamptz not null default now(),
        primary key (collection, id)
      )`.then(() => sql`create index if not exists documents_user_idx on documents (collection, (data->>'userId'))`)
      .catch((e) => {
        ready = null;
        throw e;
      }));

  const json = (v: unknown) => sql.json(v as Parameters<typeof sql.json>[0]);

  return {
    async get(col, id) {
      await init();
      const rows = await sql`select data from documents where collection = ${col} and id = ${id}`;
      return (rows[0]?.data ?? null) as never;
    },
    async findBy(col, field, value) {
      await init();
      const rows = await sql`select data from documents where collection = ${col} and data->>${field} = ${value}`;
      return rows.map((r) => r.data) as never;
    },
    async insert(col, id, doc) {
      await init();
      const rows = await sql`
        insert into documents (collection, id, data) values (${col}, ${id}, ${json(doc)})
        on conflict do nothing returning id`;
      return rows.length > 0;
    },
    async put(col, id, doc) {
      await init();
      await sql`
        insert into documents (collection, id, data) values (${col}, ${id}, ${json(doc)})
        on conflict (collection, id) do update set data = excluded.data, updated_at = now()`;
    },
    async update(col, id, fn) {
      await init();
      return (await sql.begin(async (tx) => {
        const rows = await tx`select data from documents where collection = ${col} and id = ${id} for update`;
        if (!rows[0]) return null;
        const next = fn(rows[0].data as never);
        await tx`update documents set data = ${json(next)}, updated_at = now() where collection = ${col} and id = ${id}`;
        return next;
      })) as never;
    },
    async list(col, limit = 500) {
      await init();
      const rows = await sql`select data from documents where collection = ${col} order by updated_at desc limit ${limit}`;
      return rows.map((r) => r.data) as never;
    },
    async delete(col, id) {
      await init();
      const rows = await sql`delete from documents where collection = ${col} and id = ${id} returning id`;
      return rows.length > 0;
    },
  };
}
