import { describe, it, expect } from 'vitest';
import { GP_API_BASE, GP_FRONTEND_URL, GP_HOST, GP_LEGACY_HOST } from '../../lib/infrastructure/insi/gestaoponto/constants';
import { isUsableGpTabUrl } from '../../lib/infrastructure/insi/gestaoponto/gp-tab-utils';

// Regressão da migração de domínio (ago/2026): o host antigo responde 301 cego
// pra /gestaoponto-frontend/login, engolindo path da API e o `?portal=g7`.
describe('GP constants — host insi.com', () => {
  it('API e frontend apontam pro host novo', () => {
    expect(new URL(GP_API_BASE).hostname).toBe(GP_HOST);
    expect(new URL(GP_FRONTEND_URL).hostname).toBe(GP_HOST);
    expect(GP_HOST).toBe('gestaoponto.insi.com');
  });

  it('nenhuma URL de fetch usa o host legado', () => {
    expect(GP_API_BASE).not.toContain(GP_LEGACY_HOST);
    expect(GP_FRONTEND_URL).not.toContain(GP_LEGACY_HOST);
  });

  it('frontend mantém ?portal=g7 (é o que faz o SSO via token Senior)', () => {
    const u = new URL(GP_FRONTEND_URL);
    expect(u.searchParams.get('portal')).toBe('g7');
    expect(u.searchParams.get('showMenu')).toBe('S');
  });
});

describe('isUsableGpTabUrl', () => {
  it('aceita frontend GP em qualquer host gestaoponto', () => {
    expect(isUsableGpTabUrl(GP_FRONTEND_URL)).toBe(true);
    expect(isUsableGpTabUrl('https://gestaoponto.insi.com/gestaoponto-frontend/#/marcacoes')).toBe(true);
  });
  it('rejeita aba parada no login local (nunca terá SeniorGPOSession)', () => {
    expect(isUsableGpTabUrl('https://gestaoponto.insi.com/gestaoponto-frontend/login')).toBe(false);
    expect(isUsableGpTabUrl('https://gestaoponto.insi.com/gestaoponto-frontend/login?x=1')).toBe(false);
  });
  it('rejeita URLs de outros sites e undefined', () => {
    expect(isUsableGpTabUrl('https://platform.senior.com.br/senior-x/')).toBe(false);
    expect(isUsableGpTabUrl(undefined)).toBe(false);
  });
});
