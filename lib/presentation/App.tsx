import { useCallback, useMemo, useState } from 'react';
import { timeToMinutes, getNowMinutes } from '../domain/time-utils';
import { PUNCH_SLOTS } from '../domain/types';
import type { PunchState } from '../domain/types';
import { useClock } from './hooks/useClock';
import { usePunchState } from './hooks/usePunchState';
import { useAutoDetect } from './hooks/useAutoDetect';
import { usePunchAction } from './hooks/usePunchAction';
import { useCountdown } from './hooks/useCountdown';
import { LiveClock } from './components/LiveClock';
import { TokenStatus } from './components/TokenStatus';
import { ResyncButton } from './components/ResyncButton';
import { PunchCard } from './components/PunchCard';
import { ProgressBar } from './components/ProgressBar';
import { StatusBanner } from './components/StatusBanner';
import { NextAction } from './components/NextAction';
import { PunchButton } from './components/PunchButton';
import { SettingsButton } from './components/SettingsButton';
import { ENABLE_SENIOR_PUNCH_BUTTON, ENABLE_MANUAL_PUNCH, ENABLE_SENIOR_INTEGRATION, ENABLE_YESTERDAY, APP_NAME } from '../domain/build-flags';
import { useYesterdayPunches } from './hooks/useYesterdayPunches';
import { useManualPunch } from './hooks/useManualPunch';
import { Toast } from './components/Toast';
import { PunchHistory } from './components/PunchHistory';
import { HourBankBanner } from './components/HourBankBanner';
import { PaytrackBanner } from './components/PaytrackBanner';
import { MetaXBanner, MetaXDoneHint } from './components/MetaXBanner';
import { useHourBank } from './hooks/useHourBank';
import { useAuthStatus } from './hooks/useAuthStatus';
import { ManualHourBankProvider } from '../infrastructure/manual/manual-hour-bank-provider';
import { COMPANY_LOGIN_URL, COMPANY_NAME } from '#company/providers';

const LABELS: Record<string, string> = { entrada: 'Entrada', almoco: 'Almoço', volta: 'Volta', saida: 'Saída' };
const ICONS: Record<string, string> = { entrada: '🌅', almoco: '🍽️', volta: '🔄', saida: '🏠' };

export function App() {
  const { time, date } = useClock();
  const { punchState, settings, loading, refresh, stateRepo } = usePunchState();
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => setToast(msg), []);
  const { detecting } = useAutoDetect(stateRepo, refresh, showToast);
  const { punching, doPunch } = usePunchAction(showToast, refresh);
  const { punching: manualPunching, doPunch: doManualPunch } = useManualPunch(showToast, refresh);
  const yesterdayTimes = useYesterdayPunches();
  const hourBankProvider = useMemo(() => ENABLE_MANUAL_PUNCH ? new ManualHourBankProvider() : null, []);
  const { balance } = useHourBank(hourBankProvider, settings);
  const hasAuth = useAuthStatus();

  const nowMin = getNowMinutes();
  const nextSlot = loading ? null : getNextSlot(punchState, nowMin);
  const nextTime = nextSlot ? getDisplayTime(punchState, nextSlot as keyof PunchState) : null;
  const countdown = useCountdown(nextTime);
  const workedMin = loading ? 0 : calcWorkedMinutes(punchState, nowMin);
  const status = loading ? '' : getStatusText(punchState, detecting);
  const entMin = timeToMinutes(punchState.entrada);
  const shouldShowOvertime = !punchState.saida && entMin != null && nowMin >= entMin;

  if (loading) return <div className="loading-screen">Carregando...</div>;

  return (
    <div className="popup-container">
      <LiveClock time={time} date={date} />
      <div className="token-status-row">
        {ENABLE_SENIOR_INTEGRATION && <TokenStatus hasToken={!detecting} loading={detecting} statusText="" hasAuth={hasAuth} loginUrl={COMPANY_LOGIN_URL} companyLabel={COMPANY_NAME} />}
        {!ENABLE_SENIOR_INTEGRATION && detecting && <div className="token-status loading">Detectando batimentos...</div>}
        {settings.metaXReminder && <MetaXDoneHint />}
      </div>
      {settings.metaXReminder && <MetaXBanner />}
      <div className="cards-grid">
        {PUNCH_SLOTS.map(slot => {
          const display = getDisplayTime(punchState, slot);
          const isCalc = !punchState[slot] && !!display;
          const min = timeToMinutes(display);
          return (
            <PunchCard key={slot} label={LABELS[slot]} icon={ICONS[slot]}
              time={display} subtitle={isCalc ? 'estimado' : ''} isCalc={isCalc}
              isPast={min != null && min <= nowMin} isNext={slot === nextSlot} />
          );
        })}
      </div>
      <ProgressBar workedMinutes={workedMin} totalMinutes={settings.jornada} showOvertime={shouldShowOvertime} />
      {ENABLE_YESTERDAY && yesterdayTimes.length > 0 && (
        <div className="yesterday-banner">
          <span className="yesterday-label">Ontem</span>
          <span className="yesterday-times">{yesterdayTimes.join(' → ')}</span>
        </div>
      )}
      {!ENABLE_SENIOR_INTEGRATION && <StatusBanner text={status} type={punchState.saida ? 'success' : 'info'} />}
      <NextAction label={nextSlot ? LABELS[nextSlot] : ''} countdown={countdown} visible={!!nextSlot && !!countdown} />
      {ENABLE_SENIOR_PUNCH_BUTTON && <PunchButton onClick={doPunch} loading={punching} disabled={!!punchState.saida} />}
      {ENABLE_MANUAL_PUNCH && <PunchButton onClick={doManualPunch} loading={manualPunching} disabled={!!punchState.saida} />}
      {settings.paytrackReminder && <PaytrackBanner />}
      <HourBankBanner balance={balance} estimatedExit={getDisplayTime(punchState, 'saida')} />
      {ENABLE_MANUAL_PUNCH && <PunchHistory showSeedButton />}
      <SettingsButton />
      <PopupVersion />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function PopupVersion() {
  const runtime = chrome?.runtime as unknown as { getManifest?: () => { version?: string } } | undefined;
  const version = runtime?.getManifest?.()?.version;
  if (!version) return null;
  return <div className="popup-version">v{version}</div>;
}

function getDisplayTime(ps: PunchState, slot: keyof PunchState): string | null {
  const calcMap: Record<string, keyof PunchState> = { almoco: '_almocoSugerido', volta: '_voltaSugerida', saida: '_saidaEstimada' };
  return ps[slot] ?? ps[calcMap[slot]] ?? null;
}

function getNextSlot(ps: PunchState, nowMin: number): string | null {
  for (const slot of PUNCH_SLOTS) {
    const t = getDisplayTime(ps, slot);
    const min = timeToMinutes(t);
    if (min != null && min > nowMin) return slot;
  }
  return null;
}

function calcWorkedMinutes(ps: PunchState, nowMin: number): number {
  const entMin = timeToMinutes(ps.entrada);
  if (entMin == null) return 0;
  
  const now = new Date();
  const entradaDate = ps._entradaTimestamp ? new Date(ps._entradaTimestamp) : null;
  
  if (entradaDate && now.getDate() !== entradaDate.getDate() && !ps.saida) {
    return 0;
  }
  
  const almocoMin = timeToMinutes(ps.almoco);
  const voltaMin = timeToMinutes(ps.volta);
  const saidaMin = timeToMinutes(ps.saida);
  const endMin = saidaMin ?? nowMin;
  let worked = endMin - entMin;
  if (almocoMin && voltaMin) worked -= (voltaMin - almocoMin);
  else if (almocoMin && !voltaMin) worked -= (endMin - almocoMin);
  return Math.max(0, worked);
}

function getStatusText(ps: PunchState, detecting: boolean): string {
  if (detecting) return '';
  if (ps.saida) return 'Jornada concluída!';
  if (ps.volta) return 'Aguardando saída';
  if (ps.almoco) return 'Em almoço';
  if (ps.entrada) return 'Aguardando almoço';
  return 'Aguardando entrada';
}
