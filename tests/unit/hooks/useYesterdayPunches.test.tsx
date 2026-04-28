import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const getGpAssertionSpy = vi.fn()
const parseGpResponseSpy = vi.fn()

vi.mock('#company/providers', () => ({
  getGpAssertion: (...a: any[]) => getGpAssertionSpy(...a),
  parseGpResponse: (...a: any[]) => parseGpResponseSpy(...a),
  GP_API_BASE: 'https://api.test/',
}))

const mockBuildFlags = {
  ENABLE_YESTERDAY: true,
  ENABLE_SENIOR_INTEGRATION: true,
}

vi.mock('../../../lib/domain/build-flags', () => ({
  get ENABLE_YESTERDAY() {
    return mockBuildFlags.ENABLE_YESTERDAY
  },
  get ENABLE_SENIOR_INTEGRATION() {
    return mockBuildFlags.ENABLE_SENIOR_INTEGRATION
  },
}))

import { useYesterdayPunches } from '../../../lib/presentation/hooks/useYesterdayPunches'
import { mockStorageGet } from '../../setup/chrome-mock'

describe('useYesterdayPunches', () => {
  beforeEach(() => {
    getGpAssertionSpy.mockReset()
    parseGpResponseSpy.mockReset()
    mockBuildFlags.ENABLE_YESTERDAY = true
    mockBuildFlags.ENABLE_SENIOR_INTEGRATION = true
  })

  it('returns empty when feature is disabled', async () => {
    mockBuildFlags.ENABLE_YESTERDAY = false
    const { result } = renderHook(() => useYesterdayPunches())
    expect(result.current).toEqual([])
    expect(getGpAssertionSpy).not.toHaveBeenCalled()
  })

  it('returns empty when ENABLE_SENIOR_INTEGRATION is false', () => {
    mockBuildFlags.ENABLE_SENIOR_INTEGRATION = false
    const { result } = renderHook(() => useYesterdayPunches())
    expect(result.current).toEqual([])
  })

  it('returns empty when no auth', async () => {
    getGpAssertionSpy.mockResolvedValue(null)
    const { result } = renderHook(() => useYesterdayPunches())
    await waitFor(() => expect(getGpAssertionSpy).toHaveBeenCalled())
    expect(result.current).toEqual([])
  })

  it('fetches yesterday punches and parses response', async () => {
    getGpAssertionSpy.mockResolvedValue({
      assertion: 'tok',
      colaboradorId: '1',
      codigoCalculo: 'C',
    })
    mockStorageGet.mockResolvedValue({})
    parseGpResponseSpy.mockReturnValue(['08:00', '17:00'])
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({ apuracao: [] }) } as Response)

    const { result } = renderHook(() => useYesterdayPunches())
    await waitFor(() => expect(result.current).toEqual(['08:00', '17:00']))
    expect(fetchSpy).toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('uses codigoCalculo from storage when auth has none', async () => {
    getGpAssertionSpy.mockResolvedValue({
      assertion: 'tok',
      colaboradorId: '1',
      codigoCalculo: null,
    })
    mockStorageGet.mockResolvedValue({ gestaoPontoCodigoCalculo: 'STORED' })
    parseGpResponseSpy.mockReturnValue([])
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    renderHook(() => useYesterdayPunches())
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(fetchSpy.mock.calls[0][0] as string).toContain('codigoCalculo=STORED')
    fetchSpy.mockRestore()
  })

  it('omits codigoCalculo param when neither auth nor storage have one', async () => {
    getGpAssertionSpy.mockResolvedValue({
      assertion: 'tok',
      colaboradorId: '1',
      codigoCalculo: null,
    })
    mockStorageGet.mockResolvedValue({})
    parseGpResponseSpy.mockReturnValue([])
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response)
    renderHook(() => useYesterdayPunches())
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(fetchSpy.mock.calls[0][0] as string).not.toContain('codigoCalculo')
    fetchSpy.mockRestore()
  })

  it('returns empty when response is not ok', async () => {
    getGpAssertionSpy.mockResolvedValue({
      assertion: 'tok',
      colaboradorId: '1',
      codigoCalculo: 'C',
    })
    mockStorageGet.mockResolvedValue({})
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: false, json: async () => ({}) } as Response)
    const { result } = renderHook(() => useYesterdayPunches())
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(result.current).toEqual([])
    fetchSpy.mockRestore()
  })

  it('returns empty when fetch throws', async () => {
    getGpAssertionSpy.mockResolvedValue({
      assertion: 'tok',
      colaboradorId: '1',
      codigoCalculo: 'C',
    })
    mockStorageGet.mockResolvedValue({})
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('net'))
    const { result } = renderHook(() => useYesterdayPunches())
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(result.current).toEqual([])
    fetchSpy.mockRestore()
  })
})
