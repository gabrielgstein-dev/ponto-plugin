const META_X_URL = 'https://app.teamculture.com.br/survey';
const params = new URLSearchParams(location.search);
const ctx = params.get('ctx') || 'morning';

const CONTEXT_COPY = {
  morning: {
    badge: 'Quarta · Meta X',
    title: 'Hora do Meta X 🚀',
    msg: 'Bora começar essa quarta respondendo o Meta X. Leva apenas <strong>2 min</strong>.',
    hint: '',
  },
  exit_gate: {
    badge: 'Antes da saída',
    title: 'Falta sua Meta X',
    msg: 'Você está prestes a bater o ponto de saída — mas ainda não respondeu a <strong>Meta X dessa semana</strong>. Sua opinião conta!',
    hint: 'O lembrete de saída abre logo após você responder.',
  },
  snooze: {
    badge: 'Lembrete · 30min depois',
    title: 'Voltando pra Meta X',
    msg: 'Já se passaram 30min. Que tal responder agora?',
    hint: '',
  },
  afternoon_notif: {
    badge: 'Quarta · Meta X',
    title: 'Última chamada — Meta X',
    msg: 'O dia está acabando e a sua pesquisa ainda não foi respondida. Vamos responder agora? Leva apenas <strong>2 minutinhos</strong>.',
    hint: '',
  },
  tuesday_preview: {
    badge: 'Terça · Lembrete',
    title: 'Amanhã é dia de Meta X',
    msg: 'Quarta tem Meta X — quer adiantar e já responder agora? Leva apenas <strong>2 min</strong>.',
    hint: '',
  },
};

const cfg = CONTEXT_COPY[ctx] || CONTEXT_COPY.morning;

document.getElementById('badge').textContent = cfg.badge;
document.getElementById('title').textContent = cfg.title;
document.getElementById('msg').innerHTML = cfg.msg;
document.getElementById('ctx-hint').textContent = cfg.hint;

document.getElementById('btn-respond').addEventListener('click', () => {
  safeSend({ type: 'OPEN_META_X_SURVEY' });
});

if (ctx === 'tuesday_preview') {
  document.getElementById('btn-snooze').style.display = 'none';
} else {
  document.getElementById('btn-snooze').addEventListener('click', () => {
    safeSend({ type: 'META_X_SNOOZE' });
    window.close();
  });
}

if (new Date().getDay() === 3) {
  chrome.storage.local.get('pontoSettings', (data) => {
    const settings = data.pontoSettings || {};
    if (settings.soundEnabled === false) return;
    const src = chrome.runtime.getURL('sounds/metax-reminder.mp3');
    const audio = new Audio(src);
    const maxVol = Math.max(0, Math.min(1, settings.soundVolume ?? 0.7));
    audio.volume = maxVol;
    const past17 = new Date().getHours() >= 17;
    if (past17) {
      audio.loop = true;
    } else {
      const FADE_DURATION = 1.5;
      audio.addEventListener('timeupdate', () => {
        const remaining = audio.duration - audio.currentTime;
        if (remaining < FADE_DURATION) {
          audio.volume = Math.max(0, maxVol * (remaining / FADE_DURATION));
        }
      });
    }
    audio.play().catch(() => {});
  });
}

function safeSend(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
  } catch {}
}
