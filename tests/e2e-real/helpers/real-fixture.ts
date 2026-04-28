/**
 * Helper para testes E2E REAIS (opt-in via E2E_REAL=1).
 *
 * - Abre um Chromium HEADED com perfil persistente em `tests/.real-profile/`
 *   (gitignored). Login feito uma vez fica salvo entre rodadas.
 * - Captura tokens (Authorization: Bearer / assertion) interceptando
 *   requests da página real, sem precisar do extension nem de variáveis
 *   de ambiente.
 *
 * IMPORTANTE: estes specs SÓ FAZEM GET. Nenhum POST/PATCH/DELETE
 * que altere dados é executado.
 */
import { chromium, type BrowserContext, type Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const PROFILE_DIR = path.resolve(__dirname, '../../.real-profile')

export interface RealFixture {
  context: BrowserContext
  close: () => Promise<void>
}

export async function openRealBrowser(): Promise<RealFixture> {
  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true })
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox'],
  })
  return {
    context,
    close: async () => {
      await context.close()
    },
  }
}

/**
 * Navega até `url` e aguarda o usuário fazer login (até `timeoutMs`).
 * Considera "logado" quando a URL final começa com `targetOrigin` e não
 * contém marcadores típicos de tela de login.
 */
export async function ensureLoggedIn(
  page: Page,
  url: string,
  targetOrigin: string,
  timeoutMs = 180_000,
): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const current = page.url()
    if (
      current.startsWith(targetOrigin) &&
      !/\/login|sign[-_]?in|auth\//i.test(current)
    ) {
      // Aguarda um pouquinho para a SPA terminar de bootstrap
      await page.waitForTimeout(2000)
      return
    }
    await page.waitForTimeout(1000)
  }
  throw new Error(
    `Login não completou em ${timeoutMs}ms. URL atual: ${page.url()}\n` +
      `Faça login manualmente na janela aberta, deixe o app carregar, e re-rode.`,
  )
}

/**
 * Listener que captura o primeiro Authorization: Bearer encontrado em
 * requests da página. Resolve a Promise quando encontra. Útil pra pegar o
 * token de acesso que a SPA usa internamente.
 */
export function captureBearerToken(page: Page, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      page.off('request', listener)
      reject(new Error(`Não capturou Bearer token em ${timeoutMs}ms`))
    }, timeoutMs)

    function listener(req: ReturnType<Page['url']> extends string ? any : any) {
      const auth = req.headers()['authorization']
      if (auth?.startsWith('Bearer ') || auth?.startsWith('bearer ')) {
        clearTimeout(timer)
        page.off('request', listener)
        resolve(auth.slice(7))
      }
    }

    page.on('request', listener)
  })
}

/**
 * Captura header `assertion` (formato usado pelo Gestão Ponto).
 */
export function captureAssertion(page: Page, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      page.off('request', listener)
      reject(new Error(`Não capturou header 'assertion' em ${timeoutMs}ms`))
    }, timeoutMs)

    function listener(req: any) {
      const assertion = req.headers()['assertion']
      if (assertion && assertion.length > 50) {
        clearTimeout(timer)
        page.off('request', listener)
        resolve(assertion)
      }
    }

    page.on('request', listener)
  })
}

export const PLATFORMS = {
  meta: {
    platformUrl: 'https://plataforma.meta.com.br',
    bootstrapUrl:
      'https://platform.senior.com.br/login/?redirectTo=https%3A%2F%2Fplataforma.meta.com.br&tenant=meta.com.br',
    apiUrl: 'https://api.meta.com.br',
  },
  gp: {
    platformUrl: 'https://gestaoponto.meta.com.br',
    apiUrl: 'https://gestaoponto.meta.com.br/gestaoponto-backend/api',
  },
  senior: {
    platformUrl: 'https://platform.senior.com.br',
    apiUrl: 'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest',
  },
} as const
