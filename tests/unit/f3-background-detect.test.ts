/**
 * F3 — Garantir sincronização Senior → Plugin
 *
 * Testa backgroundDetect(): a função que roda no service worker,
 * consome os providers, atribui slots de ponto e persiste o estado.
 *
 * Cobre os critérios:
 *   CV-3.1  backgroundDetect retorna false sem batimentos
 *   CV-3.2  Hash idêntico → ignora (sem mudança)
 *   CV-3.3  Batimentos futuros → ignorados
 *   CV-3.4  1 batimento → entrada atribuída
 *   CV-3.5  2 batimentos → entrada + almoco
 *   CV-3.6  4 batimentos com intervalo de almoço → todos slots
 *   CV-3.7  Estado salvo no storage após detecção
 *   CV-3.8  past.length < slots preenchidos → ignorado (não regride)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted mocks (disponíveis nos factories vi.mock) ─────────────────────────
const { mockDetect } = vi.hoisted(() => ({
  mockDetect: vi.fn<Parameters<import('../../lib/domain/interfaces').IPunchDetector['detect']>, ReturnType<import('../../lib/domain/interfaces').IPunchDetector['detect']>>(),
}))

vi.mock('../../lib/application/detect-punches', () => ({
  PunchDetector: vi.fn().mockImplementation(() => ({ detect: mockDetect })),
  loadPendingPunches: vi.fn().mockResolvedValue(undefined),
  addPendingPunch: vi.fn(),
}))

vi.mock('#company/providers', () => ({
  getCompanyPunchProviders: vi.fn().mockReturnValue([]),
  getTimesheetProvider: vi.fn().mockReturnValue({
    isAvailable: vi.fn().mockResolvedValue(false),
    getSummary: vi.fn().mockResolvedValue(null),
  }),
}))

vi.mock('../../lib/application/calc-schedule', () => ({
  calcHorarios: vi.fn(),
}))

vi.mock('../../lib/application/schedule-notifications', () => ({
  scheduleNotifications: vi.fn(),
}))

vi.mock('../../lib/application/schedule-ts-notifications', () => ({
  scheduleTsNotifications: vi.fn(),
}))

// ── Imports após mocks ────────────────────────────────────────────────────────
import {
  backgroundDetect,
  resetBackgroundHash,
} from '../../lib/application/background-detect'
import { resetState, state } from '../../lib/application/state'
import { mockStorageGet, mockStorageSet } from '../setup/chrome-mock'

// Hora fixa: 18:00 local → nowMin = 1080
// Qualquer batimento antes de 18:05 é considerado "passado"
const FAKE_NOW = new Date(2026, 2, 25, 18, 0, 0)
const TODAY_STR = FAKE_NOW.toDateString()
const OLD_DATE = 'Mon Jan 01 2024'

beforeEach(() => {
  vi.useFakeTimers({ now: FAKE_NOW })
  resetBackgroundHash()
  resetState()
  mockDetect.mockResolvedValue(null)
  mockStorageGet.mockResolvedValue({
    pontoState: null,
    pontoSettings: null,
    pontoDate: OLD_DATE,
  })
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Testes ────────────────────────────────────────────────────────────────────
describe('F3 — backgroundDetect()', () => {
  it('CV-3.1: retorna false quando detector não encontra batimentos', async () => {
    mockDetect.mockResolvedValue(null)
    expect(await backgroundDetect()).toBe(false)
  })

  it('CV-3.1: retorna false quando detector retorna lista vazia', async () => {
    mockDetect.mockResolvedValue({ times: [], source: 'test' })
    expect(await backgroundDetect()).toBe(false)
  })

  it('CV-3.2: retorna false na segunda chamada com o mesmo hash', async () => {
    mockDetect.mockResolvedValue({ times: ['08:00'], source: 'test' })
    await backgroundDetect() // 1ª chamada → seta hash
    expect(await backgroundDetect()).toBe(false) // 2ª chamada → hash igual
  })

  it('CV-3.2: retorna true na segunda chamada quando batimentos mudam', async () => {
    mockDetect.mockResolvedValueOnce({ times: ['08:00'], source: 'test' })
    mockDetect.mockResolvedValueOnce({ times: ['08:00', '12:00'], source: 'test' })
    await backgroundDetect()
    expect(await backgroundDetect()).toBe(true)
  })

  it('CV-3.3: retorna false quando todos os batimentos são futuros (após 18:05)', async () => {
    mockDetect.mockResolvedValue({ times: ['23:00'], source: 'test' })
    expect(await backgroundDetect()).toBe(false)
  })

  it('CV-3.4: 1 batimento → atribui entrada, demais slots null', async () => {
    mockDetect.mockResolvedValue({ times: ['08:00'], source: 'test' })
    const ok = await backgroundDetect()
    expect(ok).toBe(true)
    expect(state.entrada).toBe('08:00')
    expect(state.almoco).toBeNull()
    expect(state.volta).toBeNull()
    expect(state.saida).toBeNull()
  })

  it('CV-3.5: 2 batimentos sem intervalo configurável → entrada + almoco', async () => {
    // 08:00 → 12:00: span=240min ≥ 120min e < jornada+almoço=540 → almoco
    mockDetect.mockResolvedValue({ times: ['08:00', '12:00'], source: 'test' })
    await backgroundDetect()
    expect(state.entrada).toBe('08:00')
    expect(state.almoco).toBe('12:00')
    expect(state.volta).toBeNull()
    expect(state.saida).toBeNull()
  })

  it('CV-3.6: 3 batimentos com intervalo de almoço → entrada, almoco, volta', async () => {
    // 08:00→12:00 (240min trabalho), 12:00→13:00 (60min gap ≥ 30) → almoço detectado
    mockDetect.mockResolvedValue({ times: ['08:00', '12:00', '13:00'], source: 'test' })
    await backgroundDetect()
    expect(state.entrada).toBe('08:00')
    expect(state.almoco).toBe('12:00')
    expect(state.volta).toBe('13:00')
    expect(state.saida).toBeNull()
  })

  it('CV-3.6: 4 batimentos com almoço → todos os slots preenchidos', async () => {
    mockDetect.mockResolvedValue({ times: ['08:00', '12:00', '13:00', '17:00'], source: 'test' })
    await backgroundDetect()
    expect(state.entrada).toBe('08:00')
    expect(state.almoco).toBe('12:00')
    expect(state.volta).toBe('13:00')
    expect(state.saida).toBe('17:00')
  })

  it('CV-3.7: estado e data são salvos no storage local', async () => {
    mockDetect.mockResolvedValue({ times: ['08:00'], source: 'test' })
    await backgroundDetect()
    expect(mockStorageSet).toHaveBeenCalledWith(
      expect.objectContaining({
        pontoState: expect.objectContaining({ entrada: '08:00' }),
        pontoDate: TODAY_STR,
      }),
    )
  })

  it('CV-3.8: retorna false quando novos batimentos são menos que slots já preenchidos', async () => {
    // Estado salvo tem 2 slots (entrada + almoco)
    mockStorageGet.mockResolvedValue({
      pontoState: { entrada: '08:00', almoco: '12:00', volta: null, saida: null },
      pontoSettings: null,
      pontoDate: TODAY_STR,
    })
    // Detector retorna apenas 1 batimento (menos que os 2 slots preenchidos)
    mockDetect.mockResolvedValue({ times: ['08:00'], source: 'test' })
    expect(await backgroundDetect()).toBe(false)
  })

  it('CV-3.4: batimentos fora do dia são filtrados pela janela nowMin+5', async () => {
    // 18:06 = 1086 min > 1085 (nowMin+5) → futuro → filtrado
    mockDetect.mockResolvedValue({ times: ['18:06'], source: 'test' })
    expect(await backgroundDetect()).toBe(false)
  })
})
