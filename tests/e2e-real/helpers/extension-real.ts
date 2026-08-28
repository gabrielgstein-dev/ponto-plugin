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
  if (process.env.E2E_MANUAL_LOGIN === '1') {
    console.log('[login] E2E_MANUAL_LOGIN=1 — faça o login inteiro na janela (inclusive o botão). O teste só espera a sessão ficar pronta.')
    return ensureLoggedInOnTab(context, loginUrl, targetOrigin, timeoutMs)
  }
  if (!creds) {
    console.log('[login] sem INSI_USERNAME/INSI_PASS no .env — login manual')
    return ensureLoggedInOnTab(context, loginUrl, targetOrigin, timeoutMs)
  }

  const OUT = path.resolve(__dirname, '../../../') + '/test-results-manual'
  try { fs.mkdirSync(OUT, { recursive: true }) } catch { /* ok */ }

  const page = await context.newPage()
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' })
  const start = Date.now()
  const done = new Set<string>()
  const log = (m: string) => console.log(`[login +${Math.round((Date.now() - start) / 1000)}s] ${m}`)

  // Procura um campo/botão em QUALQUER frame (main + iframes). No perfil zerado
  // o form Keycloak da Insi carrega num iframe que pode demorar; olhar só o
  // iframe sso trava. Aqui varremos todos os frames a cada tentativa.
  async function findVisible(selectors: string[]) {
    for (const f of page.frames()) {
      for (const sel of selectors) {
        const loc = f.locator(sel).first()
        if (await loc.isVisible({ timeout: 150 }).catch(() => false)) return { frame: f, loc }
      }
    }
    return null
  }

  let lastShot = 0
  while (Date.now() - start < timeoutMs) {
    const url = page.url()
    if (url.startsWith(targetOrigin) && !/\/login|sign[-_]?in|auth\//i.test(url)) {
      log('sessão pronta em ' + url.slice(0, 60))
      await page.waitForTimeout(3000)
      return
    }
    try {
      // 1. Tela Senior/Insi (Keycloak, em iframe): Usuário -> Próximo/Entrar.
      if (url.includes('platform.senior.com.br/login') && !done.has('senior-user')) {
        const hit = await findVisible(['#username-input-field', 'input[name="username"]'])
        if (hit) {
          await hit.loc.fill(creds.username)
          await hit.loc.press('Enter').catch(() => {})
          const btn = hit.frame.locator('#nextBtn, #loginbtn, button:has-text("Próximo"), button:has-text("Entrar"), button:has-text("Autenticar"), button[type="submit"]').first()
          if (await btn.isVisible({ timeout: 300 }).catch(() => false)) await btn.click().catch(() => {})
          done.add('senior-user'); log('usuário preenchido + Próximo (Senior/Insi)')
        }
      }
      // 1b. Senha local no próprio Keycloak (tenant sem SAML). Não é o caso da
      //     Insi (vai pra Microsoft), mas cobre sem travar.
      if (url.includes('platform.senior.com.br/login') && done.has('senior-user') && !done.has('senior-pass')) {
        const hit = await findVisible(['#password-input-field', 'input[name="password"][type="password"]'])
        if (hit) {
          await hit.loc.fill(creds.password)
          const btn = hit.frame.locator('#loginbtn, button:has-text("Autenticar"), button:has-text("Entrar"), button[type="submit"]').first()
          await btn.click()
          done.add('senior-pass'); log('senha preenchida + Entrar (Senior local)')
        }
      }
      // 2. Microsoft: e-mail -> Avançar, senha -> Entrar; MFA fica com o humano.
      if (url.includes('login.microsoftonline.com')) {
        const email = page.locator('input[name="loginfmt"]:visible')
        if (!done.has('ms-email') && await email.isVisible({ timeout: 400 }).catch(() => false)) {
          await email.click()
          await email.fill(creds.username)
          await email.press('Enter')                 // Enter submete sem depender do seletor do botão
          done.add('ms-email'); log('e-mail preenchido + Enter (Microsoft)')
          await page.waitForTimeout(2500)
        }
        const pass = page.locator('input[name="passwd"]:visible')
        if (!done.has('ms-pass') && await pass.isVisible({ timeout: 400 }).catch(() => false)) {
          await pass.click()
          await pass.fill(creds.password)
          await pass.press('Enter')
          done.add('ms-pass'); log('senha preenchida + Enter — agora faça o MFA no celular')
          await page.waitForTimeout(2500)
        }
        const mfaNumber = page.locator('#idRichContext_DisplaySign')
        if (!done.has('mfa-shown') && await mfaNumber.isVisible({ timeout: 300 }).catch(() => false)) {
          log('MFA: número exibido na tela = ' + (await mfaNumber.innerText()).trim())
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
    // Screenshot periódico enquanto ainda estamos numa tela de login, pra
    // diagnosticar travas (reCAPTCHA, tela inesperada) sem adivinhar.
    if (Date.now() - lastShot > 8_000) {
      lastShot = Date.now()
      const shot = `${OUT}/login-${Math.round((Date.now() - start) / 1000)}s.png`
      await page.screenshot({ path: shot }).catch(() => {})
      log(`estado: ${url.slice(0, 70)} | frames=${page.frames().length} | shot=${shot.split('/').pop()}`)
    }
    await page.waitForTimeout(1000)
  }
  await page.screenshot({ path: `${OUT}/login-timeout.png` }).catch(() => {})
  throw new Error(`Login não completou em ${timeoutMs}ms. URL atual: ${page.url()}`)
}
