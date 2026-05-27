const META_X_URL = 'https://app.teamculture.com.br/survey';
const params = new URLSearchParams(location.search);
const ctx = params.get('ctx') || 'morning';

const CONTEXT_COPY = {
  morning: {
    badge: 'Quarta · Meta X',
    title: 'Hora da Meta X 🚀',
    msg: 'Bora começar a semana respondendo a Meta X de hoje? Leva uns <strong>2min</strong>.',
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
    badge: 'Quarta · 16h',
    title: 'Última chamada — Meta X',
    msg: 'O dia tá acabando e sua Meta X ainda não foi respondida. <strong>2min</strong> garantem semana completa.',
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

document.getElementById('btn-snooze').addEventListener('click', () => {
  safeSend({ type: 'META_X_SNOOZE' });
  window.close();
});

if (new Date().getDay() === 3) {
  chrome.storage.local.get('pontoSettings', (data) => {
    const settings = data.pontoSettings || {};
    if (settings.soundEnabled === false) return;
    const src = chrome.runtime.getURL('sounds/metax-reminder.mp3');
    const audio = new Audio(src);
    const maxVol = Math.max(0, Math.min(1, settings.soundVolume ?? 0.7));
    audio.volume = maxVol;
    const FADE_DURATION = 1.5;
    audio.addEventListener('timeupdate', () => {
      const remaining = audio.duration - audio.currentTime;
      if (remaining < FADE_DURATION) {
        audio.volume = Math.max(0, maxVol * (remaining / FADE_DURATION));
      }
    });
    audio.play().catch(() => {});
  });
}

function safeSend(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
  } catch {}
}
