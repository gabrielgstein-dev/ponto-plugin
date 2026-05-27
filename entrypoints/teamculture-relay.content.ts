export default defineContentScript({
  matches: ['*://app.teamculture.com.br/*'],
  world: 'ISOLATED',
  runAt: 'document_start',

  main() {
    window.addEventListener('__sponto_tc_spy', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      try {
        chrome.runtime.sendMessage({ type: 'TC_SPY', payload: JSON.parse(detail) });
      } catch { /* extension context invalidated */ }
    });
  },
});
