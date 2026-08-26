import { logError } from '../../../domain/error-logger';

// Chaves de storage do estado "GP inalcançável" (≠ deslogado). Setado quando o
// host do GP responde redirect — sinal de que o domínio mudou (ago/2026:
// gestaoponto.meta.com.br → gestaoponto.insi.com) e o plugin precisa de update.
// A UI lê isso pra não mandar o usuário "reconectar" à toa.
export const GP_UNREACHABLE_KEYS = ['gpUnreachableTs', 'gpUnreachableUrl'] as const;

/**
 * Detecta redirect do host GP. Todo fetch ao GP usa `redirect: 'manual'`:
 * no service worker isso devolve `type: 'opaqueredirect'` (status 0); em
 * ambientes que ainda seguem, `r.redirected` fica true. Nos dois casos a
 * resposta não é a API — antes disso virava `r.json()` explodindo num catch
 * genérico de rede e ninguém via.
 */
export function isGpHostRedirect(r: Response): boolean {
  return r.type === 'opaqueredirect' || r.redirected === true || (r.status >= 300 && r.status < 400);
}

export async function markGpUnreachable(operation: string, url: string, r: Response): Promise<void> {
  let location = '';
  try { location = r.headers?.get?.('location') ?? ''; } catch (_) { /* opaque */ }
  logError(new Error(`GP host redirected (${r.type || r.status})`), {
    category: 'auth',
    severity: 'high',
    operation: 'gp.hostRedirected',
    metadata: { operation, url, status: r.status, type: r.type, redirected: r.redirected, location },
  });
  await chrome.storage.local.set({ gpUnreachableTs: Date.now(), gpUnreachableUrl: url });
}

export async function clearGpUnreachable(): Promise<void> {
  const stored = await chrome.storage.local.get(['gpUnreachableTs']);
  if (stored.gpUnreachableTs) await chrome.storage.local.remove([...GP_UNREACHABLE_KEYS]);
}
