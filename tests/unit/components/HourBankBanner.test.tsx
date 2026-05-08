import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HourBankBanner } from '../../../lib/presentation/components/HourBankBanner'
import { mockSidePanelOpen, mockWindowsGetCurrent } from '../../setup/chrome-mock'

describe('HourBankBanner', () => {
  it('renders empty state when no balance, opens side panel on click', async () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})
    render(<HourBankBanner balance={null} estimatedExit={null} />)
    expect(screen.getByText('Histórico & Timesheet')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Histórico & Timesheet').closest('.hour-bank-banner')!)
    await waitFor(() => expect(mockSidePanelOpen).toHaveBeenCalledWith({ windowId: 42 }))
    expect(closeSpy).toHaveBeenCalled()
    closeSpy.mockRestore()
  })

  it('skips sidePanel.open when window has no id', async () => {
    mockWindowsGetCurrent.mockResolvedValueOnce({ id: undefined })
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})
    render(<HourBankBanner balance={null} estimatedExit={null} />)
    fireEvent.click(screen.getByText('Histórico & Timesheet').closest('.hour-bank-banner')!)
    await waitFor(() => expect(closeSpy).toHaveBeenCalled())
    expect(mockSidePanelOpen).not.toHaveBeenCalled()
    closeSpy.mockRestore()
  })

  it('renders positive balance with zero-bank exit hint', () => {
    const { container } = render(
      <HourBankBanner
        balance={{
          totalMinutes: 60,
          periodStart: '2026-04-01',
          periodEnd: '2026-04-30',
          carryOverMinutes: 0,
        }}
        estimatedExit="18:00"
      />,
    )
    expect(container.querySelector('.hour-bank-banner')).toHaveClass('positive')
    expect(screen.getByText('+1h00')).toBeInTheDocument()
    expect(screen.getByText(/Saia às/)).toBeInTheDocument()
    expect(screen.getByText('17:00')).toBeInTheDocument()
    expect(screen.getByText(/Período:/)).toBeInTheDocument()
  })

  it('renders negative balance without exit hint when no estimatedExit', () => {
    const { container } = render(
      <HourBankBanner
        balance={{
          totalMinutes: -30,
          periodStart: '2026-04-01',
          periodEnd: '2026-04-30',
          carryOverMinutes: 0,
        }}
        estimatedExit={null}
      />,
    )
    expect(container.querySelector('.hour-bank-banner')).toHaveClass('negative')
    expect(screen.getByText('-30min')).toBeInTheDocument()
    expect(container.querySelector('.hour-bank-hint')).toBeNull()
  })
})
