/**
 * E2E — Theme Toggle: alternância de tema claro/escuro
 *
 * Verifica que:
 * - O botão de tema existe no popup e no sidepanel
 * - Clicar alterna a classe "dark" em <html>
 * - A escolha é persistida em localStorage
 * - A escolha é replicada via chrome.storage.local
 */
import { test, expect } from '@playwright/test'
import { launchExtension } from './helpers/extension'
import type { BrowserContext } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

const STORAGE_KEY = 'senior-ponto-theme-mode'

let ctx: BrowserContext
let popupUrl: string
let sidepanelUrl: string
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-theme-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  popupUrl = fixture.popupUrl
  sidepanelUrl = fixture.sidepanelUrl
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('TM-1: botão de tema está visível no popup', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('button.theme-toggle').first()).toBeVisible()
  await page.close()
})

test('TM-2: clicar alterna entre dark e light e persiste no localStorage', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const beforeIsDark = await page.evaluate(() =>
    document.documentElement.classList.contains('dark'),
  )

  await page.locator('button.theme-toggle').first().click()
  // wait for classList update
  await page.waitForFunction(
    (prev) => document.documentElement.classList.contains('dark') !== prev,
    beforeIsDark,
  )

  const afterIsDark = await page.evaluate(() =>
    document.documentElement.classList.contains('dark'),
  )
  expect(afterIsDark).toBe(!beforeIsDark)

  const storedMode = await page.evaluate(
    (key) => localStorage.getItem(key),
    STORAGE_KEY,
  )
  expect(storedMode === 'dark' || storedMode === 'light').toBe(true)

  await page.close()
})

test('TM-3: escolha é replicada para chrome.storage.local', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  await page.locator('button.theme-toggle').first().click()
  await page.waitForTimeout(300)

  const stored = await page.evaluate(async (key) => {
    const data = await chrome.storage.local.get(key)
    return data[key]
  }, STORAGE_KEY)

  expect(stored === 'dark' || stored === 'light').toBe(true)
  await page.close()
})

test('TM-4: tema é compartilhado entre popup e sidepanel', async () => {
  // Set theme via popup
  const popup = await ctx.newPage()
  await popup.goto(popupUrl)
  await popup.waitForLoadState('domcontentloaded')

  // Force light first to have a known starting point, then toggle to dark
  await popup.evaluate(async (key) => {
    localStorage.setItem(key, 'light')
    await chrome.storage.local.set({ [key]: 'light' })
  }, STORAGE_KEY)
  await popup.reload()
  await popup.waitForLoadState('domcontentloaded')
  await popup.locator('button.theme-toggle').first().click()
  await popup.waitForFunction(() =>
    document.documentElement.classList.contains('dark'),
  )
  await popup.close()

  // Open sidepanel and verify dark
  const sidepanel = await ctx.newPage()
  await sidepanel.goto(sidepanelUrl)
  await sidepanel.waitForLoadState('domcontentloaded')
  // Wait for chrome.storage hydration to apply
  await sidepanel.waitForFunction(
    () => document.documentElement.classList.contains('dark'),
    null,
    { timeout: 5000 },
  )
  await sidepanel.close()
})
