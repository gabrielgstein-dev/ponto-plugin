/**
 * install-init — inicialização defensiva do storage no onInstalled.
 *
 * Bug histórico que motivou a refatoração: o handler antigo usava
 * `if (!result.pontoState)` pra decidir se inicializava o storage. Esse
 * check é true tanto pra `undefined` (primeira instalação) quanto pra
 * `null` (estado normal após `dailyReset` à meia-noite). Em qualquer
 * atualização do plugin após a virada do dia, `pontoSettings` era
 * reescrito como null e o user perdia jornada, horários, som etc.
 *
 * A função foi extraída pra um módulo importável (vs inline no
 * defineBackground) justamente pra ser testável e ter ZERO réplica entre
 * test e produção — `entrypoints/background.ts` importa esse mesmo módulo,
 * então qualquer regressão é pega aqui.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initializeStorageIfNeeded } from '../../lib/application/install-init';
import { mockStorageGet, mockStorageSet } from '../setup/chrome-mock';

beforeEach(() => {
  mockStorageGet.mockResolvedValue({});
  mockStorageSet.mockResolvedValue(undefined);
});

describe('initializeStorageIfNeeded', () => {
  it('CENÁRIO-BUG: NÃO sobrescreve pontoSettings quando pontoState=null (pós-dailyReset)', async () => {
    // Estado típico após dailyReset à meia-noite
    const userSettings = {
      jornada: 450,
      entradaHorario: '07:30',
      almocoHorario: '11:30',
      almocoDur: 45,
      notifAntecip: 15,
      lembreteAtraso: 20,
      closingDay: 25,
      soundEnabled: true,
      customSoundDataUrl: 'data:audio/mp3;base64,FAKE',
      soundVolume: 0.5,
    };
    mockStorageGet.mockResolvedValue({
      pontoState: null, // ← null, NÃO undefined
      pontoSettings: userSettings,
      pontoDate: '2026-05-15',
    });

    await initializeStorageIfNeeded();

    // storage.set NÃO deve ter sido chamado — tudo já estava definido
    expect(mockStorageSet).not.toHaveBeenCalled();
  });

  it('CENÁRIO-BUG (regression): o check ANTIGO `!pontoState` quebraria aqui', async () => {
    // Esse teste documenta explicitamente o cenário que quebrava antes.
    // Se alguém regredir pro check antigo (!result.pontoState), esse
    // teste pega: pontoState=null entra no if e settings são wipeadas.
    const userSettings = { jornada: 480, soundEnabled: false };
    mockStorageGet.mockResolvedValue({
      pontoState: null,
      pontoSettings: userSettings,
      pontoDate: '2026-05-15',
    });

    await initializeStorageIfNeeded();

    // Assert duplo: 1) nada foi escrito 2) settings preservadas
    expect(mockStorageSet).not.toHaveBeenCalled();
    // Como nada foi escrito, a leitura subsequente retornaria o mesmo valor
    const finalState = await chrome.storage.local.get(['pontoSettings']);
    expect(finalState.pontoSettings).toEqual(userSettings);
  });

  it('primeira instalação (storage vazio): inicializa todas as 3 keys', async () => {
    mockStorageGet.mockResolvedValue({});

    await initializeStorageIfNeeded();

    expect(mockStorageSet).toHaveBeenCalledTimes(1);
    const args = mockStorageSet.mock.calls[0][0] as Record<string, unknown>;
    expect(args.pontoState).toBeNull();
    expect(args.pontoSettings).toBeNull();
    expect(typeof args.pontoDate).toBe('string');
  });

  it('inicializa apenas pontoSettings quando os outros existem', async () => {
    mockStorageGet.mockResolvedValue({
      pontoState: null,
      pontoDate: '2026-05-15',
      // pontoSettings ausente
    });

    await initializeStorageIfNeeded();

    expect(mockStorageSet).toHaveBeenCalledWith({ pontoSettings: null });
  });

  it('inicializa apenas pontoState quando os outros existem', async () => {
    mockStorageGet.mockResolvedValue({
      pontoSettings: { jornada: 480 },
      pontoDate: '2026-05-15',
    });

    await initializeStorageIfNeeded();

    expect(mockStorageSet).toHaveBeenCalledWith({ pontoState: null });
  });

  it('inicializa apenas pontoDate quando os outros existem', async () => {
    mockStorageGet.mockResolvedValue({
      pontoState: null,
      pontoSettings: { jornada: 480 },
    });

    await initializeStorageIfNeeded();

    expect(mockStorageSet).toHaveBeenCalledTimes(1);
    const args = mockStorageSet.mock.calls[0][0] as Record<string, unknown>;
    expect(args).toHaveProperty('pontoDate');
    expect(args).not.toHaveProperty('pontoState');
    expect(args).not.toHaveProperty('pontoSettings');
  });

  it('é idempotente: rodar 2x não altera mais do que rodar 1x', async () => {
    mockStorageGet.mockResolvedValue({
      pontoState: null,
      pontoSettings: { jornada: 480 },
      pontoDate: '2026-05-15',
    });

    await initializeStorageIfNeeded();
    await initializeStorageIfNeeded();
    await initializeStorageIfNeeded();

    expect(mockStorageSet).not.toHaveBeenCalled();
  });

  it('preserva pontoState quando é truthy (e.g., já tem entrada batida)', async () => {
    // Edge case: user instalou de manhã, bateu entrada às 08:00, e depois
    // o plugin foi atualizado. pontoState está cheio, não pode ser tocado.
    const activeState = { entrada: '08:00', almoco: null, volta: null, saida: null };
    mockStorageGet.mockResolvedValue({
      pontoState: activeState,
      pontoSettings: { jornada: 480 },
      pontoDate: '2026-05-15',
    });

    await initializeStorageIfNeeded();

    expect(mockStorageSet).not.toHaveBeenCalled();
  });

  it('lê exatamente as 3 keys necessárias (não vasculha storage inteiro)', async () => {
    await initializeStorageIfNeeded();

    expect(mockStorageGet).toHaveBeenCalledWith(['pontoState', 'pontoSettings', 'pontoDate']);
  });

  it('CENÁRIO USUÁRIO: muda entradaHorario de 08:00 pra 09:00 e atualiza plugin', async () => {
    // 1. User editou entradaHorario na tela de Settings — saveSettings salvou
    //    o objeto completo com o novo valor.
    const settingsApósEdição = {
      jornada: 480,
      entradaHorario: '09:00',  // ← mudou de 08:00
      almocoHorario: '12:00',
      almocoDur: 60,
      notifAntecip: 10,
      lembreteAtraso: 30,
      closingDay: 28,
      soundEnabled: true,
      customSoundDataUrl: null,
      soundVolume: 1,
    };
    mockStorageGet.mockResolvedValue({
      pontoState: null,  // pode estar null (madrugada após dailyReset)
      pontoSettings: settingsApósEdição,
      pontoDate: '2026-05-15',
    });

    // 2. Plugin atualiza — onInstalled dispara com reason='update'
    await initializeStorageIfNeeded();

    // 3. Nada foi escrito
    expect(mockStorageSet).not.toHaveBeenCalled();

    // 4. entradaHorario continua sendo 09:00 (não voltou pro default 08:00)
    const after = await chrome.storage.local.get('pontoSettings');
    expect(after.pontoSettings.entradaHorario).toBe('09:00');
  });

  it('GARANTIA: cada campo individual de Settings (10 no total) é preservado', async () => {
    // Enumera explicitamente cada campo que o user pode customizar.
    // Se algum dia alguém adicionar wipe de uma key específica, esse teste
    // documenta exatamente o que NÃO pode ser perdido.
    const allUserSettings = {
      jornada: 450,                          // jornada customizada
      entradaHorario: '07:30',               // horário de entrada
      almocoHorario: '11:30',                // horário de almoço
      almocoDur: 45,                         // duração do almoço
      notifAntecip: 15,                      // antecipação de notif
      lembreteAtraso: 20,                    // atraso do lembrete
      closingDay: 25,                        // dia de fechamento (build não-Senior)
      soundEnabled: true,                    // som ligado/desligado
      customSoundDataUrl: 'data:audio/mp3;base64,SUQzBAAAAAAA',  // som customizado
      soundVolume: 0.75,                     // volume do som
    };
    mockStorageGet.mockResolvedValue({
      pontoState: null,
      pontoSettings: allUserSettings,
      pontoDate: '2026-05-15',
    });

    await initializeStorageIfNeeded();

    // storage.set NÃO deve ser chamado — settings intactos
    expect(mockStorageSet).not.toHaveBeenCalled();

    // E quando re-lê, tudo continua lá
    const after = await chrome.storage.local.get(['pontoSettings']);
    expect(after.pontoSettings).toEqual(allUserSettings);

    // Verificação granular pra documentar cada campo
    expect(after.pontoSettings.jornada).toBe(450);
    expect(after.pontoSettings.entradaHorario).toBe('07:30');
    expect(after.pontoSettings.almocoHorario).toBe('11:30');
    expect(after.pontoSettings.almocoDur).toBe(45);
    expect(after.pontoSettings.notifAntecip).toBe(15);
    expect(after.pontoSettings.lembreteAtraso).toBe(20);
    expect(after.pontoSettings.closingDay).toBe(25);
    expect(after.pontoSettings.soundEnabled).toBe(true);
    expect(after.pontoSettings.customSoundDataUrl).toBe('data:audio/mp3;base64,SUQzBAAAAAAA');
    expect(after.pontoSettings.soundVolume).toBe(0.75);
  });
});
