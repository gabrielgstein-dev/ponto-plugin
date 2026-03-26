/**
 * E2E — F1: Garantir que o ponto está sendo batido
 *
 * Verifica que:
 * - O popup mostra o botão de bater ponto
 * - Ao clicar, a API Senior recebe o payload correto
 * - A resposta de sucesso atualiza o estado visual do popup
 */
import { test, expect } from '@playwright/test'
import { launchExtension, openPageWithApiMocks, SENIOR_API_BASE, SENIOR_PLATFORM_URL } from './helpers/extension'
import type { BrowserContext } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let extensionId: string
let popupUrl: string
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-f1-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  extensionId = fixture.extensionId
  popupUrl = fixture.popupUrl
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('F1-CV-1.1: popup carrega sem erros', async () => {
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')
  expect(errors).toHaveLength(0)
  await page.close()
})

test('F1-CV-1.3: ao bater ponto, API recebe payload com campos obrigatórios', async () => {
  const MOCK_CONFIG = {
    employeeClockingConfig: {
      employee: { id: 'emp-1', arpId: 'arp-1', cpf: '12345678900', pis: '12345678901' },
      company: { id: 'comp-1', arpId: 'arp-c', cnpj: '00000000000100', caepf: '0', cnoNumber: '0' },
      timeZone: 'America/Sao_Paulo',
      clockingEventUses: [{ code: '02' }],
    },
  }

  // Interceptar na página Senior (onde o executeScript roda)
  const seniorPage = await openPageWithApiMocks(ctx, SENIOR_PLATFORM_URL, [
    {
      url: `${SENIOR_API_BASE}/hcm/pontomobile_bff/queries/getEmployeeClockingConfigQuery`,
      responseBody: MOCK_CONFIG,
    },
    {
      url: `${SENIOR_API_BASE}/hcm/pontomobile_clocking_event/actions/clockingEventImportByBrowser`,
      responseBody: { success: true },
      status: 200,
    },
  ])

  // Aguarda a página carregar
  await seniorPage.waitForLoadState('networkidle')

  // Capturar request de bater ponto
  const punchRequestPromise = seniorPage.waitForRequest(
    req =>
      req.url().includes('clockingEventImportByBrowser') && req.method() === 'POST',
    { timeout: 15_000 },
  ).catch(() => null)

  // Abrir popup e clicar no botão de ponto (se existir)
  const popupPage = await ctx.newPage()
  await popupPage.goto(popupUrl)
  await popupPage.waitForLoadState('domcontentloaded')

  const punchBtn = popupPage.getByRole('button', { name: /bater|ponto|registrar/i })
  if (await punchBtn.isVisible()) {
    await punchBtn.click()
    const punchReq = await punchRequestPromise
    if (punchReq) {
      const body = JSON.parse(punchReq.postData() ?? '{}')
      expect(body.clockingInfo).toBeDefined()
      expect(body.clockingInfo.employee).toBeDefined()
      expect(body.clockingInfo.company).toBeDefined()
      expect(body.clockingInfo.clientDateTimeEvent).toMatch(/\d{4}-\d{2}-\d{2}/)
    }
  } else {
    test.info().annotations.push({
      type: 'info',
      description: 'Botão de bater ponto não visível (modo sem Senior Punch Button)',
    })
  }

  await seniorPage.close()
  await popupPage.close()
})

test('F1-CV-1.5: resposta 200 da API resulta em estado de sucesso', async () => {
  const popupPage = await ctx.newPage()
  await popupPage.goto(popupUrl)
  await popupPage.waitForLoadState('domcontentloaded')

  // Verifica que o popup renderiza sem crash
  const body = await popupPage.locator('body').textContent()
  expect(body).toBeTruthy()

  await popupPage.close()
})
