import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const toggleSpy = vi.fn()
let mockIsDark = true

vi.mock('../../../lib/presentation/hooks/useThemeMode', () => ({
  useThemeMode: () => ({ isDark: mockIsDark, toggleTheme: toggleSpy }),
}))

import { ThemeToggle } from '../../../lib/presentation/components/ThemeToggle'

describe('ThemeToggle', () => {
  it('renders sun icon and dark tooltip when dark mode is on', () => {
    mockIsDark = true
    toggleSpy.mockClear()
    const { container } = render(<ThemeToggle />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('title', 'Mudar para tema claro')
    expect(container.querySelector('circle')).toBeInTheDocument()
    fireEvent.click(btn)
    expect(toggleSpy).toHaveBeenCalledTimes(1)
  })

  it('renders moon icon and light tooltip when not dark', () => {
    mockIsDark = false
    toggleSpy.mockClear()
    const { container } = render(<ThemeToggle />)
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Mudar para tema escuro')
    expect(container.querySelector('circle')).toBeNull()
    expect(container.querySelector('path')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    mockIsDark = true
    render(<ThemeToggle className="custom" />)
    expect(screen.getByRole('button').className).toContain('custom')
  })

  it('handles hover events updating color', () => {
    mockIsDark = true
    render(<ThemeToggle />)
    const btn = screen.getByRole('button')
    fireEvent.mouseEnter(btn)
    expect(btn.style.color).toBe('var(--text)')
    fireEvent.mouseLeave(btn)
    expect(btn.style.color).toBe('var(--text-dimmer)')
  })
})
