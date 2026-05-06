import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockAppendLog } = vi.hoisted(() => ({
  mockAppendLog: vi.fn(),
}))

vi.mock('../../lib/domain/log-store', () => ({
  appendLog: mockAppendLog,
}))

import { logError, _resetErrorCountForTests } from '../../lib/domain/error-logger'

describe('logError', () => {
  beforeEach(() => {
    mockAppendLog.mockReset()
    _resetErrorCountForTests()
  })

  it('grava entrada estruturada via appendLog quando recebe Error', () => {
    const err = new Error('boom')
    logError(err, {
      category: 'auth',
      severity: 'high',
      operation: 'testOp',
      metadata: { foo: 'bar' },
    })

    expect(mockAppendLog).toHaveBeenCalledTimes(1)
    const [level, args] = mockAppendLog.mock.calls[0]
    expect(level).toBe('error') // high → error
    expect(args[0]).toBe('[Senior Ponto Error]')
    const entry = args[1] as Record<string, unknown>
    expect(entry.category).toBe('auth')
    expect(entry.severity).toBe('high')
    expect(entry.operation).toBe('testOp')
    expect(entry.message).toBe('boom')
    expect(entry.stack).toBeDefined()
    expect(entry.metadata).toEqual({ foo: 'bar' })
    expect(typeof entry.timestamp).toBe('string')
  })

  it('aceita non-Error e converte pra string', () => {
    logError('plain string error', {
      category: 'parsing',
      severity: 'low',
      operation: 'testOp',
    })

    const [level, args] = mockAppendLog.mock.calls[0]
    expect(level).toBe('log') // low → log
    const entry = args[1] as Record<string, unknown>
    expect(entry.message).toBe('plain string error')
    expect(entry.stack).toBeUndefined()
  })

  it.each([
    ['critical', 'error'],
    ['high', 'error'],
    ['medium', 'warn'],
    ['low', 'log'],
  ] as const)('mapeia severity %s pra log level %s', (severity, expectedLevel) => {
    logError(new Error('x'), {
      category: 'unknown',
      severity,
      operation: 'op',
    })
    const [level] = mockAppendLog.mock.calls[0]
    expect(level).toBe(expectedLevel)
  })

  it('limita a 100 erros por sessão', () => {
    for (let i = 0; i < 105; i++) {
      logError(new Error(`e${i}`), { category: 'unknown', severity: 'low', operation: 'spam' })
    }
    expect(mockAppendLog).toHaveBeenCalledTimes(100)
  })

  it('persiste metadata como objeto JSON-serializável', () => {
    logError(new Error('x'), {
      category: 'auth',
      severity: 'medium',
      operation: 'op',
      metadata: { status: 401, userIdHash: 'abc', force: true },
    })
    const [, args] = mockAppendLog.mock.calls[0]
    const entry = args[1] as Record<string, unknown>
    expect(JSON.stringify(entry.metadata)).toContain('401')
    expect(JSON.stringify(entry.metadata)).toContain('abc')
  })
})
