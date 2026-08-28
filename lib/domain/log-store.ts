/**
 * Ring buffer de logs persistido em chrome.storage.local.
 *
 * Captura toda chamada de debugLog/debugWarn + handlers globais de erro
 * (pageerror, unhandledrejection, console.error) para que o usuário possa
 * exportar um arquivo .json contendo o que aconteceu antes de uma falha.
 *
 * - Buffer em memória é a fonte de verdade no runtime.
 * - Escrita em chrome.storage é debounced para evitar thrashing.
 * - Capacidade fixa em MAX_ENTRIES (FIFO) para respeitar a cota de storage.
 *
 * Canal PINNED: o buffer normal é FIFO e, no build de diagnóstico, o volume de
 * `[diag] Senior Bearer captured` consome as 500 entradas em ~25min. Eventos
 * raros e decisivos (batida automática, que dispara 4x espalhado no dia) eram
 * despejados antes do usuário conseguir exportar. Entradas marcadas como
 * `pinned` vão para um ring PRÓPRIO, que o ruído não evita — assim um
 * "Auto-punch: FALHA" das 17h continua no export às 19h.
 */

export type LogLevel = 'log' | 'warn' | 'error'
export type LogContext = 'popup' | 'sidepanel' | 'background' | 'unknown'

export interface LogEntry {
  ts: number
  level: LogLevel
  ctx: LogContext
  msg: string
  // Quando uma mesma entry (level+ctx+msg) é registrada N>1 vezes em sequência,
  // a entry mantém o PRIMEIRO ts visto e ganha `repeat` com a contagem total
  // e `lastTs` com o último ts observado. Evita encher o buffer com a mesma
  // linha em loops de polling.
  repeat?: number
  lastTs?: number
  // Entrada crítica: vive também no ring protegido, imune ao FIFO ruidoso.
  pinned?: boolean
}

const STORAGE_KEY = 'appLogs'
const PINNED_STORAGE_KEY = 'appLogsPinned'
const MAX_ENTRIES = 500
// Menor que o principal: só eventos raros entram aqui, e 300 cobre dias inteiros.
const MAX_PINNED = 300
const FLUSH_DEBOUNCE_MS = 500

let buffer: LogEntry[] = []
let pinnedBuffer: LogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function entriesMatchForDedupe(a: LogEntry, b: { level: LogLevel; ctx: LogContext; msg: string }): boolean {
  return a.level === b.level && a.ctx === b.ctx && a.msg === b.msg
}

function detectContext(): LogContext {
  if (typeof window === 'undefined' || typeof location === 'undefined') return 'background'
  const path = location.pathname || ''
  if (path.includes('popup')) return 'popup'
  if (path.includes('sidepanel')) return 'sidepanel'
  return 'unknown'
}

const ctx: LogContext = detectContext()

let mergedFromStorage = false
async function mergeFromStorage(): Promise<void> {
  if (mergedFromStorage) return
  mergedFromStorage = true
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY, PINNED_STORAGE_KEY])
    const stored = data[STORAGE_KEY]
    if (Array.isArray(stored)) {
      buffer = [...(stored as LogEntry[]), ...buffer].slice(-MAX_ENTRIES)
    }
    const storedPinned = data[PINNED_STORAGE_KEY]
    if (Array.isArray(storedPinned)) {
      pinnedBuffer = [...(storedPinned as LogEntry[]), ...pinnedBuffer].slice(-MAX_PINNED)
    }
  } catch (_) {
    /* storage indisponível: opera só em memória */
  }
}

function entryKey(e: LogEntry): string {
  return `${e.ts}|${e.ctx}|${e.level}|${e.msg}`
}

function dedupe(entries: LogEntry[], cap = MAX_ENTRIES): LogEntry[] {
  // Quando dois contextos (popup/background) flush concorrente do mesmo
  // evento, ambos vêm com mesma chave mas potencialmente `repeat` diferentes
  // (cada contexto agrega independente antes de gravar). Preserva a versão
  // com maior contagem pra não perder a agregação mais recente.
  const winners = new Map<string, LogEntry>()
  for (const e of entries) {
    const key = entryKey(e)
    const prev = winners.get(key)
    if (!prev || (e.repeat ?? 1) > (prev.repeat ?? 1)) winners.set(key, e)
  }
  return Array.from(winners.values()).sort((a, b) => a.ts - b.ts).slice(-cap)
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(async () => {
    flushTimer = null
    try {
      // popup, sidepanel e background SW compartilham o mesmo storage key.
      // Pra não sobrescrever o que outro contexto acabou de gravar, lemos
      // o que está lá agora e mergiamos com o nosso buffer antes de salvar.
      const data = await chrome.storage.local.get([STORAGE_KEY, PINNED_STORAGE_KEY])
      const remote = Array.isArray(data[STORAGE_KEY]) ? (data[STORAGE_KEY] as LogEntry[]) : []
      const merged = dedupe([...remote, ...buffer])
      buffer = merged

      const remotePinned = Array.isArray(data[PINNED_STORAGE_KEY]) ? (data[PINNED_STORAGE_KEY] as LogEntry[]) : []
      const mergedPinned = dedupe([...remotePinned, ...pinnedBuffer], MAX_PINNED)
      pinnedBuffer = mergedPinned

      await chrome.storage.local.set({
        [STORAGE_KEY]: merged,
        [PINNED_STORAGE_KEY]: mergedPinned,
      })
    } catch (_) { /* ignora */ }
  }, FLUSH_DEBOUNCE_MS)
}

function stringifyArg(a: unknown): string {
  if (a instanceof Error) {
    return `${a.name}: ${a.message}${a.stack ? `\n${a.stack}` : ''}`
  }
  if (a === null || a === undefined) return String(a)
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a)
    } catch {
      return String(a)
    }
  }
  return String(a)
}

export function stringifyArgs(args: unknown[]): string {
  return args.map(stringifyArg).join(' ')
}

/** Empurra numa fila com dedupe por repetição consecutiva, respeitando o teto. */
function pushInto(target: LogEntry[], entry: LogEntry, cap: number): LogEntry[] {
  const last = target[target.length - 1]
  if (last && entriesMatchForDedupe(last, entry)) {
    last.repeat = (last.repeat ?? 1) + 1
    last.lastTs = entry.ts
    return target
  }
  target.push(entry)
  return target.length > cap ? target.slice(-cap) : target
}

export function appendLog(level: LogLevel, args: unknown[], opts?: { pinned?: boolean }): void {
  // Não toca em chrome.storage no caminho quente: tudo em memória + flush
  // debounced. A leitura do estado anterior só ocorre em getLogs/clearLogs.
  const msg = stringifyArgs(args)
  const now = Date.now()
  const pinned = opts?.pinned === true

  // Entra nos dois: o principal preserva a ordem cronológica junto do resto,
  // o pinned garante sobrevivência quando o FIFO principal já girou.
  buffer = pushInto(buffer, { ts: now, level, ctx, msg, ...(pinned && { pinned }) }, MAX_ENTRIES)
  if (pinned) {
    pinnedBuffer = pushInto(pinnedBuffer, { ts: now, level, ctx, msg, pinned }, MAX_PINNED)
  }
  scheduleFlush()
}

export async function getLogs(): Promise<LogEntry[]> {
  await mergeFromStorage()
  if (pinnedBuffer.length === 0) return [...buffer]
  // Acrescenta só as pinned que o ring principal JÁ PERDEU. Não dá pra usar
  // dedupe() aqui: ele colapsa por ts+ctx+level+msg e duas linhas idênticas
  // legitimamente emitidas no mesmo milissegundo viravam uma só.
  const seen = new Set(buffer.map(entryKey))
  const survivors = pinnedBuffer.filter(e => !seen.has(entryKey(e)))
  if (survivors.length === 0) return [...buffer]
  return [...buffer, ...survivors].sort((a, b) => a.ts - b.ts)
}

export async function clearLogs(): Promise<void> {
  buffer = []
  pinnedBuffer = []
  mergedFromStorage = true
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  try {
    await chrome.storage.local.remove([STORAGE_KEY, PINNED_STORAGE_KEY])
  } catch (_) {
    /* ignora */
  }
}

/* v8 ignore next 9 -- helper apenas para testes; não roda em produção */
export function _resetForTests(): void {
  buffer = []
  pinnedBuffer = []
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  mergedFromStorage = false
}
