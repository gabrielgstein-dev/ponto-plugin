const params = new URLSearchParams(location.search);
const slot = params.get('slot');
const time = params.get('time') || '';

const SLOT_CONFIG = {
  entrada: { icon: '🌅', title: 'Hora da Entrada!', msg: 'Está na hora de bater o ponto de entrada e iniciar a jornada.' },
  almoco:  { icon: '🍽️', title: 'Hora do Almoço!', msg: 'Está na hora de bater o ponto de almoço.' },
  volta:   { icon: '💼', title: 'Hora de Voltar!',  msg: 'Está na hora de bater o ponto de volta do almoço.' },
  saida:   { icon: '🏠', title: 'Hora de Sair!',    msg: 'Está na hora de bater o ponto de saída.' },
};

const config = SLOT_CONFIG[slot] || { icon: '⏰', title: 'Lembrete de Ponto', msg: 'Está na hora de bater o ponto.' };

document.getElementById('icon').textContent = config.icon;
document.getElementById('title').textContent = config.title;
document.getElementById('msg').innerHTML =
  `${config.msg}${time ? ` Horário previsto: <strong>${time}</strong>.` : ''}`;

playReminderSound();

function clampVolume(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.max(0, Math.min(1, n));
}

async function playReminderSound() {
  try {
    const { pontoSettings } = await chrome.storage.local.get('pontoSettings');
    if (pontoSettings?.soundEnabled === false) return;
    const src = pontoSettings?.customSoundDataUrl || chrome.runtime.getURL('sounds/punch-reminder.mp3');
    const audio = new Audio(src);
    audio.volume = clampVolume(pontoSettings?.soundVolume);
    await audio.play();
  } catch {}
}

document.getElementById('btnOk').addEventListener('click', () => {
  try {
    chrome.runtime.sendMessage({ type: 'OPEN_PUNCH_PAGE' }, () => {
      void chrome.runtime.lastError;
      window.close();
    });
  } catch {
    window.close();
  }
});
