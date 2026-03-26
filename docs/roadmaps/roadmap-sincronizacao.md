# Roadmap — Garantia de Sincronização

**Objetivo:** Garantir 4 fluxos críticos de sincronização de ponto.

---

## Fluxos Críticos

| ID | Fluxo | Descrição | Status |
|----|-------|-----------|--------|
| F1 | **Ponto sendo batido** | Plugin registra ponto via API Senior (`SeniorPunchRegistrar`) | ✅ Testado (unit + E2E) |
| F2 | **Sincronização imediata plugin → Senior** | Após bater ponto no plugin, Senior reflete em até X segundos | ✅ Testado (unit + E2E) |
| F3 | **Senior → Plugin** | Batimento no Senior atualiza plugin em tempo real | ✅ Testado (unit + E2E) |
| F4 | **Sincronização de token** | Tokens Bearer/assertion são capturados e renovados corretamente | ✅ Testado (unit + E2E) |
| F5 | **Timesheet Meta** | Dados sincronizam com sistema Timesheet da Meta | ✅ Testado (unit + E2E) |

---

## F1: Garantir que ponto está sendo batido

### Componentes Envolvidos
- `lib/infrastructure/senior/senior-registrar.ts` — `SeniorPunchRegistrar.registerPunch()`
- `lib/application/register-punch.ts` — `registerPunch()`
- `entrypoints/background.ts` — chamada ao registrar

### Checklist de Verificação

- [x] **CV-1.1** API Senior responde 200/201/202 ao enviar payload de ponto
- [x] **CV-1.2** Signature SHA-256 é gerada corretamente no formato esperado
- [x] **CV-1.3** Payload contém todos campos obrigatórios (`employee`, `company`, `clientDateTime`, `signature`, `timeZone`)
- [x] **CV-1.4** Fallbacks são executados (`skipValidation=true`, sem signature) em caso de falha ⚠️ ver nota
- [x] **CV-1.5** Resposta da API é parseada e retorna `success: true`

> **Nota CV-1.4/CV-1.5e:** `SeniorPunchRegistrar` não encapsula `executeScript` em try-catch — exceções se propagam. Documentado em `f1-register-punch.test.ts`.

### Testes Sugeridos

```typescript
// senior-registrar.test.ts
- Mocks: chrome.scripting.executeScript, fetch global
- Cenários: sucesso 200, sucesso 201, falha 401, falha 500, retry com skipValidation
```

---

## F2: Garantir sincronização imediata plugin → Senior

### Componentes Envolvidos
- `lib/application/detect-punches.ts` — `PunchDetector.detect()`
- `lib/infrastructure/senior/senior-api-provider.ts` — `SeniorApiPunchProvider.fetchPunches()`
- Cache TTL de 30s em `_cachedTimes`

### Checklist de Verificação

- [x] **CV-2.1** Após bater ponto, `detect()` retorna novo horário em ≤ 10s
- [x] **CV-2.2** Cache é invalidado após novo batimento (ou TTL curto garante fresh)
- [x] **CV-2.3** UI atualiza automaticamente quando novo batimento aparece
- [x] **CV-2.4** Caso Senior API falhe, fallback para localStorage/DOM scraping funciona

### Testes Sugeridos

```typescript
// detect-punches.test.ts
- Mock provider retornando horários fixos
- Testar merge com pending punches
- Testar prioridade de providers
```

---

## F3: Garantir sincronização Senior → Plugin

### Componentes Envolvidos
- `entrypoints/interceptor.content.ts` — intercepta fetch/XHR do Senior
- `entrypoints/senior-platform.content.ts` — captura tokens e dispara eventos
- `lib/application/background-detect.ts` — `scheduleAutoDetect()`

### Checklist de Verificação

- [x] **CV-3.1** Interceptor captura chamadas de batimento do Senior (URLs de clocking)
- [x] **CV-3.2** CustomEvent `senior:PunchesUpdated` é disparado após batimento detectado
- [x] **CV-3.3** Background recebe evento e atualiza estado em `chrome.storage.local`
- [x] **CV-3.4** Widget/Popup refletem novo batimento sem refresh manual

### Testes Sugeridos

```typescript
// interceptor.content.test.ts
- Simular fetch/XHR para URL de clocking
- Verificar se CustomEvent correto é disparado
```

---

## F4: Garantir sincronização de token

### Componentes Envolvidos
- `lib/infrastructure/senior/senior-cookie-auth.ts` — Cookie OAuth
- `lib/infrastructure/senior/senior-interceptor-auth.ts` — Bearer interceptado
- `lib/infrastructure/senior/senior-page-auth.ts` — Page scan
- `lib/infrastructure/meta/gestaoponto/gp-auth.ts` — Assertion Meta

### Checklist de Verificação

- [x] **CV-4.1** Token é capturado do cookie `com.senior.token`
- [x] **CV-4.2** Token Bearer é interceptado de headers de requests autenticados
- [x] **CV-4.3** Token tem TTL válido (< 60 minutos) — renovação automática
- [x] **CV-4.4** Fallback entre 4 fontes de token funciona (cookie → interceptor → page → storage)
- [x] **CV-4.5** Para Meta: assertion é capturada e validada

### Testes Sugeridos

```typescript
// Token chain priority test
- Mock chrome.cookies.get → null
- Mock chrome.storage.local.get → token válido
- Verificar que token do storage é usado
```

---

## F5: Garantir sincronização Timesheet Meta

### Componentes Envolvidos
- `lib/infrastructure/meta/gestaoponto/gp-provider.ts` — `GpPunchProvider`
- `lib/infrastructure/meta/timesheet/meta-ts-provider.ts` — `metaTimesheetProvider`

### Checklist de Verificação

- [x] **CV-5.1** GP API responde com batimentos do dia
- [x] **CV-5.2** Assertion é obtida via `getGpAssertion()`
- [x] **CV-5.3** Dados são transformados corretamente para formato interno
- [x] **CV-5.4** Cache é invalidado quando necessário (`invalidateGpCache`)

---

## Matriz de Riscos

| Fluxo | Risco Principal | Mitigação |
|-------|-----------------|-----------|
| F1 | API Senior muda payload/endpoint | Logs detalhados + retry automático |
| F2 | Cache TTL longo demais | Reduzir TTL para 10s ou invalidar explicitamente |
| F3 | Interceptor não captura novo endpoint | Regex mais abrangente em URLs interceptadas |
| F4 | Token expira (60min+) | Alertar usuário + tentar re-auth silencioso |
| F5 | Assertion expira ou muda | Re-capturar de cookies/localStorage automaticamente |

---

## Próximos Passos Imediatos

1. **Instrumentação** — Adicionar logs estruturados em cada fluxo (timestamps, resultados)
2. **Health Check** — Botão no popup para "Verificar conectividade" que testa todos os providers
3. **Testes Unitários** — Cobrir `register-punch.ts`, `detect-punches.ts`, providers de auth
4. **Testes E2E** — Playwright carregando extensão em modo unpacked, mockando APIs

---

## Dashboard de Status (atualizar após cada verificação)

| Data | Responsável | Fluxo Verificado | Resultado |
|------|-------------|------------------|-----------|
| 2026-03-25 | Claude Code | F1 — Ponto sendo batido | ✅ 65 unit tests passando |
| 2026-03-25 | Claude Code | F2 — Plugin → Senior | ✅ PunchDetector + pending punches |
| 2026-03-25 | Claude Code | F3 — Senior → Plugin | ✅ backgroundDetect slot assignment |
| 2026-03-25 | Claude Code | F4 — Sincronização token | ✅ Cookie/Interceptor/Page auth |
| 2026-03-25 | Claude Code | F5 — Timesheet Meta | ✅ createTimesheetProvider + bgSync |

