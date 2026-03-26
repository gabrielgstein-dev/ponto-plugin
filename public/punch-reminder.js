const params = new URLSearchParams(location.search);
const slot = params.get('slot');
const time = params.get('time') || '';

const SLOT_CONFIG = {
  almoco: { icon: '🍽️', title: 'Hora do Almoço!', msg: 'Está na hora de bater o ponto de almoço.' },
  volta:  { icon: '💼', title: 'Hora de Voltar!',  msg: 'Está na hora de bater o ponto de volta do almoço.' },
  saida:  { icon: '🏠', title: 'Hora de Sair!',    msg: 'Está na hora de bater o ponto de saída.' },
};

const config = SLOT_CONFIG[slot] || { icon: '⏰', title: 'Lembrete de Ponto', msg: 'Está na hora de bater o ponto.' };

document.getElementById('icon').textContent = config.icon;
document.getElementById('title').textContent = config.title;
document.getElementById('msg').innerHTML =
  `${config.msg}${time ? ` Horário previsto: <strong>${time}</strong>.` : ''}`;

document.getElementById('btnOk').addEventListener('click', () => {
  window.close();
});
