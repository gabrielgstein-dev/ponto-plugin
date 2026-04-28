import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../lib/presentation/components/ThemeToggle', () => ({
  ThemeToggle: () => <button data-testid="theme-toggle-mock">toggle</button>,
}))

vi.mock('../../../lib/domain/build-flags', () => ({
  APP_NAME: 'Ponto Test',
  ENABLE_SENIOR_INTEGRATION: false,
  ENABLE_SENIOR_PUNCH_BUTTON: false,
  ENABLE_MANUAL_PUNCH: true,
  ENABLE_NOTIFICATIONS: false,
  ENABLE_META_TIMESHEET: false,
  ENABLE_YESTERDAY: false,
  ENABLE_WIDGET: false,
  DEBUG: false,
  ACTIVE_COMPANY: 'manual',
  THEME: 'dark',
}))

import { LiveClock } from '../../../lib/presentation/components/LiveClock'

describe('LiveClock', () => {
  it('renders APP_NAME, time, date and theme toggle', () => {
    render(<LiveClock time="08:00:00" date="Segunda, 1 jan" />)
    expect(screen.getByRole('heading', { name: 'Ponto Test' })).toBeInTheDocument()
    expect(screen.getByText('08:00:00')).toBeInTheDocument()
    expect(screen.getByText('Segunda, 1 jan')).toBeInTheDocument()
    expect(screen.getByTestId('theme-toggle-mock')).toBeInTheDocument()
  })
})
