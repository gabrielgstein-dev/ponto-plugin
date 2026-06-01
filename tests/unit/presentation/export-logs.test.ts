import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/domain/build-flags', () => ({
  APP_NAME: 'Ponto Test',
  DEBUG: false,
  ACTIVE_COMPANY: 'meta',
  ENABLE_SENIOR_INTEGRATION: true,
  ENABLE_SENIOR_PUNCH_BUTTON: false,
  ENABLE_MANUAL_PUNCH: false,
  ENABLE_WIDGET: false,
  ENABLE_YESTERDAY: false,
  ENABLE_NOTIFICATIONS: true,
  ENABLE_META_TIMESHEET: true,
  THEME: 'meta',
}))

const getLogsSpy = vi.fn()
vi.mock('../../../lib/domain/log-store', () => ({
  getLogs: () => getLogsSpy(),
}))

import { exportLogs } from '../../../lib/presentation/export-logs'

describe('exportLogs', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let appendChildSpy: ReturnType<typeof vi.spyOn>
  let removeChildSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 28, 14, 5, 7))
    createObjectURL = vi.fn().mockReturnValue('blob:fake')
    revokeObjectURL = vi.fn()
    ;(globalThis.URL as any).createObjectURL = createObjectURL
    ;(globalThis.URL as any).revokeObjectURL = revokeObjectURL
    appendChildSpy = vi.spyOn(document.body, 'appendChild')
    removeChildSpy = vi.spyOn(document.body, 'removeChild')
    getLogsSpy.mockReset()
  })

  afterEach(() => {
    appendChildSpy.mockRestore()
    removeChildSpy.mockRestore()
    vi.useRealTimers()
  })

  it('builds JSON blob, triggers download with sluggified filename and revokes URL', async () => {
    getLogsSpy.mockResolvedValue([
      { ts: 1, level: 'log', ctx: 'popup', msg: 'hello' },
    ])
    const clickSpy = vi.fn()
    let createdAnchor: HTMLAnchorElement | null = null
    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag) as HTMLAnchorElement
      if (tag === 'a') {
        createdAnchor = el
        el.click = clickSpy
      }
      return el
    })

    await exportLogs()

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(createdAnchor).not.toBeNull()
    expect(createdAnchor!.download).toBe('ponto-test-logs-2026-04-28-140507.json')
    expect(createdAnchor!.href).toContain('blob:')

    vi.advanceTimersByTime(1100)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
  })

  it('writes JSON payload with appName, exportedAt and entries', async () => {
    getLogsSpy.mockResolvedValue([
      { ts: 100, level: 'log', ctx: 'popup', msg: 'a' },
    ])
    const RealBlob = globalThis.Blob
    let captured: { parts: BlobPart[]; opts?: BlobPropertyBag } | null = null
    class SpyBlob extends RealBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts)
        captured = { parts, opts }
      }
    }
    ;(globalThis as any).Blob = SpyBlob
    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag) as HTMLAnchorElement
      if (tag === 'a') el.click = vi.fn()
      return el
    })

    await exportLogs()

    ;(globalThis as any).Blob = RealBlob
    expect(captured).not.toBeNull()
    expect(captured!.opts?.type).toBe('application/json;charset=utf-8')
    const bytes = captured!.parts[0] as Uint8Array
    const text = new TextDecoder('utf-8').decode(bytes)
    const parsed = JSON.parse(text)
    expect(parsed.appName).toBe('Ponto Test')
    expect(parsed.exportedAt).toMatch(/^2026-04-28/)
    expect(parsed.pluginVersion).toBeTypeOf('string')
    expect(parsed.summary).toEqual({
      total: 1,
      byLevel: { log: 1, warn: 0, error: 0 },
      span: { from: new Date(100).toISOString(), to: new Date(100).toISOString() },
    })
    expect(parsed.entries).toEqual([
      { ts: 100, level: 'log', ctx: 'popup', msg: 'a' },
    ])
  })

  it('preserves UTF-8 characters (não, ç, ã) without mojibake', async () => {
    getLogsSpy.mockResolvedValue([
      { ts: 1, level: 'log', ctx: 'background', msg: 'sessão não encontrada' },
    ])
    const RealBlob = globalThis.Blob
    let captured: { parts: BlobPart[]; opts?: BlobPropertyBag } | null = null
    class SpyBlob extends RealBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts)
        captured = { parts, opts }
      }
    }
    ;(globalThis as any).Blob = SpyBlob
    const originalCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag) as HTMLAnchorElement
      if (tag === 'a') el.click = vi.fn()
      return el
    })

    await exportLogs()

    ;(globalThis as any).Blob = RealBlob
    const bytes = captured!.parts[0] as ArrayBufferView
    // Cross-realm: o Uint8Array vem de outro contexto, então não vale
    // .toBeInstanceOf — checamos a estrutura (buffer + byte access).
    expect(bytes).toHaveProperty('byteLength')
    expect((bytes as Uint8Array).length).toBeGreaterThan(0)
    const text = new TextDecoder('utf-8').decode(bytes as Uint8Array)
    expect(text).toContain('sessão não encontrada')
    expect(text).not.toContain('sessÃ£o')
  })
})
