---
trigger: glob
globs: ["**/*.tsx", "**/*.ts", "!**/entrypoints/interceptor.content.ts", "!**/entrypoints/widget.content.ts"]
---

# Gerenciamento de Estado — Senior Ponto

## Arquitetura de Estado
Sem biblioteca de estado (sem Redux, Zustand, Jotai). O projeto usa um **módulo singleton mutável** (`lib/application/state.ts`) como store central.

## Estado Global (`application/state.ts`)
- `state: PunchState` — objeto mutável com slots: `entrada`, `almoco`, `volta`, `saida` + campos calculados `_almocoSugerido`, `_voltaSugerida`, `_saidaEstimada`
- `settings: Settings` — jornada, almocoHorario, almocoDur, notifAntecip, lembreteAtraso, closingDay
- `notifScheduled: Record<string, boolean>` — controle de notificações já agendadas
- Mutação via `applyPartialState()`, `applySettings()`, `resetState()` — `Object.assign` direto

## Persistência
- `IStateRepository` implementado por `ChromeStateRepository`
- Armazena em `chrome.storage.local` com chaves: `pontoState`, `pontoSettings`, `pontoDate`
- Reset automático diário: se `pontoDate !== today`, limpa o state
- Settings persistem entre dias

## Reatividade (React)
- Hooks leem do singleton e forçam re-render com `useState` + spread: `setPunchState({ ...state })`
- `refresh()` callback recalcula horários (`calcHorarios()`) e atualiza o React state
- **Fluxo**: use case muta singleton → `saveState()` → `refresh()` → React re-renderiza

## Hooks Existentes
| Hook | Responsabilidade |
|---|---|
| `usePunchState` | Carrega/salva estado e settings, provê refresh e clear |
| `useAutoDetect` | Polling (15s) + detecção inicial agressiva, aplica batimentos |
| `usePunchAction` | Registra ponto via API Senior (auth chain + registrar) |
| `useManualPunch` | Registra ponto manual (modo sem Senior) |
| `useClock` | Relógio atualizado a cada segundo |
| `useCountdown` | Countdown até próximo evento |
| `useYesterdayPunches` | Busca batimentos do dia anterior |
| `useHourBank` | Calcula e gerencia banco de horas |
| `useSidePanelData` | Dados completos do side panel (histórico, navegação de períodos) |

## Comunicação entre Contextos
- **Content scripts → Popup/SidePanel**: via `chrome.storage.local` (tokens, assertions)
- **Background → UI**: via `chrome.storage.onChanged` listener
- **Interceptor → Content script**: via `CustomEvent` (`__sponto_bearer`, `__sponto_gestao_ponto`, `__sponto_punch_success`)
- **UI → Background**: via `chrome.runtime.sendMessage` (`OPEN_SIDE_PANEL`, `SHOW_NOTIFICATION`)

## Regras
- Nunca ler `state` diretamente em componentes — sempre via hook `usePunchState`
- Mutações no singleton DEVEM ser seguidas de `refresh()` para atualizar React
- `calcHorarios()` deve ser chamado após qualquer mudança em `state` ou `settings`
