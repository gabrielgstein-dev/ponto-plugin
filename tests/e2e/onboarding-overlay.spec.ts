/**
 * E2E — Onboarding Overlay (carrocel estilo Nubank)
 *
 * Cobre o fluxo crítico de aparecer pra TODOS os users (novos E já
 * instalados) na primeira abertura após o release, e desligar UI de
 * timesheet quando a resposta for "Não preencho".
 *
 * Cenários:
 *   OB-1: Storage limpo (first install) → overlay aparece
 *   OB-2: Storage com pontoState/pontoSettings mas sem userProfile
 *         (update simulado pra user já instalado) → overlay aparece
 *   OB-3: Respondeu "Sim" → popup normal com banner "Histórico & Timesheet"
 *   OB-4: Respondeu "Não" → banner "Histórico" e sidepanel sem aba TS
 *   OB-5: Onboarding já completo → overlay NÃO aparece
 */
import { test, expect } from '@playwright/test'
import { launchExtension } from './helpers/extension'
import type { BrowserContext, Page } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let popupUrl: string
let sidepanelUrl: string
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-onboard-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  popupUrl = fixture.popupUrl
  sidepanelUrl = fixture.sidepanelUrl
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function resetStorage(initial: Record<string, unknown> = {}): Promise<void> {
  await ctx.serviceWorkers()[0]?.evaluate(async (state) => {
    await chrome.storage.local.clear()
    if (Object.keys(state as Record<string, unknown>).length > 0) {
      await chrome.storage.local.set(state as Record<string, unknown>)
    }
  }, initial)
}

async function openPopup(): Promise<Page> {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 340, height: 600 })
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')
  return page
}

test('OB-1: storage limpo → overlay aparece bloqueando popup', async () => {
  await resetStorage()
  const page = await openPopup()

  await expect(page.locator('.onboarding-overlay')).toBeVisible()
  await expect(page.locator('.onboarding-question')).toHaveText('Você preenche timesheet?')
  await expect(page.locator('.onboarding-option')).toHaveCount(2)
  // Garante que o overlay bloqueia: progress dots, header, options visíveis
  await expect(page.locator('.onboarding-dot')).toHaveCount(1)

  // Aguarda animações da entrada terminarem antes do snapshot
  await page.waitForTimeout(400)
  await expect(page).toHaveScreenshot('onboarding-first-install.png', {
    maxDiffPixelRatio: 0.02,
  })
  await page.close()
})

test('OB-2: user já instalado (sem userProfile) → overlay aparece', async () => {
  // Simula um user que já tinha o plugin antes do release. Storage tem
  // pontoState e pontoSettings com valores customizados, mas userProfile
  // NUNCA foi setado. Este é o cenário crítico: garantir que a chave
  // ausente dispara o onboarding em UPDATES, não só em installs novos.
  await resetStorage({
    pontoState: { entrada: '09:00', almoco: null, volta: null, saida: null },
    pontoDate: new Date().toDateString(),
    pontoSettings: { jornada: 480, insiXReminder: true, weekdaysOnly: true },
  })

  const page = await openPopup()
  await expect(page.locator('.onboarding-overlay')).toBeVisible()
  await expect(page.locator('.onboarding-question')).toBeVisible()
  await page.close()
})

test('OB-3: resposta "Sim, preencho" → popup normal com timesheet', async () => {
  await resetStorage()
  const page = await openPopup()

  await expect(page.locator('.onboarding-overlay')).toBeVisible()
  await page.locator('.onboarding-option', { hasText: 'Sim, preencho' }).click()

  // Overlay some
  await expect(page.locator('.onboarding-overlay')).toHaveCount(0)
  // Banner mantém "Histórico & Timesheet"
  await expect(page.locator('.hour-bank-label')).toHaveText('Histórico & Timesheet')

  await page.waitForTimeout(200)
  await expect(page).toHaveScreenshot('onboarding-answered-yes.png', {
    maxDiffPixelRatio: 0.02,
  })
  await page.close()
})

test('OB-4: resposta "Não preencho" → banner "Histórico" e sidepanel sem aba TS', async () => {
  await resetStorage()
  const popup = await openPopup()

  await expect(popup.locator('.onboarding-overlay')).toBeVisible()
  await popup.locator('.onboarding-option', { hasText: 'Não preencho' }).click()

  await expect(popup.locator('.onboarding-overlay')).toHaveCount(0)
  await expect(popup.locator('.hour-bank-label')).toHaveText('Histórico')

  await popup.waitForTimeout(200)
  await expect(popup).toHaveScreenshot('onboarding-answered-no-popup.png', {
    maxDiffPixelRatio: 0.02,
  })
  await popup.close()

  // Sidepanel não deve mostrar aba Timesheet
  const sidepanel = await ctx.newPage()
  await sidepanel.goto(sidepanelUrl)
  await sidepanel.waitForLoadState('domcontentloaded')

  await expect(sidepanel.locator('button.sp-tab', { hasText: 'Ponto' })).toBeVisible()
  await expect(sidepanel.locator('button.sp-tab', { hasText: 'Timesheet' })).toHaveCount(0)
  await sidepanel.close()
})

test('OB-5: onboarding já completo → overlay NÃO aparece', async () => {
  await resetStorage({
    userProfile: {
      hasTimesheet: true,
      onboardingCompleted: true,
      completedAt: '2026-05-27T10:00:00.000Z',
    },
  })

  const page = await openPopup()
  await expect(page.locator('.onboarding-overlay')).toHaveCount(0)
  // Popup principal renderiza normalmente
  await expect(page.locator('.popup-container')).toBeVisible()
  await page.close()
})
