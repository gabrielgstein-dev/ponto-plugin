import { defineConfig } from 'wxt';
import { APP_NAME, ENABLE_SENIOR_INTEGRATION, ENABLE_NOTIFICATIONS, ENABLE_WIDGET } from './lib/domain/build-flags';

const basePermissions: string[] = ['storage', 'alarms', 'sidePanel'];
const seniorPermissions: string[] = ['activeTab', 'tabs', 'scripting', 'webRequest', 'cookies'];
const notifPermissions: string[] = ['notifications'];

const permissions = [
  ...basePermissions,
  ...(ENABLE_SENIOR_INTEGRATION ? seniorPermissions : []),
  ...(ENABLE_NOTIFICATIONS ? notifPermissions : []),
];

const hostPermissions = ENABLE_SENIOR_INTEGRATION || ENABLE_WIDGET ? ['<all_urls>'] : [];

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: `${APP_NAME} — Calculadora de Horários`,
    description: 'Calcula automaticamente seus horários de almoço e saída com base nos batimentos do ponto.',
    permissions,
    host_permissions: hostPermissions,
    icons: {
      16: '/icons/icon16.png',
      32: '/icons/icon32.png',
      48: '/icons/icon48.png',
      128: '/icons/icon128.png',
    },
  },
});
