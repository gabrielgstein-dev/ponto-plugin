/**
 * Integração do App real: prova que os componentes APARECEM na tela, não
 * apenas que funcionam isolados.
 *
 * Por que existe: os testes anteriores exercitavam AutoPunchBanner recebendo
 * props direto. Isso provava que o componente funciona, mas NÃO que ele está
 * montado no App — se o wiring quebrasse, tudo continuaria verde e a tela
 * ficaria sem o indicador. Aqui o App verdadeiro é renderizado; só os hooks que
 * tocam chrome/rede são mockados.
 *
 * O caso do banner "cego" vem de incidente real (2026-07-21): sem auth nenhuma
 * fonte respondeu, os cards mostraram `--:--`, o usuário leu como "não bateu" e
 * bateu em duplicidade um ponto que já existia no servidor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// useThemeMode chama matchMedia em escopo de módulo, e jsdom não fornece.
// vi.hoisted roda antes dos imports — Object.defineProperty solto não rodaria.
vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
})

import { DEFAULT_SETTINGS } from '../../../lib/domain/types'

const mockAuth = vi.fn()
const mockAutoPunchView = vi.fn()
const mockSettings = vi.fn()

vi.mock('../../../lib/presentation/hooks/useAuthStatus', () => ({
  useAuthStatus: () => mockAuth(),
}))
vi.mock('../../../lib/presentation/hooks/useAutoPunchStatus', () => ({
  useAutoPunchStatus: () => mockAutoPunchView(),
}))
vi.mock('../../../lib/presentation/hooks/usePunchState', () => ({
  usePunchState: () => ({
    punchState: { entrada: null, almoco: null, volta: null, saida: null },
    settings: mockSettings(),
    loading: false,
    refresh: vi.fn(),
    stateRepo: {},
  }),
}))
vi.mock('../../../lib/presentation/hooks/useAutoDetect', () => ({
  useAutoDetect: () => ({ detecting: false, detect: vi.fn() }),
}))
vi.mock('../../../lib/presentation/hooks/usePunchAction', () => ({
  usePunchAction: () => ({ punching: false, doPunch: vi.fn() }),
}))
vi.mock('../../../lib/presentation/hooks/useManualPunch', () => ({
  useManualPunch: () => ({ punching: false, doPunch: vi.fn() }),
}))
vi.mock('../../../lib/presentation/hooks/useYesterdayPunches', () => ({
  useYesterdayPunches: () => [],
}))
vi.mock('../../../lib/presentation/hooks/useHourBank', () => ({
  useHourBank: () => ({ balance: null, refresh: vi.fn() }),
}))
vi.mock('../../../lib/presentation/components/OnboardingOverlay', () => ({
  OnboardingOverlay: () => null,
}))
vi.mock('../../../lib/presentation/components/PaytrackBanner', () => ({
  PaytrackBanner: () => null,
}))
vi.mock('../../../lib/presentation/components/InsiXBanner', () => ({
  InsiXBanner: () => null,
  InsiXDoneHint: () => null,
}))

import { App } from '../../../lib/presentation/App'

const NO_AUTO = { ...DEFAULT_SETTINGS }
const AUTO_ENTRADA = {
  ...DEFAULT_SETTINGS,
  autoPunchEnabled: true,
  autoPunchSlots: { entrada: true, almoco: false, volta: false, saida: false },
}

beforeEach(() => {
  mockAuth.mockReturnValue(true)
  mockSettings.mockReturnValue(NO_AUTO)
  mockAutoPunchView.mockReturnValue({ next: null, waitingFor: null, lastResult: null, blind: false })
})

describe('App — indicador de batida automática realmente montado', () => {
  it('mostra o horário do próximo disparo NA TELA', () => {
    mockSettings.mockReturnValue(AUTO_ENTRADA)
    const fireAt = new Date()
    fireAt.setHours(23, 47, 0, 0)
    mockAutoPunchView.mockReturnValue({
      next: { slot: 'entrada', fireAt: fireAt.getTime() },
      waitingFor: null,
      lastResult: null,
      blind: false,
    })

    render(<App />)
    expect(screen.getByText('23:47')).toBeInTheDocument()
    expect(screen.getByText(/sozinho às/)).toBeInTheDocument()
  })

  it('mostra a espera quando a corrente está travada', () => {
    mockSettings.mockReturnValue(AUTO_ENTRADA)
    mockAutoPunchView.mockReturnValue({ next: null, waitingFor: 'entrada', lastResult: null, blind: false })
    render(<App />)
    expect(screen.getByText(/aguardando/i)).toBeInTheDocument()
  })

  it('NÃO mostra o indicador quando nenhum slot é automático', () => {
    render(<App />)
    expect(screen.queryByText(/sozinho às/)).toBeNull()
    expect(screen.queryByText(/aguardando/i)).toBeNull()
  })

  it('marca ⚡ apenas nos cards dos slots automáticos', () => {
    mockSettings.mockReturnValue(AUTO_ENTRADA)
    render(<App />)
    // entrada ligada → exatamente 1 marca
    expect(screen.getAllByLabelText('Batida automática ligada')).toHaveLength(1)
  })
})

describe('App — plugin cego não pode parecer "não bateu" (incidente 2026-07-21)', () => {
  it('sem auth: avisa que NÃO conseguiu verificar', () => {
    mockAuth.mockReturnValue(false)
    render(<App />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/não consegui verificar/i)).toBeInTheDocument()
  })

  it('sem auth: alerta explicitamente contra bater em duplicidade', () => {
    mockAuth.mockReturnValue(false)
    render(<App />)
    expect(screen.getByText(/duplicidade/i)).toBeInTheDocument()
  })

  it('sem auth: cards mostram ??:?? em vez de --:--', () => {
    mockAuth.mockReturnValue(false)
    render(<App />)
    expect(screen.getAllByText('??:??').length).toBeGreaterThan(0)
    expect(screen.queryByText('--:--')).toBeNull()
  })

  it('com auth: nenhum alerta e cards voltam ao normal', () => {
    mockAuth.mockReturnValue(true)
    render(<App />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByText('??:??')).toBeNull()
  })

  it('COM auth mas fontes em 502: também avisa que está cego', () => {
    // Buraco que sobrava: hasAuth=true não garante que alguma fonte respondeu.
    // Foi o caso do gestão de ponto retornando 502 com token válido.
    mockAuth.mockReturnValue(true)
    mockAutoPunchView.mockReturnValue({ next: null, waitingFor: null, lastResult: null, blind: true })
    render(<App />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getAllByText('??:??').length).toBeGreaterThan(0)
  })

  it('auth ainda carregando (null) NÃO dispara o alerta', () => {
    // hasAuth começa null; alertar nesse instante seria falso positivo a cada
    // abertura do popup.
    mockAuth.mockReturnValue(null)
    render(<App />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
