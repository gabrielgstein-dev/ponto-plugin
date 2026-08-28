/**
 * Canal PINNED do log-store.
 *
 * Motivação real: no build de diagnóstico o volume de `[diag] Senior Bearer
 * captured` consome as 500 entradas do ring principal em ~25min. A batida
 * automática dispara 4x espalhado no dia, então o "Auto-punch: FALHA" das 17h
 * já tinha sido despejado quando o usuário exportava o log. Estas asserções
 * travam a sobrevivência dessas linhas.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { appendLog, getLogs, clearLogs, _resetForTests } from '../../lib/domain/log-store'

beforeEach(() => {
  _resetForTests()
})

describe('log-store — canal pinned', () => {
  it('linha pinned sobrevive a 2000 linhas de ruído (o bug real)', async () => {
    appendLog('log', ['Auto-punch: FALHA em saida — motivo: 401'], { pinned: true })
    // Ruído distinto para não colapsar no dedupe de repetição consecutiva.
    for (let i = 0; i < 2000; i++) {
      appendLog('log', [`[diag] Senior Bearer captured #${i}`])
    }
    const msgs = (await getLogs()).map(e => e.msg)
    expect(msgs.some(m => m.includes('Auto-punch: FALHA em saida'))).toBe(true)
  })

  it('linha NÃO-pinned é despejada pelo mesmo ruído (prova que o ring gira)', async () => {
    appendLog('log', ['linha comum que deve sumir'])
    for (let i = 0; i < 2000; i++) {
      appendLog('log', [`[diag] ruido #${i}`])
    }
    const msgs = (await getLogs()).map(e => e.msg)
    expect(msgs.some(m => m.includes('linha comum que deve sumir'))).toBe(false)
  })

  it('não duplica a entrada enquanto ela existe nos dois rings', async () => {
    appendLog('log', ['Auto-punch: entrada agendado para 08:03'], { pinned: true })
    const hits = (await getLogs()).filter(e => e.msg.includes('Auto-punch: entrada agendado'))
    expect(hits).toHaveLength(1)
    expect(hits[0].pinned).toBe(true)
  })

  it('preserva a ordem cronológica na união dos rings', async () => {
    appendLog('log', ['primeira'], { pinned: true })
    appendLog('log', ['segunda'])
    appendLog('log', ['terceira'], { pinned: true })
    const msgs = (await getLogs()).map(e => e.msg)
    expect(msgs).toEqual(['primeira', 'segunda', 'terceira'])
  })

  it('clearLogs limpa os dois rings', async () => {
    appendLog('log', ['Auto-punch: algo importante'], { pinned: true })
    appendLog('log', ['ruido'])
    await clearLogs()
    expect(await getLogs()).toEqual([])
  })
})
