/**
 * SeniorTokenStorageAuth — o elo que faltava entre detecção e batida.
 *
 * Regressão de 2026-07-21: `seniorToken` estava fresco no storage (age=10m) e
 * servindo a detecção o dia inteiro, enquanto a batida das 09:43 morria com
 * "Nenhum token encontrado" — a cadeia de auth da batida simplesmente não olhava
 * para essa chave.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { SeniorTokenStorageAuth } from '../../lib/infrastructure/senior/senior-token-storage-auth'
import { SENIOR_TOKEN_MAX_AGE_MS } from '../../lib/infrastructure/senior/constants'
import { mockStorageGet } from '../setup/chrome-mock'

let auth: SeniorTokenStorageAuth

beforeEach(() => {
  auth = new SeniorTokenStorageAuth()
})

describe('SeniorTokenStorageAuth', () => {
  it('storage vazio → null', async () => {
    mockStorageGet.mockResolvedValue({})
    expect(await auth.getAccessToken()).toBeNull()
  })

  it('token fresco → devolve o token (o caso que falhava em 09:43)', async () => {
    mockStorageGet.mockResolvedValue({
      seniorToken: 'LFOeYSvN-token',
      seniorTokenTs: Date.now() - 10 * 60 * 1000,
    })
    expect(await auth.getAccessToken()).toBe('LFOeYSvN-token')
  })

  it('token mais velho que a janela de 6,5d → null', async () => {
    mockStorageGet.mockResolvedValue({
      seniorToken: 'velho',
      seniorTokenTs: Date.now() - SENIOR_TOKEN_MAX_AGE_MS - 1000,
    })
    expect(await auth.getAccessToken()).toBeNull()
  })

  it('token sem timestamp → null (não dá pra saber a idade)', async () => {
    mockStorageGet.mockResolvedValue({ seniorToken: 'sem-ts' })
    expect(await auth.getAccessToken()).toBeNull()
  })

  it('ts=0 (sentinela de "nunca capturado") → null', async () => {
    mockStorageGet.mockResolvedValue({ seniorToken: 'tok', seniorTokenTs: 0 })
    expect(await auth.getAccessToken()).toBeNull()
  })
})
