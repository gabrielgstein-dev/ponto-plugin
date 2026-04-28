import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { Toast } from '../../../lib/presentation/components/Toast'

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null when message is null', () => {
    const { container } = render(<Toast message={null} onDismiss={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the message and calls onDismiss after 3s', () => {
    const onDismiss = vi.fn()
    render(<Toast message="hello" onDismiss={onDismiss} />)
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('clears the timer on unmount', () => {
    const onDismiss = vi.fn()
    const { unmount } = render(<Toast message="hello" onDismiss={onDismiss} />)
    unmount()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('clears timer when message becomes null', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(<Toast message="hello" onDismiss={onDismiss} />)
    rerender(<Toast message={null} onDismiss={onDismiss} />)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
