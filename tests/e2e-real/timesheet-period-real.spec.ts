/**
 * E2E REAL — valida que getCurrentTimesheetPeriod() bate com o period que a
 * API Meta espera de fato. Atinge produção (read-only).
 *
 * Como rodar:
 *   META_TS_TOKEN='<bearer da plataforma>' pnpm exec playwright test \
 *     --config=playwright.real.config.ts timesheet-period-real
 *
 * O token sai da aba plataforma.meta.com.br (DevTools → Network → qualquer
 * request pra api.meta.com.br → header `authorization`). Tem ~5min de TTL.
 */
import { test, expect } from '@playwright/test'
import { getCurrentTimesheetPeriod } from '../../lib/domain/timesheet-period'

interface ReportedHoursResponse {
  data: Array<{ id: string; date: string; period: string; competence: string; hourQuantity: number }>
  total: number
}

interface HoursSummaryResponse {
  pendingHours: number
  approvedHours: number
  totalReportedHours: number
  countReportedHours: number
}

function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
}

test('REAL-TS-PERIOD: helper bate com period real da API Meta', async ({ request }) => {
  const token = process.env.META_TS_TOKEN
  test.skip(!token, 'precisa de META_TS_TOKEN — pega o Bearer atual da plataforma.meta.com.br')

  const claims = decodeJwt(token!)
  const userId = claims.metaUUID as string
  expect(userId, 'JWT deve ter metaUUID').toBeTruthy()

  const period = getCurrentTimesheetPeriod()
  test.info().annotations.push({ type: 'helper-period', description: period })

  const headers = {
    accept: '*/*',
    authorization: `Bearer ${token}`,
    origin: 'https://plataforma.meta.com.br',
  }

  const reportedRes = await request.get(
    `https://api.meta.com.br/timesheets/v1/users/${userId}/reported-hours?period=${period}&sort=-date`,
    { headers },
  )
  expect(reportedRes.status(), `reported-hours HTTP — period=${period}`).toBe(200)
  const reported = (await reportedRes.json()) as ReportedHoursResponse

  test.info().annotations.push({
    type: 'reported-hours',
    description: `period=${period} total=${reported.total} entries=${reported.data.length}`,
  })

  // Prova-chave: cada entry retornada pela API confirma que period bate.
  for (const entry of reported.data) {
    expect(entry.period, `entry ${entry.id} (${entry.date}) deve estar no period ${period}`).toBe(period)
  }

  // Sanidade adicional: hours-summary do mesmo period responde sem erro.
  const summaryRes = await request.get(
    `https://api.meta.com.br/timesheets/v1/hours-summary?period=${period}`,
    { headers },
  )
  expect(summaryRes.status(), `hours-summary HTTP — period=${period}`).toBe(200)
  const summary = (await summaryRes.json()) as HoursSummaryResponse

  test.info().annotations.push({
    type: 'hours-summary',
    description: `pending=${summary.pendingHours}h approved=${summary.approvedHours}h total=${summary.totalReportedHours}h count=${summary.countReportedHours}`,
  })

  // Consistência cruzada: countReportedHours do summary == data.length do reported-hours.
  expect(summary.countReportedHours).toBe(reported.data.length)

  // Prova final: o period calculado realmente devolve dados de hoje. Se hoje é
  // dia >=26, o period antigo (mês de calendário) viria vazio — esta asserção
  // só passa se o helper já aplicou o shift fiscal.
  expect(reported.data.length, 'API deve retornar pelo menos 1 entry — prova que o period está correto').toBeGreaterThan(0)
})
