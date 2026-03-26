import { useState, useCallback } from 'react';
import { debugLog } from '../../domain/debug';
import { registerPunch } from '../../application/register-punch';
import { addPendingPunch } from '../../application/detect-punches';
import { SeniorCookieAuth } from '../../infrastructure/senior/senior-cookie-auth';
import { SeniorPageAuth } from '../../infrastructure/senior/senior-page-auth';
import { SeniorInterceptorAuth } from '../../infrastructure/senior/senior-interceptor-auth';
import { SeniorPunchRegistrar } from '../../infrastructure/senior/senior-registrar';
import { injectPunchIntoLocalStorage } from '../../infrastructure/senior/senior-local-inject';

const authProviders = [
  new SeniorCookieAuth(),
  new SeniorPageAuth(),
  new SeniorInterceptorAuth(),
];

const registrar = new SeniorPunchRegistrar();

export function usePunchAction(onToast: (msg: string) => void, onRefresh: () => void) {
  const [punching, setPunching] = useState(false);

  const doPunch = useCallback(async () => {
    setPunching(true);
    onToast('Registrando ponto...');

    try {
      const result = await registerPunch(authProviders, registrar);
      if (result.success) {
        onToast('Ponto registrado via API!');

        let newPunchTime: string | null = null;
        try {
          const body = typeof result.responseBody === 'string' ? JSON.parse(result.responseBody) : result.responseBody;
          const ev = body?.clockingResult?.clockingEventImported;
          if (ev?.timeEvent) {
            const m = ev.timeEvent.match(/(\d{2}):(\d{2})/);
            if (m) newPunchTime = `${m[1]}:${m[2]}`;
          }
        } catch (_) {}

        if (newPunchTime) {
          debugLog('Novo ponto da API:', newPunchTime);
          addPendingPunch(newPunchTime);
          await injectPunchIntoLocalStorage(newPunchTime);
        }

        const storageUpdate: Record<string, unknown> = { punchSuccessTs: Date.now() };
        if (newPunchTime) storageUpdate.punchSuccessTime = newPunchTime;
        chrome.storage.local.set(storageUpdate);
        onRefresh();
      } else {
        onToast(`Falha: ${result.logs.join(', ')}`);
      }
    } catch (e) {
      onToast('Erro ao bater ponto');
    }

    setPunching(false);
  }, [onToast, onRefresh]);

  return { punching, doPunch };
}
