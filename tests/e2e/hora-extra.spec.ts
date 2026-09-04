/**
 * E2E — Hora extra do dia
 *
 * Fecha o circuito que os testes unitários só cobrem em pedaços: clicar no
 * controle do popup precisa (1) mover a saída estimada na tela, (2) persistir
 * em `pontoState.horaExtra` e (3) chegar ao service worker, que rearma os
 * alarmes da saída. Sem o passo (3) a UI mostra um horário e a batida
 * automática sai em outro.
 *
 * O valor é um DELTA sobre a jornada do contrato — nunca um total.
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

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-hextra-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  popupUrl = fixture.popupUrl
  // Sem isso o OnboardingOverlay cobre o popup e intercepta todo clique.
  await completeOnboarding(ctx)
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function seedState(state: Record<string, unknown>) {
  await ctx.serviceWorkers()[0]?.evaluate(async (s) => {
    await chrome.storage.local.set({ pontoState: s, pontoDate: new Date().toDateString() })
  }, state as any)
}

async function readHoraExtra(): Promise<number | null | undefined> {
  return await ctx.serviceWorkers()[0]?.evaluate(async () => {
    const d = await chrome.storage.local.get('pontoState')
    return (d.pontoState as { horaExtra?: number | null } | null)?.horaExtra
  })
}

/** Só entrada batida: saída estimada = 08:00 + 8h + 1h de almoço = 17:00. */
const ENTRADA_8H = { entrada: '08:00', almoco: null, volta: null, saida: null, horaExtra: 0 }

const saidaCard = (page: import('@playwright/test').Page) =>
  page.locator('.punch-card').nth(3).locator('.card-time')

test('HE-1: sem extra, o controle mostra "sem extra" e a saída fica no horário do contrato', async () => {
  await seedState(ENTRADA_8H)
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(page.getByTestId('hora-extra-value')).toHaveText('sem extra')
  await expect(saidaCard(page)).toHaveText('17:00')
  await page.close()
})

test('HE-2: +1h move a saída estimada e persiste em pontoState.horaExtra', async () => {
  await seedState(ENTRADA_8H)
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const mais = page.getByLabel('Aumentar 15 minutos')
  for (let i = 0; i < 4; i++) await mais.click()

  await expect(page.getByTestId('hora-extra-value')).toHaveText('+1h')
  await expect(saidaCard(page)).toHaveText('18:00')
  await expect.poll(readHoraExtra).toBe(60)
  await page.close()
})

test('HE-3: "zerar" devolve a saída ao horário do contrato', async () => {
  await seedState({ ...ENTRADA_8H, horaExtra: 90 })
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  await expect(saidaCard(page)).toHaveText('18:30')

  await page.getByLabel('Remover hora extra de hoje').click()

  await expect(page.getByTestId('hora-extra-value')).toHaveText('sem extra')
  await expect(saidaCard(page)).toHaveText('17:00')
  await expect.poll(readHoraExtra).toBe(0)
  await page.close()
})

test('HE-4: delta negativo antecipa a saída', async () => {
  await seedState(ENTRADA_8H)
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const menos = page.getByLabel('Diminuir 15 minutos')
  for (let i = 0; i < 2; i++) await menos.click()

  await expect(page.getByTestId('hora-extra-value')).toHaveText('−30min')
  await expect(saidaCard(page)).toHaveText('16:30')
  await page.close()
})

test('HE-5: o teto de 2h desabilita o botão de aumentar', async () => {
  await seedState({ ...ENTRADA_8H, horaExtra: 105 })
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const mais = page.getByLabel('Aumentar 15 minutos')
  await mais.click()

  await expect(page.getByTestId('hora-extra-value')).toHaveText('+2h')
  await expect(mais).toBeDisabled()
  await page.close()
})

test('HE-6: a extra sobrevive à reabertura do popup (mesmo dia)', async () => {
  await seedState(ENTRADA_8H)
  const first = await ctx.newPage()
  await first.goto(popupUrl)
  await first.waitForLoadState('domcontentloaded')
  await first.getByLabel('Aumentar 15 minutos').click()
  await expect.poll(readHoraExtra).toBe(15)
  await first.close()

  const second = await ctx.newPage()
  await second.goto(popupUrl)
  await second.waitForLoadState('domcontentloaded')
  await expect(second.getByTestId('hora-extra-value')).toHaveText('+15min')
  await expect(saidaCard(second)).toHaveText('17:15')
  await second.close()
})
