import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../../../lib/domain/build-flags', () => ({
  ENABLE_SENIOR_INTEGRATION: false,
  ENABLE_META_TIMESHEET: false,
  DEBUG: false,
}))

const exportLogsSpy = vi.fn()
const clearLogsSpy = vi.fn()
vi.mock('../../../lib/presentation/export-logs', () => ({
  exportLogs: () => exportLogsSpy(),
}))
vi.mock('../../../lib/domain/log-store', () => ({
  clearLogs: () => clearLogsSpy(),
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
    expect(screen.getByText('Horário Entrada')).toBeInTheDocument()
    expect(screen.getByText('Horário Almoço')).toBeInTheDocument()
    expect(screen.getByText('Duração Almoço (min)')).toBeInTheDocument()
    expect(screen.getByText('Antecipação Notif. (min)')).toBeInTheDocument()
    expect(screen.getByText('Lembrete Atraso (min)')).toBeInTheDocument()
    expect(screen.getByText('Dia Fechamento')).toBeInTheDocument()
  })

  it('emits onChange for entradaHorario (BUG 3 — campo novo)', () => {
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
    // settings.entradaHorario default = '08:00'
    const entradaInput = screen.getByDisplayValue('08:00') as HTMLInputElement
    fireEvent.change(entradaInput, { target: { value: '09:30' } })
    expect(onChange).toHaveBeenCalledWith({ entradaHorario: '09:30' })
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
      ENABLE_META_TIMESHEET: false,
      DEBUG: false,
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

  describe('LogsActions', () => {
    function renderOpen() {
      return render(
        <SettingsPanel
          open
          settings={settings}
          onToggle={() => {}}
          onChange={() => {}}
          onClear={() => {}}
        />,
      )
    }

    it('renders both buttons when panel is open', () => {
      exportLogsSpy.mockReset()
      clearLogsSpy.mockReset()
      renderOpen()
      expect(screen.getByText('Exportar logs')).toBeInTheDocument()
      expect(screen.getByText('Limpar logs')).toBeInTheDocument()
    })

    it('exports successfully and shows feedback', async () => {
      exportLogsSpy.mockReset().mockResolvedValue(undefined)
      renderOpen()
      fireEvent.click(screen.getByText('Exportar logs'))
      expect(screen.getByText('Exportando...')).toBeInTheDocument()
      await waitFor(() =>
        expect(screen.getByText('Logs exportados.')).toBeInTheDocument(),
      )
    })

    it('shows failure feedback when export rejects', async () => {
      exportLogsSpy.mockReset().mockRejectedValue(new Error('boom'))
      renderOpen()
      fireEvent.click(screen.getByText('Exportar logs'))
      await waitFor(() =>
        expect(screen.getByText('Falha ao exportar logs.')).toBeInTheDocument(),
      )
    })

    it('clears successfully and shows feedback', async () => {
      clearLogsSpy.mockReset().mockResolvedValue(undefined)
      renderOpen()
      fireEvent.click(screen.getByText('Limpar logs'))
      expect(screen.getByText('Limpando...')).toBeInTheDocument()
      await waitFor(() =>
        expect(screen.getByText('Logs limpos.')).toBeInTheDocument(),
      )
    })

    it('shows failure feedback when clear rejects', async () => {
      clearLogsSpy.mockReset().mockRejectedValue(new Error('boom'))
      renderOpen()
      fireEvent.click(screen.getByText('Limpar logs'))
      await waitFor(() =>
        expect(screen.getByText('Falha ao limpar logs.')).toBeInTheDocument(),
      )
    })

    it('disables both buttons while busy', async () => {
      let resolve!: () => void
      exportLogsSpy.mockReset().mockReturnValue(
        new Promise<void>(r => {
          resolve = r
        }),
      )
      renderOpen()
      const exportBtn = screen.getByText('Exportar logs')
      fireEvent.click(exportBtn)
      const clearBtn = screen.getByText('Limpar logs')
      expect(clearBtn).toBeDisabled()
      resolve()
      await waitFor(() => expect(screen.getByText('Logs exportados.')).toBeInTheDocument())
    })
  })

  describe('DebugReminderTest (com DEBUG=true)', () => {
    it('renderiza select com 4 slots incluindo entrada (BUG 3)', async () => {
      vi.resetModules()
      vi.doMock('../../../lib/domain/build-flags', () => ({
        ENABLE_SENIOR_INTEGRATION: false,
        ENABLE_META_TIMESHEET: false,
        DEBUG: true,
      }))
      const { SettingsPanel: PanelDebug } = await import(
        '../../../lib/presentation/components/SettingsPanel'
      )
      render(
        <PanelDebug
          open
          settings={settings}
          onToggle={() => {}}
          onChange={() => {}}
          onClear={() => {}}
        />,
      )
      const select = screen.getByText('Testar lembrete').previousSibling as HTMLSelectElement
      expect(select.tagName).toBe('SELECT')
      const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
      expect(options).toEqual(['entrada', 'almoco', 'volta', 'saida'])
      vi.doUnmock('../../../lib/domain/build-flags')
    })

    it('envia mensagem com slot selecionado ao clicar em Testar lembrete', async () => {
      vi.resetModules()
      vi.doMock('../../../lib/domain/build-flags', () => ({
        ENABLE_SENIOR_INTEGRATION: false,
        ENABLE_META_TIMESHEET: false,
        DEBUG: true,
      }))
      const sendMessageSpy = vi.fn()
      ;(globalThis as { chrome: { runtime: { sendMessage: typeof sendMessageSpy } } })
        .chrome.runtime.sendMessage = sendMessageSpy

      const { SettingsPanel: PanelDebug } = await import(
        '../../../lib/presentation/components/SettingsPanel'
      )
      render(
        <PanelDebug
          open
          settings={settings}
          onToggle={() => {}}
          onChange={() => {}}
          onClear={() => {}}
        />,
      )
      const select = screen.getByText('Testar lembrete').previousSibling as HTMLSelectElement
      fireEvent.change(select, { target: { value: 'entrada' } })
      fireEvent.click(screen.getByText('Testar lembrete'))
      expect(sendMessageSpy).toHaveBeenCalledWith({
        type: 'TEST_PUNCH_REMINDER',
        slot: 'entrada',
        time: '12:00',
      })
      vi.doUnmock('../../../lib/domain/build-flags')
    })
  })
})
