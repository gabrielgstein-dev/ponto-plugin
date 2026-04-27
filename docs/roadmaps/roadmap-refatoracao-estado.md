# Roadmap: Refatoração de Estado Global

## Contexto

O projeto atualmente usa **estado global mutável singleton** (`lib/application/state.ts`) compartilhado entre todos os contextos (popup, sidepanel, background, content scripts). Isso causa:

- Race conditions entre popup e background
- Mutações não sincronizadas com `chrome.storage.local`
- Estado vazado entre testes unitários
- Viola princípio de imutabilidade

**Prioridade:** 🔥 CRÍTICO  
**Complexidade:** Alta  
**Impacto:** Muito Alto  
**Tempo Estimado:** 1-2 semanas

---

## Objetivo

Refatorar gestão de estado para:
1. **Single source of truth:** `chrome.storage.local`
2. **Contextos isolados:** Popup/SidePanel com estado React local
3. **Background:** Estado próprio sincronizado via storage
4. **Auto-sync:** `chrome.storage.onChanged` para reatividade

---

## Implementação — Fase 1: Fundação (3-4 dias)

### Passo 1.1: Criar Context API para UI
**Arquivo:** `lib/presentation/contexts/PunchStateContext.tsx`

```typescript
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { PunchState, Settings } from '../../domain/types';
import { DEFAULT_STATE, DEFAULT_SETTINGS } from '../../domain/types';
import { ChromeStateRepository } from '../../infrastructure/chrome-storage';

interface PunchStateContextValue {
  state: PunchState;
  settings: Settings;
  loading: boolean;
  updateState: (partial: Partial<PunchState>) => Promise<void>;
  updateSettings: (partial: Partial<Settings>) => Promise<void>;
  clearState: () => Promise<void>;
}

const PunchStateContext = createContext<PunchStateContextValue | null>(null);

export function PunchStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PunchState>(DEFAULT_STATE);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const repo = new ChromeStateRepository();

  useEffect(() => {
    repo.loadState().then(({ state: s, settings: st }) => {
      setState(s);
      setSettings(st);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area !== 'local') return;
      if (changes.pontoState?.newValue) {
        setState(changes.pontoState.newValue);
      }
      if (changes.pontoSettings?.newValue) {
        setSettings(changes.pontoSettings.newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const updateState = useCallback(async (partial: Partial<PunchState>) => {
    const newState = { ...state, ...partial };
    await repo.saveState(newState);
    setState(newState);
  }, [state]);

  const updateSettings = useCallback(async (partial: Partial<Settings>) => {
    const newSettings = { ...settings, ...partial };
    await repo.saveSettings(newSettings);
    setSettings(newSettings);
  }, [settings]);

  const clearState = useCallback(async () => {
    await repo.saveState(DEFAULT_STATE);
    setState(DEFAULT_STATE);
  }, []);

  return (
    <PunchStateContext.Provider value={{ state, settings, loading, updateState, updateSettings, clearState }}>
      {children}
    </PunchStateContext.Provider>
  );
}

export function usePunchStateContext() {
  const ctx = useContext(PunchStateContext);
  if (!ctx) throw new Error('usePunchStateContext must be used within PunchStateProvider');
  return ctx;
}
```

**Checklist:**
- [ ] Criar arquivo `PunchStateContext.tsx`
- [ ] Implementar Provider com auto-sync via `storage.onChanged`
- [ ] Implementar hook `usePunchStateContext`
- [ ] Adicionar testes unitários para Context

---

### Passo 1.2: Refatorar `usePunchState` para usar Context
**Arquivo:** `lib/presentation/hooks/usePunchState.ts`

```typescript
import { useCallback } from 'react';
import { usePunchStateContext } from '../contexts/PunchStateContext';
import { calcHorarios } from '../../application/calc-schedule';

export function usePunchState() {
  const { state, settings, loading, updateState, updateSettings, clearState } = usePunchStateContext();

  const refresh = useCallback(() => {
    const calculated = calcHorarios(state, settings);
    updateState(calculated);
  }, [state, settings, updateState]);

  const saveCurrentState = useCallback(() => {
    // Já salvo automaticamente pelo Context
  }, []);

  return {
    punchState: state,
    settings,
    loading,
    refresh,
    updateSettings,
    saveCurrentState,
    clearState,
  };
}
```

**Checklist:**
- [ ] Refatorar hook para usar Context
- [ ] Remover dependência de singleton `state`
- [ ] Atualizar testes de `usePunchState`

---

### Passo 1.3: Refatorar `calcHorarios` para Pure Function
**Arquivo:** `lib/application/calc-schedule.ts`

```typescript
import { timeToMinutes, minutesToTime } from '../domain/time-utils';
import type { PunchState, Settings } from '../domain/types';

export function calcHorarios(state: PunchState, settings: Settings): PunchState {
  const newState = { ...state };
  newState._almocoSugerido = null;
  newState._voltaSugerida = null;
  newState._saidaEstimada = null;

  const entMin = timeToMinutes(state.entrada);
  if (entMin == null) return newState;

  const almocoHorarioMin = timeToMinutes(settings.almocoHorario) || 720;

  if (!state.almoco) {
    newState._almocoSugerido = minutesToTime(almocoHorarioMin);
  }

  if (!state.volta && !state.almoco) {
    newState._saidaEstimada = minutesToTime(entMin + settings.jornada + settings.almocoDur);
  }

  if (state.volta) {
    Object.assign(newState, calcWithVolta(state, settings, entMin));
  } else if (state.almoco) {
    Object.assign(newState, calcWithAlmoco(state, settings, entMin));
  }

  return newState;
}

function calcWithVolta(state: PunchState, settings: Settings, entMin: number): Partial<PunchState> {
  const voltaMin = timeToMinutes(state.volta)!;
  const almocoMin = state.almoco ? timeToMinutes(state.almoco) : null;
  const horasAntesAlmoco = almocoMin ? almocoMin - entMin : 0;
  const actualLunch = almocoMin ? voltaMin - almocoMin : 0;
  const lunchDeficit = Math.max(0, settings.almocoDur - actualLunch);
  const horasRestantes = settings.jornada - horasAntesAlmoco;
  const saidaMin = voltaMin + horasRestantes + lunchDeficit;

  return state.saida ? {} : { _saidaEstimada: minutesToTime(saidaMin) };
}

function calcWithAlmoco(state: PunchState, settings: Settings, entMin: number): Partial<PunchState> {
  const almocoMin = timeToMinutes(state.almoco)!;
  const horasAntesAlmoco = almocoMin - entMin;
  const horasRestantes = settings.jornada - horasAntesAlmoco;
  return {
    _voltaSugerida: minutesToTime(almocoMin + settings.almocoDur),
    _saidaEstimada: minutesToTime(almocoMin + settings.almocoDur + horasRestantes),
  };
}
```

**Checklist:**
- [ ] Transformar `calcHorarios` em pure function (recebe state, retorna novo state)
- [ ] Remover mutações diretas do singleton `state`
- [ ] Atualizar testes unitários
- [ ] Atualizar todos os call sites

---

### Passo 1.4: Wrappear App com Provider
**Arquivo:** `lib/presentation/App.tsx`

```typescript
import { PunchStateProvider } from './contexts/PunchStateContext';

export function App() {
  return (
    <PunchStateProvider>
      <AppContent />
    </PunchStateProvider>
  );
}

function AppContent() {
  // Código atual do App
}
```

**Checklist:**
- [ ] Wrappear `<App>` com `<PunchStateProvider>`
- [ ] Fazer o mesmo para `<SidePanelApp>`
- [ ] Testar popup e sidepanel isoladamente

---

## Implementação — Fase 2: Background Isolado (2-3 dias)

### Passo 2.1: Criar Background State Manager
**Arquivo:** `lib/application/background-state-manager.ts`

```typescript
import type { PunchState, Settings } from '../domain/types';
import { DEFAULT_STATE, DEFAULT_SETTINGS } from '../domain/types';
import { ChromeStateRepository } from '../infrastructure/chrome-storage';

class BackgroundStateManager {
  private state: PunchState = DEFAULT_STATE;
  private settings: Settings = DEFAULT_SETTINGS;
  private repo = new ChromeStateRepository();

  async init(): Promise<void> {
    const { state, settings } = await this.repo.loadState();
    this.state = state;
    this.settings = settings;
  }

  getState(): PunchState {
    return { ...this.state };
  }

  getSettings(): Settings {
    return { ...this.settings };
  }

  async updateState(partial: Partial<PunchState>): Promise<void> {
    this.state = { ...this.state, ...partial };
    await this.repo.saveState(this.state);
  }

  async updateSettings(partial: Partial<Settings>): Promise<void> {
    this.settings = { ...this.settings, ...partial };
    await this.repo.saveSettings(this.settings);
  }

  async resetState(): Promise<void> {
    this.state = { ...DEFAULT_STATE };
    await this.repo.saveState(this.state);
  }
}

export const backgroundState = new BackgroundStateManager();
```

**Checklist:**
- [ ] Criar `BackgroundStateManager` isolado
- [ ] Inicializar no `background.ts` startup
- [ ] Migrar todas as referências de `state` singleton para `backgroundState`

---

### Passo 2.2: Refatorar `background.ts`
**Arquivo:** `entrypoints/background.ts`

```typescript
import { backgroundState } from '../lib/application/background-state-manager';

export default defineBackground(() => {
  backgroundState.init().then(() => {
    // Setup listeners, alarms, etc.
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.pontoState) {
      // Background reage a mudanças externas (popup/sidepanel)
      const newState = changes.pontoState.newValue;
      // Lógica de reação (ex: resolver reminders)
    }
  });
});
```

**Checklist:**
- [ ] Inicializar `backgroundState` no startup
- [ ] Migrar todas as referências de `state` para `backgroundState.getState()`
- [ ] Usar `backgroundState.updateState()` para mutações
- [ ] Testar sincronização bidirecional (popup ↔ background)

---

### Passo 2.3: Remover Singleton `state.ts`
**Arquivo:** `lib/application/state.ts` (DELETAR)

```typescript
// ARQUIVO SERÁ DELETADO APÓS MIGRAÇÃO COMPLETA
```

**Checklist:**
- [ ] Verificar que nenhum arquivo importa `state` ou `settings` de `state.ts`
- [ ] Deletar arquivo `state.ts`
- [ ] Atualizar imports em todos os arquivos

---

## Implementação — Fase 3: Limpeza e Otimizações (1-2 dias)

### Passo 3.1: Mover Lógica de Negócio para Application Layer
**Arquivos:** `lib/presentation/App.tsx` → `lib/application/calc-status.ts`

```typescript
// lib/application/calc-status.ts
import type { PunchState } from '../domain/types';
import { timeToMinutes, getNowMinutes } from '../domain/time-utils';

export function calcWorkedMinutes(state: PunchState, nowMin: number): number {
  const entMin = timeToMinutes(state.entrada);
  if (entMin == null) return 0;
  
  const now = new Date();
  const entradaDate = state._entradaTimestamp ? new Date(state._entradaTimestamp) : null;
  
  if (entradaDate && now.getDate() !== entradaDate.getDate() && !state.saida) {
    return 0;
  }
  
  const almocoMin = timeToMinutes(state.almoco);
  const voltaMin = timeToMinutes(state.volta);
  const saidaMin = timeToMinutes(state.saida);
  const endMin = saidaMin ?? nowMin;
  let worked = endMin - entMin;
  if (almocoMin && voltaMin) worked -= (voltaMin - almocoMin);
  else if (almocoMin && !voltaMin) worked -= (endMin - almocoMin);
  return Math.max(0, worked);
}

export function getStatusText(state: PunchState, detecting: boolean): string {
  if (detecting) return '';
  if (state.saida) return 'Jornada concluída!';
  if (state.volta) return 'Aguardando saída';
  if (state.almoco) return 'Em almoço';
  if (state.entrada) return 'Aguardando almoço';
  return 'Aguardando entrada';
}
```

**Checklist:**
- [ ] Criar `calc-status.ts` com funções puras
- [ ] Mover `calcWorkedMinutes` de `App.tsx`
- [ ] Mover `getStatusText` de `App.tsx`
- [ ] Atualizar imports em `App.tsx`
- [ ] Adicionar testes unitários

---

### Passo 3.2: Adicionar Loading States Granulares
**Arquivo:** `lib/presentation/contexts/PunchStateContext.tsx`

```typescript
interface PunchStateContextValue {
  state: PunchState;
  settings: Settings;
  loading: boolean;
  detecting: boolean;
  punching: boolean;
  syncing: boolean;
  // ...
}
```

**Checklist:**
- [ ] Adicionar flags `detecting`, `punching`, `syncing` ao Context
- [ ] Atualizar componentes para usar loading states específicos
- [ ] Adicionar spinners/skeletons apropriados

---

### Passo 3.3: Melhorar Heurística de `applyTimes`
**Arquivo:** `lib/application/apply-punches.ts`

```typescript
function assignLunchAndExit(past: string[], settings: Settings): void {
  if (past.length < 2) return;

  const entradaMin = timeToMinutes(past[0])!;
  const LUNCH_WINDOW_START = timeToMinutes(settings.almocoHorario) || 720;
  const LUNCH_WINDOW_END = LUNCH_WINDOW_START + 120; // 2h window

  for (let i = 1; i < past.length - 1; i++) {
    const tMin = timeToMinutes(past[i])!;
    const tNextMin = timeToMinutes(past[i + 1])!;
    const gap = tNextMin - tMin;
    const workBefore = tMin - entradaMin;
    const isInLunchWindow = tMin >= LUNCH_WINDOW_START && tMin <= LUNCH_WINDOW_END;

    if (workBefore >= 120 && gap >= Math.min(settings.almocoDur, 30) && isInLunchWindow) {
      state.almoco = past[i];
      state.volta = past[i + 1];
      if (i + 2 < past.length) state.saida = past[past.length - 1];
      return;
    }
  }

  // Fallback: último punch como almoço se dentro da janela
  const lastPunch = past[past.length - 1];
  const lastMin = timeToMinutes(lastPunch)!;
  const totalSpan = lastMin - entradaMin;

  if (totalSpan >= 120 && totalSpan < settings.jornada + settings.almocoDur) {
    state.almoco = lastPunch;
  }
}
```

**Checklist:**
- [ ] Adicionar validação de janela de almoço (11h-14h típico)
- [ ] Considerar `settings.almocoHorario` como centro da janela
- [ ] Adicionar testes para edge cases (pausas curtas, múltiplos intervalos)

---

## Testes

### Testes Unitários Novos
- [ ] `PunchStateContext.test.tsx` — Provider, auto-sync, listeners
- [ ] `calc-status.test.ts` — `calcWorkedMinutes`, `getStatusText`
- [ ] `background-state-manager.test.ts` — Isolamento, sincronização

### Testes de Integração
- [ ] Popup atualiza quando background muda estado
- [ ] Background reage a mudanças do popup
- [ ] SidePanel sincroniza com popup

### Testes E2E (Playwright)
- [ ] Abrir popup → detectar → verificar estado
- [ ] Bater ponto no popup → verificar sincronização no background
- [ ] Abrir sidepanel → verificar histórico atualizado

---

## Critérios de Aceitação

### Fase 1
- [ ] Context API implementado e testado
- [ ] `calcHorarios` é pure function
- [ ] Popup e SidePanel usam Context
- [ ] Zero referências ao singleton `state` no UI

### Fase 2
- [ ] Background tem estado isolado
- [ ] Sincronização bidirecional funciona
- [ ] Singleton `state.ts` deletado
- [ ] Todos os testes passando

### Fase 3
- [ ] Lógica de negócio fora de componentes
- [ ] Loading states granulares implementados
- [ ] Heurística de `applyTimes` melhorada
- [ ] Cobertura de testes > 85%

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Race conditions durante migração | Média | Alto | Migrar por contexto (UI → Background → Cleanup) |
| Testes quebrados | Alta | Médio | Atualizar testes incrementalmente por fase |
| Regressões em produção | Baixa | Muito Alto | Feature flag + rollback plan |
| Performance degradada | Baixa | Médio | Benchmarks antes/depois |

---

## Rollback Plan

Se houver problemas críticos:
1. Reverter commits da fase atual
2. Manter singleton `state.ts` temporariamente
3. Criar issue detalhado com logs
4. Planejar fix incremental

---

## Notas de Implementação

- Commits atômicos por passo (ex: "feat: add PunchStateContext")
- Code review obrigatório para cada fase
- Testar em Chrome + Firefox antes de merge
- Documentar breaking changes no CHANGELOG
- Atualizar `.windsurf/rules/` se necessário
