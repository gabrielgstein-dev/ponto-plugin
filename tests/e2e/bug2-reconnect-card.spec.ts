/**
 * E2E — BUG 2: ReconnectCard aparece no SidePanel quando o token do Timesheet
 * está ausente, e o botão abre o Timesheet numa aba visível (captura via
 * webRequest reconecta a sessão).
 *
 * Cenário recriado:
 *  - Usuário abre o sidepanel sem token salvo (cookie expirou ou nunca logou)
 *  - Antes: nada acontecia, ou aparecia link enxuto pra plataforma
 *  - Agora: card claro com botão "Abrir Timesheet" + link manual de fallback
 */
import { test, expect } from '@playwright/test'
import { launchExtension } from './helpers/extension'
import type { BrowserContext } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let sidepanelUrl: string
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-bug2-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  sidepanelUrl = fixture.sidepanelUrl
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function clearAuthStorage(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
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
    ])
  })
}

const META_TS_LOGIN_URL =
  'https://plataforma.meta.com.br/login?callbackUrl=/modules/timesheet/create'

test('BUG 2 — ReconnectCard aparece no Timesheet sem auth + botão Abrir Timesheet', async () => {
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  await clearAuthStorage(page)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  // Vai pra aba Timesheet
  await page.locator('.sp-tab', { hasText: 'Timesheet' }).click()

  // Card de reconexão aparece com mensagem clara
  await expect(page.getByTestId('ts-reconnect-card')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('.ts-reconnect-msg')).toContainText('sessão do Timesheet expirou')

  // Link manual fallback aponta pra plataforma Meta (timesheet)
  const manualLink = page.locator('a', { hasText: 'abrir manualmente' })
  await expect(manualLink).toHaveAttribute('href', META_TS_LOGIN_URL)

  await page.close()
})

test('BUG 2 — clicar em Abrir Timesheet abre a plataforma numa aba', async () => {
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  await clearAuthStorage(page)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.sp-tab', { hasText: 'Timesheet' }).click()
  await expect(page.getByTestId('ts-reconnect-card')).toBeVisible({ timeout: 8_000 })

  // Captura chamadas a chrome.tabs.create (sem realmente navegar)
  const urls: string[] = []
  await page.exposeFunction('__captureTab', (url: string) => urls.push(url))
  await page.evaluate(() => {
    chrome.tabs.create = ((opts: { url?: string }) => {
      ;(window as unknown as { __captureTab: (u: string) => void }).__captureTab(opts?.url ?? '')
      return Promise.resolve({ id: 99 } as chrome.tabs.Tab)
    }) as typeof chrome.tabs.create
  })

  await page.getByTestId('ts-reconnect-btn').click()
  await page.waitForTimeout(300)

  expect(urls).toContainEqual(META_TS_LOGIN_URL)
  await page.close()
})

test('BUG 2 — visual snapshot do ReconnectCard', async () => {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 380, height: 280 })
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  await clearAuthStorage(page)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.sp-tab', { hasText: 'Timesheet' }).click()

  const card = page.getByTestId('ts-reconnect-card')
  await expect(card).toBeVisible({ timeout: 8_000 })
  // Aguarda fontes/CSS renderizarem
  await page.waitForTimeout(300)
  await expect(card).toHaveScreenshot('reconnect-card.png', {
    maxDiffPixelRatio: 0.02,
  })
  await page.close()
})
