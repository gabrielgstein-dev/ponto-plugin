import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const registerPunchSpy = vi.fn()
const addPendingPunchSpy = vi.fn()
const injectSpy = vi.fn()

vi.mock('../../../lib/application/register-punch', () => ({
  registerPunch: (...a: any[]) => registerPunchSpy(...a),
}))
vi.mock('../../../lib/application/detect-punches', () => ({
  addPendingPunch: (...a: any[]) => addPendingPunchSpy(...a),
}))
vi.mock('../../../lib/infrastructure/senior/senior-cookie-auth', () => ({
  SeniorCookieAuth: class {},
}))
vi.mock('../../../lib/infrastructure/senior/senior-page-auth', () => ({
  SeniorPageAuth: class {},
}))
vi.mock('../../../lib/infrastructure/senior/senior-interceptor-auth', () => ({
  SeniorInterceptorAuth: class {},
}))
vi.mock('../../../lib/infrastructure/senior/senior-registrar', () => ({
  SeniorPunchRegistrar: class {},
}))
vi.mock('../../../lib/infrastructure/senior/senior-local-inject', () => ({
  injectPunchIntoLocalStorage: (...a: any[]) => injectSpy(...a),
}))

import { usePunchAction } from '../../../lib/presentation/hooks/usePunchAction'
import { mockStorageSet } from '../../setup/chrome-mock'

describe('usePunchAction', () => {
  beforeEach(() => {
    registerPunchSpy.mockReset()
    addPendingPunchSpy.mockReset()
    injectSpy.mockReset()
  })

  it('runs successful punch with parsed time, injects pending punch and saves storage', async () => {
    registerPunchSpy.mockResolvedValue({
      success: true,
      logs: [],
      responseBody: JSON.stringify({
        clockingResult: { clockingEventImported: { timeEvent: 'T08:30:00' } },
      }),
    })
    injectSpy.mockResolvedValue(undefined)
    const onToast = vi.fn()
    const onRefresh = vi.fn()
    const { result } = renderHook(() => usePunchAction(onToast, onRefresh))
    await act(async () => {
      await result.current.doPunch()
    })
    expect(addPendingPunchSpy).toHaveBeenCalledWith('08:30')
    expect(injectSpy).toHaveBeenCalledWith('08:30')
    expect(mockStorageSet).toHaveBeenCalled()
    expect(onToast).toHaveBeenCalledWith('Registrando ponto...')
    expect(onToast).toHaveBeenCalledWith('Ponto registrado via API!')
    expect(onRefresh).toHaveBeenCalled()
  })

  it('handles success with non-string responseBody (object)', async () => {
    registerPunchSpy.mockResolvedValue({
      success: true,
      logs: [],
      responseBody: { clockingResult: { clockingEventImported: { timeEvent: 'T09:00:00' } } },
    })
    injectSpy.mockResolvedValue(undefined)
    const onToast = vi.fn()
    const { result } = renderHook(() => usePunchAction(onToast, vi.fn()))
    await act(async () => {
      await result.current.doPunch()
    })
    expect(addPendingPunchSpy).toHaveBeenCalledWith('09:00')
  })

  it('handles success but with no parseable time', async () => {
    registerPunchSpy.mockResolvedValue({
      success: true,
      logs: [],
      responseBody: '{}',
    })
    const onToast = vi.fn()
    const onRefresh = vi.fn()
    const { result } = renderHook(() => usePunchAction(onToast, onRefresh))
    await act(async () => {
      await result.current.doPunch()
    })
    expect(addPendingPunchSpy).not.toHaveBeenCalled()
    expect(injectSpy).not.toHaveBeenCalled()
    expect(onRefresh).toHaveBeenCalled()
  })

  it('handles invalid JSON body silently', async () => {
    registerPunchSpy.mockResolvedValue({
      success: true,
      logs: [],
      responseBody: '{not json',
    })
    const onToast = vi.fn()
    const onRefresh = vi.fn()
    const { result } = renderHook(() => usePunchAction(onToast, onRefresh))
    await act(async () => {
      await result.current.doPunch()
    })
    expect(onRefresh).toHaveBeenCalled()
    expect(addPendingPunchSpy).not.toHaveBeenCalled()
  })

  it('reports failure logs on unsuccessful response', async () => {
    registerPunchSpy.mockResolvedValue({ success: false, logs: ['e1', 'e2'] })
    const onToast = vi.fn()
    const { result } = renderHook(() => usePunchAction(onToast, vi.fn()))
    await act(async () => {
      await result.current.doPunch()
    })
    expect(onToast).toHaveBeenCalledWith('Falha: e1, e2')
  })

  it('reports generic error when register throws', async () => {
    registerPunchSpy.mockRejectedValue(new Error('boom'))
    const onToast = vi.fn()
    const { result } = renderHook(() => usePunchAction(onToast, vi.fn()))
    await act(async () => {
      await result.current.doPunch()
    })
    expect(onToast).toHaveBeenCalledWith('Erro ao bater ponto')
    expect(result.current.punching).toBe(false)
  })
})
