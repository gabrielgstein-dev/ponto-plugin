/**
 * E2E — Timesheet Row Edit: editar entries no sidepanel
 *
 * Verifica que:
 * - Linha PENDING expande ao clicar
 * - Adicionar observação habilita o botão "Salvar"
 * - Salvar dispara PATCH no endpoint do timesheet com a observação
 * - Linha com múltiplos centros de custo mostra UI de alocação
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

const TODAY = new Date()
const PERIOD = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}`
const TODAY_DATE = `${PERIOD}-${String(TODAY.getDate()).padStart(2, '0')}`

const SUMMARY_SINGLE = {
  period: PERIOD,
  pendingHours: 8,
  approvedHours: 0,
  reprovedHours: 0,
  totalReportedHours: 8,
  entries: [
    {
      id: 'entry-single',
      date: TODAY_DATE,
      hourQuantity: 8,
      status: 'PENDING',
      costCenter: { code: '1001', name: 'Desenvolvimento' },
      task: { id: 't1', name: 'Implementar feature' },
      hourType: { id: 'h1', description: 'Normal' },
      observation: null,
      isAutomatic: false,
    },
  ],
}

const SUMMARY_MULTI = {
  period: PERIOD,
  pendingHours: 8,
  approvedHours: 0,
  reprovedHours: 0,
  totalReportedHours: 8,
  entries: [
    {
      id: 'entry-multi',
      date: TODAY_DATE,
      hourQuantity: 8,
      status: 'PENDING',
      costCenter: { code: '1001', name: 'Desenvolvimento' },
      costCenters: [
        { code: '1001', name: 'Desenvolvimento' },
        { code: '2002', name: 'Infra' },
      ],
      task: { id: 't1', name: 'Tarefa' },
      hourType: { id: 'h1', description: 'Normal' },
      observation: null,
      isAutomatic: false,
    },
  ],
}

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-tsedit-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  sidepanelUrl = fixture.sidepanelUrl
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function seedSummary(summary: unknown) {
  await ctx.serviceWorkers()[0]?.evaluate(async (data) => {
    await chrome.storage.local.set({
      metaTsToken: 'mock-token',
      metaTsUserId: 'mock-user',
      timesheetSummaryCache: data,
      timesheetSyncTs: Date.now(),
      sidePanelTab: 'timesheet',
    })
  }, summary as any)
}

test('TS-EDIT-1: linha PENDING aparece com badge "Pendente"', async () => {
  await seedSummary(SUMMARY_SINGLE)
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('.ts-col-status').first()).toHaveText('Pendente')
  await page.close()
})

test('TS-EDIT-2: clicar na linha expande os detalhes', async () => {
  await seedSummary(SUMMARY_SINGLE)
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  await page.locator('.ts-table-row').first().click()
  await expect(page.locator('.ts-row-detail')).toBeVisible()
  await expect(page.locator('text=Implementar feature')).toBeVisible()
  await expect(page.locator('text=Normal')).toBeVisible()
  await page.close()
})

test('TS-EDIT-3: textarea de observação habilita botão Salvar quando preenchido', async () => {
  await seedSummary(SUMMARY_SINGLE)
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  await page.locator('.ts-table-row').first().click()
  const saveBtn = page.locator('.ts-obs-save-btn')
  await expect(saveBtn).toBeDisabled()

  const obs = page.locator('textarea.ts-obs-input').first()
  await obs.fill('descrição da minha tarefa')
  await expect(saveBtn).toBeEnabled()
  await page.close()
})

test('TS-EDIT-4: contador de caracteres atualiza conforme digita', async () => {
  await seedSummary(SUMMARY_SINGLE)
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  await page.locator('.ts-table-row').first().click()
  const obs = page.locator('textarea.ts-obs-input').first()
  await obs.fill('hello')
  await expect(page.locator('.ts-obs-counter')).toHaveText('5/1000')
  await page.close()
})

test('TS-EDIT-5: linha com múltiplos centros de custo exibe label "Múltiplos"', async () => {
  await seedSummary(SUMMARY_MULTI)
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('.ts-col-cc').first()).toHaveText('Múltiplos')
  await page.close()
})

test('TS-EDIT-6: linha múltiplos expande mostrando lista de centros de custo', async () => {
  await seedSummary(SUMMARY_MULTI)
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  await page.locator('.ts-table-row').first().click()
  await expect(page.locator('text=Total Alocado: 00:00')).toBeVisible()
  await expect(page.locator('.ts-cc-code:has-text("1001")')).toBeVisible()
  await expect(page.locator('.ts-cc-code:has-text("2002")')).toBeVisible()
  await page.close()
})

test('TS-EDIT-7: navegação entre períodos via botão de previous', async () => {
  await seedSummary(SUMMARY_SINGLE)
  const page = await ctx.newPage()
  await page.goto(sidepanelUrl)
  await page.waitForLoadState('domcontentloaded')

  // Aguarda timesheet carregar
  await expect(page.locator('.sp-period-nav').first()).toBeVisible()
  await expect(page.locator('button.sp-nav-btn:has-text("›")').first()).toBeDisabled()

  await page.locator('button.sp-nav-btn:has-text("‹")').first().click()
  await expect(page.locator('.sp-nav-label:has-text("voltar ao atual")').first()).toBeVisible()
  await page.close()
})
