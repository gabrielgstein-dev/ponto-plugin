/**
 * scheduleAutoPunch() + supressão de lembrete em scheduleNotifications().
 *
 * A batida automática agenda um alarme `autopunch_<slot>` no horário nominal +
 * offset de jitter, só pros slots habilitados nas settings. E os slots com
 * auto-punch ligado NÃO recebem lembrete/popup (evita prompt duplicado).
 *
 * ENABLE_AUTO_PUNCH é `false` no build-flags.json de prod — mockado como `true`
 * aqui pra exercitar o caminho ligado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../lib/domain/build-flags', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/domain/build-flags')>()
  return { ...actual, ENABLE_AUTO_PUNCH: true }
})

import { scheduleAutoPunch, autoPunchSlotsEnabled } from '../../lib/application/schedule-auto-punch'
import { scheduleNotifications } from '../../lib/application/schedule-notifications'
import { applySettings, resetNotifScheduled } from '../../lib/application/state'
import { DEFAULT_SETTINGS } from '../../lib/domain/types'
import { mockAlarmsCreate, mockStorageGet, mockStorageSet } from '../setup/chrome-mock'

// Terça 2026-04-28 (dia útil), 07:00 → entrada (08:0x) ainda no futuro.
const WEEKDAY_7AM = new Date(2026, 3, 28, 7, 0, 0)
const TODAY_STR = WEEKDAY_7AM.toDateString()
const FIXED_OFFSETS = { entrada: 3, almoco: 2, volta: 4, saida: 2 }

function withFixedOffsets() {
  mockStorageGet.mockResolvedValue({ autoPunchOffsets: FIXED_OFFSETS, autoPunchOffsetsDate: TODAY_STR })
}

function alarmKeys(): string[] {
  return mockAlarmsCreate.mock.calls.map(c => c[0] as string)
}

function timeOf(name: string): string {
  const call = mockAlarmsCreate.mock.calls.find(c => c[0] === name)
  if (!call) throw new Error(`alarm ${name} not scheduled`)
  const d = new Date((call[1] as { when: number }).when)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

beforeEach(() => {
  vi.useFakeTimers({ now: WEEKDAY_7AM })
  resetNotifScheduled()
  applySettings({
    ...DEFAULT_SETTINGS,
    autoPunchEnabled: true,
    autoPunchSlots: { entrada: true, almoco: false, volta: false, saida: false },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('autoPunchSlotsEnabled()', () => {
  it('retorna só os slots ligados quando a feature está ligada', () => {
    expect(autoPunchSlotsEnabled()).toEqual(['entrada'])
  })

  it('retorna [] quando o toggle geral está desligado', () => {
    applySettings({ ...DEFAULT_SETTINGS, autoPunchEnabled: false, autoPunchSlots: { entrada: true, almoco: true, volta: true, saida: true } })
    expect(autoPunchSlotsEnabled()).toEqual([])
  })
})

describe('scheduleAutoPunch()', () => {
  it('agenda autopunch_entrada em entradaHorario + offset (08:00 + 3 = 08:03)', async () => {
    withFixedOffsets()
    await scheduleAutoPunch(null, null, null, null)
    expect(alarmKeys()).toContain('autopunch_entrada')
    expect(timeOf('autopunch_entrada')).toBe('08:03')
  })

  it('guarda o horário NOMINAL (sem offset) pro fallback', async () => {
    withFixedOffsets()
    await scheduleAutoPunch(null, null, null, null)
    const sets = mockStorageSet.mock.calls.map(c => c[0] as Record<string, unknown>)
    expect(sets).toContainEqual({ alarm_time_autopunch_entrada: '08:00' })
  })

  it('não agenda slot desligado (almoço off)', async () => {
    withFixedOffsets()
    // entrada batida → o "próximo" slot é almoço, mas almoço está off
    await scheduleAutoPunch(480, null, null, null)
    expect(alarmKeys().some(k => k.includes('almoco'))).toBe(false)
  })

  it('agenda almoço quando ligado (12:00 + 2 = 12:02)', async () => {
    applySettings({ ...DEFAULT_SETTINGS, autoPunchEnabled: true, autoPunchSlots: { entrada: false, almoco: true, volta: false, saida: false } })
    withFixedOffsets()
    await scheduleAutoPunch(480, null, null, null)
    expect(timeOf('autopunch_almoco')).toBe('12:02')
  })

  it('não bate no passado: horário já passou → sem alarme', async () => {
    vi.setSystemTime(new Date(2026, 3, 28, 9, 0, 0)) // 09:00 > 08:03
    withFixedOffsets()
    await scheduleAutoPunch(null, null, null, null)
    expect(alarmKeys().some(k => k.includes('entrada'))).toBe(false)
  })

  it('não agenda em fim de semana quando weekdaysOnly', async () => {
    vi.setSystemTime(new Date(2026, 3, 25, 7, 0, 0)) // sábado
    withFixedOffsets()
    await scheduleAutoPunch(null, null, null, null)
    expect(mockAlarmsCreate).not.toHaveBeenCalled()
  })

  it('gera e persiste offsets novos quando o storage está vazio', async () => {
    mockStorageGet.mockResolvedValue({}) // sem offsets salvos
    await scheduleAutoPunch(null, null, null, null)
    const sets = mockStorageSet.mock.calls.map(c => c[0] as Record<string, unknown>)
    const persisted = sets.find(s => 'autoPunchOffsets' in s)
    expect(persisted).toBeTruthy()
    expect(persisted!.autoPunchOffsetsDate).toBe(TODAY_STR)
  })
})

describe('scheduleNotifications() — supressão de slots com auto-punch', () => {
  it('não agenda lembrete/popup de entrada quando entrada é auto', () => {
    // entrada auto (default do beforeEach) → nada de entrada nos alarmes
    scheduleNotifications(null, null, null, null)
    const keys = alarmKeys()
    expect(keys.some(k => k.includes('entrada'))).toBe(false)
  })

  it('mantém lembrete de slot NÃO-auto (almoço) enquanto suprime o auto (entrada)', () => {
    // só entrada é auto; entrada já batida → o próximo é almoço (não-auto)
    scheduleNotifications(480, null, null, null)
    const keys = alarmKeys()
    expect(keys).toContain('punch_popup_almoco')
  })

  it('suprime almoço quando almoço é o slot auto', () => {
    applySettings({ ...DEFAULT_SETTINGS, autoPunchEnabled: true, autoPunchSlots: { entrada: false, almoco: true, volta: false, saida: false } })
    scheduleNotifications(480, null, null, null)
    const keys = alarmKeys()
    expect(keys.some(k => k.includes('almoco'))).toBe(false)
  })
})
