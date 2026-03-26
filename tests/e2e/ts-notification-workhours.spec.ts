/**
 * E2E — TS-W: popup de timesheet respeita janela de trabalho
 *
 * Garante (via extensão real carregada no Chrome) que ts-notification.html:
 *   - NÃO abre se pontoState.entrada é null (equivalente ao guard P6)
 *   - NÃO abre se pontoState.saida está preenchida (equivalente ao guard P7)
 *   - NÃO abre se pontoState é null
 *   - ABRE quando usuário está dentro do horário de trabalho e há entradas pendentes
 */
import { test, expect } from '@playwright/test'
import { launchExtension } from './helpers/extension'
import type { BrowserContext } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let extensionPageUrl: string
let tmpDir: string

const MOCK_SUMMARY_PENDING = {
  period: '2026-03',
  pendingHours: 4,
  approvedHours: 0,
  reprovedHours: 0,
  totalReportedHours: 4,
  entries: [
    {
      id: 'entry-e2e-ts-1',
      date: '2026-03-25',
      hourQuantity: 4,
      status: 'PENDING',
      costCenter: { code: '1001', name: 'Dev' },
      task: null,
      hourType: null,
      observation: null,
      isAutomatic: false,
    },
  ],
}

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-ts-w-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  // sidepanel.html (não sidepanel/index.html) é o caminho real no build
  extensionPageUrl = `chrome-extension://${fixture.extensionId}/sidepanel.html`
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

/**
 * Prepara o storage, dispara notifyPendingTimesheet() via TEST_TS_NOTIFICATION,
 * aguarda processamento e retorna o tsNotifWindowId resultante (null = popup não abriu).
 * Fecha o popup se ele foi aberto, para não poluir testes seguintes.
 */
async function triggerAndCheck(
  pontoState: Record<string, unknown> | null,
): Promise<number | null> {
  const sw = ctx.serviceWorkers()[0]
  if (!sw) {
    test.skip(true, 'Service worker não disponível')
    return null
  }

  // Configura o storage: sem token real para evitar chamadas de rede,
  // tsAutoConnectTs recente para throttlar tsAutoConnect, cache manual com pendentes
  await sw.evaluate(
    async (data: any) => {
      await chrome.storage.local.set(data)
    },
    {
      metaTsToken: null,
      tsAutoConnectTs: Date.now(),
      tsNotifWindowId: null,
      pontoState,
      timesheetSummaryCache: MOCK_SUMMARY_PENDING,
    },
  )

  // Dispara via mensagem, igual ao fluxo real de produção
  const page = await ctx.newPage()
  await page.goto(extensionPageUrl)
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => {
    chrome.runtime.sendMessage({ type: 'TEST_TS_NOTIFICATION' })
  })
  // Aguarda o processamento assíncrono (chrome.windows.create usa callback)
  await page.waitForTimeout(2500)
  await page.close()

  // Lê resultado e fecha o popup se aberto
  const windowId = await sw.evaluate(async () => {
    const d = await chrome.storage.local.get('tsNotifWindowId')
    const id = d.tsNotifWindowId as number | undefined
    if (id) {
      try { await chrome.windows.remove(id) } catch (_) {}
      await chrome.storage.local.remove('tsNotifWindowId')
    }
    return id ?? null
  }).catch(() => null)

  return windowId as number | null
}

// ── TS-W-E1: entrada não registrada (guard P6) ───────────────────────────────

test('TS-W-E1: popup não abre quando pontoState.entrada é null', async () => {
  const windowId = await triggerAndCheck({
    entrada: null, almoco: null, volta: null, saida: null,
  })
  expect(windowId).toBeNull()
})

// ── TS-W-E2: saída já registrada (guard P7) ───────────────────────────────────

test('TS-W-E2: popup não abre quando pontoState.saida está preenchida', async () => {
  const windowId = await triggerAndCheck({
    entrada: '09:00', almoco: '12:00', volta: '13:00', saida: '18:00',
  })
  expect(windowId).toBeNull()
})

// ── TS-W-E3: pontoState null ──────────────────────────────────────────────────

test('TS-W-E3: popup não abre quando pontoState é null', async () => {
  const windowId = await triggerAndCheck(null)
  expect(windowId).toBeNull()
})

// ── TS-W-E4: dentro do horário de trabalho → popup abre ──────────────────────

test('TS-W-E4: popup abre quando entrada registrada, saida null e há pendentes', async () => {
  const windowId = await triggerAndCheck({
    entrada: '09:00', almoco: null, volta: null, saida: null,
  })
  // tsNotifWindowId é gravado pelo callback de chrome.windows.create
  test.info().annotations.push({
    type: 'info',
    description: `tsNotifWindowId após trigger: ${windowId}`,
  })
  expect(windowId).not.toBeNull()
})
