import { describe, it, expect, beforeEach } from 'vitest'
import './../setup/chrome-mock'
import { appendLog, getLogs, _resetForTests } from '../../lib/domain/log-store'

describe('log-store appendLog dedupe', () => {
  beforeEach(() => {
    _resetForTests()
  })

  it('mantém entries diferentes separadas', async () => {
    appendLog('log', ['a'])
    appendLog('log', ['b'])
    const entries = await getLogs()
    expect(entries.map(e => e.msg)).toEqual(['a', 'b'])
    expect(entries.every(e => e.repeat === undefined)).toBe(true)
  })

  it('colapsa entries adjacentes idênticas em uma com repeat++', async () => {
    appendLog('log', ['cookie não encontrado'])
    appendLog('log', ['cookie não encontrado'])
    appendLog('log', ['cookie não encontrado'])
    const entries = await getLogs()
    expect(entries).toHaveLength(1)
    expect(entries[0].msg).toBe('cookie não encontrado')
    expect(entries[0].repeat).toBe(3)
    expect(entries[0].lastTs).toBeGreaterThanOrEqual(entries[0].ts)
  })

  it('quebra a agregação quando uma entry diferente entra no meio', async () => {
    appendLog('log', ['x'])
    appendLog('log', ['x'])
    appendLog('log', ['y'])
    appendLog('log', ['x'])
    const entries = await getLogs()
    expect(entries.map(e => ({ msg: e.msg, repeat: e.repeat }))).toEqual([
      { msg: 'x', repeat: 2 },
      { msg: 'y', repeat: undefined },
      { msg: 'x', repeat: undefined },
    ])
  })

  it('não agrega quando level diverge', async () => {
    appendLog('log', ['msg'])
    appendLog('warn', ['msg'])
    const entries = await getLogs()
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.level)).toEqual(['log', 'warn'])
  })
})
