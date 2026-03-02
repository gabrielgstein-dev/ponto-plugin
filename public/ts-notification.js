const params = new URLSearchParams(location.search);
const count = params.get('count') || '0';
document.getElementById('msg').innerHTML =
  `Você tem <strong>${count}</strong> apontamento${count !== '1' ? 's' : ''} no Timesheet sem observação.`;
document.getElementById('btnOk').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'CLOSE_TS_NOTIFICATION' }, () => {
    window.close();
  });
});
