import { SeniorPageAuth } from '../infrastructure/senior/senior-page-auth';
import { SENIOR_TOKEN_MAX_AGE_MS } from '../infrastructure/senior/constants';
import { debugLog } from '../domain/debug';

/**
 * Captura PROATIVA do token Senior.
 *
 * A captura padrão é passiva: o `webRequest.onSendHeaders` só pega o Bearer
 * quando a SPA Senior dispara uma requisição autenticada. Se o usuário abre
 * uma aba Senior já logada e fica parado, o plugin fica "Desconectado" até a
 * próxima requisição natural (ou o alarme de 10 min).
 *
 * Aqui, ao detectar uma aba Senior recém-carregada e SEM token fresco no
 * storage, lemos o token diretamente do `sessionStorage` da aba via
 * `SeniorPageAuth` (read-only — nenhuma escrita, nenhuma requisição de rede
 * feita pelo plugin) e persistimos. Fecha a janela de "abri e ainda diz
 * desconectado" sem depender de esperar uma requisição.
 */
const THROTTLE_MS = 15000;
let _lastRunTs = 0;

export function resetProactiveCaptureThrottle(): void {
  _lastRunTs = 0;
}

export async function proactiveSeniorCapture(): Promise<boolean> {
  if (Date.now() - _lastRunTs < THROTTLE_MS) return false;
  _lastRunTs = Date.now();

  // Já temos token fresco? Nada a fazer — não toca na aba à toa.
  const stored = await chrome.storage.local.get(['seniorToken', 'seniorTokenTs']);
  if (
    stored.seniorToken &&
    stored.seniorTokenTs &&
    Date.now() - (stored.seniorTokenTs as number) < SENIOR_TOKEN_MAX_AGE_MS
  ) {
    return false;
  }

  const token = await new SeniorPageAuth().getAccessToken();
  if (!token) {
    debugLog('proactiveSeniorCapture: aba Senior sem token disponível ainda');
    return false;
  }

  await chrome.storage.local.set({ seniorToken: token, seniorTokenTs: Date.now() });
  debugLog('proactiveSeniorCapture: token lido da aba Senior e persistido');
  return true;
}
