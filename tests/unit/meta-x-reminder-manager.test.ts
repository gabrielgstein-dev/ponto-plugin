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
  openMetaXPopup,
  markMetaXResponded,
  snoozeMetaXReminder,
  handleMetaXSnoozeAlarm,
  handleMetaXDailyNotify,
  scheduleMetaXAfternoonAlarm,
  META_X_SNOOZE_ALARM,
  META_X_NOTIFY_ALARM,
} from '../../lib/application/meta-x-reminder-manager';
import { getIsoWeekKey } from '../../lib/domain/meta-x-status';

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

describe('openMetaXPopup', () => {
  it('abre janela quando elegível (quarta, não respondido, toggle ON)', async () => {
    storageWith({
      pontoSettings: { metaXReminder: true },
      metaXState: null,
      metaXPopupWindowId: undefined,
    });
    vi.setSystemTime(wed);
    await openMetaXPopup('morning');
    expect(mockWindowsCreate).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining('meta-x-reminder.html'),
      type: 'popup',
    }));
  });

  it('não abre se toggle OFF', async () => {
    storageWith({ pontoSettings: { metaXReminder: false }, metaXState: null });
    vi.setSystemTime(wed);
    await openMetaXPopup('morning');
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });

  it('não abre se já respondeu nessa semana', async () => {
    storageWith({
      pontoSettings: { metaXReminder: true },
      metaXState: { lastRespondedWeekKey: getIsoWeekKey(wed), lastRespondedAt: Date.now() },
    });
    vi.setSystemTime(wed);
    await openMetaXPopup('morning');
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });

  it('não abre fora de terça/quarta', async () => {
    storageWith({ pontoSettings: { metaXReminder: true }, metaXState: null });
    vi.setSystemTime(thu);
    await openMetaXPopup('morning');
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });

  it('abre na terça também', async () => {
    storageWith({ pontoSettings: { metaXReminder: true }, metaXState: null });
    vi.setSystemTime(tue);
    await openMetaXPopup('morning');
    expect(mockWindowsCreate).toHaveBeenCalled();
  });

  it('não abre segunda janela se uma já está aberta', async () => {
    storageWith({
      pontoSettings: { metaXReminder: true },
      metaXState: null,
      metaXPopupWindowId: 77,
    });
    mockWindowsGet.mockResolvedValueOnce({ id: 77 });
    vi.setSystemTime(wed);
    await openMetaXPopup('morning');
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });
});

describe('markMetaXResponded', () => {
  it('persiste weekKey, cancela snooze e fecha janela', async () => {
    storageWith({ metaXPopupWindowId: 42 });
    await markMetaXResponded(wed);
    expect(mockStorageSet).toHaveBeenCalledWith({
      metaXState: { lastRespondedWeekKey: getIsoWeekKey(wed), lastRespondedAt: wed.getTime() },
    });
    expect(mockAlarmsClear).toHaveBeenCalledWith(META_X_SNOOZE_ALARM);
    expect(mockWindowsRemove).toHaveBeenCalledWith(42);
  });

  it('atualiza badge ao responder', async () => {
    storageWith({ metaXPopupWindowId: undefined });
    await markMetaXResponded(wed);
    expect(mockActionSetBadgeText).toHaveBeenCalled();
  });
});

describe('snoozeMetaXReminder', () => {
  it('agenda alarm meta_x_snooze daqui 30 min', async () => {
    storageWith({ metaXPopupWindowId: 55 });
    await snoozeMetaXReminder();
    expect(mockAlarmsClear).toHaveBeenCalledWith(META_X_SNOOZE_ALARM);
    expect(mockAlarmsCreate).toHaveBeenCalledWith(META_X_SNOOZE_ALARM, { delayInMinutes: 30 });
    expect(mockWindowsRemove).toHaveBeenCalledWith(55);
  });
});

describe('handleMetaXSnoozeAlarm', () => {
  it('reabre popup quando ainda elegível', async () => {
    storageWith({
      pontoSettings: { metaXReminder: true },
      metaXState: null,
      metaXPopupWindowId: undefined,
    });
    vi.setSystemTime(wed);
    await handleMetaXSnoozeAlarm();
    expect(mockWindowsCreate).toHaveBeenCalled();
  });

  it('não faz nada se já respondeu entre o snooze e agora', async () => {
    storageWith({
      pontoSettings: { metaXReminder: true },
      metaXState: { lastRespondedWeekKey: getIsoWeekKey(wed), lastRespondedAt: Date.now() },
    });
    vi.setSystemTime(wed);
    await handleMetaXSnoozeAlarm();
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });
});

describe('handleMetaXDailyNotify', () => {
  it('dispara notification OS-level + popup quando elegível', async () => {
    storageWith({
      pontoSettings: { metaXReminder: true },
      metaXState: null,
      metaXPopupWindowId: undefined,
    });
    vi.setSystemTime(wed);
    await handleMetaXDailyNotify();
    expect(mockNotificationsCreate).toHaveBeenCalled();
    expect(mockWindowsCreate).toHaveBeenCalled();
  });

  it('nada acontece se já respondeu', async () => {
    storageWith({
      pontoSettings: { metaXReminder: true },
      metaXState: { lastRespondedWeekKey: getIsoWeekKey(wed), lastRespondedAt: Date.now() },
    });
    vi.setSystemTime(wed);
    await handleMetaXDailyNotify();
    expect(mockNotificationsCreate).not.toHaveBeenCalled();
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });
});

describe('scheduleMetaXAfternoonAlarm', () => {
  it('agenda alarm pras 16h da quarta', async () => {
    const morning = new Date(2026, 4, 20, 9, 0, 0);
    await scheduleMetaXAfternoonAlarm(morning);
    const expectedTarget = new Date(2026, 4, 20, 16, 0, 0).getTime();
    expect(mockAlarmsClear).toHaveBeenCalledWith(META_X_NOTIFY_ALARM);
    expect(mockAlarmsCreate).toHaveBeenCalledWith(META_X_NOTIFY_ALARM, { when: expectedTarget });
  });

  it('não agenda se já passou das 16h', async () => {
    const evening = new Date(2026, 4, 20, 17, 0, 0);
    await scheduleMetaXAfternoonAlarm(evening);
    expect(mockAlarmsCreate).not.toHaveBeenCalled();
  });

  it('não agenda em outros dias', async () => {
    await scheduleMetaXAfternoonAlarm(tue);
    expect(mockAlarmsCreate).not.toHaveBeenCalled();
  });
});
