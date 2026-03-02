# Adicionando Nova Empresa — Multi-tenant Architecture

## Visão Geral

A extensão suporta múltiplas empresas com arquitetura multi-tenant. Cada empresa tem:
- URLs específicas (gestaoponto, timesheet, etc.)
- Storage keys isoladas (prefixo único)
- Entry points padronizados via `#company/providers`
- Zero lógica duplicada — código compartilhado em `senior/`, `timesheet/`, `manual/`

## Estrutura Atual

```
lib/infrastructure/
  senior/                    ← Core Senior (SaaS compartilhado, URLs genéricas)
    constants.ts             ← SENIOR_API_BASE, TOKEN_MAX_AGE_MIN
    tab-utils.ts             ← findSeniorTab() apenas
    senior-*.ts              ← Todos os providers Senior (API, storage, scraper, etc.)
  timesheet/                 ← Timesheet genérico (parametrizável)
    timesheet-config.ts      ← TimesheetConfig interface
    timesheet-auth.ts        ← createTimesheetAuth(config)
    timesheet-provider.ts    ← createTimesheetProvider(config, auth)
  meta/                      ← Empresa Meta (todas as configs específicas)
    gestaoponto/             ← GP module com URLs da Meta
      constants.ts           ← GP_API_BASE, GP_FRONTEND_URL, etc.
      gp-*.ts                ← Todos os providers GP
    timesheet/               ← Meta Timesheet config
      constants.ts           ← META_TIMESHEET_CONFIG (URLs, storage prefix)
      meta-ts-auth.ts        ← 1 linha: createTimesheetAuth(config)
      meta-ts-provider.ts    ← 1 linha: createTimesheetProvider(config, auth)
    providers.ts             ← Entry point padronizado (exports via #company)
  manual/                    ← Modo manual (sem empresa)
  chrome-storage.ts          ← State repository
```

## Passo a Passo — Adicionar Empresa X

### 1. Copiar estrutura da Meta

```bash
cp -r lib/infrastructure/meta lib/infrastructure/empresa-x
```

### 2. Configurar URLs da Empresa X

#### 2.1 GestaoPonto URLs
Editar `lib/infrastructure/empresa-x/gestaoponto/constants.ts`:

```typescript
export const GP_API_BASE = 'https://gestaoponto.empresa-x.com.br/gestaoponto-backend/api/';
export const GP_FRONTEND_URL = 'https://gestaoponto.empresa-x.com.br/gestaoponto-frontend/?portal=g7&showMenu=S';
export const GP_CACHE_DURATION_MS = 6 * 3600000;
```

#### 2.2 Timesheet Config
Editar `lib/infrastructure/empresa-x/timesheet/constants.ts`:

```typescript
import type { TimesheetConfig } from '../../timesheet/timesheet-config';

export const EMPRESA_X_TIMESHEET_CONFIG: TimesheetConfig = {
  name: 'empresa-x-timesheet',
  apiUrl: 'https://api.empresa-x.com.br',
  platformUrl: 'https://plataforma.empresa-x.com.br',
  sessionEndpoint: '/api/auth/session',
  timesheetsBase: '/timesheets/v1',
  tokenMaxAgeMs: 4.5 * 60 * 1000,
  storagePrefix: 'empXTs', // Prefixo único!
  jwtUuidField: 'empXUUID',
};
```

#### 2.3 Providers da Empresa X
Editar `lib/infrastructure/empresa-x/timesheet/meta-ts-auth.ts` → `emp-x-timesheet-auth.ts`:

```typescript
import { createTimesheetAuth } from '../../timesheet/timesheet-auth';
import { EMPRESA_X_TIMESHEET_CONFIG } from './constants';

export const empXTimesheetAuth = createTimesheetAuth(EMPRESA_X_TIMESHEET_CONFIG);
```

Editar `lib/infrastructure/empresa-x/timesheet/meta-ts-provider.ts` → `emp-x-timesheet-provider.ts`:

```typescript
import { createTimesheetProvider } from '../../timesheet/timesheet-provider';
import { empXTimesheetAuth } from './emp-x-timesheet-auth';
import { EMPRESA_X_TIMESHEET_CONFIG } from './constants';

export const empXTimesheetProvider = createTimesheetProvider(EMPRESA_X_TIMESHEET_CONFIG, empXTimesheetAuth);
```

### 3. Criar Entry Point Padronizado

Editar `lib/infrastructure/empresa-x/providers.ts`:

```typescript
import type { IPunchProvider } from '../../domain/interfaces';
import type { ITimesheetProvider } from '../../domain/interfaces';
import { GpPunchProvider } from './gestaoponto/gp-provider';
import { empXTimesheetProvider } from './timesheet/emp-x-timesheet-provider';

export function getCompanyPunchProviders(): IPunchProvider[] {
  return [new GpPunchProvider()];
}

export function getTimesheetProvider(): ITimesheetProvider {
  return empXTimesheetProvider;
}

export { getGpAssertion, invalidateGpCache } from './gestaoponto/gp-auth';
export { parseGpResponse } from './gestaoponto/gp-provider';
export { GP_API_BASE } from './gestaoponto/constants';
export { fetchGpHistoryForPeriod } from './gestaoponto/gp-history-provider';
export type { GpHistoryResult } from './gestaoponto/gp-history-provider';
```

### 4. Ativar Empresa X no Build

Editar `lib/domain/build-flags.json`:

```json
{
  "ACTIVE_COMPANY": "empresa-x",
  "APP_NAME": "Senior Ponto",
  ...
}
```

### 5. Buildar

```bash
pnpm wxt build
```

## Verificação

O build deve compilar com zero erros. O Vite resolverá `#company/*` para `lib/infrastructure/empresa-x/*` em tempo de build, e todos os consumers usarão automaticamente os providers da Empresa X.

## O que NÃO precisa mudar

- **Nenhum** arquivo em `lib/application/` — usa `#company/providers`
- **Nenhum** arquivo em `lib/presentation/` — usa `#company/providers`
- **Nenhum** arquivo em `lib/domain/` — código compartilhado
- **Nenhum** entry point — `#company` é resolvido em build time
- **Nenhum** import direto de empresa específica — todos via `#company/providers`

## Storage Keys Isoladas

Cada empresa usa prefixos únicos:
- Meta: `metaTs*`, `gpAssertion`, `gestaoPontoCodigoCalculo`
- Empresa X: `empXTs*`, `gpAssertion`, `gestaoPontoCodigoCalculo` (mesmas chaves GP, mas URLs diferentes garante isolamento)

## Content Scripts (se necessário)

Se a Empresa X tiver domínios diferentes, adicionar entry points em `entrypoints/`:
- `empresa-x-interceptor.content.ts` (MAIN world)
- `empresa-x-platform.content.ts` (ISOLATED world)
- Adicionar listeners em `background.ts` para URLs da Empresa X

## Resumo

1. Copiar `meta/` → `empresa-x/`
2. Mudar URLs em `constants.ts`
3. Mudar storage prefix em timesheet config
4. Mudar `ACTIVE_COMPANY` no build-flags
5. Buildar

**Zero lógica duplicada, zero interferência entre empresas.**
