/**
 * AutoPunchBanner + _buildAutoPunchView.
 *
 * Motivação real: com o lembrete das 08:00 tocando, o usuário não tinha como
 * saber se a batida automática ia acontecer — ficava esperando sem saber o quê.
 * Estes testes travam o contrato de que a tela sempre responde "vai bater? quando?"
 * e de que ela NUNCA afirma sucesso num desfecho que não foi confirmado.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { AutoPunchBanner } from '../../../lib/presentation/components/AutoPunchBanner'
import { _buildAutoPunchView } from '../../../lib/presentation/hooks/useAutoPunchStatus'
import type { AutoPunchView } from '../../../lib/presentation/hooks/useAutoPunchStatus'

const TODAY = new Date(2026, 6, 21, 8, 0, 0).toDateString()
const NOW = new Date(2026, 6, 21, 8, 0, 0).getTime()
const EMPTY: AutoPunchView = { next: null, waitingFor: null, lastResult: null }

describe('AutoPunchBanner', () => {
  it('não renderiza nada quando nenhum slot tem auto-punch', () => {
    const { container } = render(<AutoPunchBanner view={EMPTY} enabled={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('mostra o slot e o horário do próximo disparo', () => {
    const fireAt = new Date(2026, 6, 21, 8, 3, 0).getTime()
    render(<AutoPunchBanner view={{ ...EMPTY, next: { slot: 'entrada', fireAt } }} enabled />)
    expect(screen.getByText(/entrada/)).toBeInTheDocument()
    expect(screen.getByText('08:03')).toBeInTheDocument()
  })

  it('explica a espera quando a corrente está travada na entrada', () => {
    // Caso que gerou a dúvida: só almoco/volta/saida ligados, entrada pendente.
    render(<AutoPunchBanner view={{ ...EMPTY, waitingFor: 'entrada' }} enabled />)
    expect(screen.getByText(/aguardando/i)).toBeInTheDocument()
    expect(screen.getByText(/você bate manualmente/i)).toBeInTheDocument()
  })

  it('falha: avisa para bater manualmente e NÃO afirma que bateu', () => {
    const lastResult = {
      date: TODAY, slot: 'saida' as const, status: 'failed' as const,
      time: null, reason: '401', ts: NOW,
    }
    render(<AutoPunchBanner view={{ ...EMPTY, lastResult }} enabled />)
    expect(screen.getByText(/não consegui bater/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Bati /)).toBeNull()
  })

  it('não confirmado: manda conferir no Senior, sem alegar sucesso', () => {
    const lastResult = {
      date: TODAY, slot: 'volta' as const, status: 'unconfirmed' as const,
      time: '13:09', reason: 'servidor não retornou a batida', ts: NOW,
    }
    render(<AutoPunchBanner view={{ ...EMPTY, lastResult }} enabled />)
    expect(screen.getByText(/não confirmou/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Bati /)).toBeNull()
  })

  it('confirmado: mostra o horário batido', () => {
    const lastResult = {
      date: TODAY, slot: 'entrada' as const, status: 'confirmed' as const,
      time: '08:03', reason: null, ts: NOW,
    }
    render(<AutoPunchBanner view={{ ...EMPTY, lastResult }} enabled />)
    expect(screen.getByText(/Bati entrada às 08:03/)).toBeInTheDocument()
  })

  it('falha tem precedência sobre um próximo agendamento', () => {
    // Se a saída falhou, o usuário precisa ver ISSO, não o próximo slot.
    const lastResult = {
      date: TODAY, slot: 'saida' as const, status: 'failed' as const,
      time: null, reason: '401', ts: NOW,
    }
    const fireAt = new Date(2026, 6, 21, 18, 0, 0).getTime()
    render(<AutoPunchBanner view={{ next: { slot: 'saida', fireAt }, waitingFor: null, lastResult }} enabled />)
    expect(screen.getByText(/não consegui bater/i)).toBeInTheDocument()
  })
})

describe('_buildAutoPunchView', () => {
  it('descarta agendamento de outro dia', () => {
    const schedule = {
      date: new Date(2026, 6, 20).toDateString(),
      scheduled: { entrada: NOW + 60000 },
      waitingFor: null,
    }
    expect(_buildAutoPunchView(schedule, null, TODAY, NOW).next).toBeNull()
  })

  it('escolhe o disparo futuro mais próximo', () => {
    const schedule = {
      date: TODAY,
      scheduled: { saida: NOW + 600000, almoco: NOW + 60000 },
      waitingFor: null,
    }
    const view = _buildAutoPunchView(schedule, null, TODAY, NOW)
    expect(view.next?.slot).toBe('almoco')
  })

  it('ignora disparo que já passou', () => {
    const schedule = { date: TODAY, scheduled: { entrada: NOW - 60000 }, waitingFor: null }
    expect(_buildAutoPunchView(schedule, null, TODAY, NOW).next).toBeNull()
  })

  it('descarta resultado de outro dia', () => {
    const result = {
      date: new Date(2026, 6, 20).toDateString(),
      slot: 'saida' as const, status: 'failed' as const,
      time: null, reason: 'x', ts: NOW,
    }
    expect(_buildAutoPunchView(null, result, TODAY, NOW).lastResult).toBeNull()
  })
})
