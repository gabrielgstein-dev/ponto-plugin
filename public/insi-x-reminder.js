const INSI_X_URL = 'https://app.teamculture.com.br/survey';
const params = new URLSearchParams(location.search);
const ctx = params.get('ctx') || 'morning';

const CONTEXT_COPY = {
  morning: {
    badge: 'Quarta · Insi X',
    title: 'Hora do Insi X 🚀',
    msg: 'Bora começar essa quarta respondendo o Insi X. Leva apenas <strong>2 min</strong>.',
    hint: '',
  },
  exit_gate: {
    badge: 'Antes da saída',
    title: 'Falta sua Insi X',
    msg: 'Você está prestes a bater o ponto de saída — mas ainda não respondeu a <strong>Insi X dessa semana</strong>. Sua opinião conta!',
    hint: 'O lembrete de saída abre logo após você responder.',
  },
  snooze: {
    badge: 'Lembrete · 30min depois',
    title: 'Voltando pra Insi X',
    msg: 'Já se passaram 30min. Que tal responder agora?',
    hint: '',
  },
  afternoon_notif: {
    badge: 'Quarta · Insi X',
    title: 'Última chamada — Insi X',
    msg: 'O dia está acabando e a sua pesquisa ainda não foi respondida. Vamos responder agora? Leva apenas <strong>2 minutinhos</strong>.',
    hint: '',
  },
  tuesday_preview: {
    badge: 'Terça · Lembrete',
    title: 'Amanhã é dia de Insi X',
    msg: 'Quarta tem Insi X — quer adiantar e já responder agora? Leva apenas <strong>2 min</strong>.',
    hint: '',
  },
};

const cfg = CONTEXT_COPY[ctx] || CONTEXT_COPY.morning;

document.getElementById('badge').textContent = cfg.badge;
document.getElementById('title').textContent = cfg.title;
document.getElementById('msg').innerHTML = cfg.msg;
document.getElementById('ctx-hint').textContent = cfg.hint;

document.getElementById('btn-respond').addEventListener('click', () => {
  safeSend({ type: 'OPEN_INSI_X_SURVEY' });
});

if (ctx === 'tuesday_preview') {
  document.getElementById('btn-snooze').style.display = 'none';
} else {
  document.getElementById('btn-snooze').addEventListener('click', () => {
    // NÃO fecha a janela aqui. Quem fecha é o background (snoozeInsiXReminder →
    // closePopup), que remove `insiXPopupWindowId` do storage ANTES de remover a
    // janela. Se o popup fechasse sozinho com window.close() síncrono, dois bugs
    // aconteciam:
    //   1. `windows.onRemoved` disparava com `insiXPopupWindowId` ainda setado →
    //      a lógica de "reabrir após 17h" reabria o popup ~2s depois (o sintoma
    //      "fecho e abre de novo na sequência").
    //   2. Em MV3, fechar a página na mesma volta do sendMessage podia descartar
    //      a IPC antes de chegar no service worker dormente — o snooze de 30min
    //      nunca era agendado.
    // Mantendo a página viva, a mensagem é entregue e o background fecha a janela
    // pelo caminho seguro. O botão fica desabilitado pra evitar duplo-clique.
    const btn = document.getElementById('btn-snooze');
    btn.disabled = true;
    btn.style.opacity = '0.6';
    safeSend({ type: 'INSI_X_SNOOZE' });
  });
}

if (new Date().getDay() === 3) {
  chrome.storage.local.get('pontoSettings', (data) => {
    const settings = data.pontoSettings || {};
    if (settings.soundEnabled === false) return;
    const src = chrome.runtime.getURL('sounds/insix-reminder.mp3');
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
