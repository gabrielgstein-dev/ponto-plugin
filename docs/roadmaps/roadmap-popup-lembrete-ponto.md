# Roadmap — Popup de Lembrete de Ponto

**Objetivo:** Substituir o lembrete simples de chrome.notifications por um Popup visual (estilo `ts-notification`) que aparece no horário exato do ponto, re-exibe a cada 5 minutos enquanto o ponto não for batido, e encerra **somente quando o ponto daquele slot específico for registrado**.

**Restrições de janela ativa:** O popup só pode aparecer dentro da janela de trabalho do dia — após o ponto de entrada ter sido batido e antes do ponto de saída ter sido registrado.

---

## Fluxos Críticos

| ID | Fluxo | Descrição | Status |
|----|-------|-----------|--------|
| P1 | **Popup no horário exato** | Popup abre quando chega o horário previsto do ponto | 🔲 Pendente |
| P2 | **Re-exibição a cada 5 min** | Se o ponto não for batido, popup reaparece após 5 minutos | 🔲 Pendente |
| P3 | **Verificação do slot correto** | O sistema verifica se o ponto batido é **aquele slot específico**, não qualquer ponto | 🔲 Pendente |
| P4 | **Um popup por vez** | Se um popup já está aberto, não abre outro | 🔲 Pendente |
| P5 | **Encerramento preciso** | Popup para ao bater o ponto correto; próximo slot só começa no horário dele | 🔲 Pendente |
| P6 | **Apenas após entrada** | Popup nunca abre se o ponto de entrada ainda não foi registrado | 🔲 Pendente |
| P7 | **Nunca após o último ponto** | Popup nunca abre (ou reabre) se o ponto de saída já foi registrado | 🔲 Pendente |

---

## Modelo Mental — Ciclo de Vida do Popup

```
HH:MM (horário do slot)
    │
    ▼
Guard P6: pontoState.entrada existe?  ──── NÃO ──→ abortar (não iniciou jornada)
    │ SIM
    ▼
Guard P7: pontoState.saida existe?    ──── SIM ──→ abortar (jornada encerrada)
    │ NÃO
    ▼
punchReminderManager.startReminder(slot, expectedTime)
    │  salva: punchPopupSlot, punchPopupExpectedTime
    │  abre janela popup (se nenhuma aberta)
    │  salva: punchPopupWindowId
    │
    ├── 5 min sem bater ponto desse slot?
    │       │
    │       ▼
    │   alarm `punch_recheck`
    │       │
    │       ├── pontoState.saida existe? → resolveReminder(), NÃO reabrir (P7)
    │       ├── janela ainda aberta? → não fazer nada (P4)
    │       ├── ponto do slot batido? → limpar tudo, NÃO reabrir (P5)
    │       └── ponto NÃO batido? → abrir popup + reagendar recheck (P2)
    │
    └── ponto batido (storage.onChanged detecta pontoState.{slot})
            │
            ▼
        punchReminderManager.resolveReminder(slot)
            │  fecha janela (se aberta)
            │  cancela alarm `punch_recheck`
            │  limpa storage keys
```

---

## Arquitetura — Componentes

### Novos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `public/punch-reminder.html` | HTML do popup de lembrete (estilo `ts-notification.html`) |
| `public/punch-reminder.js` | JS do popup — lê query params, renderiza slot + horário, botão "Entendido" |
| `lib/application/punch-reminder-manager.ts` | Lógica central: `startReminder()`, `resolveReminder()`, `recheckReminder()` |

### Modificados

| Arquivo | Mudança |
|---------|---------|
| `lib/application/schedule-notifications.ts` | Chamar `startReminder()` no lugar do `reminder_*` alarm para almoco/volta/saida |
| `entrypoints/background.ts` | Registrar handler para alarm `punch_recheck` |
| `lib/application/handle-alarm.ts` | Delegar alarm `punch_recheck` ao `recheckReminder()` |
| `lib/domain/types.ts` | Adicionar chaves de storage: `punchPopupSlot`, `punchPopupWindowId`, `punchPopupExpectedTime` |

---

## Storage Keys Novas

| Chave | Tipo | Descrição |
|-------|------|-----------|
| `punchPopupSlot` | `'almoco' \| 'volta' \| 'saida' \| null` | Slot sendo monitorado |
| `punchPopupExpectedTime` | `string \| null` | Horário previsto no formato `HH:MM` |
| `punchPopupWindowId` | `number \| null` | ID da janela popup aberta (null = fechada) |

---

## P1: Popup abre no horário exato do ponto

### Lógica

Em `schedule-notifications.ts`, quando a hora `reminder_almoco` / `reminder_volta` / `reminder_saida` chegaria, **chamar `startReminder(slot, expectedTime)`** ao invés de criar um `chrome.notifications`.

`startReminder(slot, expectedTime)`:
1. **Guard P6:** Verifica `pontoState.entrada` — se null, aborta silenciosamente
2. **Guard P7:** Verifica `pontoState.saida` — se preenchido, aborta silenciosamente
3. Salva `punchPopupSlot = slot` e `punchPopupExpectedTime = expectedTime` em storage
4. Verifica se `punchPopupWindowId` já existe com janela aberta → se sim, não abre (P4)
5. Abre `punch-reminder.html?slot={slot}&time={expectedTime}` via `chrome.windows.create()`
6. Salva o novo `windowId` em `punchPopupWindowId`
7. Agenda alarm `punch_recheck` para daqui 5 minutos

### Checklist

- [ ] **P1.1** Popup abre exatamente no horário configurado (`_almocoSugerido`, `_voltaSugerida`, `_saidaEstimada`)
- [ ] **P1.2** HTML do popup exibe o nome do slot ("Hora do Almoço!", "Hora de Voltar!", "Hora de Sair!") e o horário previsto
- [ ] **P1.3** Popup NÃO abre antes do horário (sem antecipar, diferente das `notif_*`)
- [ ] **P1.4** Storage keys são gravadas antes de abrir a janela
- [ ] **P1.5** Guards P6 e P7 são verificados ANTES de gravar qualquer storage key

---

## P2: Re-exibição a cada 5 minutos

### Lógica

Alarm `punch_recheck` → `recheckReminder()`:
1. Lê `punchPopupSlot` do storage. Se null → nada a fazer
2. Verifica se `punchPopupWindowId` existe e janela ainda está aberta (`chrome.windows.get()`)
   - Se aberta → **não faz nada** (popup já está visível)
3. Verifica se o slot foi batido (`pontoState[slot]` existe e não é null)
   - Se batido → `resolveReminder()` e encerra
4. Slot ainda não batido + janela fechada → reabre popup, salva novo `windowId`, reagenda `punch_recheck`

### Checklist

- [ ] **P2.1** Alarm `punch_recheck` é criado com `delayInMinutes: 5`
- [ ] **P2.2** A cada recheck, o popup reaparece se o ponto não foi batido
- [ ] **P2.3** O contador é reiniciado (alarm novo de 5min) após cada reexibição
- [ ] **P2.4** Se o usuário fechar a janela manualmente, o próximo recheck reabre

---

## P3: Verificação do slot correto

### Lógica — O Problema

O usuário pode bater entrada (slot anterior) com o sistema ainda monitorando almoco. Ou bater saída diretamente. A verificação deve ser **exclusiva do slot em monitoramento**.

Mapeamento: `punchPopupSlot → pontoState.{slot}`

```typescript
const SLOT_STATE_MAP = {
  almoco: 'almoco',
  volta:  'volta',
  saida:  'saida',
} as const;

function isSlotPunched(slot: PunchSlot, pontoState: PontoState): boolean {
  return !!pontoState[SLOT_STATE_MAP[slot]];
}
```

### Checklist

- [ ] **P3.1** Bater almoço → popup do almoço some (ponto correto)
- [ ] **P3.2** Bater entrada (ação errada) com popup de almoço aberto → popup **não** some
- [ ] **P3.3** Bater saída antecipada com popup de volta aberto → popup de volta **não** some
- [ ] **P3.4** `resolveReminder()` só é chamado quando `pontoState[slot]` tem valor

---

## P4: Apenas um popup por vez

### Lógica

Antes de abrir qualquer janela, verificar:

```typescript
const { punchPopupWindowId } = await chrome.storage.local.get('punchPopupWindowId');
if (punchPopupWindowId) {
  try {
    await chrome.windows.get(punchPopupWindowId); // lança se janela não existe
    return; // janela ainda aberta, não abre outra
  } catch {
    // janela foi fechada manualmente — limpar
    await chrome.storage.local.remove('punchPopupWindowId');
  }
}
```

### Checklist

- [ ] **P4.1** Segundo popup não abre se há uma janela já visível
- [ ] **P4.2** Se a janela foi fechada manualmente, o próximo recheck detecta e reabre normalmente
- [ ] **P4.3** `chrome.windows.onRemoved` listener atualiza `punchPopupWindowId = null` quando popup é fechado

---

## P5: Encerramento preciso ao bater o ponto correto

### Lógica

`resolveReminder(slot)`:
1. Verifica se `punchPopupSlot === slot` (garante que é o slot correto)
2. Cancela alarm `punch_recheck` via `chrome.alarms.clear('punch_recheck')`
3. Fecha janela popup se ainda aberta (`chrome.windows.remove(punchPopupWindowId)`)
4. Limpa todas as storage keys: `punchPopupSlot`, `punchPopupWindowId`, `punchPopupExpectedTime`

O trigger vem do `storage.onChanged` já existente em `background.ts` — quando `pontoState` muda, verificar se o slot monitorado foi preenchido.

### Checklist

- [ ] **P5.1** Ao bater almoço, popup do almoço fecha e não reabre
- [ ] **P5.2** `punch_recheck` alarm é cancelado após resolução
- [ ] **P5.3** Storage keys são limpas corretamente
- [ ] **P5.4** Sistema fica inativo até chegar o horário do próximo slot (volta, saida)
- [ ] **P5.5** Quando chega a hora da volta, um novo ciclo começa do zero (P1)

---

## P6: Popup só abre após o ponto de entrada

### Lógica — O Problema

Se o horário do almoço (12:00) chega mas o usuário ainda não bateu entrada — seja porque começou a trabalhar tarde, seja porque o plugin foi aberto depois — nenhum popup deve aparecer. O ciclo de lembretes só faz sentido dentro de uma jornada ativa.

`startReminder()` e `recheckReminder()` devem verificar `pontoState.entrada !== null` **antes** de qualquer outra ação.

```typescript
const { pontoState } = await chrome.storage.local.get('pontoState');
if (!pontoState?.entrada) return; // jornada não iniciada — aborta
```

### Checklist

- [ ] **P6.1** Alarm chega para almoço, mas entrada é null → popup NÃO abre
- [ ] **P6.2** Alarm chega para volta, mas entrada é null → popup NÃO abre
- [ ] **P6.3** Alarm chega para saída, mas entrada é null → popup NÃO abre
- [ ] **P6.4** `punch_recheck` dispara sem entrada registrada → não reabre popup
- [ ] **P6.5** Usuário bate entrada depois do horário do almoço → popup do almoço só aparece no PRÓXIMO recheck agendado (não retroativo)

> **Nota P6.5:** O alarm para o almoço pode já ter disparado antes da entrada. Não há reativação retroativa de alarms — o usuário simplesmente perde o lembrete daquele slot se bater entrada após o horário dele.

---

## P7: Popup nunca abre após o ponto de saída

### Lógica — O Problema

O ponto de saída encerra a jornada. Após ele ser registrado, o sistema não deve exibir ou reexibir nenhum popup de lembrete — nem abrir novos, nem reagendar rechecks.

Isso é especialmente importante para o `punch_recheck` que pode estar agendado para 5 minutos depois e disparar após a saída já ter sido batida.

`startReminder()`, `recheckReminder()` e `resolveReminder()` devem verificar `pontoState.saida === null` antes de abrir janelas ou reagendar alarms.

```typescript
const { pontoState } = await chrome.storage.local.get('pontoState');
if (pontoState?.saida) {
  // jornada encerrada — cancelar tudo e limpar
  await chrome.alarms.clear('punch_recheck');
  await chrome.storage.local.remove(['punchPopupSlot', 'punchPopupWindowId', 'punchPopupExpectedTime']);
  return;
}
```

Adicionalmente, o `storage.onChanged` que monitora `pontoState` deve chamar `resolveReminder('saida')` quando `saida` é preenchido — isso encerra qualquer popup de volta que ainda esteja aberto.

### Checklist

- [ ] **P7.1** Usuário bate saída com popup de volta aberto → popup fecha imediatamente
- [ ] **P7.2** `punch_recheck` dispara após saída registrada → não abre popup, cancela alarm
- [ ] **P7.3** Alarm de saída dispara depois que saída já foi batida → `startReminder` aborta
- [ ] **P7.4** Storage keys são limpas quando saída é detectada
- [ ] **P7.5** Nenhum popup abre após saída, mesmo que `punchPopupSlot` ainda esteja no storage por alguma razão

---

## Implementação — Passo a Passo

### Passo 1 — Storage types
Adicionar as 3 novas chaves em `lib/domain/types.ts`.

### Passo 2 — HTML/JS do popup
Criar `public/punch-reminder.html` e `public/punch-reminder.js` baseados no modelo `ts-notification.html`:
- Ler `?slot=almoco&time=12:00` dos query params
- Exibir mensagem contextual por slot
- Botão "Entendido" fecha a janela (`window.close()`)
- Estilo dark-theme consistente com o restante do plugin

### Passo 3 — punch-reminder-manager.ts
Implementar as três funções: `startReminder`, `recheckReminder`, `resolveReminder`.
Incluir guard contra dupla abertura (P4) e verificação de slot correto (P3).

### Passo 4 — Integrar no background.ts
- `chrome.windows.onRemoved` → limpar `punchPopupWindowId` se for o popup de lembrete
- `chrome.storage.onChanged` → quando `pontoState` muda, chamar `recheckReminder` para resolver se slot foi batido
- Alarm handler para `punch_recheck` → chamar `recheckReminder()`

### Passo 5 — Ajustar schedule-notifications.ts
- Nos pontos onde `reminder_almoco`, `reminder_volta`, `reminder_saida` eram criados com `chrome.alarms.create()`, substituir pela chamada direta a `startReminder(slot, expectedTime)` quando o horário chegou, **ou** manter o alarm mas no handler chamar `startReminder` em vez de `chrome.notifications.create`.

### Passo 6 — Testes unitários
Cobrir `punch-reminder-manager.ts` com vitest.

### Passo 7 — Testes E2E
Suite Playwright para todos os cenários críticos.

---

## Testes

### Testes Unitários (vitest)

**Arquivo:** `tests/unit/punch-reminder-manager.test.ts`

```typescript
// Cenários:
// U1  — startReminder cria storage keys e abre janela
// U2  — startReminder não abre se janela já está aberta
// U3  — recheckReminder fecha ciclo se slot foi batido
// U4  — recheckReminder reabre se slot não foi batido e janela fechada
// U5  — recheckReminder não abre se janela já está aberta
// U6  — resolveReminder cancela alarm e limpa storage
// U7  — resolveReminder NÃO resolve se slot não bate com punchPopupSlot
// U8  — isSlotPunched retorna false para slot errado
// U9  — isSlotPunched retorna true apenas para o slot correto
// U10 — startReminder aborta se entrada é null (P6)
// U11 — recheckReminder aborta se entrada é null (P6)
// U12 — startReminder aborta se saida está preenchida (P7)
// U13 — recheckReminder cancela tudo se saida está preenchida (P7)
// U14 — saida sendo registrada enquanto popup aberto → resolveReminder chamado (P7)
```

### Testes E2E (Playwright)

**Arquivo:** `tests/e2e/punch-reminder-popup.spec.ts`

#### E2E-P1: Popup abre no horário exato

```gherkin
Dado que o usuário bateu entrada às 09:00
E o almoço está previsto para 12:00
Quando o relógio chega às 12:00
Então o popup de lembrete do almoço deve aparecer
E deve exibir "Hora do Almoço!" e "12:00"
E o alarm punch_recheck deve estar agendado para 5 minutos
```

#### E2E-P2: Re-exibição a cada 5 minutos

```gherkin
Dado que o popup de almoço está visível às 12:00
Quando o usuário fecha a janela sem bater o ponto
E passam 5 minutos (12:05)
Então um novo popup de almoço deve aparecer
E um novo recheck deve ser agendado para 12:10
```

```gherkin
Dado que o popup de almoço está visível às 12:00
Quando o usuário NÃO fecha a janela e NÃO bate o ponto
E o alarm punch_recheck dispara às 12:05
Então nenhum segundo popup deve ser aberto
E o recheck deve ser reagendado para 12:10
```

#### E2E-P3: Verifica o slot correto

```gherkin
Dado que o popup de almoço está visível às 12:00
Quando o usuário bate ENTRADA (slot errado)
Então o popup de almoço deve PERMANECER aberto
E punchPopupSlot deve continuar sendo 'almoco'
```

```gherkin
Dado que o popup de volta está visível às 13:00
Quando o usuário bate SAÍDA (slot errado)
Então o popup de volta deve PERMANECER aberto
E punchPopupSlot deve continuar sendo 'volta'
```

```gherkin
Dado que o popup de almoço está visível às 12:00
Quando o usuário bate ALMOÇO (slot correto)
Então o popup de almoço deve FECHAR
E punchPopupSlot deve ser null no storage
E punch_recheck alarm deve ser cancelado
```

#### E2E-P4: Apenas um popup por vez

```gherkin
Dado que o popup de almoço já está aberto
Quando o alarm punch_recheck dispara
Então nenhuma nova janela deve ser criada (chrome.windows.create NÃO chamado)
E o ID da janela existente deve ser mantido no storage
```

#### E2E-P5: Encerramento preciso

```gherkin
Dado que o usuário bateu o almoço (popup fechado)
Quando o usuário ainda não bateu a volta
E o horário da volta (13:00) chega
Então um NOVO popup de volta deve aparecer
E punchPopupSlot deve ser 'volta'
```

```gherkin
Dado que o usuário completou toda a jornada (entrada, almoço, volta, saída)
Então nenhum popup de lembrete deve aparecer
E punchPopupSlot deve ser null
```

#### E2E-P6: Popup só abre após entrada

```gherkin
Dado que o usuário NÃO bateu entrada hoje
Quando o horário do almoço (12:00) chega
Então nenhum popup deve aparecer
E punchPopupSlot deve continuar null no storage
```

```gherkin
Dado que o usuário NÃO bateu entrada hoje
Quando o alarm punch_recheck dispara (de um ciclo anterior remanescente)
Então nenhum popup deve ser reaberto
E o alarm punch_recheck deve ser cancelado
```

```gherkin
Dado que o horário do almoço (12:00) passou sem entrada registrada
Quando o usuário bate entrada às 12:30
Então nenhum popup retroativo de almoço deve aparecer
E o popup do almoço NÃO deve ser disparado fora de hora
```

#### E2E-P7: Popup nunca abre após saída

```gherkin
Dado que o popup de volta está visível às 13:00
Quando o usuário bate SAÍDA (encerra jornada)
Então o popup de volta deve FECHAR imediatamente
E punch_recheck alarm deve ser cancelado
E punchPopupSlot deve ser null
```

```gherkin
Dado que o usuário bateu saída às 18:00
Quando o alarm punch_recheck dispara às 18:05 (agendado antes da saída)
Então nenhum popup deve aparecer
E o alarm deve ser cancelado sem reabrir
```

```gherkin
Dado que o usuário bateu saída às 18:00
E punchPopupSlot ainda está no storage com valor 'volta' (estado inconsistente)
Quando qualquer ação tenta abrir popup
Então o popup NÃO deve abrir
E o storage deve ser limpo
```

#### E2E-P9: Reset diário

```gherkin
Dado que o alarm dailyReset dispara à meia-noite
Então punchPopupSlot, punchPopupWindowId e punchPopupExpectedTime devem ser limpos
E qualquer janela de popup aberta deve ser fechada
E qualquer alarm punch_recheck deve ser cancelado
```

---

## Matriz de Riscos

| ID | Risco | Mitigação |
|----|-------|-----------|
| R1 | Janela fechada pelo OS mas ID ainda no storage | `chrome.windows.get()` com try/catch detecta e limpa |
| R2 | Dois alarms `punch_recheck` simultâneos | `chrome.alarms.clear('punch_recheck')` antes de recriar |
| R3 | `pontoState` nulo ao fazer recheck | Guard com `if (!pontoState) return` antes de verificar slot |
| R4 | Usuário muda o horário do almoço nas settings | `resolveReminder` + novo `startReminder` ao detectar mudança no `pontoSettings` |
| R5 | Popup aberto após bater o ponto (race condition) | Verificar slot antes de abrir janela; `resolveReminder` no `storage.onChanged` |
| R6 | dailyReset não limpa popup aberto | Adicionar `resolveReminder()` explícito no handler `dailyReset` |
| R7 | Alarm do almoço dispara antes da entrada ser registrada (P6) | Guard `if (!pontoState?.entrada) return` no início de `startReminder` e `recheckReminder` |
| R8 | `punch_recheck` ainda agendado após saída ser batida (P7) | `storage.onChanged` detecta `saida` preenchido → cancela alarm e limpa storage imediatamente |
| R9 | Estado inconsistente: `punchPopupSlot` no storage após saída | Guard P7 em `recheckReminder` limpa qualquer estado residual antes de tentar abrir janela |

---

## Dashboard de Status

| Data | Responsável | Passo | Resultado |
|------|-------------|-------|-----------|
| — | — | — | — |
