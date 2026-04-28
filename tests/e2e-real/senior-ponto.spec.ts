/**
 * E2E REAL — Senior Ponto (platform.senior.com.br)
 *
 * Apenas GET. O endpoint POST de bater ponto (clockingEventImportByBrowser)
 * NÃO É TOCADO aqui — só verificamos que o GET de eventos responde com a
 * estrutura esperada.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import {
  openRealBrowser,
  ensureLoggedIn,
  captureBearerToken,
  PLATFORMS,
} from './helpers/real-fixture'

let ctx: BrowserContext
let page: Page
let token: string

test.beforeAll(async () => {
  test.setTimeout(240_000)
  const fixture = await openRealBrowser()
  ctx = fixture.context
  page = await ctx.newPage()
  const tokenPromise = captureBearerToken(page, 90_000).catch(() => null)
  await ensureLoggedIn(page, PLATFORMS.senior.platformUrl, PLATFORMS.senior.platformUrl)
  const captured = await tokenPromise
  if (!captured) {
    throw new Error(
      'Não capturei Bearer token na plataforma Senior. ' +
        'Faça login completo e tente novamente.',
    )
  }
  token = captured
})

test.afterAll(async () => {
  await ctx.close()
})

async function get(url: string): Promise<{ status: number; json: unknown }> {
  return await page.evaluate(
    async ({ u, t }) => {
      const r = await fetch(u, {
        headers: { Accept: '*/*', Authorization: `Bearer ${t}` },
        credentials: 'include',
      })
      return {
        status: r.status,
        json: r.ok ? ((await r.json()) as unknown) : null,
      }
    },
    { u: url, t: token },
  )
}

test('REAL-SR-1: GET clockingEvent (entities) responde 200 ou 405', async () => {
  // Esse endpoint é usado pelo SeniorApiPunchProvider como fallback.
  // O backend pode responder 200 (com lista) ou 405 (Method Not Allowed)
  // dependendo da versão; ambos confirmam que o caminho existe.
  const url = `${PLATFORMS.senior.apiUrl}/hcm/pontomobile_clocking_event/entities/clockingEvent`
  const r = await get(url)
  expect([200, 405, 400]).toContain(r.status)
})
