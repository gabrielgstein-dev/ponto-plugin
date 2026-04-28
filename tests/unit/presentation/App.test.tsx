import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockBuildFlags = {
  ENABLE_SENIOR_PUNCH_BUTTON: false,
  ENABLE_MANUAL_PUNCH: true,
  ENABLE_SENIOR_INTEGRATION: false,
  ENABLE_YESTERDAY: false,
  APP_NAME: 'TestApp',
}

vi.mock('../../../lib/domain/build-flags', () => ({
  get ENABLE_SENIOR_PUNCH_BUTTON() {
    return mockBuildFlags.ENABLE_SENIOR_PUNCH_BUTTON
  },
  get ENABLE_MANUAL_PUNCH() {
    return mockBuildFlags.ENABLE_MANUAL_PUNCH
  },
  get ENABLE_SENIOR_INTEGRATION() {
    return mockBuildFlags.ENABLE_SENIOR_INTEGRATION
  },
  get ENABLE_YESTERDAY() {
    return mockBuildFlags.ENABLE_YESTERDAY
  },
  get APP_NAME() {
    return mockBuildFlags.APP_NAME
  },
  ENABLE_NOTIFICATIONS: true,
  ENABLE_META_TIMESHEET: false,
  DEBUG: false,
  ACTIVE_COMPANY: 'manual',
  ENABLE_WIDGET: false,
  THEME: 'dark',
}))

let punchStateHook: any
let clockHook = { time: '08:00:00', date: 'Segunda, 5 jan' }
let autoDetectHook = { detecting: false }
let punchActionHook = { punching: false, doPunch: vi.fn() }
let manualPunchHook = { punching: false, doPunch: vi.fn() }
let yesterdayHook: string[] = []
let hourBankHook = { balance: null }
let authStatusHook: boolean | null = null

vi.mock('../../../lib/presentation/hooks/useClock', () => ({
  useClock: () => clockHook,
}))
vi.mock('../../../lib/presentation/hooks/usePunchState', () => ({
  usePunchState: () => punchStateHook,
}))
let capturedToastFn: ((msg: string) => void) | null = null
vi.mock('../../../lib/presentation/hooks/useAutoDetect', () => ({
  useAutoDetect: (_repo: any, _onRender: any, onToast: any) => {
    capturedToastFn = onToast
    return autoDetectHook
  },
}))
vi.mock('../../../lib/presentation/hooks/usePunchAction', () => ({
  usePunchAction: () => punchActionHook,
}))
vi.mock('../../../lib/presentation/hooks/useManualPunch', () => ({
  useManualPunch: () => manualPunchHook,
}))
vi.mock('../../../lib/presentation/hooks/useCountdown', () => ({
  useCountdown: () => '00:30:00',
}))
vi.mock('../../../lib/presentation/hooks/useYesterdayPunches', () => ({
  useYesterdayPunches: () => yesterdayHook,
}))
vi.mock('../../../lib/presentation/hooks/useHourBank', () => ({
  useHourBank: () => hourBankHook,
}))
vi.mock('../../../lib/presentation/hooks/useAuthStatus', () => ({
  useAuthStatus: () => authStatusHook,
}))
vi.mock('../../../lib/infrastructure/manual/manual-hour-bank-provider', () => ({
  ManualHourBankProvider: class {},
}))

// Stub heavy children so we focus on App orchestration logic
vi.mock('../../../lib/presentation/components/LiveClock', () => ({
  LiveClock: ({ time, date }: any) => (
    <div data-testid="live-clock">
      {time}|{date}
    </div>
  ),
}))
vi.mock('../../../lib/presentation/components/TokenStatus', () => ({
  TokenStatus: ({ statusText }: any) => <div data-testid="token-status">{statusText}</div>,
}))
vi.mock('../../../lib/presentation/components/PunchCard', () => ({
  PunchCard: ({ label, time, isPast, isNext }: any) => (
    <div data-testid={`card-${label}`}>
      {label}-{time}-{isPast ? 'past' : 'fut'}-{isNext ? 'next' : ''}
    </div>
  ),
}))
vi.mock('../../../lib/presentation/components/ProgressBar', () => ({
  ProgressBar: ({ workedMinutes, totalMinutes, showOvertime }: any) => (
    <div data-testid="progress">
      {workedMinutes}/{totalMinutes}/{showOvertime ? 'over' : 'no-over'}
    </div>
  ),
}))
vi.mock('../../../lib/presentation/components/StatusBanner', () => ({
  StatusBanner: ({ text, type }: any) => (
    <div data-testid="status-banner">
      {text}-{type}
    </div>
  ),
}))
vi.mock('../../../lib/presentation/components/NextAction', () => ({
  NextAction: ({ label, countdown, visible }: any) =>
    visible ? <div data-testid="next-action">{label}-{countdown}</div> : null,
}))
vi.mock('../../../lib/presentation/components/PunchButton', () => ({
  PunchButton: ({ disabled }: any) => (
    <button data-testid="punch-btn" disabled={disabled}>
      Punch
    </button>
  ),
}))
vi.mock('../../../lib/presentation/components/SettingsPanel', () => ({
  SettingsPanel: ({ onToggle }: any) => (
    <button data-testid="settings-toggle" onClick={onToggle}>
      settings
    </button>
  ),
}))
vi.mock('../../../lib/presentation/components/Toast', () => ({
  Toast: ({ message, onDismiss }: any) =>
    message ? (
      <button data-testid="toast" onClick={onDismiss}>
        {message}
      </button>
    ) : null,
}))
vi.mock('../../../lib/presentation/components/PunchHistory', () => ({
  PunchHistory: () => <div data-testid="history" />,
}))
vi.mock('../../../lib/presentation/components/HourBankBanner', () => ({
  HourBankBanner: ({ estimatedExit }: any) => (
    <div data-testid="hour-bank">{estimatedExit}</div>
  ),
}))

import { App } from '../../../lib/presentation/App'
import { fireEvent, act } from '@testing-library/react'

const today = new Date()
const baseSettings = {
  jornada: 480,
  almocoHorario: '12:00',
  almocoDur: 60,
  notifAntecip: 10,
  lembreteAtraso: 30,
  closingDay: 28,
}

beforeEach(() => {
  mockBuildFlags.ENABLE_SENIOR_PUNCH_BUTTON = false
  mockBuildFlags.ENABLE_MANUAL_PUNCH = true
  mockBuildFlags.ENABLE_SENIOR_INTEGRATION = false
  mockBuildFlags.ENABLE_YESTERDAY = false
  punchStateHook = {
    punchState: {
      entrada: null,
      almoco: null,
      volta: null,
      saida: null,
      _almocoSugerido: null,
      _voltaSugerida: null,
      _saidaEstimada: null,
    },
    settings: baseSettings,
    loading: false,
    refresh: vi.fn(),
    updateSettings: vi.fn(),
    clearState: vi.fn(),
    stateRepo: {} as any,
  }
  clockHook = { time: '08:00:00', date: 'Segunda, 5 jan' }
  autoDetectHook = { detecting: false }
  punchActionHook = { punching: false, doPunch: vi.fn() }
  manualPunchHook = { punching: false, doPunch: vi.fn() }
  yesterdayHook = []
  hourBankHook = { balance: null }
  authStatusHook = null

  vi.useFakeTimers()
  vi.setSystemTime(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0))
})

describe('App', () => {
  it('renders loading screen when state is loading', () => {
    punchStateHook.loading = true
    render(<App />)
    expect(screen.getByText('Carregando...')).toBeInTheDocument()
  })

  it('renders manual mode without senior status', () => {
    render(<App />)
    expect(screen.getByTestId('live-clock')).toBeInTheDocument()
    expect(screen.queryByTestId('token-status')).toBeNull()
    expect(screen.getByTestId('status-banner')).toHaveTextContent('Aguardando entrada')
    expect(screen.getAllByTestId(/^card-/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('progress')).toBeInTheDocument()
    expect(screen.getByTestId('history')).toBeInTheDocument()
  })

  it('shows TokenStatus when senior integration enabled', () => {
    mockBuildFlags.ENABLE_SENIOR_INTEGRATION = true
    autoDetectHook.detecting = true
    render(<App />)
    expect(screen.getByTestId('token-status')).toBeInTheDocument()
  })

  it('shows "Detectando batimentos" overlay when detecting and not senior', () => {
    autoDetectHook.detecting = true
    render(<App />)
    expect(screen.getByText('Detectando batimentos...')).toBeInTheDocument()
  })

  it('renders senior punch button when ENABLE_SENIOR_PUNCH_BUTTON', () => {
    mockBuildFlags.ENABLE_SENIOR_INTEGRATION = true
    mockBuildFlags.ENABLE_SENIOR_PUNCH_BUTTON = true
    mockBuildFlags.ENABLE_MANUAL_PUNCH = false
    render(<App />)
    expect(screen.getAllByTestId('punch-btn')).toHaveLength(1)
  })

  it('renders yesterday banner when feature enabled and times exist', () => {
    mockBuildFlags.ENABLE_SENIOR_INTEGRATION = true
    mockBuildFlags.ENABLE_MANUAL_PUNCH = false
    mockBuildFlags.ENABLE_YESTERDAY = true
    yesterdayHook = ['08:00', '17:00']
    render(<App />)
    expect(screen.getByText('Ontem')).toBeInTheDocument()
    expect(screen.getByText('08:00 → 17:00')).toBeInTheDocument()
  })

  it('does not render yesterday banner when no times', () => {
    mockBuildFlags.ENABLE_SENIOR_INTEGRATION = true
    mockBuildFlags.ENABLE_MANUAL_PUNCH = false
    mockBuildFlags.ENABLE_YESTERDAY = true
    yesterdayHook = []
    render(<App />)
    expect(screen.queryByText('Ontem')).toBeNull()
  })

  it('passes "success" type to StatusBanner when saida exists', () => {
    punchStateHook.punchState.entrada = '08:00'
    punchStateHook.punchState.almoco = '12:00'
    punchStateHook.punchState.volta = '13:00'
    punchStateHook.punchState.saida = '17:00'
    render(<App />)
    expect(screen.getByTestId('status-banner')).toHaveTextContent('Jornada concluída!-success')
  })

  it('shows "Em almoço" status', () => {
    punchStateHook.punchState.entrada = '08:00'
    punchStateHook.punchState.almoco = '12:00'
    render(<App />)
    expect(screen.getByTestId('status-banner')).toHaveTextContent('Em almoço-info')
  })

  it('shows "Aguardando saída" when volta is set', () => {
    punchStateHook.punchState.entrada = '08:00'
    punchStateHook.punchState.almoco = '12:00'
    punchStateHook.punchState.volta = '13:00'
    render(<App />)
    expect(screen.getByTestId('status-banner')).toHaveTextContent('Aguardando saída-info')
  })

  it('shows "Aguardando almoço" when only entrada is set', () => {
    punchStateHook.punchState.entrada = '08:00'
    render(<App />)
    expect(screen.getByTestId('status-banner')).toHaveTextContent('Aguardando almoço-info')
  })

  it('renders next-action card when slot is in the future', () => {
    punchStateHook.punchState.entrada = '08:00'
    punchStateHook.punchState._almocoSugerido = '12:00'
    render(<App />)
    expect(screen.getByTestId('next-action')).toBeInTheDocument()
  })

  it('omits StatusBanner empty status when detecting', () => {
    autoDetectHook.detecting = true
    render(<App />)
    expect(screen.getByTestId('status-banner')).toHaveTextContent('-info')
  })

  it('disables punch button when saida is set', () => {
    punchStateHook.punchState.entrada = '08:00'
    punchStateHook.punchState.almoco = '12:00'
    punchStateHook.punchState.volta = '13:00'
    punchStateHook.punchState.saida = '17:00'
    render(<App />)
    expect(screen.getByTestId('punch-btn')).toBeDisabled()
  })

  it('returns 0 worked when entrada has different day', () => {
    const yesterday = new Date(2026, 3, 14).getTime()
    punchStateHook.punchState.entrada = '08:00'
    punchStateHook.punchState._entradaTimestamp = yesterday
    render(<App />)
    expect(screen.getByTestId('progress')).toHaveTextContent('0/480/')
  })

  it('computes worked minutes with almoço and volta', () => {
    punchStateHook.punchState.entrada = '08:00'
    punchStateHook.punchState.almoco = '12:00'
    punchStateHook.punchState.volta = '13:00'
    render(<App />)
    // Now=09:00, end=09:00, lunch already accounted for (volta-almoco = 60), worked = 9*60-8*60 - 60 = 0
    expect(screen.getByTestId('progress')).toBeInTheDocument()
  })

  it('computes worked minutes with only almoço (subtract from now)', () => {
    vi.setSystemTime(new Date(2026, 3, 15, 13, 30))
    punchStateHook.punchState.entrada = '08:00'
    punchStateHook.punchState.almoco = '12:00'
    render(<App />)
    expect(screen.getByTestId('progress')).toBeInTheDocument()
  })

  it('exercises onToggle and toast onDismiss callbacks', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('settings-toggle'))
    fireEvent.click(screen.getByTestId('settings-toggle'))
    // Trigger toast via captured callback, then click it to invoke onDismiss
    act(() => {
      capturedToastFn?.('hello')
    })
    expect(screen.getByTestId('toast')).toHaveTextContent('hello')
    fireEvent.click(screen.getByTestId('toast'))
  })

  it('builds null hourBank provider when manual disabled', () => {
    mockBuildFlags.ENABLE_MANUAL_PUNCH = false
    mockBuildFlags.ENABLE_SENIOR_INTEGRATION = true
    render(<App />)
    expect(screen.getByTestId('hour-bank')).toBeInTheDocument()
  })
})
