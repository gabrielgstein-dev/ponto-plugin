# Roadmap: Melhorias Críticas — Análise 2026-03

## Contexto

Análise crítica rigorosa do projeto identificou **4 problemas críticos** e **6 pontos de alta prioridade** que impactam estabilidade, performance e manutenibilidade.

**Score Atual: 7.5/10**
- Arquitetura: 8/10
- Implementação: 7/10
- Testes: 8/10
- Performance: 6/10
- Manutenibilidade: 7/10

## Roadmaps de Implementação

Este documento é o índice principal. Cada categoria tem seu roadmap detalhado:

| Roadmap | Prioridade | Complexidade | Impacto | Status |
|---------|-----------|--------------|---------|--------|
| [Refatoração de Estado](roadmap-refatoracao-estado.md) | 🔥 CRÍTICO | Alta | Muito Alto | 📋 Planejado |
| [Tratamento de Erros](roadmap-tratamento-erros.md) | 🔥 CRÍTICO | Média | Alto | 📋 Planejado |
| [Otimização de Performance](roadmap-otimizacao-performance.md) | ⚠️ ALTO | Média | Alto | 📋 Planejado |

---

## 🔥 Problemas Críticos Identificados

### 1. Estado Global Mutável Singleton
**Arquivo:** `lib/application/state.ts:4-6`

```typescript
export const state: PunchState = { ...DEFAULT_STATE };
export const settings: Settings = { ...DEFAULT_SETTINGS };
export let notifScheduled: Record<string, boolean> = {};
```

**Riscos:**
- Race conditions entre popup, sidepanel e background
- Mutações não sincronizadas com `chrome.storage.local`
- Estado vazado entre testes unitários
- Viola princípio de imutabilidade

**Impacto:** MUITO ALTO — pode causar inconsistências de estado em produção

**Roadmap:** [Refatoração de Estado](roadmap-refatoracao-estado.md)

---

### 2. Gestão de Cache Fragmentada

Múltiplos caches privados sem estratégia unificada:
- `_cachedTimes` em `senior-api-provider.ts`
- `_cachedEndpoint` em `senior-api-provider.ts`
- `_pendingPunches` em `detect-punches.ts`
- Cache em cada provider (GP, Senior Storage, etc.)

**Problemas:**
- Sem estratégia unificada de invalidação
- TTLs inconsistentes (30s, 2min, 60min)
- Difícil debug de cache stale

**Impacto:** ALTO — afeta confiabilidade da detecção

**Roadmap:** [Otimização de Performance](roadmap-otimizacao-performance.md) — Fase 1

---

### 3. Acoplamento Temporal — Background Polling

```typescript
chrome.alarms.create('bgDetect', { periodInMinutes: 10 });
```

**Problemas:**
- Polling a cada 10min mesmo sem atividade
- Desperdício de recursos (bateria, CPU)
- Latência de até 10min para detectar mudanças

**Impacto:** MÉDIO — afeta UX e performance

**Roadmap:** [Otimização de Performance](roadmap-otimizacao-performance.md) — Fase 2

---

### 4. Falta de Tratamento de Erros Estruturado

Múltiplos `catch (_) {}` silenciosos:
- `detect-punches.ts:20,33`
- `senior-api-provider.ts:102,125`
- `interceptor.content.ts:64`

**Problemas:**
- Erros engolidos sem logging
- Impossível debugar em produção
- Falhas silenciosas confundem usuários

**Impacto:** ALTO — dificulta manutenção

**Roadmap:** [Tratamento de Erros](roadmap-tratamento-erros.md)

---

## ⚠️ Pontos de Alta Prioridade

### 5. Heurística de `applyTimes` Frágil
**Arquivo:** `lib/application/apply-punches.ts:61-87`

Assume que gap ≥30min = almoço. Falha em:
- Pausas curtas (café, reunião)
- Jornadas com múltiplos intervalos
- Batimentos manuais incorretos

**Solução:** Adicionar validação de contexto (horário típico, duração mínima configurável)

**Roadmap:** [Refatoração de Estado](roadmap-refatoracao-estado.md) — Fase 3

---

### 6. Tentativa Exaustiva de Endpoints
**Arquivo:** `lib/infrastructure/senior/senior-api-provider.ts:78-92`

11 endpoints tentados sequencialmente → latência de até 5-10s

**Solução:** Persistir `_cachedEndpoint` em `chrome.storage.local` com TTL de 24h

**Roadmap:** [Otimização de Performance](roadmap-otimizacao-performance.md) — Fase 1

---

### 7. Registro de Ponto sem Backoff
**Arquivo:** `lib/infrastructure/senior/senior-registrar.ts:80-90`

3 tentativas síncronas sem delay → pode sobrecarregar API

**Solução:** Exponential backoff (100ms, 500ms, 2s)

**Roadmap:** [Otimização de Performance](roadmap-otimizacao-performance.md) — Fase 3

---

### 8. Sincronização Manual no React
**Arquivo:** `lib/presentation/hooks/usePunchState.ts:29-32`

```typescript
const refresh = useCallback(() => {
  calcHorarios();
  setPunchState({ ...state });
}, []);
```

Depende de chamadas manuais a `refresh()` — fácil esquecer

**Solução:** `chrome.storage.onChanged` listener + React Context para auto-sync

**Roadmap:** [Refatoração de Estado](roadmap-refatoracao-estado.md) — Fase 2

---

### 9. Lógica de Negócio no Componente
**Arquivo:** `lib/presentation/App.tsx:107-126`

Funções `calcWorkedMinutes`, `getStatusText` dentro do componente

**Solução:** Mover para `lib/application/calc-schedule.ts`

**Roadmap:** [Refatoração de Estado](roadmap-refatoracao-estado.md) — Fase 3

---

### 10. Falta de Loading States Granulares

Apenas `loading` global, sem indicadores para:
- Detecção em andamento
- Registro de ponto processando
- Sincronização de banco de horas

**UX Impact:** Usuário não sabe se ação está processando ou travou

**Roadmap:** [Refatoração de Estado](roadmap-refatoracao-estado.md) — Fase 2

---

## 💡 Melhorias Futuras (Backlog)

### 11. Validação de Tokens JWT
Tokens capturados não são validados (formato, expiração)

**Risco:** Tokens inválidos salvos → falhas silenciosas

**Solução:**
```typescript
function isValidJWT(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp * 1000 > Date.now();
  } catch { return false; }
}
```

---

### 12. Telemetria de Falhas
Rastrear falhas de providers, latência de detecção, taxa de sucesso de registro

**Benefício:** Identificar problemas em produção proativamente

---

### 13. Expansão de Cobertura de Testes

Gaps identificados:
- Race conditions (múltiplas detecções simultâneas)
- Migração de estado (versões antigas do storage)
- Edge cases: timezone, virada de dia, batimentos fora de ordem

---

## 📊 Priorização Sugerida

### Sprint 1 (1-2 semanas) — CRÍTICO
- ✅ Roadmap de Refatoração de Estado — Fase 1
- ✅ Roadmap de Tratamento de Erros — Completo

**Entregável:** Estado gerenciado corretamente + erros logados

---

### Sprint 2 (1-2 semanas) — ALTO
- ✅ Roadmap de Refatoração de Estado — Fase 2
- ✅ Roadmap de Otimização de Performance — Fase 1

**Entregável:** Auto-sync funcionando + cache unificado

---

### Sprint 3 (1 semana) — MÉDIO
- ✅ Roadmap de Otimização de Performance — Fase 2 e 3
- ✅ Roadmap de Refatoração de Estado — Fase 3

**Entregável:** Event-driven architecture + lógica de negócio refatorada

---

### Backlog (Futuro)
- Validação de tokens JWT
- Telemetria
- Expansão de testes

---

## 🎯 Métricas de Sucesso

Após implementação completa:

| Métrica | Atual | Meta |
|---------|-------|------|
| Score Geral | 7.5/10 | 9.0/10 |
| Arquitetura | 8/10 | 9/10 |
| Implementação | 7/10 | 9/10 |
| Testes | 8/10 | 9/10 |
| Performance | 6/10 | 8/10 |
| Manutenibilidade | 7/10 | 9/10 |

**KPIs Técnicos:**
- ✅ Zero race conditions de estado
- ✅ 100% de erros logados (zero `catch (_) {}`)
- ✅ Latência de detecção < 2s (vs 5-10s atual)
- ✅ Polling reduzido de 10min para event-driven
- ✅ Cobertura de testes > 85%

---

## 📝 Notas de Implementação

- Cada roadmap tem checklist detalhado
- Testes devem ser escritos ANTES de refatorar
- Commits atômicos por fase
- Code review obrigatório para mudanças críticas
- Documentar breaking changes no CHANGELOG
