/**
 * E2E — a corrente da batida automática está ligada de ponta a ponta.
 *
 * Por que existe: em 2026-09 o auto-punch parou de bater e NENHUM teste
 * quebrou. Um merge apagou dois elos — o dispatch de `autopunch_*` no
 * `chrome.alarms.onAlarm` (background.ts) e as chamadas a `scheduleAutoPunch`
 * no ciclo de detecção. Os testes existentes cobriam as pontas (o agendador
 * isolado, o handler isolado, o banner na tela) e nenhum cobria a ligação entre
 * elas. Só o e2e, na extensão realmente compilada e carregada no Chrome, prova
 * que o alarme chega ao handler.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURANÇA: ESTA SUÍTE NUNCA REGISTRA PONTO.
 *
 * Não existe ambiente de teste do Senior — uma batida aqui é uma batida no
 * cartão real. Três barreiras independentes garantem que isso não acontece:
 *
 *   1. `context.route('**\/*')` ABORTA toda requisição http(s). Nada desta
 *      suíte alcança a internet — nem o Senior, nem qualquer outro host.
 *   2. O endpoint de import (`clockingEventImportByBrowser`) tem tratamento
 *      próprio: é contado em `importAttempts` e abortado. O teste FALHA se o
 *      contador sair de zero, então uma futura regressão que tente bater é
 *      denunciada em vez de passar batido.
 *   3. O perfil do Chrome é temporário e sem credenciais Senior. Sem token, a
 *      cadeia de auth nem chega ao POST — o caminho de escrita é inalcançável
 *      por construção, não só por interceptação.
 *
 * O que o teste observa é a corrente ATÉ o Senior: o alarme dispara, o handler
 * roda, a extensão vai buscar a aba do Senior — e para ali, sem sessão.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Pré-requisito: `pnpm build:insi:debug` (precisa de ENABLE_AUTO_PUNCH ligado).
 */
import { test, expect } from '@playwright/test'
import { launchExtension, completeOnboarding } from './helpers/extension'
import type { BrowserContext } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

/** O POST que registra o ponto. Se esta string aparecer na rede, falhamos. */
const IMPORT_ENDPOINT = 'clockingEventImportByBrowser'

let ctx: BrowserContext
let popupUrl: string
let tmpDir: string
let autoPunchBuilt = false

/** URLs do Senior que a EXTENSÃO pediu (a barreira respondeu por elas). */
let seniorHits: string[] = []
/** Tentativas de registrar ponto. Precisa terminar vazio em todo teste. */
let importAttempts: string[] = []
/** Qualquer outro host que a extensão tentou alcançar — todos abortados. */
let blocked: string[] = []

const LOGIN_STUB =
  '<!doctype html><html><body><h1>Senior — login</h1></body></html>'

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-apwiring-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  popupUrl = fixture.popupUrl
  await completeOnboarding(ctx)

  // ── Barreira de rede (ver cabeçalho) ──────────────────────────────────────
  await ctx.route('**/*', async route => {
    const url = route.request().url()
    if (!/^https?:/i.test(url)) return route.continue()

    if (url.includes(IMPORT_ENDPOINT)) {
      importAttempts.push(url)
      return route.abort()
    }

    if (url.includes('senior.com.br')) {
      seniorHits.push(url)
      const isDocument = route.request().resourceType() === 'document'
      if (isDocument && !url.includes('/login')) {
        // Sem sessão, o Senior joga o navegador no login. Reproduzir isso é
        // fiel ao cenário real de um perfil sem credenciais — e faz o
        // `ensureSeniorTab` desistir em segundos (heurística LOGIN_URL_RE) em
        // vez de queimar os 30s do READY_TIMEOUT.
        return route.fulfill({
          status: 302,
          headers: { location: 'https://platform.senior.com.br/login' },
        })
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: LOGIN_STUB })
    }

    blocked.push(url)
    return route.abort()
  })

  // Sonda: o build tem ENABLE_AUTO_PUNCH? (mesma lógica de auto-punch-indicator)
  await seed({
    pontoSettings: {
      autoPunchEnabled: true,
      autoPunchSlots: { entrada: true, almoco: true, volta: true, saida: true },
    },
  })
  const probe = await ctx.newPage()
  await probe.goto(popupUrl)
  await probe.waitForLoadState('domcontentloaded')
  autoPunchBuilt = (await probe.locator('.card-auto-badge').count()) > 0
  await probe.close()
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test.beforeEach(() => {
  seniorHits = []
  importAttempts = []
  blocked = []
})

/**
 * Invariante da suíte inteira: rodou o que rodou, ponto NENHUM foi registrado.
 * Fica no afterEach para valer também nos testes que falharem por outro motivo.
 */
test.afterEach(() => {
  expect(
    importAttempts,
    `A suíte tentou REGISTRAR PONTO no Senior (${importAttempts.length}x). ` +
      `A requisição foi abortada pela barreira, mas o caminho de escrita foi ` +
      `alcançado — investigue antes de rodar qualquer coisa com credenciais.`,
  ).toEqual([])
})

async function sw() {
  const worker = ctx.serviceWorkers()[0]
  if (!worker) throw new Error('Service worker não disponível')
  return worker
}

async function seed(data: Record<string, unknown>) {
  const worker = await sw()
  await worker.evaluate(async d => {
    await chrome.storage.local.set(d as Record<string, unknown>)
  }, data as never)
}

/** Concatena os logs de auditoria (ring `pinned`) numa string pesquisável. */
async function auditLogText(): Promise<string> {
  const worker = await sw()
  return worker.evaluate(async () => {
    const data = await chrome.storage.local.get('appLogsPinned')
    const entries = (data.appLogsPinned ?? []) as Array<{ msg: string }>
    return entries.map(e => e.msg).join('\n')
  })
}

async function clearAudit() {
  const worker = await sw()
  await worker.evaluate(async () => {
    await chrome.storage.local.remove(['appLogsPinned', 'appLogs', 'autoPunchLastResult'])
  })
}

/** HH:MM daqui a N minutos — mantém o agendamento sempre no futuro. */
function inMinutes(n: number): string {
  const d = new Date(Date.now() + n * 60_000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const BASE_SETTINGS = {
  autoPunchEnabled: true,
  autoPunchSlots: { entrada: true, almoco: false, volta: false, saida: false },
  // Dia útil forçado: sem isso a suíte quebra aos sábados por um motivo que
  // não é regressão (isReminderBlockedToday).
  weekdaysOnly: false,
}

test('AP-7: o alarme autopunch_ chega ao handler, tenta o Senior e NÃO bate', async () => {
  // Este é o elo que sumiu no merge: `chrome.alarms.onAlarm` deixou de ter o
  // branch `autopunch_`, então o alarme disparava e nada acontecia. Sem token,
  // a corrente vai até a aba do Senior e para — que é o desfecho correto.
  test.setTimeout(120_000)

  await clearAudit()
  await seed({
    pontoSettings: BASE_SETTINGS,
    pontoState: null,
    pontoDate: new Date().toDateString(),
    [`alarm_time_autopunch_entrada`]: inMinutes(0),
  })

  const worker = await sw()
  await worker.evaluate(() => {
    chrome.alarms.create('autopunch_entrada', { when: Date.now() })
  })

  // A prova de que o listener existe: só `handleAutoPunchAlarm` escreve isso.
  await expect
    .poll(auditLogText, { timeout: 90_000, intervals: [500] })
    .toContain('Auto-punch: disparando entrada')

  // A prova de que a corrente foi até o Senior: a extensão foi buscar a aba.
  await expect
    .poll(() => seniorHits.length, { timeout: 60_000, intervals: [500] })
    .toBeGreaterThan(0)
  expect(seniorHits.some(u => u.includes('senior.com.br'))).toBe(true)

  // E o desfecho: falhou por falta de sessão, sem afirmar que bateu.
  await expect
    .poll(auditLogText, { timeout: 60_000, intervals: [500] })
    .toMatch(/Auto-punch: (FALHA em entrada|entrada abortado)|sess(ã|a)o expirada/i)

  const result = await worker.evaluate(async () => {
    const d = await chrome.storage.local.get('autoPunchLastResult')
    return (d.autoPunchLastResult ?? null) as { status?: string } | null
  })
  // Pode não haver resultado publicado (abortos por guard saem antes disso),
  // mas se houver, jamais pode dizer "confirmed".
  expect(result?.status ?? 'failed').not.toBe('confirmed')
})

test('AP-8: o ciclo de detecção cria o alarme autopunch_ do próximo slot', async () => {
  // O outro elo perdido: sem `scheduleAutoPunch` dentro do backgroundDetect,
  // nenhum alarme nasce durante o dia e o handler do AP-7 nunca é chamado.
  test.skip(!autoPunchBuilt, 'build sem ENABLE_AUTO_PUNCH — use pnpm build:insi:debug')

  const worker = await sw()
  await worker.evaluate(async () => {
    const all = await chrome.alarms.getAll()
    await Promise.all(
      all.filter(a => a.name.startsWith('autopunch_')).map(a => chrome.alarms.clear(a.name)),
    )
  })

  await seed({
    pontoSettings: { ...BASE_SETTINGS, entradaHorario: inMinutes(30) },
    pontoState: null,
    pontoDate: new Date().toDateString(),
  })

  // FORCE_REDETECT roda o mesmo backgroundDetect do alarme `bgDetect`, mas de
  // forma determinística (não depende do timer de 10min do Chrome).
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(async () => {
    await chrome.runtime.sendMessage({ type: 'FORCE_REDETECT' })
  })

  await expect
    .poll(
      async () =>
        worker.evaluate(async () => {
          const all = await chrome.alarms.getAll()
          return all.map(a => a.name).filter(n => n.startsWith('autopunch_'))
        }),
      { timeout: 60_000, intervals: [500] },
    )
    .toContain('autopunch_entrada')

  // O agendamento também precisa chegar à UI (é o que o AutoPunchBanner lê).
  const schedule = await worker.evaluate(async () => {
    const d = await chrome.storage.local.get('autoPunchSchedule')
    return (d.autoPunchSchedule ?? null) as { scheduled?: Record<string, number> } | null
  })
  expect(schedule?.scheduled?.entrada).toBeGreaterThan(Date.now())

  await page.close()
})
