import { promises as fs } from "node:fs";
import path from "node:path";
import type { Collection, DocStore } from "./types";

type Data = Partial<Record<Collection, Record<string, unknown>>>;

/** JSON-file store for local development (single process). */
export function createFileStore(file: string): DocStore {
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<Data> {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw err;
    }
  }

  async function save(data: Data) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(tmp, file);
  }

  /** Serialises all access within the process. */
  function run<T>(fn: (data: Data) => T | Promise<T>, write: boolean): Promise<T> {
    const next = queue.then(async () => {
      const data = await load();
      const result = await fn(data);
      if (write) await save(data);
      return result;
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
    delete: (col, id) =>
      run((d) => {
        const c = d[col] ?? {};
        if (!(id in c)) return false;
        delete c[id];
        return true;
      }, true),
  };
}
