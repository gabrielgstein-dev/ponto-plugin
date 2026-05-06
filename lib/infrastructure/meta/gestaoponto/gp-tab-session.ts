import { SeniorCookieAuth } from '../../senior/senior-cookie-auth';
import { SENIOR_TOKEN_MAX_AGE_MS } from '../../senior/constants';
import { debugLog, debugWarn } from '../../../domain/debug';

const AUTH_RETRY_INTERVAL_MS = 3000;

function isGpDomain(url: string): boolean {
  try { return new URL(url).hostname.includes('gestaoponto'); } catch { return false; }
}

export async function waitForGpSession(tabId: number, maxWait: number): Promise<boolean> {
  debugLog(`GP waitSession: iniciando (tabId=${tabId}, maxWait=${maxWait}ms)`);
  let elapsed = 0;
  let lastAuthAttempt = -AUTH_RETRY_INTERVAL_MS;

  while (elapsed < maxWait) {
    await new Promise(r => setTimeout(r, 1000));
    elapsed += 1000;

    try {
      const tab = await chrome.tabs.get(tabId);
      const tabUrl = tab.url || '';
      const onGp = isGpDomain(tabUrl);

      if (!onGp) {
        debugLog(`GP waitSession: SSO em andamento (${elapsed}ms), url=${tabUrl.substring(0, 100)}`);
        continue;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            const raw = sessionStorage.getItem('SeniorGPOSession');
            if (raw && JSON.parse(raw).token) return true;
          } catch (_) {}
          return false;
        },
      });
      if (results?.[0]?.result) {
        debugLog('GP waitSession: SeniorGPOSession encontrado!');
        return true;
      }

      if (elapsed - lastAuthAttempt >= AUTH_RETRY_INTERVAL_MS) {
        lastAuthAttempt = elapsed;
        debugLog(`GP waitSession: tentando auth (${elapsed}ms)`);
        const ok = await attemptGpAuth(tabId);
        if (ok) {
          debugLog('GP waitSession: auth bem-sucedido!');
          return true;
        }
        debugLog(`GP waitSession: auth falhou, aguardando SSO do SPA ou cookie...`);
      }
    } catch (e) {
      debugWarn(`GP waitSession: erro no loop (${elapsed}ms):`, (e as Error).message);
    }
  }
  debugLog(`GP waitSession: timeout após ${maxWait}ms`);
  return false;
}

async function getAnyAccessToken(): Promise<string | null> {
  const cookieAuth = new SeniorCookieAuth();
  const fromCookie = await cookieAuth.getAccessToken();
  if (fromCookie) return fromCookie;

  try {
    const stored = await chrome.storage.local.get(['seniorToken', 'seniorTokenTs']);
    if (stored.seniorToken && stored.seniorTokenTs && Date.now() - stored.seniorTokenTs < SENIOR_TOKEN_MAX_AGE_MS) {
      debugLog('attemptGpAuth: usando seniorToken do storage');
      return stored.seniorToken;
    }
  } catch (_) {}
  return null;
}

async function attemptGpAuth(tabId: number): Promise<boolean> {
  const token = await getAnyAccessToken();
  if (!token) return false;

  // DIAG: o fetch dentro do executeScript engolia falhas (return null);
  // sem visibilidade do status/body real, \u00e9 imposs\u00edvel distinguir entre
  // "401 origin errado", "401 token errado", "ok mas json sem token",
  // "rota da aba inadequada" etc. Captura agora todos os sinais e devolve
  // pra c\u00e1 pra logar fora do contexto da aba.
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [token],
    func: async (accessToken: string) => {
      const diag = {
        ok: false,
        status: 0,
        bodyPreview: '',
        jsonKeys: [] as string[],
        url: location.href,
        error: null as string | null,
      };
      try {
        const r = await fetch('/gestaoponto-backend/api/senior/auth/g7', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'token': accessToken,
            'expires': '604800',
          },
          body: '{}',
        });
        diag.status = r.status;
        diag.ok = r.ok;
        const text = await r.text();
        diag.bodyPreview = text.substring(0, 300);
        if (!r.ok) return { diag };
        let json: { token?: string; userRange?: unknown; colaborador?: { id?: string }; urlPlataforma?: string };
        try {
          json = JSON.parse(text);
          diag.jsonKeys = Object.keys(json);
        } catch (e) {
          diag.error = 'json parse: ' + (e as Error).message;
          return { diag };
        }
        if (!json.token) return { diag };
        const session: Record<string, unknown> = {
          token: json.token,
          platformUrl: json.urlPlataforma || '',
          showMenu: 'S',
          loginSeniorX: true,
        };
        if (json.userRange) session.userRange = json.userRange;
        sessionStorage.setItem('SeniorGPOSession', JSON.stringify(session));
        sessionStorage.setItem('token', json.token);

        let codigoCalculo: string | null = null;
        if (Array.isArray(json.userRange)) {
          for (const entry of json.userRange) {
            const cond = (entry.condition || entry.Condition || JSON.stringify(entry)) as string;
            const m = cond.match(/CodCal[=:]\s*\d+[-\u2013]?(\d+)/);
            if (m) { codigoCalculo = m[1]; break; }
          }
        }

        return {
          diag,
          colaboradorId: json.colaborador?.id ?? null,
          codigoCalculo,
        };
      } catch (e) {
        diag.error = (e as Error).message;
        return { diag };
      }
    },
  });

  const res = results?.[0]?.result as
    | { diag: Record<string, unknown>; colaboradorId?: string | null; codigoCalculo?: string | null }
    | undefined;

  if (res?.diag) {
    debugLog('[diag] attemptGpAuth result:', JSON.stringify(res.diag));
  }
  if (res?.colaboradorId) {
    const save: Record<string, unknown> = { gestaoPontoColaboradorId: res.colaboradorId };
    if (res.codigoCalculo) save.gestaoPontoCodigoCalculo = res.codigoCalculo;
    chrome.storage.local.set(save);
  }
  return !!res?.colaboradorId;
}
