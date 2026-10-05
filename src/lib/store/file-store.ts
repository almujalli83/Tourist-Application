import { promises as fs } from "node:fs";
import path from "node:path";
import type { Collection, DocStore } from "./types";

type Data = Partial<Record<Collection, Record<string, unknown>>>;

/**
 * JSON-file store for local development (single process). The parsed file is kept in memory and
 * read again only when the file changed on disk (another process or a script edited it), so a
 * job touching many documents doesn't parse the whole file for each of them.
 */
export function createFileStore(file: string): DocStore {
  let queue: Promise<unknown> = Promise.resolve();
  let cache: { data: Data; mtimeMs: number; size: number } | null = null;

  async function load(): Promise<Data> {
    try {
      const st = await fs.stat(file);
      if (cache && cache.mtimeMs === st.mtimeMs && cache.size === st.size) return cache.data;
      const data = JSON.parse(await fs.readFile(file, "utf8")) as Data;
      cache = { data, mtimeMs: st.mtimeMs, size: st.size };
      return data;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return (cache = null), {};
      throw err;
    }
  }

  async function save(data: Data) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, file);
    const st = await fs.stat(file);
    cache = { data, mtimeMs: st.mtimeMs, size: st.size };
  }

  /** Serialises all access within the process. */
  function run<T>(fn: (data: Data) => T | Promise<T>, write: boolean): Promise<T> {
    const next = queue.then(async () => {
      const data = await load();
      try {
        const result = await fn(data);
        if (write) await save(data);
        return result;
      } catch (err) {
        // A failed write may have changed the cached data part-way: read the file again next time.
        if (write) cache = null;
        throw err;
      }
    });
    queue = next.catch(() => undefined);
    return next;
  }

  const clone = <T,>(v: T): T => structuredClone(v);

  return {
    get: (col, id) => run((d) => clone((d[col]?.[id] ?? null) as never), false),
    findBy: (col, field, value) =>
      run((d) => Object.values(d[col] ?? {}).filter((x) => (x as Record<string, unknown>)[field] === value).map(clone) as never, false),
    insert: (col, id, doc) =>
      run((d) => {
        const c = (d[col] ??= {});
        if (id in c) return false;
        c[id] = clone(doc);
        return true;
      }, true),
    put: (col, id, doc) =>
      run((d) => {
        (d[col] ??= {})[id] = clone(doc);
      }, true),
    update: (col, id, fn) =>
      run((d) => {
        const c = d[col] ?? {};
        if (!(id in c)) return null;
        c[id] = fn(clone(c[id]) as never);
        return clone(c[id]) as never;
      }, true),
    list: (col, limit = 500) => run((d) => Object.values(d[col] ?? {}).slice(-limit).reverse().map(clone) as never, false),
    entries: (col) => run((d) => Object.entries(d[col] ?? {}).map(([id, doc]) => ({ id, doc: clone(doc) })) as never, false),
    delete: (col, id) =>
      run((d) => {
        const c = d[col] ?? {};
        if (!(id in c)) return false;
        delete c[id];
        return true;
      }, true),
  };
}
