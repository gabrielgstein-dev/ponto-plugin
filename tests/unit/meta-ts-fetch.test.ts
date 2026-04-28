/**
 * Cobre fetchViaMetaTab — usa chrome.scripting.executeScript em world MAIN
 * para fazer fetch dentro de uma aba na plataforma e contornar o CORS da
 * api.meta.com.br (que só aceita Origin: https://plataforma.meta.com.br).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockTabsQuery,
  mockTabsCreate,
  mockTabsRemove,
  mockScriptingExecuteScript,
} from '../setup/chrome-mock'

import { fetchViaMetaTab } from '../../lib/infrastructure/meta/timesheet/meta-ts-fetch'
import type { TimesheetConfig } from '../../lib/infrastructure/timesheet/timesheet-config'

const CONFIG: TimesheetConfig = {
  name: 'meta-ts',
  apiUrl: 'https://api.meta.com.br',
  platformUrl: 'https://plataforma.meta.com.br',
  sessionEndpoint: '/api/auth/session',
  timesheetsBase: '/timesheets/v1',
  tokenMaxAgeMs: 60_000,
  storagePrefix: 'metaTs',
  jwtUuidField: 'metaUUID',
}

describe('fetchViaMetaTab', () => {
  beforeEach(() => {
    mockTabsQuery.mockReset()
    mockTabsCreate.mockReset()
    mockTabsRemove.mockReset()
    mockScriptingExecuteScript.mockReset()
  })

  it('reusa aba existente em plataforma.meta.com.br', async () => {
    mockTabsQuery.mockResolvedValue([
      { id: 42, url: 'https://plataforma.meta.com.br/timesheets' },
    ])
    mockScriptingExecuteScript.mockResolvedValue([
      { result: { ok: true, status: 200, text: '{"foo":1}' } },
    ])

    const r = await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x', {
      headers: { Authorization: 'Bearer t' },
    })

    expect(mockTabsCreate).not.toHaveBeenCalled()
    expect(mockTabsRemove).not.toHaveBeenCalled()
    expect(mockScriptingExecuteScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 42 },
        world: 'MAIN',
      }),
    )
    expect(r).toEqual({ ok: true, status: 200, text: '{"foo":1}' })
  })

  it('cria nova aba quando não existe e fecha após o fetch', async () => {
    mockTabsQuery
      .mockResolvedValueOnce([]) // findPlatformTab
      .mockResolvedValue([])
    mockTabsCreate.mockResolvedValue({ id: 99, status: 'complete' })
    // waitForTabComplete usa chrome.tabs.get, não query — precisa mockar
    ;(globalThis.chrome.tabs.get as any) = vi
      .fn()
      .mockResolvedValue({ id: 99, status: 'complete' })
    mockScriptingExecuteScript.mockResolvedValue([
      { result: { ok: true, status: 200, text: 'ok' } },
    ])

    const r = await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x')

    expect(mockTabsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ url: CONFIG.platformUrl, active: false }),
    )
    expect(mockScriptingExecuteScript).toHaveBeenCalled()
    expect(mockTabsRemove).toHaveBeenCalledWith(99)
    expect(r?.ok).toBe(true)
  })

  it('retorna null quando criação da aba falha', async () => {
    mockTabsQuery.mockResolvedValue([])
    mockTabsCreate.mockRejectedValue(new Error('no permission'))

    const r = await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x')
    expect(r).toBeNull()
    expect(mockScriptingExecuteScript).not.toHaveBeenCalled()
  })

  it('retorna null quando aba criada não fica complete antes do timeout', async () => {
    mockTabsQuery.mockResolvedValue([])
    mockTabsCreate.mockResolvedValue({ id: 50 })
    ;(globalThis.chrome.tabs.get as any) = vi
      .fn()
      .mockResolvedValue({ id: 50, status: 'loading' })

    // O loop interno ainda dorme 250ms — usamos fake timers + advance
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const promise = fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x')
    // Avança 30s (timeoutMs default) para ele desistir
    await vi.advanceTimersByTimeAsync(31_000)
    const r = await promise
    vi.useRealTimers()

    expect(r).toBeNull()
    expect(mockTabsRemove).toHaveBeenCalledWith(50)
  })

  it('aborta gracefully quando chrome.tabs.get rejeita durante espera', async () => {
    mockTabsQuery.mockResolvedValue([])
    mockTabsCreate.mockResolvedValue({ id: 51 })
    ;(globalThis.chrome.tabs.get as any) = vi
      .fn()
      .mockRejectedValue(new Error('tab gone'))

    const r = await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x')
    expect(r).toBeNull()
  })

  it('retorna null quando aba criada vem sem id', async () => {
    mockTabsQuery.mockResolvedValue([])
    mockTabsCreate.mockResolvedValue({ id: undefined })

    const r = await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x')
    expect(r).toBeNull()
  })

  it('captura erro inesperado de executeScript e retorna null', async () => {
    mockTabsQuery.mockResolvedValue([
      { id: 1, url: 'https://plataforma.meta.com.br/' },
    ])
    mockScriptingExecuteScript.mockRejectedValue(new Error('boom'))

    const r = await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x')
    expect(r).toBeNull()
  })

  it('retorna null quando executeScript devolve array vazio', async () => {
    mockTabsQuery.mockResolvedValue([
      { id: 1, url: 'https://plataforma.meta.com.br/' },
    ])
    mockScriptingExecuteScript.mockResolvedValue([])

    const r = await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x')
    expect(r).toBeNull()
  })
})
