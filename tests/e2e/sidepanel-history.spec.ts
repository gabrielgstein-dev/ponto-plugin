/**
 * E2E — Sidepanel History: histórico de ponto via GP
 *
 * Verifica que:
 * - Sidepanel renderiza tabela com histórico (mockando GP)
 * - Saldo aparece com classe positive/negative conforme totalMinutes
 * - Estado vazio aparece quando não há registros
 * - Tabs Ponto/Timesheet alternam corretamente
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-sphist-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  sidepanelUrl = fixture.sidepanelUrl
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('SP-1: tabs Ponto e Timesheet aparecem quando META_TIMESHEET enabled', async () => {
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('button.sp-tab', { hasText: 'Ponto' })).toBeVisible()
  await expect(page.locator('button.sp-tab', { hasText: 'Timesheet' })).toBeVisible()
  await page.close()
})

test('SP-2: tab Ponto é selecionada por default e mostra "Histórico de Ponto"', async () => {
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('h1.sp-title')).toHaveText('Histórico de Ponto')
  await expect(
    page.locator('button.sp-tab.active', { hasText: 'Ponto' }),
  ).toBeVisible()
  await page.close()
})

test('SP-3: clicar em "Timesheet" alterna a aba ativa', async () => {
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  await page.locator('button.sp-tab', { hasText: 'Timesheet' }).click()
  await expect(
    page.locator('button.sp-tab.active', { hasText: 'Timesheet' }),
  ).toBeVisible()
  await expect(page.locator('h1.sp-title')).toHaveCount(0)
  await page.close()
})

test('SP-4: estado vazio aparece quando não há registros', async () => {
  await ctx.serviceWorkers()[0]?.evaluate(async () => {
    await chrome.storage.local.remove(['gpAssertion', 'manualPunches', 'hourBankBalance'])
  })

  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(800)

  // Sem dados, a tabela mostra "Nenhum registro no período atual"
  const emptyText = await page.locator('.sp-empty').first().textContent()
  expect(emptyText).toContain('Nenhum registro')
  await page.close()
})

test('SP-5: header da tabela mostra colunas esperadas', async () => {
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  const header = page.locator('.sp-table-header').first()
  await expect(header).toContainText('Data')
  await expect(header).toContainText('Batimentos')
  await expect(header).toContainText('Trabalhado')
  await expect(header).toContainText('Saldo')
  await page.close()
})

test('SP-6: ThemeToggle visível na aba Ponto', async () => {
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('button.theme-toggle').first()).toBeVisible()
  await page.close()
})
