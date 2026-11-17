import { readFile } from 'node:fs/promises';

export class NeedsManualLoginError extends Error {
  readonly status = 'NEEDS_MANUAL_LOGIN' as const;

  constructor(message: string) {
    super(message);
    this.name = 'NeedsManualLoginError';
  }
}

const LOGIN_URL_PATTERNS = [/\/login/i, /accounts\.shopee/i, /account\/login/i, /auth/i];
const CHALLENGE_TEXT_PATTERNS = [
  /captcha/i,
  /security verification/i,
  /verify you are human/i,
  /verifikasi keamanan/i,
  /scan qr/i,
];

/**
 * Fails closed whenever a Playwright session is redirected to a login screen
 * or encounters a CAPTCHA / 2FA challenge.
 */
export function detectAuthChallenge(input: { url: string; pageText: string }): void {
  if (LOGIN_URL_PATTERNS.some((pattern) => pattern.test(input.url))) {
    throw new NeedsManualLoginError(
      `Session redirected to login URL (${input.url}). Manual re-login required.`
    );
  }
  if (CHALLENGE_TEXT_PATTERNS.some((pattern) => pattern.test(input.pageText))) {
    throw new NeedsManualLoginError(
      'Security verification / CAPTCHA detected. Stopping automation for manual operator login.'
    );
  }
}

export function computeHumanJitterMs(minMs = 800, maxMs = 2500): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs + 1));
}

export async function waitHumanJitter(minMs = 800, maxMs = 2500): Promise<void> {
  const ms = computeHumanJitterMs(minMs, maxMs);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function validateStorageStateFile(filePath: string): Promise<boolean> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch {
    throw new NeedsManualLoginError(
      `Playwright storageState file missing at '${filePath}'. Run login script first.`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new NeedsManualLoginError(
      `Playwright storageState file '${filePath}' is not valid JSON.`
    );
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { cookies?: unknown }).cookies)
  ) {
    throw new NeedsManualLoginError(
      `Playwright storageState file '${filePath}' is missing cookies array.`
    );
  }

  return true;
}
