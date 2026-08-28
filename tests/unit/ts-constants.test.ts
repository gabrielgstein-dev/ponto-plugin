import { describe, it, expect } from 'vitest'
import { META_TIMESHEET_CONFIG, META_TS_API_HOST, META_TS_PLATFORM_HOST, META_TS_LEGACY_HOSTS } from '../../lib/infrastructure/insi/timesheet/constants'

// Migração de domínio (ago/2026): plataforma.meta.com.br → 301 cego pra
// plataforma.insi.com (perde o callbackUrl); a SPA nova chama api.insi.com.
describe('META_TIMESHEET_CONFIG — hosts insi.com', () => {
  it('API e plataforma apontam pros hosts novos', () => {
    expect(new URL(META_TIMESHEET_CONFIG.apiUrl).hostname).toBe(META_TS_API_HOST)
    expect(new URL(META_TIMESHEET_CONFIG.platformUrl).hostname).toBe(META_TS_PLATFORM_HOST)
    expect(META_TS_API_HOST).toBe('api.insi.com')
    expect(META_TS_PLATFORM_HOST).toBe('plataforma.insi.com')
  })
  it('bootstrap mantém o callbackUrl do timesheet no host novo', () => {
    const u = new URL(META_TIMESHEET_CONFIG.bootstrapUrl)
    expect(u.hostname).toBe(META_TS_PLATFORM_HOST)
    expect(u.searchParams.get('callbackUrl')).toBe('/modules/timesheet/create')
  })
  it('nenhuma URL usa host legado', () => {
    for (const h of META_TS_LEGACY_HOSTS) {
      expect(META_TIMESHEET_CONFIG.apiUrl).not.toContain(h)
      expect(META_TIMESHEET_CONFIG.platformUrl).not.toContain(h)
      expect(META_TIMESHEET_CONFIG.bootstrapUrl).not.toContain(h)
    }
  })
})
