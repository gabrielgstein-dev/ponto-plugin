import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { TimesheetRowMultiple } from '../../../lib/presentation/components/TimesheetRowMultiple'
import type { TimesheetEntry } from '../../../lib/domain/types'

const baseEntry: TimesheetEntry = {
  id: '1',
  date: '2026-04-15',
  hourQuantity: 8,
  status: 'PENDING',
  costCenter: { code: 'CC1', name: 'CostCenter 1' },
  costCenters: [
    { code: 'CC1', name: 'CostCenter 1' },
    { code: 'CC2', name: 'CostCenter 2' },
  ],
  task: { id: 't1', name: 'Tarefa A' },
  hourType: { id: 'h1', description: 'Normal' },
  observation: null,
  isAutomatic: false,
}

describe('TimesheetRowMultiple', () => {
  it('renders collapsed state and toggles on click', () => {
    const onToggle = vi.fn()
    const { container } = render(
      <TimesheetRowMultiple
        entry={baseEntry}
        expanded={false}
        onToggle={onToggle}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn()}
      />,
    )
    expect(screen.getByText('15/04')).toBeInTheDocument()
    expect(screen.getByText('Múltiplos')).toBeInTheDocument()
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    fireEvent.click(container.querySelector('.ts-table-row')!)
    expect(onToggle).toHaveBeenCalled()
  })

  it('formats date with T separator and renders empty/dashes safely', () => {
    render(
      <TimesheetRowMultiple
        entry={{ ...baseEntry, date: '2026-04-15T00:00:00' }}
        expanded={false}
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn()}
      />,
    )
    expect(screen.getByText('15/04')).toBeInTheDocument()
  })

  it('renders raw date when format is unknown', () => {
    render(
      <TimesheetRowMultiple
        entry={{ ...baseEntry, date: 'foobar' }}
        expanded={false}
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn()}
      />,
    )
    expect(screen.getByText('foobar')).toBeInTheDocument()
  })

  it('shows dash when date is empty', () => {
    render(
      <TimesheetRowMultiple
        entry={{ ...baseEntry, date: '' }}
        expanded={false}
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn()}
      />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('falls back to status code for unknown status', () => {
    render(
      <TimesheetRowMultiple
        entry={{ ...baseEntry, status: 'X' as 'PENDING' }}
        expanded={false}
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn()}
      />,
    )
    expect(screen.getByText('X')).toBeInTheDocument()
  })

  it('expands cost centers, allocates hours, and saves', async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true, gpHours: 8 })
    const onFetchGpHours = vi.fn().mockResolvedValue(8)
    render(
      <TimesheetRowMultiple
        entry={baseEntry}
        expanded
        onToggle={vi.fn()}
        onSave={onSave}
        onFetchGpHours={onFetchGpHours}
      />,
    )
    await waitFor(() => expect(onFetchGpHours).toHaveBeenCalled())

    fireEvent.click(screen.getByText('CC1'))
    const inputs = screen.getAllByPlaceholderText('Ex: 4.5') as HTMLInputElement[]
    fireEvent.change(inputs[0], { target: { value: '4' } })

    fireEvent.click(screen.getByText('CC2'))
    const inputs2 = screen.getAllByPlaceholderText('Ex: 4.5') as HTMLInputElement[]
    fireEvent.change(inputs2[0], { target: { value: '3' } })

    const obsAreas = screen.getAllByPlaceholderText(
      'Observação para este centro de custo...',
    ) as HTMLTextAreaElement[]
    fireEvent.change(obsAreas[0], { target: { value: 'obs cc2' } })

    await act(async () => {
      fireEvent.click(screen.getByText('Salvar'))
    })
    expect(onSave).toHaveBeenCalled()
    const allocations = onSave.mock.calls[0][1]
    expect(allocations).toHaveLength(2)
    expect(allocations.reduce((s: number, a: any) => s + a.hours, 0)).toBe(7)
    expect(await screen.findByText('✓ Salvo')).toBeInTheDocument()
  })

  it('shows global error when total exceeds GP hours', async () => {
    const onSave = vi.fn()
    render(
      <TimesheetRowMultiple
        entry={baseEntry}
        expanded
        onToggle={vi.fn()}
        onSave={onSave}
        onFetchGpHours={vi.fn().mockResolvedValue(5)}
      />,
    )
    await waitFor(() => expect(screen.getByText('Total Alocado: 00:00')).toBeInTheDocument())
    fireEvent.click(screen.getByText('CC1'))
    fireEvent.change(screen.getAllByPlaceholderText('Ex: 4.5')[0], { target: { value: '6' } })
    fireEvent.click(screen.getByText('Salvar'))
    expect(await screen.findByText(/excede GP/)).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows global error when nothing is allocated', () => {
    const onSave = vi.fn()
    render(
      <TimesheetRowMultiple
        entry={baseEntry}
        expanded
        onToggle={vi.fn()}
        onSave={onSave}
        onFetchGpHours={vi.fn().mockResolvedValue(8)}
      />,
    )
    const saveBtn = screen.getByText('Salvar')
    expect(saveBtn).toBeDisabled()
  })

  it('shows per-cost-center error when one allocation is missing hours', async () => {
    const onSave = vi.fn()
    render(
      <TimesheetRowMultiple
        entry={baseEntry}
        expanded
        onToggle={vi.fn()}
        onSave={onSave}
        onFetchGpHours={vi.fn().mockResolvedValue(8)}
      />,
    )
    await waitFor(() => expect(screen.getByText('Total Alocado: 00:00')).toBeInTheDocument())
    fireEvent.click(screen.getByText('CC1'))
    fireEvent.change(screen.getAllByPlaceholderText('Ex: 4.5')[0], { target: { value: '4' } })
    // Collapse CC1 and expand CC2 so its inputs/errors are visible
    fireEvent.click(screen.getByText('CC2'))
    fireEvent.click(screen.getByText('Salvar'))
    expect(await screen.findByText('Informe as horas')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('updates obs counter and clears errors on edit', async () => {
    render(
      <TimesheetRowMultiple
        entry={baseEntry}
        expanded
        onToggle={vi.fn()}
        onSave={vi.fn().mockResolvedValue({ ok: false, gpHours: 8 })}
        onFetchGpHours={vi.fn().mockResolvedValue(8)}
      />,
    )
    await waitFor(() => expect(screen.getByText('Total Alocado: 00:00')).toBeInTheDocument())
    fireEvent.click(screen.getByText('CC1'))
    const obs = screen.getAllByPlaceholderText('Observação para este centro de custo...')[0] as HTMLTextAreaElement
    fireEvent.change(obs, { target: { value: 'a'.repeat(10) } })
    expect(screen.getByText('10/500')).toBeInTheDocument()
  })

  it('renders dashes for missing task/hourType inside expanded cost center', async () => {
    render(
      <TimesheetRowMultiple
        entry={{ ...baseEntry, task: null, hourType: null }}
        expanded
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn().mockResolvedValue(null)}
      />,
    )
    await waitFor(() => expect(screen.getByText('Indisponível')).toBeInTheDocument())
    fireEvent.click(screen.getByText('CC1'))
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('shows GP loading state', () => {
    render(
      <TimesheetRowMultiple
        entry={baseEntry}
        expanded
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn().mockResolvedValue(8)}
      />,
    )
    expect(screen.getByText('Consultando GP...')).toBeInTheDocument()
  })

  it('toggles expanded cost center off when clicked again', async () => {
    render(
      <TimesheetRowMultiple
        entry={baseEntry}
        expanded
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn().mockResolvedValue(8)}
      />,
    )
    fireEvent.click(screen.getByText('CC1'))
    expect(screen.getAllByPlaceholderText('Ex: 4.5').length).toBeGreaterThanOrEqual(1)
    fireEvent.click(screen.getByText('CC1'))
    expect(screen.queryByPlaceholderText('Ex: 4.5')).toBeNull()
  })

  it('clicking input/textarea does not toggle row', () => {
    const onToggle = vi.fn()
    render(
      <TimesheetRowMultiple
        entry={baseEntry}
        expanded
        onToggle={onToggle}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn().mockResolvedValue(8)}
      />,
    )
    onToggle.mockClear()
    fireEvent.click(screen.getByText('CC1'))
    fireEvent.click(screen.getAllByPlaceholderText('Ex: 4.5')[0])
    fireEvent.click(screen.getAllByPlaceholderText('Observação para este centro de custo...')[0])
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('handles invalid number input as 0', async () => {
    render(
      <TimesheetRowMultiple
        entry={baseEntry}
        expanded
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn().mockResolvedValue(8)}
      />,
    )
    fireEvent.click(screen.getByText('CC1'))
    const input = screen.getAllByPlaceholderText('Ex: 4.5')[0] as HTMLInputElement
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(input.value).toBe('')
  })

  it('strips T separator when fetching GP hours in expanded state', async () => {
    const onFetchGpHours = vi.fn().mockResolvedValue(8)
    render(
      <TimesheetRowMultiple
        entry={{ ...baseEntry, date: '2026-04-15T00:00:00' }}
        expanded
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={onFetchGpHours}
      />,
    )
    await waitFor(() => expect(onFetchGpHours).toHaveBeenCalledWith('2026-04-15'))
  })

  it('handles parseFloat producing NaN by setting hours to 0', async () => {
    render(
      <TimesheetRowMultiple
        entry={baseEntry}
        expanded
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn().mockResolvedValue(null)}
      />,
    )
    fireEvent.click(screen.getByText('CC1'))
    const input = screen.getAllByPlaceholderText('Ex: 4.5')[0] as HTMLInputElement
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(input.value).toBe('')
  })

  it('returns early when costCenters undefined inside allocation effect', async () => {
    render(
      <TimesheetRowMultiple
        entry={{ ...baseEntry, costCenters: undefined }}
        expanded={false}
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onFetchGpHours={vi.fn()}
      />,
    )
    expect(screen.getByText('Múltiplos')).toBeInTheDocument()
  })
})
