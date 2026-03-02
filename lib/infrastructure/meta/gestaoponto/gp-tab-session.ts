import { SeniorCookieAuth } from '../../senior/senior-cookie-auth';

export async function waitForGpSession(tabId: number, maxWait: number): Promise<boolean> {
  let elapsed = 0;
  let authAttempted = false;

  while (elapsed < maxWait) {
    await new Promise(r => setTimeout(r, 1000));
    elapsed += 1000;

    try {
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
      if (results?.[0]?.result) return true;

      if (!authAttempted) {
        authAttempted = true;
        const ok = await attemptGpAuth(tabId);
        if (ok) return true;
      }
    } catch (_) {}
  }
  return false;
}

async function attemptGpAuth(tabId: number): Promise<boolean> {
  const cookieAuth = new SeniorCookieAuth();
  const token = await cookieAuth.getAccessToken();
  if (!token) return false;

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [token],
    func: async (accessToken: string) => {
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
        if (!r.ok) return null;
        const json = await r.json();
        if (!json.token) return null;
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
          colaboradorId: json.colaborador?.id ?? null,
          codigoCalculo,
        };
      } catch (_) { return null; }
    },
  });

  const res = results?.[0]?.result;
  if (res?.colaboradorId) {
    const save: Record<string, unknown> = { gestaoPontoColaboradorId: res.colaboradorId };
    if (res.codigoCalculo) save.gestaoPontoCodigoCalculo = res.codigoCalculo;
    chrome.storage.local.set(save);
  }
  return !!res;
}
