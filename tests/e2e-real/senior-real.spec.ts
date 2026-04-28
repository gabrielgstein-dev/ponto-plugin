/**
 * E2E REAL — Senior Ponto via extensão real
 *
 * Carrega a build de produção (.output/chrome-mv3) num Chromium headed,
 * com perfil persistente. O backgroundDetect da extensão dispara o fluxo
 * normal: descobre token, chama o GP backend (GET only) e popula
 * `pontoState` no chrome.storage.local com os batimentos do dia.
 *
 * Asserções: read-only — nada é gravado nas APIs.
 */
import { test, expect } from '@playwright/test'
import {
  launchRealExtension,
  waitForStorageValue,
  ensureLoggedInOnTab,
  type RealExtensionFixture,
} from './helpers/extension-real'

let fixture: RealExtensionFixture

test.beforeAll(async () => {
  test.setTimeout(360_000)
  fixture = await launchRealExtension()
  // Login (manual na 1ª vez; silencioso depois). A extensão também tenta
  // auto-connect no background, mas garantir uma sessão Senior viva acelera.
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

test('REAL-EXT-SR: backgroundDetect popula pontoState com pelo menos uma marcação real', async () => {
  // O backgroundDetect roda automaticamente ao subir o SW; aguardamos até
  // ele detectar pelo menos uma marcação no storage.
  const pontoState = await waitForStorageValue<PontoState>(
    fixture.serviceWorker,
    'pontoState',
    v => !!(v && (v.entrada || v.almoco || v.volta || v.saida)),
    120_000,
  )

  expect(pontoState).toBeDefined()
  // Shape: cada slot é string HH:MM ou null
  const slots = ['entrada', 'almoco', 'volta', 'saida'] as const
  for (const s of slots) {
    const v = pontoState![s]
    expect(v === null || /^\d{2}:\d{2}$/.test(v)).toBe(true)
  }
  // Pelo menos um campo populado (entrada é o mais provável)
  expect(slots.some(s => pontoState![s] !== null)).toBe(true)

  test.info().annotations.push({
    type: 'info',
    description: `pontoState: ${JSON.stringify(pontoState)}`,
  })
})
