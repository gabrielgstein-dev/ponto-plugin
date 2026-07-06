import { ENABLE_NETLOG_CAPTURE } from '../lib/domain/build-flags';
import { installNetLogCapture } from '../lib/presentation/netlog-capture';

/**
 * Captura genérica de tráfego (mundo MAIN) em TODOS os hosts. Dev only —
 * quando a flag está off o entrypoint nem casa em nenhuma URL real, então não
 * é injetado em produção.
 */
export default defineContentScript({
  matches: ENABLE_NETLOG_CAPTURE ? ['<all_urls>'] : ['https://netcap.disabled.invalid/*'],
  world: 'MAIN',
  runAt: 'document_start',

  main() {
    if (!ENABLE_NETLOG_CAPTURE) return;
    installNetLogCapture();
  },
});
