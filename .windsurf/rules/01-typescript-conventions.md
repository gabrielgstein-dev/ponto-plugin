---
trigger: always_on
---

# Convenções TypeScript — Senior Ponto

## Versão e Configuração
- TypeScript ^5.7 com config herdada do WXT (`.wxt/tsconfig.json`)
- WXT provê tipos globais automáticos (`defineBackground`, `defineContentScript`, etc.)
- Sem strict mode explícito (herda do WXT)

## Padrões de Tipagem
- **Interfaces** para contratos: prefixo `I` para interfaces de domínio (`IAuthProvider`, `IPunchProvider`, `IPunchRegistrar`, `IStateRepository`, `IHourBankProvider`, `IPunchDetector`)
- **Interfaces** sem prefixo para Props de componentes (`PunchCardProps`, `SettingsPanelProps`, `DayRowProps`)
- **Types** para unions e utilitários (`PunchSlot`, `PunchDetectionResult`)
- **`Record<string, T>`** para maps dinâmicos (labels, icons, headers)
- Casts explícitos com `as` quando necessário (ex: `(e as Error).message`, `(this as XHRWithMeta)`)
- Nullability: `string | null` para valores opcionais, com `??` para fallback

## Nomenclatura Real
- **Arquivos**: kebab-case (`calc-schedule.ts`, `senior-cookie-auth.ts`, `gp-provider.ts`)
- **Classes**: PascalCase (`PunchDetector`, `GpPunchProvider`, `ChromeStateRepository`)
- **Funções/hooks**: camelCase (`calcHorarios`, `useAutoDetect`, `usePunchState`)
- **Constantes**: SCREAMING_SNAKE (`PUNCH_SLOTS`, `DEFAULT_STATE`, `GP_API_BASE`, `TOKEN_MAX_AGE_MIN`)
- **Build flags**: SCREAMING_SNAKE exportadas (`ENABLE_SENIOR_INTEGRATION`, `APP_NAME`)
- **Variáveis de cache privadas**: prefixo underscore (`_cachedResult`, `_lastFailTs`, `_observer`)
- **Campos calculados no state**: prefixo underscore (`_almocoSugerido`, `_voltaSugerida`, `_saidaEstimada`)

## Import/Export
- Imports com `type` keyword para tipos: `import type { PunchState } from './types'`
- Export nomeado para tudo (sem default exports, exceto entry points WXT)
- Entry points WXT usam `export default defineBackground(...)` / `defineContentScript(...)`
- Imports relativos com `../` — sem path aliases

## Anti-patterns Proibidos
- **Não usar `any`** — preferir `unknown` com narrowing ou casts explícitos
- **Não criar arquivos de barrel** (`index.ts`) — imports diretos para cada módulo
- **Não usar `enum`** — usar `as const` ou union types
- **Não comentar código** — código limpo sem comentários explicativos
- **Não usar classes para componentes React** — apenas function components

## Tratamento de Erros
- Try/catch com cast: `catch (e) { console.warn('[Senior Ponto] ...:', (e as Error).message); }`
- Prefixo `[Senior Ponto]` em todos os console.log/warn para filtragem
- Fallback silencioso em content scripts (catch vazio `catch (_) {}` para contexto invalidado)
- Promises de storage com `.then()` para fire-and-forget, sem `await` quando não crítico
