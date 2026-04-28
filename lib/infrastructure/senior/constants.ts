export const SENIOR_API_BASE = 'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest';

// Rede de segurança contra tokens absurdamente velhos no storage. A fonte
// real de verdade é a API: se o token estiver inválido antes desse prazo,
// o handler de 401 limpa o storage e cai na rotina de re-login.
export const SENIOR_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
