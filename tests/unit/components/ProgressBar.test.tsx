import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProgressBar } from '../../../lib/presentation/components/ProgressBar'

describe('ProgressBar', () => {
  it('renders progress label/percentage when below total', () => {
    const { container } = render(<ProgressBar workedMinutes={120} totalMinutes={480} />)
    expect(screen.getByText('Jornada')).toBeInTheDocument()
    expect(screen.getByText('2h00 / 8h')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(container.querySelector('.progress-fill')).toHaveStyle({ width: '25%' })
    expect(container.querySelector('.overtime-section')).toBeNull()
  })

  it('shows overtime section when worked exceeds total', () => {
    render(<ProgressBar workedMinutes={540} totalMinutes={480} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('Hora Extra')).toBeInTheDocument()
    expect(screen.getByText('+1h00')).toBeInTheDocument()
  })

  it('hides overtime when showOvertime is false even if exceeded', () => {
    const { container } = render(
      <ProgressBar workedMinutes={540} totalMinutes={480} showOvertime={false} />,
    )
    expect(container.querySelector('.overtime-section')).toBeNull()
  })

  it('caps percentage at 100', () => {
    render(<ProgressBar workedMinutes={1000} totalMinutes={480} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})
