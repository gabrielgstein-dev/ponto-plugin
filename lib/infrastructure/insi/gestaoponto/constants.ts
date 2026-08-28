// Host atual do GestãoPonto. Em ago/2026 `gestaoponto.meta.com.br` passou a
// responder 301 cego para `gestaoponto.insi.com/gestaoponto-frontend/login`
// (descarta path e query) — o `?portal=g7` que faz o SSO via token Senior era
// perdido e a API virava HTML de login. Ver docs/roadmaps/roadmap-migracao-gp-insi.md.
export const GP_HOST = 'gestaoponto.insi.com';
// Host legado — mantido em host_permissions/matches só pra não gerar um segundo
// prompt de permissão ao remover; nenhum fetch deve usar ele.
export const GP_LEGACY_HOST = 'gestaoponto.meta.com.br';
export const GP_ORIGIN = `https://${GP_HOST}`;
export const GP_API_BASE = `${GP_ORIGIN}/gestaoponto-backend/api/`;
export const GP_FRONTEND_URL = `${GP_ORIGIN}/gestaoponto-frontend/?portal=g7&showMenu=S`;
// Tela de login local (usuário/senha) do GP. Não é o login usado (SSO é via
// Senior) — uma aba parada aqui nunca vai ter SeniorGPOSession.
export const GP_LOCAL_LOGIN_PATH = '/gestaoponto-frontend/login';
// Cache curto pra forçar revalidação periódica. Antes era 144h (6 dias),
// o que mantinha gpAssertion stale: se o servidor invalidasse a assertion
// antes do cache expirar, callGpAuthG7 entrava em loop de 401 sem nunca
// pegar uma nova. 2h equilibra performance (1 revalidação por turno) com
// resiliência (recupera de invalidação em janela razoável).
export const GP_CACHE_DURATION_MS = 2 * 3600000;
