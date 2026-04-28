import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusBanner } from '../../../lib/presentation/components/StatusBanner'

describe('StatusBanner', () => {
  it.each(['info', 'success', 'warning'] as const)('renders %s type with text', (type) => {
    const { container } = render(<StatusBanner text={`msg-${type}`} type={type} />)
    expect(screen.getByText(`msg-${type}`)).toBeInTheDocument()
    expect(container.querySelector('.status-banner')).toHaveClass(type)
  })
})
