/**
 * E2E — Popup de Lembrete de Ponto (punch-reminder.html)
 *
 * Testa o HTML/JS do popup diretamente:
 * - Renderiza corretamente para cada slot
 * - Exibe título, ícone e horário esperado
 * - Botão "Registrar agora" fecha a janela
 */
import { test, expect } from '@playwright/test'
import { launchExtension } from './helpers/extension'
import type { BrowserContext } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let extensionId: string
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-reminder-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  extensionId = fixture.extensionId
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function reminderUrl(slot: string, time: string) {
  return `chrome-extension://${extensionId}/punch-reminder.html?slot=${slot}&time=${encodeURIComponent(time)}`
}

// ── P1.2: HTML exibe nome do slot e horário ───────────────────────────────────

test('P1.2-entrada — BUG 3 — popup entrada exibe "Hora da Entrada!" e horário', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('entrada', '08:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#title')).toHaveText('Hora da Entrada!')
  await expect(page.locator('#msg')).toContainText('iniciar a jornada')
  await expect(page.locator('#msg')).toContainText('08:00')
  await expect(page.locator('#icon')).toHaveText('🌅')
  await page.close()
})

test('P1.2-entrada-visual — BUG 3 — snapshot visual do popup de entrada', async () => {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 420, height: 220 })
  await page.goto(reminderUrl('entrada', '08:00'))
  await page.waitForLoadState('domcontentloaded')
  // Aguarda CSS aplicar e fontes carregarem
  await page.waitForTimeout(200)
  await expect(page).toHaveScreenshot('punch-reminder-entrada.png', {
    maxDiffPixelRatio: 0.02,
  })
  await page.close()
})

test('P1.2a — popup almoco exibe "Hora do Almoço!" e horário', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#title')).toHaveText('Hora do Almoço!')
  await expect(page.locator('#msg')).toContainText('12:00')
  await page.close()
})

test('P1.2b — popup volta exibe "Hora de Voltar!" e horário', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('volta', '13:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#title')).toHaveText('Hora de Voltar!')
  await expect(page.locator('#msg')).toContainText('13:00')
  await page.close()
})

test('P1.2c — popup saida exibe "Hora de Sair!" e horário', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('saida', '18:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#title')).toHaveText('Hora de Sair!')
  await expect(page.locator('#msg')).toContainText('18:00')
  await page.close()
})

// ── Ícones por slot ───────────────────────────────────────────────────────────

test('popup almoco exibe ícone de almoço', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#icon')).toHaveText('🍽️')
  await page.close()
})

test('popup volta exibe ícone de maleta', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('volta', '13:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#icon')).toHaveText('💼')
  await page.close()
})

test('popup saida exibe ícone de casa', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('saida', '18:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#icon')).toHaveText('🏠')
  await page.close()
})

// ── Botão "Registrar agora" ───────────────────────────────────────────────────

test('popup carrega sem erros de console', async () => {
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))

  await page.goto(reminderUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')

  expect(errors).toHaveLength(0)
  await page.close()
})

test('botão "Registrar agora" está presente e visível', async () => {
  // Pós-0.9: o botão é criado dinamicamente em #actions (antes era #btnOk
  // estático no HTML). Selector atualizado pra refletir a nova estrutura.
  const page = await ctx.newPage()
  await page.goto(reminderUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')

  const btn = page.locator('#actions button.btn-primary')
  await expect(btn).toBeVisible()
  await expect(btn).toHaveText('Registrar agora')
  await page.close()
})

// ── Click chain: botão → OPEN_PUNCH_PAGE → abertura do Senior ────────────────

test('click em "Registrar agora" dispara mensagem OPEN_PUNCH_PAGE e fecha popup', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')

  // Intercepta chrome.runtime.sendMessage antes do click pra ver o que sai
  const sentMessages = await page.evaluate(() => {
    const captured: unknown[] = [];
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    (chrome.runtime as { sendMessage: unknown }).sendMessage = ((msg: unknown, cb?: () => void) => {
      captured.push(msg);
      // Não chama a real pra não abrir aba do Senior de verdade no teste
      if (typeof cb === 'function') cb();
    }) as typeof chrome.runtime.sendMessage;
    (window as unknown as { __captured: unknown[] }).__captured = captured;
    void original; // mantém referência pra evitar GC
    return captured;
  })
  void sentMessages;

  // window.close() não funciona em página normal (só em popup aberto via
  // windows.create). Em vez disso, intercepta a chamada.
  await page.evaluate(() => {
    (window as unknown as { __closeCalled: boolean }).__closeCalled = false;
    window.close = () => { (window as unknown as { __closeCalled: boolean }).__closeCalled = true; };
  })

  await page.locator('#actions button.btn-primary').click()

  const result = await page.evaluate(() => ({
    messages: (window as unknown as { __captured: unknown[] }).__captured,
    closeCalled: (window as unknown as { __closeCalled: boolean }).__closeCalled,
  }))

  expect(result.messages).toContainEqual({ type: 'OPEN_PUNCH_PAGE' })
  expect(result.closeCalled).toBe(true)
  await page.close()
})

test('click → redirect funciona pros 4 slots (entrada, almoco, volta, saida)', async () => {
  for (const slot of ['entrada', 'almoco', 'volta', 'saida'] as const) {
    const page = await ctx.newPage()
    await page.goto(reminderUrl(slot, '12:00'))
    await page.waitForLoadState('domcontentloaded')

    await page.evaluate(() => {
      const captured: unknown[] = [];
      (chrome.runtime as { sendMessage: unknown }).sendMessage = ((msg: unknown, cb?: () => void) => {
        captured.push(msg);
        if (typeof cb === 'function') cb();
      }) as typeof chrome.runtime.sendMessage;
      (window as unknown as { __captured: unknown[] }).__captured = captured;
      window.close = () => {};
    })

    await page.locator('#actions button.btn-primary').click()
    const messages = await page.evaluate(() => (window as unknown as { __captured: unknown[] }).__captured)
    expect(messages, `slot=${slot}`).toContainEqual({ type: 'OPEN_PUNCH_PAGE' })
    await page.close()
  }
})

// ── Escalated mode (após 20 min sem detectar) ────────────────────────────────

function escalatedUrl(slot: string, time: string) {
  return `chrome-extension://${extensionId}/punch-reminder.html?slot=${slot}&time=${encodeURIComponent(time)}&escalated=1`
}

test('modo escalado exibe título "Não consegui sincronizar" e ícone ⚠️', async () => {
  const page = await ctx.newPage()
  await page.goto(escalatedUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#title')).toHaveText('Não consegui sincronizar')
  await expect(page.locator('#icon')).toHaveText('⚠️')
  await expect(page.locator('#msg')).toContainText('almoço')
  await page.close()
})

test('modo escalado tem os 3 botões: Já bati, Abrir Senior, Parar lembretes', async () => {
  const page = await ctx.newPage()
  await page.goto(escalatedUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')

  await expect(page.locator('#actions button.btn-primary')).toContainText('Já bati')
  await expect(page.locator('#actions button.btn-secondary')).toContainText('Abrir Senior')
  await expect(page.locator('#actions button.btn-tertiary')).toContainText('Parar de lembrar')
  await page.close()
})

test('botão "Já bati" dispara MARK_SLOT_PUNCHED com slot e time', async () => {
  const page = await ctx.newPage()
  await page.goto(escalatedUrl('almoco', '12:15'))
  await page.waitForLoadState('domcontentloaded')

  await page.evaluate(() => {
    const captured: unknown[] = [];
    (chrome.runtime as { sendMessage: unknown }).sendMessage = ((msg: unknown, cb?: () => void) => {
      captured.push(msg);
      if (typeof cb === 'function') cb();
    }) as typeof chrome.runtime.sendMessage;
    (window as unknown as { __captured: unknown[] }).__captured = captured;
    window.close = () => {};
  })

  await page.locator('#actions button.btn-primary').click()
  const messages = await page.evaluate(() => (window as unknown as { __captured: unknown[] }).__captured)
  expect(messages).toContainEqual({ type: 'MARK_SLOT_PUNCHED', slot: 'almoco', time: '12:15' })
  await page.close()
})

test('botão "Parar de lembrar" dispara DISMISS_SLOT_REMINDERS', async () => {
  const page = await ctx.newPage()
  await page.goto(escalatedUrl('saida', '17:30'))
  await page.waitForLoadState('domcontentloaded')

  await page.evaluate(() => {
    const captured: unknown[] = [];
    (chrome.runtime as { sendMessage: unknown }).sendMessage = ((msg: unknown, cb?: () => void) => {
      captured.push(msg);
      if (typeof cb === 'function') cb();
    }) as typeof chrome.runtime.sendMessage;
    (window as unknown as { __captured: unknown[] }).__captured = captured;
    window.close = () => {};
  })

  await page.locator('#actions button.btn-tertiary').click()
  const messages = await page.evaluate(() => (window as unknown as { __captured: unknown[] }).__captured)
  expect(messages).toContainEqual({ type: 'DISMISS_SLOT_REMINDERS', slot: 'saida' })
  await page.close()
})

test('botão "Abrir Senior" (modo escalado) também dispara OPEN_PUNCH_PAGE', async () => {
  const page = await ctx.newPage()
  await page.goto(escalatedUrl('volta', '13:00'))
  await page.waitForLoadState('domcontentloaded')

  await page.evaluate(() => {
    const captured: unknown[] = [];
    (chrome.runtime as { sendMessage: unknown }).sendMessage = ((msg: unknown, cb?: () => void) => {
      captured.push(msg);
      if (typeof cb === 'function') cb();
    }) as typeof chrome.runtime.sendMessage;
    (window as unknown as { __captured: unknown[] }).__captured = captured;
    window.close = () => {};
  })

  await page.locator('#actions button.btn-secondary').click()
  const messages = await page.evaluate(() => (window as unknown as { __captured: unknown[] }).__captured)
  expect(messages).toContainEqual({ type: 'OPEN_PUNCH_PAGE' })
  await page.close()
})

test('popup sem slot desconhecido usa fallback gracioso', async () => {
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))

  await page.goto(reminderUrl('invalido', ''))
  await page.waitForLoadState('domcontentloaded')

  // Não deve lançar erro; usa fallback
  expect(errors).toHaveLength(0)
  await expect(page.locator('#title')).toHaveText('Lembrete de Ponto')
  await page.close()
})

// ── Sound loop ────────────────────────────────────────────────────────────────

test('audio do popup é criado com loop=true (toca em ciclo até user agir)', async () => {
  const page = await ctx.newPage()
  // Intercepta `new Audio()` antes do popup carregar pra capturar o objeto
  await page.addInitScript(() => {
    (window as { __capturedAudios?: HTMLAudioElement[] }).__capturedAudios = [];
    const OriginalAudio = window.Audio;
    (window as unknown as { Audio: unknown }).Audio = function (src?: string) {
      const a = new OriginalAudio(src);
      (window as unknown as { __capturedAudios: HTMLAudioElement[] }).__capturedAudios.push(a);
      return a;
    } as unknown as typeof Audio;
  })

  await page.goto(reminderUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')
  // dá tempo do playReminderSound async pegar settings e construir o Audio
  await page.waitForTimeout(500)

  const loopAttr = await page.evaluate(() => {
    const audios = (window as unknown as { __capturedAudios: HTMLAudioElement[] }).__capturedAudios
    return audios.length > 0 ? audios[0].loop : null
  })
  expect(loopAttr).toBe(true)
  await page.close()
})

test('audio do popup NÃO é criado em modo escalado (sem som na escalação)', async () => {
  const page = await ctx.newPage()
  await page.addInitScript(() => {
    (window as { __capturedAudios?: HTMLAudioElement[] }).__capturedAudios = [];
    const OriginalAudio = window.Audio;
    (window as unknown as { Audio: unknown }).Audio = function (src?: string) {
      const a = new OriginalAudio(src);
      (window as unknown as { __capturedAudios: HTMLAudioElement[] }).__capturedAudios.push(a);
      return a;
    } as unknown as typeof Audio;
  })

  await page.goto(escalatedUrl('almoco', '12:00'))
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)

  const count = await page.evaluate(
    () => (window as unknown as { __capturedAudios: HTMLAudioElement[] }).__capturedAudios.length,
  )
  expect(count).toBe(0)
  await page.close()
})

// ── Exibição do horário no conteúdo da mensagem ───────────────────────────────

test('horário aparece em negrito no corpo da mensagem', async () => {
  const page = await ctx.newPage()
  await page.goto(reminderUrl('saida', '17:30'))
  await page.waitForLoadState('domcontentloaded')

  const strong = page.locator('#msg strong')
  await expect(strong).toHaveText('17:30')
  await page.close()
})
