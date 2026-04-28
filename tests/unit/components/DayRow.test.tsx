import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DayRow } from '../../../lib/presentation/components/DayRow'
import type { DayRecord } from '../../../lib/domain/types'

const baseRecord: DayRecord = {
  date: '2026-04-15',
  punches: ['08:00', '12:00', '13:00'],
  workedMinutes: 240,
  balanceMinutes: -120,
}

const noop = () => {}

describe('DayRow read-only', () => {
  it('renders punches and totals without action buttons', () => {
    const { container } = render(
      <DayRow
        record={baseRecord}
        readOnly
        onEdit={noop}
        onRemove={noop}
        onAdd={noop}
      />,
    )
    expect(screen.getAllByText('08:00')[0]).toBeInTheDocument()
    expect(container.querySelector('.sp-punch-time.readonly')).toBeInTheDocument()
    expect(container.querySelector('.sp-punch-remove')).toBeNull()
    expect(container.querySelector('.sp-punch-add')).toBeNull()
    expect(screen.getByText('-2h00')).toBeInTheDocument()
  })

  it('shows positive balance class when balance >= 0', () => {
    const { container } = render(
      <DayRow
        record={{ ...baseRecord, balanceMinutes: 30 }}
        readOnly
        onEdit={noop}
        onRemove={noop}
        onAdd={noop}
      />,
    )
    expect(container.querySelector('.sp-col-balance')).toHaveClass('positive')
  })
})

describe('DayRow editable', () => {
  it('opens edit input on punch click and saves on blur', () => {
    const onEdit = vi.fn()
    render(
      <DayRow
        record={baseRecord}
        onEdit={onEdit}
        onRemove={noop}
        onAdd={noop}
      />,
    )
    fireEvent.click(screen.getByText('08:00'))
    const input = screen.getByDisplayValue('08:00') as HTMLInputElement
    fireEvent.change(input, { target: { value: '08:30' } })
    fireEvent.blur(input)
    expect(onEdit).toHaveBeenCalledWith('2026-04-15', '08:00', '08:30')
  })

  it('saves edit on Enter key', () => {
    const onEdit = vi.fn()
    render(
      <DayRow
        record={baseRecord}
        onEdit={onEdit}
        onRemove={noop}
        onAdd={noop}
      />,
    )
    fireEvent.click(screen.getByText('08:00'))
    const input = screen.getByDisplayValue('08:00')
    fireEvent.change(input, { target: { value: '07:00' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onEdit).toHaveBeenCalledWith('2026-04-15', '08:00', '07:00')
  })

  it('skips onEdit when value is empty', () => {
    const onEdit = vi.fn()
    render(
      <DayRow
        record={baseRecord}
        onEdit={onEdit}
        onRemove={noop}
        onAdd={noop}
      />,
    )
    fireEvent.click(screen.getByText('08:00'))
    const input = screen.getByDisplayValue('08:00')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('removes a punch via × button', () => {
    const onRemove = vi.fn()
    const { container } = render(
      <DayRow
        record={baseRecord}
        onEdit={noop}
        onRemove={onRemove}
        onAdd={noop}
      />,
    )
    const removeBtn = container.querySelectorAll('.sp-punch-remove')[0] as HTMLButtonElement
    fireEvent.click(removeBtn)
    expect(onRemove).toHaveBeenCalledWith('2026-04-15', '08:00')
  })

  it('shows add button and adds a new punch on Enter', () => {
    const onAdd = vi.fn()
    render(
      <DayRow
        record={baseRecord}
        onEdit={noop}
        onRemove={noop}
        onAdd={onAdd}
      />,
    )
    fireEvent.click(screen.getByText('+'))
    const input = screen.getAllByDisplayValue('').find(
      (el) => (el as HTMLInputElement).type === 'time',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: '17:30' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledWith('2026-04-15', '17:30')
  })

  it('cancels add on Escape', () => {
    const onAdd = vi.fn()
    render(
      <DayRow
        record={baseRecord}
        onEdit={noop}
        onRemove={noop}
        onAdd={onAdd}
      />,
    )
    fireEvent.click(screen.getByText('+'))
    const input = screen.getAllByDisplayValue('').find(
      (el) => (el as HTMLInputElement).type === 'time',
    ) as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('blur with empty value cancels add (no onAdd)', () => {
    const onAdd = vi.fn()
    render(
      <DayRow
        record={baseRecord}
        onEdit={noop}
        onRemove={noop}
        onAdd={onAdd}
      />,
    )
    fireEvent.click(screen.getByText('+'))
    const input = screen.getAllByDisplayValue('').find(
      (el) => (el as HTMLInputElement).type === 'time',
    ) as HTMLInputElement
    fireEvent.blur(input)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('blur with value triggers add', () => {
    const onAdd = vi.fn()
    render(
      <DayRow
        record={baseRecord}
        onEdit={noop}
        onRemove={noop}
        onAdd={onAdd}
      />,
    )
    fireEvent.click(screen.getByText('+'))
    const input = screen.getAllByDisplayValue('').find(
      (el) => (el as HTMLInputElement).type === 'time',
    ) as HTMLInputElement
    fireEvent.change(input, { target: { value: '18:00' } })
    fireEvent.blur(input)
    expect(onAdd).toHaveBeenCalledWith('2026-04-15', '18:00')
  })

  it('hides + button when 4 punches already exist', () => {
    const { container } = render(
      <DayRow
        record={{ ...baseRecord, punches: ['08:00', '12:00', '13:00', '17:00'] }}
        onEdit={noop}
        onRemove={noop}
        onAdd={noop}
      />,
    )
    expect(container.querySelector('.sp-punch-add')).toBeNull()
  })
})

describe('DayRow GP ajuste panel', () => {
  it('opens panel and submits successfully', async () => {
    const onAddGpAjuste = vi.fn().mockResolvedValue({ ok: true, message: 'ok' })
    render(
      <DayRow
        record={baseRecord}
        onEdit={noop}
        onRemove={noop}
        onAdd={noop}
        onAddGpAjuste={onAddGpAjuste}
      />,
    )
    const ajusteBtn = screen.getAllByText('+').find((el) => el.getAttribute('title')?.includes('justificativa'))!
    fireEvent.click(ajusteBtn)

    expect(screen.getByText('Ajuste de marcação')).toBeInTheDocument()
    const timeInput = screen.getByDisplayValue('') as HTMLInputElement
    fireEvent.change(timeInput, { target: { value: '14:00' } })
    const select = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '4' } })
    await act(async () => {
      fireEvent.click(screen.getByText('Salvar'))
    })
    expect(onAddGpAjuste).toHaveBeenCalledWith('2026-04-15', '14:00', 4)
    expect(screen.queryByText('Ajuste de marcação')).toBeNull()
  })

  it('renders error when submit fails', async () => {
    const onAddGpAjuste = vi.fn().mockResolvedValue({ ok: false, message: 'falhou' })
    render(
      <DayRow
        record={baseRecord}
        onEdit={noop}
        onRemove={noop}
        onAdd={noop}
        onAddGpAjuste={onAddGpAjuste}
      />,
    )
    fireEvent.click(
      screen.getAllByText('+').find((el) => el.getAttribute('title')?.includes('justificativa'))!,
    )
    fireEvent.change(screen.getByDisplayValue(''), { target: { value: '14:00' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } })
    await act(async () => {
      fireEvent.click(screen.getByText('Salvar'))
    })
    expect(await screen.findByText('falhou')).toBeInTheDocument()
  })

  it('disables save button when invalid and ignores click', async () => {
    const onAddGpAjuste = vi.fn().mockResolvedValue({ ok: true, message: 'ok' })
    render(
      <DayRow
        record={baseRecord}
        onEdit={noop}
        onRemove={noop}
        onAdd={noop}
        onAddGpAjuste={onAddGpAjuste}
      />,
    )
    fireEvent.click(
      screen.getAllByText('+').find((el) => el.getAttribute('title')?.includes('justificativa'))!,
    )
    const saveBtn = screen.getByText('Salvar') as HTMLButtonElement
    expect(saveBtn).toBeDisabled()
    fireEvent.click(saveBtn)
    expect(onAddGpAjuste).not.toHaveBeenCalled()
  })

  it('cancels via cancel button', () => {
    const onAddGpAjuste = vi.fn()
    render(
      <DayRow
        record={baseRecord}
        onEdit={noop}
        onRemove={noop}
        onAdd={noop}
        onAddGpAjuste={onAddGpAjuste}
      />,
    )
    fireEvent.click(
      screen.getAllByText('+').find((el) => el.getAttribute('title')?.includes('justificativa'))!,
    )
    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.queryByText('Ajuste de marcação')).toBeNull()
  })

  it('toggles ajuste panel via × close', () => {
    render(
      <DayRow
        record={baseRecord}
        onEdit={noop}
        onRemove={noop}
        onAdd={noop}
        onAddGpAjuste={vi.fn()}
      />,
    )
    const ajusteBtn = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('title')?.includes('justificativa'))!
    fireEvent.click(ajusteBtn)
    expect(screen.getByText('Ajuste de marcação')).toBeInTheDocument()
    fireEvent.click(ajusteBtn)
    expect(screen.queryByText('Ajuste de marcação')).toBeNull()
  })
})
