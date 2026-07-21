/**
 * E2E visual — indicador da batida automática e estado "cego".
 *
 * Por que existe: os testes unitários provam que os componentes funcionam e
 * que estão montados no App, mas rodam em jsdom. Só o e2e prova que, na
 * extensão realmente compilada e carregada no Chrome, o bloco certo aparece na
 * tela com o CSS aplicado.
 *
 * O caso "cego" reproduz o incidente de 2026-07-21: sem tokens, nenhuma fonte
 * respondeu, os cards mostraram `--:--`, o usuário leu como "não bateu" e
 * registrou em duplicidade um ponto que já existia no servidor.
 *
 * Pré-requisito: `pnpm build:insi:debug` (precisa de ENABLE_AUTO_PUNCH ligado).
 */
import { test, expect } from '@playwright/test'
import { launchExtension, completeOnboarding } from './helpers/extension'
import type { BrowserContext } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let popupUrl: string
let tmpDir: string
/**
 * ENABLE_AUTO_PUNCH é false no build padrão (gate de produção). Sem essa
 * sonda, a suíte quebraria em CI por um motivo que não é regressão. AP-5 não
 * depende da flag e roda sempre.
 */
let autoPunchBuilt = false

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-autopunch-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  popupUrl = fixture.popupUrl
  await completeOnboarding(ctx)

  // Sonda: liga os 4 slots e vê se a marca ⚡ renderiza.
  await seed({ pontoSettings: { autoPunchEnabled: true, autoPunchSlots: { entrada: true, almoco: true, volta: true, saida: true } } })
  const probe = await ctx.newPage()
  await probe.goto(popupUrl)
  await probe.waitForLoadState('domcontentloaded')
  autoPunchBuilt = (await probe.locator('.card-auto-badge').count()) > 0
  await probe.close()
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function seed(data: Record<string, unknown>) {
  await ctx.serviceWorkers()[0]?.evaluate(async (d) => {
    await chrome.storage.local.set(d as Record<string, unknown>)
  }, data as any)
}

async function clearAuth() {
  await ctx.serviceWorkers()[0]?.evaluate(async () => {
    await chrome.storage.local.remove([
      'metaTsToken', 'gpAssertion', 'gpAssertionTs', 'seniorToken', 'seniorTokenTs',
    ])
  })
}

const AUTO_SETTINGS = {
  autoPunchEnabled: true,
  autoPunchSlots: { entrada: true, almoco: false, volta: false, saida: true },
}

test('AP-1: agendamento aparece na tela com horário e contagem', async () => {
  test.skip(!autoPunchBuilt, 'build sem ENABLE_AUTO_PUNCH — use pnpm build:insi:debug')
  const fireAt = Date.now() + 45 * 60 * 1000 // 45min no futuro
  await seed({
    pontoSettings: AUTO_SETTINGS,
    pontoState: null,
    pontoDate: new Date().toDateString(),
    autoPunchSchedule: {
      date: new Date().toDateString(),
      scheduled: { entrada: fireAt },
      waitingFor: null,
    },
  })

  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const banner = page.locator('.autopunch-banner.autopunch-scheduled')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('sozinho às')
  await expect(page.locator('.autopunch-countdown')).toContainText(/em \d+ min/)

  await expect(banner).toHaveScreenshot('autopunch-scheduled.png', { maxDiffPixelRatio: 0.02 })
  await page.close()
})

test('AP-2: slots automáticos marcados com ⚡, manuais sem marca', async () => {
  test.skip(!autoPunchBuilt, 'build sem ENABLE_AUTO_PUNCH — use pnpm build:insi:debug')
  await seed({ pontoSettings: AUTO_SETTINGS })
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  // entrada + saida ligados = 2 marcas; almoço e volta manuais = sem marca
  await expect(page.locator('.card-auto-badge')).toHaveCount(2)
  await expect(page.locator('.punch-card.auto')).toHaveCount(2)
  await page.close()
})

test('AP-3: corrente travada mostra o motivo, não silêncio', async () => {
  test.skip(!autoPunchBuilt, 'build sem ENABLE_AUTO_PUNCH — use pnpm build:insi:debug')
  await seed({
    pontoSettings: { autoPunchEnabled: true, autoPunchSlots: { entrada: false, almoco: true, volta: false, saida: true } },
    autoPunchSchedule: {
      date: new Date().toDateString(),
      scheduled: {},
      waitingFor: 'entrada',
    },
  })
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const banner = page.locator('.autopunch-banner.autopunch-waiting')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(/aguardando/i)
  await page.close()
})

test('AP-4: falha NÃO afirma que bateu', async () => {
  test.skip(!autoPunchBuilt, 'build sem ENABLE_AUTO_PUNCH — use pnpm build:insi:debug')
  await seed({
    pontoSettings: AUTO_SETTINGS,
    autoPunchLastResult: {
      date: new Date().toDateString(),
      slot: 'saida', status: 'failed', time: null, reason: '401', ts: Date.now(),
    },
  })
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const banner = page.locator('.autopunch-banner.autopunch-failed')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText(/não consegui bater/i)
  await expect(banner).not.toContainText(/^Bati /)
  await page.close()
})

test('AP-5: sem auth, tela avisa que está cega e NÃO mostra --:--', async () => {
  // Regressão do incidente: ausência de dado não pode parecer ausência de batida.
  await clearAuth()
  await seed({ pontoSettings: AUTO_SETTINGS, pontoState: null, pontoDate: new Date().toDateString() })

  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const alert = page.locator('.detection-blind-banner')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText(/não consegui verificar/i)
  await expect(alert).toContainText(/duplicidade/i)

  await expect(page.locator('.card-time.unknown').first()).toContainText('??:??')
  await expect(page.locator('.card-time', { hasText: '--:--' })).toHaveCount(0)

  await expect(alert).toHaveScreenshot('detection-blind.png', { maxDiffPixelRatio: 0.02 })
  await page.close()
})

test('AP-6: COM auth mas fontes indisponíveis (502) também avisa', async () => {
  // Buraco que sobrava depois do AP-5: token válido não garante que alguma
  // fonte respondeu. Foi o caso do gestão de ponto em 502 com token ok.
  await seed({
    seniorToken: 'token-valido-fake',
    seniorTokenTs: Date.now(),
    detectionHealth: { probed: 2, ok: 0, blind: true, ts: Date.now() },
    pontoState: null,
    pontoDate: new Date().toDateString(),
  })

  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('.detection-blind-banner')).toBeVisible()
  await expect(page.locator('.card-time.unknown').first()).toContainText('??:??')
  await page.close()
})
