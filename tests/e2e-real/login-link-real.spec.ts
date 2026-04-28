/**
 * E2E REAL — Link "Conecte-se ao Senior" via extensão real
 *
 * Valida o fluxo da Opção 2: o popup (App.tsx) deve exibir o link com a
 * URL do tenant Meta (`plataforma.meta.com.br/login`), e abrir essa URL
 * deve resultar em:
 *  1. Cookie `.senior.com.br/com.senior.token` setado pelo SSO Senior.
 *  2. `gpAssertion` populado em `chrome.storage.local` — prova de que o
 *     auto-detect leu o cookie e autenticou com o gestaoponto-backend.
 *
 * Asserções: read-only — Zero PATCH, zero POST.
 *
 * IMPORTANTE: precisa de login manual UMA VEZ (cookies persistem em
 * `tests/.real-profile/`). Em runs subsequentes, SSO completa silencioso.
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
  // Limpa cookies de senior.com.br pra forçar o popup a renderizar
  // "Desconectado" no LL-1. Sem cookie, gp-auth não consegue access_token,
  // useAuthStatus mantém hasAuth=false, e o link `token-login-link` fica
  // visível no popup.
  await fixture.context.clearCookies({ domain: '.senior.com.br' })
  await fixture.context.clearCookies({ domain: 'senior.com.br' })
  await clearStorageKeys(fixture.serviceWorker, [
    'pontoState',
    'seniorToken',
    'seniorTokenTs',
    'seniorBearerToken',
    'seniorBearerTs',
    'gpAssertion',
    'gpAssertionTs',
    'gestaoPontoColaboradorId',
    'gestaoPontoCodigoCalculo',
  ])
})

test.afterAll(async () => {
  await fixture?.close()
})

test('REAL-EXT-LL-1: popup desconectado mostra link com URL do tenant Meta', async () => {
  // Sem cookies senior.com.br, useAutoDetect.detect(true,true) tenta o
  // fallback fetchGpViaTabs(true) e fica ~45s aguardando sessão. Nesse
  // intervalo `loading=true` esconde o link. Após o fallback falhar,
  // detecting=false e o link aparece.
  const popup = await fixture.context.newPage()
  await popup.goto(`chrome-extension://${fixture.extensionId}/popup.html`)
  await popup.waitForLoadState('domcontentloaded')

  const link = popup.locator('a.token-login-link')
  await expect(link).toBeVisible({ timeout: 90_000 })
  await expect(link).toHaveText('Conecte-se ao Senior')
  await expect(link).toHaveAttribute(
    'href',
    'https://plataforma.meta.com.br/login',
  )
  await expect(link).toHaveAttribute('target', '_blank')

  await popup.close()
})

test('REAL-EXT-LL-2: abrir o link captura cookie Senior e gera gpAssertion', async () => {
  // Garante que gpAssertion observado vem desta execução (não cache).
  await clearStorageKeys(fixture.serviceWorker, [
    'gpAssertion',
    'gpAssertionTs',
    'seniorToken',
    'seniorTokenTs',
  ])

  // Abre exatamente a URL exibida no link e aguarda SSO completar voltando
  // pro origin plataforma.meta.com.br. Sem cookies (limpamos no beforeAll),
  // login manual é necessário UMA VEZ — helper aguarda até 240s.
  await ensureLoggedInOnTab(
    fixture.context,
    'https://plataforma.meta.com.br/login',
    'https://plataforma.meta.com.br',
  )

  // Cookie `com.senior.token` deve estar setado pelo SSO Senior. É ele
  // que `gp-auth.ts` lê pra autenticar no gestaoponto-backend.
  const cookies = await fixture.context.cookies('https://platform.senior.com.br')
  const seniorCookie = cookies.find(
    c => c.name === 'com.senior.token' && /senior\.com\.br$/.test(c.domain.replace(/^\./, '')),
  )
  expect(seniorCookie, 'cookie com.senior.token deve estar setado após SSO').toBeDefined()
  expect(seniorCookie!.value.length).toBeGreaterThan(20)

  // Abrir o popup força `useAutoDetect.detect(true, true)` na hora.
  const popup = await fixture.context.newPage()
  await popup.goto(`chrome-extension://${fixture.extensionId}/popup.html`)
  await popup.waitForLoadState('domcontentloaded')

  const assertion = await waitForStorageValue<string>(
    fixture.serviceWorker,
    'gpAssertion',
    v => typeof v === 'string' && v.length > 20,
    120_000,
  )
  expect(assertion, 'gpAssertion deve ser populado pelo auto-detect lendo o cookie').toBeDefined()
  expect(assertion!.length).toBeGreaterThan(20)

  test.info().annotations.push({
    type: 'info',
    description: `gpAssertion length=${assertion!.length} cookie=${seniorCookie!.name}@${seniorCookie!.domain}`,
  })

  await popup.close()
})
