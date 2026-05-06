import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ResyncButton } from '../../../lib/presentation/components/ResyncButton'

describe('ResyncButton', () => {
  beforeEach(() => {
    ;(globalThis.chrome as unknown) = {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) },
    }
  })

  it('manda FORCE_REDETECT pro background ao clicar', async () => {
    render(<ResyncButton />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'FORCE_REDETECT' })
    })
  })

  it('mostra "Sincronizando..." enquanto a chamada está em curso', async () => {
    render(<ResyncButton />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/Sincronizando/)).toBeInTheDocument()
  })

  it('chama onSyncDone após sucesso', async () => {
    const onSyncDone = vi.fn()
    render(<ResyncButton onSyncDone={onSyncDone} />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(onSyncDone).toHaveBeenCalled())
  })

  it('ignora cliques enquanto já está sincronizando', async () => {
    render(<ResyncButton />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1)
    })
  })

  it('não quebra quando sendMessage rejeita', async () => {
    ;(chrome.runtime.sendMessage as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('background offline'),
    )
    render(<ResyncButton />)
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument()
    })
  })
})
