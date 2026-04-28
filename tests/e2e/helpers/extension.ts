/**
 * Helper para carregar a extensão no Playwright.
 *
 * Pré-requisito: extensão compilada em .output/chrome-mv3
 * Execute `pnpm build:meta` antes dos testes E2E.
 */
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'

export const EXTENSION_PATH = path.resolve(__dirname, '../../../.output/chrome-mv3')

export interface ExtensionFixture {
  context: BrowserContext
  extensionId: string
  popupUrl: string
  sidepanelUrl: string
}

export async function launchExtension(profileDir = ''): Promise<ExtensionFixture> {
  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error(
      `Extensão não compilada. Execute 'pnpm build:meta' antes dos testes E2E.\n` +
        `Esperado em: ${EXTENSION_PATH}`,
    )
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  })

  // Aguarda service worker registrar
  const sw =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null))

  if (!sw) throw new Error('Service worker não registrou em 15s')

  const extensionId = new URL(sw.url()).hostname

  return {
    context,
    extensionId,
    popupUrl: `chrome-extension://${extensionId}/popup.html`,
    sidepanelUrl: `chrome-extension://${extensionId}/sidepanel.html`,
  }
}

/**
 * Cria uma página que intercepta chamadas às APIs Senior e Meta.
 * Útil para simular respostas sem depender de servidores reais.
 *
 * Sempre adiciona um catch-all que retorna HTML vazio para a URL principal
 * de navegação, garantindo que o `page.goto()` não falhe por DNS.
 */
export async function openPageWithApiMocks(
  context: BrowserContext,
  targetUrl: string,
  mocks: Array<{ url: string | RegExp; responseBody: unknown; status?: number }>,
): Promise<Page> {
  const page = await context.newPage()

  for (const mock of mocks) {
    await page.route(mock.url, route =>
      route.fulfill({
        status: mock.status ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(mock.responseBody),
      }),
    )
  }

  // Catch-all para qualquer request restante (HTML, assets, APIs sem mock)
  // do mesmo origin do targetUrl. Retorna 200 com corpo vazio para evitar
  // falhas de DNS ou network ao subir páginas externas.
  const origin = new URL(targetUrl).origin
  await page.route(`${origin}/**`, route => {
    if (route.request().resourceType() === 'document') {
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body></body></html>',
      })
    }
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
  })

  await page.goto(targetUrl)
  return page
}

export const SENIOR_API_BASE =
  'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest'
export const SENIOR_PLATFORM_URL = 'https://rh.senior.com.br'
export const META_PLATFORM_URL = 'https://plataforma.meta.com.br'
