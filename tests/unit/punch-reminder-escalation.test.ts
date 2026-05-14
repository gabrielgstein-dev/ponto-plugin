/**
 * Camada 3 do fix de mobile sync — recheckReminder ativo + escalação.
 *
 * Antes: recheckReminder lia o storage e reabria o popup se slot ainda null.
 * Loop indefinido até dailyReset à meia-noite — incômodo crônico pra quem bate
 * no celular e o plugin nunca consegue detectar (mobile sync lag/CORS/aba).
 *
 * Agora:
 *   1. Cada recheck força `backgroundDetect()` + reset de caches antes de
 *      decidir reabrir — dá uma chance fresh ao sync mobile→GP.
 *   2. Após 20 min sem detectar, o popup escala: vira modo "user-agent" com
 *      3 ações explícitas (Já bati / Abrir Senior / Parar lembretes).
 *   3. Slots dispensados explicitamente (DISMISS_SLOT_REMINDERS) não reabrem.
 *   4. markSlotPunched permite override manual quando user confirma que
 *      bateu em canal externo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock é hoisted — não dá pra usar variável de top-level dentro da factory.
// Usamos vi.hoisted pra criar o spy ANTES dos mocks serem hoisted.
const { backgroundDetectSpy } = vi.hoisted(() => ({
  backgroundDetectSpy: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../lib/application/background-detect', () => ({
  backgroundDetect: backgroundDetectSpy,
  resetBackgroundHash: vi.fn(),
}));
vi.mock('#company/providers', () => ({
  resetGpPunchCache: vi.fn(),
  getCompanyPunchProviders: () => [],
  getTimesheetProvider: () => null,
}));
vi.mock('../../lib/infrastructure/senior/senior-api-provider', () => ({
  resetSeniorApiCache: vi.fn(),
}));
vi.mock('../../lib/infrastructure/senior/senior-storage-provider', () => ({
  resetSeniorStorageCache: vi.fn(),
}));

import {
  startReminder,
  recheckReminder,
  dismissSlotForToday,
  markSlotPunched,
  DISMISSED_SLOTS_KEY,
} from '../../lib/application/punch-reminder-manager';
import {
  mockStorageGet,
  mockStorageSet,
  mockStorageRemove,
  mockWindowsCreate,
  mockWindowsGet,
} from '../setup/chrome-mock';

const ESCALATION_THRESHOLD_MS = 20 * 60 * 1000;
const pontoEntrada = { entrada: '09:00', almoco: null, volta: null, saida: null };

beforeEach(() => {
  backgroundDetectSpy.mockClear();
  backgroundDetectSpy.mockResolvedValue(true);
});

// ────────────────────────────────────────────────────────────────────────────
// E1 — recheckReminder força backgroundDetect ANTES de decidir reabrir
// ────────────────────────────────────────────────────────────────────────────

describe('E1 — recheck ativo: força backgroundDetect', () => {
  it('chama backgroundDetect antes de qualquer decisão', async () => {
    mockStorageGet.mockResolvedValue({
      pontoState: pontoEntrada,
      punchPopupSlot: 'almoco',
      punchPopupExpectedTime: '12:00',
      punchPopupStartedTs: Date.now() - 5 * 60 * 1000,
    });
    await recheckReminder();
    expect(backgroundDetectSpy).toHaveBeenCalledTimes(1);
  });

  it('continua o ciclo mesmo se backgroundDetect rejeitar (não derruba recheck)', async () => {
    backgroundDetectSpy.mockRejectedValueOnce(new Error('network down'));
    mockStorageGet.mockResolvedValue({
      pontoState: pontoEntrada,
      punchPopupSlot: 'almoco',
      punchPopupExpectedTime: '12:00',
      punchPopupStartedTs: Date.now() - 5 * 60 * 1000,
    });
    await expect(recheckReminder()).resolves.toBeUndefined();
    expect(mockWindowsCreate).toHaveBeenCalled(); // reabre apesar do erro
  });
});

// ────────────────────────────────────────────────────────────────────────────
// E2 — Escalação após 20 min sem detectar
// ────────────────────────────────────────────────────────────────────────────

describe('E2 — escalação após 20 min', () => {
  it('abre popup em modo NORMAL quando startedTs é recente', async () => {
    mockStorageGet.mockResolvedValue({
      pontoState: pontoEntrada,
      punchPopupSlot: 'almoco',
      punchPopupExpectedTime: '12:00',
      punchPopupStartedTs: Date.now() - 10 * 60 * 1000, // 10min — abaixo do threshold
    });
    await recheckReminder();
    const createCall = mockWindowsCreate.mock.calls[0]?.[0] as { url: string } | undefined;
    expect(createCall?.url).toContain('punch-reminder.html');
    expect(createCall?.url).not.toContain('escalated=1');
  });

  it('abre popup em modo ESCALADO quando passou 20+ min', async () => {
    mockStorageGet.mockResolvedValue({
      pontoState: pontoEntrada,
      punchPopupSlot: 'almoco',
      punchPopupExpectedTime: '12:00',
      punchPopupStartedTs: Date.now() - 25 * 60 * 1000, // 25min — acima do threshold
    });
    await recheckReminder();
    const createCall = mockWindowsCreate.mock.calls[0]?.[0] as { url: string } | undefined;
    expect(createCall?.url).toContain('escalated=1');
  });

  it('limite do threshold: 19min NÃO escala, 21min escala', async () => {
    // 19min — não escala
    mockStorageGet.mockResolvedValueOnce({
      pontoState: pontoEntrada,
      punchPopupSlot: 'almoco',
      punchPopupExpectedTime: '12:00',
      punchPopupStartedTs: Date.now() - 19 * 60 * 1000,
    });
    await recheckReminder();
    expect(mockWindowsCreate.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ url: expect.not.stringContaining('escalated=1') }),
    );

    mockWindowsCreate.mockClear();

    // 21min — escala
    mockStorageGet.mockResolvedValueOnce({
      pontoState: pontoEntrada,
      punchPopupSlot: 'almoco',
      punchPopupExpectedTime: '12:00',
      punchPopupStartedTs: Date.now() - 21 * 60 * 1000,
    });
    await recheckReminder();
    expect(mockWindowsCreate.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ url: expect.stringContaining('escalated=1') }),
    );
  });

  it('startReminder marca punchPopupStartedTs com Date.now()', async () => {
    mockStorageGet.mockResolvedValue({ pontoState: pontoEntrada });
    const before = Date.now();
    await startReminder('almoco', '12:00');
    const after = Date.now();

    const setCall = mockStorageSet.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).punchPopupStartedTs != null,
    );
    expect(setCall).toBeDefined();
    const ts = (setCall![0] as { punchPopupStartedTs: number }).punchPopupStartedTs;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// E3 — Dismissed slots não reabrem popup
// ────────────────────────────────────────────────────────────────────────────

describe('E3 — dismissed slots', () => {
  it('startReminder NÃO abre popup pra slot dismissed', async () => {
    mockStorageGet.mockResolvedValue({
      pontoState: pontoEntrada,
      [DISMISSED_SLOTS_KEY]: ['almoco'],
    });
    await startReminder('almoco', '12:00');
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });

  it('startReminder AINDA abre popup pra slot não-dismissed', async () => {
    mockStorageGet.mockResolvedValue({
      pontoState: pontoEntrada,
      [DISMISSED_SLOTS_KEY]: ['almoco'], // almoco dismissed, volta não
    });
    await startReminder('volta', '13:00');
    expect(mockWindowsCreate).toHaveBeenCalled();
  });

  it('recheckReminder resolve (não reabre) se slot foi dispensado entre cycles', async () => {
    mockStorageGet.mockResolvedValue({
      pontoState: pontoEntrada,
      punchPopupSlot: 'almoco',
      punchPopupExpectedTime: '12:00',
      punchPopupStartedTs: Date.now() - 5 * 60 * 1000,
      [DISMISSED_SLOTS_KEY]: ['almoco'],
    });
    await recheckReminder();
    expect(mockWindowsCreate).not.toHaveBeenCalled();
    // resolveReminder limpa storage
    expect(mockStorageRemove).toHaveBeenCalled();
  });

  it('dismissSlotForToday adiciona slot ao array e resolve reminder', async () => {
    mockStorageGet.mockResolvedValue({
      [DISMISSED_SLOTS_KEY]: ['entrada'], // já tem entrada dismissed
      punchPopupSlot: 'almoco',
    });
    await dismissSlotForToday('almoco');

    const setCall = mockStorageSet.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>)[DISMISSED_SLOTS_KEY] != null,
    );
    expect(setCall).toBeDefined();
    expect((setCall![0] as Record<string, unknown>)[DISMISSED_SLOTS_KEY]).toEqual(['entrada', 'almoco']);
  });

  it('dismissSlotForToday é idempotente — não duplica slot já no array', async () => {
    mockStorageGet.mockResolvedValue({
      [DISMISSED_SLOTS_KEY]: ['almoco'],
      punchPopupSlot: 'almoco',
    });
    await dismissSlotForToday('almoco');

    const setCalls = mockStorageSet.mock.calls.filter(
      (c) => (c[0] as Record<string, unknown>)[DISMISSED_SLOTS_KEY] != null,
    );
    // O storage.set com DISMISSED_SLOTS_KEY não deveria ser chamado (já está lá)
    expect(setCalls.length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// E4 — markSlotPunched permite override manual
// ────────────────────────────────────────────────────────────────────────────

describe('E4 — markSlotPunched (modo escalado: "Já bati")', () => {
  it('seta o slot no pontoState com o expectedTime', async () => {
    mockStorageGet.mockResolvedValue({
      pontoState: pontoEntrada,
      punchPopupSlot: 'almoco',
    });
    await markSlotPunched('almoco', '12:15');

    const setCall = mockStorageSet.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).pontoState != null,
    );
    expect(setCall).toBeDefined();
    expect((setCall![0] as { pontoState: Record<string, unknown> }).pontoState).toMatchObject({
      almoco: '12:15',
    });
  });

  it('mantém os outros slots inalterados', async () => {
    const fullState = { entrada: '08:00', almoco: null, volta: null, saida: null };
    mockStorageGet.mockResolvedValue({ pontoState: fullState, punchPopupSlot: 'almoco' });
    await markSlotPunched('almoco', '12:00');

    const setCall = mockStorageSet.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).pontoState != null,
    );
    expect((setCall![0] as { pontoState: Record<string, unknown> }).pontoState).toMatchObject({
      entrada: '08:00',
      almoco: '12:00',
      volta: null,
      saida: null,
    });
  });

  it('funciona mesmo com pontoState null (primeira marcação do dia)', async () => {
    mockStorageGet.mockResolvedValue({ pontoState: null, punchPopupSlot: 'entrada' });
    await markSlotPunched('entrada', '08:00');

    const setCall = mockStorageSet.mock.calls.find(
      (c) => (c[0] as Record<string, unknown>).pontoState != null,
    );
    expect((setCall![0] as { pontoState: Record<string, unknown> }).pontoState).toMatchObject({
      entrada: '08:00',
    });
  });

  it('resolve o reminder (chama resolveReminder no slot)', async () => {
    mockStorageGet.mockResolvedValue({
      pontoState: pontoEntrada,
      punchPopupSlot: 'almoco',
      punchPopupWindowId: 99,
    });
    await markSlotPunched('almoco', '12:00');
    // resolveReminder limpa as keys do popup
    const removeCalls = mockStorageRemove.mock.calls.flat().flat();
    expect(removeCalls.some((k) => String(k).includes('punchPopupSlot') || (Array.isArray(k) && k.includes('punchPopupSlot')))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// E5 — Detecção bem-sucedida no recheck resolve sem reabrir
// ────────────────────────────────────────────────────────────────────────────

describe('E5 — happy path: backgroundDetect achou o ponto', () => {
  it('se ps.slot for setado pelo backgroundDetect, recheck resolve sem reabrir', async () => {
    // Cenário ideal: usuário bateu no celular, GP sincronizou, backgroundDetect
    // pegou. mockStorageGet retorna ps já com almoço — recheck deve resolver.
    mockStorageGet.mockResolvedValue({
      pontoState: { entrada: '09:00', almoco: '12:15', volta: null, saida: null },
      punchPopupSlot: 'almoco',
      punchPopupExpectedTime: '12:00',
      punchPopupStartedTs: Date.now() - 3 * 60 * 1000,
    });
    await recheckReminder();
    expect(backgroundDetectSpy).toHaveBeenCalled();
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// E6 — Pre-flight em startReminder: nunca abre popup pra slot já batido
// ────────────────────────────────────────────────────────────────────────────

describe('E6 — pre-flight em startReminder', () => {
  it('chama backgroundDetect ANTES de qualquer guard', async () => {
    mockStorageGet.mockResolvedValue({ pontoState: pontoEntrada });
    await startReminder('almoco', '12:00');
    expect(backgroundDetectSpy).toHaveBeenCalledTimes(1);
  });

  it('NÃO abre popup se pre-flight mostra slot já batido (fix mobile race)', async () => {
    // Cenário: user bateu almoço no celular às 11:59. Alarm punch_popup_almoco
    // dispara às 12:00. Sem pre-flight, popup abriria. Com pre-flight,
    // backgroundDetect rebusca, ps.almoco fica preenchido, guard P3 pega.
    mockStorageGet.mockResolvedValue({
      pontoState: { entrada: '09:00', almoco: '11:59', volta: null, saida: null },
    });
    await startReminder('almoco', '12:00');
    expect(backgroundDetectSpy).toHaveBeenCalled();
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });

  it('AINDA abre popup quando pre-flight roda mas slot continua null', async () => {
    mockStorageGet.mockResolvedValue({
      pontoState: { entrada: '09:00', almoco: null, volta: null, saida: null },
    });
    await startReminder('almoco', '12:00');
    expect(backgroundDetectSpy).toHaveBeenCalled();
    expect(mockWindowsCreate).toHaveBeenCalled();
  });

  it('falha do backgroundDetect não bloqueia startReminder (degrada gracioso)', async () => {
    backgroundDetectSpy.mockRejectedValueOnce(new Error('network down'));
    mockStorageGet.mockResolvedValue({
      pontoState: { entrada: '09:00', almoco: null, volta: null, saida: null },
    });
    await expect(startReminder('almoco', '12:00')).resolves.toBeUndefined();
    expect(mockWindowsCreate).toHaveBeenCalled();
  });

  it('pre-flight + slot dismissed: detect roda, mas popup não abre por dismissed', async () => {
    // Garante que dismissed continua tendo precedência (mesmo após detect)
    mockStorageGet.mockResolvedValue({
      pontoState: pontoEntrada,
      [DISMISSED_SLOTS_KEY]: ['almoco'],
    });
    await startReminder('almoco', '12:00');
    expect(backgroundDetectSpy).toHaveBeenCalled();
    expect(mockWindowsCreate).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// E7 — Garantia: os 4 slots (entrada, almoco, volta, saida) abrem popup
// end-to-end com URL + mensagem corretas
// ────────────────────────────────────────────────────────────────────────────

const FOUR_SLOTS_CASES = [
  {
    slot: 'entrada' as const,
    expectedTime: '08:00',
    pontoState: { entrada: null, almoco: null, volta: null, saida: null },
  },
  {
    slot: 'almoco' as const,
    expectedTime: '12:00',
    pontoState: { entrada: '08:00', almoco: null, volta: null, saida: null },
  },
  {
    slot: 'volta' as const,
    expectedTime: '13:00',
    pontoState: { entrada: '08:00', almoco: '12:00', volta: null, saida: null },
  },
  {
    slot: 'saida' as const,
    expectedTime: '17:00',
    pontoState: { entrada: '08:00', almoco: '12:00', volta: '13:00', saida: null },
  },
];

describe('E7 — garantia: os 4 slots funcionam end-to-end', () => {
  for (const tc of FOUR_SLOTS_CASES) {
    describe(`slot=${tc.slot}`, () => {
      beforeEach(() => {
        mockStorageGet.mockResolvedValue({ pontoState: tc.pontoState });
      });

      it(`startReminder abre popup com URL contendo slot=${tc.slot} e time=${tc.expectedTime}`, async () => {
        await startReminder(tc.slot, tc.expectedTime);
        expect(mockWindowsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.stringContaining(`slot=${tc.slot}`),
            type: 'popup',
          }),
        );
        const url = (mockWindowsCreate.mock.calls[0]?.[0] as { url: string }).url;
        expect(url).toContain(`time=${encodeURIComponent(tc.expectedTime)}`);
      });

      it(`grava punchPopupSlot=${tc.slot} no storage`, async () => {
        await startReminder(tc.slot, tc.expectedTime);
        expect(mockStorageSet).toHaveBeenCalledWith(
          expect.objectContaining({ punchPopupSlot: tc.slot, punchPopupExpectedTime: tc.expectedTime }),
        );
      });

      it(`NÃO abre popup se ${tc.slot} já foi batido`, async () => {
        const alreadyPunched = { ...tc.pontoState, [tc.slot]: tc.expectedTime };
        mockStorageGet.mockResolvedValue({ pontoState: alreadyPunched });
        await startReminder(tc.slot, tc.expectedTime);
        expect(mockWindowsCreate).not.toHaveBeenCalled();
      });

      it(`backgroundDetect roda no pre-flight antes de decidir`, async () => {
        await startReminder(tc.slot, tc.expectedTime);
        expect(backgroundDetectSpy).toHaveBeenCalled();
      });
    });
  }
});
