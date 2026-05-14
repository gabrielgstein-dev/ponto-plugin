const params = new URLSearchParams(location.search);
const slot = params.get('slot');
const time = params.get('time') || '';
const escalated = params.get('escalated') === '1';

// Audio em loop até user agir. Sem isso o som tocava 1x e parava — fácil de
// não ouvir. Loop até clicar em qualquer botão ou fechar a janela.
let reminderAudio = null;

const SLOT_LABEL = { entrada: 'entrada', almoco: 'almoço', volta: 'volta do almoço', saida: 'saída' };

const NORMAL_CONFIG = {
  entrada: { icon: '🌅', title: 'Hora da Entrada!', msg: 'Está na hora de bater o ponto de entrada e iniciar a jornada.' },
  almoco:  { icon: '🍽️', title: 'Hora do Almoço!', msg: 'Está na hora de bater o ponto de almoço.' },
  volta:   { icon: '💼', title: 'Hora de Voltar!',  msg: 'Está na hora de bater o ponto de volta do almoço.' },
  saida:   { icon: '🏠', title: 'Hora de Sair!',    msg: 'Está na hora de bater o ponto de saída.' },
};

const cfg = NORMAL_CONFIG[slot] || { icon: '⏰', title: 'Lembrete de Ponto', msg: 'Está na hora de bater o ponto.' };
const slotLabel = SLOT_LABEL[slot] || 'ponto';

const iconEl = document.getElementById('icon');
const titleEl = document.getElementById('title');
const msgEl = document.getElementById('msg');
const actionsEl = document.getElementById('actions');

if (escalated) {
  document.body.classList.add('escalated');
  actionsEl.classList.add('escalated');
  iconEl.textContent = '⚠️';
  titleEl.textContent = 'Não consegui sincronizar';
  msgEl.innerHTML =
    `Já se passaram 20+ minutos do horário previsto (<strong>${time}</strong>) ` +
    `para o ${slotLabel}, mas o plugin não detectou a marcação. ` +
    `Você bateu no celular?`;
  renderEscalatedActions();
} else {
  iconEl.textContent = cfg.icon;
  titleEl.textContent = cfg.title;
  msgEl.innerHTML = `${cfg.msg}${time ? ` Horário previsto: <strong>${time}</strong>.` : ''}`;
  renderNormalActions();
  playReminderSound();
}

function renderNormalActions() {
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  btn.textContent = 'Registrar agora';
  btn.addEventListener('click', () => {
    stopReminderSound();
    safeSend({ type: 'OPEN_PUNCH_PAGE' });
    window.close();
  });
  actionsEl.appendChild(btn);
}

function renderEscalatedActions() {
  const actions = [
    {
      label: 'Já bati — registrar manualmente',
      cls: 'btn-primary',
      handler: () => {
        safeSend({ type: 'MARK_SLOT_PUNCHED', slot, time });
        window.close();
      },
    },
    {
      label: 'Abrir Senior pra sincronizar',
      cls: 'btn-secondary',
      handler: () => {
        safeSend({ type: 'OPEN_PUNCH_PAGE' });
        window.close();
      },
    },
    {
      label: 'Parar de lembrar hoje',
      cls: 'btn-tertiary',
      handler: () => {
        safeSend({ type: 'DISMISS_SLOT_REMINDERS', slot });
        window.close();
      },
    },
  ];
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.className = a.cls;
    btn.textContent = a.label;
    btn.addEventListener('click', a.handler);
    actionsEl.appendChild(btn);
  }
}

function safeSend(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
  } catch {}
}

function clampVolume(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.max(0, Math.min(1, n));
}

async function playReminderSound() {
  try {
    const { pontoSettings } = await chrome.storage.local.get('pontoSettings');
    if (pontoSettings?.soundEnabled === false) return;
    const src = pontoSettings?.customSoundDataUrl || chrome.runtime.getURL('sounds/punch-reminder.mp3');
    reminderAudio = new Audio(src);
    reminderAudio.loop = true;
    reminderAudio.volume = clampVolume(pontoSettings?.soundVolume);
    await reminderAudio.play();
  } catch {}
}

function stopReminderSound() {
  if (reminderAudio) {
    try {
      reminderAudio.pause();
      reminderAudio.currentTime = 0;
    } catch {}
    reminderAudio = null;
  }
}

// Garantia extra: se a janela fechar pelo X do browser sem passar por nenhum
// handler de botão, o evento `pagehide` (mais confiável que `beforeunload` em
// extension popups) para o som imediatamente em vez de esperar GC da Audio.
window.addEventListener('pagehide', stopReminderSound);
