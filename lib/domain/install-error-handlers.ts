/**
 * Conecta handlers globais para que toda exceção e console.error não
 * tratados também caiam no ring buffer de logs.
 *
 * Cada entrypoint (popup, sidepanel, background) chama esta função uma vez
 * durante a inicialização. Idempotente: chamar de novo é no-op.
 */
import { appendLog } from './log-store';

let installed = false;

export function installErrorHandlers(): void {
  if (installed) return;
  installed = true;

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (e: ErrorEvent) => {
      const where = e.filename ? ` @ ${e.filename}:${e.lineno}:${e.colno}` : '';
      appendLog('error', [`[window.error] ${e.message}${where}`, e.error]);
    });

    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
      appendLog('error', ['[unhandledrejection]', e.reason]);
    });
  } else if (typeof self !== 'undefined') {
    // Service worker: usa self em vez de window
    self.addEventListener('error', (e: Event) => {
      const ev = e as ErrorEvent;
      const where = ev.filename ? ` @ ${ev.filename}:${ev.lineno}:${ev.colno}` : '';
      appendLog('error', [`[sw.error] ${ev.message}${where}`, ev.error]);
    });
    self.addEventListener('unhandledrejection', (e: Event) => {
      const ev = e as PromiseRejectionEvent;
      appendLog('error', ['[sw.unhandledrejection]', ev.reason]);
    });
  }

  // Wrap console.error para também capturar erros logados manualmente
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    appendLog('error', args);
    originalError.apply(console, args);
  };
}

/* v8 ignore next 3 -- helper apenas para testes */
export function _resetForTests(): void {
  installed = false;
}
