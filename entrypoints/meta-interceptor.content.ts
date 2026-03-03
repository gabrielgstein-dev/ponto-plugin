export default defineContentScript({
  matches: ['*://plataforma.meta.com.br/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    interceptMetaFetch();
  },
});

const TS_MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

function isTimesheetMutation(url: string, method: string): boolean {
  const ul = url.toLowerCase();
  return TS_MUTATION_METHODS.includes(method.toUpperCase()) && (ul.includes('/timesheets/') || ul.includes('/reported-hours'));
}

function interceptMetaFetch() {
  const originalFetch = window.fetch;
  window.fetch = function (this: typeof globalThis, input: RequestInfo | URL, init?: RequestInit) {
    if (init?.headers) {
      const bearer = extractBearerFromHeaders(init.headers);
      if (bearer) {
        dispatchMetaToken(bearer);
      }
    }

    const method = (init?.method || 'GET').toUpperCase();
    const fetchUrl = typeof input === 'string' ? input : (input as Request).url || '';

    const result = originalFetch.apply(this, [input, init]);

    if (isTimesheetMutation(fetchUrl, method)) {
      (result as Promise<Response>).then(response => {
        if (response.ok) {
          window.dispatchEvent(new CustomEvent('__sponto_ts_mutation', {
            detail: JSON.stringify({ url: fetchUrl, method, timestamp: Date.now() }),
          }));
        }
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
