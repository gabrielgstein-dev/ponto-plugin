/**
 * E2E — HourBankBanner: clicar abre sidepanel
 *
 * Verifica que:
 * - O banner "Histórico & Timesheet" aparece no popup
 * - Clicar dispara chrome.sidePanel.open com windowId atual
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-hbb-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  popupUrl = fixture.popupUrl
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('HBB-1: banner aparece com título "Histórico & Timesheet"', async () => {
  // Pós-refactor: banner é totalmente clicável (sem botão CTA "Abrir →" separado).
  // O click event está no próprio `.hour-bank-banner` — coberto no HBB-2/HBB-3.
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('.hour-bank-banner')).toBeVisible()
  await expect(page.locator('.hour-bank-banner')).toContainText('Histórico & Timesheet')
  await page.close()
})

test('HBB-2: clicar dispara chrome.sidePanel.open', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  // Stubba chrome.sidePanel.open para capturar a chamada (sidepanel.open
  // requer "user gesture" e em testes pode rejeitar; o stub é o caminho seguro)
  await page.evaluate(() => {
    ;(window as any).__sidePanelArgs = null
    chrome.sidePanel.open = ((args: { windowId: number }) => {
      ;(window as any).__sidePanelArgs = args
      return Promise.resolve()
    }) as typeof chrome.sidePanel.open
    // window.close() não funciona em chrome-extension popups durante teste
    window.close = () => {}
  })

  await page.locator('.hour-bank-banner').click()
  await page.waitForFunction(() => (window as any).__sidePanelArgs !== null)
  const args = await page.evaluate(() => (window as any).__sidePanelArgs)
  expect(args).toBeTruthy()
  expect(typeof args.windowId).toBe('number')
  await page.close()
})

test('HBB-3: cursor pointer sobre o banner', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const cursor = await page.locator('.hour-bank-banner').evaluate(
    el => window.getComputedStyle(el).cursor,
  )
  expect(cursor).toBe('pointer')
  await page.close()
})
