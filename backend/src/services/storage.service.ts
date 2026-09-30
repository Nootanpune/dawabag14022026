// src/services/storage.service.ts
// Private document storage (KYC documents). S3 with AES-256 server-side
// encryption in ap-south-1; STORAGE_DRIVER=local writes to disk instead, for
// development and tests without AWS credentials. Never use local in production.
import AWS from 'aws-sdk';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../config/logger';

const useLocal = () => process.env.STORAGE_DRIVER === 'local';

let s3: AWS.S3 | null = null;
function getS3(): AWS.S3 {
  if (!s3) s3 = new AWS.S3({ region: process.env.AWS_REGION });
  return s3;
}

export async function putPrivateObject(
  key: string,
  body: Buffer,
  contentType: string,
  metadata: Record<string, string> = {}
): Promise<string> {
  if (useLocal()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('STORAGE_DRIVER=local is not allowed in production');
    }
    const root = path.resolve(process.env.LOCAL_STORAGE_DIR || './local-storage');
    const target = path.resolve(root, key);
    if (!target.startsWith(root + path.sep)) throw new Error('Invalid storage key');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    logger.warn(`Stored ${key} on local disk (STORAGE_DRIVER=local)`);
    return key;
  }

  await getS3().upload({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    Body: body,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
    Metadata: metadata,
  }).promise();
  return key;
}
