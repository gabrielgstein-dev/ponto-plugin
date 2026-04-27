# Roadmap: Tratamento de Erros Estruturado

## Contexto

O projeto possui múltiplos `catch (_) {}` silenciosos que engolem erros sem logging, tornando impossível debugar problemas em produção. Erros críticos são ignorados, causando falhas silenciosas que confundem usuários.

**Prioridade:** 🔥 CRÍTICO  
**Complexidade:** Média  
**Impacto:** Alto  
**Tempo Estimado:** 3-5 dias

---

## Objetivo

Implementar tratamento de erros estruturado:
1. **Zero `catch (_) {}` silenciosos** — todos os erros devem ser logados
2. **Error boundaries no React** — capturar erros de renderização
3. **Telemetria opcional** — rastrear falhas em produção
4. **Mensagens amigáveis** — UX clara quando algo falha

---

## Problemas Identificados

### 1. Content Scripts — Erros Silenciosos
**Arquivos:**
- `lib/application/detect-punches.ts:20,33`
- `lib/infrastructure/senior/senior-api-provider.ts:102,125`
- `entrypoints/interceptor.content.ts:64`

```typescript
// ANTES (RUIM)
try {
  const data = await chrome.storage.local.get('pendingPunches');
  // ...
} catch (_) {}  // ❌ Erro engolido
```

### 2. Providers — Falhas Não Reportadas
**Arquivos:**
- `lib/infrastructure/senior/senior-cookie-auth.ts:43`
- `lib/infrastructure/meta/gestaoponto/gp-provider.ts`

```typescript
// ANTES (RUIM)
catch (e) {
  debugWarn('Cookie auth erro:', (e as Error).message);
  // ❌ Apenas warning, sem contexto
}
```

### 3. React — Sem Error Boundaries
**Problema:** Erros de renderização crasham toda a UI sem feedback

---

## Implementação — Fase 1: Logging Estruturado (1-2 dias)

### Passo 1.1: Criar Error Logger Centralizado
**Arquivo:** `lib/domain/error-logger.ts`

```typescript
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ErrorCategory {
  STORAGE = 'storage',
  NETWORK = 'network',
  AUTH = 'auth',
  DETECTION = 'detection',
  REGISTRATION = 'registration',
  PARSING = 'parsing',
  RENDER = 'render',
  UNKNOWN = 'unknown',
}

interface ErrorContext {
  category: ErrorCategory;
  severity: ErrorSeverity;
  operation: string;
  metadata?: Record<string, unknown>;
}

class ErrorLogger {
  private static instance: ErrorLogger;
  private errorCount = 0;
  private readonly MAX_ERRORS_PER_SESSION = 100;

  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  log(error: Error | unknown, context: ErrorContext): void {
    if (this.errorCount >= this.MAX_ERRORS_PER_SESSION) {
      return;
    }
    this.errorCount++;

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const logEntry = {
      timestamp: new Date().toISOString(),
      category: context.category,
      severity: context.severity,
      operation: context.operation,
      message: errorMessage,
      stack: errorStack,
      metadata: context.metadata,
    };

    const prefix = '[Senior Ponto Error]';
    const severityEmoji = {
      [ErrorSeverity.LOW]: '💡',
      [ErrorSeverity.MEDIUM]: '⚠️',
      [ErrorSeverity.HIGH]: '🔴',
      [ErrorSeverity.CRITICAL]: '💥',
    };

    const emoji = severityEmoji[context.severity];
    const logMessage = `${prefix} ${emoji} [${context.category}] ${context.operation}: ${errorMessage}`;

    if (context.severity === ErrorSeverity.CRITICAL || context.severity === ErrorSeverity.HIGH) {
      console.error(logMessage, logEntry);
    } else {
      console.warn(logMessage, logEntry);
    }

    this.persistError(logEntry);
    this.maybeNotifyUser(context.severity, errorMessage);
  }

  private persistError(logEntry: unknown): void {
    try {
      chrome.storage.local.get('errorLog', (data) => {
        const log = Array.isArray(data.errorLog) ? data.errorLog : [];
        log.push(logEntry);
        const trimmed = log.slice(-50);
        chrome.storage.local.set({ errorLog: trimmed });
      });
    } catch (_) {
      // Falha ao persistir erro não deve crashar
    }
  }

  private maybeNotifyUser(severity: ErrorSeverity, message: string): void {
    if (severity !== ErrorSeverity.CRITICAL) return;

    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Senior Ponto — Erro Crítico',
        message: `Algo deu errado: ${message.substring(0, 100)}`,
        priority: 2,
      });
    } catch (_) {
      // Falha ao notificar não deve crashar
    }
  }

  async getRecentErrors(limit = 20): Promise<unknown[]> {
    try {
      const data = await chrome.storage.local.get('errorLog');
      const log = Array.isArray(data.errorLog) ? data.errorLog : [];
      return log.slice(-limit);
    } catch {
      return [];
    }
  }

  clearErrors(): void {
    try {
      chrome.storage.local.remove('errorLog');
      this.errorCount = 0;
    } catch (_) {
      // Ignore
    }
  }
}

export const errorLogger = ErrorLogger.getInstance();

export function logError(error: Error | unknown, context: ErrorContext): void {
  errorLogger.log(error, context);
}
```

**Checklist:**
- [ ] Criar `error-logger.ts` com logger centralizado
- [ ] Implementar categorização de erros
- [ ] Implementar níveis de severidade
- [ ] Persistir últimos 50 erros em `chrome.storage.local`
- [ ] Notificar usuário apenas em erros críticos
- [ ] Adicionar testes unitários

---

### Passo 1.2: Substituir `catch (_) {}` em Content Scripts
**Arquivo:** `lib/application/detect-punches.ts`

```typescript
// ANTES
function savePendingPunches(): void {
  try {
    chrome.storage.local.set({ pendingPunches: _pendingPunches });
  } catch (_) {}  // ❌
}

// DEPOIS
import { logError, ErrorCategory, ErrorSeverity } from '../domain/error-logger';

function savePendingPunches(): void {
  try {
    chrome.storage.local.set({ pendingPunches: _pendingPunches });
  } catch (e) {
    logError(e, {
      category: ErrorCategory.STORAGE,
      severity: ErrorSeverity.MEDIUM,
      operation: 'savePendingPunches',
      metadata: { count: _pendingPunches.length },
    });
  }
}
```

**Arquivos a Atualizar:**
- [ ] `lib/application/detect-punches.ts` (3 ocorrências)
- [ ] `lib/infrastructure/senior/senior-api-provider.ts` (2 ocorrências)
- [ ] `entrypoints/interceptor.content.ts` (1 ocorrência)
- [ ] `entrypoints/senior-platform.content.ts`
- [ ] `lib/infrastructure/chrome-storage.ts`

**Checklist:**
- [ ] Buscar todos os `catch (_)` no projeto
- [ ] Substituir por `logError` com contexto apropriado
- [ ] Definir categoria e severidade para cada caso
- [ ] Adicionar metadata relevante

---

### Passo 1.3: Melhorar Logging em Providers
**Arquivo:** `lib/infrastructure/senior/senior-cookie-auth.ts`

```typescript
// ANTES
catch (e) {
  debugWarn('Cookie auth erro:', (e as Error).message);
}

// DEPOIS
import { logError, ErrorCategory, ErrorSeverity } from '../../domain/error-logger';

catch (e) {
  logError(e, {
    category: ErrorCategory.AUTH,
    severity: ErrorSeverity.HIGH,
    operation: 'SeniorCookieAuth.getAccessToken',
    metadata: { provider: 'cookie' },
  });
  return null;
}
```

**Arquivos a Atualizar:**
- [ ] `lib/infrastructure/senior/senior-cookie-auth.ts`
- [ ] `lib/infrastructure/senior/senior-page-auth.ts`
- [ ] `lib/infrastructure/senior/senior-interceptor-auth.ts`
- [ ] `lib/infrastructure/meta/gestaoponto/gp-provider.ts`
- [ ] `lib/infrastructure/meta/gestaoponto/gp-auth.ts`

---

## Implementação — Fase 2: Error Boundaries (1 dia)

### Passo 2.1: Criar Error Boundary Component
**Arquivo:** `lib/presentation/components/ErrorBoundary.tsx`

```typescript
import { Component, ReactNode } from 'react';
import { logError, ErrorCategory, ErrorSeverity } from '../../domain/error-logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }): void {
    logError(error, {
      category: ErrorCategory.RENDER,
      severity: ErrorSeverity.CRITICAL,
      operation: 'React.render',
      metadata: { componentStack: errorInfo.componentStack },
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <h2>⚠️ Algo deu errado</h2>
          <p>Ocorreu um erro inesperado. Tente recarregar a extensão.</p>
          <details>
            <summary>Detalhes técnicos</summary>
            <pre>{this.state.error?.message}</pre>
          </details>
          <button onClick={() => window.location.reload()}>Recarregar</button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Checklist:**
- [ ] Criar `ErrorBoundary.tsx`
- [ ] Implementar fallback UI amigável
- [ ] Integrar com `errorLogger`
- [ ] Adicionar CSS para `.error-boundary`

---

### Passo 2.2: Wrappear App com ErrorBoundary
**Arquivo:** `lib/presentation/App.tsx`

```typescript
import { ErrorBoundary } from './components/ErrorBoundary';

export function App() {
  return (
    <ErrorBoundary>
      <PunchStateProvider>
        <AppContent />
      </PunchStateProvider>
    </ErrorBoundary>
  );
}
```

**Checklist:**
- [ ] Wrappear `<App>` com `<ErrorBoundary>`
- [ ] Wrappear `<SidePanelApp>` com `<ErrorBoundary>`
- [ ] Testar com erro forçado (throw new Error)

---

## Implementação — Fase 3: UX de Erros (1 dia)

### Passo 3.1: Adicionar Toast de Erro
**Arquivo:** `lib/presentation/components/Toast.tsx`

```typescript
// Adicionar suporte para tipo 'error'
interface ToastProps {
  message: string | null;
  type?: 'info' | 'success' | 'error';
  onDismiss: () => void;
}

export function Toast({ message, type = 'info', onDismiss }: ToastProps) {
  if (!message) return null;

  const className = `toast toast-${type}`;
  const icon = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';

  return (
    <div className={className}>
      <span>{icon} {message}</span>
      <button onClick={onDismiss}>×</button>
    </div>
  );
}
```

**Checklist:**
- [ ] Adicionar prop `type` ao Toast
- [ ] Adicionar estilos para `.toast-error`
- [ ] Atualizar hooks para usar `showToast(msg, 'error')`

---

### Passo 3.2: Melhorar Mensagens de Erro para Usuário
**Arquivo:** `lib/domain/error-messages.ts`

```typescript
export const USER_FRIENDLY_ERRORS: Record<string, string> = {
  'Failed to fetch': 'Sem conexão com o servidor. Verifique sua internet.',
  'NetworkError': 'Erro de rede. Tente novamente.',
  'Unauthorized': 'Sessão expirada. Faça login novamente no Senior.',
  'Token expired': 'Token expirado. Recarregue a página do Senior.',
  'No token found': 'Token não encontrado. Abra o Senior primeiro.',
  'Invalid response': 'Resposta inválida da API. Tente novamente.',
};

export function getUserFriendlyError(error: Error | unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  
  for (const [key, friendly] of Object.entries(USER_FRIENDLY_ERRORS)) {
    if (message.includes(key)) {
      return friendly;
    }
  }
  
  return 'Erro inesperado. Tente novamente ou recarregue a extensão.';
}
```

**Checklist:**
- [ ] Criar mapeamento de erros técnicos → mensagens amigáveis
- [ ] Usar em hooks que exibem toasts
- [ ] Adicionar traduções para erros comuns

---

### Passo 3.3: Adicionar Painel de Debug (Opcional)
**Arquivo:** `lib/presentation/components/DebugPanel.tsx`

```typescript
import { useState, useEffect } from 'react';
import { errorLogger } from '../../domain/error-logger';

export function DebugPanel() {
  const [errors, setErrors] = useState<unknown[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      errorLogger.getRecentErrors().then(setErrors);
    }
  }, [open]);

  if (!open) {
    return (
      <button className="debug-toggle" onClick={() => setOpen(true)}>
        🐛 Debug
      </button>
    );
  }

  return (
    <div className="debug-panel">
      <div className="debug-header">
        <h3>🐛 Log de Erros</h3>
        <button onClick={() => setOpen(false)}>×</button>
      </div>
      <div className="debug-actions">
        <button onClick={() => errorLogger.clearErrors()}>Limpar</button>
        <button onClick={() => errorLogger.getRecentErrors().then(setErrors)}>Atualizar</button>
      </div>
      <div className="debug-log">
        {errors.length === 0 ? (
          <p>Nenhum erro registrado</p>
        ) : (
          errors.map((err, i) => (
            <pre key={i}>{JSON.stringify(err, null, 2)}</pre>
          ))
        )}
      </div>
    </div>
  );
}
```

**Checklist:**
- [ ] Criar painel de debug colapsável
- [ ] Exibir últimos 20 erros
- [ ] Adicionar botões "Limpar" e "Atualizar"
- [ ] Adicionar apenas em modo dev (build flag)

---

## Implementação — Fase 4: Telemetria (Opcional, Backlog)

### Passo 4.1: Adicionar Telemetria Anônima
**Arquivo:** `lib/infrastructure/telemetry.ts`

```typescript
interface TelemetryEvent {
  type: 'error' | 'performance' | 'usage';
  category: string;
  action: string;
  metadata?: Record<string, unknown>;
}

class Telemetry {
  private enabled = false;

  async init(): Promise<void> {
    const { telemetryEnabled } = await chrome.storage.local.get('telemetryEnabled');
    this.enabled = telemetryEnabled ?? false;
  }

  track(event: TelemetryEvent): void {
    if (!this.enabled) return;

    // Enviar para endpoint de telemetria (ex: Sentry, LogRocket)
    // Implementação futura
  }
}

export const telemetry = new Telemetry();
```

**Checklist:**
- [ ] Criar infraestrutura de telemetria
- [ ] Adicionar opt-in/opt-out nas configurações
- [ ] Integrar com `errorLogger`
- [ ] Documentar política de privacidade

---

## Testes

### Testes Unitários
- [ ] `error-logger.test.ts` — Logging, categorização, persistência
- [ ] `ErrorBoundary.test.tsx` — Captura de erros, fallback UI
- [ ] `error-messages.test.ts` — Mapeamento de mensagens

### Testes de Integração
- [ ] Forçar erro em provider → verificar log
- [ ] Forçar erro em React → verificar ErrorBoundary
- [ ] Verificar persistência de erros no storage

### Testes E2E
- [ ] Simular falha de rede → verificar toast de erro
- [ ] Simular token expirado → verificar mensagem amigável
- [ ] Verificar que erros não crasham a extensão

---

## Critérios de Aceitação

### Fase 1
- [ ] Zero `catch (_) {}` silenciosos no projeto
- [ ] Todos os erros logados com contexto
- [ ] Últimos 50 erros persistidos no storage
- [ ] Notificações apenas para erros críticos

### Fase 2
- [ ] ErrorBoundary implementado
- [ ] Popup e SidePanel protegidos
- [ ] Fallback UI amigável
- [ ] Erros de renderização não crasham extensão

### Fase 3
- [ ] Toast de erro implementado
- [ ] Mensagens amigáveis para erros comuns
- [ ] Painel de debug (opcional, dev mode)

### Fase 4 (Opcional)
- [ ] Telemetria implementada
- [ ] Opt-in/opt-out nas configurações
- [ ] Política de privacidade atualizada

---

## Métricas de Sucesso

| Métrica | Antes | Depois |
|---------|-------|--------|
| `catch (_) {}` silenciosos | ~15 | 0 |
| Erros logados | ~30% | 100% |
| Erros com contexto | ~20% | 100% |
| Crashes de UI | Possível | Impossível (ErrorBoundary) |
| Tempo médio de debug | ~2h | ~15min |

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Overhead de logging | Baixa | Baixo | Limitar a 100 erros/sessão |
| Storage cheio | Baixa | Baixo | Manter apenas últimos 50 erros |
| Notificações excessivas | Média | Médio | Apenas erros críticos |
| Performance degradada | Baixa | Baixo | Logging assíncrono |

---

## Notas de Implementação

- Começar por arquivos críticos (providers, background)
- Testar em Chrome + Firefox
- Documentar categorias de erro no README
- Considerar adicionar Sentry/LogRocket no futuro
- Manter logs anônimos (sem PII)
