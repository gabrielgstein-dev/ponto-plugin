import { ENABLE_NETLOG_CAPTURE } from '../lib/domain/build-flags';
import { installNetLogForward } from '../lib/presentation/netlog-capture';

/**
 * Encaminhador da captura genérica (mundo ISOLATED) em TODOS os hosts. Recebe
 * os eventos disparados pelo `netcap.content.ts` (MAIN) e manda pro background.
 * Dev only — ver `netcap.content.ts`.
 */
export default defineContentScript({
  matches: ENABLE_NETLOG_CAPTURE ? ['<all_urls>'] : ['https://netcap.disabled.invalid/*'],
  runAt: 'document_start',

  main() {
    if (!ENABLE_NETLOG_CAPTURE) return;
    installNetLogForward();
  },
});
