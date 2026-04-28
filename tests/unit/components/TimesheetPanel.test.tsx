import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

let mockHookReturn: any = {
  summary: null,
  loading: false,
  available: true,
  connecting: false,
  periodLabel: 'Abr 2026',
  isCurrentPeriod: true,
  goToPrev: vi.fn(),
  goToNext: vi.fn(),
  goToCurrent: vi.fn(),
  updateEntry: vi.fn(),
  updateEntryWithAllocations: vi.fn(),
  fetchGpHours: vi.fn().mockResolvedValue(null),
}

vi.mock('../../../lib/presentation/hooks/useTimesheetData', () => ({
  useTimesheetData: () => mockHookReturn,
}))
vi.mock('../../../lib/presentation/components/TimesheetRowSingle', () => ({
  TimesheetRowSingle: ({ entry, onToggle }: any) => (
    <div data-testid={`single-${entry.id}`} onClick={onToggle}>
      single-{entry.id}
    </div>
  ),
}))
vi.mock('../../../lib/presentation/components/TimesheetRowMultiple', () => ({
  TimesheetRowMultiple: ({ entry, onToggle }: any) => (
    <div data-testid={`multi-${entry.id}`} onClick={onToggle}>
      multi-{entry.id}
    </div>
  ),
}))

import { TimesheetPanel } from '../../../lib/presentation/components/TimesheetPanel'
import { mockStorageRemove, mockRuntimeSendMessage } from '../../setup/chrome-mock'

const baseHook = (overrides: any = {}) => ({
  summary: null,
  loading: false,
  available: true,
  connecting: false,
  periodLabel: 'Abr 2026',
  isCurrentPeriod: true,
  goToPrev: vi.fn(),
  goToNext: vi.fn(),
  goToCurrent: vi.fn(),
  updateEntry: vi.fn(),
  updateEntryWithAllocations: vi.fn(),
  fetchGpHours: vi.fn().mockResolvedValue(null),
  ...overrides,
})

describe('TimesheetPanel', () => {
  it('renders connecting state', () => {
    mockHookReturn = baseHook({ connecting: true })
    render(<TimesheetPanel />)
    expect(screen.getByText('Conectando ao Timesheet...')).toBeInTheDocument()
  })

  it('renders unavailable state with link', () => {
    mockHookReturn = baseHook({ available: false })
    render(<TimesheetPanel />)
    expect(screen.getByText(/Não foi possível conectar/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir plataforma' })).toHaveAttribute(
      'href',
      'https://plataforma.meta.com.br',
    )
  })

  it('renders empty entries state and triggers test notification', () => {
    mockHookReturn = baseHook({
      summary: {
        period: '2026-04',
        pendingHours: 0,
        approvedHours: 0,
        reprovedHours: 0,
        totalReportedHours: 0,
        entries: [],
      },
    })
    render(<TimesheetPanel />)
    expect(screen.getByText(/Nenhum lançamento pendente/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Testar Notificação'))
    expect(mockStorageRemove).toHaveBeenCalledWith('tsNotifShownDate')
    expect(mockRuntimeSendMessage).toHaveBeenCalledWith({ type: 'TEST_TS_NOTIFICATION' })
  })

  it('shows loading text only when entries are empty and loading', () => {
    mockHookReturn = baseHook({ loading: true })
    render(<TimesheetPanel />)
    expect(screen.getByText('Carregando...')).toBeInTheDocument()
  })

  it('renders summary with formatted hours and entries (single + multi)', () => {
    const entries = [
      {
        id: '1',
        date: '2026-04-01',
        hourQuantity: 8,
        status: 'PENDING',
        costCenter: { code: 'CC1', name: 'CC1' },
        task: null,
        hourType: null,
        observation: null,
        isAutomatic: false,
      },
      {
        id: '2',
        date: '2026-04-02',
        hourQuantity: 8,
        status: 'PENDING',
        costCenter: { code: 'CC1', name: 'CC1' },
        costCenters: [
          { code: 'CC1', name: 'CC1' },
          { code: 'CC2', name: 'CC2' },
        ],
        task: null,
        hourType: null,
        observation: null,
        isAutomatic: false,
      },
    ]
    mockHookReturn = baseHook({
      summary: {
        period: '2026-04',
        pendingHours: 1.5,
        approvedHours: 2,
        reprovedHours: 0,
        totalReportedHours: 3.5,
        entries,
      },
    })
    render(<TimesheetPanel />)
    expect(screen.getAllByText('01:30').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('02:00')).toBeInTheDocument()
    expect(screen.getByTestId('single-1')).toBeInTheDocument()
    expect(screen.getByTestId('multi-2')).toBeInTheDocument()
  })

  it('toggles multi row callback', () => {
    const entry = {
      id: '1',
      date: '2026-04-01',
      hourQuantity: 8,
      status: 'PENDING',
      costCenter: { code: 'CC1', name: 'CC1' },
      costCenters: [
        { code: 'CC1', name: 'CC1' },
        { code: 'CC2', name: 'CC2' },
      ],
      task: null,
      hourType: null,
      observation: null,
      isAutomatic: false,
    }
    mockHookReturn = baseHook({
      summary: {
        period: '2026-04',
        pendingHours: 0,
        approvedHours: 0,
        reprovedHours: 0,
        totalReportedHours: 0,
        entries: [entry],
      },
    })
    render(<TimesheetPanel />)
    fireEvent.click(screen.getByTestId('multi-1'))
    fireEvent.click(screen.getByTestId('multi-1'))
  })

  it('toggles expandedId via single row callback', () => {
    const entry = {
      id: '1',
      date: '2026-04-01',
      hourQuantity: 8,
      status: 'PENDING',
      costCenter: { code: 'CC1', name: 'CC1' },
      task: null,
      hourType: null,
      observation: null,
      isAutomatic: false,
    }
    mockHookReturn = baseHook({
      summary: {
        period: '2026-04',
        pendingHours: 0,
        approvedHours: 0,
        reprovedHours: 0,
        totalReportedHours: 0,
        entries: [entry],
      },
    })
    render(<TimesheetPanel />)
    fireEvent.click(screen.getByTestId('single-1'))
    fireEvent.click(screen.getByTestId('single-1'))
  })

  it('navigates between periods', () => {
    const goToPrev = vi.fn()
    const goToNext = vi.fn()
    const goToCurrent = vi.fn()
    mockHookReturn = baseHook({
      isCurrentPeriod: false,
      periodLabel: 'Mar 2026',
      goToPrev,
      goToNext,
      goToCurrent,
    })
    render(<TimesheetPanel />)
    fireEvent.click(screen.getByText('‹'))
    expect(goToPrev).toHaveBeenCalled()
    fireEvent.click(screen.getByText('›'))
    expect(goToNext).toHaveBeenCalled()
    fireEvent.click(screen.getByText(/Mar 2026/))
    expect(goToCurrent).toHaveBeenCalled()
  })

  it('next button is disabled when on current period', () => {
    mockHookReturn = baseHook()
    render(<TimesheetPanel />)
    expect(screen.getByText('›')).toBeDisabled()
  })
})
