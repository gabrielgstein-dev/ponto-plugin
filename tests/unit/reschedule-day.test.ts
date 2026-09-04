/**
 * rescheduleDay() — o elo que faz a hora extra valer HOJE.
 *
 * Sem ele, mudar a extra às 16:55 deixa o `autopunch_saida` armado pro horário
 * antigo: o service worker só releria `pontoState` no próximo backgroundDetect
 * (10min) e nem reagendaria, porque o guard `_lastHash` corta quando os
 * batimentos não mudaram. A UI mostraria 18:00 e a batida sairia 17:00.
 *
 * ENABLE_AUTO_PUNCH é `false` no build-flags.json de prod — mockado como `true`
 * aqui pra exercitar o caminho ligado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/domain/build-flags', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/domain/build-flags')>()
  return { ...actual, ENABLE_AUTO_PUNCH: true, ENABLE_NOTIFICATIONS: true }
})

import { rescheduleDay } from '../../lib/application/reschedule-day'
import { resetNotifScheduled } from '../../lib/application/state'
import { DEFAULT_SETTINGS } from '../../lib/domain/types'
import { mockAlarmsCreate, mockAlarmsClear, mockStorageGet } from '../setup/chrome-mock'

// Quarta 2026-09-02 (dia útil), 14:00 — depois da volta do almoço e antes de
// qualquer saída candidata, que é quando a decisão de hora extra acontece.
const WEEKDAY_2PM = new Date(2026, 8, 2, 14, 0, 0)
const TODAY_STR = WEEKDAY_2PM.toDateString()
const FIXED_OFFSETS = { entrada: 3, almoco: 2, volta: 4, saida: 2 }

const SETTINGS = {
  ...DEFAULT_SETTINGS,
  autoPunchEnabled: true,
  autoPunchSlots: { entrada: false, almoco: false, volta: false, saida: true },
}

/** Dia com entrada/almoço/volta batidos e a hora extra informada. */
function storageWith(horaExtra: number, date = TODAY_STR) {
  mockStorageGet.mockImplementation(async (keys: unknown) => {
    const list = Array.isArray(keys) ? keys : [keys]
    if (list.includes('pontoState')) {
      return {
        pontoDate: date,
        pontoState: { entrada: '08:00', almoco: '12:00', volta: '13:00', saida: null, horaExtra },
        pontoSettings: SETTINGS,
      }
    }
    if (list.includes('autoPunchOffsets')) {
      return { autoPunchOffsets: FIXED_OFFSETS, autoPunchOffsetsDate: TODAY_STR }
    }
    return {}
  })
}

function timeOf(name: string): string {
  const call = [...mockAlarmsCreate.mock.calls].reverse().find(c => c[0] === name)
  if (!call) throw new Error(`alarme ${name} não foi agendado`)
  const d = new Date((call[1] as { when: number }).when)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

beforeEach(() => {
  vi.useFakeTimers({ now: WEEKDAY_2PM })
  resetNotifScheduled()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rescheduleDay()', () => {
  it('agenda autopunch_saida no horário esticado pela hora extra', async () => {
    storageWith(60)
    await rescheduleDay()
    // 08:00 + 9h de trabalho + 1h de almoço = 18:00, + jitter de 2min
    expect(timeOf('autopunch_saida')).toBe('18:02')
  })

  it('sem hora extra volta pro horário normal', async () => {
    storageWith(0)
    await rescheduleDay()
    expect(timeOf('autopunch_saida')).toBe('17:02')
  })

  it('limpa os alarmes da saída ANTES de reagendar', async () => {
    storageWith(60)
    await rescheduleDay()
    const cleared = mockAlarmsClear.mock.calls.map(c => c[0] as string)
    expect(cleared).toEqual(
      expect.arrayContaining([
        'notif_saida', 'notif_saida_5', 'punch_popup_saida', 'reminder_saida', 'autopunch_saida',
      ]),
    )
  })

  it('não limpa alarmes de outros slots', async () => {
    storageWith(60)
    await rescheduleDay()
    const cleared = mockAlarmsClear.mock.calls.map(c => c[0] as string)
    expect(cleared).not.toContain('autopunch_entrada')
    expect(cleared).not.toContain('punch_popup_almoco')
  })

  it('recria o popup/lembrete de saída numa segunda chamada (guard de notif resetado)', async () => {
    // Slot 'saida' sem batida automática: aí o lembrete manual é quem avisa, e
    // é justamente ele que o guard `notifScheduled` impediria de voltar.
    mockStorageGet.mockImplementation(async (keys: unknown) => {
      const list = Array.isArray(keys) ? keys : [keys]
      if (list.includes('pontoState')) {
        return {
          pontoDate: TODAY_STR,
          pontoState: { entrada: '08:00', almoco: '12:00', volta: '13:00', saida: null, horaExtra: 0 },
          pontoSettings: { ...DEFAULT_SETTINGS, autoPunchEnabled: false },
        }
      }
      return {}
    })
    await rescheduleDay()
    expect(timeOf('punch_popup_saida')).toBe('17:00')

    mockAlarmsCreate.mockClear()
    mockStorageGet.mockImplementation(async (keys: unknown) => {
      const list = Array.isArray(keys) ? keys : [keys]
      if (list.includes('pontoState')) {
        return {
          pontoDate: TODAY_STR,
          pontoState: { entrada: '08:00', almoco: '12:00', volta: '13:00', saida: null, horaExtra: 90 },
          pontoSettings: { ...DEFAULT_SETTINGS, autoPunchEnabled: false },
        }
      }
      return {}
    })
    await rescheduleDay()
    expect(timeOf('punch_popup_saida')).toBe('18:30')
  })

  it('ignora estado de outro dia — não bate hoje com a extra de ontem', async () => {
    storageWith(120, new Date(2026, 8, 1).toDateString())
    await rescheduleDay()
    // Sem entrada válida hoje não há saída estimada, então nada de autopunch_saida.
    expect(mockAlarmsCreate.mock.calls.map(c => c[0])).not.toContain('autopunch_saida')
  })

  it('sobrevive a chrome.alarms.clear falhando', async () => {
    storageWith(60)
    mockAlarmsClear.mockRejectedValue(new Error('sem permissão'))
    await expect(rescheduleDay()).resolves.toBeUndefined()
    expect(timeOf('autopunch_saida')).toBe('18:02')
  })
})
