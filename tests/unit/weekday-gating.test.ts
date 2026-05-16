/**
 * weekday-gating — bloqueio de lembretes em fim de semana.
 *
 * Settings.weekdaysOnly (default true) faz com que lembretes/popups/notifs
 * NÃO disparem em sábado e domingo. Cobre:
 *
 *   - isWeekend() helper (Dom=0, Sáb=6 → true; Seg-Sex → false)
 *   - scheduleNotifications skipa em fds quando weekdaysOnly=true
 *   - scheduleNotifications ainda roda em fds quando weekdaysOnly=false
 *   - handle alarm fire handlers (defense in depth) também skipam em fds
 *   - notifyPendingTimesheet skipa em fds
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock no topo (vi.mock é hoisted) pra evitar race condition com doMock/doUnmock
// entre tests. startReminderMock é o spy compartilhado — cada teste limpa via
// vi.clearAllMocks no beforeEach do chrome-mock global.
const { startReminderMock, resolveReminderMock } = vi.hoisted(() => ({
  startReminderMock: vi.fn().mockResolvedValue(undefined),
  resolveReminderMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/application/punch-reminder-manager', () => ({
  startReminder: startReminderMock,
  resolveReminder: resolveReminderMock,
  DISMISSED_SLOTS_KEY: 'punchPopupDismissedSlots',
}));

import { isWeekend } from '../../lib/domain/time-utils';
import { isReminderBlockedToday } from '../../lib/domain/weekday-gate';
import { scheduleNotifications } from '../../lib/application/schedule-notifications';
import {
  handlePunchPopupAlarm,
  handleNotifAlarm,
  handleReminderAlarm,
  handleDailyReset,
} from '../../lib/application/handle-alarm';
import { applySettings, resetNotifScheduled } from '../../lib/application/state';
import { DEFAULT_SETTINGS } from '../../lib/domain/types';
import { mockAlarmsCreate, mockStorageGet, mockStorageRemove } from '../setup/chrome-mock';

const SATURDAY = new Date(2026, 4, 16, 9, 0, 0); // 2026-05-16 = sábado
const SUNDAY = new Date(2026, 4, 17, 9, 0, 0);   // 2026-05-17 = domingo
const MONDAY = new Date(2026, 4, 18, 7, 0, 0);   // 2026-05-18 = segunda

beforeEach(() => {
  vi.useFakeTimers({ now: MONDAY });
  resetNotifScheduled();
  applySettings({ ...DEFAULT_SETTINGS });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isReminderBlockedToday() — lê pontoSettings do storage', () => {
  it('bloqueia em sábado quando pontoSettings.weekdaysOnly=true', async () => {
    vi.setSystemTime(SATURDAY);
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { weekdaysOnly: true } });
    expect(await isReminderBlockedToday()).toBe(true);
  });

  it('NÃO bloqueia em sábado quando pontoSettings.weekdaysOnly=false', async () => {
    vi.setSystemTime(SATURDAY);
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { weekdaysOnly: false } });
    expect(await isReminderBlockedToday()).toBe(false);
  });

  it('NÃO bloqueia em segunda independente da flag', async () => {
    vi.setSystemTime(MONDAY);
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { weekdaysOnly: true } });
    expect(await isReminderBlockedToday()).toBe(false);
  });

  it('fallback DEFAULT (weekdaysOnly:true) quando pontoSettings ausente — bloqueia em fds', async () => {
    // Cenário MV3: SW restartado, ainda não carregou pontoSettings.
    // Se user nunca customizou settings, pontoSettings é null → fallback DEFAULT.
    vi.setSystemTime(SATURDAY);
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: null });
    expect(await isReminderBlockedToday()).toBe(true);
  });

  it('fallback DEFAULT quando storage retorna {} (key ausente)', async () => {
    vi.setSystemTime(SATURDAY);
    mockStorageGet.mockResolvedValueOnce({});
    expect(await isReminderBlockedToday()).toBe(true);
  });

  it('fallback DEFAULT quando pontoSettings parcial sem weekdaysOnly', async () => {
    // Settings legado salvo antes do release do toggle: não tem weekdaysOnly.
    // Comportamento: vira true (default), bloqueia em fds.
    vi.setSystemTime(SATURDAY);
    mockStorageGet.mockResolvedValueOnce({
      pontoSettings: { jornada: 480, entradaHorario: '08:00' },
    });
    expect(await isReminderBlockedToday()).toBe(true);
  });
});

describe('isWeekend()', () => {
  it('retorna true para sábado', () => {
    expect(isWeekend(SATURDAY)).toBe(true);
  });

  it('retorna true para domingo', () => {
    expect(isWeekend(SUNDAY)).toBe(true);
  });

  it('retorna false para segunda', () => {
    expect(isWeekend(MONDAY)).toBe(false);
  });

  it('retorna false para sexta', () => {
    const friday = new Date(2026, 4, 15, 9, 0, 0); // 2026-05-15 = sexta
    expect(isWeekend(friday)).toBe(false);
  });

  it('usa Date() atual quando chamado sem argumento', () => {
    vi.setSystemTime(SATURDAY);
    expect(isWeekend()).toBe(true);
    vi.setSystemTime(MONDAY);
    expect(isWeekend()).toBe(false);
  });
});

describe('scheduleNotifications() — gating weekdaysOnly', () => {
  it('NÃO agenda alarmes em sábado quando weekdaysOnly=true (default)', () => {
    vi.setSystemTime(SATURDAY);
    scheduleNotifications(null, null, null, null);
    expect(mockAlarmsCreate).not.toHaveBeenCalled();
  });

  it('NÃO agenda alarmes em domingo quando weekdaysOnly=true (default)', () => {
    vi.setSystemTime(SUNDAY);
    scheduleNotifications(null, null, null, null);
    expect(mockAlarmsCreate).not.toHaveBeenCalled();
  });

  it('agenda normalmente em segunda quando weekdaysOnly=true', () => {
    vi.setSystemTime(MONDAY);
    scheduleNotifications(null, null, null, null);
    expect(mockAlarmsCreate).toHaveBeenCalled();
    const keys = mockAlarmsCreate.mock.calls.map(c => c[0] as string);
    expect(keys).toContain('punch_popup_entrada');
  });

  it('agenda em fim de semana quando weekdaysOnly=false (user que trabalha fds)', () => {
    applySettings({ weekdaysOnly: false });
    vi.setSystemTime(SATURDAY);
    // setSystemTime mantém hora 09:00 do construtor → mas entrada é 08:00 (passou).
    // Volta pra 07:00 pra entrada=08:00 ficar no futuro.
    vi.setSystemTime(new Date(2026, 4, 16, 7, 0, 0));
    scheduleNotifications(null, null, null, null);
    const keys = mockAlarmsCreate.mock.calls.map(c => c[0] as string);
    expect(keys).toContain('punch_popup_entrada');
  });
});

describe('handle-alarm fire handlers — gating weekdaysOnly (defense in depth)', () => {
  // O gate lê pontoSettings do storage — primeira chamada de get é
  // consumida pelo isReminderBlockedToday, segunda pelos dados do handler.
  beforeEach(() => {
    startReminderMock.mockClear();
  });

  it('handlePunchPopupAlarm NÃO chama startReminder em sábado com weekdaysOnly=true', async () => {
    vi.setSystemTime(SATURDAY);
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { weekdaysOnly: true } });
    mockStorageGet.mockResolvedValueOnce({ alarm_time_punch_popup_almoco: '12:00' });
    await handlePunchPopupAlarm('punch_popup_almoco', Date.now());

    expect(startReminderMock).not.toHaveBeenCalled();
    expect(mockStorageRemove).toHaveBeenCalledWith('alarm_time_punch_popup_almoco');
  });

  it('handleNotifAlarm NÃO cria notification em domingo com weekdaysOnly=true', async () => {
    const notifCreate = vi.fn((_id, _opts, cb) => cb('id'));
    (globalThis as unknown as { chrome: { notifications: unknown } }).chrome.notifications = {
      create: notifCreate,
      clear: vi.fn(),
    };

    vi.setSystemTime(SUNDAY);
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { weekdaysOnly: true } });
    mockStorageGet.mockResolvedValueOnce({ alarm_msg_notif_almoco: 'Hora do almoço em 10 minutos!' });
    await handleNotifAlarm('notif_almoco', Date.now());

    expect(notifCreate).not.toHaveBeenCalled();
    expect(mockStorageRemove).toHaveBeenCalledWith('alarm_msg_notif_almoco');
  });

  it('handleReminderAlarm NÃO cria notification em sábado com weekdaysOnly=true', async () => {
    const notifCreate = vi.fn((_id, _opts, cb) => cb('id'));
    (globalThis as unknown as { chrome: { notifications: unknown } }).chrome.notifications = {
      create: notifCreate,
      clear: vi.fn(),
    };

    vi.setSystemTime(SATURDAY);
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { weekdaysOnly: true } });
    mockStorageGet.mockResolvedValueOnce({
      pontoState: { entrada: '08:00', almoco: null, volta: null, saida: null },
      alarm_msg_reminder_almoco: 'Você ainda não bateu o almoço! (30 min em atraso)',
    });
    await handleReminderAlarm('reminder_almoco', Date.now());

    expect(notifCreate).not.toHaveBeenCalled();
    expect(mockStorageRemove).toHaveBeenCalledWith('alarm_msg_reminder_almoco');
  });

  it('handlePunchPopupAlarm AINDA dispara em sábado com weekdaysOnly=false', async () => {
    vi.setSystemTime(SATURDAY);
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { weekdaysOnly: false } });
    mockStorageGet.mockResolvedValueOnce({ alarm_time_punch_popup_almoco: '12:00' });
    await handlePunchPopupAlarm('punch_popup_almoco', Date.now());

    expect(startReminderMock).toHaveBeenCalledWith('almoco', '12:00');
  });

  it('handlePunchPopupAlarm bloqueia em sábado quando storage sem pontoSettings (fallback DEFAULT.weekdaysOnly=true)', async () => {
    // Sanity: SW recém-restartado, user mantém defaults (weekdaysOnly:true).
    // storage.get('pontoSettings') retorna {} → fallback DEFAULT_SETTINGS.weekdaysOnly=true
    // → em sábado, bloqueia.
    vi.setSystemTime(SATURDAY);
    mockStorageGet.mockResolvedValueOnce({}); // pontoSettings ausente → fallback default
    mockStorageGet.mockResolvedValueOnce({ alarm_time_punch_popup_almoco: '12:00' });
    await handlePunchPopupAlarm('punch_popup_almoco', Date.now());

    expect(startReminderMock).not.toHaveBeenCalled();
  });
});

describe('scheduleTsNotifications() — gating weekdaysOnly', () => {
  it('NÃO agenda ts_after_entrada em sábado com weekdaysOnly=true', async () => {
    const { scheduleTsNotifications, resetTsScheduled } = await import('../../lib/application/schedule-ts-notifications');
    resetTsScheduled();
    applySettings({ ...DEFAULT_SETTINGS });

    vi.setSystemTime(new Date(2026, 4, 16, 7, 0, 0)); // sábado 07:00
    scheduleTsNotifications(480, null, null, false, false); // entrada=08:00 → ts_after_entrada=10:00
    expect(mockAlarmsCreate).not.toHaveBeenCalled();
  });

  it('AINDA agenda em sábado com weekdaysOnly=false', async () => {
    const { scheduleTsNotifications, resetTsScheduled } = await import('../../lib/application/schedule-ts-notifications');
    resetTsScheduled();
    applySettings({ ...DEFAULT_SETTINGS, weekdaysOnly: false });

    vi.setSystemTime(new Date(2026, 4, 16, 7, 0, 0));
    scheduleTsNotifications(480, null, null, false, false);
    const keys = mockAlarmsCreate.mock.calls.map(c => c[0] as string);
    expect(keys).toContain('ts_after_entrada');
  });
});

describe('notifyPendingTimesheet() — gating weekdaysOnly', () => {
  it('NÃO abre popup em domingo com weekdaysOnly=true mesmo com pendentes', async () => {
    vi.resetModules();
    // Stub providers/build-flags pra notifyPendingTimesheet importar limpo
    vi.doMock('../../lib/domain/build-flags', () => ({
      DEBUG: false, ACTIVE_COMPANY: 'meta', APP_NAME: 'Test',
      ENABLE_SENIOR_INTEGRATION: false, ENABLE_SENIOR_PUNCH_BUTTON: false,
      ENABLE_MANUAL_PUNCH: false, ENABLE_WIDGET: false, ENABLE_YESTERDAY: false,
      ENABLE_NOTIFICATIONS: false, ENABLE_META_TIMESHEET: true, THEME: 'default',
    }));
    vi.doMock('#company/providers', () => ({
      getCompanyPunchProviders: vi.fn().mockReturnValue([]),
      getTimesheetProvider: vi.fn().mockReturnValue({
        isAvailable: vi.fn().mockResolvedValue(false),
        getSummary: vi.fn().mockResolvedValue(null),
        updateEntry: vi.fn().mockResolvedValue(true),
        name: 'metaTs',
      }),
    }));

    const { notifyPendingTimesheet, resetTsNotifDebounce } = await import('../../lib/application/background-detect');
    const { applySettings: apply } = await import('../../lib/application/state');
    const { mockWindowsCreate } = await import('../setup/chrome-mock');
    resetTsNotifDebounce();
    apply({ ...DEFAULT_SETTINGS });

    vi.setSystemTime(SUNDAY);
    mockStorageGet.mockResolvedValueOnce({ pontoSettings: { weekdaysOnly: true } });
    mockStorageGet.mockResolvedValueOnce({
      timesheetSummaryCache: {
        period: '2026-05', pendingHours: 4, approvedHours: 0, reprovedHours: 0, totalReportedHours: 4,
        entries: [{
          id: 'e1', date: '2026-05-15', hourQuantity: 4, status: 'PENDING',
          costCenter: { code: '1', name: 'Dev' }, task: null, hourType: null,
          observation: null, isAutomatic: false,
        }],
      },
      tsNotifWindowId: null,
      pontoState: { entrada: '09:00', almoco: null, volta: null, saida: null },
      tsNotifDismissedTs: 0,
    });
    await notifyPendingTimesheet();
    expect(mockWindowsCreate).not.toHaveBeenCalled();

    vi.doUnmock('../../lib/domain/build-flags');
    vi.doUnmock('#company/providers');
  });
});

describe('handleDailyReset() em fim de semana', () => {
  it('continua limpando alarms mesmo em sábado (só scheduleNotifications gateia internamente)', async () => {
    // Stub alarms.getAll com 2 alarms de notif que devem ser limpos
    const alarmsGetAll = vi.fn().mockResolvedValue([
      { name: 'notif_almoco' }, { name: 'reminder_saida' },
    ]);
    (globalThis as unknown as { chrome: { alarms: { getAll: typeof alarmsGetAll; clear: typeof vi.fn } } })
      .chrome.alarms.getAll = alarmsGetAll;

    applySettings({ ...DEFAULT_SETTINGS });
    vi.setSystemTime(SATURDAY);
    mockStorageGet.mockResolvedValue({});  // ambas leituras (pontoSettings + outras) → {}
    mockAlarmsCreate.mockClear();
    await handleDailyReset();

    // Mesmo em sábado: alarms antigos são limpos (dailyReset não é skipado)
    expect(alarmsGetAll).toHaveBeenCalled();
    // scheduleNotifications É chamado internamente, mas o gate dele retorna
    // early em fds → nenhum alarm novo é criado.
    expect(mockAlarmsCreate).not.toHaveBeenCalled();
  });
});
