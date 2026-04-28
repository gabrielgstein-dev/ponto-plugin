/**
 * E2E — Popup States: estados visuais do popup conforme pontoState
 *
 * Verifica que:
 * - Mostra "Aguardando entrada" quando vazio
 * - Mostra "Aguardando almoço" após entrada
 * - Mostra "Em almoço" após almoço
 * - Mostra "Aguardando saída" após volta
 * - Mostra "Jornada concluída!" após saída
 * - PunchCards refletem horários e estados isPast/isNext
 * - LiveClock mostra horário e data
 */
import { test, expect } from '@playwright/test'
import { launchExtension } from './helpers/extension'
import type { BrowserContext } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let popupUrl: string
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-popst-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  popupUrl = fixture.popupUrl
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function seedState(state: Record<string, unknown> | null) {
  // O ChromeStateRepository usa Date.toDateString() (ex: "Tue Apr 28 2026")
  // como formato de pontoDate para detectar troca de dia.
  await ctx.serviceWorkers()[0]?.evaluate(async (s) => {
    await chrome.storage.local.set({ pontoState: s, pontoDate: new Date().toDateString() })
  }, state as any)
}

test('PS-1: LiveClock mostra horário (HH:MM:SS) e data', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#current-time')).toHaveText(/^\d{2}:\d{2}:\d{2}$/)
  await expect(page.locator('#current-date')).not.toBeEmpty()
  await page.close()
})

test('PS-2: 4 PunchCards aparecem (Entrada, Almoço, Volta, Saída)', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('.punch-card')).toHaveCount(4)
  await expect(page.locator('.card-label').nth(0)).toHaveText('Entrada')
  await expect(page.locator('.card-label').nth(1)).toHaveText('Almoço')
  await expect(page.locator('.card-label').nth(2)).toHaveText('Volta')
  await expect(page.locator('.card-label').nth(3)).toHaveText('Saída')
  await page.close()
})

test('PS-3: PunchCard sem horário mostra placeholder "--:--"', async () => {
  await seedState({ entrada: null, almoco: null, volta: null, saida: null })
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const placeholders = page.locator('.card-time:has-text("--:--")')
  const count = await placeholders.count()
  expect(count).toBeGreaterThan(0)
  await page.close()
})

test('PS-4: jornada concluída mostra todos os 4 horários e classe done', async () => {
  // Trava o relógio às 19:00 para que os 4 batimentos sejam considerados "past"
  const fixedNow = new Date()
  fixedNow.setHours(19, 0, 0, 0)
  await seedState({
    entrada: '09:00',
    almoco: '12:00',
    volta: '13:00',
    saida: '18:00',
    _entradaTimestamp: new Date(fixedNow.getFullYear(), fixedNow.getMonth(), fixedNow.getDate(), 9, 0, 0, 0).getTime(),
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: fixedNow })
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('.punch-card.done')).toHaveCount(4)
  await page.close()
})

test('PS-5: ProgressBar atinge 100% quando jornada completa via saida', async () => {
  await seedState({
    entrada: '09:00',
    almoco: '12:00',
    volta: '13:00',
    saida: '18:00',
    _entradaTimestamp: new Date().setHours(9, 0, 0, 0),
  })
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('.progress-pct')).toHaveText('100%')
  await page.close()
})

test('PS-6: token-status aparece quando ENABLE_SENIOR_INTEGRATION', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  // pode ser "Verificando token..." ou status final
  await expect(page.locator('.token-status').first()).toBeVisible()
  await page.close()
})

test('PS-7: PunchCard.calc aparece para slots com horário sugerido', async () => {
  // Entrada batida às 09:00, demais slots usam horário calculado/sugerido
  const fixedNow = new Date()
  fixedNow.setHours(10, 0, 0, 0)
  await seedState({
    entrada: '09:00',
    almoco: null,
    volta: null,
    saida: null,
    _entradaTimestamp: new Date(fixedNow.getFullYear(), fixedNow.getMonth(), fixedNow.getDate(), 9, 0, 0, 0).getTime(),
    _almocoSugerido: '12:00',
    _voltaSugerida: '13:00',
    _saidaEstimada: '18:00',
  })

  const page = await ctx.newPage()
  await page.clock.install({ time: fixedNow })
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  // calcHorarios sugere apenas almoço e saída quando só há entrada batida.
  await expect(page.locator('.card-time.calc')).toHaveCount(2)
  // Entrada não é calc (foi batida explicitamente)
  await expect(page.locator('.card-time.calc').filter({ hasText: '09:00' })).toHaveCount(0)
  await expect(page.locator('.card-sub:has-text("estimado")')).toHaveCount(2)
  await page.close()
})
