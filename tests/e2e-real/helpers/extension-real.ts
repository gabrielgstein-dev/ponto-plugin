/**
 * Carrega a extensão REAL (build de produção em .output/chrome-mv3)
 * num Chromium HEADED com perfil persistente em `tests/.real-profile/`.
 *
 * Isto é o "teste de integração total": Service Worker, popup, sidepanel,
 * sistema de cache de tabs, captura de token via webRequest e fetches reais
 * pra api.meta.com.br / senior.com.br rodam exatamente como em produção.
 */
import { chromium, type BrowserContext, type Worker } from '@playwright/test'
import path from 'path'
import fs from 'fs'

// O tipo runtime do service worker num BrowserContext é `Worker`.
type ServiceWorker = Worker

const EXTENSION_PATH = path.resolve(__dirname, '../../../.output/chrome-mv3')
const PROFILE_DIR = path.resolve(__dirname, '../../.real-profile')

export interface RealExtensionFixture {
  context: BrowserContext
  serviceWorker: ServiceWorker
  extensionId: string
  popupUrl: string
  sidepanelUrl: string
  close: () => Promise<void>
}

export async function launchRealExtension(): Promise<RealExtensionFixture> {
  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error(
      `Extensão não compilada. Execute 'pnpm build:insi' antes.\nEsperado em: ${EXTENSION_PATH}`,
    )
  }
  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  })

  const serviceWorker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15_000 }))

  const extensionId = new URL(serviceWorker.url()).hostname

  return {
    context,
    serviceWorker,
    extensionId,
    popupUrl: `chrome-extension://${extensionId}/popup.html`,
    sidepanelUrl: `chrome-extension://${extensionId}/sidepanel.html`,
    close: async () => {
      await context.close()
    },
  }
}

/**
 * Faz polling em chrome.storage.local até `predicate(value)` retornar true,
 * ou estourar `timeoutMs`. Avalia dentro do service worker para evitar
 * abrir uma página adicional só pra ler storage.
 */
export async function waitForStorageValue<T>(
  sw: ServiceWorker,
  key: string,
  predicate: (value: T | undefined) => boolean,
  timeoutMs = 60_000,
): Promise<T | undefined> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = await sw.evaluate(async (k: string) => {
      const data = await (globalThis as unknown as { chrome: { storage: { local: { get(key: string): Promise<Record<string, unknown>> } } } }).chrome.storage.local.get(k)
      return data[k] as unknown
    }, key)
    if (predicate(value as T | undefined)) return value as T | undefined
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return undefined
}

/**
 * Remove chaves do chrome.storage.local. Útil para forçar uma captura nova
 * de token a cada teste (sem isso, valores cacheados de execuções anteriores
 * fariam os testes passarem mesmo com bug de captura).
 */
export async function clearStorageKeys(
  sw: ServiceWorker,
  keys: string[],
): Promise<void> {
  await sw.evaluate(async (ks: string[]) => {
    await (
      globalThis as unknown as {
        chrome: { storage: { local: { remove(keys: string[]): Promise<void> } } }
      }
    ).chrome.storage.local.remove(ks)
  }, keys)
}

/**
 * Espera o usuário fazer login navegando manualmente. A função abre a URL
 * indicada e aguarda até a aba sair do path de login. Em rodadas subsequentes
 * (perfil persistente), o login costuma ser silencioso e completa em segundos.
 */
export async function ensureLoggedInOnTab(
  context: BrowserContext,
  url: string,
  targetOrigin: string,
  timeoutMs = 240_000,
): Promise<void> {
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const current = page.url()
    if (
      current.startsWith(targetOrigin) &&
      !/\/login|sign[-_]?in|auth\//i.test(current)
    ) {
      // Dá um momento pra SPA bootstrap e disparar requests autenticados
      await page.waitForTimeout(3000)
      return
    }
    await page.waitForTimeout(1000)
  }
  throw new Error(
    `Login não completou em ${timeoutMs}ms. URL atual: ${page.url()}\n` +
      `Faça login na janela aberta e re-rode.`,
  )
}
