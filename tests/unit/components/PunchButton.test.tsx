import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PunchButton } from '../../../lib/presentation/components/PunchButton'

describe('PunchButton', () => {
  it('renders idle state with label and triggers onClick', async () => {
    const onClick = vi.fn()
    render(<PunchButton onClick={onClick} loading={false} disabled={false} />)
    const btn = screen.getByRole('button', { name: 'Bater Ponto' })
    expect(btn).toBeEnabled()
    await userEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders spinner and is disabled when loading', () => {
    const { container } = render(<PunchButton onClick={() => {}} loading disabled={false} />)
    expect(container.querySelector('.spinner')).toBeInTheDocument()
    expect(container.querySelector('button')).toBeDisabled()
  })

  it('is disabled when disabled prop is true', () => {
    render(<PunchButton onClick={() => {}} loading={false} disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
