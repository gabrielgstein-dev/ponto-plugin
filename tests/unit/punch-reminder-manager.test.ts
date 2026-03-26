import { describe, it, expect, beforeEach } from 'vitest'
import {
  mockStorageGet,
  mockStorageSet,
  mockStorageRemove,
  mockWindowsGet,
  mockWindowsCreate,
  mockWindowsRemove,
  mockAlarmsCreate,
  mockAlarmsClear,
} from '../setup/chrome-mock'
import { startReminder, recheckReminder, resolveReminder } from '../../lib/application/punch-reminder-manager'

// ── helpers ──────────────────────────────────────────────────────────────────

const pontoEntrada = { entrada: '09:00', almoco: null, volta: null, saida: null }
const pontoEntradaAlmoco = { entrada: '09:00', almoco: '12:00', volta: null, saida: null }
const pontoCompleto = { entrada: '09:00', almoco: '12:00', volta: '13:00', saida: '18:00' }

function storageWith(overrides: Record<string, unknown>) {
  mockStorageGet.mockResolvedValue(overrides)
}

// ── U1: startReminder cria storage keys e abre janela ────────────────────────

describe('U1 — startReminder cria storage keys e abre janela', () => {
  beforeEach(() => {
    storageWith({ pontoState: pontoEntrada, punchPopupWindowId: undefined })
  })

  it('grava punchPopupSlot e punchPopupExpectedTime', async () => {
    await startReminder('almoco', '12:00')
    expect(mockStorageSet).toHaveBeenCalledWith({
      punchPopupSlot: 'almoco',
      punchPopupExpectedTime: '12:00',
    })
  })

  it('abre janela popup com URL correta', async () => {
    await startReminder('almoco', '12:00')
    expect(mockWindowsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('punch-reminder.html'),
        type: 'popup',
      }),
    )
  })

  it('salva windowId no storage após criar janela', async () => {
    await startReminder('almoco', '12:00')
    expect(mockStorageSet).toHaveBeenCalledWith({ punchPopupWindowId: 42 })
  })

  it('agenda alarm punch_recheck com 5 minutos', async () => {
    await startReminder('almoco', '12:00')
    expect(mockAlarmsCreate).toHaveBeenCalledWith('punch_recheck', { delayInMinutes: 5 })
  })
})

// ── U2: startReminder não abre se janela já está aberta ──────────────────────

describe('U2 — startReminder não abre segunda janela se já há uma aberta (P4)', () => {
  it('não chama windows.create se janela já existe', async () => {
    storageWith({ pontoState: pontoEntrada, punchPopupWindowId: 42 })
    mockWindowsGet.mockResolvedValueOnce({ id: 42 }) // janela existe
    await startReminder('almoco', '12:00')
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })

  it('abre nova janela se ID no storage mas janela já foi fechada', async () => {
    storageWith({ pontoState: pontoEntrada, punchPopupWindowId: 42 })
    mockWindowsGet.mockRejectedValueOnce(new Error('No window')) // janela fechada
    await startReminder('almoco', '12:00')
    expect(mockWindowsCreate).toHaveBeenCalled()
  })
})

// ── U3: recheckReminder fecha ciclo se slot foi batido ───────────────────────

describe('U3 — recheckReminder fecha ciclo se slot foi batido (P3/P5)', () => {
  it('chama resolveReminder se punchPopupSlot já foi registrado no pontoState', async () => {
    storageWith({
      pontoState: pontoEntradaAlmoco, // almoco já batido
      punchPopupSlot: 'almoco',
      punchPopupWindowId: undefined,
      punchPopupExpectedTime: '12:00',
    })
    await recheckReminder()
    expect(mockAlarmsClear).toHaveBeenCalledWith('punch_recheck')
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })
})

// ── U4: recheckReminder reabre se slot não foi batido e janela fechada ────────

describe('U4 — recheckReminder reabre popup se slot não batido e janela fechada (P2)', () => {
  it('reabre janela e reagenda alarm', async () => {
    storageWith({
      pontoState: pontoEntrada, // almoco ainda não batido
      punchPopupSlot: 'almoco',
      punchPopupWindowId: 99,
      punchPopupExpectedTime: '12:00',
    })
    mockWindowsGet.mockRejectedValueOnce(new Error('No window')) // janela fechada
    await recheckReminder()
    expect(mockWindowsCreate).toHaveBeenCalled()
    expect(mockAlarmsCreate).toHaveBeenCalledWith('punch_recheck', { delayInMinutes: 5 })
  })
})

// ── U5: recheckReminder não abre se janela já está aberta ────────────────────

describe('U5 — recheckReminder não abre outra janela se popup já visível (P4)', () => {
  it('não chama windows.create se janela existe', async () => {
    storageWith({
      pontoState: pontoEntrada,
      punchPopupSlot: 'almoco',
      punchPopupWindowId: 42,
      punchPopupExpectedTime: '12:00',
    })
    mockWindowsGet.mockResolvedValueOnce({ id: 42 })
    await recheckReminder()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })
})

// ── U6: resolveReminder cancela alarm e limpa storage ────────────────────────

describe('U6 — resolveReminder cancela alarm e limpa storage (P5)', () => {
  beforeEach(() => {
    storageWith({ punchPopupSlot: 'almoco', punchPopupWindowId: 42 })
  })

  it('cancela alarm punch_recheck', async () => {
    await resolveReminder('almoco')
    expect(mockAlarmsClear).toHaveBeenCalledWith('punch_recheck')
  })

  it('fecha janela popup', async () => {
    await resolveReminder('almoco')
    expect(mockWindowsRemove).toHaveBeenCalledWith(42)
  })

  it('remove as storage keys', async () => {
    await resolveReminder('almoco')
    expect(mockStorageRemove).toHaveBeenCalledWith(
      expect.arrayContaining(['punchPopupSlot', 'punchPopupWindowId', 'punchPopupExpectedTime']),
    )
  })
})

// ── U7: resolveReminder NÃO resolve se slot diferente do monitorado ──────────

describe('U7 — resolveReminder não age se slot não bate com punchPopupSlot (P3)', () => {
  it('não fecha janela se slot errado', async () => {
    storageWith({ punchPopupSlot: 'almoco', punchPopupWindowId: 42 })
    await resolveReminder('volta') // slot diferente
    expect(mockWindowsRemove).not.toHaveBeenCalled()
    expect(mockAlarmsClear).not.toHaveBeenCalled()
  })
})

// ── U8 e U9: isSlotPunched via comportamento do startReminder ─────────────────

describe('U8/U9 — verificação de slot correto via startReminder (P3)', () => {
  it('U8 — startReminder não abre popup se slot errado já está no pontoState', async () => {
    // almoco batido, mas tentando startReminder para almoco novamente — slot já preenchido
    storageWith({ pontoState: pontoEntradaAlmoco, punchPopupWindowId: undefined })
    await startReminder('almoco', '12:00')
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })

  it('U9 — startReminder abre popup para slot correto ainda não batido', async () => {
    // volta ainda não batida
    storageWith({ pontoState: pontoEntradaAlmoco, punchPopupWindowId: undefined })
    await startReminder('volta', '13:00')
    expect(mockWindowsCreate).toHaveBeenCalled()
  })
})

// ── U10: startReminder aborta se entrada é null (P6) ─────────────────────────

describe('U10 — startReminder aborta se entrada é null (P6)', () => {
  it('não abre popup sem entrada registrada', async () => {
    storageWith({ pontoState: { entrada: null, almoco: null, volta: null, saida: null } })
    await startReminder('almoco', '12:00')
    expect(mockWindowsCreate).not.toHaveBeenCalled()
    expect(mockStorageSet).not.toHaveBeenCalled()
  })

  it('não abre popup com pontoState null', async () => {
    storageWith({ pontoState: null })
    await startReminder('almoco', '12:00')
    expect(mockWindowsCreate).not.toHaveBeenCalled()
  })
})

// ── U11: recheckReminder aborta se entrada é null (P6) ───────────────────────

describe('U11 — recheckReminder aborta se entrada é null (P6)', () => {
  it('cancela e limpa se entrada é null', async () => {
    storageWith({
      pontoState: { entrada: null, almoco: null, volta: null, saida: null },
      punchPopupSlot: 'almoco',
      punchPopupWindowId: undefined,
      punchPopupExpectedTime: '12:00',
    })
    await recheckReminder()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
    expect(mockAlarmsClear).toHaveBeenCalledWith('punch_recheck')
  })
})

// ── U12: startReminder aborta se saida está preenchida (P7) ──────────────────

describe('U12 — startReminder aborta se saida está preenchida (P7)', () => {
  it('não abre popup e limpa storage quando saida já foi batida', async () => {
    storageWith({ pontoState: pontoCompleto, punchPopupWindowId: undefined })
    await startReminder('saida', '18:00')
    expect(mockWindowsCreate).not.toHaveBeenCalled()
    expect(mockAlarmsClear).toHaveBeenCalledWith('punch_recheck')
    expect(mockStorageRemove).toHaveBeenCalled()
  })
})

// ── U13: recheckReminder cancela tudo se saida está preenchida (P7) ──────────

describe('U13 — recheckReminder cancela tudo se saida está preenchida (P7)', () => {
  it('resolve e não reabre se saida está no pontoState', async () => {
    storageWith({
      pontoState: pontoCompleto,
      punchPopupSlot: 'volta',
      punchPopupWindowId: undefined,
      punchPopupExpectedTime: '13:00',
    })
    await recheckReminder()
    expect(mockWindowsCreate).not.toHaveBeenCalled()
    expect(mockAlarmsClear).toHaveBeenCalledWith('punch_recheck')
  })
})

// ── U14: saida registrada enquanto popup aberto → resolve (P7) ───────────────

describe('U14 — saida registrada enquanto popup de volta aberto → fecha popup (P7)', () => {
  it('fecha janela do popup de volta ao chamar resolveReminder com slot correto', async () => {
    storageWith({ punchPopupSlot: 'volta', punchPopupWindowId: 55 })
    await resolveReminder('volta')
    expect(mockWindowsRemove).toHaveBeenCalledWith(55)
    expect(mockAlarmsClear).toHaveBeenCalledWith('punch_recheck')
  })
})
