import { describe, it, expect } from 'vitest'
import { COMPANY_LOGIN_URL, SENIOR_TENANT } from '../../lib/infrastructure/meta/providers'

// A tela certa é o login Senior com tenant (branding Insi), não o login
// genérico da Senior nem o login local do GestãoPonto.
describe('COMPANY_LOGIN_URL', () => {
  it('aponta pro login Senior com tenant meta.com.br e volta pro senior-x', () => {
    const u = new URL(COMPANY_LOGIN_URL)
    expect(u.origin + u.pathname).toBe('https://platform.senior.com.br/login/')
    expect(u.searchParams.get('tenant')).toBe(SENIOR_TENANT)
    expect(u.searchParams.get('redirectTo')).toBe('https://platform.senior.com.br/senior-x/')
  })
  it('nunca é o login local do GestãoPonto', () => {
    expect(COMPANY_LOGIN_URL).not.toContain('gestaoponto')
  })
})
