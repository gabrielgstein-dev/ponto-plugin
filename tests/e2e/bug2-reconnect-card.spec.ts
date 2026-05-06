/**
 * E2E — BUG 2: ReconnectCard aparece no SidePanel quando o token Senior
 * está ausente, e o botão dispara REQUEST_TS_SYNC.
 *
 * Cenário recriado:
 *  - Usuário abre o sidepanel sem token salvo (cookie expirou ou nunca logou)
 *  - Antes: nada acontecia, ou aparecia link enxuto pra plataforma
 *  - Agora: card claro com botão "Reconectar" + link manual de fallback
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

test('BUG 2 — ReconnectCard aparece no Timesheet sem auth + botão Reconectar', async () => {
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
  await expect(page.locator('.ts-reconnect-msg')).toContainText('sessão Senior expirou')

  // Link manual fallback aponta pra plataforma Senior
  const manualLink = page.locator('a', { hasText: 'abrir Senior manualmente' })
  await expect(manualLink).toHaveAttribute('href', 'https://platform.senior.com.br')

  await page.close()
})

test('BUG 2 — clicar em Reconectar dispara REQUEST_TS_SYNC pro background', async () => {
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  await clearAuthStorage(page)
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.sp-tab', { hasText: 'Timesheet' }).click()
  await expect(page.getByTestId('ts-reconnect-card')).toBeVisible({ timeout: 8_000 })

  // Captura mensagens enviadas via chrome.runtime.sendMessage
  const messages: unknown[] = []
  await page.exposeFunction('__captureMsg', (msg: unknown) => messages.push(msg))
  await page.evaluate(() => {
    const orig = chrome.runtime.sendMessage.bind(chrome.runtime)
    chrome.runtime.sendMessage = (msg: unknown, ...rest: unknown[]) => {
      ;(window as unknown as { __captureMsg: (m: unknown) => void }).__captureMsg(msg)
      // @ts-expect-error tipos de overload
      return orig(msg, ...rest)
    }
  })

  await page.getByTestId('ts-reconnect-btn').click()
  // Pequeno delay pra mensagem ser enviada
  await page.waitForTimeout(300)

  expect(messages).toContainEqual({ type: 'REQUEST_TS_SYNC' })
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
