/**
 * DevTools Snippet — Captura da cadeia SSO do Senior / Keycloak
 *
 * COMO USAR:
 * 1. Abra: https://platform.senior.com.br  (já logado — é AQUI que fica o com.senior.token)
 *    NÃO rode em plataforma.meta.com.br — o cookie não é visível de lá (cross-domain)
 * 2. Abra o DevTools NESSA ABA (F12) e cole este script no Console
 * 3. Pressione Enter — o script dumpa o cookie imediatamente
 * 4. Recarregue (F5) para capturar o fluxo de refresh do token
 * 5. Após carregar, rode: __seniorSsoExport()
 *
 * O que queremos descobrir:
 *   - Estrutura completa do cookie com.senior.token (tem refresh_token?)
 *   - Endpoint de refresh do Keycloak e os parâmetros client_id / grant_type
 *   - TTL real do access_token (campo exp no JWT)
 */

(function () {
  'use strict';

  const TAG = '[SENIOR-SSO]';
  const captured = [];
  let idx = 0;

  // ─── Filtros ────────────────────────────────────────────────────────────────

  const URL_KEYWORDS = [
    'auth', 'token', 'sso', 'login', 'senior', 'session',
    'oauth', 'connect', 'callback', 'jwt', 'signin', 'authorize',
    'openid', 'refresh', 'iamp', 'keycloak', 'realms',
  ];
  const BODY_KEYWORDS = [
    'token', 'bearer', 'access_token', 'refresh_token', 'id_token',
    'grant_type', 'client_id', 'assertion', 'credential',
  ];
  const ALWAYS_CAPTURE_HOSTS = [
    'plataforma.meta.com.br',
    'sso.senior.com.br',
    'iamp.meta.com.br',
    'platform.senior.com.br',
  ];

  function shouldCapture(url, reqBody, resBody) {
    try {
      const host = new URL(url).hostname;
      if (ALWAYS_CAPTURE_HOSTS.some(h => host.includes(h))) return true;
    } catch (_) {}
    const lower = url.toLowerCase();
    if (URL_KEYWORDS.some(k => lower.includes(k))) return true;
    if (reqBody && BODY_KEYWORDS.some(k => reqBody.toLowerCase().includes(k))) return true;
    if (resBody && BODY_KEYWORDS.some(k => resBody.toLowerCase().includes(k))) return true;
    return false;
  }

  // ─── Decode JWT ─────────────────────────────────────────────────────────────

  function decodeJwt(token) {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp) {
        payload._expDate = new Date(payload.exp * 1000).toISOString();
        payload._expiresInSec = payload.exp - Math.floor(Date.now() / 1000);
        payload._expiresInMin = Math.round(payload._expiresInSec / 60);
      }
      return payload;
    } catch (_) { return null; }
  }

  // ─── Decode com.senior.token cookie ─────────────────────────────────────────

  function decodeSeniorCookie() {
    const cookies = document.cookie.split(';').map(c => c.trim());
    const raw = cookies.find(c => c.startsWith('com.senior.token='));
    if (!raw) {
      console.warn(`${TAG} Cookie com.senior.token NÃO encontrado nesta página.`);
      console.warn(`${TAG} ATENÇÃO: Este script deve ser rodado em platform.senior.com.br`);
      console.warn(`${TAG} Página atual: ${location.hostname} — tente: https://platform.senior.com.br`);
      return null;
    }
    try {
      const value = decodeURIComponent(raw.split('=').slice(1).join('='));
      const obj = JSON.parse(value);
      const result = { raw: obj };

      // Encontra o access_token em qualquer profundidade
      function findToken(o, depth = 0) {
        if (depth > 3 || !o || typeof o !== 'object') return;
        if (o.access_token) {
          result.access_token = o.access_token;
          result.access_token_jwt = decodeJwt(o.access_token);
        }
        if (o.refresh_token) {
          result.refresh_token = o.refresh_token;
          result.refresh_token_jwt = decodeJwt(o.refresh_token);
        }
        if (o.id_token) result.id_token_jwt = decodeJwt(o.id_token);
        if (o.expires_in) result.expires_in = o.expires_in;
        if (o.scope) result.scope = o.scope;
        if (typeof o.jsonToken === 'string') {
          try { findToken(JSON.parse(o.jsonToken), depth + 1); } catch (_) {}
        } else if (typeof o.jsonToken === 'object') {
          findToken(o.jsonToken, depth + 1);
        }
        for (const v of Object.values(o)) {
          if (typeof v === 'object' && v !== null) findToken(v, depth + 1);
        }
      }
      findToken(obj);
      return result;
    } catch (e) {
      console.error(`${TAG} Erro ao decodificar cookie:`, e.message);
      return null;
    }
  }

  // ─── Formatação ─────────────────────────────────────────────────────────────

  function toCurl({ method, url, requestHeaders, requestBody }) {
    const lines = [`curl -X ${method} '${url}'`];
    for (const [k, v] of Object.entries(requestHeaders || {})) {
      if (['content-length', 'connection'].includes(k.toLowerCase())) continue;
      lines.push(`  -H '${k}: ${v}'`);
    }
    if (requestBody && requestBody !== '(empty)') {
      lines.push(`  --data '${requestBody.replace(/'/g, "'\\''")}'`);
    }
    return lines.join(' \\\n');
  }

  function tryParseJson(text) {
    try { return JSON.parse(text); } catch { return text; }
  }

  function log(entry) {
    const label = `%c${TAG} [${entry.idx}] ${entry.method} ${entry.url.slice(0, 90)}`;
    console.groupCollapsed(label, 'color:#ff9800;font-weight:bold');
    console.log('URL:', entry.url);
    console.log('Status:', entry.status);
    console.log('Request Headers:', entry.requestHeaders);
    if (entry.requestBody !== '(empty)') {
      console.log('Request Body:');
      console.log(tryParseJson(entry.requestBody));
    }
    if (entry.responseBody) {
      console.log('Response Body:');
      console.log(tryParseJson(entry.responseBody));
    }
    console.log('cURL:\n' + toCurl(entry));
    console.groupEnd();
  }

  function record(entry) {
    captured.push(entry);
    log(entry);
  }

  // ─── Intercept fetch ────────────────────────────────────────────────────────

  const _fetch = window.fetch;

  window.fetch = async function (input, init = {}) {
    const url = (typeof input === 'string') ? input
      : (input instanceof URL) ? input.toString()
      : input.url;
    const method = (init.method || 'GET').toUpperCase();

    const reqHeaders = {};
    if (init.headers) {
      const h = new Headers(init.headers);
      h.forEach((v, k) => { reqHeaders[k] = v; });
    }

    let reqBody = '(empty)';
    if (init.body) {
      if (typeof init.body === 'string') reqBody = init.body;
      else if (init.body instanceof URLSearchParams) reqBody = init.body.toString();
      else reqBody = '(binary/FormData)';
    }

    let response;
    try {
      response = await _fetch.apply(this, [input, init]);
    } catch (err) {
      if (shouldCapture(url, reqBody, null)) {
        record({ idx: ++idx, source: 'fetch', method, url, status: 0, requestHeaders: reqHeaders, requestBody: reqBody, responseBody: `(network error: ${err.message})` });
      }
      throw err;
    }

    const clone = response.clone();
    let resBody = null;
    try { resBody = await clone.text(); } catch (_) {}

    if (shouldCapture(url, reqBody, resBody)) {
      record({ idx: ++idx, source: 'fetch', method, url, status: response.status, requestHeaders: reqHeaders, requestBody: reqBody, responseBody: resBody });
    }

    return response;
  };

  // ─── Intercept XHR ──────────────────────────────────────────────────────────

  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  const _setHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._m = method.toUpperCase();
    this._u = url;
    this._h = {};
    return _open.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (this._h) this._h[k] = v;
    return _setHeader.apply(this, [k, v]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this._u || '';
    const method = this._m || 'GET';
    const reqHeaders = this._h || {};
    const reqBody = (typeof body === 'string' && body) ? body : '(empty)';

    this.addEventListener('loadend', () => {
      const resBody = this.responseText || '';
      if (shouldCapture(url, reqBody, resBody)) {
        record({ idx: ++idx, source: 'xhr', method, url, status: this.status, requestHeaders: reqHeaders, requestBody: reqBody, responseBody: resBody });
      }
    });

    return _send.apply(this, [body]);
  };

  // ─── Dump de storage ────────────────────────────────────────────────────────

  function dumpStorage() {
    const TOKEN_HINTS = ['token', 'jwt', 'auth', 'bearer', 'session', 'access', 'senior', 'meta', 'refresh'];

    function scanStorage(storage, label) {
      const result = {};
      try {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (TOKEN_HINTS.some(h => key.toLowerCase().includes(h))) {
            try { result[key] = JSON.parse(storage.getItem(key)); }
            catch { result[key] = storage.getItem(key); }
          }
        }
      } catch (e) {
        result['_error'] = e.message;
      }
      if (Object.keys(result).length > 0) {
        console.group(`%c${TAG} ${label}`, 'color:#76ff03;font-weight:bold');
        console.log(result);
        console.groupEnd();
      }
      return result;
    }

    return {
      localStorage: scanStorage(localStorage, 'localStorage'),
      sessionStorage: scanStorage(sessionStorage, 'sessionStorage'),
    };
  }

  // ─── Export ─────────────────────────────────────────────────────────────────

  window.__seniorSsoExport = function () {
    console.log(`%c${TAG} === DECODIFICANDO com.senior.token ===`, 'color:#ff9800;font-weight:bold;font-size:14px');
    const cookie = decodeSeniorCookie();
    if (cookie) {
      if (cookie.access_token_jwt) {
        const j = cookie.access_token_jwt;
        console.log(`%c${TAG} access_token expira em: ${j._expDate} (${j._expiresInMin} min)`, 'color:#76ff03;font-weight:bold');
      }
      if (cookie.refresh_token) {
        console.log(`%c${TAG} ✅ refresh_token ENCONTRADO!`, 'color:#76ff03;font-weight:bold;font-size:13px');
        if (cookie.refresh_token_jwt) {
          const r = cookie.refresh_token_jwt;
          console.log(`%c${TAG} refresh_token expira em: ${r._expDate} (${r._expiresInMin} min)`, 'color:#76ff03');
        }
      } else {
        console.log(`%c${TAG} ⚠️ refresh_token NÃO encontrado no cookie`, 'color:#ff5722;font-weight:bold');
      }
      console.log(`%c${TAG} Estrutura do cookie:`, 'color:#ff9800');
      console.log(cookie);
    }

    console.log(`%c${TAG} === STORAGE ===`, 'color:#ff9800;font-weight:bold;font-size:13px');
    const storage = dumpStorage();

    const out = {
      timestamp: new Date().toISOString(),
      pageUrl: location.href,
      cookie,
      storage,
      requests: captured.map(e => ({
        ...e,
        responseBodyParsed: tryParseJson(e.responseBody),
        curl: toCurl(e),
      })),
    };

    const json = JSON.stringify(out, null, 2);
    console.log(`%c${TAG} === EXPORT: ${captured.length} requests ===`, 'color:#ff9800;font-weight:bold;font-size:13px');
    console.log(json);

    try {
      navigator.clipboard.writeText(json);
      console.log(`%c${TAG} Copiado para o clipboard!`, 'color:#76ff03');
    } catch (_) {
      console.log(`%c${TAG} Cole o JSON acima manualmente.`, 'color:orange');
    }

    return out;
  };

  // Dump imediato ao rodar
  console.log(`%c${TAG} Script ativo em: ${location.href}`, 'color:#ff9800;font-weight:bold;font-size:14px');
  if (!location.hostname.includes('senior.com.br')) {
    console.warn(`%c${TAG} ⚠️  Você está em ${location.hostname} — o com.senior.token NÃO está aqui!`, 'color:#ff5722;font-weight:bold;font-size:13px');
    console.warn(`%c${TAG} ➜  Rode este script em: https://platform.senior.com.br`, 'color:#ff5722;font-size:13px');
  }
  console.log(`%c${TAG} Recarregue a página (F5) para capturar o fluxo de refresh`, 'color:#ff9800;font-size:13px');
  console.log(`%c${TAG} Após carregar, rode: __seniorSsoExport()`, 'color:#ff9800;font-size:13px');

  // Dump imediato do cookie atual
  console.log(`%c${TAG} === COOKIE ATUAL (antes do reload): ===`, 'color:#ffd600;font-weight:bold');
  const currentCookie = decodeSeniorCookie();
  if (currentCookie) {
    if (currentCookie.access_token_jwt) {
      const j = currentCookie.access_token_jwt;
      console.log(`access_token expira em ${j._expDate} (${j._expiresInMin} min restantes)`);
    }
    if (currentCookie.refresh_token) {
      console.log('%c✅ refresh_token presente!', 'color:#76ff03;font-weight:bold');
      if (currentCookie.refresh_token_jwt) {
        const r = currentCookie.refresh_token_jwt;
        console.log(`refresh_token expira em ${r._expDate} (${r._expiresInMin} min restantes)`);
      }
    } else {
      console.log('%c⚠️ Sem refresh_token no cookie', 'color:#ff5722');
    }
    console.log(currentCookie);
  }
})();
