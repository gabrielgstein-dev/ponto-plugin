/**
 * E2E — Settings Panel: configurações persistem e refletem na UI
 *
 * Verifica que:
 * - O painel abre/fecha ao clicar no botão
 * - Editar a jornada atualiza as settings em chrome.storage.local
 * - O botão "Limpar registros de hoje" reseta o pontoState
 * - No build com ENABLE_SENIOR_INTEGRATION, "Dia Fechamento" não aparece
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-settings-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  popupUrl = fixture.popupUrl
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('S-1: painel abre ao clicar e mostra os campos esperados', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('.settings-toggle')).toContainText('Configurações')
  await page.locator('.settings-toggle').click()

  await expect(page.locator('text=Jornada (horas)')).toBeVisible()
  await expect(page.locator('text=Horário Almoço')).toBeVisible()
  await expect(page.locator('text=Duração Almoço (min)')).toBeVisible()
  await expect(page.locator('text=Antecipação Notif. (min)')).toBeVisible()
  await expect(page.locator('text=Lembrete Atraso (min)')).toBeVisible()
  await page.close()
})

test('S-2: build com integração Senior oculta "Dia Fechamento"', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.settings-toggle').click()

  await expect(page.locator('text=Dia Fechamento')).toHaveCount(0)
  await page.close()
})

test('S-3: editar jornada persiste em chrome.storage.local', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.settings-toggle').click()

  // Get the jornada input by its label
  const jornadaRow = page.locator('.setting-row', { hasText: 'Jornada (horas)' })
  const input = jornadaRow.locator('input[type="number"]')
  await input.fill('7.5')
  await input.blur()
  // dar tempo para o efeito persistir
  await page.waitForTimeout(300)

  const stored = await page.evaluate(async () => {
    const data = await chrome.storage.local.get('pontoSettings')
    return data.pontoSettings
  })
  expect(stored.jornada).toBe(450)

  await page.close()
})

test('S-4: editar duração de almoço persiste', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.settings-toggle').click()

  const row = page.locator('.setting-row', { hasText: 'Duração Almoço (min)' })
  const input = row.locator('input[type="number"]')
  await input.fill('45')
  await input.blur()
  await page.waitForTimeout(300)

  const stored = await page.evaluate(async () => {
    const data = await chrome.storage.local.get('pontoSettings')
    return data.pontoSettings
  })
  expect(stored.almocoDur).toBe(45)
  await page.close()
})

test('S-5: clicar em "Limpar registros de hoje" reseta o pontoState', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  // Pre-popula um estado com pontos batidos
  await page.evaluate(() => {
    chrome.storage.local.set({
      pontoState: {
        entrada: '09:00',
        almoco: '12:00',
        volta: '13:00',
        saida: '18:00',
        _entradaTimestamp: new Date().setHours(9, 0, 0, 0),
      },
    })
  })

  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.settings-toggle').click()
  await page.locator('button.clear-btn').click()
  await page.waitForTimeout(300)

  const stored = await page.evaluate(async () => {
    const data = await chrome.storage.local.get('pontoState')
    return data.pontoState
  })
  expect(stored.entrada).toBeNull()
  expect(stored.saida).toBeNull()
  await page.close()
})
