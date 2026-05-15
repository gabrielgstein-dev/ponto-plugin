/**
 * E2E — Settings Panel: configurações persistem e refletem na UI
 *
 * Pós-0.7: o painel de configurações vive numa página dedicada
 * (`settings.html`, renderizada via Chrome Side Panel API). Antes era um
 * accordion inline no popup com `.settings-toggle`. Os testes navegam
 * direto pra `settings.html` em vez de tentar abrir o sidepanel via Chrome
 * API (que não funciona em contexto de teste sem janela ativa).
 *
 * Verifica que:
 * - A página settings.html mostra os campos esperados
 * - Editar valores persiste em chrome.storage.local
 * - "Limpar registros de hoje" reseta o pontoState
 * - No build com ENABLE_SENIOR_INTEGRATION, "Dia Fechamento" não aparece
 * - O popup tem o banner `.settings-banner` que aciona a navegação
 */
import { test, expect } from '@playwright/test'
import { launchExtension } from './helpers/extension'
import type { BrowserContext } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let popupUrl: string
let settingsUrl: string
let extensionId: string
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-settings-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  popupUrl = fixture.popupUrl
  extensionId = fixture.extensionId
  settingsUrl = `chrome-extension://${extensionId}/settings.html`
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ── Popup: banner de Configurações ────────────────────────────────────────────

test('S-0: popup mostra banner "Configurações" que aciona o sidepanel', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const banner = page.locator('.settings-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('Configurações')
  await page.close()
})

// ── settings.html — campos visíveis ───────────────────────────────────────────

test('S-1: settings.html exibe todos os campos esperados', async () => {
  const page = await ctx.newPage()
  await page.goto(settingsUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('text=Jornada (horas)')).toBeVisible()
  await expect(page.locator('text=Horário Entrada')).toBeVisible()
  await expect(page.locator('text=Horário Almoço')).toBeVisible()
  await expect(page.locator('text=Duração Almoço (min)')).toBeVisible()
  await expect(page.locator('text=Antecipação Notif. (min)')).toBeVisible()
  await expect(page.locator('text=Lembrete Atraso (min)')).toBeVisible()
  await page.close()
})

test('S-1b — editar Horário Entrada persiste em settings', async () => {
  const page = await ctx.newPage()
  await page.goto(settingsUrl)
  await page.waitForLoadState('domcontentloaded')

  const row = page.locator('.setting-row', { hasText: 'Horário Entrada' })
  const input = row.locator('input[type="time"]')
  await input.fill('07:30')
  await input.blur()
  await page.waitForTimeout(300)

  const stored = await page.evaluate(async () => {
    const data = await chrome.storage.local.get('pontoSettings')
    return data.pontoSettings
  })
  expect(stored.entradaHorario).toBe('07:30')
  await page.close()
})

test('S-2: build com integração Senior oculta "Dia Fechamento"', async () => {
  const page = await ctx.newPage()
  await page.goto(settingsUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('text=Dia Fechamento')).toHaveCount(0)
  await page.close()
})

test('S-3: editar jornada persiste em chrome.storage.local', async () => {
  const page = await ctx.newPage()
  await page.goto(settingsUrl)
  await page.waitForLoadState('domcontentloaded')

  const jornadaRow = page.locator('.setting-row', { hasText: 'Jornada (horas)' })
  const input = jornadaRow.locator('input[type="number"]')
  await input.fill('7.5')
  await input.blur()
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
  await page.goto(settingsUrl)
  await page.waitForLoadState('domcontentloaded')

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
  await page.goto(settingsUrl)
  await page.waitForLoadState('domcontentloaded')

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
