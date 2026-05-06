/**
 * Error logger estruturado.
 *
 * Wrapper sobre log-store.appendLog que adiciona categoria, severidade,
 * operação e metadata pra facilitar filtragem e diagnóstico em produção.
 *
 * Persistência: aproveita o ring buffer já implementado em log-store.ts —
 * sem buffer próprio, sem chrome.storage extra. Os erros logados aqui
 * aparecem no mesmo "Exportar logs" que o usuário já usa.
 *
 * Limite: MAX_ERRORS_PER_SESSION evita overhead em loops descontrolados
 * (caso típico: refresh travado disparando 1000+ erros/seg). Após o
 * limite, log silencioso até reload da extensão.
 */
import { appendLog } from './log-store';

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ErrorCategory =
  | 'storage'
  | 'network'
  | 'auth'
  | 'detection'
  | 'registration'
  | 'parsing'
  | 'render'
  | 'unknown';

export interface ErrorContext {
  category: ErrorCategory;
  severity: ErrorSeverity;
  operation: string;
  metadata?: Record<string, unknown>;
}

const MAX_ERRORS_PER_SESSION = 100;
const PREFIX = '[Senior Ponto Error]';

let errorCount = 0;

function severityToLogLevel(severity: ErrorSeverity): 'log' | 'warn' | 'error' {
  if (severity === 'critical' || severity === 'high') return 'error';
  if (severity === 'medium') return 'warn';
  return 'log';
}

function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

export function logError(error: unknown, context: ErrorContext): void {
  if (errorCount >= MAX_ERRORS_PER_SESSION) return;
  errorCount++;

  const { message, stack } = describeError(error);
  const entry = {
    timestamp: new Date().toISOString(),
    category: context.category,
    severity: context.severity,
    operation: context.operation,
    message,
    stack,
    metadata: context.metadata,
  };

  appendLog(severityToLogLevel(context.severity), [PREFIX, entry]);
}

/* v8 ignore next 4 -- helper apenas para testes */
export function _resetErrorCountForTests(): void {
  errorCount = 0;
}
