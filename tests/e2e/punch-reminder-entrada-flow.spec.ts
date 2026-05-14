/**
 * E2E — Fluxo completo do popup de entrada (audit fix #4)
 *
 * Antes do fix, `scheduleNotifications` só era chamado quando `backgroundDetect`
 * encontrava ao menos 1 batimento — então no cenário típico da manhã (Chrome
 * aberto antes das 08:00, nenhum ponto ainda batido) o alarme `punch_popup_entrada`
 * NUNCA era criado.
 *
 * Esses testes cobrem a cadeia ponta-a-ponta:
 *   1. backgroundDetect sem batimentos AGENDA `punch_popup_entrada`
 *   2. Quando o alarme dispara, o popup window é criado com slot=entrada
 *   3. handleDailyReset agenda o popup do dia seguinte
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-entrada-flow-'))
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

/** Hora "HH:MM" garantidamente no futuro do dia corrente (a não ser que rode após 23:55). */
function futureTimeToday(): string {
  const now = new Date()
  const future = new Date(now.getTime() + 30 * 60 * 1000)
  // Se passar de meia-noite, abortamos com sentinel — o teste faz skip.
  if (future.getDate() !== now.getDate()) return ''
  return `${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`
}

async function clearAllAlarms() {
  await sw.evaluate(async () => {
    const alarms = await chrome.alarms.getAll()
    await Promise.all(alarms.map(a => chrome.alarms.clear(a.name)))
  })
}

async function getAlarmNames(): Promise<string[]> {
  return sw.evaluate(async () => {
    const alarms = await chrome.alarms.getAll()
    return alarms.map(a => a.name)
  })
}

async function resetStorage(extra: Record<string, unknown> = {}) {
  await sw.evaluate(async (data) => {
    await chrome.storage.local.clear()
    await chrome.storage.local.set(data)
  }, extra)
}

// ── Fix #1 — backgroundDetect agenda entrada quando não há batimentos ─────────

test('audit-fix-#1: backgroundDetect sem batimentos cria alarme punch_popup_entrada', async () => {
  const entradaTime = futureTimeToday()
  test.skip(!entradaTime, 'rodando muito perto da meia-noite — teste pula')

  await resetStorage({
    pontoState: null,
    pontoDate: new Date().toDateString(),
    pontoSettings: { entradaHorario: entradaTime, notifAntecip: 10, lembreteAtraso: 30 },
  })
  await clearAllAlarms()

  // Dispara backgroundDetect via o handler real do background (FORCE_REDETECT).
  const page = await ctx.newPage()
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      chrome.runtime.sendMessage({ type: 'FORCE_REDETECT' }, () => resolve())
    })
  })
  await page.close()

  // Aguarda processamento assíncrono (detect → scheduleNotifications → alarms.create).
  await new Promise(r => setTimeout(r, 1500))

  const names = await getAlarmNames()
  expect(names).toContain('punch_popup_entrada')
})

// ── Integração — alarme disparando abre o popup ───────────────────────────────

test('alarme punch_popup_entrada disparando cria janela com slot=entrada', async () => {
  await resetStorage({
    pontoState: null,
    pontoDate: new Date().toDateString(),
    pontoSettings: { entradaHorario: '08:00', notifAntecip: 10, lembreteAtraso: 30 },
    alarm_time_punch_popup_entrada: '08:00',
  })
  await clearAllAlarms()

  // Cria o alarme pra disparar em 1.5s. O listener real em background.ts vai
  // chamar handlePunchPopupAlarm → startReminder → chrome.windows.create.
  await sw.evaluate(async () => {
    chrome.alarms.create('punch_popup_entrada', { when: Date.now() + 1500 })
  })

  // Aguarda o disparo + chamada async do windows.create.
  await new Promise(r => setTimeout(r, 4000))

  // Verifica que o popup foi criado: storage tem o windowId e existe uma
  // página servida do popup HTML com query string slot=entrada.
  const result = await sw.evaluate(async () => {
    const data = await chrome.storage.local.get(['punchPopupWindowId', 'punchPopupSlot'])
    return {
      windowId: data.punchPopupWindowId as number | undefined,
      slot: data.punchPopupSlot as string | undefined,
    }
  })

  expect(result.slot).toBe('entrada')
  expect(typeof result.windowId).toBe('number')

  // Confirma URL da janela criada.
  const reminderPage = ctx.pages().find(p => p.url().includes('punch-reminder.html'))
  expect(reminderPage, 'janela do popup deveria existir').toBeDefined()
  expect(reminderPage!.url()).toContain('slot=entrada')

  // Limpa pro próximo teste.
  if (result.windowId != null) {
    await sw.evaluate(async (id) => {
      try { await chrome.windows.remove(id) } catch {}
      await chrome.storage.local.remove(['punchPopupWindowId', 'punchPopupSlot', 'punchPopupExpectedTime'])
    }, result.windowId)
  }
})

// ── Fix #2 — handleDailyReset agenda entrada do dia novo ──────────────────────

test('audit-fix-#2: dailyReset reseta estado e agenda punch_popup_entrada', async () => {
  const entradaTime = futureTimeToday()
  test.skip(!entradaTime, 'rodando muito perto da meia-noite — teste pula')

  await resetStorage({
    pontoState: { entrada: '08:00', almoco: '12:00', volta: '13:00', saida: '17:00' },
    pontoDate: new Date().toDateString(),
    pontoSettings: { entradaHorario: entradaTime, notifAntecip: 10, lembreteAtraso: 30 },
  })
  await clearAllAlarms()

  // Dispara o handler real via o alarm 'dailyReset' (background.ts roteia
  // pra handleDailyReset). when=Date.now()+500 garante disparo logo.
  await sw.evaluate(async () => {
    chrome.alarms.create('dailyReset', { when: Date.now() + 500 })
  })

  // Aguarda o reset (clear alarmes antigos + clear storage + scheduleNotifications).
  await new Promise(r => setTimeout(r, 2500))

  const stateAfter = await sw.evaluate(async () => {
    const data = await chrome.storage.local.get('pontoState')
    return data.pontoState
  })
  expect(stateAfter).toBeNull()

  const names = await getAlarmNames()
  expect(names).toContain('punch_popup_entrada')
})
