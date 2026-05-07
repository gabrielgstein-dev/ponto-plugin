import { describe, it, expect, vi, afterEach } from 'vitest'
import { executeScriptWithTimeout, ScriptTimeoutError } from '../../lib/domain/script-utils'

afterEach(() => {
  vi.useRealTimers()
})

describe('executeScriptWithTimeout', () => {
  it('retorna resultado quando executeScript completa antes do timeout', async () => {
    ;(globalThis.chrome as unknown) = {
      scripting: {
        executeScript: vi.fn(async () => [{ result: 'ok' }]),
      },
    }

    const r = await executeScriptWithTimeout({
      target: { tabId: 1 },
      func: () => 'ok',
    } as never, 1000)
    expect(r).toEqual([{ result: 'ok' }])
  })

  it('lança ScriptTimeoutError quando estoura o timeout', async () => {
    ;(globalThis.chrome as unknown) = {
      scripting: {
        executeScript: vi.fn(() => new Promise(() => { /* nunca resolve */ })),
      },
    }

    vi.useFakeTimers()
    const promise = executeScriptWithTimeout({
      target: { tabId: 1 },
      func: () => null,
    } as never, 200)
    promise.catch(() => { /* prevent unhandled */ })
    await vi.advanceTimersByTimeAsync(250)
    await expect(promise).rejects.toBeInstanceOf(ScriptTimeoutError)
  })

  it('ScriptTimeoutError carrega o timeoutMs', async () => {
    ;(globalThis.chrome as unknown) = {
      scripting: {
        executeScript: vi.fn(() => new Promise(() => { /* nunca */ })),
      },
    }

    vi.useFakeTimers()
    const promise = executeScriptWithTimeout({
      target: { tabId: 1 },
      func: () => null,
    } as never, 333)
    promise.catch(() => { /* prevent unhandled */ })
    await vi.advanceTimersByTimeAsync(400)
    await expect(promise).rejects.toMatchObject({ timeoutMs: 333 })
  })

  it('default de 10000ms quando timeoutMs não passado', async () => {
    ;(globalThis.chrome as unknown) = {
      scripting: {
        executeScript: vi.fn(() => new Promise(() => { /* nunca */ })),
      },
    }

    vi.useFakeTimers()
    const promise = executeScriptWithTimeout({
      target: { tabId: 1 },
      func: () => null,
    } as never)
    promise.catch(() => { /* prevent unhandled */ })

    // Antes de 10s não deve ter rejeitado
    await vi.advanceTimersByTimeAsync(9000)
    let rejected = false
    promise.catch(() => { rejected = true })
    await Promise.resolve()
    expect(rejected).toBe(false)

    await vi.advanceTimersByTimeAsync(2000)
    await expect(promise).rejects.toBeInstanceOf(ScriptTimeoutError)
  })
})
