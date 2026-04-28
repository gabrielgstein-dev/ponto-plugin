# Roadmap: Otimização de Performance

## Contexto

O projeto possui problemas de performance que afetam UX e consomem recursos desnecessariamente:

1. **Polling a cada 10min** mesmo sem atividade
2. **11 endpoints tentados sequencialmente** → latência de 5-10s
3. **Cache fragmentado** sem estratégia unificada
4. **Registro de ponto sem backoff** → pode sobrecarregar API

**Prioridade:** ⚠️ ALTO  
**Complexidade:** Média  
**Impacto:** Alto  
**Tempo Estimado:** 1 semana

---

## Objetivo

Otimizar performance para:
1. **Reduzir latência de detecção** de 5-10s para <2s
2. **Eliminar polling desnecessário** → event-driven architecture
3. **Unificar gestão de cache** → invalidação consistente
4. **Adicionar backoff em retries** → respeitar rate limits

---

## Implementação — Fase 1: Cache Unificado (2-3 dias)

### Passo 1.1: Criar Cache Manager Centralizado
**Arquivo:** `lib/infrastructure/cache-manager.ts`

```typescript
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

interface CacheConfig {
  defaultTTL: number;
  maxEntries: number;
  persistToStorage: boolean;
}

export class CacheManager {
  private cache = new Map<string, CacheEntry<unknown>>();
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      defaultTTL: 30000,
      maxEntries: 100,
      persistToStorage: false,
      ...config,
    };

    if (this.config.persistToStorage) {
      this.loadFromStorage();
    }
  }

  set<T>(key: string, value: T, ttl?: number): void {
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl ?? this.config.defaultTTL,
    });

    if (this.config.persistToStorage) {
      this.saveToStorage();
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
    if (this.config.persistToStorage) {
      this.saveToStorage();
    }
  }

  invalidatePattern(pattern: RegExp): void {
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
      }
    }
    if (this.config.persistToStorage) {
      this.saveToStorage();
    }
  }

  clear(): void {
    this.cache.clear();
    if (this.config.persistToStorage) {
      chrome.storage.local.remove('cacheData');
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const data = await chrome.storage.local.get('cacheData');
      if (data.cacheData) {
        const entries = JSON.parse(data.cacheData) as Array<[string, CacheEntry<unknown>]>;
        this.cache = new Map(entries);
      }
    } catch (_) {
      // Ignore
    }
  }

  private saveToStorage(): void {
    try {
      const entries = Array.from(this.cache.entries());
      chrome.storage.local.set({ cacheData: JSON.stringify(entries) });
    } catch (_) {
      // Ignore
    }
  }
}

export const punchCache = new CacheManager({ defaultTTL: 30000, maxEntries: 50 });
export const tokenCache = new CacheManager({ defaultTTL: 3600000, maxEntries: 10 });
export const endpointCache = new CacheManager({ defaultTTL: 86400000, maxEntries: 5, persistToStorage: true });
```

**Checklist:**
- [ ] Criar `CacheManager` com TTL configurável
- [ ] Implementar eviction policy (LRU)
- [ ] Adicionar suporte a invalidação por pattern
- [ ] Persistir cache crítico em `chrome.storage.local`
- [ ] Adicionar testes unitários

---

### Passo 1.2: Migrar `SeniorApiPunchProvider` para Cache Unificado
**Arquivo:** `lib/infrastructure/senior/senior-api-provider.ts`

```typescript
// ANTES
let _cachedEndpoint: { url: string; method: string; body: string | null } | null = null;
let _cachedTimes: string[] | null = null;
let _cachedTimesTs = 0;
const CACHE_TTL_MS = 30000;

// DEPOIS
import { punchCache, endpointCache } from '../cache-manager';

export class SeniorApiPunchProvider implements IPunchProvider {
  readonly name = 'seniorApi';
  readonly priority = 3;

  async fetchPunches(date: Date): Promise<string[]> {
    const cacheKey = `senior-api-${date.toDateString()}`;
    const cached = punchCache.get<string[]>(cacheKey);
    if (cached) return cached;

    const tab = await findSeniorTab();
    if (!tab?.id) return [];

    const token = await this.resolveToken();
    if (!token) return [];

    const times = await this.fetchViaTab(tab.id, token, date);
    if (times.length > 0) {
      punchCache.set(cacheKey, times, 30000);
    }
    return times;
  }

  private async fetchViaTab(tabId: number, token: string, date: Date): Promise<string[]> {
    const cachedEndpoint = endpointCache.get<{ url: string; method: string; body: string }>('senior-endpoint');
    
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [token, cachedEndpoint, date],
      func: async (accessToken, cached, d) => {
        // ... (lógica existente, mas usa cached endpoint primeiro)
      },
    });

    const data = results?.[0]?.result;
    if (data?.text) {
      const json = JSON.parse(data.text);
      const times = extractTimesFromApiResponse(json);
      if (times.length > 0) {
        endpointCache.set('senior-endpoint', { url: data.url, method: data.method, body: data.body }, 86400000);
      }
      return times;
    }
    return [];
  }
}
```

**Checklist:**
- [ ] Remover variáveis privadas `_cached*`
- [ ] Usar `punchCache` para times (TTL 30s)
- [ ] Usar `endpointCache` para endpoint bem-sucedido (TTL 24h)
- [ ] Testar cache hit/miss

---

### Passo 1.3: Migrar `detect-punches.ts` para Cache Unificado
**Arquivo:** `lib/application/detect-punches.ts`

```typescript
// ANTES
let _pendingPunches: { time: string; ts: number }[] = [];

// DEPOIS
import { punchCache } from '../infrastructure/cache-manager';

export function addPendingPunch(time: string): void {
  const pending = punchCache.get<Array<{ time: string; ts: number }>>('pending-punches') || [];
  const now = Date.now();
  const filtered = pending.filter(p => now - p.ts < 120000);
  
  if (!filtered.some(p => p.time === time)) {
    filtered.push({ time, ts: now });
    punchCache.set('pending-punches', filtered, 120000);
  }
}

function getActivePendingPunches(): string[] {
  const pending = punchCache.get<Array<{ time: string; ts: number }>>('pending-punches') || [];
  const now = Date.now();
  const active = pending.filter(p => now - p.ts < 120000);
  return active.map(p => p.time);
}
```

**Checklist:**
- [ ] Remover variável privada `_pendingPunches`
- [ ] Usar `punchCache` para pending punches
- [ ] Atualizar testes

---

### Passo 1.4: Criar Funções de Invalidação Centralizadas
**Arquivo:** `lib/application/cache-invalidation.ts`

```typescript
import { punchCache, tokenCache, endpointCache } from '../infrastructure/cache-manager';

export function invalidateAllPunchCaches(): void {
  punchCache.clear();
  endpointCache.clear();
}

export function invalidatePunchCacheForDate(date: Date): void {
  punchCache.invalidatePattern(new RegExp(`-${date.toDateString()}$`));
}

export function invalidateTokenCaches(): void {
  tokenCache.clear();
}

export function invalidateOnPunchSuccess(): void {
  punchCache.clear();
}

export function invalidateOnDailyReset(): void {
  punchCache.clear();
}
```

**Checklist:**
- [ ] Criar funções de invalidação por contexto
- [ ] Usar em `background.ts` após punch success
- [ ] Usar em `handle-alarm.ts` no daily reset
- [ ] Documentar estratégia de invalidação

---

## Implementação — Fase 2: Event-Driven Architecture (2-3 dias)

### Passo 2.1: Remover Background Polling
**Arquivo:** `entrypoints/background.ts`

```typescript
// ANTES
chrome.alarms.create('bgDetect', { periodInMinutes: 10 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'bgDetect') { 
    backgroundDetect().catch(() => {}); 
    backgroundTimesheetSync().catch(() => {}); 
    return; 
  }
  // ...
});

// DEPOIS
// ❌ REMOVER polling de 10min
// ✅ Detectar apenas quando necessário
```

**Checklist:**
- [ ] Remover `chrome.alarms.create('bgDetect', ...)`
- [ ] Remover handler de `bgDetect` alarm
- [ ] Documentar mudança no CHANGELOG

---

### Passo 2.2: Detectar em Eventos Relevantes
**Arquivo:** `entrypoints/background.ts`

```typescript
// Detectar quando popup/sidepanel abre
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'POPUP_OPENED' || message.type === 'SIDEPANEL_OPENED') {
    backgroundDetect().then(() => sendResponse({ ok: true }));
    return true;
  }
  // ...
});

// Detectar quando token é capturado
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  
  if (changes.seniorToken && changes.seniorToken.newValue) {
    backgroundDetect().catch(() => {});
  }
  
  if (changes.punchSuccessTs) {
    invalidateOnPunchSuccess();
    setTimeout(() => backgroundDetect().catch(() => {}), 2000);
  }
});

// Detectar após daily reset
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyReset') {
    invalidateOnDailyReset();
    backgroundDetect().catch(() => {});
  }
});
```

**Checklist:**
- [ ] Adicionar mensagem `POPUP_OPENED` no popup
- [ ] Adicionar mensagem `SIDEPANEL_OPENED` no sidepanel
- [ ] Detectar após captura de token
- [ ] Detectar após punch success (com delay de 2s)
- [ ] Detectar após daily reset

---

### Passo 2.3: Adicionar Debounce para Múltiplas Detecções
**Arquivo:** `lib/application/background-detect.ts`

```typescript
let _detectDebounceTimer: number | null = null;

export async function backgroundDetect(): Promise<void> {
  if (_detectDebounceTimer) {
    clearTimeout(_detectDebounceTimer);
  }

  return new Promise((resolve) => {
    _detectDebounceTimer = setTimeout(async () => {
      _detectDebounceTimer = null;
      await performDetection();
      resolve();
    }, 2000) as unknown as number;
  });
}

async function performDetection(): Promise<void> {
  // Lógica existente de detecção
}
```

**Checklist:**
- [ ] Adicionar debounce de 2s para detecções
- [ ] Evitar múltiplas chamadas simultâneas
- [ ] Testar com múltiplos eventos rápidos

---

### Passo 2.4: Adicionar Mensagens de Lifecycle no Popup
**Arquivo:** `lib/presentation/App.tsx`

```typescript
import { useEffect } from 'react';

export function App() {
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'POPUP_OPENED' });
    
    return () => {
      chrome.runtime.sendMessage({ type: 'POPUP_CLOSED' });
    };
  }, []);

  // ...
}
```

**Checklist:**
- [ ] Enviar `POPUP_OPENED` no mount
- [ ] Enviar `POPUP_CLOSED` no unmount (opcional)
- [ ] Fazer o mesmo para `SidePanelApp`

---

## Implementação — Fase 3: Otimizações Adicionais (1-2 dias)

### Passo 3.1: Adicionar Exponential Backoff em `registerPunch`
**Arquivo:** `lib/infrastructure/senior/senior-registrar.ts`

```typescript
async function tryPunch(label: string, info: Record<string, unknown>, retryDelay = 0) {
  if (retryDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, retryDelay));
  }
  
  log(label);
  try {
    const r = await fetch(punchUrl, { method: 'POST', headers: H, body: JSON.stringify({ clockingInfo: info }) });
    const b = await r.text();
    log(`${label} → ${r.status}`);
    if (r.ok || r.status === 201 || r.status === 202) {
      return { success: true, logs, responseBody: b.substring(0, 500) };
    }
  } catch (e: unknown) { log(`Erro: ${(e as Error).message}`); }
  return null;
}

const attempts: Array<{ label: string; mutate: () => void; delay: number }> = [
  { label: 'Enviando ponto...', mutate: () => {}, delay: 0 },
  { label: 'Tentando com skipValidation=true...', mutate: () => { clockingInfo.skipValidation = true; }, delay: 100 },
  { label: 'Tentando sem signature...', mutate: () => { delete clockingInfo.signature; clockingInfo.skipValidation = false; }, delay: 500 },
];

for (const attempt of attempts) {
  attempt.mutate();
  const result = await tryPunch(attempt.label, clockingInfo, attempt.delay);
  if (result) return result;
}
```

**Checklist:**
- [ ] Adicionar delays entre tentativas (0ms, 100ms, 500ms)
- [ ] Implementar exponential backoff
- [ ] Testar com API lenta

---

### Passo 3.2: Otimizar `executeScript` com Cache de Resultados
**Arquivo:** `lib/infrastructure/senior/senior-api-provider.ts`

```typescript
private async fetchViaTab(tabId: number, token: string, date: Date): Promise<string[]> {
  const cacheKey = `senior-api-result-${date.toDateString()}`;
  const cached = punchCache.get<string[]>(cacheKey);
  if (cached) return cached;

  // Usar endpoint cacheado primeiro (1 request em vez de 11)
  const cachedEndpoint = endpointCache.get<{ url: string; method: string; body: string }>('senior-endpoint');
  
  if (cachedEndpoint) {
    const times = await this.tryEndpoint(tabId, token, cachedEndpoint, date);
    if (times.length > 0) {
      punchCache.set(cacheKey, times, 30000);
      return times;
    }
  }

  // Fallback: tentar todos os endpoints
  const times = await this.tryAllEndpoints(tabId, token, date);
  if (times.length > 0) {
    punchCache.set(cacheKey, times, 30000);
  }
  return times;
}
```

**Checklist:**
- [ ] Tentar endpoint cacheado primeiro
- [ ] Fallback para todos os endpoints apenas se falhar
- [ ] Reduzir latência de ~5s para ~500ms (quando cache hit)

---

### Passo 3.3: Adicionar Request Timeout
**Arquivo:** `lib/infrastructure/senior/senior-api-provider.ts`

```typescript
func: async (accessToken: string, cached: unknown, d: Date) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const r = await fetch(ep.url, { 
      ...opts, 
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    // ...
  } catch (e) {
    clearTimeout(timeoutId);
    if ((e as Error).name === 'AbortError') {
      // Timeout
      continue;
    }
    throw e;
  }
}
```

**Checklist:**
- [ ] Adicionar timeout de 5s por request
- [ ] Usar `AbortController` para cancelar
- [ ] Evitar travamentos em APIs lentas

---

### Passo 3.4: Adicionar Métricas de Performance
**Arquivo:** `lib/domain/performance-metrics.ts`

```typescript
interface PerformanceMetric {
  operation: string;
  duration: number;
  timestamp: number;
  success: boolean;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];

  startTimer(operation: string): () => void {
    const start = performance.now();
    return (success = true) => {
      const duration = performance.now() - start;
      this.metrics.push({ operation, duration, timestamp: Date.now(), success });
      this.trimMetrics();
    };
  }

  private trimMetrics(): void {
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }
  }

  getMetrics(operation?: string): PerformanceMetric[] {
    if (operation) {
      return this.metrics.filter(m => m.operation === operation);
    }
    return this.metrics;
  }

  getAverageDuration(operation: string): number {
    const filtered = this.metrics.filter(m => m.operation === operation && m.success);
    if (filtered.length === 0) return 0;
    const sum = filtered.reduce((acc, m) => acc + m.duration, 0);
    return sum / filtered.length;
  }
}

export const perfMonitor = new PerformanceMonitor();
```

**Uso:**
```typescript
const endTimer = perfMonitor.startTimer('detect-punches');
try {
  const result = await detector.detect(date);
  endTimer(true);
  return result;
} catch (e) {
  endTimer(false);
  throw e;
}
```

**Checklist:**
- [ ] Criar monitor de performance
- [ ] Adicionar timers em operações críticas (detect, register, fetch)
- [ ] Expor métricas no painel de debug
- [ ] Calcular médias de latência

---

## Testes

### Testes Unitários
- [ ] `cache-manager.test.ts` — TTL, eviction, invalidation
- [ ] `cache-invalidation.test.ts` — Estratégias de invalidação
- [ ] `performance-metrics.test.ts` — Timers, médias

### Testes de Integração
- [ ] Cache hit reduz latência de detecção
- [ ] Invalidação após punch success funciona
- [ ] Event-driven detection funciona sem polling

### Testes de Performance
- [ ] Benchmark: detecção com cache hit < 500ms
- [ ] Benchmark: detecção com cache miss < 2s
- [ ] Benchmark: registro de ponto < 1s

---

## Critérios de Aceitação

### Fase 1
- [ ] Cache unificado implementado
- [ ] Todos os providers usam `CacheManager`
- [ ] Endpoint bem-sucedido persistido por 24h
- [ ] Latência de detecção reduzida em 60%

### Fase 2
- [ ] Polling de 10min removido
- [ ] Detecção apenas em eventos relevantes
- [ ] Debounce de 2s implementado
- [ ] Zero detecções desnecessárias

### Fase 3
- [ ] Exponential backoff em registro
- [ ] Request timeout de 5s
- [ ] Métricas de performance coletadas
- [ ] Painel de debug exibe latências

---

## Métricas de Sucesso

| Métrica | Antes | Depois | Melhoria |
|---------|-------|--------|----------|
| Latência de detecção (cache hit) | 5-10s | <500ms | 90-95% |
| Latência de detecção (cache miss) | 5-10s | <2s | 60-80% |
| Detecções por hora (idle) | 6 | 0 | 100% |
| Requests API por detecção | 11 | 1-2 | 80-90% |
| Tempo de registro de ponto | 1-3s | <1s | 50-70% |

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Cache stale após mudanças externas | Média | Médio | Invalidar após eventos relevantes |
| Detecção não dispara quando deveria | Baixa | Alto | Testes E2E extensivos |
| Overhead de debounce | Baixa | Baixo | Delay de apenas 2s |
| Storage cheio com cache | Baixa | Baixo | Limitar a 50 entradas |

---

## Notas de Implementação

- Medir performance ANTES de otimizar (baseline)
- Usar `performance.now()` para timers precisos
- Testar em Chrome + Firefox
- Documentar estratégia de cache no README
- Considerar adicionar cache warming no startup
