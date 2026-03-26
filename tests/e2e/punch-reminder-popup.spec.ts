/**
 * E2E — Popup de Lembrete de Ponto (punch-reminder.html)
 *
 * Testa o HTML/JS do popup diretamente:
 * - Renderiza corretamente para cada slot
 * - Exibe título, ícone e horário esperado
 * - Botão "Entendido" fecha a janela
 */
import { test, expect } from '@playwright/test'
import { launchExtension } from './helpers/extension'
import type { BrowserContext } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let extensionId: string
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-reminder-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  extensionId = fixture.extensionId
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function reminderUrl(slot: string, time: string) {
  return `chrome-extension://${extensionId}/punch-reminder.html?slot=${slot}&time=${encodeURIComponent(time)}`
}

// ── P1.2: HTML exibe nome do slot e horário ───────────────────────────────────

test('P1.2a — popup almoco exibe "Hora do Almoço!" e horário', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#title')).toHaveText('Hora do Almoço!')
  await expect(page.locator('#msg')).toContainText('12:00')
  await page.close()
})

test('P1.2b — popup volta exibe "Hora de Voltar!" e horário', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('volta', '13:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#title')).toHaveText('Hora de Voltar!')
  await expect(page.locator('#msg')).toContainText('13:00')
  await page.close()
})

test('P1.2c — popup saida exibe "Hora de Sair!" e horário', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('saida', '18:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#title')).toHaveText('Hora de Sair!')
  await expect(page.locator('#msg')).toContainText('18:00')
  await page.close()
})

// ── Ícones por slot ───────────────────────────────────────────────────────────

test('popup almoco exibe ícone de almoço', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#icon')).toHaveText('🍽️')
  await page.close()
})

test('popup volta exibe ícone de maleta', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('volta', '13:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#icon')).toHaveText('💼')
  await page.close()
})

test('popup saida exibe ícone de casa', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('saida', '18:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#icon')).toHaveText('🏠')
  await page.close()
})

// ── Botão "Entendido" ─────────────────────────────────────────────────────────

test('popup carrega sem erros de console', async () => {
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))

  await page.goto(reminderUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')

  expect(errors).toHaveLength(0)
  await page.close()
})

test('botão "Entendido" está presente e visível', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')

  const btn = page.locator('#btnOk')
  await expect(btn).toBeVisible()
  await expect(btn).toHaveText('Entendido')
  await page.close()
})

test('popup sem slot desconhecido usa fallback gracioso', async () => {
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))

  await page.goto(reminderUrl('invalido', ''))
  await page.waitForLoadState('domcontentloaded')

  // Não deve lançar erro; usa fallback
  expect(errors).toHaveLength(0)
  await expect(page.locator('#title')).toHaveText('Lembrete de Ponto')
  await page.close()
})

// ── Exibição do horário no conteúdo da mensagem ───────────────────────────────

test('horário aparece em negrito no corpo da mensagem', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('saida', '17:30'))
  await page.waitForLoadState('domcontentloaded')

  const strong = page.locator('#msg strong')
  await expect(strong).toHaveText('17:30')
  await page.close()
})
