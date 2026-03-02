---
trigger: glob
globs: ["**/infrastructure/**/*.ts", "**/entrypoints/background.ts", "**/entrypoints/interceptor.content.ts", "**/entrypoints/senior-platform.content.ts"]
---

# Camada de Infraestrutura — Senior Ponto

## APIs Externas

### Senior Platform (`platform.senior.com.br`)
- **Auth**: Cookie `com.senior.token` (domain `.senior.com.br`) → URL-encoded JSON com `access_token`
- **Registro de ponto**: `POST .../hcm/pontomobile_clocking_event/actions/clockingEventImportByBrowser`
- **Dados do colaborador**: `POST .../hcm/pontomobile_bff/queries/getEmployeeClockingConfigQuery`
- **Header**: `Authorization: bearer <access_token>`

### GestaoPonto (`gestaoponto.meta.com.br`)
- **Auth**: `POST .../api/senior/auth/g7` com header `token: <Senior_access_token>` → retorna JWT `assertion`
- **Batimentos**: `GET .../api/acertoPontoColaboradorPeriodo/colaborador/{id}?dataInicial=&dataFinal=&codigoCalculo=`
- **Header obrigatório**: `assertion: <JWT>` + `zone-offset: <minutos>`
- **Cache**: assertion tem 7 dias de validade (HS256, issuer: gestaoponto.meta.com.br)

## Providers de Detecção (IPunchProvider, por prioridade)
1. **GpPunchProvider** (priority=1) — API GestaoPonto com cache de 30s e cooldown de 60s em falha. Fallback: busca via tabs abertas do GP
2. **SeniorStoragePunchProvider** — Lê `clockingEventsStorage` do localStorage da Senior via tab scripting
3. **SeniorApiPunchProvider** — 11 endpoints diferentes da plataforma Senior (tentativa exaustiva)
4. **SeniorScraperProvider** — Scraping DOM via `chrome.tabs.sendMessage` → `SCRAPE_TIMES`
5. **ManualPunchProvider** — Lê batimentos manuais de `chrome.storage.local` (modo sem Senior)

## Auth Providers (IAuthProvider)
1. **SeniorCookieAuth** — `chrome.cookies.getAll` para `com.senior.token`
2. **SeniorPageAuth** — Scan de sessionStorage/localStorage via tab scripting
3. **SeniorInterceptorAuth** — Token capturado pelo interceptor e salvo em `chrome.storage.local`

## Persistência
- **`chrome.storage.local`** — estado do ponto, settings, tokens capturados, dados GP
- Chaves principais: `pontoState`, `pontoSettings`, `pontoDate`, `seniorToken`, `seniorBearerToken`, `gestaoPontoAssertion`, `gestaoPontoColaboradorId`, `gestaoPontoCodigoCalculo`, `punchSuccessTs`

## Content Scripts — Comunicação
- **Interceptor (MAIN world)** → dispara `CustomEvent` no window (`__sponto_bearer`, `__sponto_gestao_ponto`, `__sponto_api_spy`, `__sponto_punch_success`)
- **Senior Platform (ISOLATED world)** → escuta CustomEvents, salva em `chrome.storage.local`
- Padrão: interceptor captura no mundo da página → event → content script ISOLATED → chrome.storage

## Regras
- Tokens são efêmeros — sempre verificar validade antes de usar
- Providers DEVEM falhar silenciosamente e retornar `[]` ou `null`
- Cooldown em providers que falharam para evitar spam de requests
- `isContextValid()` deve ser checado em content scripts antes de usar chrome APIs
- GP tab fetch usa `chrome.scripting.executeScript` com `target: { tabId }` — necessita permissão `scripting`
