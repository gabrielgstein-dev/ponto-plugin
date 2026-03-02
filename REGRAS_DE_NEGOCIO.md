# Regras de Negócio — Senior Ponto Plugin

## 1. Modelo de Dados

### 1.1 PunchState (estado do ponto do dia)
```
entrada  : string | null   — HH:mm do primeiro batimento
almoco   : string | null   — HH:mm do batimento de saída p/ almoço
volta    : string | null   — HH:mm do batimento de volta do almoço
saida    : string | null   — HH:mm do batimento de saída final
```
Campos calculados (prefixo `_`, nunca persistidos como batimento real):
```
_almocoSugerido : horário sugerido para almoço (da config)
_voltaSugerida  : almoço + duração do almoço
_saidaEstimada  : horário estimado de saída
```

### 1.2 Settings (configurações do usuário)
| Campo | Default | Descrição |
|-------|---------|-----------|
| `jornada` | 480 min (8h) | Duração total da jornada em minutos |
| `almocoHorario` | "12:00" | Horário padrão sugerido para almoço |
| `almocoDur` | 60 min | Duração padrão do almoço |
| `notifAntecip` | 10 min | Antecedência das notificações |

### 1.3 Build Flags (White-Label)
Definidas em `lib/domain/build-flags.ts`. São constantes `as const` — resolvidas em tempo de build, **não podem ser alteradas em runtime**. O bundler faz tree-shaking do código morto.

| Flag | Default | Descrição |
|------|---------|-----------|
| `APP_NAME` | `'Senior Ponto'` | Nome do app (usado no manifest e logs) |
| `ENABLE_SENIOR_INTEGRATION` | `true` | Habilita integração com Senior/GestaoPonto (APIs, interceptors, cookies, content scripts) |
| `ENABLE_SENIOR_PUNCH_BUTTON` | `false` | Habilita botão de bater ponto via API Senior (requer `ENABLE_SENIOR_INTEGRATION`) |
| `ENABLE_MANUAL_PUNCH` | `false` | Habilita ponto manual local (sem Senior, grava em `chrome.storage.local`) |
| `ENABLE_WIDGET` | `true` | Habilita widget flutuante em todas as páginas |
| `ENABLE_YESTERDAY` | `true` | Habilita banner de pontos de ontem (requer `ENABLE_SENIOR_INTEGRATION`) |
| `ENABLE_NOTIFICATIONS` | `true` | Habilita notificações de almoço/volta/saída via `chrome.alarms` |

#### Perfis de build comuns
- **Senior completo**: `ENABLE_SENIOR_INTEGRATION=true, ENABLE_SENIOR_PUNCH_BUTTON=true`
- **Senior readonly**: `ENABLE_SENIOR_INTEGRATION=true, ENABLE_SENIOR_PUNCH_BUTTON=false` (default)
- **Ponto manual**: `ENABLE_SENIOR_INTEGRATION=false, ENABLE_MANUAL_PUNCH=true`

---

## 2. Detecção de Batimentos

### 2.1 Providers (ordem de prioridade)
| Prioridade | Provider | Fonte de dados | Requer flag |
|------------|----------|----------------|-------------|
| 0 | `ManualPunchProvider` | `chrome.storage.local` (key `manualPunches`) | `ENABLE_MANUAL_PUNCH` |
| 1 | `GpPunchProvider` | API GestaoPonto (fetch direto ou via aba) | `ENABLE_SENIOR_INTEGRATION` |
| 2 | `SeniorStoragePunchProvider` | `localStorage.clockingEventsStorage` da aba Senior | `ENABLE_SENIOR_INTEGRATION` |
| 3 | `SeniorApiPunchProvider` | APIs REST da Senior Platform (11 endpoints) | `ENABLE_SENIOR_INTEGRATION` |
| 4 | `SeniorScraperProvider` | Scraping do DOM da aba Senior | `ENABLE_SENIOR_INTEGRATION` |

### 2.2 Regra de fallback
- Itera providers em ordem de prioridade (menor = primeiro)
- Para no primeiro provider que retorna `times.length > 0`
- Se nenhum retorna dados, resultado é `null`
- Modo `aggressive=true`: tenta todos com logs detalhados; modo `silent`: sem toast

### 2.3 Polling automático
- **Detecção inicial**: `aggressive=true` ao abrir o popup
- **Polling**: a cada **15 segundos** em modo silencioso (`aggressive=false`)
- **Pós-punch**: ao detectar `punchSuccessTs` no storage, aguarda **2 segundos** e re-detecta com `aggressive=true`

### 2.4 Caches e cooldowns
| Provider | Cache TTL | Cooldown de falha |
|----------|-----------|-------------------|
| `GpPunchProvider` (direto) | 30s | 60s |
| `SeniorStoragePunchProvider` | 30s (se vazio) | — |
| `SeniorApiPunchProvider` | 30s | 120s |
| GP Auth assertion | 6h | Invalida em 401/403 |

---

## 3. Atribuição de Slots (assignLunchAndExit)

### 3.1 Regra principal (múltiplos batimentos)
Dado `past[]` = batimentos passados ordenados:

1. `state.entrada = past[0]` (sempre o primeiro)
2. Para cada par `(past[i], past[i+1])` com `i >= 1`:
   - Se `workBefore >= 120min` (2h trabalhadas antes) **E** `gap >= min(almocoDur, 30min)`:
     - `state.almoco = past[i]`
     - `state.volta = past[i+1]`
     - Se existir `past[i+2]`: `state.saida = past[último]`
3. **Fallback** (nenhum par satisfaz a regra acima):
   - Se `totalSpan >= 120min` **E** `totalSpan < jornada + almocoDur`:
     - `state.almoco = past[último]` (interpreta como saída p/ almoço)

### 3.2 Filtro de batimentos válidos
- Apenas batimentos onde `timeToMinutes(t) <= nowMinutes + 5` são considerados
- Isso permite batimentos até 5min no futuro (margem de relógio)

### 3.3 Detecção de mudança
- Compara hash `JSON.stringify({e,a,v,s})` antes e depois
- Só persiste e notifica se houve mudança real

---

## 4. Cálculo de Horários Estimados (calc-schedule)

### 4.1 Apenas entrada registrada
```
_almocoSugerido = settings.almocoHorario
_saidaEstimada  = entrada + jornada + almocoDur
```

### 4.2 Almoço registrado (sem volta)
```
_voltaSugerida = almoco + almocoDur
_saidaEstimada = almoco + almocoDur + (jornada - horasAntesAlmoco)
```
Onde `horasAntesAlmoco = almoco - entrada`

### 4.3 Volta registrada
```
horasAntesAlmoco = almoco ? (almoco - entrada) : 0
actualLunch      = almoco ? (volta - almoco) : 0
lunchDeficit     = max(0, almocoDur - actualLunch)
horasRestantes   = jornada - horasAntesAlmoco
_saidaEstimada   = volta + horasRestantes + lunchDeficit
```
**Regra do déficit de almoço**: se o almoço foi mais curto que o configurado, o déficit é adicionado à saída (o colaborador deve cumprir o tempo mínimo de almoço).

### 4.4 Cálculo de horas trabalhadas (widget e popup)
```
worked = (saida ?? now) - entrada
Se almoco E volta: worked -= (volta - almoco)
Se almoco E !volta: worked -= (now - almoco)   // desconta tempo de almoço em andamento
```

---

## 5. Notificações

### 5.1 Tipos de notificação
| Key | Quando | Mensagem |
|-----|--------|----------|
| `notif_almoco` | `almocoHorario - antecip` | "Hora do almoço em X minutos!" |
| `notif_volta` | `volta_sugerida - antecip` | "Hora de voltar do almoço em X minutos!" |
| `notif_volta_now` | `volta_sugerida` | "Registre a volta do almoço agora!" |
| `notif_saida` | `saida_estimada - antecip` | "Saída em X minutos! Prepare-se." |
| `notif_saida_now` | `saida_estimada` | "Hora de bater o ponto de saída!" |

### 5.2 Regras
- Usa `chrome.alarms` para agendar (não setInterval)
- Cada notificação é agendada **uma única vez** por sessão (flag `notifScheduled[key]`)
- Não agenda se o horário já passou (`time <= nowMin`)
- Notificações auto-dismiss em **8 segundos**
- Reset total ao mudar batimentos (`resetNotifScheduled`)

---

## 6. Reset Diário

- **Alarme `dailyReset`**: dispara à meia-noite, período de 1440min (24h)
- Ação: limpa `pontoState`, `seniorToken`, `seniorBearerToken`, alarmes de notificação
- **Validação de data**: ao carregar state, compara `pontoDate` com `today.toDateString()`; se diferente, reseta

---

## 7. Widget Flutuante (content script)

### 7.1 Escopo
- Injetado em **todas as URLs** (`<all_urls>`)
- Apenas em `window.top` (ignora iframes)
- Posição fixa: `bottom:20px; right:20px; z-index:99999`

### 7.2 Comportamento
- **Toggle**: botão circular (ícone relógio) abre/fecha painel
- **Relógio**: atualiza a cada 1 segundo
- **Dados**: lê `chrome.storage.local` (pontoState, pontoSettings, pontoDate)
- **Atualização**: a cada 30s via polling + instantâneo via `storage.onChanged`
- **Resiliência**: `MutationObserver` re-injeta o widget se for removido do DOM (debounce 1s)
- **Validação de contexto**: verifica `chrome.runtime.id` antes de cada operação; cleanup se inválido

### 7.3 Cores dos horários
| Classe | Cor | Significado |
|--------|-----|-------------|
| `.past` | Verde (#4ade80) | Batimento já registrado (passado) |
| `.next` | Ciano (#22d3ee) | Próximo batimento (futuro) |
| `.calc` | Amarelo (#fbbf24) | Horário estimado/calculado |

---

## 8. Popup (interface principal)

### 8.1 Componentes
- **LiveClock**: relógio em tempo real + data
- **TokenStatus**: indicador de detecção em andamento
- **PunchCard x4**: cards de entrada, almoço, volta, saída
- **ProgressBar**: barra de progresso da jornada (% e HH:mm / HH:mm)
- **Yesterday banner**: exibe horários do dia anterior (via API GestaoPonto)
- **StatusBanner**: estado textual da jornada
- **NextAction**: countdown para o próximo evento
- **PunchButton**: botão para bater ponto via API (desabilitado por default, `ENABLE_SENIOR_PUNCH_BUTTON=false`)
- **SettingsPanel**: configurações de jornada, almoço, notificações + botão limpar dados

### 8.2 Status possíveis
1. "Detectando batimentos..." (durante polling)
2. "Aguardando entrada" (nenhum batimento)
3. "Trabalhando — aguardando almoço" (só entrada)
4. "Almoço — aguardando volta" (entrada + almoço)
5. "Trabalhando — aguardando saída" (entrada + almoço + volta)
6. "Jornada concluída!" (todos 4 batimentos)

---

## 9. Registro de Ponto (bater ponto via API)

### 9.1 Fluxo
1. Resolve token de autenticação (cookie → storage → page scan → interceptor)
2. Busca config do colaborador via `getEmployeeClockingConfigQuery`
3. Monta payload com: company, employee, timezone, datetime, signature, use code
4. Envia para `clockingEventImportByBrowser`
5. Tentativas: normal → `skipValidation=true` → sem signature

### 9.2 Signature
```
input     = PIS + CNPJ/identifier + clientDateTimeEvent
hash      = SHA-256(input)
signature = base64(hex(hash))
```

### 9.3 Pós-registro bem-sucedido
1. Extrai `timeEvent` do response body
2. Injeta no `clockingEventsStorage` da aba Senior (para o provider localStorage capturar)
3. Seta `punchSuccessTs` no storage (trigga re-detecção)

---

## 10. Interceptação de Requests (interceptor content script)

### 10.1 Escopo
- Roda em `platform.senior.com.br` e `gestaoponto.meta.com.br`
- World: `MAIN` (acesso ao fetch/XHR real da página)
- RunAt: `document_start` (antes de qualquer script)

### 10.2 O que intercepta
| Evento | Condição | Ação |
|--------|----------|------|
| Bearer token | Header `Authorization: Bearer ...` para `senior.com.br` | Dispara `__sponto_bearer` |
| GP assertion | Header `assertion` para URL com `gestaoponto` e `/api/` | Dispara `__sponto_gestao_ponto` com assertion, colaboradorId, codigoCalculo, baseUrl |
| API spy | POST/PUT para URLs com `clocking`, `pontomobile`, `/ponto/` | Dispara `__sponto_api_spy` |
| Punch success | Fetch OK para URL com `clockingEventImportByBrowser` | Dispara `__sponto_punch_success` |

### 10.3 Métodos interceptados
- `window.fetch` (monkey-patched)
- `XMLHttpRequest.open`, `setRequestHeader`, `send` (monkey-patched)

---

## 11. Content Script Senior Platform

### 11.1 Escopo
- Roda apenas em `platform.senior.com.br`
- RunAt: `document_idle`
- Apenas em `window.top`

### 11.2 Funcionalidades
- **Scrape listener**: responde a mensagem `SCRAPE_TIMES` com batimentos extraídos do DOM
- **Token capture**: escuta eventos customizados do interceptor (`__sponto_bearer`, `__sponto_api_spy`, `__sponto_gestao_ponto`, `__sponto_punch_success`) e persiste no `chrome.storage.local`

### 11.3 Scraping de horários
Ordem de seletores (para no primeiro que encontra resultados):
1. `table td[class*="marcac"]`, `td[class*="batimento"]`, `td[class*="horario"]`, `td[class*="hora"]`
2. `[class*="marcacao"] span`, `[class*="batimento"] span`
3. `[class*="ponto"] td/span`, `[class*="clocking"] td/span`, `[class*="event"] td`
4. `table td`, `table th` (fallback genérico, filtra regex estrito)
5. **Último fallback**: regex global no `document.body.innerText`
- Filtro: horas entre 05:00 e 22:00
- Resultado: `[...new Set(times)].sort()`

---

## 12. Storage Keys (chrome.storage.local)

| Key | Tipo | Descrição |
|-----|------|-----------|
| `pontoState` | PunchState | Estado atual dos batimentos |
| `pontoSettings` | Settings | Configurações do usuário |
| `pontoDate` | string | Data do state (`.toDateString()`) |
| `seniorToken` | string | Bearer token capturado via webRequest |
| `seniorTokenTs` | number | Timestamp do seniorToken |
| `seniorBearerToken` | string | Bearer capturado pelo interceptor (content script) |
| `seniorBearerTs` | number | Timestamp do seniorBearerToken |
| `seniorPunchApi` | object | Último request de ponto interceptado |
| `seniorPunchApiTs` | number | Timestamp do seniorPunchApi |
| `gpAssertion` | string | JWT assertion do GestaoPonto |
| `gpAssertionTs` | number | Timestamp da assertion |
| `gestaoPontoColaboradorId` | string | ID do colaborador (ex: `1410-1-35829`) |
| `gestaoPontoCodigoCalculo` | string | Código de cálculo do período |
| `gestaoPontoAssertion` | string | Assertion capturada via interceptor |
| `gestaoPontoBaseUrl` | string | Base URL do GP capturada via interceptor |
| `gestaoPontoTs` | number | Timestamp da captura via interceptor |
| `punchSuccessTs` | number | Timestamp do último punch bem-sucedido |
| `alarm_msg_*` | string | Mensagem associada a cada alarme de notificação |
| `manualPunches` | `Record<string, string[]>` | Pontos manuais por data (`YYYY-MM-DD` → `["HH:mm", ...]`). Só existe se `ENABLE_MANUAL_PUNCH` |

---

## 13. Permissões da Extensão
As permissões são condicionais via build flags em `wxt.config.ts`.

| Permissão | Uso | Requer flag |
|-----------|-----|-------------|
| `storage` | Persistir state, settings, tokens | sempre |
| `alarms` | Agendar notificações e reset diário | sempre |
| `notifications` | Notificações de almoço/volta/saída | `ENABLE_NOTIFICATIONS` |
| `activeTab` | Acesso à aba ativa | `ENABLE_SENIOR_INTEGRATION` |
| `tabs` | Buscar/criar abas Senior e GestaoPonto | `ENABLE_SENIOR_INTEGRATION` |
| `scripting` | Injetar scripts nas abas (executeScript) | `ENABLE_SENIOR_INTEGRATION` |
| `webRequest` | Interceptar headers de Authorization no background | `ENABLE_SENIOR_INTEGRATION` |
| `cookies` | Ler `com.senior.token` do domínio `.senior.com.br` | `ENABLE_SENIOR_INTEGRATION` |
| `host_permissions: <all_urls>` | Widget content script + Senior pages | `ENABLE_SENIOR_INTEGRATION` ou `ENABLE_WIDGET` |

---

## 14. Ponto Manual (`ENABLE_MANUAL_PUNCH`)

### 14.1 Conceito
Permite usar o plugin como controle de ponto independente, sem cadastro no Senior. O usuário bate ponto manualmente clicando no botão.

### 14.2 Storage
- Key: `manualPunches`
- Formato: `{ "2026-02-27": ["08:30", "12:00", "13:00", "17:30"] }`
- Um registro por dia, array de horários `HH:mm` ordenados

### 14.3 Fluxo
1. Usuário clica "Bater Ponto"
2. `useManualPunch` captura hora atual (`HH:mm`)
3. Salva em `manualPunches[today]` via `saveManualPunch()`
4. Seta `punchSuccessTs` (trigga re-detecção)
5. `ManualPunchProvider` (priority 0) retorna os horários no próximo ciclo de detecção
6. `applyTimes` atribui os slots (entrada, almoço, volta, saída) normalmente

### 14.4 Regras
- Horários duplicados são ignorados (dedup antes de salvar)
- Os horários são sempre ordenados cronologicamente
- A mesma lógica de `assignLunchAndExit` se aplica (gap ≥ 30min + 2h trabalhadas = almoço)
- Dados persistem entre sessões (chrome.storage.local)
- Reset diário limpa `pontoState` mas **não** limpa `manualPunches` (histórico preservado)
