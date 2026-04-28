import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TimesheetEntryRow } from '../../../lib/presentation/components/TimesheetEntryRow'
import type { TimesheetEntry } from '../../../lib/domain/types'

const baseEntry: TimesheetEntry = {
  id: '1',
  date: '2026-04-01',
  hourQuantity: 8,
  status: 'PENDING',
  costCenter: { code: 'CC1', name: 'CostCenter 1' },
  task: { id: 't1', name: 'Tarefa A' },
  hourType: { id: 'h1', description: 'Normal' },
  observation: null,
  isAutomatic: false,
}

describe('TimesheetEntryRow', () => {
  it('formats whole hours as Nh', () => {
    render(<TimesheetEntryRow entry={baseEntry} />)
    expect(screen.getByText('8h')).toBeInTheDocument()
    expect(screen.getByText('Tarefa A')).toBeInTheDocument()
    expect(screen.getByText('CC1')).toBeInTheDocument()
  })

  it('formats fractional hours with minutes', () => {
    render(<TimesheetEntryRow entry={{ ...baseEntry, hourQuantity: 7.5 }} />)
    expect(screen.getByText('7h30')).toBeInTheDocument()
  })

  it('renders dashes when task and costCenter are missing', () => {
    render(
      <TimesheetEntryRow
        entry={{ ...baseEntry, task: null, costCenter: null }}
      />,
    )
    const dashes = screen.getAllByText('—')
    expect(dashes).toHaveLength(2)
  })

  it('renders observation indicator when observation present', () => {
    const { container } = render(
      <TimesheetEntryRow entry={{ ...baseEntry, observation: 'note' }} />,
    )
    const obs = container.querySelector('.ts-col-obs')
    expect(obs).toHaveTextContent('💬')
    expect(obs).toHaveAttribute('title', 'note')
  })

  it('does not render observation indicator when null', () => {
    const { container } = render(<TimesheetEntryRow entry={baseEntry} />)
    expect(container.querySelector('.ts-col-obs')).toBeNull()
  })
})
