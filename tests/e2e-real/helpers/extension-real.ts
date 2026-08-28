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

/**
 * Se a rodada anterior morreu (kill, build por cima do .output), o Chromium
 * marca `exit_type: Crashed` e RESTAURA as abas antigas ao abrir — inclusive
 * abas de builds antigos (ex.: GP no host legado → 301 → /login). Pior: o
 * service worker que `context.serviceWorkers()[0]` devolve pode ser um
 * restaurado/morto, e `sw.evaluate` trava pra sempre. Limpa antes de abrir.
 */
function cleanCrashedSession(): void {
  const def = path.join(PROFILE_DIR, 'Default')
  fs.rmSync(path.join(def, 'Sessions'), { recursive: true, force: true })
  const prefs = path.join(def, 'Preferences')
  if (fs.existsSync(prefs)) {
    try {
      const j = JSON.parse(fs.readFileSync(prefs, 'utf-8'))
      if (j.profile) { j.profile.exit_type = 'Normal'; j.profile.exited_cleanly = true }
      j.session = { ...(j.session ?? {}), restore_on_startup: 5 }
      fs.writeFileSync(prefs, JSON.stringify(j))
    } catch { /* prefs corrompido — Chromium recria */ }
  }
}

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
  cleanCrashedSession()

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  })

  let serviceWorker =
    context.serviceWorkers().find(w => w.url().startsWith('chrome-extension://')) ??
    (await context.waitForEvent('serviceworker', { timeout: 15_000 }))
  // Sanidade: um SW restaurado/morto trava qualquer evaluate. Ping com timeout.
  const alive = await Promise.race([
    serviceWorker.evaluate(() => true).catch(() => false),
    new Promise<boolean>(r => setTimeout(() => r(false), 10_000)),
  ])
  if (!alive) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 30_000 })
  }

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

/**
 * Login semi-automático: preenche usuário/senha a partir do `.env`
 * (INSI_USERNAME / INSI_PASS — gitignored) nas telas Senior-Insi e
 * Microsoft, e deixa só o MFA pro humano. Nunca loga os valores.
 * Sem `.env`, cai no fluxo 100% manual (`ensureLoggedInOnTab`).
 */
export function readEnvCredentials(): { username: string; password: string } | null {
  const envPath = path.resolve(__dirname, '../../../.env')
  if (!fs.existsSync(envPath)) return null
  const vars: Record<string, string> = {}
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  if (!vars.INSI_USERNAME || !vars.INSI_PASS) return null
  return { username: vars.INSI_USERNAME, password: vars.INSI_PASS }
}

export async function loginWithEnvCredentials(
  context: BrowserContext,
  loginUrl: string,
  targetOrigin: string,
  timeoutMs = 300_000,
): Promise<void> {
  const creds = readEnvCredentials()
  if (!creds) {
    console.log('[login] sem INSI_USERNAME/INSI_PASS no .env — login manual')
    return ensureLoggedInOnTab(context, loginUrl, targetOrigin, timeoutMs)
  }

  const page = await context.newPage()
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' })
  const start = Date.now()
  const done = new Set<string>()
  const log = (m: string) => console.log(`[login +${Math.round((Date.now() - start) / 1000)}s] ${m}`)

  while (Date.now() - start < timeoutMs) {
    const url = page.url()
    if (url.startsWith(targetOrigin) && !/\/login|sign[-_]?in|auth\//i.test(url)) {
      log('sessão pronta em ' + url.slice(0, 60))
      await page.waitForTimeout(3000)
      return
    }
    try {
      // 1. Tela Senior-Insi: "Usuário" → Próximo
      if (url.includes('platform.senior.com.br/login') && !done.has('senior-user')) {
        const user = page.locator('input[placeholder*="Usu"], input[name="username"], input[type="text"]').first()
        if (await user.isVisible({ timeout: 500 }).catch(() => false)) {
          await user.fill(creds.username)
          const next = page.locator('button:has-text("Próximo"), button:has-text("Autenticar"), button[type="submit"]').first()
          await next.click()
          done.add('senior-user'); log('usuário preenchido (Senior)')
        }
      }
      // 2. Microsoft: e-mail (pode vir pré-preenchido), senha, "Continuar conectado?"
      if (url.includes('login.microsoftonline.com')) {
        const email = page.locator('input[name="loginfmt"]')
        if (!done.has('ms-email') && await email.isVisible({ timeout: 500 }).catch(() => false)) {
          await email.fill(creds.username)
          await page.locator('#idSIButton9, input[type="submit"]').first().click()
          done.add('ms-email'); log('e-mail preenchido (Microsoft)')
        }
        const pass = page.locator('input[name="passwd"]')
        if (!done.has('ms-pass') && await pass.isVisible({ timeout: 500 }).catch(() => false)) {
          await pass.fill(creds.password)
          await page.locator('#idSIButton9, input[type="submit"]').first().click()
          done.add('ms-pass'); log('senha preenchida — aguardando MFA no celular')
        }
        const mfaNumber = page.locator('#idRichContext_DisplaySign')
        if (!done.has('mfa-shown') && await mfaNumber.isVisible({ timeout: 300 }).catch(() => false)) {
          log('MFA: número exibido = ' + (await mfaNumber.innerText()).trim())
          done.add('mfa-shown')
        }
        const kmsi = page.locator('#idSIButton9')
        const kmsiTitle = page.locator('#KmsiTitle, div[data-bind*="Kmsi"]')
        if (done.has('ms-pass') && !done.has('kmsi') && await kmsiTitle.isVisible({ timeout: 300 }).catch(() => false)) {
          await kmsi.click(); done.add('kmsi'); log('"continuar conectado" = sim')
        }
      }
    } catch (e) {
      log('passo falhou (segue tentando): ' + (e as Error).message.split('\n')[0])
    }
    await page.waitForTimeout(1000)
  }
  throw new Error(`Login não completou em ${timeoutMs}ms. URL atual: ${page.url()}`)
}
