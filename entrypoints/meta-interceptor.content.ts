export default defineContentScript({
  matches: ['*://plataforma.meta.com.br/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    interceptMetaFetch();
  },
});

const SESSION_PATH = '/api/auth/session';

function interceptMetaFetch() {
  const originalFetch = window.fetch;
  window.fetch = function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
    const fetchUrl = typeof input === 'string' ? input : (input as Request).url || '';

    if (init?.headers) {
      const bearer = extractBearerFromHeaders(init.headers);
      if (bearer) {
        dispatchMetaToken(bearer);
      }
    }

    const result = originalFetch.apply(this, [input, init]);

    if (fetchUrl.includes(SESSION_PATH)) {
      (result as Promise<Response>).then(response => {
        if (!response.ok) return;
        response.clone().json().then((json: Record<string, unknown>) => {
          if (json.accessToken && typeof json.accessToken === 'string') {
            dispatchMetaToken(json.accessToken);
          }
        }).catch(() => {});
      }).catch(() => {});
    }

    return result;
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
