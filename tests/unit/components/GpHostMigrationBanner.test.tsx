import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { GpHostMigrationBanner } from '../../../lib/presentation/components/GpHostMigrationBanner'
import { mockStorageGet, mockPermissionsContains, mockPermissionsRequest } from '../../setup/chrome-mock'

describe('GpHostMigrationBanner', () => {
  it('não renderiza quando não há migração pendente', async () => {
    mockStorageGet.mockResolvedValue({})
    const { container } = render(<GpHostMigrationBanner />)
    await waitFor(() => expect(mockStorageGet).toHaveBeenCalled())
    expect(container.querySelector('.gp-migration-banner')).toBeNull()
  })

  it('não renderiza quando pendente mas permissão já concedida', async () => {
    mockStorageGet.mockResolvedValue({ pendingGpHostMigration: true })
    mockPermissionsContains.mockResolvedValue(true)
    const { container } = render(<GpHostMigrationBanner />)
    await waitFor(() => expect(mockPermissionsContains).toHaveBeenCalled())
    expect(container.querySelector('.gp-migration-banner')).toBeNull()
  })

  it('renderiza e some após Ativar conceder a permissão', async () => {
    mockStorageGet.mockResolvedValue({ pendingGpHostMigration: true })
    mockPermissionsContains.mockResolvedValue(false)
    mockPermissionsRequest.mockResolvedValue(true)
    render(<GpHostMigrationBanner />)
    const btn = await screen.findByTestId('gp-migration-activate')
    expect(screen.getByText(/gestaoponto\.insi\.com/)).toBeInTheDocument()
    fireEvent.click(btn)
    await waitFor(() => expect(mockPermissionsRequest).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByTestId('gp-migration-banner')).toBeNull())
  })

  it('permanece visível se o usuário negar', async () => {
    mockStorageGet.mockResolvedValue({ pendingGpHostMigration: true })
    mockPermissionsContains.mockResolvedValue(false)
    mockPermissionsRequest.mockResolvedValue(false)
    render(<GpHostMigrationBanner />)
    fireEvent.click(await screen.findByTestId('gp-migration-activate'))
    await waitFor(() => expect(mockPermissionsRequest).toHaveBeenCalled())
    expect(screen.getByTestId('gp-migration-banner')).toBeInTheDocument()
  })
})
