export const GP_API_BASE = 'https://gestaoponto.meta.com.br/gestaoponto-backend/api/';
export const GP_FRONTEND_URL = 'https://gestaoponto.meta.com.br/gestaoponto-frontend/?portal=g7&showMenu=S';
// Cache curto pra forçar revalidação periódica. Antes era 144h (6 dias),
// o que mantinha gpAssertion stale: se o servidor invalidasse a assertion
// antes do cache expirar, callGpAuthG7 entrava em loop de 401 sem nunca
// pegar uma nova. 2h equilibra performance (1 revalidação por turno) com
// resiliência (recupera de invalidação em janela razoável).
export const GP_CACHE_DURATION_MS = 2 * 3600000;
