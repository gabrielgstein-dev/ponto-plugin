import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TokenStatus } from '../../../lib/presentation/components/TokenStatus'

describe('TokenStatus', () => {
  it('renders loading state', () => {
    render(<TokenStatus hasToken={false} loading />)
    expect(screen.getByText('Verificando token...')).toBeInTheDocument()
  })

  it('renders disconnected (hasAuth=false) state with link', () => {
    render(<TokenStatus hasToken={false} loading={false} hasAuth={false} />)
    expect(screen.getByText('Desconectado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Conecte-se ao Senior' })).toHaveAttribute(
      'href',
      'https://platform.senior.com.br',
    )
  })

  it('renders connected with statusText', () => {
    const { container } = render(
      <TokenStatus hasToken loading={false} statusText="Sincronizado" hasAuth />,
    )
    expect(container.querySelector('.token-status')).toHaveClass('connected')
    expect(screen.getByText('Conectado')).toBeInTheDocument()
    expect(screen.getByText('— Sincronizado')).toBeInTheDocument()
  })

  it('renders disconnected when hasAuth not false but hasToken is false', () => {
    const { container } = render(
      <TokenStatus hasToken={false} loading={false} hasAuth={null} />,
    )
    expect(container.querySelector('.token-status')).toHaveClass('disconnected')
    expect(screen.getByText('Sem token')).toBeInTheDocument()
  })

  it('does not render statusText when undefined', () => {
    const { container } = render(<TokenStatus hasToken loading={false} hasAuth />)
    expect(container.querySelector('.token-status-text')).toBeNull()
  })
})
