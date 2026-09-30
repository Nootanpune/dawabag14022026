// src/services/storage.service.ts
// Private documents (KYC files, prescriptions, invoices) live only in the server
// object store — S3 in ap-south-1 with AES-256 server-side encryption. There is
// no local-disk fallback: the server is the single source of truth
// (docs/DECISIONS.md). S3_ENDPOINT allows an S3-compatible staging store.
import AWS from 'aws-sdk';
import { AppError } from '../utils/AppError';

let s3: AWS.S3 | null = null;

function getS3(): AWS.S3 {
  if (!process.env.AWS_S3_BUCKET) {
    throw new AppError('Document storage is not configured. Please try again later.', 503);
  }
  if (!s3) {
    s3 = new AWS.S3({
      region: process.env.AWS_REGION || 'ap-south-1',
      ...(process.env.S3_ENDPOINT && {
        endpoint: process.env.S3_ENDPOINT,
        s3ForcePathStyle: true,
      }),
      signatureVersion: 'v4',
    });
  }
  return s3;
}

export async function putPrivateObject(
  key: string,
  body: Buffer,
  contentType: string,
  metadata: Record<string, string> = {}
): Promise<string> {
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

// Short-lived link for staff to view a private document (Rulebook C-41).
// Callers must audit-log every call.
export function getPrivateObjectUrl(key: string, expiresSeconds = 300): string {
  return getS3().getSignedUrl('getObject', {
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    Expires: expiresSeconds,
  });
}
