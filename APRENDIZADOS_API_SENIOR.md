# Aprendizados — APIs Senior & GestaoPonto

## 1. Arquitetura dos Sistemas

A plataforma Senior é composta por **dois sistemas independentes** com domínios e autenticações diferentes:

| Sistema | Domínio | Função |
|---------|---------|--------|
| **Senior X Platform** | `platform.senior.com.br` | Plataforma principal, pontomobile (bater ponto), SSO |
| **GestaoPonto (Meta)** | `gestaoponto.meta.com.br` | Histórico de ponto, apuração, marcações previstas |

**Insight crítico**: O pontomobile da Senior **NÃO tem API para consultar histórico de pontos**. Ele usa APENAS `localStorage`. A API real de histórico está no GestaoPonto (domínio completamente diferente).

---

## 2. Autenticação Senior X Platform

### 2.1 Cookie de autenticação
- **Nome**: `com.senior.token`
- **Domínio**: `.senior.com.br`
- **Formato**: URL-encoded JSON
- **Estrutura**:
  ```json
  {
    "access_token": "<token-opaco-~32-chars>",
    "jsonToken": { "access_token": "..." }
  }
  ```
- **Extração**: `decodeURIComponent(cookie.value)` → `JSON.parse()` → `obj.access_token`
- **Fallbacks**: `obj.jsonToken.access_token`, ou iterar valores buscando `access_token`
- **SSO**: Keycloak em `sso.senior.com.br`

### 2.2 Fontes de token (ordem de prioridade no plugin)
1. **Cookie OAuth** (`com.senior.token`) — mais confiável
2. **seniorToken do storage** — capturado pelo webRequest interceptor, válido por 60 min
3. **Content script interceptor** — captura via monkey-patch de fetch/XHR
4. **Page scan** — varre sessionStorage/localStorage da aba Senior buscando JWTs
- Token válido por ~60 minutos (`TOKEN_MAX_AGE_MS = 60 * 60000`)
- `getSeniorAccessToken()` em `gp-auth.ts` tenta cookie primeiro, depois storage
- `attemptGpAuth()` em `gp-tab-session.ts` usa mesma estratégia de fallback

### 2.3 Header de autenticação
```
Authorization: bearer <access_token>
```
- Usar `bearer` (lowercase b) — é assim que a plataforma envia

---

## 3. Autenticação GestaoPonto

### 3.1 Endpoint de autenticação
```
POST https://gestaoponto.meta.com.br/gestaoponto-backend/api/senior/auth/g7
```

### 3.2 Headers obrigatórios
```
token: <Senior_access_token>    ← token OPACO do cookie, NÃO é JWT
expires: 604800
Content-Type: application/json
Accept: application/json, text/plain, */*
```

### 3.3 Body
```json
{}
```

### 3.4 Response (contém TUDO necessário)
```json
{
  "token": "<JWT-HS256>",
  "colaborador": {
    "id": "1410-1-35829",
    "nome": "GABRIEL GUIMARAES STEIN",
    "numeroCadastro": "35829",
    "numeroEmpresa": "1410",
    "tipoColaborador": "1"
  },
  "userRange": [
    { "condition": "{CodCal=1-470}" }
  ],
  "roles": [...],
  "permissaoCRUD": {...},
  "urlPlataforma": "...",
  "versao": "...",
  "locale": "pt_BR",
  "GPOLite": false,
  "consideraTrocaLocal": false,
  "temSubstituicao": false
}
```

### 3.5 Detalhes importantes
- O header `token` é o `access_token` da Senior (~32 chars, opaco) — **NÃO é um JWT**
- O `token` na **resposta** É um JWT (HS256, issuer: `gestaoponto.meta.com.br`, validade: 7 dias)
- O JWT da resposta é usado como header `assertion` em todas as chamadas GP
- `colaborador.id` formato: `{empresa}-{tipo}-{cadastro}` (ex: `1410-1-35829`)
- `codigoCalculo` extraído de `userRange[].condition` via regex: `CodCal=\d+-(\d+)` → captura o segundo número

### 3.6 Cache e Persistência
- Assertion cacheada por **6 dias** (`GP_CACHE_DURATION_MS = 144 * 3600000`)
  - JWT do GP vale 7 dias, cacheamos 6 dias para margem de segurança
  - Timer reseta toda vez que um novo token Senior é capturado (refresh proativo)
- Invalidada automaticamente em 401/403
- Re-autenticação forçada se cache existe mas `codigoCalculo` está ausente
- `getGpAssertion(force=true)` pula cache e força renovação (usado no refresh proativo)

### 3.7 Refresh/validação de sessão
```
GET /gestaoponto-backend/api/senior/auth
Header: assertion: <JWT>
```

---

## 4. API de Histórico de Ponto (GestaoPonto)

### 4.1 Endpoint
```
GET https://gestaoponto.meta.com.br/gestaoponto-backend/api/acertoPontoColaboradorPeriodo/colaborador/{colaboradorId}
```

### 4.2 Query parameters
| Param | Exemplo | Obrigatório |
|-------|---------|-------------|
| `dataInicial` | `2026-02-27` | Sim |
| `dataFinal` | `2026-02-27` | Sim |
| `orderby` | `-dataApuracao` | Recomendado |
| `codigoCalculo` | `478` | Recomendado (evita erro 400) |

### 4.3 Headers obrigatórios
```
Accept: application/json
assertion: <JWT-do-auth-g7>
zone-offset: <timezone-offset-em-minutos>
```
- `zone-offset`: usar `new Date().getTimezoneOffset()` (ex: `180` para UTC-3)

### 4.4 Response
```json
{
  "apuracao": [
    {
      "dataApuracao": "2026-02-27",
      "marcacoes": [
        { "horaAcesso": "09:02", ... },
        { "horaAcesso": "12:15", ... }
      ],
      "marcacoesPrevistas": ["08:30", "12:00", "13:30", "18:00"]
    }
  ],
  "colaborador": {
    "id": "1410-1-35829",
    "nome": "GABRIEL GUIMARAES STEIN"
  }
}
```

### 4.5 Parsing
- Iterar `apuracao[].marcacoes[].horaAcesso`
- Regex: `/(\d{2}):(\d{2})/`
- Deduplicar e ordenar: `[...new Set(times)].sort()`

### 4.6 Erros comuns
- **400**: geralmente por `codigoCalculo` ausente ou inválido
- **401/403**: assertion expirada → invalidar cache e re-autenticar

---

## 5. Descoberta de colaboradorId e codigoCalculo (via aba GP)

### 5.1 Endpoints para descobrir colaboradorId
Tentados em ordem:
1. `GET /api/usuario/logado`
2. `GET /api/colaborador/logado`
3. `GET /api/periodoAtual`
4. `GET /api/configuracao/colaboradorLogado`
5. **Fallback JWT**: decodifica payload do assertion → `payload.userId` → `GET /api/colaborador/usuario/{userId}`

- Regex de extração: `/"(?:id|colaboradorId|employeeId)"\s*:\s*"(\d+-\d+-\d+)"/`

### 5.2 Endpoints para descobrir codigoCalculo
Tentados em ordem:
1. `GET /api/periodoCalculo/vigente/colaborador/{colabId}`
2. `GET /api/periodoCalculo/aberto/colaborador/{colabId}`
3. **Fallback sessionStorage**: `SeniorGPOSession.userRange[].condition` → regex `CodCal=\d+-(\d+)`
4. **Fallback sessionStorage**: `SeniorGPOSession.codigoCalculo`

- Regex de extração: `/"(?:codigoCalculo|codCalculo|codigo)"[:\s]*"?(\d+)"?/`

### 5.3 SessionStorage do GestaoPonto
- Key: `SeniorGPOSession`
- Contém: `token`, `userRange`, `platformUrl`, `showMenu`, `loginSeniorX`
- Key: `token` (cópia do JWT assertion)

---

## 6. localStorage da Senior X (clockingEventsStorage)

### 6.1 Estrutura
```json
{
  "<employee-uuid>": {
    "clockingEventImported": [
      { "dateEvent": "2026-02-27", "timeEvent": "09:02:41.557" },
      { "dateEvent": "2026-02-27", "timeEvent": "12:15:03.221" }
    ]
  }
}
```

### 6.2 Detalhes
- `dateEvent`: formato `YYYY-MM-DD`
- `timeEvent`: formato `HH:mm:ss.SSS`
- Eventos de **múltiplos dias** são armazenados juntos → **filtrar por data**
- O UUID do employee é a chave raiz
- Pode conter múltiplas arrays (chaves diferentes), por isso iteramos `Object.values` buscando arrays

### 6.3 Extração de horários
- Para cada evento com `dateEvent` começando com `todayDateStr()`:
  - Tenta `timeEvent` via regex `/(\d{2}):(\d{2})/`
  - Fallback: `dateEvent` contendo `T` (formato ISO) via regex `/T(\d{2}):(\d{2})/`

### 6.4 Limitação
- Só funciona se o usuário tem uma aba `platform.senior.com.br` aberta
- É a fonte **mais confiável** (sem necessidade de token/API)
- Dados podem estar desatualizados se a aba não fez refresh

---

## 7. APIs de Batimento da Senior Platform

### 7.1 Endpoint para bater ponto
```
POST https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest/hcm/pontomobile_clocking_event/actions/clockingEventImportByBrowser
```
- **Serviço**: `hcm/pontomobile_clocking_event` (NÃO `pontomobile` ou `pontomobile_bff`)

### 7.2 Endpoint para config do colaborador
```
POST https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest/hcm/pontomobile_bff/queries/getEmployeeClockingConfigQuery
Body: {}
```
Response contém `employeeClockingConfig` com:
- `employee`: { id, arpId, cpf, pis, company }
- `company`: { id, arpId, identifier (=cnpj), caepf, cnoNumber }
- `timeZone`: ex. "America/Sao_Paulo"
- `clockingEventUses`: [{ code: "02" }]

### 7.3 Body do batimento
```json
{
  "clockingInfo": {
    "company": {
      "id": "<uuid>",
      "arpId": "<int>",
      "identifier": "<cnpj>",
      "caepf": "0",
      "cnoNumber": "0"
    },
    "employee": {
      "id": "<uuid>",
      "arpId": "<int>",
      "cpf": "<cpf>",
      "pis": "<pis>"
    },
    "appVersion": "3.22.1",
    "timeZone": "America/Sao_Paulo",
    "skipValidation": false,
    "clientDateTimeEvent": "YYYY-MM-DD HH:mm:ss",
    "signature": {
      "signatureVersion": 1,
      "signature": "<base64-sha256>"
    },
    "use": "02",
    "geolocation": {
      "latitude": <float>,
      "longitude": <float>,
      "dateAndTime": "<ISO8601>"
    }
  }
}
```

### 7.4 Signature
```
input     = PIS + CNPJ/identifier + clientDateTimeEvent
hash      = SHA-256(input)
hex       = Array.from(hashBuffer).map(b => b.toString(16).padStart(2,'0')).join('')
signature = btoa(hex)
```
- `signatureVersion`: sempre `1`
- Se falhar, tenta sem signature como fallback

### 7.5 Campo `company.identifier`
- Usa `identifier` (= CNPJ), **NÃO** um campo chamado `cnpj`
- Fallback: `comp.cnpj || comp.identifier`

### 7.6 Estratégia de retry
1. Envio normal
2. Com `skipValidation: true`
3. Sem campo `signature` (e `skipValidation: false`)

### 7.7 Response de sucesso
```json
{
  "clockingResult": {
    "clockingEventImported": {
      "dateEvent": "2026-02-27",
      "timeEvent": "09:02:41.557"
    }
  }
}
```
- Status: 200, 201, ou 202 = sucesso

---

## 8. Endpoints de Consulta de Batimentos (Senior Platform)

O plugin tenta **11 endpoints** em sequência até encontrar um que retorne dados:

| # | Endpoint | Método | Body |
|---|----------|--------|------|
| 1 | `/hcm/pontomobile_bff/queries/getClockingEventsQuery` | POST | `{}` |
| 2 | `/hcm/pontomobile_bff/queries/getLastClockingEventsQuery` | POST | `{}` |
| 3 | `/hcm/pontomobile_bff/queries/getEmployeeClockingEventsQuery` | POST | `{}` |
| 4 | `/hcm/pontomobile_clocking_event/queries/listClockingEvent` | POST | `{}` |
| 5 | `/hcm/pontomobile_clocking_event/queries/getClockingEvent` | POST | `{}` |
| 6 | `/hcm/pontomobile_clocking_event/queries/clockingEventList` | POST | `{ startDate, endDate }` |
| 7 | `/hcm/pontomobile_clocking_event/queries/getClockingEventByEmployee` | POST | `{ startDate, endDate }` |
| 8 | `/hcm/pontomobile_clocking_event/entities/clockingEvent` | GET | — |
| 9 | `/hcm/pontomobile_clocking_event/queries/getByDate` | POST | `{ date }` |
| 10 | `/hcm/gestao_ponto/queries/getMarcacoes` | POST | `{ dataInicio, dataFim }` |
| 11 | `/hcm/gestao_ponto/queries/getClockingsByPeriod` | POST | `{ startDate, endDate }` |

- Base: `https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest`
- Todos com header `Authorization: bearer <token>`
- O endpoint que funcionar é **cacheado** para chamadas subsequentes

### 8.1 Parser genérico de response
- Percorre recursivamente o JSON
- Busca chaves contendo: `hora`, `time`, `marcac`, `clocking`, `batida`, `entrada`, `saida`, `almoco`
- Valida formato `HH:mm` com horas entre 05 e 22
- Deduplicado e ordenado

---

## 9. Mecanismo de Fetch via Aba GP

### 9.1 Fluxo
1. Busca aba existente com URL contendo `gestaoponto`
2. Se não existe e `allowCreate=true`: cria aba com `GP_FRONTEND_URL` (inactive)
3. Aguarda sessão (`SeniorGPOSession.token` no sessionStorage): até 45s se aba criada, 15s se existente
4. Durante espera:
   - Se aba sair do domínio GP (SSO em andamento via Keycloak): apenas aguarda sem interferir
   - A cada 3s: tenta autenticação injetando fetch para `/senior/auth/g7` usando token do cookie ou storage
   - Se `SeniorGPOSession.token` aparecer: sessão pronta
5. Executa fetch dos dados via `chrome.scripting.executeScript` (world: MAIN)
6. Fecha aba se foi criada pelo plugin

**Importante**: Não redirecionar a aba para `platform.senior.com.br` manualmente — isso interrompe o fluxo SSO natural do GP SPA (que redireciona para Keycloak em `sso.senior.com.br`).

### 9.2 URL do frontend GP
```
https://gestaoponto.meta.com.br/gestaoponto-frontend/?portal=g7&showMenu=S
```

### 9.3 Sessão GP injetada
Ao autenticar via aba, seta no `sessionStorage`:
```json
{
  "token": "<JWT>",
  "platformUrl": "...",
  "showMenu": "S",
  "loginSeniorX": true,
  "userRange": [...]
}
```
- Também seta `sessionStorage.token = <JWT>` (separado)

---

## 10. Interceptação de Requests

### 10.1 Background (webRequest)
```
chrome.webRequest.onSendHeaders
URLs: ['https://platform.senior.com.br/*', 'https://*.senior.com.br/*']
Extrai: Authorization: Bearer <token>
Salva: seniorToken + seniorTokenTs
```

**Refresh Proativo**: Quando `seniorToken` é salvo no storage (= usuário navegou no Senior):
1. Background detecta mudança via `chrome.storage.onChanged`
2. Chama `getGpAssertion(force=true)` — ignora cache, força nova autenticação
3. Reseta `gpAssertionTs = Date.now()` — timer de 6 dias reinicia
4. Limpa caches de providers e re-detecta punches

Isso garante que o assertion GP sempre tenha validade máxima enquanto o usuário usar o Senior regularmente.

### 10.2 Content Script (interceptor.content.ts)
Monkey-patches `fetch` e `XMLHttpRequest` na página para capturar:
- **Bearer tokens**: de requests para `senior.com.br` → evento `__sponto_bearer`
- **GP assertions**: header `assertion` em requests para `gestaoponto.meta.com.br/api/` → evento `__sponto_gestao_ponto`
- **Punch API calls**: POST/PUT para URLs com `clocking`/`pontomobile`/`ponto` → evento `__sponto_api_spy`
- **Punch success**: response OK de `clockingEventImportByBrowser` → evento `__sponto_punch_success`

### 10.3 Comunicação interceptor → content script → storage
```
Página (MAIN world) → CustomEvent → Content Script (ISOLATED world) → chrome.storage.local
```
O interceptor roda em MAIN world e não tem acesso direto a `chrome.storage`. Eventos customizados são o bridge.

---

## 11. Cookies relevantes

| Cookie | Domínio | Conteúdo |
|--------|---------|----------|
| `com.senior.token` | `.senior.com.br` | URL-encoded JSON com `access_token` |
| `br.com.senior.gp.backend` | `.senior.com.br` | URL do backend GP |

---

## 12. Lições Aprendidas

1. **Dois sistemas, duas autenticações**: Senior usa OAuth/Bearer, GestaoPonto usa assertion JWT. São completamente independentes.

2. **O token da Senior é opaco**: ~32 chars, não é JWT. O token GP É JWT (HS256).

3. **codigoCalculo é essencial**: Sem ele, a API GP retorna 400. Está dentro de `userRange[].condition` no formato `{CodCal=1-470}` — o segundo número é o código.

4. **zone-offset é obrigatório**: Header nas chamadas GP. Usar `getTimezoneOffset()`.

5. **clockingEventsStorage é a fonte mais confiável**: Não precisa de token, não faz request. Mas depende de ter aba Senior aberta.

6. **A API de batimento usa `identifier` não `cnpj`**: Campo da company no payload.

7. **Signature pode ser opcional**: Algumas instâncias aceitam sem signature. O plugin tenta 3 variações.

8. **Content scripts em MAIN world não acessam chrome.storage**: A comunicação é via CustomEvents para o content script em ISOLATED world, que então grava no storage.

9. **sessionStorage do GP contém tudo**: Token, userRange, colaborador. Key: `SeniorGPOSession`.

10. **A API de consulta de batimentos da Senior não é documentada**: Testamos 11 endpoints diferentes. O que funciona varia por instalação.

11. **O GP auth/g7 retorna tudo em uma chamada**: colaboradorId, codigoCalculo (via userRange), assertion. Não precisa de múltiplas chamadas.

12. **Fetch direto vs via aba**: Fetch direto funciona do background/popup (CORS OK para a API GP). Via aba é fallback quando a autenticação direta falha.

13. **GP assertion dura 7 dias**: Cacheamos por 6 dias com refresh proativo. Quando o usuário acessa o Senior (token capturado pelo webRequest), o assertion é renovado automaticamente, resetando o timer. Na prática, se o usuário acessar o Senior 1x por semana, o plugin nunca pede login.

14. **O pontomobile não tem API de histórico**: Apenas `clockingEventImportByBrowser` (para BATER ponto) e `getEmployeeClockingConfigQuery` (para CONFIG). Consultas de histórico são impossíveis via Senior — só via GP.
