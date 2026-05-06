/**
 * scheduleNotifications() — agendamento de alarmes para os 3 slots de ponto.
 *
 * Para cada slot pendente (almoco/volta/saida), agenda 4 alarmes:
 *   notif_<slot>            → aviso `notifAntecip` min antes (default 10)
 *   notif_<slot>_5          → aviso 5 min antes (suprimido se notifAntecip=5)
 *   punch_popup_<slot>      → popup no horário
 *   reminder_<slot>         → lembrete `lembreteAtraso` min após (default 30,
 *                             suprimido se 0)
 *
 * Saída usa o 4º parâmetro (`saidaEstMin`) que é alimentado pelos call-sites
 * com `state._saidaEstimada` — quando a saída já foi batida, `_saidaEstimada`
 * é null e nenhum alarme de saída é agendado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { scheduleNotifications } from '../../lib/application/schedule-notifications'
import { applySettings, resetNotifScheduled } from '../../lib/application/state'
import { DEFAULT_SETTINGS } from '../../lib/domain/types'
import { mockAlarmsCreate, mockStorageSet } from '../setup/chrome-mock'

const FAKE_NOW = new Date(2026, 3, 28, 9, 0, 0) // 09:00 → nowMin=540

beforeEach(() => {
  vi.useFakeTimers({ now: FAKE_NOW })
  resetNotifScheduled()
  applySettings({ ...DEFAULT_SETTINGS })
})

afterEach(() => {
  vi.useRealTimers()
})

function alarmKeys(): string[] {
  return mockAlarmsCreate.mock.calls.map(c => c[0] as string)
}

function alarmAt(name: string): Date | null {
  const call = mockAlarmsCreate.mock.calls.find(c => c[0] === name)
  if (!call) return null
  return new Date((call[1] as { when: number }).when)
}

function timeOf(name: string): string {
  const d = alarmAt(name)
  if (!d) throw new Error(`alarm ${name} not scheduled`)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

describe('scheduleNotifications() — entrada (jornada não iniciada)', () => {
  beforeEach(() => {
    // Volta o relógio para 07:00 para que entrada=08:00 ainda esteja no futuro
    vi.setSystemTime(new Date(2026, 3, 28, 7, 0, 0))
  })

  it('agenda 4 alarmes para entrada usando settings.entradaHorario (default 08:00)', () => {
    // entrada=null → entradaHorario=08:00 → notifs em 07:50, 07:55, 08:00, 08:30
    scheduleNotifications(null, null, null, null)
    const keys = alarmKeys()
    expect(keys).toContain('notif_entrada')
    expect(keys).toContain('notif_entrada_5')
    expect(keys).toContain('punch_popup_entrada')
    expect(keys).toContain('reminder_entrada')
    expect(timeOf('notif_entrada')).toBe('07:50')
    expect(timeOf('notif_entrada_5')).toBe('07:55')
    expect(timeOf('punch_popup_entrada')).toBe('08:00')
    expect(timeOf('reminder_entrada')).toBe('08:30')
  })

  it('grava mensagens no storage para entrada (BUG 3 — usuários não recebiam essa)', () => {
    scheduleNotifications(null, null, null, null)
    const sets = mockStorageSet.mock.calls.map(c => c[0] as Record<string, unknown>)
    expect(sets).toContainEqual({ alarm_msg_notif_entrada: 'Hora de bater entrada em 10 minutos!' })
    expect(sets).toContainEqual({ alarm_msg_notif_entrada_5: 'Hora de bater entrada em 5 minutos!' })
    expect(sets).toContainEqual({ alarm_time_punch_popup_entrada: '08:00' })
    expect(sets).toContainEqual({ alarm_msg_reminder_entrada: 'Você ainda não bateu a entrada! (30 min em atraso)' })
  })

  it('respeita settings.entradaHorario customizado (07:30)', () => {
    applySettings({ ...DEFAULT_SETTINGS, entradaHorario: '07:30' })
    vi.setSystemTime(new Date(2026, 3, 28, 6, 0, 0))
    scheduleNotifications(null, null, null, null)
    expect(timeOf('punch_popup_entrada')).toBe('07:30')
    expect(timeOf('notif_entrada')).toBe('07:20')
  })

  it('NÃO agenda entrada quando entrada já foi batida (entMin truthy)', () => {
    vi.setSystemTime(new Date(2026, 3, 28, 9, 0, 0))
    scheduleNotifications(480, null, null, null)
    const keys = alarmKeys()
    expect(keys.some(k => k.includes('entrada'))).toBe(false)
  })
})

describe('scheduleNotifications() — almoço (1 ponto: entrada)', () => {
  it('agenda 4 alarmes (10min, 5min, popup, atraso) com defaults', () => {
    // entrada=08:00, almoco=null → almocoHorario=12:00 → notifs em 11:50, 11:55, 12:00, 12:30
    scheduleNotifications(480, null, null, null)
    const keys = alarmKeys()
    expect(keys).toContain('notif_almoco')
    expect(keys).toContain('notif_almoco_5')
    expect(keys).toContain('punch_popup_almoco')
    expect(keys).toContain('reminder_almoco')
    expect(timeOf('notif_almoco')).toBe('11:50')
    expect(timeOf('notif_almoco_5')).toBe('11:55')
    expect(timeOf('punch_popup_almoco')).toBe('12:00')
    expect(timeOf('reminder_almoco')).toBe('12:30')
  })

  it('grava mensagens no storage para notif/reminder e expectedTime para popup', () => {
    scheduleNotifications(480, null, null, null)
    const sets = mockStorageSet.mock.calls.map(c => c[0] as Record<string, unknown>)
    expect(sets).toContainEqual({ alarm_msg_notif_almoco: 'Hora do almoço em 10 minutos!' })
    expect(sets).toContainEqual({ alarm_msg_notif_almoco_5: 'Hora do almoço em 5 minutos!' })
    expect(sets).toContainEqual({ alarm_time_punch_popup_almoco: '12:00' })
    expect(sets).toContainEqual({ alarm_msg_reminder_almoco: 'Você ainda não bateu o almoço! (30 min em atraso)' })
  })

  it('com entrada=null, agenda entrada (não almoço) — almoço só vem após entrada batida', () => {
    // BUG 3 regression — antes, com entrada=null, NADA era agendado.
    // Agora, com entrada=null, agenda APENAS entrada (almoço aparece depois).
    scheduleNotifications(null, null, null, null)
    const keys = alarmKeys()
    expect(keys.some(k => k.startsWith('notif_almoco'))).toBe(false)
    expect(keys.some(k => k.startsWith('punch_popup_almoco'))).toBe(false)
  })
})

describe('scheduleNotifications() — volta (2 pontos: entrada + almoço)', () => {
  it('agenda volta baseado em almoço + almocoDur, ignora almoço (já batido)', () => {
    // entrada=08:00, almoco=13:58, almocoDur=60 → voltaSug=14:58
    // notifs em 14:48, 14:53, 14:58, 15:28
    scheduleNotifications(480, 13 * 60 + 58, null, null)
    const keys = alarmKeys()
    expect(keys).not.toContain('notif_almoco')
    expect(keys).not.toContain('punch_popup_almoco')
    expect(keys).toContain('notif_volta')
    expect(keys).toContain('notif_volta_5')
    expect(keys).toContain('punch_popup_volta')
    expect(keys).toContain('reminder_volta')
    expect(timeOf('notif_volta')).toBe('14:48')
    expect(timeOf('notif_volta_5')).toBe('14:53')
    expect(timeOf('punch_popup_volta')).toBe('14:58')
    expect(timeOf('reminder_volta')).toBe('15:28')
  })
})

describe('scheduleNotifications() — saída (com _saidaEstimada)', () => {
  it('agenda saída usando saidaEstMin (não state.saida real)', () => {
    // entrada=08:00, almoco=12:00, volta=13:00, saidaEstimada=17:00
    // notifs em 16:50, 16:55, 17:00, 17:30
    scheduleNotifications(480, 720, 780, 17 * 60)
    const keys = alarmKeys()
    expect(keys).toContain('notif_saida')
    expect(keys).toContain('notif_saida_5')
    expect(keys).toContain('punch_popup_saida')
    expect(keys).toContain('reminder_saida')
    expect(timeOf('notif_saida')).toBe('16:50')
    expect(timeOf('notif_saida_5')).toBe('16:55')
    expect(timeOf('punch_popup_saida')).toBe('17:00')
    expect(timeOf('reminder_saida')).toBe('17:30')
  })

  it('NÃO agenda saída quando saidaEstMin é null (saída já batida → _saidaEstimada vira null)', () => {
    scheduleNotifications(480, 720, 780, null)
    const keys = alarmKeys()
    expect(keys.some(k => k.includes('saida'))).toBe(false)
  })
})

describe('scheduleNotifications() — settings', () => {
  it('notifAntecip=5 suprime o notif_<slot>_5 (evita duplicata)', () => {
    applySettings({ ...DEFAULT_SETTINGS, notifAntecip: 5 })
    scheduleNotifications(480, null, null, null)
    const keys = alarmKeys()
    expect(keys).toContain('notif_almoco') // único aviso, em 11:55
    expect(keys).not.toContain('notif_almoco_5')
    expect(timeOf('notif_almoco')).toBe('11:55')
  })

  it('notifAntecip=0 suprime o aviso principal mas mantém o de 5min', () => {
    applySettings({ ...DEFAULT_SETTINGS, notifAntecip: 0 })
    scheduleNotifications(480, null, null, null)
    const keys = alarmKeys()
    expect(keys).not.toContain('notif_almoco')
    expect(keys).toContain('notif_almoco_5')
  })

  it('lembreteAtraso=0 suprime os reminder_<slot>', () => {
    applySettings({ ...DEFAULT_SETTINGS, lembreteAtraso: 0 })
    scheduleNotifications(480, null, null, null)
    const keys = alarmKeys()
    expect(keys).not.toContain('reminder_almoco')
    expect(keys).toContain('punch_popup_almoco') // demais seguem
  })

  it('lembreteAtraso=60 atrasa o reminder_<slot> em 60min após o slot', () => {
    applySettings({ ...DEFAULT_SETTINGS, lembreteAtraso: 60 })
    scheduleNotifications(480, null, null, null)
    expect(timeOf('reminder_almoco')).toBe('13:00')
  })
})

describe('scheduleNotifications() — janela de tempo', () => {
  it('alarmes com horário no passado (<=nowMin) não são agendados', () => {
    // FAKE_NOW=09:00; entrada=08:00 mas vamos simular uma situação onde notif_almoco
    // (11:50) ainda é futuro mas se nowMin fosse mais tarde, ficaria filtrado.
    // Aqui validamos com saída no passado: saidaEst=08:30 → todos os alarmes < 09:00
    scheduleNotifications(480, null, null, 8 * 60 + 30)
    const keys = alarmKeys()
    expect(keys.some(k => k.includes('saida'))).toBe(false)
  })

  it('quando entradaHorario já passou (FAKE_NOW=09:00 > 08:00), entrada não é agendada', () => {
    // FAKE_NOW=09:00 e entradaHorario=08:00 → todos os alarmes de entrada já passaram.
    // O slot tem que ser "silencioso" depois do horário, não acumular alarms ruidosos.
    scheduleNotifications(null, null, null, null)
    const keys = alarmKeys()
    expect(keys.some(k => k.startsWith('notif_entrada'))).toBe(false)
    expect(keys.some(k => k.startsWith('punch_popup_entrada'))).toBe(false)
    // reminder_entrada (08:30) também já passou
    expect(keys).not.toContain('reminder_entrada')
  })

  it('chamadas repetidas com mesmos slots não duplicam alarmes (notifScheduled)', () => {
    scheduleNotifications(480, null, null, null)
    const firstCount = mockAlarmsCreate.mock.calls.length
    scheduleNotifications(480, null, null, null)
    expect(mockAlarmsCreate.mock.calls.length).toBe(firstCount)
  })
})
