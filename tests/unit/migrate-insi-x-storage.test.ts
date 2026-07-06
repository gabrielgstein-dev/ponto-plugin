/**
 * migrateInsiXStorageKeys — migração do rebrand Meta X → Insi X (0.13.0).
 *
 * O rename renomeou as chaves persistidas do feature. Estes testes garantem
 * que a base já instalada NÃO perde a preferência do lembrete nem o
 * "respondido essa semana" ao atualizar — e que a migração é idempotente.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { migrateInsiXStorageKeys } from '../../lib/application/install-init';
import { mockStorageGet, mockStorageSet, mockStorageRemove, mockAlarmsClear } from '../setup/chrome-mock';

beforeEach(() => {
  mockStorageGet.mockResolvedValue({});
  mockStorageSet.mockResolvedValue(undefined);
  mockStorageRemove.mockResolvedValue(undefined);
});

describe('migrateInsiXStorageKeys', () => {
  it('copia metaXState → insiXState e remove a chave antiga', async () => {
    const state = { lastRespondedWeekKey: '2026-W28', lastRespondedAt: 123 };
    mockStorageGet.mockResolvedValue({ metaXState: state });

    await migrateInsiXStorageKeys();

    expect(mockStorageSet).toHaveBeenCalledWith(expect.objectContaining({ insiXState: state }));
    expect(mockStorageRemove).toHaveBeenCalledWith(expect.arrayContaining(['metaXState']));
  });

  it('migra pontoSettings.metaXReminder → insiXReminder preservando os demais campos', async () => {
    const settings = { jornada: 480, soundEnabled: false, metaXReminder: false };
    mockStorageGet.mockResolvedValue({ pontoSettings: settings });

    await migrateInsiXStorageKeys();

    const setArg = mockStorageSet.mock.calls[0][0] as { pontoSettings: Record<string, unknown> };
    expect(setArg.pontoSettings.insiXReminder).toBe(false); // preferência (desligado) preservada
    expect(setArg.pontoSettings).not.toHaveProperty('metaXReminder'); // campo antigo removido
    expect(setArg.pontoSettings.jornada).toBe(480); // demais campos intactos
    expect(setArg.pontoSettings.soundEnabled).toBe(false);
  });

  it('NÃO sobrescreve insiXState quando o formato novo já existe', async () => {
    const novo = { lastRespondedWeekKey: '2026-W29', lastRespondedAt: 999 };
    const antigo = { lastRespondedWeekKey: '2026-W01', lastRespondedAt: 1 };
    mockStorageGet.mockResolvedValue({ insiXState: novo, metaXState: antigo });

    await migrateInsiXStorageKeys();

    // não deve escrever insiXState (já está no formato novo); só limpa o antigo
    const wroteInsiXState = mockStorageSet.mock.calls.some(
      ([arg]) => (arg as Record<string, unknown>).insiXState !== undefined
    );
    expect(wroteInsiXState).toBe(false);
    expect(mockStorageRemove).toHaveBeenCalledWith(expect.arrayContaining(['metaXState']));
  });

  it('NÃO sobrescreve insiXReminder quando já existe no pontoSettings', async () => {
    const settings = { insiXReminder: true, metaXReminder: false };
    mockStorageGet.mockResolvedValue({ pontoSettings: settings });

    await migrateInsiXStorageKeys();

    const setArg = mockStorageSet.mock.calls[0][0] as { pontoSettings: Record<string, unknown> };
    expect(setArg.pontoSettings.insiXReminder).toBe(true); // valor novo mantido
    expect(setArg.pontoSettings).not.toHaveProperty('metaXReminder');
  });

  it('descarta chaves efêmeras de runtime sem migrá-las', async () => {
    mockStorageGet.mockResolvedValue({
      metaXPopupWindowId: 42,
      metaXPopupContext: 'morning',
      metaXGateSaidaExpectedTime: '17:00',
    });

    await migrateInsiXStorageKeys();

    expect(mockStorageRemove).toHaveBeenCalledWith(
      expect.arrayContaining(['metaXPopupWindowId', 'metaXPopupContext', 'metaXGateSaidaExpectedTime'])
    );
    // nenhuma delas vira insiX* — são descartáveis
    const setArgs = mockStorageSet.mock.calls.flatMap(([arg]) => Object.keys(arg as object));
    expect(setArgs).not.toContain('insiXPopupWindowId');
  });

  it('limpa os alarmes antigos do feature (meta_x_*)', async () => {
    await migrateInsiXStorageKeys();

    expect(mockAlarmsClear).toHaveBeenCalledWith('meta_x_snooze');
    expect(mockAlarmsClear).toHaveBeenCalledWith('meta_x_notify');
  });

  it('storage vazio (instalação nova): não escreve nem remove nada', async () => {
    mockStorageGet.mockResolvedValue({});

    await migrateInsiXStorageKeys();

    expect(mockStorageSet).not.toHaveBeenCalled();
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it('é idempotente: após migrar uma vez, a 2ª rodada (só formato novo) não escreve nem remove', async () => {
    // 2ª execução: já tudo migrado, sem chaves antigas
    mockStorageGet.mockResolvedValue({
      insiXState: { lastRespondedWeekKey: '2026-W28', lastRespondedAt: 123 },
      pontoSettings: { jornada: 480, insiXReminder: false },
    });

    await migrateInsiXStorageKeys();

    expect(mockStorageSet).not.toHaveBeenCalled();
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });
});
