import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('../../../lib/domain/build-flags', () => ({
  ENABLE_SENIOR_INTEGRATION: false,
}))

import { SettingsPanel } from '../../../lib/presentation/components/SettingsPanel'
import { DEFAULT_SETTINGS } from '../../../lib/domain/types'

const settings = { ...DEFAULT_SETTINGS }

describe('SettingsPanel', () => {
  it('renders only toggle button when closed', () => {
    render(
      <SettingsPanel
        open={false}
        settings={settings}
        onToggle={() => {}}
        onChange={() => {}}
        onClear={() => {}}
      />,
    )
    expect(screen.getByText('⚙ Configurações')).toBeInTheDocument()
    expect(screen.queryByText('Jornada (horas)')).toBeNull()
  })

  it('opens, calls onToggle, and renders all settings rows', () => {
    const onToggle = vi.fn()
    render(
      <SettingsPanel
        open
        settings={settings}
        onToggle={onToggle}
        onChange={() => {}}
        onClear={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('▲ Fechar Configurações'))
    expect(onToggle).toHaveBeenCalled()
    expect(screen.getByText('Jornada (horas)')).toBeInTheDocument()
    expect(screen.getByText('Horário Almoço')).toBeInTheDocument()
    expect(screen.getByText('Duração Almoço (min)')).toBeInTheDocument()
    expect(screen.getByText('Antecipação Notif. (min)')).toBeInTheDocument()
    expect(screen.getByText('Lembrete Atraso (min)')).toBeInTheDocument()
    expect(screen.getByText('Dia Fechamento')).toBeInTheDocument()
  })

  it('emits onChange for jornada (rounded to minutes)', () => {
    const onChange = vi.fn()
    render(
      <SettingsPanel
        open
        settings={settings}
        onToggle={() => {}}
        onChange={onChange}
        onClear={() => {}}
      />,
    )
    const jornadaInput = screen.getByDisplayValue(8) as HTMLInputElement
    fireEvent.change(jornadaInput, { target: { value: '7.5' } })
    expect(onChange).toHaveBeenCalledWith({ jornada: 450 })
  })

  it('emits time setting onChange', () => {
    const onChange = vi.fn()
    render(
      <SettingsPanel
        open
        settings={settings}
        onToggle={() => {}}
        onChange={onChange}
        onClear={() => {}}
      />,
    )
    const timeInput = screen.getByDisplayValue('12:00') as HTMLInputElement
    fireEvent.change(timeInput, { target: { value: '13:00' } })
    expect(onChange).toHaveBeenCalledWith({ almocoHorario: '13:00' })
  })

  it('clamps lembreteAtraso to non-negative integer', () => {
    const onChange = vi.fn()
    render(
      <SettingsPanel
        open
        settings={settings}
        onToggle={() => {}}
        onChange={onChange}
        onClear={() => {}}
      />,
    )
    const lembreteInput = screen.getByDisplayValue(30) as HTMLInputElement
    fireEvent.change(lembreteInput, { target: { value: '-5' } })
    expect(onChange).toHaveBeenCalledWith({ lembreteAtraso: 0 })
  })

  it('clamps closingDay between 1 and 28', () => {
    const onChange = vi.fn()
    render(
      <SettingsPanel
        open
        settings={settings}
        onToggle={() => {}}
        onChange={onChange}
        onClear={() => {}}
      />,
    )
    const closingDayInput = screen.getByDisplayValue(28) as HTMLInputElement
    fireEvent.change(closingDayInput, { target: { value: '50' } })
    expect(onChange).toHaveBeenCalledWith({ closingDay: 28 })
    fireEvent.change(closingDayInput, { target: { value: '0' } })
    expect(onChange).toHaveBeenCalledWith({ closingDay: 1 })
  })

  it('handles invalid number input as 0', () => {
    const onChange = vi.fn()
    render(
      <SettingsPanel
        open
        settings={settings}
        onToggle={() => {}}
        onChange={onChange}
        onClear={() => {}}
      />,
    )
    const dur = screen.getByDisplayValue(60) as HTMLInputElement
    fireEvent.change(dur, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({ almocoDur: 0 })
  })

  it('emits onChange for notifAntecip', () => {
    const onChange = vi.fn()
    render(
      <SettingsPanel
        open
        settings={settings}
        onToggle={() => {}}
        onChange={onChange}
        onClear={() => {}}
      />,
    )
    const notifInput = screen.getByDisplayValue(10) as HTMLInputElement
    fireEvent.change(notifInput, { target: { value: '15' } })
    expect(onChange).toHaveBeenCalledWith({ notifAntecip: 15 })
  })

  it('hides closingDay when ENABLE_SENIOR_INTEGRATION', async () => {
    vi.resetModules()
    vi.doMock('../../../lib/domain/build-flags', () => ({
      ENABLE_SENIOR_INTEGRATION: true,
    }))
    const { SettingsPanel: PanelWithSenior } = await import(
      '../../../lib/presentation/components/SettingsPanel'
    )
    render(
      <PanelWithSenior
        open
        settings={settings}
        onToggle={() => {}}
        onChange={() => {}}
        onClear={() => {}}
      />,
    )
    expect(screen.queryByText('Dia Fechamento')).toBeNull()
    vi.doUnmock('../../../lib/domain/build-flags')
  })

  it('emits onClear when clear button is clicked', () => {
    const onClear = vi.fn()
    render(
      <SettingsPanel
        open
        settings={settings}
        onToggle={() => {}}
        onChange={() => {}}
        onClear={onClear}
      />,
    )
    fireEvent.click(screen.getByText('Limpar registros de hoje'))
    expect(onClear).toHaveBeenCalled()
  })
})
