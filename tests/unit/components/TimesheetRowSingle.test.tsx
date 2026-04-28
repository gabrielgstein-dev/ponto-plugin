import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { TimesheetRowSingle } from '../../../lib/presentation/components/TimesheetRowSingle'
import type { TimesheetEntry } from '../../../lib/domain/types'

const entry: TimesheetEntry = {
  id: '1',
  date: '2026-04-15',
  hourQuantity: 8,
  status: 'PENDING',
  costCenter: { code: 'CC1', name: 'CostCenter 1' },
  task: { id: 't1', name: 'Tarefa A' },
  hourType: { id: 'h1', description: 'Normal' },
  observation: null,
  isAutomatic: false,
}

describe('TimesheetRowSingle', () => {
  it('renders collapsed state with status and obs dot when missing observation', () => {
    const onToggle = vi.fn()
    const { container } = render(
      <TimesheetRowSingle
        entry={entry}
        expanded={false}
        onToggle={onToggle}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn()}
      />,
    )
    expect(screen.getByText('15/04')).toBeInTheDocument()
    expect(screen.getByText('CC1')).toBeInTheDocument()
    expect(screen.getByText('08:00')).toBeInTheDocument()
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    expect(container.querySelector('.ts-obs-dot')).toBeInTheDocument()

    fireEvent.click(container.querySelector('.ts-table-row')!)
    expect(onToggle).toHaveBeenCalled()
  })

  it('renders expanded state, fetches GP hours, and saves observation', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true, gpHours: 8 })
    const onFetchGpHours = vi.fn().mockResolvedValue(8)
    render(
      <TimesheetRowSingle
        entry={entry}
        expanded
        onToggle={vi.fn()}
        onSave={onSave}
        onFetchGpHours={onFetchGpHours}
      />,
    )
    await waitFor(() => expect(onFetchGpHours).toHaveBeenCalledWith('2026-04-15'))
    expect(await screen.findByText('08:00', { selector: '.ts-gp-hours' })).toBeInTheDocument()
    expect(screen.getByText('Tarefa A')).toBeInTheDocument()
    expect(screen.getByText('Normal')).toBeInTheDocument()

    const textarea = screen.getByPlaceholderText('Adicionar observação...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'minha obs' } })
    expect(screen.getByText('9/1000')).toBeInTheDocument()

    const saveBtn = screen.getByText('Salvar')
    fireEvent.click(saveBtn)
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(entry, 'minha obs'))
  })

  it('shows GP loading and unavailable state', async () => {
    const onFetchGpHours = vi.fn().mockResolvedValue(null)
    render(
      <TimesheetRowSingle
        entry={entry}
        expanded
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={onFetchGpHours}
      />,
    )
    expect(screen.getByText('Consultando GP...')).toBeInTheDocument()
    expect(await screen.findByText('Indisponível')).toBeInTheDocument()
  })

  it('renders GP diff when GP hours differ from entry hours', async () => {
    const onFetchGpHours = vi.fn().mockResolvedValue(7.5)
    render(
      <TimesheetRowSingle
        entry={entry}
        expanded
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={onFetchGpHours}
      />,
    )
    await waitFor(() => expect(screen.getByText(/TS:/)).toBeInTheDocument())
  })

  it('strips T separator when fetching GP hours in expanded state', async () => {
    const onFetchGpHours = vi.fn().mockResolvedValue(null)
    render(
      <TimesheetRowSingle
        entry={{ ...entry, date: '2026-04-15T00:00:00' }}
        expanded
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={onFetchGpHours}
      />,
    )
    await waitFor(() => expect(onFetchGpHours).toHaveBeenCalledWith('2026-04-15'))
  })

  it('formats date with T separator', () => {
    render(
      <TimesheetRowSingle
        entry={{ ...entry, date: '2026-04-15T00:00:00' }}
        expanded={false}
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn()}
      />,
    )
    expect(screen.getByText('15/04')).toBeInTheDocument()
  })

  it('returns dash when date is empty', () => {
    render(
      <TimesheetRowSingle
        entry={{ ...entry, date: '' }}
        expanded={false}
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn()}
      />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('returns raw date when format unrecognized', () => {
    render(
      <TimesheetRowSingle
        entry={{ ...entry, date: 'unknown' }}
        expanded={false}
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn()}
      />,
    )
    expect(screen.getByText('unknown')).toBeInTheDocument()
  })

  it('falls back to status code for unknown status', () => {
    render(
      <TimesheetRowSingle
        entry={{ ...entry, status: 'WAT' as 'PENDING' }}
        expanded={false}
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn()}
      />,
    )
    expect(screen.getByText('WAT')).toBeInTheDocument()
  })

  it('renders dashes when costCenter, task and hourType are null', async () => {
    const onFetchGpHours = vi.fn().mockResolvedValue(null)
    const { container } = render(
      <TimesheetRowSingle
        entry={{
          ...entry,
          costCenter: null,
          task: null,
          hourType: null,
        }}
        expanded
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={onFetchGpHours}
      />,
    )
    expect(container.querySelectorAll('.ts-detail-value')[0]).toHaveTextContent('—')
  })

  it('shows saving state and "Salvo" badge after success', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true, gpHours: 8 })
    render(
      <TimesheetRowSingle
        entry={entry}
        expanded
        onToggle={vi.fn()}
        onSave={onSave}
        onFetchGpHours={vi.fn().mockResolvedValue(8)}
      />,
    )
    const textarea = screen.getByPlaceholderText('Adicionar observação...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'novo' } })
    await act(async () => {
      fireEvent.click(screen.getByText('Salvar'))
    })
    expect(await screen.findByText('✓ Salvo')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('✓ Salvo')).toBeNull(), { timeout: 3000 })
  })

  it('does not show saved badge when save fails', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, gpHours: null })
    render(
      <TimesheetRowSingle
        entry={entry}
        expanded
        onToggle={vi.fn()}
        onSave={onSave}
        onFetchGpHours={vi.fn().mockResolvedValue(null)}
      />,
    )
    const textarea = screen.getByPlaceholderText('Adicionar observação...') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'novo' } })
    await act(async () => {
      fireEvent.click(screen.getByText('Salvar'))
    })
    expect(screen.queryByText('✓ Salvo')).toBeNull()
  })

  it('clicking textarea does not trigger row toggle', () => {
    const onToggle = vi.fn()
    render(
      <TimesheetRowSingle
        entry={entry}
        expanded
        onToggle={onToggle}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn().mockResolvedValue(null)}
      />,
    )
    onToggle.mockClear()
    fireEvent.click(screen.getByPlaceholderText('Adicionar observação...'))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
