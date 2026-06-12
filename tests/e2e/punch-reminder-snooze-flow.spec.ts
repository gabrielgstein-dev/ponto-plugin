/**
 * E2E — Fluxo completo de SNOOZE do popup de lembrete (regressão do bug "todos
 * os lembretes em 5min").
 *
 * Bug: o popup chamava `window.close()` na MESMA volta síncrona do
 * `chrome.runtime.sendMessage`. Em MV3, com o service worker dormente, a
 * mensagem se perdia — `snoozeReminder` nunca rodava, o alarm `punch_recheck`
 * (5min) nunca era cancelado, e o popup reabria a cada 5min independente do
 * botão (+15/+30/+1h).
 *
 * Esses testes batem no service worker REAL (não mockam sendMessage):
 *   1. Clicar +15/+30/+1h agenda `punch_popup_saida` com scheduledTime ~ now+X.
 *   2. O alarm `punch_recheck` (5min) é cancelado.
 *   3. O estado do popup (punchPopupSlot) é limpo.
 *
 * Pré-requisito: extensão buildada (.output/chrome-mv3).
 */
import { test, expect } from '@playwright/test'
import { launchExtension } from './helpers/extension'
import type { BrowserContext, Worker } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let sw: Worker
let extensionId: string
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-snooze-flow-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  extensionId = fixture.extensionId
  const worker = ctx.serviceWorkers()[0]
  if (!worker) throw new Error('Service worker não disponível')
  sw = worker
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function reminderUrl(slot: string, time: string) {
  return `chrome-extension://${extensionId}/punch-reminder.html?slot=${slot}&time=${encodeURIComponent(time)}`
}

/** Lê os alarmes do SW como mapa nome → scheduledTime. */
async function getAlarms(): Promise<Record<string, number>> {
  return sw.evaluate(async () => {
    const alarms = await chrome.alarms.getAll()
    const out: Record<string, number> = {}
    for (const a of alarms) out[a.name] = a.scheduledTime
    return out
  })
}

/**
 * Prepara o estado como se o popup de saída estivesse aberto: punchPopupSlot
 * setado e o alarm `punch_recheck` (5min) ativo — exatamente o estado em que o
 * snooze precisa cancelar o recheck. windowId aponta pra uma janela inexistente
 * (snoozeReminder tolera o windows.remove falhar).
 */
async function setupOpenSaidaPopup() {
  await sw.evaluate(async () => {
    const alarms = await chrome.alarms.getAll()
    await Promise.all(alarms.map(a => chrome.alarms.clear(a.name)))
    await chrome.storage.local.clear()
    await chrome.storage.local.set({
      punchPopupSlot: 'saida',
      punchPopupExpectedTime: '17:31',
      punchPopupStartedTs: Date.now(),
      punchPopupEscalated: false,
      punchPopupWindowId: 999999, // janela inexistente — remove() falha e é ignorado
    })
    // Simula o recheck de 5min agendado por scheduleRecheck().
    chrome.alarms.create('punch_recheck', { delayInMinutes: 5 })
  })
}

/** Espera o alarm aparecer (SW processa o sendMessage de forma assíncrona). */
async function waitForAlarm(name: string, timeoutMs = 4000): Promise<Record<string, number>> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const alarms = await getAlarms()
    if (alarms[name] != null) return alarms
    if (Date.now() > deadline) return alarms
    await new Promise(r => setTimeout(r, 100))
  }
}

const CASES = [
  { label: '+15min', idx: 0, minutes: 15 },
  { label: '+30min', idx: 1, minutes: 30 },
  { label: '+1h', idx: 2, minutes: 60 },
]

for (const c of CASES) {
  test(`snooze ${c.label} → SW agenda punch_popup_saida em ~${c.minutes}min e cancela recheck`, async () => {
    await setupOpenSaidaPopup()

    // Confirma o estado inicial: recheck (5min) ativo.
    const before = await getAlarms()
    expect(before.punch_recheck, 'recheck de 5min deveria estar ativo no setup').not.toBeUndefined()

    const page = await ctx.newPage()
    await page.goto(reminderUrl('saida', '17:31'))
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('#snooze-row button.btn-snooze')).toHaveCount(3)

    // Clica o botão de snooze REAL → sendMessage real → SW real.
    const tBefore = Date.now()
    await page.locator('#snooze-row button.btn-snooze').nth(c.idx).click()

    const alarms = await waitForAlarm('punch_popup_saida')
    const tAfter = Date.now()

    // 1. Agendou o re-lembrete no intervalo certo.
    const scheduled = alarms.punch_popup_saida
    expect(scheduled, 'punch_popup_saida deveria ter sido agendado').not.toBeUndefined()
    const deltaMs = c.minutes * 60 * 1000
    expect(scheduled).toBeGreaterThanOrEqual(tBefore + deltaMs - 2000)
    expect(scheduled).toBeLessThanOrEqual(tAfter + deltaMs + 2000)

    // 2. O recheck de 5min foi cancelado (era a causa do "reabre em 5min").
    expect(alarms.punch_recheck, 'punch_recheck deveria ter sido cancelado').toBeUndefined()

    // 3. Estado do popup limpo + expectedTime preservado pro re-disparo.
    const stored = await sw.evaluate(async () => {
      const d = await chrome.storage.local.get(['punchPopupSlot', 'alarm_time_punch_popup_saida'])
      return {
        slot: d.punchPopupSlot as string | undefined,
        savedTime: d.alarm_time_punch_popup_saida as string | undefined,
      }
    })
    expect(stored.slot, 'punchPopupSlot deveria ter sido limpo').toBeUndefined()
    expect(stored.savedTime).toBe('17:31')

    await page.close()
  })
}

// ── Contraprova: sem snooze, o recheck de 5min permanece ──────────────────────

test('sanity: sem clicar em snooze, o recheck de 5min NÃO é cancelado', async () => {
  await setupOpenSaidaPopup()
  const page = await ctx.newPage()
  await page.goto(reminderUrl('saida', '17:31'))
  await page.waitForLoadState('domcontentloaded')
  // Não clica em nada.
  await new Promise(r => setTimeout(r, 800))
  const alarms = await getAlarms()
  expect(alarms.punch_recheck, 'recheck deveria continuar ativo sem ação do user').not.toBeUndefined()
  expect(alarms.punch_popup_saida, 'nenhum re-lembrete sem snooze').toBeUndefined()
  await page.close()
})
