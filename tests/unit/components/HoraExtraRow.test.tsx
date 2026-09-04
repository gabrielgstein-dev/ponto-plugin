import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { HoraExtraRow } from '../../../lib/presentation/components/HoraExtraRow'
import { HORA_EXTRA_MAX, HORA_EXTRA_MIN, HORA_EXTRA_STEP } from '../../../lib/domain/hora-extra'

const mais = () => screen.getByLabelText(`Aumentar ${HORA_EXTRA_STEP} minutos`)
const menos = () => screen.getByLabelText(`Diminuir ${HORA_EXTRA_STEP} minutos`)
const valor = () => screen.getByTestId('hora-extra-value')

describe('HoraExtraRow', () => {
  it('sem extra mostra "sem extra" e esconde o botão de zerar', () => {
    render(<HoraExtraRow minutes={0} onChange={() => {}} estimatedExit={null} />)
    expect(valor()).toHaveTextContent('sem extra')
    expect(valor().className).toContain('zero')
    expect(screen.queryByLabelText('Remover hora extra de hoje')).toBeNull()
  })

  it('valor ausente é tratado como zero', () => {
    render(<HoraExtraRow minutes={null} onChange={() => {}} estimatedExit={null} />)
    expect(valor()).toHaveTextContent('sem extra')
  })

  it('valor undefined é tratado como zero', () => {
    render(<HoraExtraRow minutes={undefined} onChange={() => {}} estimatedExit={null} />)
    expect(valor()).toHaveTextContent('sem extra')
  })

  it('mostra o delta formatado e o botão de zerar', () => {
    render(<HoraExtraRow minutes={90} onChange={() => {}} estimatedExit={null} />)
    expect(valor()).toHaveTextContent('+1h30')
    expect(valor().className).not.toContain('zero')
    expect(screen.getByLabelText('Remover hora extra de hoje')).toBeInTheDocument()
  })

  it('+ soma um passo', () => {
    const onChange = vi.fn()
    render(<HoraExtraRow minutes={60} onChange={onChange} estimatedExit={null} />)
    fireEvent.click(mais())
    expect(onChange).toHaveBeenCalledWith(60 + HORA_EXTRA_STEP)
  })

  it('− subtrai um passo', () => {
    const onChange = vi.fn()
    render(<HoraExtraRow minutes={60} onChange={onChange} estimatedExit={null} />)
    fireEvent.click(menos())
    expect(onChange).toHaveBeenCalledWith(60 - HORA_EXTRA_STEP)
  })

  it('zerar emite 0', () => {
    const onChange = vi.fn()
    render(<HoraExtraRow minutes={60} onChange={onChange} estimatedExit={null} />)
    fireEvent.click(screen.getByLabelText('Remover hora extra de hoje'))
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('no teto o + fica desabilitado (limite legal de 2h/dia)', () => {
    render(<HoraExtraRow minutes={HORA_EXTRA_MAX} onChange={() => {}} estimatedExit={null} />)
    expect(mais()).toBeDisabled()
    expect(menos()).not.toBeDisabled()
  })

  it('no piso o − fica desabilitado', () => {
    render(<HoraExtraRow minutes={HORA_EXTRA_MIN} onChange={() => {}} estimatedExit={null} />)
    expect(menos()).toBeDisabled()
    expect(mais()).not.toBeDisabled()
  })

  it('sem saída estimada não mostra a dica', () => {
    render(<HoraExtraRow minutes={60} onChange={() => {}} estimatedExit={null} />)
    expect(screen.queryByText(/Saída/)).toBeNull()
  })

  it('com extra a dica fala em saída ajustada', () => {
    render(<HoraExtraRow minutes={60} onChange={() => {}} estimatedExit="18:00" />)
    expect(screen.getByText(/Saída ajustada para/)).toBeInTheDocument()
    expect(screen.getByText('18:00')).toBeInTheDocument()
  })

  it('sem extra a dica fala em saída prevista', () => {
    render(<HoraExtraRow minutes={0} onChange={() => {}} estimatedExit="17:00" />)
    expect(screen.getByText(/Saída prevista para/)).toBeInTheDocument()
  })
})
