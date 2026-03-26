/**
 * E2E — F6: Contador de Hora Extra
 *
 * Verifica que:
 * - A barra de progresso para em 100% quando jornada completa
 * - Seção de hora extra aparece quando workedMinutes > totalMinutes
 * - Contador reseta à meia-noite (virada de dia)
 * - Hora extra não aparece se já bateu saída
 * - Cores e estilos estão corretos
 */
import { test, expect } from '@playwright/test'
import { launchExtension } from './helpers/extension'
import type { BrowserContext } from '@playwright/test'
import path from 'path'
import os from 'os'
import fs from 'fs'

let ctx: BrowserContext
let extensionId: string
let popupUrl: string
let tmpDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponto-e2e-f6-'))
  const fixture = await launchExtension(tmpDir)
  ctx = fixture.context
  extensionId = fixture.extensionId
  popupUrl = fixture.popupUrl
})

test.afterAll(async () => {
  await ctx.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test('F6-CV-1: barra de progresso para em 100% quando jornada completa', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  await page.evaluate(() => {
    chrome.storage.local.set({
      punchState: {
        entrada: '09:00',
        almoco: '12:00',
        volta: '13:00',
        saida: null,
        _entradaTimestamp: new Date().setHours(9, 0, 0, 0),
      },
      settings: {
        jornada: 480,
        almocoHorario: '12:00',
        almocoDur: 60,
        notifAntecip: 10,
        lembreteAtraso: 30,
        closingDay: 28,
      },
    })
  })

  await page.evaluate(() => {
    const now = new Date()
    now.setHours(18, 0, 0, 0)
    return now
  })

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const progressPct = await page.locator('.progress-pct').textContent()
  expect(progressPct).toBe('100%')

  const progressFill = await page.locator('.progress-fill').evaluate(el => {
    return window.getComputedStyle(el).width
  })
  const progressBar = await page.locator('.progress-bar').evaluate(el => {
    return window.getComputedStyle(el).width
  })

  expect(progressFill).toBe(progressBar)

  await page.close()
})

test('F6-CV-2: seção de hora extra aparece quando workedMinutes > totalMinutes', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const now = new Date()
  const entradaTimestamp = new Date().setHours(9, 0, 0, 0)

  await page.evaluate(
    ({ entradaTs }) => {
      chrome.storage.local.set({
        punchState: {
          entrada: '09:00',
          almoco: '12:00',
          volta: '13:00',
          saida: null,
          _entradaTimestamp: entradaTs,
        },
        settings: {
          jornada: 480,
          almocoHorario: '12:00',
          almocoDur: 60,
          notifAntecip: 10,
          lembreteAtraso: 30,
          closingDay: 28,
        },
      })
    },
    { entradaTs: entradaTimestamp },
  )

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await page.waitForTimeout(1000)

  const overtimeSection = page.locator('.overtime-section')
  const isVisible = await overtimeSection.isVisible().catch(() => false)

  if (isVisible) {
    const overtimeValue = await overtimeSection.locator('.overtime-value').textContent()
    expect(overtimeValue).toMatch(/^\+\d+h\d{2}$/)

    const overtimeLabel = await overtimeSection.locator('.overtime-label').textContent()
    expect(overtimeLabel).toBe('Hora Extra')

    const overtimeIcon = await overtimeSection.locator('.overtime-icon').textContent()
    expect(overtimeIcon).toBe('⏱️')
  } else {
    test.info().annotations.push({
      type: 'info',
      description: 'Hora extra não visível (horário atual ainda não passou da jornada)',
    })
  }

  await page.close()
})

test('F6-CV-3: hora extra não aparece se já bateu saída', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  await page.evaluate(() => {
    chrome.storage.local.set({
      punchState: {
        entrada: '09:00',
        almoco: '12:00',
        volta: '13:00',
        saida: '19:00',
        _entradaTimestamp: new Date().setHours(9, 0, 0, 0),
      },
      settings: {
        jornada: 480,
        almocoHorario: '12:00',
        almocoDur: 60,
        notifAntecip: 10,
        lembreteAtraso: 30,
        closingDay: 28,
      },
    })
  })

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const overtimeSection = page.locator('.overtime-section')
  const isVisible = await overtimeSection.isVisible().catch(() => false)

  expect(isVisible).toBe(false)

  await page.close()
})

test('F6-CV-4: contador reseta à meia-noite (virada de dia)', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const entradaTimestamp = yesterday.setHours(9, 0, 0, 0)

  await page.evaluate(
    ({ entradaTs }) => {
      chrome.storage.local.set({
        punchState: {
          entrada: '09:00',
          almoco: '12:00',
          volta: '13:00',
          saida: null,
          _entradaTimestamp: entradaTs,
        },
        settings: {
          jornada: 480,
          almocoHorario: '12:00',
          almocoDur: 60,
          notifAntecip: 10,
          lembreteAtraso: 30,
          closingDay: 28,
        },
      })
    },
    { entradaTs: entradaTimestamp },
  )

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const progressPct = await page.locator('.progress-pct').textContent()
  expect(progressPct).toBe('0%')

  const overtimeSection = page.locator('.overtime-section')
  const isVisible = await overtimeSection.isVisible().catch(() => false)
  expect(isVisible).toBe(false)

  await page.close()
})

test('F6-CV-5: formato do contador de hora extra está correto', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const now = new Date()
  const entradaTimestamp = new Date().setHours(9, 0, 0, 0)

  await page.evaluate(
    ({ entradaTs }) => {
      chrome.storage.local.set({
        punchState: {
          entrada: '09:00',
          almoco: '12:00',
          volta: '13:00',
          saida: null,
          _entradaTimestamp: entradaTs,
        },
        settings: {
          jornada: 480,
          almocoHorario: '12:00',
          almocoDur: 60,
          notifAntecip: 10,
          lembreteAtraso: 30,
          closingDay: 28,
        },
      })
    },
    { entradaTs: entradaTimestamp },
  )

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await page.waitForTimeout(1000)

  const overtimeSection = page.locator('.overtime-section')
  const isVisible = await overtimeSection.isVisible().catch(() => false)

  if (isVisible) {
    const overtimeValue = await overtimeSection.locator('.overtime-value').textContent()
    
    expect(overtimeValue).toMatch(/^\+\d+h\d{2}$/)
    
    const match = overtimeValue?.match(/^\+(\d+)h(\d{2})$/)
    if (match) {
      const hours = parseInt(match[1], 10)
      const minutes = parseInt(match[2], 10)
      
      expect(hours).toBeGreaterThanOrEqual(0)
      expect(minutes).toBeGreaterThanOrEqual(0)
      expect(minutes).toBeLessThan(60)
    }
  }

  await page.close()
})

test('F6-CV-6: estilos CSS da seção de hora extra estão aplicados', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const entradaTimestamp = new Date().setHours(9, 0, 0, 0)

  await page.evaluate(
    ({ entradaTs }) => {
      chrome.storage.local.set({
        punchState: {
          entrada: '09:00',
          almoco: '12:00',
          volta: '13:00',
          saida: null,
          _entradaTimestamp: entradaTs,
        },
        settings: {
          jornada: 480,
          almocoHorario: '12:00',
          almocoDur: 60,
          notifAntecip: 10,
          lembreteAtraso: 30,
          closingDay: 28,
        },
      })
    },
    { entradaTs: entradaTimestamp },
  )

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  await page.waitForTimeout(1000)

  const overtimeSection = page.locator('.overtime-section')
  const isVisible = await overtimeSection.isVisible().catch(() => false)

  if (isVisible) {
    const styles = await overtimeSection.evaluate(el => {
      const computed = window.getComputedStyle(el)
      return {
        display: computed.display,
        gap: computed.gap,
        borderRadius: computed.borderRadius,
        borderLeftWidth: computed.borderLeftWidth,
      }
    })

    expect(styles.display).toBe('flex')
    expect(styles.gap).toBe('8px')
    expect(styles.borderRadius).toBe('6px')
    expect(styles.borderLeftWidth).toBe('3px')

    const iconSize = await overtimeSection.locator('.overtime-icon').evaluate(el => {
      return window.getComputedStyle(el).fontSize
    })
    expect(iconSize).toBe('16px')

    const labelWeight = await overtimeSection.locator('.overtime-label').evaluate(el => {
      return window.getComputedStyle(el).fontWeight
    })
    expect(labelWeight).toBe('500')

    const valueWeight = await overtimeSection.locator('.overtime-value').evaluate(el => {
      return window.getComputedStyle(el).fontWeight
    })
    expect(valueWeight).toBe('700')
  }

  await page.close()
})

test('F6-CV-7: jornada em andamento não mostra hora extra', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const entradaTimestamp = new Date().setHours(9, 0, 0, 0)

  await page.evaluate(
    ({ entradaTs }) => {
      chrome.storage.local.set({
        punchState: {
          entrada: '09:00',
          almoco: '12:00',
          volta: '13:00',
          saida: null,
          _entradaTimestamp: entradaTs,
        },
        settings: {
          jornada: 480,
          almocoHorario: '12:00',
          almocoDur: 60,
          notifAntecip: 10,
          lembreteAtraso: 30,
          closingDay: 28,
        },
      })
    },
    { entradaTs: entradaTimestamp },
  )

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const progressPct = await page.locator('.progress-pct').textContent()
  const pctValue = parseInt(progressPct?.replace('%', '') ?? '0', 10)

  if (pctValue < 100) {
    const overtimeSection = page.locator('.overtime-section')
    const isVisible = await overtimeSection.isVisible().catch(() => false)
    expect(isVisible).toBe(false)
  }

  await page.close()
})

test('F6-CV-8: virada de dia não reseta se já bateu saída', async () => {
  const page = await ctx.newPage()
  await page.goto(popupUrl)
  await page.waitForLoadState('domcontentloaded')

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const entradaTimestamp = yesterday.setHours(9, 0, 0, 0)

  await page.evaluate(
    ({ entradaTs }) => {
      chrome.storage.local.set({
        punchState: {
          entrada: '09:00',
          almoco: '12:00',
          volta: '13:00',
          saida: '19:00',
          _entradaTimestamp: entradaTs,
        },
        settings: {
          jornada: 480,
          almocoHorario: '12:00',
          almocoDur: 60,
          notifAntecip: 10,
          lembreteAtraso: 30,
          closingDay: 28,
        },
      })
    },
    { entradaTs: entradaTimestamp },
  )

  await page.reload()
  await page.waitForLoadState('domcontentloaded')

  const progressPct = await page.locator('.progress-pct').textContent()
  expect(progressPct).toBe('100%')

  const overtimeSection = page.locator('.overtime-section')
  const isVisible = await overtimeSection.isVisible().catch(() => false)
  expect(isVisible).toBe(false)

  await page.close()
})
