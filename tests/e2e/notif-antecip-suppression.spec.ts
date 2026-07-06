/**
 * E2E — Avisos de antecipação (notif_*) respeitam ponto já batido.
 *
 * Bug de campo (logs de 2026-07-06): usuário com entrada configurada 08:30
 * bateu às 08:17. O batimento foi detectado e persistido às 08:17, mas os
 * avisos de antecipação das 08:20 (notif_entrada) e 08:25 (notif_entrada_5)
 * dispararam mesmo assim — handleNotifAlarm não consultava pontoState.
 *
 * Fix: checagem centralizada em lib/application/punch-state.ts
 * (isSlotPunchedToday), usada por todos os handlers de lembrete.
 *
 * Estes testes disparam ALARMES REAIS do chrome.alarms contra o listener
 * real do background e observam chrome.notifications — a mesma superfície
 * onde o bug aconteceu.
 *
 * Pré-requisito: extensão buildada (.output/chrome-mv3).
 */
import { test, expect } from '@playwright/test'
import { launchExtension } from './helpers/extension'
import type { BrowserContext, Worker } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let sw: Worker
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-notif-antecip-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  const worker = ctx.serviceWorkers()[0]
  if (!worker) throw new Error('Service worker não disponível')
  sw = worker
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function resetStorage(data: Record<string, unknown>) {
  await sw.evaluate(async (d) => {
    await chrome.storage.local.clear()
    await chrome.storage.local.set(d)
  }, data)
  await sw.evaluate(async () => {
    const alarms = await chrome.alarms.getAll()
    await Promise.all(alarms.map(a => chrome.alarms.clear(a.name)))
    await new Promise<void>(resolve => chrome.notifications.getAll((all) => {
      Object.keys(all).forEach(id => chrome.notifications.clear(id))
      resolve()
    }))
  })
}

/** Dispara o alarme de verdade e espera o handler do background processar. */
async function fireAlarm(name: string) {
  // when=+1s só funciona porque a extensão está unpacked (--load-extension):
  // o Chrome dispensa o mínimo de 30s do chrome.alarms nesse modo. Se um dia
  // a suíte rodar contra build empacotada (.crx), este timing precisa mudar.
  await sw.evaluate(async (alarmName) => {
    chrome.alarms.create(alarmName, { when: Date.now() + 1000 })
  }, name)
  // fire (~1s) + processamento async do handler; bem abaixo dos 8s do
  // auto-clear da notificação, então uma notificação criada ainda é visível.
  await new Promise(r => setTimeout(r, 4000))
}

async function getActiveNotifications(): Promise<Record<string, unknown>> {
  return sw.evaluate(
    () => new Promise<Record<string, unknown>>(resolve => chrome.notifications.getAll(resolve)),
  )
}

const SETTINGS = { entradaHorario: '08:30', notifAntecip: 10, lembreteAtraso: 30, weekdaysOnly: false }
const MSG_10MIN = 'Hora de bater entrada em 10 minutos!'
const MSG_5MIN = 'Hora de bater entrada em 5 minutos!'

// ── Cenário do bug: bateu 08:17, entrada configurada 08:30 ────────────────────

test('notif_entrada NÃO notifica quando a entrada já foi batida (bug 08:17 vs 08:30)', async () => {
  await resetStorage({
    pontoState: { entrada: '08:17', almoco: null, volta: null, saida: null },
    pontoDate: new Date().toDateString(),
    pontoSettings: SETTINGS,
    alarm_msg_notif_entrada: MSG_10MIN,
  })

  await fireAlarm('notif_entrada')

  const notifications = await getActiveNotifications()
  expect(Object.keys(notifications)).not.toContain('notif_entrada')

  // Prova de que o handler RODOU e tomou o caminho de supressão (e não que o
  // alarme simplesmente não disparou): a msgKey é removida do storage.
  const leftover = await sw.evaluate(async () => {
    const d = await chrome.storage.local.get('alarm_msg_notif_entrada')
    return d.alarm_msg_notif_entrada ?? null
  })
  expect(leftover).toBeNull()
})

test('notif_entrada_5 (2º aviso) também é suprimido com entrada batida', async () => {
  await resetStorage({
    pontoState: { entrada: '08:17', almoco: null, volta: null, saida: null },
    pontoDate: new Date().toDateString(),
    pontoSettings: SETTINGS,
    alarm_msg_notif_entrada_5: MSG_5MIN,
  })

  await fireAlarm('notif_entrada_5')

  const notifications = await getActiveNotifications()
  expect(Object.keys(notifications)).not.toContain('notif_entrada_5')

  const leftover = await sw.evaluate(async () => {
    const d = await chrome.storage.local.get('alarm_msg_notif_entrada_5')
    return d.alarm_msg_notif_entrada_5 ?? null
  })
  expect(leftover).toBeNull()
})

// ── Controle: sem batimento, o aviso continua funcionando ─────────────────────

test('notif_entrada AINDA notifica quando a entrada não foi batida (controle)', async () => {
  await resetStorage({
    pontoState: { entrada: null, almoco: null, volta: null, saida: null },
    pontoDate: new Date().toDateString(),
    pontoSettings: SETTINGS,
    alarm_msg_notif_entrada: MSG_10MIN,
  })

  await fireAlarm('notif_entrada')

  const notifications = await getActiveNotifications()
  expect(Object.keys(notifications)).toContain('notif_entrada')
})

// ── Estado de ontem não pode suprimir o aviso de hoje ─────────────────────────

test('pontoState de ONTEM não suprime o aviso (reset diário perdido)', async () => {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  await resetStorage({
    pontoState: { entrada: '08:00', almoco: '12:00', volta: '13:00', saida: '18:00' },
    pontoDate: yesterday.toDateString(),
    pontoSettings: SETTINGS,
    alarm_msg_notif_entrada: MSG_10MIN,
  })

  await fireAlarm('notif_entrada')

  const notifications = await getActiveNotifications()
  expect(Object.keys(notifications)).toContain('notif_entrada')
})

// ── reminder_* (atraso) continua suprimido — mesma checagem central ───────────

test('reminder_entrada NÃO notifica quando a entrada já foi batida', async () => {
  await resetStorage({
    pontoState: { entrada: '08:17', almoco: null, volta: null, saida: null },
    pontoDate: new Date().toDateString(),
    pontoSettings: SETTINGS,
    alarm_msg_reminder_entrada: 'Você ainda não bateu a entrada! (30 min em atraso)',
  })

  await fireAlarm('reminder_entrada')

  const notifications = await getActiveNotifications()
  expect(Object.keys(notifications)).not.toContain('reminder_entrada')

  const leftover = await sw.evaluate(async () => {
    const d = await chrome.storage.local.get('alarm_msg_reminder_entrada')
    return d.alarm_msg_reminder_entrada ?? null
  })
  expect(leftover).toBeNull()
})
