import type { Blobs, Item, KV } from './store.ts';

export class MemoryKV implements KV {
  items = new Map<string, Item>();
  now: () => number;
  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }
  private live(i: Item | undefined) {
    return i && (!i.expiresAt || i.expiresAt * 1000 > this.now()) ? i : undefined;
  }
  async get(pk: string, sk: string) {
    const i = this.live(this.items.get(`${pk}|${sk}`));
    return i ? structuredClone(i) : undefined;
  }
  async put(item: Item, cond?: { ifVersion?: number }) {
    if (cond?.ifVersion !== undefined) {
      const cur = await this.get(item.pk, item.sk);
      if ((cur ? Number(cur.version ?? 0) : 0) !== cond.ifVersion) return false;
    }
    this.items.set(`${item.pk}|${item.sk}`, structuredClone(item));
    return true;
  }
  async query(pk: string, after: string, limit: number) {
    return [...this.items.values()]
      .filter((i) => i.pk === pk && i.sk > after && this.live(i))
      .sort((a, b) => (a.sk < b.sk ? -1 : 1))
      .slice(0, limit)
      .map((i) => structuredClone(i));
  }
  async incr(pk: string, sk: string, expiresAt: number) {
    const cur = await this.get(pk, sk);
    const count = Number(cur?.count ?? 0) + 1;
    this.items.set(`${pk}|${sk}`, { ...cur, pk, sk, count, expiresAt });
    return count;
  }
  async delete(pk: string, sk: string) {
    this.items.delete(`${pk}|${sk}`);
  }
}

export class MemoryBlobs implements Blobs {
  files = new Map<string, Buffer>();
  async put(key: string, data: Buffer) {
    this.files.set(key, Buffer.from(data));
  }
  async get(key: string) {
    return this.files.get(key);
  }
  async delete(key: string) {
    this.files.delete(key);
  }
}
