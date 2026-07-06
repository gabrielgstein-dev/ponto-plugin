/**
 * Captura prints da apresentação didática do Ponto Meta.
 *
 * Pré-requisitos:
 *   pnpm build:meta              # gera .output/chrome-mv3
 *   pnpm tsx scripts/capture-tutorial.ts
 *
 * Saída: docs/apresentacao/screenshots/*.png
 *
 * Estratégia:
 *  - Passos sem login: estado é "semeado" no chrome.storage.local antes de
 *    abrir o sidepanel, então a UI renderiza sem precisar do Meta.
 *  - Passos com login: usam um perfil persistente em ~/.ponto-tutorial-profile.
 *    Faça login manualmente uma vez; o script reusa a sessão nas próximas runs.
 *
 * Cada print é salvo com nome 01-…, 02-… na ordem do roteiro.
 */
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import os from 'os'

const ROOT = path.resolve(__dirname, '..')
const EXTENSION_PATH = path.join(ROOT, '.output/chrome-mv3')
const OUT_DIR = path.join(ROOT, 'docs/apresentacao/screenshots')
const PROFILE_DIR = path.join(os.homedir(), '.ponto-tutorial-profile')

const VIEWPORT = { width: 1280, height: 800 }

// Estado fictício para os passos sem login. Datas são relativas a hoje.
const today = new Date()
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const dayOffset = (offset: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  return d
}
const manualPunches: Record<string, string[]> = {}
for (let i = -10; i <= 0; i++) {
  const d = dayOffset(i)
  if (d.getDay() === 0 || d.getDay() === 6) continue // skip weekends
  if (i === 0) {
    manualPunches[ymd(d)] = ['08:30', '12:15', '13:15'] // hoje sem saída ainda
  } else {
    manualPunches[ymd(d)] = ['08:30', '12:00', '13:00', '17:30']
  }
}
const SEED_STATE = {
  pontoState: {
    entrada: '08:30',
    almoco: '12:15',
    volta: '13:15',
    saida: null,
    _almocoSugerido: '12:00',
    _voltaSugerida: '13:15',
    _saidaEstimada: '17:30',
  },
  pontoSettings: {
    jornada: 480,
    almocoHorario: '12:00',
    almocoDur: 60,
    notifAntecip: 10,
    closingDay: 25,
  },
  pontoDate: today.toDateString(),
  manualPunches,
}

function ensureBuilt() {
  if (!fs.existsSync(EXTENSION_PATH)) {
    throw new Error(
      `Extensão não compilada. Rode 'pnpm build:insi' antes.\n` +
        `Esperado em: ${EXTENSION_PATH}`,
    )
  }
}

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

async function launch(profileDir: string): Promise<{
  context: BrowserContext
  extensionId: string
}> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: VIEWPORT,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  })

  const sw =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15_000 }))
  const extensionId = new URL(sw.url()).hostname

  return { context, extensionId }
}

async function shot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  const file = path.join(OUT_DIR, name)
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? false })
  console.log(`  → ${path.relative(ROOT, file)}`)
}

/**
 * Semeia chrome.storage.local antes de abrir o sidepanel,
 * para que a UI renderize sem depender do Meta.
 */
async function seedStorage(context: BrowserContext, extensionId: string) {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  await page.evaluate((seed) => {
    return new Promise<void>((resolve) => {
      // @ts-expect-error chrome global injetado pela extensão
      chrome.storage.local.set(seed, () => resolve())
    })
  }, SEED_STATE)
  await page.close()
}

// ─── Capítulo 1 — Instalação ─────────────────────────────────────────────────
// A extensão é instalada via Chrome Web Store. Capturamos a página da loja
// (com botão "Usar no Chrome") e um close-up do botão. O modal de confirmação
// e o menu de fixar o ícone são UI nativa do navegador → captura manual.
const STORE_URL =
  'https://chromewebstore.google.com/detail/ponto-meta/akghhfaeecgmcbaofoaadafleoliciaf'

async function chapter1_install(context: BrowserContext) {
  console.log('Capítulo 1 — Instalação')
  const page = await context.newPage()

  await page.goto(STORE_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500) // espera carregar o app shell + cards
  await shot(page, '01-store-page.png')

  // Close-up do botão "Usar no Chrome" (ou "Add to Chrome")
  const btn = page.locator('button:has-text("Usar no Chrome"), button:has-text("Add to Chrome")').first()
  if (await btn.count()) {
    await btn.scrollIntoViewIfNeeded().catch(() => {})
    const box = await btn.boundingBox()
    if (box) {
      const pad = 60
      await page.screenshot({
        path: path.join(OUT_DIR, '02-add-button.png'),
        clip: {
          x: Math.max(0, box.x - pad),
          y: Math.max(0, box.y - pad),
          width: Math.min(VIEWPORT.width, box.width + pad * 2),
          height: box.height + pad * 2,
        },
      })
      console.log('  → docs/apresentacao/screenshots/02-add-button.png')
    }
  } else {
    console.warn('  (botão "Usar no Chrome" não encontrado — captura 02 manual)')
  }

  await page.close()
}

// ─── Capítulo 2/3 — Sidepanel populado ───────────────────────────────────────
async function chapter2_sidepanel(context: BrowserContext, extensionId: string) {
  console.log('Capítulo 2/3 — Sidepanel')

  // Antes de semear: estado vazio. Limpa storage primeiro.
  const wipe = await context.newPage()
  await wipe.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  await wipe.evaluate(() => new Promise<void>((r) => {
    // @ts-expect-error chrome global
    chrome.storage.local.clear(() => r())
  }))
  await wipe.close()

  const empty = await context.newPage()
  await empty.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  await empty.waitForLoadState('domcontentloaded')
  await empty.waitForTimeout(800)
  await shot(empty, '06-sidepanel-empty.png')
  await empty.close()

  // Semeia e reabre: estado populado
  await seedStorage(context, extensionId)
  const populated = await context.newPage()
  await populated.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  await populated.waitForLoadState('domcontentloaded')
  await populated.waitForTimeout(1500) // dá tempo do hook recalcular
  await shot(populated, '08-sidepanel-populated.png')
  await shot(populated, '09-balance-positive.png')
  await shot(populated, '10-period-nav.png')
  await shot(populated, '11-day-row.png')
  await populated.close()
}

// ─── Capítulo 5 — Popups de lembrete ─────────────────────────────────────────
async function chapter5_reminders(context: BrowserContext, extensionId: string) {
  console.log('Capítulo 5 — Lembretes')
  const slots: Array<[string, string, string]> = [
    ['almoco', '12:00', '15-notif-almoco.png'],
    ['volta', '13:00', '16-notif-volta.png'],
    ['saida', '17:30', '17-notif-saida.png'],
  ]
  for (const [slot, time, file] of slots) {
    const page = await context.newPage()
    await page.goto(
      `chrome-extension://${extensionId}/punch-reminder.html?slot=${slot}&time=${encodeURIComponent(time)}`,
    )
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(300)
    await shot(page, file)
    await page.close()
  }
}

// ─── Capítulo 6 — Widget flutuante ───────────────────────────────────────────
// O widget só é injetado nos domínios do Meta/Senior. Interceptamos a request
// e servimos HTML mock para que o content script seja disparado pelo Chrome.
async function chapter6_widget(context: BrowserContext) {
  console.log('Capítulo 6 — Widget')
  const page = await context.newPage()
  await page.route('https://gestaoponto.meta.com.br/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta charset="utf-8"><title>Gestão de Ponto</title>
        <style>body{font-family:system-ui;background:#f5f7fa;margin:0;padding:32px}
        h1{color:#1f3a93}</style></head>
        <body><h1>Meta — Gestão de Ponto</h1>
        <p>Página de exemplo para captura do widget flutuante.</p></body></html>`,
    }),
  )
  await page.goto('https://gestaoponto.meta.com.br/dashboard')
  await page.waitForTimeout(2500) // tempo do content script injetar e ler storage

  const widget = page.locator('#senior-ponto-widget')
  if (!(await widget.count())) {
    console.warn('  (widget não injetado — content script pode não ter rodado)')
    await page.close()
    return
  }

  await shot(page, '18-widget-collapsed.png')

  await page.locator('#senior-ponto-widget #spw-toggle').click().catch(() => {})
  await page.waitForTimeout(500)
  await shot(page, '19-widget-expanded.png')
  await page.close()
}

// ─── Capítulo 7 — Aba Timesheet (com seed) ───────────────────────────────────
async function chapter7_timesheet(context: BrowserContext, extensionId: string) {
  console.log('Capítulo 7 — Timesheet')
  const sp = await context.newPage()
  await sp.goto(`chrome-extension://${extensionId}/sidepanel.html`)
  await sp.waitForTimeout(1000)
  const tab = sp.locator('button.sp-tab', { hasText: 'Timesheet' })
  if (await tab.count()) {
    await tab.click().catch(() => {})
    await sp.waitForTimeout(800)
    await shot(sp, '20-timesheet-tab.png')
    await shot(sp, '21-timesheet-pending.png')
  } else {
    console.warn('  (aba Timesheet não encontrada — flag ENABLE_META_TIMESHEET pode estar off)')
  }
  await sp.close()
}

async function main() {
  ensureBuilt()
  ensureOutDir()
  fs.mkdirSync(PROFILE_DIR, { recursive: true })

  const { context, extensionId } = await launch(PROFILE_DIR)
  console.log(`Extensão carregada: ${extensionId}`)
  console.log(`Saída: ${OUT_DIR}\n`)

  try {
    await chapter1_install(context)
    await chapter2_sidepanel(context, extensionId)
    await chapter5_reminders(context, extensionId)
    await chapter6_widget(context)
    await chapter7_timesheet(context, extensionId)
  } finally {
    await context.close()
  }

  console.log('\nPronto. Revise os PNGs em', path.relative(ROOT, OUT_DIR))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
