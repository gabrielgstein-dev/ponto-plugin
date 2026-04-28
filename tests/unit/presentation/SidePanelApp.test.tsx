import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockBuildFlags = { ENABLE_META_TIMESHEET: true }
vi.mock('../../../lib/domain/build-flags', () => ({
  get ENABLE_META_TIMESHEET() {
    return mockBuildFlags.ENABLE_META_TIMESHEET
  },
  ENABLE_SENIOR_INTEGRATION: true,
  ENABLE_SENIOR_PUNCH_BUTTON: false,
  ENABLE_MANUAL_PUNCH: false,
  ENABLE_NOTIFICATIONS: true,
  ENABLE_YESTERDAY: false,
  ENABLE_WIDGET: false,
  DEBUG: false,
  APP_NAME: 'TestApp',
  ACTIVE_COMPANY: 'meta',
  THEME: 'meta',
}))

let panelHook: any

vi.mock('../../../lib/presentation/hooks/useSidePanelData', () => ({
  useSidePanelData: () => panelHook,
}))
vi.mock('../../../lib/presentation/components/DayRow', () => ({
  DayRow: ({ record, readOnly, onAddGpAjuste }: any) => (
    <div data-testid={`day-${record.date}`}>
      day-{record.date}-{readOnly ? 'ro' : 'rw'}-{onAddGpAjuste ? 'gp' : 'no-gp'}
    </div>
  ),
}))
vi.mock('../../../lib/presentation/components/TimesheetPanel', () => ({
  TimesheetPanel: () => <div data-testid="ts-panel">timesheet</div>,
}))
vi.mock('../../../lib/presentation/components/ThemeToggle', () => ({
  ThemeToggle: () => <button data-testid="toggle">toggle</button>,
}))

import { SidePanelApp } from '../../../lib/presentation/SidePanelApp'
import { mockStorageGet, mockStorageRemove } from '../../setup/chrome-mock'

beforeEach(() => {
  mockBuildFlags.ENABLE_META_TIMESHEET = true
  panelHook = {
    balance: null,
    records: [],
    source: 'manual',
    loadingRecords: false,
    isCurrentPeriod: true,
    goToPrev: vi.fn(),
    goToNext: vi.fn(),
    goToCurrent: vi.fn(),
    editPunch: vi.fn(),
    removePunch: vi.fn(),
    addPunch: vi.fn(),
    addGpPunch: vi.fn(),
  }
})

describe('SidePanelApp', () => {
  it('renders ponto tab by default and switches to timesheet', () => {
    render(<SidePanelApp />)
    expect(screen.getByText('Histórico de Ponto')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Timesheet'))
    expect(screen.getByTestId('ts-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Ponto'))
    expect(screen.getByText('Histórico de Ponto')).toBeInTheDocument()
  })

  it('hides tabs when ENABLE_META_TIMESHEET is false', () => {
    mockBuildFlags.ENABLE_META_TIMESHEET = false
    render(<SidePanelApp />)
    expect(screen.queryByText('Timesheet')).toBeNull()
  })

  it('reads sidePanelTab from storage and switches to timesheet', async () => {
    mockStorageGet.mockResolvedValue({ sidePanelTab: 'timesheet' })
    render(<SidePanelApp />)
    await waitFor(() => expect(screen.getByTestId('ts-panel')).toBeInTheDocument())
    expect(mockStorageRemove).toHaveBeenCalledWith('sidePanelTab')
  })

  it('shows balance with positive class when totalMinutes >= 0', () => {
    panelHook.balance = {
      totalMinutes: 30,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    }
    const { container } = render(<SidePanelApp />)
    expect(container.querySelector('.sp-bank')).toHaveClass('positive')
  })

  it('shows balance with negative class when totalMinutes < 0', () => {
    panelHook.balance = {
      totalMinutes: -30,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    }
    const { container } = render(<SidePanelApp />)
    expect(container.querySelector('.sp-bank')).toHaveClass('negative')
  })

  it('does not show period nav when source is not gp', () => {
    panelHook.balance = {
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    }
    panelHook.source = 'manual'
    const { container } = render(<SidePanelApp />)
    expect(container.querySelector('.sp-period-nav')).toBeNull()
  })

  it('shows period nav and navigates when source is gp', () => {
    panelHook.balance = {
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    }
    panelHook.source = 'gp'
    panelHook.isCurrentPeriod = false
    render(<SidePanelApp />)
    fireEvent.click(screen.getByText('‹'))
    expect(panelHook.goToPrev).toHaveBeenCalled()
    fireEvent.click(screen.getByText('›'))
    expect(panelHook.goToNext).toHaveBeenCalled()
    fireEvent.click(screen.getByText(/voltar ao atual/))
    expect(panelHook.goToCurrent).toHaveBeenCalled()
  })

  it('disables next button when on current period', () => {
    panelHook.balance = {
      totalMinutes: 0,
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      carryOverMinutes: 0,
    }
    panelHook.source = 'gp'
    render(<SidePanelApp />)
    expect(screen.getByText('›')).toBeDisabled()
  })

  it('renders empty state when no records', () => {
    render(<SidePanelApp />)
    expect(screen.getByText(/Nenhum registro/)).toBeInTheDocument()
  })

  it('renders day rows with readOnly for gp source or today, with addGpPunch only for gp', () => {
    panelHook.source = 'gp'
    panelHook.records = [
      { date: '2026-04-15', punches: ['08:00'], workedMinutes: 60, balanceMinutes: 0 },
    ]
    render(<SidePanelApp />)
    expect(screen.getByTestId('day-2026-04-15')).toHaveTextContent('ro-gp')
  })

  it('passes readOnly when date matches today', () => {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    panelHook.source = 'manual'
    panelHook.records = [
      { date: today, punches: ['08:00'], workedMinutes: 60, balanceMinutes: 0 },
      { date: '2026-01-01', punches: ['09:00'], workedMinutes: 60, balanceMinutes: 0 },
    ]
    render(<SidePanelApp />)
    expect(screen.getByTestId(`day-${today}`)).toHaveTextContent('ro-no-gp')
    expect(screen.getByTestId('day-2026-01-01')).toHaveTextContent('rw-no-gp')
  })
})
