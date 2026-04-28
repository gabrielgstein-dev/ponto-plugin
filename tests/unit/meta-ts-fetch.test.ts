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

import {
  fetchViaMetaTab,
  _resetCacheForTests,
} from '../../lib/infrastructure/meta/timesheet/meta-ts-fetch'
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
    _resetCacheForTests()
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

  it('cria nova aba quando nenhuma existe e cacheia para chamadas seguintes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockTabsQuery.mockResolvedValue([])
    mockTabsCreate.mockResolvedValue({ id: 99 })
    ;(globalThis.chrome.tabs.get as any) = vi
      .fn()
      .mockResolvedValue({ id: 99, status: 'complete', url: 'https://plataforma.meta.com.br/' })
    mockScriptingExecuteScript.mockResolvedValue([
      { result: { ok: true, status: 200, text: 'ok' } },
    ])

    const r1 = await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/a')
    expect(mockTabsCreate).toHaveBeenCalledTimes(1)
    expect(r1?.ok).toBe(true)

    // Segunda chamada: deve reusar a aba cacheada (sem criar de novo)
    const r2 = await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/b')
    expect(mockTabsCreate).toHaveBeenCalledTimes(1)
    expect(r2?.ok).toBe(true)
    expect(mockTabsRemove).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('fecha a aba criada após período de inatividade', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockTabsQuery.mockResolvedValue([])
    mockTabsCreate.mockResolvedValue({ id: 77 })
    ;(globalThis.chrome.tabs.get as any) = vi
      .fn()
      .mockResolvedValue({ id: 77, status: 'complete', url: 'https://plataforma.meta.com.br/' })
    mockScriptingExecuteScript.mockResolvedValue([
      { result: { ok: true, status: 200, text: 'ok' } },
    ])

    await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x')
    expect(mockTabsRemove).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(31_000)
    expect(mockTabsRemove).toHaveBeenCalledWith(77)
    vi.useRealTimers()
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
      .mockResolvedValue({ id: 50, status: 'loading', url: 'about:blank' })

    vi.useFakeTimers({ shouldAdvanceTime: true })
    const promise = fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x')
    await vi.advanceTimersByTimeAsync(31_000)
    const r = await promise
    vi.useRealTimers()

    expect(r).toBeNull()
    expect(mockTabsRemove).toHaveBeenCalledWith(50)
  })

  it('retorna null quando a aba criada redireciona para fora do origin', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockTabsQuery.mockResolvedValue([])
    mockTabsCreate.mockResolvedValue({ id: 80 })
    ;(globalThis.chrome.tabs.get as any) = vi.fn()
      .mockResolvedValueOnce({ id: 80, status: 'complete', url: 'https://plataforma.meta.com.br/' })
      .mockResolvedValue({
        id: 80,
        status: 'complete',
        url: 'https://platform.senior.com.br/login/?tenant=meta.com.br',
      })

    const promise = fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x')
    await vi.advanceTimersByTimeAsync(3_000)
    const r = await promise
    vi.useRealTimers()

    expect(r).toBeNull()
    expect(mockTabsRemove).toHaveBeenCalledWith(80)
    expect(mockScriptingExecuteScript).not.toHaveBeenCalled()
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

  it('descarta cache quando a aba cacheada some entre chamadas', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockTabsQuery.mockResolvedValue([])
    mockScriptingExecuteScript.mockResolvedValue([
      { result: { ok: true, status: 200, text: 'ok' } },
    ])

    // Mock por tabId: tab 99 funciona inicialmente, depois "some";
    // tab 100 (criada na segunda chamada) funciona.
    let tab99Alive = true
    ;(globalThis.chrome.tabs.get as any) = vi
      .fn()
      .mockImplementation((id: number) => {
        if (id === 99 && tab99Alive) {
          return Promise.resolve({ id: 99, status: 'complete', url: 'https://plataforma.meta.com.br/' })
        }
        if (id === 100) {
          return Promise.resolve({ id: 100, status: 'complete', url: 'https://plataforma.meta.com.br/' })
        }
        return Promise.reject(new Error('No tab with id ' + id))
      })

    mockTabsCreate
      .mockResolvedValueOnce({ id: 99 })
      .mockResolvedValueOnce({ id: 100 })

    await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/a')
    expect(mockTabsCreate).toHaveBeenCalledTimes(1)

    // Simula que a aba 99 foi fechada entre as duas chamadas
    tab99Alive = false

    await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/b')
    expect(mockTabsCreate).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('loga preview do body quando resposta não é OK', async () => {
    mockTabsQuery.mockResolvedValue([
      { id: 1, url: 'https://plataforma.meta.com.br/' },
    ])
    mockScriptingExecuteScript.mockResolvedValue([
      { result: { ok: false, status: 500, text: 'a'.repeat(500) } },
    ])

    const r = await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x')
    expect(r?.ok).toBe(false)
    expect(r?.status).toBe(500)
    expect(r?.text.length).toBe(500)
  })

  it('loga preview do body para status 0 (fetch_error)', async () => {
    mockTabsQuery.mockResolvedValue([
      { id: 1, url: 'https://plataforma.meta.com.br/' },
    ])
    mockScriptingExecuteScript.mockResolvedValue([
      { result: { ok: false, status: 0, text: 'fetch_error: TypeError: Failed to fetch' } },
    ])

    const r = await fetchViaMetaTab(CONFIG, 'https://api.meta.com.br/x')
    expect(r?.status).toBe(0)
    expect(r?.text).toContain('fetch_error')
  })

  it('com bootstrapUrl, abre a aba pela URL de SSO e espera o redirect terminar no origin', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const CONFIG_BOOT: TimesheetConfig = {
      ...CONFIG,
      bootstrapUrl:
        'https://platform.senior.com.br/login/?redirectTo=https%3A%2F%2Fplataforma.meta.com.br&tenant=meta.com.br',
    }
    mockTabsQuery.mockResolvedValue([])
    mockTabsCreate.mockResolvedValue({ id: 200 })

    // Simula redirect chain: Senior login → senior-x → plataforma
    let urlIndex = 0
    const urls = [
      'https://platform.senior.com.br/login/?tenant=meta.com.br',
      'https://platform.senior.com.br/senior-x/',
      'https://plataforma.meta.com.br/timesheets',
    ]
    ;(globalThis.chrome.tabs.get as any) = vi.fn().mockImplementation(() => {
      const url = urls[Math.min(urlIndex++, urls.length - 1)]
      return Promise.resolve({ id: 200, status: 'complete', url })
    })
    mockScriptingExecuteScript.mockResolvedValue([
      { result: { ok: true, status: 200, text: 'ok' } },
    ])

    const r = await fetchViaMetaTab(CONFIG_BOOT, 'https://api.meta.com.br/x')
    expect(r?.ok).toBe(true)
    expect(mockTabsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ url: CONFIG_BOOT.bootstrapUrl, active: false }),
    )
    vi.useRealTimers()
  })

  it('com bootstrapUrl, retorna null e fecha aba se SSO não termina no origin esperado', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const CONFIG_BOOT: TimesheetConfig = {
      ...CONFIG,
      bootstrapUrl: 'https://platform.senior.com.br/login/?tenant=meta.com.br',
    }
    mockTabsQuery.mockResolvedValue([])
    mockTabsCreate.mockResolvedValue({ id: 201 })
    // Aba fica presa no login do Senior (sem cookies SSO ativas)
    ;(globalThis.chrome.tabs.get as any) = vi.fn().mockResolvedValue({
      id: 201,
      status: 'complete',
      url: 'https://platform.senior.com.br/login/',
    })

    const promise = fetchViaMetaTab(CONFIG_BOOT, 'https://api.meta.com.br/x')
    await vi.advanceTimersByTimeAsync(16_000)
    const r = await promise
    vi.useRealTimers()

    expect(r).toBeNull()
    expect(mockTabsRemove).toHaveBeenCalledWith(201)
    expect(mockScriptingExecuteScript).not.toHaveBeenCalled()
  })
})
