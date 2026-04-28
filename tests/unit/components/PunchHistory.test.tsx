import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const mockGetHistory = vi.fn()
const mockSeed = vi.fn()

vi.mock('../../../lib/infrastructure/manual/manual-punch-provider', () => ({
  getManualPunchHistory: () => mockGetHistory(),
}))
vi.mock('../../../lib/infrastructure/manual/seed-mock-punches', () => ({
  seedMockPunches: () => mockSeed(),
}))

import { PunchHistory } from '../../../lib/presentation/components/PunchHistory'

describe('PunchHistory', () => {
  it('renders collapsed by default', async () => {
    mockGetHistory.mockResolvedValue({})
    render(<PunchHistory />)
    expect(screen.getByText('📋 Histórico (7 dias)')).toBeInTheDocument()
    expect(screen.queryByText(/Nenhum registro/)).toBeNull()
  })

  it('expands on click and shows empty state', async () => {
    mockGetHistory.mockResolvedValue({})
    render(<PunchHistory />)
    fireEvent.click(screen.getByText('📋 Histórico (7 dias)'))
    expect(await screen.findByText('Nenhum registro encontrado')).toBeInTheDocument()
    expect(screen.getByText('▲ Fechar Histórico')).toBeInTheDocument()
  })

  it('renders day rows sorted descending and worked hours', async () => {
    mockGetHistory.mockResolvedValue({
      '2026-04-15': ['08:00', '12:00', '13:00', '17:00'],
      '2026-04-16': ['09:00', '12:00'],
      '2026-04-14': ['08:00'],
    })
    render(<PunchHistory />)
    fireEvent.click(screen.getByText('📋 Histórico (7 dias)'))
    await waitFor(() => expect(screen.getAllByText(/\d{2}:\d{2}/).length).toBeGreaterThan(0))

    expect(screen.getByText('8h00')).toBeInTheDocument()
    expect(screen.getByText('3h00')).toBeInTheDocument()
    expect(screen.getByText('--')).toBeInTheDocument()
  })

  it('renders seed button when showSeedButton is true and triggers re-load on click', async () => {
    mockGetHistory.mockResolvedValueOnce({}).mockResolvedValueOnce({
      '2026-04-15': ['08:00', '12:00'],
    })
    mockSeed.mockResolvedValue(undefined)

    render(<PunchHistory showSeedButton />)
    fireEvent.click(screen.getByText('📋 Histórico (7 dias)'))
    const seedBtn = await screen.findByText('Gerar dados mock (7 dias)')
    await act(async () => {
      fireEvent.click(seedBtn)
    })
    expect(mockSeed).toHaveBeenCalled()
    await waitFor(() => expect(mockGetHistory).toHaveBeenCalledTimes(2))
  })
})
