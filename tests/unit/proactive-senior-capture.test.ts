import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetAccessToken } = vi.hoisted(() => ({ mockGetAccessToken: vi.fn() }))
vi.mock('../../lib/infrastructure/senior/senior-page-auth', () => ({
  SeniorPageAuth: vi.fn().mockImplementation(() => ({ getAccessToken: mockGetAccessToken })),
}))

import { proactiveSeniorCapture, resetProactiveCaptureThrottle } from '../../lib/application/proactive-senior-capture'
import { SENIOR_TOKEN_MAX_AGE_MS } from '../../lib/infrastructure/senior/constants'
import { mockStorageGet, mockStorageSet } from '../setup/chrome-mock'

beforeEach(() => {
  resetProactiveCaptureThrottle()
  mockGetAccessToken.mockReset()
  mockStorageGet.mockResolvedValue({})
})

describe('proactiveSeniorCapture', () => {
  it('lê o token da aba e persiste quando não há token fresco', async () => {
    mockStorageGet.mockResolvedValue({})
    mockGetAccessToken.mockResolvedValue('senior-token-abc')

    const captured = await proactiveSeniorCapture()

    expect(captured).toBe(true)
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({ seniorToken: 'senior-token-abc', seniorTokenTs: expect.any(Number) }),
    )
  })

  it('não toca na aba quando já existe token fresco no storage', async () => {
    mockStorageGet.mockResolvedValue({ seniorToken: 'fresh', seniorTokenTs: Date.now() })

    const captured = await proactiveSeniorCapture()

    expect(captured).toBe(false)
    expect(mockGetAccessToken).not.toHaveBeenCalled()
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it('token expirado no storage → tenta ler da aba', async () => {
    mockStorageGet.mockResolvedValue({ seniorToken: 'velho', seniorTokenTs: Date.now() - SENIOR_TOKEN_MAX_AGE_MS - 1 })
    mockGetAccessToken.mockResolvedValue('senior-token-novo')

    expect(await proactiveSeniorCapture()).toBe(true)
    expect(mockGetAccessToken).toHaveBeenCalled()
  })

  it('aba sem token ainda → não persiste, retorna false', async () => {
    mockStorageGet.mockResolvedValue({})
    mockGetAccessToken.mockResolvedValue(null)

    expect(await proactiveSeniorCapture()).toBe(false)
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it('throttle: segunda chamada imediata é ignorada', async () => {
    mockGetAccessToken.mockResolvedValue('t')
    await proactiveSeniorCapture()
    mockGetAccessToken.mockClear()
    const second = await proactiveSeniorCapture()
    expect(second).toBe(false)
    expect(mockGetAccessToken).not.toHaveBeenCalled()
  })
})
