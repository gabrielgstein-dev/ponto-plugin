import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mockStorageGet,
  mockStorageSet,
  mockStorageRemove,
  mockWindowsGet,
  mockWindowsCreate,
  mockWindowsRemove,
  mockAlarmsCreate,
  mockAlarmsClear,
  mockNotificationsCreate,
  mockActionSetBadgeText,
} from '../setup/chrome-mock';
import {
  openInsiXPopup,
  markInsiXResponded,
  snoozeInsiXReminder,
  handleInsiXSnoozeAlarm,
  handleInsiXDailyNotify,
  scheduleInsiXAfternoonAlarm,
  INSI_X_SNOOZE_ALARM,
  INSI_X_NOTIFY_ALARM,
} from '../../lib/application/insi-x-reminder-manager';
import { getIsoWeekKey } from '../../lib/domain/insi-x-status';

const wed = new Date(2026, 4, 20); // quarta
const tue = new Date(2026, 4, 19); // terça
const thu = new Date(2026, 4, 21); // quinta

function storageWith(data: Record<string, unknown>) {
  mockStorageGet.mockResolvedValue(data);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('openInsiXPopup', () => {
  it('abre janela quando elegível (quarta, não respondido, toggle ON)', async () => {
    storageWith({
      pontoSettings: { insiXReminder: true },
      insiXState: null,
      insiXPopupWindowId: undefined,
    });
    vi.setSystemTime(wed);
    await openInsiXPopup('morning');
    expect(mockWindowsCreate).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining('insi-x-reminder.html'),
      type: 'popup',
    }));
  });

  it('não abre se toggle OFF', async () => {
    storageWith({ pontoSettings: { insiXReminder: false }, insiXState: null });
    vi.setSystemTime(wed);
    await openInsiXPopup('morning');
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });

  it('não abre se já respondeu nessa semana', async () => {
    storageWith({
      pontoSettings: { insiXReminder: true },
      insiXState: { lastRespondedWeekKey: getIsoWeekKey(wed), lastRespondedAt: Date.now() },
    });
    vi.setSystemTime(wed);
    await openInsiXPopup('morning');
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });

  it('não abre fora de terça/quarta', async () => {
    storageWith({ pontoSettings: { insiXReminder: true }, insiXState: null });
    vi.setSystemTime(thu);
    await openInsiXPopup('morning');
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });

  it('abre na terça também', async () => {
    storageWith({ pontoSettings: { insiXReminder: true }, insiXState: null });
    vi.setSystemTime(tue);
    await openInsiXPopup('morning');
    expect(mockWindowsCreate).toHaveBeenCalled();
  });

  it('não abre segunda janela se uma já está aberta', async () => {
    storageWith({
      pontoSettings: { insiXReminder: true },
      insiXState: null,
      insiXPopupWindowId: 77,
    });
    mockWindowsGet.mockResolvedValueOnce({ id: 77 });
    vi.setSystemTime(wed);
    await openInsiXPopup('morning');
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });
});

describe('markInsiXResponded', () => {
  it('persiste weekKey, cancela snooze e fecha janela', async () => {
    storageWith({ insiXPopupWindowId: 42 });
    await markInsiXResponded(wed);
    expect(mockStorageSet).toHaveBeenCalledWith({
      insiXState: { lastRespondedWeekKey: getIsoWeekKey(wed), lastRespondedAt: wed.getTime() },
    });
    expect(mockAlarmsClear).toHaveBeenCalledWith(INSI_X_SNOOZE_ALARM);
    expect(mockWindowsRemove).toHaveBeenCalledWith(42);
  });

  it('atualiza badge ao responder', async () => {
    storageWith({ insiXPopupWindowId: undefined });
    await markInsiXResponded(wed);
    expect(mockActionSetBadgeText).toHaveBeenCalled();
  });
});

describe('snoozeInsiXReminder', () => {
  it('agenda alarm insi_x_snooze daqui 30 min', async () => {
    storageWith({ insiXPopupWindowId: 55 });
    await snoozeInsiXReminder();
    expect(mockAlarmsClear).toHaveBeenCalledWith(INSI_X_SNOOZE_ALARM);
    expect(mockAlarmsCreate).toHaveBeenCalledWith(INSI_X_SNOOZE_ALARM, { delayInMinutes: 30 });
    expect(mockWindowsRemove).toHaveBeenCalledWith(55);
  });
});

describe('handleInsiXSnoozeAlarm', () => {
  it('reabre popup quando ainda elegível', async () => {
    storageWith({
      pontoSettings: { insiXReminder: true },
      insiXState: null,
      insiXPopupWindowId: undefined,
    });
    vi.setSystemTime(wed);
    await handleInsiXSnoozeAlarm();
    expect(mockWindowsCreate).toHaveBeenCalled();
  });

  it('não faz nada se já respondeu entre o snooze e agora', async () => {
    storageWith({
      pontoSettings: { insiXReminder: true },
      insiXState: { lastRespondedWeekKey: getIsoWeekKey(wed), lastRespondedAt: Date.now() },
    });
    vi.setSystemTime(wed);
    await handleInsiXSnoozeAlarm();
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });
});

describe('handleInsiXDailyNotify', () => {
  it('dispara notification OS-level + popup quando elegível', async () => {
    storageWith({
      pontoSettings: { insiXReminder: true },
      insiXState: null,
      insiXPopupWindowId: undefined,
    });
    vi.setSystemTime(wed);
    await handleInsiXDailyNotify();
    expect(mockNotificationsCreate).toHaveBeenCalled();
    expect(mockWindowsCreate).toHaveBeenCalled();
  });

  it('nada acontece se já respondeu', async () => {
    storageWith({
      pontoSettings: { insiXReminder: true },
      insiXState: { lastRespondedWeekKey: getIsoWeekKey(wed), lastRespondedAt: Date.now() },
    });
    vi.setSystemTime(wed);
    await handleInsiXDailyNotify();
    expect(mockNotificationsCreate).not.toHaveBeenCalled();
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });
});

describe('scheduleInsiXAfternoonAlarm', () => {
  it('agenda alarm pras 16h da quarta', async () => {
    const morning = new Date(2026, 4, 20, 9, 0, 0);
    await scheduleInsiXAfternoonAlarm(morning);
    const expectedTarget = new Date(2026, 4, 20, 16, 0, 0).getTime();
    expect(mockAlarmsClear).toHaveBeenCalledWith(INSI_X_NOTIFY_ALARM);
    expect(mockAlarmsCreate).toHaveBeenCalledWith(INSI_X_NOTIFY_ALARM, { when: expectedTarget });
  });

  it('não agenda se já passou das 16h', async () => {
    const evening = new Date(2026, 4, 20, 17, 0, 0);
    await scheduleInsiXAfternoonAlarm(evening);
    expect(mockAlarmsCreate).not.toHaveBeenCalled();
  });

  it('não agenda em outros dias', async () => {
    await scheduleInsiXAfternoonAlarm(tue);
    expect(mockAlarmsCreate).not.toHaveBeenCalled();
  });
});
