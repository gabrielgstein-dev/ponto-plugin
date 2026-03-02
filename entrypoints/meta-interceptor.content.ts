export default defineContentScript({
  matches: ['*://plataforma.meta.com.br/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    interceptMetaFetch();
  },
});

function interceptMetaFetch() {
  const originalFetch = window.fetch;
  window.fetch = function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
    if (init?.headers) {
      const bearer = extractBearerFromHeaders(init.headers);
      if (bearer) {
        dispatchMetaToken(bearer);
      }
    }

    return originalFetch.apply(this, [input, init]);
  };
}

function extractBearerFromHeaders(headers: HeadersInit): string | null {
  if (headers instanceof Headers) {
    const auth = headers.get('Authorization') || headers.get('authorization');
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
  } else if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, string>)) {
      if (k.toLowerCase() === 'authorization' && v?.startsWith('Bearer ')) return v.slice(7);
    }
  }
  return null;
}

function dispatchMetaToken(token: string) {
  if (token && typeof token === 'string' && token.length > 20) {
    window.dispatchEvent(new CustomEvent('__sponto_meta_token', { detail: token }));
  }
}
