/**
 * Smoke E2E — valida os 3 fixes em conjunto, num único cenário "vida real".
 *
 * Roteiro:
 *  1. Usuário instala extensão e abre o sidepanel pela primeira vez (sem auth)
 *  2. BUG 2 — sidepanel mostra ReconnectCard, não trava em "Conectando..."
 *  3. BUG 1 — durante a sessão (8s), nenhuma aba abre sozinha em background
 *  4. BUG 3 — popup punch-reminder?slot=entrada renderiza corretamente
 *  5. BUG 3 — settings panel mostra campo "Horário Entrada" persistível
 *
 * Se TODOS esses checkpoints passarem em sequência, os 3 bugs estão fixados
 * e o produto está pronto pra escalar.
 */
import { test, expect } from '@playwright/test'
import { launchExtension } from './helpers/extension'
import type { BrowserContext } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let popupUrl: string
let sidepanelUrl: string
let extensionId: string
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-smoke-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  popupUrl = fixture.popupUrl
  sidepanelUrl = fixture.sidepanelUrl
  extensionId = fixture.extensionId
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('SMOKE BUG 1 — sem nenhuma interação, background fica silencioso (sem abas)', async () => {
  // Setup: estado pós-instalação, sem auth e sem ações do usuário.
  const setupPage = await ctx.newPage()
  await setupPage.goto(popupUrl)
  await setupPage.waitForLoadState('domcontentloaded')
  await setupPage.evaluate(async () => {
    await chrome.storage.local.remove([
      'seniorToken',
      'seniorTokenTs',
      'seniorRefreshToken',
      'metaTsToken',
      'metaTsTokenTs',
      'tsAutoConnectTs',
      'gpAssertion',
      'gpAssertionTs',
      'timesheetSummaryCache',
      'timesheetSyncTs',
      'pontoState',
    ])
  })
  const baselineNonExtTabs = ctx.pages().filter(p => {
    const u = p.url()
    return (
      u !== 'about:blank' &&
      !u.startsWith('chrome-extension://') &&
      !u.startsWith('chrome://')
    )
  }).length
  await setupPage.close()

  // 8s sem qualquer interação do usuário (nenhum sidepanel, nenhum click).
  // Background processa startup + alarms — não pode abrir aba sozinho.
  await new Promise(resolve => setTimeout(resolve, 8_000))

  const externalTabs = ctx.pages().filter(p => {
    const u = p.url()
    return (
      u !== 'about:blank' &&
      !u.startsWith('chrome-extension://') &&
      !u.startsWith('chrome://')
    )
  })
  expect(externalTabs.map(p => p.url())).toEqual([])
  expect(externalTabs.length).toBe(baselineNonExtTabs)
})

test('SMOKE BUG 2 — sidepanel sem auth mostra ReconnectCard pro usuário', async () => {
  const sp = await ctx.newPage()
  await sp.goto(sidepanelUrl)
  await sp.waitForLoadState('domcontentloaded')
  await sp.evaluate(async () => {
    await chrome.storage.local.remove([
      'seniorToken',
      'seniorTokenTs',
      'metaTsToken',
      'metaTsTokenTs',
      'tsAutoConnectTs',
      'timesheetSummaryCache',
    ])
  })
  await sp.reload()
  await sp.waitForLoadState('domcontentloaded')
  await sp.locator('.sp-tab', { hasText: 'Timesheet' }).click()

  await expect(sp.getByTestId('ts-reconnect-card')).toBeVisible({ timeout: 8_000 })
  await expect(sp.locator('.ts-reconnect-msg')).toContainText('sessão Senior expirou')
  await expect(sp.getByTestId('ts-reconnect-btn')).toBeVisible()
  await sp.close()
})

test('SMOKE BUG 3 — popup de entrada renderiza com título, ícone e horário', async () => {
  const reminder = await ctx.newPage()
  await reminder.goto(
    `chrome-extension://${extensionId}/punch-reminder.html?slot=entrada&time=08:00`,
  )
  await reminder.waitForLoadState('domcontentloaded')
  await expect(reminder.locator('#title')).toHaveText('Hora da Entrada!')
  await expect(reminder.locator('#icon')).toHaveText('🌅')
  await expect(reminder.locator('#msg')).toContainText('08:00')
  await reminder.close()
})

test('SMOKE BUG 3 — settings.html mostra Horário Entrada e persiste', async () => {
  // Pós-0.7: settings vive em settings.html (sidepanel), não mais inline no popup
  const settings = await ctx.newPage()
  await settings.goto(`chrome-extension://${extensionId}/settings.html`)
  await settings.waitForLoadState('domcontentloaded')
  await expect(settings.locator('text=Horário Entrada')).toBeVisible()

  const row = settings.locator('.setting-row', { hasText: 'Horário Entrada' })
  await row.locator('input[type="time"]').fill('07:30')
  await row.locator('input[type="time"]').blur()
  await settings.waitForTimeout(300)

  const stored = await settings.evaluate(async () => {
    const data = await chrome.storage.local.get('pontoSettings')
    return data.pontoSettings as { entradaHorario?: string }
  })
  expect(stored.entradaHorario).toBe('07:30')
  await settings.close()
})
