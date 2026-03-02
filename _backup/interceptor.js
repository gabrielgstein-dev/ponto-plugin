(function() {
  'use strict';

  function dispatchBearer(token) {
    if (token && typeof token === 'string' && token.length > 20) {
      console.log('[Senior Ponto SPY] Bearer token capturado:', token.substring(0, 30) + '...');
      window.dispatchEvent(new CustomEvent('__sponto_bearer', { detail: token }));
    }
  }

  function extractBearer(val, url) {
    if (val && typeof val === 'string' && val.startsWith('Bearer ')) {
      const urlStr = typeof url === 'string' ? url : '';
      if (urlStr.includes('senior.com.br')) {
        dispatchBearer(val.slice(7));
      }
    }
  }

  function extractGestaoPonto(headers, url) {
    const urlStr = typeof url === 'string' ? url : '';
    if (!urlStr.includes('gestaoponto') || !urlStr.includes('/api/')) return;
    let assertion = null;
    if (headers instanceof Headers) {
      assertion = headers.get('assertion');
    } else if (headers && typeof headers === 'object') {
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === 'assertion') assertion = v;
      }
    }
    if (!assertion) return;
    const info = { assertion };
    const colabMatch = urlStr.match(/\/colaborador\/([^?/]+)/);
    if (colabMatch) info.colaboradorId = colabMatch[1];
    const calcMatch = urlStr.match(/codigoCalculo=(\d+)/);
    if (calcMatch) info.codigoCalculo = calcMatch[1];
    const baseMatch = urlStr.match(/(https?:\/\/[^/]+\/[^/]+-backend\/api\/)/);
    if (baseMatch) info.baseUrl = baseMatch[1];
    console.log('[Senior Ponto SPY] GestaoPonto assertion capturado:', info.colaboradorId || '?');
    window.dispatchEvent(new CustomEvent('__sponto_gestao_ponto', { detail: JSON.stringify(info) }));
  }

  function spyRequest(url, method, body) {
    const urlStr = typeof url === 'string' ? url : (url && url.url) || '';
    if (!urlStr.includes('senior.com.br') && !urlStr.includes('gestaoponto')) return;
    const ul = urlStr.toLowerCase();
    if ((method === 'POST' || method === 'PUT') && (ul.includes('clocking') || ul.includes('pontomobile') || ul.includes('/ponto/'))) {
      const info = { url: urlStr, method, body: typeof body === 'string' ? body : JSON.stringify(body) };
      console.log('[Senior Ponto SPY] Requisição Senior interceptada:', info);
      window.dispatchEvent(new CustomEvent('__sponto_api_spy', { detail: JSON.stringify(info) }));
    }
  }

  const PUNCH_URL_MATCH = 'clockingEventImportByBrowser';

  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    const method = (init && init.method || 'GET').toUpperCase();
    const fetchUrl = typeof input === 'string' ? input : (input && input.url) || '';
    if (init && init.headers) {
      if (init.headers instanceof Headers) {
        extractBearer(init.headers.get('Authorization'), fetchUrl);
      } else if (typeof init.headers === 'object') {
        for (const [k, v] of Object.entries(init.headers)) {
          if (k.toLowerCase() === 'authorization') extractBearer(v, fetchUrl);
        }
      }
      extractGestaoPonto(init.headers, fetchUrl);
    }
    spyRequest(input, method, init && init.body);
    const result = origFetch.apply(this, arguments);
    if (fetchUrl.includes(PUNCH_URL_MATCH)) {
      result.then(response => {
        if (response.ok) {
          console.log('[Senior Ponto SPY] Ponto batido com SUCESSO via plataforma!');
          window.dispatchEvent(new CustomEvent('__sponto_punch_success', {
            detail: JSON.stringify({ url: fetchUrl, timestamp: Date.now() })
          }));
        }
      }).catch(() => {});
    }
    return result;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this.__sponto_method = method;
    this.__sponto_url = url;
    return origOpen.apply(this, arguments);
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body) {
    spyRequest(this.__sponto_url || '', this.__sponto_method || '', body);
    if (this.__sponto_headers) {
      extractGestaoPonto(this.__sponto_headers, this.__sponto_url || '');
    }
    return origSend.apply(this, arguments);
  };

  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
    if (name.toLowerCase() === 'authorization') extractBearer(value, this.__sponto_url || '');
    if (!this.__sponto_headers) this.__sponto_headers = {};
    this.__sponto_headers[name] = value;
    return origSetHeader.apply(this, arguments);
  };
})();
