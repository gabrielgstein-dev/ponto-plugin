import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const repoLoadSpy = vi.fn()
const repoSaveStateSpy = vi.fn()
const repoSaveSettingsSpy = vi.fn()
const calcSpy = vi.fn()

vi.mock('../../../lib/infrastructure/chrome-storage', () => ({
  ChromeStateRepository: class {
    loadState(...a: unknown[]) {
      return repoLoadSpy(...a)
    }
    saveState(...a: unknown[]) {
      return repoSaveStateSpy(...a)
    }
    saveSettings(...a: unknown[]) {
      return repoSaveSettingsSpy(...a)
    }
  },
}))
vi.mock('../../../lib/application/calc-schedule', () => ({
  calcHorarios: () => calcSpy(),
}))

import { usePunchState } from '../../../lib/presentation/hooks/usePunchState'
import { state, settings } from '../../../lib/application/state'

describe('usePunchState', () => {
  beforeEach(() => {
    repoLoadSpy.mockReset()
    repoSaveStateSpy.mockReset()
    repoSaveSettingsSpy.mockReset()
    calcSpy.mockReset()
  })

  it('initializes from repository on first render', async () => {
    repoLoadSpy.mockResolvedValue({
      state: { entrada: '08:00', almoco: null, volta: null, saida: null },
      settings: { jornada: 540 },
    })
    const { result } = renderHook(() => usePunchState())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.punchState.entrada).toBe('08:00')
    expect(result.current.settings.jornada).toBe(540)
    expect(calcSpy).toHaveBeenCalled()
  })

  it('refresh recomputes schedule and updates state', async () => {
    repoLoadSpy.mockResolvedValue({
      state: { entrada: '08:00' },
      settings: {},
    })
    const { result } = renderHook(() => usePunchState())
    await waitFor(() => expect(result.current.loading).toBe(false))
    calcSpy.mockClear()
    act(() => result.current.refresh())
    expect(calcSpy).toHaveBeenCalled()
  })

  it('updateSettings mutates settings and persists', async () => {
    repoLoadSpy.mockResolvedValue({ state: {}, settings: {} })
    const { result } = renderHook(() => usePunchState())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.updateSettings({ jornada: 360 }))
    expect(repoSaveSettingsSpy).toHaveBeenCalled()
    expect(settings.jornada).toBe(360)
  })

  it('saveCurrentState persists current state', async () => {
    repoLoadSpy.mockResolvedValue({ state: {}, settings: {} })
    const { result } = renderHook(() => usePunchState())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.saveCurrentState())
    expect(repoSaveStateSpy).toHaveBeenCalledWith(state)
  })


  it('clearState resets state and persists', async () => {
    repoLoadSpy.mockResolvedValue({
      state: { entrada: '08:00' },
      settings: {},
    })
    const { result } = renderHook(() => usePunchState())
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.clearState())
    expect(state.entrada).toBeNull()
    expect(repoSaveStateSpy).toHaveBeenCalled()
  })
})
