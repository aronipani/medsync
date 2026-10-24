// Rate limits per anonymous install, and global daily caps that protect the model budget.
import { HttpError } from './http.ts';
import type { KV } from './store/store.ts';

export interface Limit {
  name: string;
  perMinute?: number;
  perDay: number;
}

export const LIMITS = {
  install: { name: 'install', perMinute: 200, perDay: 20_000 }, // global, all phones together; per minute so one client can't use up the day
  stripRead: { name: 'strip', perMinute: 3, perDay: 30 },
  catalogueRead: { name: 'catr', perMinute: 30, perDay: 500 },
  catalogueAdd: { name: 'catw', perMinute: 5, perDay: 50 },
  vaultWrite: { name: 'vw', perMinute: 5, perDay: 50 },
  vaultRead: { name: 'vr', perMinute: 10, perDay: 100 },
  circleWrite: { name: 'cw', perMinute: 30, perDay: 1000 },
  circleRead: { name: 'cr', perMinute: 60, perDay: 5000 },
  photo: { name: 'photo', perMinute: 30, perDay: 300 }, // helpers send a backlog of training photos in one go
} satisfies Record<string, Limit>;

/** Counts one request for `who` (an install hash, or 'all'); throws 429 when over the limit. */
export async function spend(kv: KV, who: string, limit: Limit, now: number): Promise<void> {
  const day = Math.floor(now / 86_400_000);
  const minute = Math.floor(now / 60_000);
  const daily = await kv.incr(`RATE#${limit.name}#${who}`, `d${day}`, (day + 2) * 86_400);
  if (daily > limit.perDay) throw new HttpError(429, 'rate_limited', 'Too many requests today.');
  if (limit.perMinute) {
    const n = await kv.incr(`RATE#${limit.name}#${who}`, `m${minute}`, (minute + 5) * 60);
    if (n > limit.perMinute) throw new HttpError(429, 'rate_limited', 'Too many requests; wait a minute.');
  }
}

/** Global daily model calls; when reached, strip reading answers 503 and the app reads the strip on the phone. */
export async function spendModelBudget(kv: KV, perDay: number, now: number): Promise<void> {
  const day = Math.floor(now / 86_400_000);
  const n = await kv.incr('BUDGET#model', `d${day}`, (day + 3) * 86_400);
  if (n > perDay) throw new HttpError(503, 'model_budget_reached', 'Strip reading is resting for today; the phone reads the strip instead.');
}
