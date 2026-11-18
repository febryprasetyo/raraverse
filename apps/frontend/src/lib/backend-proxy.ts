import type { NextRequest } from 'next/server';

const BACKEND_ORIGIN = (
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://127.0.0.1:3001'
).replace(/\/$/, '');

const PROXY_TIMEOUT_MS = 180_000;

/**
 * Proxies incoming Next.js App Router requests to the Fastify backend
 * with an extended timeout so long-running LLM/sync operations do not
 * hit Next.js's default 30s rewrite proxy timeout.
 */
export async function proxyToBackend(
  request: NextRequest,
  targetPath: string
): Promise<Response> {
  const url = `${BACKEND_ORIGIN}${targetPath}${request.nextUrl.search}`;
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower !== 'host' && lower !== 'connection' && lower !== 'content-length') {
      headers.set(key, value);
    }
  });

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (
        lower !== 'content-encoding' &&
        lower !== 'transfer-encoding' &&
        lower !== 'content-length'
      ) {
        responseHeaders.set(key, value);
      }
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    const message = err instanceof Error ? err.message : 'Backend proxy failed';
    return Response.json(
      { error: { code: isTimeout ? 'GATEWAY_TIMEOUT' : 'PROXY_ERROR', message } },
      { status: isTimeout ? 504 : 502 }
    );
  }
}
