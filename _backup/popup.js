// ─── API Senior — fetch direto do popup ───────────────────────
const SENIOR_API_BASE = 'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest';

function extractTimesFromApiResponse(json) {
  const times = [];
  const timePattern = /^([0-1]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    for (const [key, val] of Object.entries(obj)) {
      const kl = key.toLowerCase();
      if (kl.includes('hora') || kl.includes('time') || kl.includes('marcac') ||
          kl.includes('clocking') || kl.includes('batida') || kl.includes('entrada') ||
          kl.includes('saida') || kl.includes('almoco')) {
        if (typeof val === 'string') {
          const m = val.match(/([0-1]?\d|2[0-3]):([0-5]\d)/);
          if (m) {
            const h = parseInt(m[1]), min = parseInt(m[2]);
            if (h >= 5 && h <= 22) times.push(`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`);
          }
        } else if (typeof val === 'object') { walk(val); }
      } else if (typeof val === 'string' && timePattern.test(val.trim())) {
        const m = val.trim().match(/([0-1]?\d|2[0-3]):([0-5]\d)/);
        if (m) {
          const h = parseInt(m[1]), min = parseInt(m[2]);
          if (h >= 5 && h <= 22) times.push(`${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`);
        }
      } else if (typeof val === 'object') { walk(val); }
    }
  }
  walk(json);
  return [...new Set(times)].sort();
}

const GP_FRONTEND_URL = 'https://gestaoponto.meta.com.br/gestaoponto-frontend/?portal=g7&showMenu=S';
let _gpLastResult = null;
let _gpLastFetchTs = 0;
let _gpLastFailTs = 0;

async function getOrCreateGpTab(allowCreate) {
  const allTabs = await chrome.tabs.query({});
  const existing = allTabs.find(t => t.url && t.url.includes('gestaoponto'));
  if (existing) return { tab: existing, created: false };
  if (!allowCreate) return null;
  try {
    const tab = await chrome.tabs.create({ url: GP_FRONTEND_URL, active: false });
    console.log('[Senior Ponto] GP aba background criada (id:', tab.id, ')');
    return { tab, created: true };
  } catch (e) {
    console.warn('[Senior Ponto] Falha ao criar aba GP:', e.message);
    return null;
  }
}

async function getSeniorAccessToken() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.senior.com.br', name: 'com.senior.token' });
    if (!cookies.length) return null;
    const tokenObj = JSON.parse(decodeURIComponent(cookies[0].value));
    return tokenObj.access_token || null;
  } catch (e) { return null; }
}

async function waitForGpSession(tabId, maxWait) {
  const pollInterval = 1000;
  let elapsed = 0;
  let authAttempted = false;

  const seniorToken = await getSeniorAccessToken();
  console.log('[Senior Ponto] GP Senior token disponível:', !!seniorToken);

  while (elapsed < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));
    elapsed += pollInterval;

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          try {
            const raw = sessionStorage.getItem('SeniorGPOSession');
            if (raw) {
              const obj = JSON.parse(raw);
              if (obj.token) return { ready: true };
            }
          } catch (e) {}
          return { ready: false, url: location.href };
        },
      });
      const res = results && results[0] && results[0].result;
      if (res && res.ready) {
        console.log('[Senior Ponto] GP sessão pronta em', elapsed, 'ms');
        return true;
      }

      if (!authAttempted && seniorToken) {
        authAttempted = true;
        console.log('[Senior Ponto] GP autenticando via POST /senior/auth/g7...');
        try {
          const authResults = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            args: [seniorToken],
            func: async (accessToken) => {
              try {
                const r = await fetch('/gestaoponto-backend/api/senior/auth/g7', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/plain, */*',
                    'token': accessToken,
                    'expires': '604800',
                  },
                  body: '{}',
                });
                const text = await r.text();
                if (!r.ok) return { ok: false, status: r.status, body: text.substring(0, 300) };
                const json = JSON.parse(text);
                if (json.token) {
                  const session = {
                    token: json.token,
                    platformUrl: json.urlPlataforma || '',
                    showMenu: 'S',
                    loginSeniorX: true,
                  };
                  sessionStorage.setItem('SeniorGPOSession', JSON.stringify(session));
                  sessionStorage.setItem('token', json.token);
                  return {
                    ok: true,
                    assertion: json.token.substring(0, 40),
                    colaboradorId: json.colaborador ? json.colaborador.id : null,
                    roles: json.roles,
                  };
                }
                return { ok: false, status: r.status, body: text.substring(0, 300) };
              } catch (e) { return { ok: false, error: e.message }; }
            },
          });
          const authRes = authResults && authResults[0] && authResults[0].result;
          if (authRes) {
            console.log('[Senior Ponto] GP auth/g7 resultado:', JSON.stringify(authRes));
            if (authRes.ok) {
              if (authRes.colaboradorId) {
                chrome.storage.local.set({ gestaoPontoColaboradorId: authRes.colaboradorId });
                console.log('[Senior Ponto] GP colaboradorId:', authRes.colaboradorId);
              }
              return true;
            }
          }
        } catch (e) {
          console.warn('[Senior Ponto] GP erro auth/g7:', e.message);
        }
      }
    } catch (e) {
      try {
        const info = await chrome.tabs.get(tabId);
        console.log('[Senior Ponto] GP tab:', info.status, (info.url || '').substring(0, 80));
      } catch (e2) {}
    }
  }
  return false;
}

async function executeInGpTab(tabId, cachedColabId, cachedCalculo) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [cachedColabId, cachedCalculo],
    func: async (knownColabId, knownCalculo) => {
      const logs = [];
      const log = msg => logs.push(msg);

      let assertion = null;
      try {
        const raw = sessionStorage.getItem('SeniorGPOSession');
        if (raw) {
          const obj = JSON.parse(raw);
          assertion = obj.token;
        }
      } catch (e) {}
      if (!assertion) {
        log('Sem assertion em SeniorGPOSession');
        return { logs, error: 'no_assertion' };
      }
      log('Assertion encontrado: ' + assertion.substring(0, 30) + '...');

      const h = { 'Accept': 'application/json', 'assertion': assertion, 'zone-offset': String(new Date().getTimezoneOffset()) };
      const base = '/gestaoponto-backend/api/';

      let colaboradorId = knownColabId;
      let codigoCalculo = knownCalculo;

      if (!colaboradorId) {
        const discoverUrls = [
          `${base}usuario/logado`,
          `${base}colaborador/logado`,
          `${base}periodoAtual`,
          `${base}configuracao/colaboradorLogado`,
        ];

        for (const url of discoverUrls) {
          try {
            const r = await fetch(url, { headers: h });
            log(`Discover ${url} → ${r.status}`);
            if (!r.ok) continue;
            const json = await r.json();
            log(`Response: ${JSON.stringify(json).substring(0, 400)}`);
            const str = JSON.stringify(json);
            const idMatch = str.match(/"(?:id|colaboradorId|employeeId)"\s*:\s*"(\d+-\d+-\d+)"/);
            if (idMatch) { colaboradorId = idMatch[1]; log('ColaboradorId: ' + colaboradorId); break; }
          } catch (e) { log(`Erro ${url}: ${e.message}`); }
        }
      }

      if (!colaboradorId) {
        try {
          const payload = JSON.parse(atob(assertion.split('.')[1]));
          log('JWT payload: ' + JSON.stringify(payload));
          if (payload.userId) {
            const url = `${base}colaborador/usuario/${payload.userId}`;
            const r = await fetch(url, { headers: h });
            log(`ColabByUser ${url} → ${r.status}`);
            if (r.ok) {
              const json = await r.json();
              log('ColabByUser resp: ' + JSON.stringify(json).substring(0, 500));
              const str = JSON.stringify(json);
              const idMatch = str.match(/(\d+-\d+-\d+)/);
              if (idMatch) { colaboradorId = idMatch[1]; log('ColaboradorId via userId: ' + colaboradorId); }
            }
          }
        } catch (e) { log('JWT parse err: ' + e.message); }
      }

      if (!colaboradorId) {
        log('Não encontrou colaboradorId');
        return { logs, error: 'no_colab_id', assertion };
      }

      const hoje = new Date();
      const pad = n => String(n).padStart(2, '0');
      const dataStr = `${hoje.getFullYear()}-${pad(hoje.getMonth()+1)}-${pad(hoje.getDate())}`;
      let url = `${base}acertoPontoColaboradorPeriodo/colaborador/${colaboradorId}?dataInicial=${dataStr}&dataFinal=${dataStr}&orderby=-dataApuracao`;
      if (codigoCalculo) url += `&codigoCalculo=${codigoCalculo}`;

      try {
        log('Fetch marcações: ' + url);
        const r = await fetch(url, { headers: h });
        log('Status: ' + r.status);
        if (!r.ok) return { logs, error: 'http_' + r.status, colaboradorId };

        const json = await r.json();
        log('Response: ' + JSON.stringify(json).substring(0, 500));

        const times = [];
        if (json.apuracao && Array.isArray(json.apuracao)) {
          for (const dia of json.apuracao) {
            if (dia.marcacoes && Array.isArray(dia.marcacoes)) {
              for (const m of dia.marcacoes) {
                if (m.horaAcesso) {
                  const match = m.horaAcesso.match(/(\d{2}):(\d{2})/);
                  if (match) times.push(`${match[1]}:${match[2]}`);
                }
              }
            }
          }
        }

        if (!codigoCalculo && json.apuracao && json.apuracao[0]) {
          codigoCalculo = json.codigoCalculo || null;
        }

        const unique = [...new Set(times)].sort();
        log('Marcações: ' + JSON.stringify(unique));
        return { logs, times: unique, colaboradorId, codigoCalculo, assertion };
      } catch (e) {
        log('Fetch erro: ' + e.message);
        return { logs, error: 'fetch_error', colaboradorId };
      }
    },
  });

  return results && results[0] && results[0].result;
}

const GP_API_BASE = 'https://gestaoponto.meta.com.br/gestaoponto-backend/api/';

async function getGpAssertion() {
  const stored = await chrome.storage.local.get(['gpAssertion', 'gpAssertionTs', 'gestaoPontoColaboradorId']);
  if (stored.gpAssertion && stored.gpAssertionTs && Date.now() - stored.gpAssertionTs < 6 * 3600000) {
    return { assertion: stored.gpAssertion, colaboradorId: stored.gestaoPontoColaboradorId };
  }

  const accessToken = await getSeniorAccessToken();
  if (!accessToken) return null;

  try {
    const r = await fetch(`${GP_API_BASE}senior/auth/g7`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'token': accessToken,
        'expires': '604800',
      },
      body: '{}',
    });
    if (!r.ok) {
      console.warn('[Senior Ponto] GP auth/g7 direto falhou:', r.status);
      return null;
    }
    const json = await r.json();
    if (!json.token) return null;

    const colaboradorId = json.colaborador ? json.colaborador.id : null;
    const save = { gpAssertion: json.token, gpAssertionTs: Date.now() };
    if (colaboradorId) save.gestaoPontoColaboradorId = colaboradorId;
    chrome.storage.local.set(save);
    console.log('[Senior Ponto] GP auth/g7 direto OK, colaboradorId:', colaboradorId);
    return { assertion: json.token, colaboradorId };
  } catch (e) {
    console.warn('[Senior Ponto] GP auth/g7 direto erro:', e.message);
    return null;
  }
}

async function fetchGpDirect() {
  const auth = await getGpAssertion();
  if (!auth || !auth.assertion) return null;

  const stored = await chrome.storage.local.get(['gestaoPontoCodigoCalculo']);
  const colaboradorId = auth.colaboradorId;
  if (!colaboradorId) return null;

  const hoje = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dataStr = `${hoje.getFullYear()}-${pad(hoje.getMonth()+1)}-${pad(hoje.getDate())}`;
  let url = `${GP_API_BASE}acertoPontoColaboradorPeriodo/colaborador/${colaboradorId}?dataInicial=${dataStr}&dataFinal=${dataStr}&orderby=-dataApuracao`;
  if (stored.gestaoPontoCodigoCalculo) url += `&codigoCalculo=${stored.gestaoPontoCodigoCalculo}`;

  const headers = {
    'Accept': 'application/json',
    'assertion': auth.assertion,
    'zone-offset': String(new Date().getTimezoneOffset()),
  };

  try {
    const r = await fetch(url, { headers });
    if (!r.ok) {
      console.warn('[Senior Ponto] GP fetch direto falhou:', r.status);
      if (r.status === 401 || r.status === 403) {
        chrome.storage.local.remove(['gpAssertion', 'gpAssertionTs']);
      }
      return null;
    }
    const json = await r.json();
    const times = [];
    if (json.apuracao && Array.isArray(json.apuracao)) {
      for (const dia of json.apuracao) {
        if (dia.marcacoes && Array.isArray(dia.marcacoes)) {
          for (const m of dia.marcacoes) {
            if (m.horaAcesso) {
              const match = m.horaAcesso.match(/(\d{2}):(\d{2})/);
              if (match) times.push(`${match[1]}:${match[2]}`);
            }
          }
        }
      }
    }
    const unique = [...new Set(times)].sort();
    console.log('[Senior Ponto] GP direto marcações:', unique);
    return unique.length > 0 ? { times: unique, source: 'gestaoPonto' } : null;
  } catch (e) {
    console.warn('[Senior Ponto] GP fetch direto erro:', e.message);
    return null;
  }
}

async function fetchPunchesFromGestaoPonto(allowTabCreation = false) {
  if (Date.now() - _gpLastFailTs < 60000) return _gpLastResult;
  if (_gpLastResult && Date.now() - _gpLastFetchTs < 30000) return _gpLastResult;

  const directResult = await fetchGpDirect();
  if (directResult) {
    _gpLastResult = directResult;
    _gpLastFetchTs = Date.now();
    _gpLastFailTs = 0;
    console.log('[Senior Ponto] GP marcações hoje (direto):', directResult.times);
    return directResult;
  }

  const stored = await chrome.storage.local.get(['gestaoPontoColaboradorId', 'gestaoPontoCodigoCalculo']);

  const tabInfo = await getOrCreateGpTab(allowTabCreation);
  if (!tabInfo) {
    console.log('[Senior Ponto] GP: sem aba disponível (fallback)');
    return _gpLastResult;
  }
  const { tab, created } = tabInfo;

  try {
    const waitTime = created ? 10000 : 5000;
    const ready = await waitForGpSession(tab.id, waitTime);
    if (!ready) {
      console.warn('[Senior Ponto] GP: sessão não disponível após', waitTime, 'ms');
      if (created) try { await chrome.tabs.remove(tab.id); } catch (e) {}
      _gpLastFailTs = Date.now();
      return null;
    }

    const result = await executeInGpTab(tab.id, stored.gestaoPontoColaboradorId || null, stored.gestaoPontoCodigoCalculo || null);

    if (result && result.logs) {
      result.logs.forEach(l => console.log('[Senior Ponto GP]', l));
    }

    if (result && result.colaboradorId) {
      const save = { gestaoPontoColaboradorId: result.colaboradorId };
      if (result.codigoCalculo) save.gestaoPontoCodigoCalculo = result.codigoCalculo;
      chrome.storage.local.set(save);
    }

    if (created) try { await chrome.tabs.remove(tab.id); } catch (e) {}

    if (result && result.times && result.times.length > 0) {
      _gpLastResult = { times: result.times, source: 'gestaoPonto' };
      _gpLastFetchTs = Date.now();
      _gpLastFailTs = 0;
      console.log('[Senior Ponto] GP marcações hoje (via aba):', result.times);
      return _gpLastResult;
    }

    if (result && result.error) {
      console.warn('[Senior Ponto] GP erro:', result.error);
      _gpLastFailTs = Date.now();
    }

    return null;
  } catch (e) {
    console.warn('[Senior Ponto] GP exceção:', e.message);
    if (created) try { await chrome.tabs.remove(tab.id); } catch (e2) {}
    _gpLastFailTs = Date.now();
    return null;
  }
}

let _cachedApiEndpoint = null;

async function fetchMarcacoesHoje(token) {
  const allTabs = await chrome.tabs.query({});
  const seniorTab = allTabs.find(t => t.url && t.url.includes('senior.com.br'));
  if (!seniorTab) return null;

  const results = await chrome.scripting.executeScript({
    target: { tabId: seniorTab.id },
    world: 'MAIN',
    args: [token, _cachedApiEndpoint],
    func: async (accessToken, cachedEndpoint) => {
      const BASE = 'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest';
      const H = { 'Authorization': `bearer ${accessToken}`, 'Content-Type': 'application/json' };
      const hoje = new Date();
      const pad = n => String(n).padStart(2, '0');
      const dataStr = `${hoje.getFullYear()}-${pad(hoje.getMonth()+1)}-${pad(hoje.getDate())}`;

      const endpoints = cachedEndpoint
        ? [{ url: cachedEndpoint.url, method: cachedEndpoint.method, body: cachedEndpoint.body === '__date__' ? { startDate: dataStr, endDate: dataStr, date: dataStr } : JSON.parse(cachedEndpoint.body || '{}') }]
        : [
          { url: `${BASE}/hcm/pontomobile_bff/queries/getClockingEventsQuery`, method: 'POST', body: {} },
          { url: `${BASE}/hcm/pontomobile_bff/queries/getLastClockingEventsQuery`, method: 'POST', body: {} },
          { url: `${BASE}/hcm/pontomobile_bff/queries/getEmployeeClockingEventsQuery`, method: 'POST', body: {} },
          { url: `${BASE}/hcm/pontomobile_clocking_event/queries/listClockingEvent`, method: 'POST', body: {} },
          { url: `${BASE}/hcm/pontomobile_clocking_event/queries/getClockingEvent`, method: 'POST', body: {} },
          { url: `${BASE}/hcm/pontomobile_clocking_event/queries/clockingEventList`, method: 'POST', body: { startDate: dataStr, endDate: dataStr } },
          { url: `${BASE}/hcm/pontomobile_clocking_event/queries/getClockingEventByEmployee`, method: 'POST', body: { startDate: dataStr, endDate: dataStr } },
          { url: `${BASE}/hcm/pontomobile_clocking_event/entities/clockingEvent`, method: 'GET', body: null },
          { url: `${BASE}/hcm/pontomobile_clocking_event/queries/getByDate`, method: 'POST', body: { date: dataStr } },
          { url: `${BASE}/hcm/gestao_ponto/queries/getMarcacoes`, method: 'POST', body: { dataInicio: dataStr, dataFim: dataStr } },
          { url: `${BASE}/hcm/gestao_ponto/queries/getClockingsByPeriod`, method: 'POST', body: { startDate: dataStr, endDate: dataStr } },
        ];

      const discovery = [];
      for (const ep of endpoints) {
        try {
          const opts = { method: ep.method, headers: H };
          if (ep.method === 'POST' && ep.body) opts.body = JSON.stringify(ep.body);
          const r = await fetch(ep.url, opts);
          const text = await r.text();
          discovery.push({ url: ep.url, method: ep.method, status: r.status, ok: r.ok, body: text.substring(0, 2000), bodyParam: ep.body ? JSON.stringify(ep.body) : null });
          if (r.ok) break;
        } catch (e) {
          discovery.push({ url: ep.url, method: ep.method, status: 0, ok: false, error: e.message });
        }
      }
      return { discovery, dataStr };
    },
  });

  const data = results && results[0] && results[0].result;
  if (!data || !data.discovery) return null;

  for (const r of data.discovery) {
    const label = r.ok ? '✅' : '❌';
    console.log(`[Senior Ponto API] ${label} ${r.method} ${r.url} → ${r.status} ${(r.body || r.error || '').substring(0, 200)}`);
  }

  for (const r of data.discovery) {
    if (!r.ok || !r.body) continue;
    try {
      const json = JSON.parse(r.body);
      const times = extractTimesFromApiResponse(json);
      if (times && times.length > 0) {
        _cachedApiEndpoint = { url: r.url, method: r.method, body: r.bodyParam };
        console.log('[Senior Ponto API] Endpoint cacheado:', r.url);
        return { times, source: r.url };
      }
    } catch (e) {}
  }

  return null;
}

// ─── Utilitários de tempo ─────────────────────────────────────
function timeToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function minutesToTime(minutes) {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDiff(diffMin) {
  if (diffMin == null) return '';
  const sign = diffMin < 0 ? '-' : '+';
  const abs = Math.abs(diffMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h > 0) return `${sign}${h}h${String(m).padStart(2, '0')}`;
  return `${sign}${m}min`;
}

function formatCountdown(diffMs) {
  const abs = Math.abs(diffMs);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getNowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function showToast(msg, duration = 2000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ─── Estado da aplicação ──────────────────────────────────────
let state = {
  entrada: null,
  almoco: null,
  volta: null,
  saida: null,
};

let settings = {
  jornada: 8 * 60,
  almocoHorario: '12:00',
  almocoDur: 60,
  notifAntecip: 10,
};

let clockInterval = null;
let timerInterval = null;
let notifScheduled = {};

// ─── Carregar/Salvar no storage ───────────────────────────────
async function loadState() {
  const data = await chrome.storage.local.get(['pontoState', 'pontoSettings', 'pontoDate']);
  const today = new Date().toDateString();

  // Se o estado salvo é de outro dia, ignora
  if (data.pontoDate !== today) {
    await chrome.storage.local.set({ pontoDate: today, pontoState: null });
    return;
  }

  if (data.pontoState) {
    state = { ...state, ...data.pontoState };
  }
  if (data.pontoSettings) {
    settings = { ...settings, ...data.pontoSettings };
  }
}

async function saveState() {
  const today = new Date().toDateString();
  await chrome.storage.local.set({
    pontoState: state,
    pontoDate: today,
  });
}

async function saveSettings() {
  await chrome.storage.local.set({ pontoSettings: settings });
}

// ─── Cálculo dos horários ─────────────────────────────────────
function calcHorarios() {
  state._almocoSugerido = null;
  state._voltaSugerida = null;
  state._saidaEstimada = null;

  const entMin = timeToMinutes(state.entrada);
  if (entMin == null) return;

  const almocoHorarioMin = timeToMinutes(settings.almocoHorario) || 720;

  if (!state.almoco) {
    state._almocoSugerido = minutesToTime(almocoHorarioMin);
  }

  if (!state.volta && !state.almoco) {
    state._saidaEstimada = minutesToTime(entMin + settings.jornada + settings.almocoDur);
  }

  if (state.volta) {
    const voltaMin = timeToMinutes(state.volta);
    const almocoMin = state.almoco ? timeToMinutes(state.almoco) : null;

    const horasAntesAlmoco = almocoMin ? almocoMin - entMin : 0;
    const actualLunch = almocoMin ? voltaMin - almocoMin : 0;
    const lunchDeficit = Math.max(0, settings.almocoDur - actualLunch);
    const horasRestantes = settings.jornada - horasAntesAlmoco;
    const saidaMin = voltaMin + horasRestantes + lunchDeficit;
    if (!state.saida) {
      state._saidaEstimada = minutesToTime(saidaMin);
    }
  } else if (state.almoco) {
    const almocoMin = timeToMinutes(state.almoco);
    state._voltaSugerida = minutesToTime(almocoMin + settings.almocoDur);

    const horasAntesAlmoco = almocoMin - entMin;
    const horasRestantes = settings.jornada - horasAntesAlmoco;
    state._saidaEstimada = minutesToTime(almocoMin + settings.almocoDur + horasRestantes);
  }

}

// ─── Renderização da UI ───────────────────────────────────────
function renderUI() {
  calcHorarios();

  const now = getNowMinutes();
  const entMin = timeToMinutes(state.entrada);
  const almocoMin = timeToMinutes(state.almoco);
  const voltaMin = timeToMinutes(state.volta);
  const saidaMin = timeToMinutes(state.saida);

  // Cards
  renderCard('entrada', state.entrada, entMin, now, null);
  renderCard('almoco', state.almoco, almocoMin, now,
    state.entrada ? state._almocoSugerido : null,
    'a partir das');
  renderCard('volta', state.volta, voltaMin, now,
    state.almoco ? state._voltaSugerida : null,
    'sugerido');
  renderCard('saida', state.saida, saidaMin, now, state._saidaEstimada, 'estimado');

  // Progress bar
  renderProgress(entMin, voltaMin, almocoMin, saidaMin, now);

  // Status banner
  renderStatus(entMin, almocoMin, voltaMin, saidaMin, now);

  // Next action
  renderNextAction(entMin, almocoMin, voltaMin, saidaMin, now);

  // Agenda notificações
  scheduleNotifications(entMin, almocoMin, voltaMin, saidaMin);
}

function renderCard(type, timeVal, timeMin, nowMin, sugestao, prefix = '') {
  const cardEl   = document.getElementById(`card${capitalize(type)}`);
  const timeEl   = document.getElementById(`time${capitalize(type)}`);
  const subEl    = document.getElementById(`sub${capitalize(type)}`);

  cardEl.className = 'card';
  timeEl.className = 'card-time';

  if (timeVal) {
    timeEl.textContent = timeVal;
    if (timeMin && nowMin > timeMin) {
      cardEl.classList.add('done');
      timeEl.classList.add('done');
      const diff = nowMin - timeMin;
      subEl.textContent = `há ${formatDiff(diff).replace('+', '')}`;
    } else if (timeMin && nowMin <= timeMin) {
      const diff = timeMin - nowMin;
      if (diff < 15) {
        cardEl.classList.add('warn');
        timeEl.classList.add('warn');
        subEl.textContent = `em ${diff}min ⚠️`;
      } else {
        cardEl.classList.add('active');
        timeEl.classList.add('active');
        subEl.textContent = `em ${formatDiff(diff).replace('+', '')}`;
      }
    }
  } else if (sugestao) {
    timeEl.textContent = sugestao;
    timeEl.classList.add('warn');
    subEl.textContent = `${prefix || 'sugerido'}`;
  } else {
    timeEl.textContent = '--:--';
    timeEl.classList.add('empty');
    subEl.textContent = getDefaultSub(type);
  }
}

function getDefaultSub(type) {
  const subs = {
    entrada: 'não registrado',
    almoco: 'aguardando entrada',
    volta: 'aguardando almoço',
    saida: 'aguardando volta',
  };
  return subs[type] || '—';
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderProgress(entMin, voltaMin, almocoMin, saidaMin, nowMin) {
  const section = document.getElementById('progressSection');
  if (!entMin) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  let worked = 0;
  const jornada = settings.jornada;

  if (voltaMin && voltaMin <= nowMin) {
    const antes = almocoMin ? almocoMin - entMin : 0;
    const depois = nowMin - voltaMin;
    worked = Math.max(0, antes + depois);
  } else if (voltaMin && voltaMin > nowMin) {
    worked = almocoMin ? Math.max(0, almocoMin - entMin) : Math.max(0, nowMin - entMin);
  } else if (almocoMin && nowMin >= almocoMin) {
    // Em intervalo de almoço
    worked = almocoMin - entMin;
  } else {
    // Trabalhando sem pausa
    worked = nowMin - entMin;
  }

  const pct = Math.min(100, Math.max(0, Math.round((worked / jornada) * 100)));
  document.getElementById('progressFill').style.width = `${pct}%`;
  document.getElementById('progressPct').textContent = `${pct}%`;
}

function renderStatus(entMin, almocoMin, voltaMin, saidaMin, nowMin) {
  const banner = document.getElementById('statusBanner');
  const textEl = document.getElementById('statusText');
  banner.className = 'status-banner';

  if (!entMin) {
    textEl.textContent = 'Aguardando primeiro batimento...';
    return;
  }

  if (saidaMin && nowMin >= saidaMin) {
    banner.classList.add('done');
    textEl.textContent = '✓ Jornada cumprida! Pode ir embora.';
    return;
  }

  if (voltaMin) {
    banner.classList.add('active');
    if (saidaMin) {
      const diff = saidaMin - nowMin;
      textEl.textContent = `Trabalhando — saída em ${formatDiff(diff).replace('+', '')}`;
    } else {
      textEl.textContent = 'Calculando saída...';
    }
    return;
  }

  if (almocoMin && nowMin >= almocoMin) {
    banner.classList.add('warning');
    textEl.textContent = `Em intervalo de almoço — registre a volta!`;
    return;
  }

  if (almocoMin) {
    const diff = almocoMin - nowMin;
    if (diff <= 15) {
      banner.classList.add('warning');
      textEl.textContent = `⚠ Horário de almoço em ${diff}min!`;
    } else {
      banner.classList.add('active');
      textEl.textContent = `Trabalhando — almoço em ${formatDiff(diff).replace('+', '')}`;
    }
    return;
  }

  banner.classList.add('active');
  textEl.textContent = 'Entrada registrada — trabalhando...';
}

function renderNextAction(entMin, almocoMin, voltaMin, saidaMin, nowMin) {
  const el = document.getElementById('nextAction');
  const textEl = document.getElementById('nextActionText');
  const cntEl = document.getElementById('nextCountdown');

  let targetMin = null;
  let msg = '';

  if (!entMin) { el.classList.remove('visible'); return; }

  if (!almocoMin) {
    const almocoHorarioMin = timeToMinutes(settings.almocoHorario) || 720;
    if (nowMin < almocoHorarioMin) {
      targetMin = almocoHorarioMin;
      msg = `Bata o ponto para o almoço às ${minutesToTime(almocoHorarioMin)}`;
    }
  } else if (!voltaMin) {
    const voltaSug = almocoMin + settings.almocoDur;
    targetMin = voltaSug;
    msg = `Bata a volta do almoço às ${minutesToTime(voltaSug)}`;
  } else if (saidaMin && nowMin < saidaMin) {
    targetMin = saidaMin;
    msg = `Bata o ponto de saída às ${minutesToTime(saidaMin)}`;
  }

  if (!targetMin || !msg) { el.classList.remove('visible'); return; }

  el.classList.add('visible');
  textEl.textContent = msg;

  // Countdown em tempo real
  if (timerInterval) clearInterval(timerInterval);
  function updateCountdown() {
    const now = new Date();
    const target = new Date();
    target.setHours(Math.floor(targetMin / 60), targetMin % 60, 0, 0);
    const diff = target - now;
    if (diff < 0) {
      cntEl.textContent = 'AGORA!';
      cntEl.style.color = 'var(--warn)';
      return;
    }
    cntEl.style.color = 'var(--accent)';
    cntEl.textContent = formatCountdown(diff);
  }
  updateCountdown();
  timerInterval = setInterval(updateCountdown, 1000);
}

// ─── Notificações ──────────────────────────────────────────────
function scheduleNotifications(entMin, almocoMin, voltaMin, saidaMin) {
  const antecip = settings.notifAntecip;
  const toNotif = [];

  if (entMin && !almocoMin) {
    const almocoHorarioMin = timeToMinutes(settings.almocoHorario) || 720;
    toNotif.push({ key: 'notif_almoco', time: almocoHorarioMin - antecip, msg: `Hora do almoço em ${antecip} minutos!` });
  }

  if (almocoMin && !voltaMin) {
    const voltaSug = almocoMin + settings.almocoDur;
    toNotif.push({ key: 'notif_volta', time: voltaSug - antecip, msg: `Hora de voltar do almoço em ${antecip} minutos!` });
    toNotif.push({ key: 'notif_volta_now', time: voltaSug, msg: `Registre a volta do almoço agora!` });
  }

  if (saidaMin) {
    toNotif.push({ key: 'notif_saida', time: saidaMin - antecip, msg: `Saída em ${antecip} minutos! Prepare-se.` });
    toNotif.push({ key: 'notif_saida_now', time: saidaMin, msg: `Hora de bater o ponto de saída! 🎉` });
  }

  const nowMin = getNowMinutes();
  const today = new Date();

  toNotif.forEach(({ key, time, msg }) => {
    if (notifScheduled[key]) return;
    if (time <= nowMin) return;

    notifScheduled[key] = true;

    const triggerDate = new Date(today);
    triggerDate.setHours(Math.floor(time / 60), time % 60, 0, 0);

    chrome.alarms.create(key, { when: triggerDate.getTime() });
    chrome.storage.local.set({ [`alarm_msg_${key}`]: msg });
  });
}

// ─── Aplicar batimentos detectados ───────────────────────────
function applyTimes(times, source, silent = false) {
  if (!times || times.length === 0) {
    if (!silent) showToast('Nenhum batimento encontrado');
    return false;
  }

  const nowMin = getNowMinutes();
  const past = times.filter(t => timeToMinutes(t) <= nowMin + 5);
  if (past.length === 0) {
    if (!silent) showToast('Nenhum batimento válido');
    return false;
  }

  const oldState = JSON.stringify({ e: state.entrada, a: state.almoco, v: state.volta, s: state.saida });

  state.entrada = past[0];
  state.almoco = null;
  state.volta = null;
  state.saida = null;

  if (past.length >= 2) {
    const almocoRef = timeToMinutes(settings.almocoHorario) || 720;
    const entradaMin = timeToMinutes(past[0]);

    for (let i = 1; i < past.length - 1; i++) {
      const tMin = timeToMinutes(past[i]);
      const tNextMin = timeToMinutes(past[i + 1]);
      const gap = tNextMin - tMin;
      const workBefore = tMin - entradaMin;

      if (workBefore >= 120 && gap >= Math.min(settings.almocoDur, 30)) {
        state.almoco = past[i];
        state.volta = past[i + 1];
        if (i + 2 < past.length) {
          state.saida = past[past.length - 1];
        }
        break;
      }
    }

    if (!state.almoco) {
      const lastPunch = past[past.length - 1];
      const lastMin = timeToMinutes(lastPunch);
      const workBefore = lastMin - entradaMin;
      const totalSpan = lastMin - entradaMin;
      if (workBefore >= 120 && totalSpan < settings.jornada + settings.almocoDur) {
        state.almoco = lastPunch;
      }
    }
  }

  const newState = JSON.stringify({ e: state.entrada, a: state.almoco, v: state.volta, s: state.saida });
  const changed = oldState !== newState;

  if (changed) {
    console.log(`[Senior Ponto] Estado atualizado via ${source}:`, { entrada: state.entrada, almoco: state.almoco, volta: state.volta, saida: state.saida });
    saveState().then(() => {
      notifScheduled = {};
      renderUI();
      if (!silent) {
        const label = source === 'api' ? 'API' : source;
        showToast(`✓ ${past.length} batimento(s) via ${label}!`);
      } else {
        showToast('✓ Ponto atualizado!');
      }
    });
  } else if (!silent) {
    renderUI();
  }

  return true;
}

// ─── Injetar ponto no localStorage da aba Senior ─────────────
async function injectPunchIntoLocalStorage(timeHHMM) {
  try {
    const allTabs = await chrome.tabs.query({});
    const seniorTab = allTabs.find(t => t.url && t.url.includes('senior.com.br'));
    if (!seniorTab) return;

    await chrome.scripting.executeScript({
      target: { tabId: seniorTab.id },
      args: [timeHHMM],
      func: (punchTime) => {
        const raw = localStorage.getItem('clockingEventsStorage');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const hoje = new Date();
        const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;

        for (const [empId, empData] of Object.entries(parsed)) {
          const arrKey = Object.keys(empData).find(k => Array.isArray(empData[k]));
          if (arrKey) {
            empData[arrKey].push({
              dateEvent: hojeStr,
              timeEvent: `${punchTime}:00.000`,
            });
            empData[arrKey].sort((a, b) => {
              const ka = (a.dateEvent || '') + (a.timeEvent || '');
              const kb = (b.dateEvent || '') + (b.timeEvent || '');
              return kb.localeCompare(ka);
            });
            break;
          }
        }
        localStorage.setItem('clockingEventsStorage', JSON.stringify(parsed));
        console.log('[Senior Ponto] Ponto injetado no localStorage:', punchTime);
      },
    });
  } catch (e) {
    console.warn('[Senior Ponto] Erro ao injetar no localStorage:', e.message);
  }
}

// ─── Ler batimentos do localStorage da aba Senior ────────────
async function readPunchesFromLocalStorage() {
  try {
    const allTabs = await chrome.tabs.query({});
    const seniorTab = allTabs.find(t => t.url && t.url.includes('senior.com.br'));
    if (!seniorTab) return null;

    const results = await chrome.scripting.executeScript({
      target: { tabId: seniorTab.id },
      func: () => {
        const raw = localStorage.getItem('clockingEventsStorage');
        if (!raw) return null;
        return raw;
      },
    });
    const raw = results && results[0] && results[0].result;
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`;
    const times = [];
    for (const [empId, empData] of Object.entries(parsed)) {
      const eventArrays = Object.values(empData).filter(v => Array.isArray(v));
      for (const events of eventArrays) {
        for (const ev of events) {
          const evDate = ev.dateEvent || ev.date || ev.dateTime || '';
          if (!evDate.startsWith(hojeStr)) continue;
          const timeVal = ev.timeEvent || ev.time || '';
          const timeMatch = timeVal.match(/(\d{2}):(\d{2})/);
          if (timeMatch) {
            times.push(`${timeMatch[1]}:${timeMatch[2]}`);
          } else {
            const dateTimeMatch = evDate.match(/T(\d{2}):(\d{2})/);
            if (dateTimeMatch) times.push(`${dateTimeMatch[1]}:${dateTimeMatch[2]}`);
          }
        }
      }
    }
    return [...new Set(times)].sort();
  } catch (e) {
    console.warn('[Senior Ponto] Erro ao ler localStorage:', e.message);
    return null;
  }
}

let lastPunchHash = '';

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.punchSuccessTs) {
    console.log('[Senior Ponto] Ponto detectado na plataforma! Atualizando em 2s...');
    setTimeout(() => {
      lastPunchHash = '';
      pollPunches();
    }, 2000);
  }
});

async function pollPunches() {
  let times = null;
  let source = '';

  try {
    const gpResult = await fetchPunchesFromGestaoPonto();
    if (gpResult && gpResult.times && gpResult.times.length > 0) {
      times = gpResult.times;
      source = 'gestaoPonto';
    }
  } catch (e) {
    console.warn('[Senior Ponto] Poll GestaoPonto falhou:', e.message);
  }

  if (!times || times.length === 0) {
    times = await readPunchesFromLocalStorage();
    if (times && times.length > 0) source = 'localStorage';
  }

  if (!times || times.length === 0) {
    try {
      const token = await getAccessToken();
      if (token) {
        const apiResult = await fetchMarcacoesHoje(token);
        if (apiResult && apiResult.times && apiResult.times.length > 0) {
          times = apiResult.times;
          source = 'API';
        }
      }
    } catch (e) {
      console.warn('[Senior Ponto] Poll API falhou:', e.message);
    }
  }

  if (!times || times.length === 0) {
    try {
      const allTabs = await chrome.tabs.query({});
      const seniorTab = allTabs.find(t => t.url && t.url.includes('senior.com.br'));
      if (seniorTab) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: seniorTab.id, allFrames: true },
          func: () => {
            const times = [];
            const els = document.querySelectorAll('table td, [class*="clocking"] span, [class*="marcac"] span');
            els.forEach(el => {
              const m = el.textContent.trim().match(/^(\d{2}):(\d{2})$/);
              if (m) {
                const h = parseInt(m[1]);
                if (h >= 5 && h <= 22) times.push(`${m[1]}:${m[2]}`);
              }
            });
            return [...new Set(times)].sort();
          },
        });
        const scraped = [];
        if (results) results.forEach(r => { if (r.result && Array.isArray(r.result)) scraped.push(...r.result); });
        const unique = [...new Set(scraped)].sort();
        if (unique.length > 0) {
          times = unique;
          source = 'scraping';
        }
      }
    } catch (e) {
      console.warn('[Senior Ponto] Poll scraping falhou:', e.message);
    }
  }

  if (!times || times.length === 0) return;
  const hash = times.join(',');
  if (hash === lastPunchHash) return;
  lastPunchHash = hash;
  console.log(`[Senior Ponto] Polling detectou mudança via ${source}:`, times);
  applyTimes(times, 'auto-detect', true);
}

// ─── Auto-detect da página Senior ─────────────────────────────
async function autoDetectFromPage() {
  try {
    // 0: encontrar aba do Senior
    const allTabs = await chrome.tabs.query({});
    const seniorTab = allTabs.find(t => t.url && t.url.includes('senior.com.br'));

    // 1ª tentativa: GestaoPonto API (fonte autoritativa)
    try {
      const gpResult = await fetchPunchesFromGestaoPonto(true);
      if (gpResult && gpResult.times && gpResult.times.length > 0) {
        console.log('[Senior Ponto] Batimentos via GestaoPonto API:', gpResult.times);
        lastPunchHash = gpResult.times.join(',');
        applyTimes(gpResult.times, 'gestaoPonto');
        return;
      }
    } catch (e) {
      console.warn('[Senior Ponto] GestaoPonto falhou:', e.message);
    }

    // 2ª tentativa: ler clockingEventsStorage direto do localStorage da aba
    const times = await readPunchesFromLocalStorage();
    if (times && times.length > 0) {
      console.log('[Senior Ponto] Batimentos de hoje via localStorage:', times);
      lastPunchHash = times.join(',');
      applyTimes(times, 'localStorage');
      return;
    }

    // 3ª tentativa: Senior API com token do cookie
    try {
      const cookies = await chrome.cookies.getAll({ domain: '.senior.com.br', name: 'com.senior.token' });
      if (cookies.length > 0) {
        const decoded = decodeURIComponent(cookies[0].value);
        console.log('[Senior Ponto] Cookie com.senior.token decodificado:', decoded.substring(0, 100));
        const tokenObj = JSON.parse(decoded);
        const accessToken = tokenObj.access_token || tokenObj.token;
        if (accessToken) {
          console.log('[Senior Ponto] Access token encontrado no cookie, tentando API...');
          const apiResult = await fetchMarcacoesHoje(accessToken);
          console.log('[Senior Ponto] API resultado:', apiResult);
          if (apiResult && apiResult.times && apiResult.times.length > 0) {
            applyTimes(apiResult.times, 'api');
            return;
          }
        }
      }
    } catch (e) {
      console.warn('[Senior Ponto] Erro ao ler cookie token:', e.message);
    }

    // 4ª tentativa: token interceptado pelo content script
    const tokenData = await chrome.storage.local.get(['seniorToken', 'seniorTokenTs']);
    if (tokenData.seniorToken) {
      const ageMin = (Date.now() - (tokenData.seniorTokenTs || 0)) / 60000;
      if (ageMin < 60) {
        console.log('[Senior Ponto] Tentando API com token interceptado...');
        const apiResult = await fetchMarcacoesHoje(tokenData.seniorToken);
        if (apiResult && apiResult.times && apiResult.times.length > 0) {
          applyTimes(apiResult.times, 'api');
          return;
        }
      }
    }

    // 5ª tentativa: scraping
    console.log('[Senior Ponto] Fallback para scraping...');

    if (!seniorTab) {
      showToast('Abra a página do Senior para detectar os batimentos.');
      return;
    }

    async function scrapeViaScripting() {
      const results = await chrome.scripting.executeScript({
        target: { tabId: seniorTab.id, allFrames: true },
        func: () => {
          const timePattern = /\b([0-1]?\d|2[0-3]):([0-5]\d)\b/;
          const times = [];
          function parseTime(text) {
            const m = text && text.trim().match(timePattern);
            if (!m) return null;
            const h = parseInt(m[1]);
            const min = parseInt(m[2]);
            if (h < 5 || h > 22) return null;
            return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
          }
          function collectFromElements(elements) {
            elements.forEach(el => {
              const t = parseTime(el.textContent);
              if (t) times.push(t);
            });
          }
          const specificSelectors = [
            'table td[class*="marcac"]',
            'table td[class*="batimento"]',
            'table td[class*="horario"]',
            'table td[class*="hora"]',
            '[class*="marcacao"] span',
            '[class*="batimento"] span',
            '[class*="ponto"] td',
            '[class*="ponto"] span',
            '[class*="clocking"] span',
            '[class*="clocking"] td',
            '[class*="event"] td',
            'table td',
            'table th',
          ];
          for (const selector of specificSelectors) {
            const els = Array.from(document.querySelectorAll(selector));
            if (selector === 'table td' || selector === 'table th') {
              const onlyTime = els.filter(el => /^\s*([0-1]?\d|2[0-3]):[0-5]\d\s*$/.test(el.textContent));
              collectFromElements(onlyTime);
            } else {
              collectFromElements(els);
            }
            if (times.length > 0) break;
          }
          if (times.length === 0) {
            const globalPattern = /\b([0-1]?\d|2[0-3]):([0-5]\d)\b/g;
            const allText = document.body.innerText || '';
            let match;
            while ((match = globalPattern.exec(allText)) !== null) {
              const h = parseInt(match[1]);
              const min = parseInt(match[2]);
              if (h >= 5 && h <= 22) {
                times.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
              }
            }
          }
          return [...new Set(times)].sort();
        },
      });
      const allTimes = [];
      if (results) {
        results.forEach(r => {
          if (r.result && Array.isArray(r.result)) allTimes.push(...r.result);
        });
      }
      return [...new Set(allTimes)].sort();
    }

    try {
      const times = await scrapeViaScripting();
      applyTimes(times, 'scraping');
    } catch (injectErr) {
      showToast('Recarregue a página do Senior e tente novamente.');
      console.error('[Senior Ponto] Falha no scraping:', injectErr);
    }

  } catch (e) {
    showToast('Erro inesperado. Veja o console.');
    console.error('[Senior Ponto] Erro:', e);
  }
}



// ─── Status do token API ────────────────────────────────────
async function updateTokenStatus() {
  const data = await chrome.storage.local.get(['seniorToken', 'seniorTokenTs']);
  const dot = document.getElementById('tokenDot');
  const text = document.getElementById('tokenStatusText');
  if (!dot || !text) return;
  if (!data.seniorToken) {
    dot.className = 'token-dot';
    text.textContent = 'Token não capturado — navegue pelo Senior';
  } else {
    const ageMin = Math.round((Date.now() - (data.seniorTokenTs || 0)) / 60000);
    if (ageMin < 10) {
      dot.className = 'token-dot ok';
      text.textContent = `Token API ativo (${ageMin}min atrás)`;
    } else if (ageMin < 60) {
      dot.className = 'token-dot warn';
      text.textContent = `Token API (${ageMin}min atrás) — pode estar expirado`;
    } else {
      dot.className = 'token-dot';
      text.textContent = 'Token expirado — reabra o Senior';
    }
  }
}

// ─── Bater Ponto ────────────────────────────────────────────
async function punchClock() {
  const btn = document.getElementById('btnPunch');
  const statusEl = document.getElementById('punchStatus');
  btn.disabled = true;
  statusEl.textContent = 'Registrando ponto...';
  statusEl.className = 'punch-status';

  try {
    const apiResult = await punchViaApi(statusEl);
    if (apiResult) {
      statusEl.textContent = 'Ponto registrado via API!';
      statusEl.className = 'punch-status success';

      let newPunchTime = null;
      try {
        const body = typeof apiResult === 'string' ? JSON.parse(apiResult) : apiResult;
        const ev = body?.clockingResult?.clockingEventImported;
        if (ev && ev.timeEvent) {
          const m = ev.timeEvent.match(/(\d{2}):(\d{2})/);
          if (m) newPunchTime = `${m[1]}:${m[2]}`;
        }
      } catch (e) {}

      if (newPunchTime) {
        console.log('[Senior Ponto] Novo ponto da API:', newPunchTime);
        const currentTimes = [state.entrada, state.almoco, state.volta, state.saida].filter(Boolean);
        currentTimes.push(newPunchTime);
        const uniqueTimes = [...new Set(currentTimes)].sort();
        lastPunchHash = uniqueTimes.join(',');
        applyTimes(uniqueTimes, 'API punch');

        injectPunchIntoLocalStorage(newPunchTime);
      }

      setTimeout(() => { lastPunchHash = ''; pollPunches(); }, 3000);
    } else {
      statusEl.textContent = 'Falha na API — veja console para detalhes';
      statusEl.className = 'punch-status error';
    }
  } catch (e) {
    console.error('[Senior Ponto] Erro ao bater ponto:', e);
    statusEl.textContent = 'Erro: ' + e.message;
    statusEl.className = 'punch-status error';
  }

  btn.disabled = false;
}

async function getAccessToken() {
  console.log('[Senior Ponto] === BUSCA DE TOKEN ===');

  const result = await getTokenFromSeniorCookie();
  if (result) return result;

  const result2 = await getTokenFromPageContext();
  if (result2) return result2;

  const result3 = await getTokenFromInterceptor();
  if (result3) return result3;

  console.log('[Senior Ponto] ❌ Nenhum access_token encontrado em nenhuma fonte');
  return null;
}

async function getTokenFromSeniorCookie() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: '.senior.com.br', name: 'com.senior.token' });
    if (!cookies.length) {
      console.log('[Senior Ponto] 🍪 Cookie com.senior.token NÃO encontrado');
      return null;
    }
    const raw = cookies[0].value;
    const decoded = decodeURIComponent(raw);
    console.log('[Senior Ponto] 🍪 com.senior.token DECODIFICADO:');
    console.log(decoded);

    try {
      const obj = JSON.parse(decoded);
      console.log('[Senior Ponto] 🍪 Campos do JSON:', Object.keys(obj));
      for (const [k, v] of Object.entries(obj)) {
        const t = typeof v;
        const preview = t === 'string' ? v.substring(0, 100) : t === 'object' ? JSON.stringify(v).substring(0, 150) : String(v);
        console.log(`[Senior Ponto] 🍪   "${k}" (${t}): ${preview}`);
      }
      if (obj.access_token) {
        console.log('[Senior Ponto] ✅ access_token encontrado no topo do JSON');
        return obj.access_token;
      }
      if (obj.jsonToken) {
        console.log('[Senior Ponto] 🍪 jsonToken encontrado, decodificando...');
        const jt = typeof obj.jsonToken === 'string' ? JSON.parse(obj.jsonToken) : obj.jsonToken;
        console.log('[Senior Ponto] 🍪 jsonToken campos:', Object.keys(jt));
        for (const [k2, v2] of Object.entries(jt)) {
          const preview2 = typeof v2 === 'string' ? v2.substring(0, 100) : String(v2);
          console.log(`[Senior Ponto] 🍪     "${k2}": ${preview2}`);
        }
        if (jt.access_token) {
          console.log('[Senior Ponto] ✅ access_token encontrado dentro de jsonToken');
          return jt.access_token;
        }
      }
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'object' && v !== null && v.access_token) {
          console.log(`[Senior Ponto] ✅ access_token em obj["${k}"]`);
          return v.access_token;
        }
      }
      console.log('[Senior Ponto] ⚠️ com.senior.token parseado mas sem access_token');
    } catch (e) {
      console.log('[Senior Ponto] ⚠️ com.senior.token não é JSON:', e.message);
      console.log('[Senior Ponto] ⚠️ Valor bruto:', decoded.substring(0, 200));
    }
  } catch (e) {
    console.warn('[Senior Ponto] Erro lendo cookie:', e.message);
  }
  return null;
}

async function getTokenFromPageContext() {
  const tabs = await chrome.tabs.query({});
  const seniorTab = tabs.find(t => t.url && t.url.includes('senior.com.br'));
  if (!seniorTab) return null;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: seniorTab.id },
      world: 'MAIN',
      func: () => {
        const dump = {};
        try {
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            dump['SS:' + k] = (sessionStorage.getItem(k) || '').substring(0, 300);
          }
        } catch (_) {}
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            dump['LS:' + k] = (localStorage.getItem(k) || '').substring(0, 300);
          }
        } catch (_) {}
        return dump;
      },
    });
    const data = results && results[0] && results[0].result;
    if (data) {
      console.log('[Senior Ponto] 📦 Storage da aba Senior (' + Object.keys(data).length + ' chaves):');
      for (const [k, v] of Object.entries(data)) {
        console.log(`[Senior Ponto]   ${k}: ${v}`);
      }
      for (const [k, fullVal] of Object.entries(data)) {
        if (!fullVal) continue;
        try {
          const obj = JSON.parse(fullVal);
          if (obj && typeof obj === 'object' && obj.access_token) {
            console.log(`[Senior Ponto] ✅ Token encontrado em ${k}`);
            return obj.access_token;
          }
        } catch (_) {}
        if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(fullVal)) {
          console.log(`[Senior Ponto] ✅ JWT encontrado em ${k}`);
          return fullVal;
        }
      }
    }
  } catch (e) {
    console.warn('[Senior Ponto] Erro lendo storage da aba:', e.message);
  }
  return null;
}

async function getTokenFromInterceptor() {
  const stored = await chrome.storage.local.get(['seniorBearerToken', 'seniorBearerTs']);
  if (stored.seniorBearerToken) {
    const ageMin = (Date.now() - (stored.seniorBearerTs || 0)) / 60000;
    if (ageMin < 60) {
      console.log('[Senior Ponto] ✅ Token do interceptor (Bearer capturado)');
      return stored.seniorBearerToken;
    }
  }
  return null;
}

async function punchViaApi(statusEl) {
  const token = await getAccessToken();
  if (!token) {
    console.log('[Senior Ponto] ❌ NENHUM TOKEN ENCONTRADO');
    return false;
  }

  console.log('[Senior Ponto] Token:', token.substring(0, 20) + '...(' + token.length + ')');

  const tabs = await chrome.tabs.query({});
  const seniorTab = tabs.find(t => t.url && t.url.includes('senior.com.br'));
  if (!seniorTab) {
    console.log('[Senior Ponto] ❌ Nenhuma aba Senior aberta');
    return false;
  }

  statusEl.textContent = 'Registrando ponto...';

  const results = await chrome.scripting.executeScript({
    target: { tabId: seniorTab.id },
    world: 'MAIN',
    args: [token],
    func: async (accessToken) => {
      const BASE = 'https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest';
      const URL = `${BASE}/hcm/pontomobile_clocking_event/actions/clockingEventImportByBrowser`;
      const H = { 'Authorization': `bearer ${accessToken}`, 'Content-Type': 'application/json' };
      const logs = [];
      const log = (msg) => { console.log(msg); logs.push(msg); };

      log('[PUNCH] 1) Buscando config do colaborador...');
      let config = null;
      try {
        const r = await fetch(`${BASE}/hcm/pontomobile_bff/queries/getEmployeeClockingConfigQuery`, {
          method: 'POST', headers: H, body: JSON.stringify({}),
        });
        const b = await r.json();
        config = b.employeeClockingConfig;
        log('[PUNCH] Config OK: ' + JSON.stringify(config).substring(0, 300));
      } catch (e) { log('[PUNCH] Config erro: ' + e.message); }

      if (!config || !config.employee) {
        log('[PUNCH] ❌ Não conseguiu obter config do colaborador');
        return { success: false, logs };
      }

      const emp = config.employee;
      const comp = emp.company;
      const tz = config.timeZone || 'America/Sao_Paulo';
      const useCode = (config.clockingEventUses && config.clockingEventUses[0]) ? config.clockingEventUses[0].code : '02';

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const clientDateTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

      log('[PUNCH] 2) Gerando signature...');
      const signInput = `${emp.pis}${comp.cnpj || comp.identifier || ''}${clientDateTime}`;
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(signInput));
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      const signatureB64 = btoa(hashHex);
      log('[PUNCH] Sign input: ' + signInput);
      log('[PUNCH] Sign hex: ' + hashHex);
      log('[PUNCH] Sign b64: ' + signatureB64);

      const clockingInfo = {
        company: {
          id: comp.id,
          arpId: comp.arpId,
          identifier: comp.cnpj,
          caepf: comp.caepf || '0',
          cnoNumber: comp.cnoNumber || '0',
        },
        employee: {
          id: emp.id,
          arpId: emp.arpId,
          cpf: emp.cpf,
          pis: emp.pis,
        },
        appVersion: '3.22.1',
        timeZone: tz,
        skipValidation: false,
        clientDateTimeEvent: clientDateTime,
        signature: {
          signatureVersion: 1,
          signature: signatureB64,
        },
        use: useCode,
      };

      log('[PUNCH] 3) Enviando ponto...');
      const body = { clockingInfo };
      log('[PUNCH] Body: ' + JSON.stringify(body));

      try {
        const r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify(body) });
        const b = await r.text();
        log(`[PUNCH] Response: ${r.status} ${b.substring(0, 500)}`);
        if (r.ok || r.status === 201 || r.status === 202) {
          log('[PUNCH] ✅ PONTO REGISTRADO COM SUCESSO!');
          return { success: true, logs, responseBody: b };
        }
      } catch (e) { log('[PUNCH] Erro: ' + e.message); }

      log('[PUNCH] 4) Tentando com skipValidation=true...');
      clockingInfo.skipValidation = true;
      try {
        const r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ clockingInfo }) });
        const b = await r.text();
        log(`[PUNCH] skipValidation: ${r.status} ${b.substring(0, 500)}`);
        if (r.ok || r.status === 201 || r.status === 202) {
          log('[PUNCH] ✅ PONTO REGISTRADO COM SUCESSO (skipValidation)!');
          return { success: true, logs, responseBody: b };
        }
      } catch (e) { log('[PUNCH] Erro: ' + e.message); }

      log('[PUNCH] 5) Tentando sem signature...');
      delete clockingInfo.signature;
      clockingInfo.skipValidation = false;
      try {
        const r = await fetch(URL, { method: 'POST', headers: H, body: JSON.stringify({ clockingInfo }) });
        const b = await r.text();
        log(`[PUNCH] Sem signature: ${r.status} ${b.substring(0, 500)}`);
        if (r.ok || r.status === 201 || r.status === 202) {
          log('[PUNCH] ✅ PONTO REGISTRADO COM SUCESSO (sem signature)!');
          return { success: true, logs, responseBody: b };
        }
      } catch (e) { log('[PUNCH] Erro: ' + e.message); }

      return { success: false, logs };
    },
  });

  const result = results && results[0] && results[0].result;
  if (result) {
    result.logs.forEach(l => console.log('[Senior Ponto]', l));
    if (result.success) {
      console.log('[Senior Ponto] ✅ Ponto registrado!');
      return result.responseBody || true;
    }
  }

  console.log('[Senior Ponto] ❌ Falhou — veja logs para detalhes');
  return false;
}

// ─── Relógio ao vivo ──────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('currentTime').textContent = `${h}:${m}:${s}`;

    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const d = `${days[now.getDay()]}, ${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`;
    document.getElementById('currentDate').textContent = d;
  }
  tick();
  clockInterval = setInterval(tick, 1000);

  // Re-renderizar a UI a cada minuto para atualizar contadores
  setInterval(() => renderUI(), 60000);
}

// ─── Inicialização ─────────────────────────────────────────────
async function init() {
  await loadState();

  // Preencher campos de settings
  document.getElementById('setJornada').value = settings.jornada / 60;
  document.getElementById('setAlmocoHorario').value = settings.almocoHorario || '12:00';
  document.getElementById('setAlmocoDur').value = settings.almocoDur;
  document.getElementById('setNotifAntecip').value = settings.notifAntecip;

  renderUI();
  startClock();
  updateTokenStatus();
  setInterval(updateTokenStatus, 15000);

  autoDetectFromPage();

  setInterval(pollPunches, 15000);

  // Última atualização
  const data = await chrome.storage.local.get(['pontoDate']);
  if (data.pontoDate) {
    document.getElementById('lastUpdate').textContent = `Hoje: ${data.pontoDate}`;
  }

  // Event listeners
  document.getElementById('btnClear').addEventListener('click', async () => {
    state = { entrada: null, almoco: null, volta: null, saida: null };
    notifScheduled = {};
    chrome.alarms.getAll((alarms) => {
      alarms.forEach(a => {
        if (a.name.startsWith('notif_')) chrome.alarms.clear(a.name);
      });
    });
    await saveState();
    renderUI();
    showToast('Limpo!');
  });

  document.getElementById('btnPunch').addEventListener('click', punchClock);

  document.getElementById('settingsToggle').addEventListener('click', () => {
    const p = document.getElementById('settingsPanel');
    p.classList.toggle('open');
  });

  document.getElementById('btnSaveSettings').addEventListener('click', async () => {
    const j = parseFloat(document.getElementById('setJornada').value) || 8;
    const ah = document.getElementById('setAlmocoHorario').value || '12:00';
    const ad = parseInt(document.getElementById('setAlmocoDur').value) || 60;
    const na = parseInt(document.getElementById('setNotifAntecip').value) || 10;

    settings.jornada = Math.round(j * 60);
    settings.almocoHorario = ah;
    settings.almocoDur = ad;
    settings.notifAntecip = na;

    await saveSettings();
    notifScheduled = {};
    renderUI();
    document.getElementById('settingsPanel').classList.remove('open');
    showToast('✓ Configurações salvas!');
  });
}

init();
