/**
 * DevTools Snippet — Captura da cadeia SSO da plataforma Meta
 *
 * COMO USAR:
 * 1. Abra uma aba e vá para: https://plataforma.meta.com.br
 *    (pode estar na tela de login ou já logado, tanto faz)
 * 2. Abra o DevTools NESSA ABA e cole este script no Console
 * 3. Pressione Enter — o script ficará ativo
 * 4. Recarregue a aba (F5) para capturar o fluxo de auth do zero
 *    OU se estiver na tela de login, faça o login normalmente
 * 5. Após a plataforma carregar completamente, rode: __metaSsoExport()
 *
 * IMPORTANTE: mantenha o DevTools aberto durante todo o processo.
 * NÃO rode na página do Senior (platform.senior.com.br) — rode em plataforma.meta.com.br
 */

(function () {
  'use strict';

  const TAG = '[META-SSO]';
  const captured = [];
  let idx = 0;

  // ─── Filtros ────────────────────────────────────────────────────────────────

  const URL_KEYWORDS = [
    'auth', 'token', 'sso', 'login', 'senior', 'session',
    'oauth', 'connect', 'callback', 'jwt', 'signin', 'authorize',
    'identity', 'openid', 'saml', 'assertion', 'credential',
  ];
  const BODY_KEYWORDS = [
    'token', 'bearer', 'jwt', 'access_token', 'id_token',
    'authorization', 'assertion', 'credential', 'refresh_token',
  ];

  // Captura TODOS os requests para api.meta.com.br (onde o Bearer é usado)
  const ALWAYS_CAPTURE_HOSTS = ['api.meta.com.br', 'plataforma.meta.com.br'];

  function shouldCapture(url, reqBody, resBody) {
    try {
      const host = new URL(url).hostname;
      if (ALWAYS_CAPTURE_HOSTS.includes(host)) return true;
    } catch (_) {}
    const lower = url.toLowerCase();
    if (URL_KEYWORDS.some(k => lower.includes(k))) return true;
    if (reqBody && BODY_KEYWORDS.some(k => reqBody.toLowerCase().includes(k))) return true;
    if (resBody && BODY_KEYWORDS.some(k => resBody.toLowerCase().includes(k))) return true;
    return false;
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
    console.groupCollapsed(label, 'color:#00e5ff;font-weight:bold');
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

  // ─── Dump de storage (tokens que o SPA guarda localmente) ───────────────────

  function dumpStorage() {
    const TOKEN_HINTS = ['token', 'jwt', 'auth', 'bearer', 'session', 'credential', 'access', 'senior', 'meta'];

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

    const ls = scanStorage(localStorage, 'localStorage (chaves com token/auth/session)');
    const ss = scanStorage(sessionStorage, 'sessionStorage (chaves com token/auth/session)');
    return { localStorage: ls, sessionStorage: ss };
  }

  // ─── Dump de cookies ────────────────────────────────────────────────────────

  function dumpCookies() {
    const TOKEN_HINTS = ['token', 'jwt', 'auth', 'session', 'senior', 'meta'];
    const relevant = document.cookie.split(';')
      .map(c => c.trim())
      .filter(c => TOKEN_HINTS.some(h => c.toLowerCase().includes(h)));

    if (relevant.length > 0) {
      console.group(`%c${TAG} Cookies relevantes`, 'color:#76ff03;font-weight:bold');
      relevant.forEach(c => console.log(c));
      console.groupEnd();
    }
    return relevant;
  }

  // ─── Export ─────────────────────────────────────────────────────────────────

  window.__metaSsoExport = function () {
    console.log(`%c${TAG} === DUMP DE STORAGE (antes das requests) ===`, 'color:#76ff03;font-weight:bold;font-size:13px');
    const storage = dumpStorage();
    const cookies = dumpCookies();

    const out = {
      timestamp: new Date().toISOString(),
      pageUrl: location.href,
      storage,
      cookies,
      requests: captured.map(e => ({
        ...e,
        responseBodyParsed: tryParseJson(e.responseBody),
        curl: toCurl(e),
      })),
    };

    const json = JSON.stringify(out, null, 2);
    console.log(`%c${TAG} === EXPORT: ${captured.length} requests ===`, 'color:#76ff03;font-weight:bold;font-size:13px');
    console.log(json);

    try {
      navigator.clipboard.writeText(json);
      console.log(`%c${TAG} Copiado para o clipboard!`, 'color:#76ff03');
    } catch (_) {
      console.log(`%c${TAG} Cole o JSON acima manualmente.`, 'color:orange');
    }

    return out;
  };

  // Dump imediato de storage ao rodar o script (antes de qualquer reload)
  console.log(`%c${TAG} Script ativo em: ${location.href}`, 'color:#00e5ff;font-weight:bold;font-size:14px');
  console.log(`%c${TAG} Agora: recarregue a página (F5) para capturar o fluxo de auth`, 'color:#00e5ff;font-size:13px');
  console.log(`%c${TAG} Após carregar completamente, rode: __metaSsoExport()`, 'color:#00e5ff;font-size:13px');
  console.log(`%c${TAG} Storage ATUAL (antes do reload):`, 'color:#ffd600;font-weight:bold');
  dumpStorage();
  dumpCookies();
})();
