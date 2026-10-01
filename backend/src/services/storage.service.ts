// src/services/storage.service.ts
// Private documents (KYC files, prescriptions, invoices) live only in the server
// object store — S3 in ap-south-1 with AES-256 server-side encryption. There is
// no local-disk fallback: the server is the single source of truth
// (docs/DECISIONS.md). S3_ENDPOINT allows an S3-compatible staging or trial store
// (the server's own object store, deploy/staging/compose.yml profile objectstore);
// S3_PUBLIC_ENDPOINT is that store's public HTTPS address, used only to sign the
// links browsers open — uploads and reads by the API stay on the internal address.
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../utils/AppError';

let s3: S3Client | null = null;
let signer: S3Client | null = null;

function client(endpoint: string | undefined): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    ...(endpoint && { endpoint, forcePathStyle: true }),
  });
}

function getS3(): S3Client {
  if (!process.env.AWS_S3_BUCKET) {
    throw new AppError('Document storage is not configured. Please try again later.', 503);
  }
  if (!s3) s3 = client(process.env.S3_ENDPOINT);
  return s3;
}

// Signing is local work (no request is sent), so a client for the public address
// only ever produces links; a signature covers the host, so the link must name the
// address the browser will use. AWS S3 itself needs no separate signer.
export function linkEndpoint(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.S3_ENDPOINT ? (env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT) : undefined;
}

function getSigner(): S3Client {
  const publicEndpoint = linkEndpoint();
  if (!publicEndpoint || publicEndpoint === process.env.S3_ENDPOINT) return getS3();
  getS3();   // same "not configured" check
  if (!signer) signer = client(publicEndpoint);
  return signer;
}

export async function putPrivateObject(
  key: string,
  body: Buffer,
  contentType: string,
  metadata: Record<string, string> = {}
): Promise<string> {
  await getS3().send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: key,
    Body: body,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
    Metadata: metadata,
  }));
  return key;
}

// Short-lived link for staff to view a private document (Rulebook C-41).
// Callers must audit-log every call.
export async function getPrivateObjectUrl(key: string, expiresSeconds = 300): Promise<string> {
  return getSignedUrl(getSigner(), new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET!, Key: key }), { expiresIn: expiresSeconds });
}

export const isObjectStoreConfigured = () => !!process.env.AWS_S3_BUCKET;

// Short-lived link to a catalogue object (product pack photos). Public content,
// not personal data, so no audit entry; the bucket itself stays private and the
// link tells the browser it may cache the photo for as long as the link lives.
export async function getCatalogueObjectUrl(key: string, expiresSeconds: number): Promise<string> {
  return getSignedUrl(getSigner(), new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!, Key: key, ResponseCacheControl: `private, max-age=${expiresSeconds}`,
  }), { expiresIn: expiresSeconds });
}
