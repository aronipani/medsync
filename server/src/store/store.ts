// Storage the API needs, as two small interfaces so the logic can be tested without AWS.
// Production: DynamoDB (one table) + S3 (one private bucket). Tests and local runs: in memory.

export interface Item {
  pk: string;
  sk: string;
  expiresAt?: number; // epoch seconds; DynamoDB TTL deletes the item after this
  [k: string]: unknown;
}

export interface KV {
  get(pk: string, sk: string): Promise<Item | undefined>;
  /** Writes the item. `ifVersion`: only if the stored item has this `version` (0 = must not exist). Returns false if not written. */
  put(item: Item, cond?: { ifVersion?: number }): Promise<boolean>;
  /** Items under pk with sk > after, oldest first. */
  query(pk: string, after: string, limit: number): Promise<Item[]>;
  /** Adds 1 to `count` (creating the item, keeping its other fields) and returns the new count. */
  incr(pk: string, sk: string, expiresAt: number): Promise<number>;
  delete(pk: string, sk: string): Promise<void>;
}

export interface Blobs {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | undefined>;
  delete(key: string): Promise<void>;
}
