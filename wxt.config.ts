import { resolve } from 'path';
import { defineConfig } from 'wxt';
import { ACTIVE_COMPANY, APP_NAME, ENABLE_SENIOR_INTEGRATION, ENABLE_NOTIFICATIONS, ENABLE_WIDGET, ENABLE_META_TIMESHEET, THEME } from './lib/domain/build-flags';
import { generateCSSVariables } from './lib/domain/theme-utils';
import { readFileSync, writeFileSync } from 'fs';

const basePermissions: string[] = ['storage', 'alarms', 'sidePanel'];
const seniorPermissions: string[] = ['activeTab', 'tabs', 'scripting', 'webRequest', 'cookies'];
const metaTimesheetPermissions: string[] = ['webRequest', 'tabs', 'scripting', 'cookies'];
const notifPermissions: string[] = ['notifications'];

const permissions = [
  ...basePermissions,
  ...(ENABLE_SENIOR_INTEGRATION ? seniorPermissions : []),
  ...(ENABLE_META_TIMESHEET ? metaTimesheetPermissions : []),
  ...(ENABLE_NOTIFICATIONS ? notifPermissions : []),
];

const hostPermissions = ENABLE_SENIOR_INTEGRATION || ENABLE_WIDGET || ENABLE_META_TIMESHEET ? ['<all_urls>'] : [];

function injectThemeCSS() {
  const themeCSSPath = resolve(__dirname, 'lib/presentation/theme.css');
  let themeCSS = readFileSync(themeCSSPath, 'utf-8');
  const cssVars = generateCSSVariables();
  themeCSS = themeCSS.replace('/* CSS variables will be injected here by the build process */', cssVars);
  writeFileSync(themeCSSPath, themeCSS);
}

injectThemeCSS();

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: `${APP_NAME}`,
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
  vite: () => ({
    resolve: {
      alias: {
        '#company': resolve(__dirname, `lib/infrastructure/${ACTIVE_COMPANY}`),
      },
    },
  }),
});
