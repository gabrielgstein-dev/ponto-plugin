# Mobile sync — como o plugin detecta batimentos do app celular

## Problema original

Quando o usuário bate ponto apenas pelo app mobile do Senior (`br.com.senior.employee`)
e nunca abre a aba do Senior no Chrome, o plugin ficava cego — o popup de
lembrete reabria em loop a cada 5 min até o `dailyReset` à meia-noite.

Diagnóstico em 2026-05-14:

- 3 dos 4 providers que existiam (`SeniorStoragePunchProvider`,
  `SeniorApiPunchProvider`, `SeniorScraperProvider`) **dependem de aba do
  Senior aberta** — sem aba, sem dados.
- O 4º (`GpPunchProvider`) faz fetch direto do SW pra `gestaoponto.meta.com.br`
  mas tem **lag de minutos** pra batimentos vindos do app mobile.

## Solução: `SeniorActiveUserPunchProvider`

Novo provider que faz fetch direto do service worker pra
[`pontomobile/queries/clockingEventByActiveUserQuery`](https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest/hcm/pontomobile/queries/clockingEventByActiveUserQuery)
no Senior X. **Não precisa de aba aberta. Retorna mobile em real-time.**

### Schema do request

Descoberto via [diegodario88/clockwerk](https://github.com/diegodario88/clockwerk)
e validado empiricamente em 2026-05-14:

```json
{
  "filter": {
    "activePlatformUser": true,
    "pageInfo": { "page": 0, "pageSize": "50" },
    "nameSearch": "",
    "sort": { "field": null, "order": "ASC" }
  }
}
```

Traps que custaram horas:

- `pageInfo` é **nested em `filter`**, não top-level
- `pageSize` é **STRING** (não number) — sem isso, validator devolve
  `"pageInfo is required"` mesmo com o campo presente
- `activePlatformUser: true` é o flag mágico que escopa pro user logado —
  sem ele, o endpoint exige permissão `Visualizar` resource-wide que o user
  comum não tem

### Schema do response

```json
{
  "count": 824,
  "totalPages": 42,
  "result": [
    {
      "id": "uuid",
      "dateEvent": "2026-05-14",
      "timeEvent": "15:31:34",         // mobile: sem millis
      "platform": "android",            // ou "ios" ou "Web"
      "appVersion": "5.0.3",
      "employee": { ... },
      "device": { ... },
      ...
    }
  ]
}
```

O provider parseia só `dateEvent === hoje` e extrai `HH:MM` de `timeEvent`
(ignorando segundos/millis), dedup, ordenado cronologicamente.

### Auth

Reusa o bearer capturado passivamente pelo `webRequest.onSendHeaders`
listener do `background.ts` quando o usuário usa o Senior (não precisa estar
aberto no momento — basta ter sido em algum momento nos últimos 6.5 dias).

Fallback em ordem:
1. Cookie `com.senior.token` (`SeniorCookieAuth`) — preferido, sempre fresco
2. `chrome.storage.local.seniorToken` se `seniorTokenTs < SENIOR_TOKEN_MAX_AGE_MS`

Sem token → retorna array vazio sem chamar fetch (cooldown não precisa).

### Posicionamento no chain de providers

Priority **1**, mesmo nível do GP. O `PunchDetector` roda os providers de
priority ≤ 2 em paralelo e **mergeia** os resultados. Isso é proposital:

- GP cobre histórico completo (mas com lag pra mobile)
- ActiveUser cobre mobile real-time (mas é só 1 endpoint paginado)
- Juntos: melhor coverage

### Caches

- TTL: 30s
- Cooldown de falha (401/403/erro de rede): 2min
- Reset junto com os outros via `resetAllCaches()` no `background.ts`

## Endpoints testados que NÃO funcionaram

Validado no spike de 2026-05-14 (output em `lib/infrastructure/senior/senior-direct-fetch.ts`):

| Endpoint | Status | Motivo |
|---|---|---|
| `pontomobile_bff/queries/getLastClockingEventsQuery` | 404 | `bridge.unknown_command` — service deprecated |
| `pontomobile_bff/queries/getClockingEventsQuery` | 404 | Idem |
| `pontomobile_bff/queries/getEmployeeClockingEventsQuery` | 404 | Idem |
| `pontomobile_clocking_event/queries/listClockingEvent` | 403 | Action `Visualizar` denied — falta permissão |
| `pontomobile_clocking_event/entities/clockingEvent` (GET) | 403 | Idem |
| `pontomobile_clocking_event/queries/getClockingEvent` e variantes | 404 | Commands deprecated |
| `gestao_ponto/queries/*` via Senior bridge | 404 | `Domain or service not found` — service não existe nesse path |

A diferença do `pontomobile/queries/clockingEventByActiveUserQuery` é o flag
`activePlatformUser: true` que faz o backend usar o ID do user do token, em
vez de exigir permissão resource-wide.

## Webhooks (alternativa investigada e descartada)

[Senior X Events Hub](https://api.xplatform.com.br/api-portal/pt-br/tutoriais/events-hub-web-hooks)
existe como mecanismo, mas **não tem evento documentado pra clockingEvent**.
Alguém perguntou exatamente isso no fórum oficial em set/2024 sem resposta.

Pedir pra Senior expor seria feature request sem precedente — não viável no
curto prazo.

## Outras camadas do fix

Mesmo com o sync via `SeniorActiveUserPunchProvider` funcionando, há latência
estrutural Senior (mobile → backend → propagação). Pra robustez, foi
adicionada a **Camada 3** ([punch-reminder-manager.ts](../lib/application/punch-reminder-manager.ts)):

- `recheckReminder` força `backgroundDetect()` + reset de caches **antes** de
  decidir reabrir o popup. Cada ciclo de 5min vira uma chance fresh de pegar
  o sync.
- Após 20min sem detectar, o popup **escala**: vira modo "user-agent" com 3
  ações explícitas — "Já bati no app" (marca manualmente), "Abrir Senior"
  (abre aba pra forçar sync), "Parar lembretes" (dismiss pro dia).
- `punchPopupDismissedSlots` persiste o dismiss até `dailyReset`. Slot
  dispensado não reabre.
- Close window em modo escalado = dismiss implícito.

## Referências

- [diegodario88/clockwerk](https://github.com/diegodario88/clockwerk) —
  implementação Go que revelou o schema correto
- [raschmitt/hcm-senior-skill](https://github.com/raschmitt/hcm-senior-skill)
  — implementação C#, confirma a URL
- [Senior X API portal](https://api.xplatform.com.br/api-portal/pt-br/)
- [dev.senior.com.br/api_privada/hcm_pontomobile](https://dev.senior.com.br/api_privada/hcm_pontomobile/)
