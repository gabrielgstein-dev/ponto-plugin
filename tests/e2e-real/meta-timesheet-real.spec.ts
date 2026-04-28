/**
 * E2E REAL — Meta Timesheet via extensão real
 *
 * Carrega a build de produção (.output/chrome-mv3) num Chromium headed.
 * O usuário loga manualmente em plataforma.meta.com.br (callback direto pra
 * /modules/timesheet/create — só nessa rota o módulo do timesheet bootstrapa).
 *
 * Em seguida abrimos o sidepanel da extensão na aba Timesheet, o que dispara
 * useTimesheetData → metaTimesheetProvider.getSummary() →
 * fetchViaMetaTab() (GET only) e o resultado deve cair em
 * `timesheetSummaryCache` no chrome.storage.local.
 *
 * Asserções: shape + status. Zero PATCH, zero POST.
 */
import { test, expect } from '@playwright/test'
import {
  launchRealExtension,
  waitForStorageValue,
  ensureLoggedInOnTab,
  type RealExtensionFixture,
} from './helpers/extension-real'

interface TimesheetSummary {
  period: string
  pendingHours: number
  approvedHours: number
  reprovedHours: number
  totalReportedHours: number
  entries: Array<{
    id: string
    date: string
    status: string
  }>
}

let fixture: RealExtensionFixture

test.beforeAll(async () => {
  test.setTimeout(360_000)
  fixture = await launchRealExtension()
  // Cair na rota /modules/timesheet/create força o SPA a bootstrappar o
  // módulo do timesheet, que é o que dispara as chamadas autenticadas
  // capturáveis via webRequest interceptor da extensão.
  await ensureLoggedInOnTab(
    fixture.context,
    'https://plataforma.meta.com.br/login?callbackUrl=/modules/timesheet/create',
    'https://plataforma.meta.com.br',
  )
})

test.afterAll(async () => {
  await fixture?.close()
})

test('REAL-EXT-TS: extensão sincroniza timesheetSummaryCache com dados reais da API', async () => {
  // Espera o token ser capturado pelo webRequest interceptor.
  const token = await waitForStorageValue<string>(
    fixture.serviceWorker,
    'metaTsToken',
    v => typeof v === 'string' && v.length > 20,
    60_000,
  )
  expect(token).toBeDefined()

  // Abrir o sidepanel já dispara useTimesheetData → getSummary.
  const sidepanel = await fixture.context.newPage()
  await sidepanel.goto(fixture.sidepanelUrl)
  await sidepanel.waitForLoadState('domcontentloaded')

  // Trigger explícito via REQUEST_TS_SYNC pra não depender do polling do SW.
  await sidepanel.evaluate(() => {
    const c = (globalThis as unknown as {
      chrome: { runtime: { sendMessage: (m: unknown) => Promise<unknown> } }
    }).chrome
    c.runtime.sendMessage({ type: 'REQUEST_TS_SYNC' }).catch(() => {})
  })

  const cache = await waitForStorageValue<TimesheetSummary>(
    fixture.serviceWorker,
    'timesheetSummaryCache',
    v => !!v && Array.isArray(v.entries) && typeof v.period === 'string',
    120_000,
  )

  expect(cache).toBeDefined()
  expect(cache!.period).toMatch(/^\d{4}-\d{2}$/)
  expect(typeof cache!.pendingHours).toBe('number')
  expect(typeof cache!.approvedHours).toBe('number')
  expect(typeof cache!.totalReportedHours).toBe('number')
  expect(Array.isArray(cache!.entries)).toBe(true)

  // Se houver entradas, valida a shape de uma delas
  if (cache!.entries.length > 0) {
    const entry = cache!.entries[0]
    expect(typeof entry.id).toBe('string')
    expect(typeof entry.date).toBe('string')
    expect(typeof entry.status).toBe('string')
  }

  test.info().annotations.push({
    type: 'info',
    description: `period=${cache!.period} pending=${cache!.pendingHours}h approved=${cache!.approvedHours}h entries=${cache!.entries.length}`,
  })

  await sidepanel.close()
})
