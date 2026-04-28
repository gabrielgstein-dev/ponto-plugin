import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PunchCard } from '../../../lib/presentation/components/PunchCard'

describe('PunchCard', () => {
  const baseProps = {
    label: 'Entrada',
    icon: '🌅',
    time: '08:00',
    subtitle: '',
    isCalc: false,
    isPast: false,
    isNext: false,
  }

  it('renders label, icon and time', () => {
    const { container } = render(<PunchCard {...baseProps} />)
    expect(screen.getByText('Entrada')).toBeInTheDocument()
    expect(screen.getByText('🌅')).toBeInTheDocument()
    expect(screen.getByText('08:00')).toBeInTheDocument()
    expect(container.querySelector('.card-time')).not.toHaveClass('calc')
    expect(container.querySelector('.card-time')).not.toHaveClass('past')
    expect(container.querySelector('.card-time')).not.toHaveClass('next')
  })

  it('renders placeholder when time is null', () => {
    render(<PunchCard {...baseProps} time={null} />)
    expect(screen.getByText('--:--')).toBeInTheDocument()
  })

  it('applies calc modifier when isCalc is true', () => {
    const { container } = render(<PunchCard {...baseProps} isCalc isPast isNext />)
    expect(container.querySelector('.card-time')).toHaveClass('calc')
    expect(container.querySelector('.card-time')).not.toHaveClass('past')
    expect(container.querySelector('.card-time')).not.toHaveClass('next')
  })

  it('applies past modifier and done class when isPast is true', () => {
    const { container } = render(<PunchCard {...baseProps} isPast />)
    expect(container.querySelector('.card-time')).toHaveClass('past')
    expect(container.querySelector('.punch-card')).toHaveClass('done')
  })

  it('applies next modifier when isNext is true and other flags false', () => {
    const { container } = render(<PunchCard {...baseProps} isNext />)
    expect(container.querySelector('.card-time')).toHaveClass('next')
    expect(container.querySelector('.punch-card')).not.toHaveClass('done')
  })

  it('renders subtitle when provided', () => {
    render(<PunchCard {...baseProps} subtitle="estimado" />)
    expect(screen.getByText('estimado')).toBeInTheDocument()
  })
})
