import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextAction } from '../../../lib/presentation/components/NextAction'

describe('NextAction', () => {
  it('renders label and countdown when visible', () => {
    render(<NextAction label="Almoço" countdown="00:30:00" visible />)
    expect(screen.getByText('Almoço')).toBeInTheDocument()
    expect(screen.getByText('00:30:00')).toBeInTheDocument()
  })

  it('returns null when not visible', () => {
    const { container } = render(<NextAction label="Almoço" countdown="00:30:00" visible={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
