import { describe, it, expect, vi } from 'vitest'
import { decodeJwtPayload, isValidJWT } from '../../lib/domain/jwt-utils'

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '')
  const body = btoa(JSON.stringify(payload)).replace(/=/g, '')
  return `${header}.${body}.signature`
}

describe('decodeJwtPayload', () => {
  it('decodifica JWT bem formado', () => {
    const jwt = makeJwt({ sub: 'user-1', exp: 1234567890 })
    const payload = decodeJwtPayload(jwt)
    expect(payload).toEqual({ sub: 'user-1', exp: 1234567890 })
  })

  it('retorna null pra token opaque (não-JWT)', () => {
    expect(decodeJwtPayload('fwdTz4x13iOICCOZSfkNfV8KuV0Eocvg')).toBeNull()
  })

  it('retorna null pra string vazia ou curta', () => {
    expect(decodeJwtPayload('')).toBeNull()
    expect(decodeJwtPayload('short')).toBeNull()
  })

  it('retorna null quando body não é JSON válido', () => {
    const badJwt = 'header.not-base64-json.sig'
    expect(decodeJwtPayload(badJwt)).toBeNull()
  })
})

describe('isValidJWT', () => {
  it('true quando exp está no futuro com buffer', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const futureExp = Math.floor(Date.now() / 1000) + 600 // +10min
    const jwt = makeJwt({ exp: futureExp })
    expect(isValidJWT(jwt)).toBe(true)
    vi.useRealTimers()
  })

  it('false quando exp está dentro do buffer (vai expirar em <30s)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const closeExp = Math.floor(Date.now() / 1000) + 10 // +10s
    const jwt = makeJwt({ exp: closeExp })
    expect(isValidJWT(jwt)).toBe(false)
    vi.useRealTimers()
  })

  it('false quando exp já passou', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const pastExp = Math.floor(Date.now() / 1000) - 100
    const jwt = makeJwt({ exp: pastExp })
    expect(isValidJWT(jwt)).toBe(false)
    vi.useRealTimers()
  })

  it('false quando token não tem exp', () => {
    const jwt = makeJwt({ sub: 'user' })
    expect(isValidJWT(jwt)).toBe(false)
  })

  it('false pra token opaque (não-JWT)', () => {
    expect(isValidJWT('fwdTz4x13iOICCOZSfkNfV8KuV0Eocvg')).toBe(false)
  })
})
