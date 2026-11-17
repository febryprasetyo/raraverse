import { createHash, createHmac } from 'node:crypto';

export interface PresignPutInput {
  key: string;
  contentType: string;
  expiresInSec?: number;
}

export interface PresignPutResult {
  uploadUrl: string;
  r2Key: string;
  publicUrl: string;
  expiresInSec: number;
}

export interface IStoragePresigner {
  createPutUrl(input: PresignPutInput): PresignPutResult;
}

export interface R2PresignerOptions {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  region?: string;
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

/**
 * Generates AWS SigV4 presigned PUT URLs for Cloudflare R2 without heavy SDK dependencies.
 */
export class R2Presigner implements IStoragePresigner {
  private readonly endpointUrl: URL;
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly publicBaseUrl: string;
  private readonly region: string;

  constructor(options: R2PresignerOptions) {
    this.endpointUrl = new URL(options.endpoint);
    this.bucket = options.bucket;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.publicBaseUrl = options.publicBaseUrl.replace(/\/$/, '');
    this.region = options.region ?? 'auto';
  }

  createPutUrl(input: PresignPutInput): PresignPutResult {
    const expiresInSec = input.expiresInSec ?? 900;
    const normalizedKey = input.key.replace(/^\/+/, '');
    const now = new Date();
    const { amzDate, dateStamp } = formatAmzDate(now);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const canonicalUri = `/${this.bucket}/${normalizedKey}`;

    const queryParams = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.accessKeyId}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSec),
      'X-Amz-SignedHeaders': 'content-type;host',
    });
    queryParams.sort();

    const canonicalHeaders = `content-type:${input.contentType}\nhost:${this.endpointUrl.host}\n`;
    const canonicalRequest = [
      'PUT',
      canonicalUri,
      queryParams.toString(),
      canonicalHeaders,
      'content-type;host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate = hmacSha256(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, this.region);
    const kService = hmacSha256(kRegion, 's3');
    const kSigning = hmacSha256(kService, 'aws4_request');
    const signature = createHmac('sha256', kSigning)
      .update(stringToSign, 'utf8')
      .digest('hex');

    queryParams.append('X-Amz-Signature', signature);

    return {
      uploadUrl: `${this.endpointUrl.origin}${canonicalUri}?${queryParams.toString()}`,
      r2Key: normalizedKey,
      publicUrl: `${this.publicBaseUrl}/${normalizedKey}`,
      expiresInSec,
    };
  }
}

export class MockStoragePresigner implements IStoragePresigner {
  createPutUrl(input: PresignPutInput): PresignPutResult {
    const expiresInSec = input.expiresInSec ?? 900;
    const normalizedKey = input.key.replace(/^\/+/, '');
    return {
      uploadUrl: `http://127.0.0.1:9000/ebieshop-mock/${normalizedKey}?mock-sig=1`,
      r2Key: normalizedKey,
      publicUrl: `http://127.0.0.1:9000/ebieshop-mock/${normalizedKey}`,
      expiresInSec,
    };
  }
}
