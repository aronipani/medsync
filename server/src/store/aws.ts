// Production storage: one DynamoDB table (pk, sk, TTL on expiresAt) and one private, encrypted S3 bucket.
import { DynamoDBClient, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Blobs, Item, KV } from './store.ts';

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const s3 = new S3Client({});

export class DynamoKV implements KV {
  table: string;
  constructor(table: string) {
    this.table = table;
  }
  async get(pk: string, sk: string) {
    const r = await doc.send(new GetCommand({ TableName: this.table, Key: { pk, sk } }));
    const i = r.Item as Item | undefined;
    // TTL deletion can lag by hours: treat expired items as gone.
    return i && (!i.expiresAt || i.expiresAt * 1000 > Date.now()) ? i : undefined;
  }
  async put(item: Item, cond?: { ifVersion?: number }) {
    try {
      await doc.send(
        new PutCommand({
          TableName: this.table,
          Item: item,
          ...(cond?.ifVersion === undefined
            ? {}
            : cond.ifVersion === 0
              ? { ConditionExpression: 'attribute_not_exists(pk)' }
              : { ConditionExpression: 'version = :v', ExpressionAttributeValues: { ':v': cond.ifVersion } }),
        }),
      );
      return true;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return false;
      throw e;
    }
  }
  async query(pk: string, after: string, limit: number) {
    const r = await doc.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'pk = :pk AND sk > :after',
        ExpressionAttributeValues: { ':pk': pk, ':after': after },
        Limit: limit,
      }),
    );
    const now = Date.now();
    return ((r.Items ?? []) as Item[]).filter((i) => !i.expiresAt || i.expiresAt * 1000 > now);
  }
  async incr(pk: string, sk: string, expiresAt: number) {
    const r = await doc.send(
      new UpdateCommand({
        TableName: this.table,
        Key: { pk, sk },
        UpdateExpression: 'ADD #c :one SET expiresAt = :e',
        ExpressionAttributeNames: { '#c': 'count' },
        ExpressionAttributeValues: { ':one': 1, ':e': expiresAt },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    return Number(r.Attributes?.count ?? 1);
  }
  async delete(pk: string, sk: string) {
    await doc.send(new DeleteCommand({ TableName: this.table, Key: { pk, sk } }));
  }
}

export class S3Blobs implements Blobs {
  bucket: string;
  constructor(bucket: string) {
    this.bucket = bucket;
  }
  async put(key: string, data: Buffer, contentType: string) {
    await s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }));
  }
  async get(key: string) {
    try {
      const r = await s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey') return undefined;
      throw e;
    }
  }
  async delete(key: string) {
    await s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
