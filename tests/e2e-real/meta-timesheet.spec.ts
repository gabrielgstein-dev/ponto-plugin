/**
 * E2E REAL — Meta Timesheet (api.meta.com.br)
 *
 * Apenas GETs, sem nenhum PATCH/POST que altere dados.
 *
 * Pré-requisito: rodar com E2E_REAL=1 (a config do Playwright só inclui
 * este diretório nesse caso). Na primeira execução, faça login na janela
 * que abrir; o perfil é persistido em `tests/.real-profile/`.
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

const period = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})()

test.beforeAll(async () => {
  test.setTimeout(240_000)
  const fixture = await openRealBrowser()
  ctx = fixture.context
  page = await ctx.newPage()
  // Inicia a captura ANTES da navegação para não perder requests iniciais.
  const tokenPromise = captureBearerToken(page, 90_000).catch(() => null)
  await ensureLoggedIn(page, PLATFORMS.meta.platformUrl, PLATFORMS.meta.platformUrl)
  const captured = await tokenPromise
  if (!captured) {
    throw new Error(
      'Não consegui capturar Bearer token na plataforma Meta. ' +
        'Faça login completamente e tente de novo.',
    )
  }
  token = captured
})

test.afterAll(async () => {
  await ctx.close()
})

const headers = () => ({
  Accept: '*/*',
  Authorization: `Bearer ${token}`,
})

async function get<T>(url: string): Promise<{ status: number; json: T | null }> {
  const r = await page.evaluate(
    async ({ u, h }) => {
      const resp = await fetch(u, { headers: h, credentials: 'include' })
      return {
        status: resp.status,
        json: resp.ok ? ((await resp.json()) as unknown) : null,
      }
    },
    { u: url, h: headers() },
  )
  return { status: r.status, json: r.json as T | null }
}

test('REAL-MTS-1: GET hours-summary retorna 200 com campos esperados', async () => {
  const url = `${PLATFORMS.meta.apiUrl}/timesheets/v1/hours-summary?period=${period}`
  const r = await get<{
    pendingHours: number
    approvedHours: number
    repprovedHours: number
    totalReportedHours: number
  }>(url)
  expect(r.status).toBe(200)
  expect(r.json).not.toBeNull()
  expect(typeof r.json!.pendingHours).toBe('number')
  expect(typeof r.json!.approvedHours).toBe('number')
  expect(typeof r.json!.totalReportedHours).toBe('number')
})

test('REAL-MTS-2: GET cost-centers retorna 200 com array data', async () => {
  // Tenta extrair userId do JWT capturado.
  const userId = (() => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      return (payload.metaUUID || payload.sub || payload.userId) as string | undefined
    } catch {
      return undefined
    }
  })()
  if (!userId) {
    test.info().annotations.push({
      type: 'info',
      description: 'Não foi possível extrair userId do JWT — pulando',
    })
    test.skip()
    return
  }

  const url = `${PLATFORMS.meta.apiUrl}/timesheets/v1/users/${userId}/cost-centers`
  const r = await get<{ data: Array<{ code: string; name: string }> }>(url)
  // cost-centers pode retornar 404 para usuários sem CC alocado; aceitamos
  // 200 com data array OU 404 (resposta válida da API).
  expect([200, 404]).toContain(r.status)
  if (r.status === 200) {
    expect(Array.isArray(r.json?.data)).toBe(true)
  }
})

test('REAL-MTS-3: GET reported-hours retorna 200 com array data', async () => {
  const userId = (() => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      return (payload.metaUUID || payload.sub || payload.userId) as string | undefined
    } catch {
      return undefined
    }
  })()
  if (!userId) {
    test.skip()
    return
  }

  const url = `${PLATFORMS.meta.apiUrl}/timesheets/v1/users/${userId}/reported-hours?period=${period}&sort=-date`
  const r = await get<{ data: Array<{ id: string; date: string; status: { title: string } }> }>(url)
  expect(r.status).toBe(200)
  expect(r.json).not.toBeNull()
  expect(Array.isArray(r.json!.data)).toBe(true)
  // Se houver entries, valida o shape do primeiro
  if (r.json!.data.length > 0) {
    const entry = r.json!.data[0]
    expect(typeof entry.id).toBe('string')
    expect(typeof entry.date).toBe('string')
    expect(typeof entry.status?.title).toBe('string')
  }
})
