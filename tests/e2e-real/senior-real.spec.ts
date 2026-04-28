/**
 * E2E REAL — Senior Ponto via extensão real
 *
 * Carrega a build de produção (.output/chrome-mv3) num Chromium headed,
 * com perfil persistente. O backgroundDetect da extensão dispara o fluxo
 * normal: captura token via webRequest, renova gpAssertion, chama o GP
 * backend (GET only) e popula `pontoState` no chrome.storage.local com
 * os batimentos do dia.
 *
 * Limpa as chaves relevantes no início para garantir que estamos testando
 * a captura DESTA execução, não cache de uma rodada anterior.
 *
 * Asserções: read-only — nada é gravado nas APIs.
 */
import { test, expect } from '@playwright/test'
import {
  launchRealExtension,
  waitForStorageValue,
  ensureLoggedInOnTab,
  clearStorageKeys,
  type RealExtensionFixture,
} from './helpers/extension-real'

let fixture: RealExtensionFixture

test.beforeAll(async () => {
  test.setTimeout(360_000)
  fixture = await launchRealExtension()
  // Garante que vamos observar a captura desta execução, não cache antigo.
  await clearStorageKeys(fixture.serviceWorker, [
    'pontoState',
    'seniorToken',
    'seniorTokenTs',
    'seniorBearerToken',
    'seniorBearerTs',
    'gpAssertion',
    'gpAssertionTs',
  ])
  await ensureLoggedInOnTab(
    fixture.context,
    'https://platform.senior.com.br/senior-x/',
    'https://platform.senior.com.br',
  )
})

test.afterAll(async () => {
  await fixture?.close()
})

interface PontoState {
  entrada: string | null
  almoco: string | null
  volta: string | null
  saida: string | null
}

test('REAL-EXT-SR-1: webRequest interceptor captura Bearer token do Senior', async () => {
  // Token capturado por background.ts (webRequest.onSendHeaders) ou pelo
  // content script senior-platform.content.ts. Aceitamos qualquer um dos
  // dois — ambos são caminhos válidos da extensão.
  const captured = await waitForStorageValue<string>(
    fixture.serviceWorker,
    'seniorToken',
    v => typeof v === 'string' && v.length > 20,
    60_000,
  )
  const fallback = captured
    ? null
    : await waitForStorageValue<string>(
        fixture.serviceWorker,
        'seniorBearerToken',
        v => typeof v === 'string' && v.length > 20,
        30_000,
      )
  const token = captured ?? fallback
  expect(token).toBeDefined()
  expect(token!.length).toBeGreaterThan(20)
})

test('REAL-EXT-SR-2: backgroundDetect popula pontoState com marcação real', async () => {
  // Como limpamos pontoState no beforeAll, qualquer valor aqui veio de
  // um fetch desta execução — não cache antigo.
  const pontoState = await waitForStorageValue<PontoState>(
    fixture.serviceWorker,
    'pontoState',
    v => !!(v && (v.entrada || v.almoco || v.volta || v.saida)),
    180_000,
  )

  expect(pontoState).toBeDefined()
  const slots = ['entrada', 'almoco', 'volta', 'saida'] as const
  for (const s of slots) {
    const v = pontoState![s]
    expect(v === null || /^\d{2}:\d{2}$/.test(v)).toBe(true)
  }
  expect(slots.some(s => pontoState![s] !== null)).toBe(true)

  test.info().annotations.push({
    type: 'info',
    description: `pontoState desta execução: ${JSON.stringify(pontoState)}`,
  })
})
