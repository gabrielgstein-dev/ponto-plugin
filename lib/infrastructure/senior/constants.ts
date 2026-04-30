export const SENIOR_API_BASE = 'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest';

// Senior bearer tokens têm expires_in=604800 (7 dias). Usamos 6 dias e meio
// como janela de segurança — isso garante que o refresh_token seja tentado
// antes do token expirar completamente.
export const SENIOR_TOKEN_MAX_AGE_MS = 6.5 * 24 * 60 * 60 * 1000;
