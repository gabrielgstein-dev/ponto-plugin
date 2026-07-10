import { useState } from 'react';
import { useTimesheetData } from '../hooks/useTimesheetData';
import { TimesheetRowSingle } from './TimesheetRowSingle';
import { TimesheetRowMultiple } from './TimesheetRowMultiple';

export function TimesheetPanel() {
  const { summary, loading, available, connecting, periodLabel, isCurrentPeriod, goToPrev, goToNext, goToCurrent, updateEntry, updateEntryWithAllocations, fetchGpHours } = useTimesheetData();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (connecting || (!available && !loading)) {
    return (
      <div className="ts-container">
        <h2 className="ts-title">Timesheet</h2>
        <div className="ts-empty">
          {connecting ? (
            <p>Conectando ao Timesheet...</p>
          ) : (
            <ReconnectCard />
          )}
        </div>
      </div>
    );
  }

  const entries = (summary?.entries ?? []).filter(e => e.status === 'PENDING');

  return (
    <div className="ts-container">
      <h2 className="ts-title">Timesheet — Pendentes</h2>

      {summary && (
        <div className="ts-summary">
          <div className="ts-summary-row">
            <span className="ts-summary-label">Pendentes</span>
            <span className="ts-summary-value pending">{formatHours(summary.pendingHours)}</span>
          </div>
          <div className="ts-summary-row">
            <span className="ts-summary-label">Aprovadas</span>
            <span className="ts-summary-value approved">{formatHours(summary.approvedHours)}</span>
          </div>
          <div className="ts-summary-row">
            <span className="ts-summary-label">Reprovadas</span>
            <span className="ts-summary-value reproved">{formatHours(summary.reprovedHours)}</span>
          </div>
          <div className="ts-summary-divider" />
          <div className="ts-summary-row">
            <span className="ts-summary-label">Horas Pendentes</span>
            <span className="ts-summary-value total">{formatHours(summary.pendingHours)}</span>
          </div>
        </div>
      )}

      <div className="sp-period-nav">
        <button className="sp-nav-btn" onClick={goToPrev} disabled={loading}>‹</button>
        <span className="sp-nav-label" onClick={!isCurrentPeriod ? goToCurrent : undefined} style={!isCurrentPeriod ? { cursor: 'pointer', textDecoration: 'underline' } : undefined}>
          {periodLabel}
          {!isCurrentPeriod && ' (voltar ao atual)'}
        </span>
        <button className="sp-nav-btn" onClick={goToNext} disabled={loading || isCurrentPeriod}>›</button>
      </div>

      {loading && entries.length === 0 && (
        <div className="ts-empty">Carregando...</div>
      )}

      {!loading && entries.length === 0 && (
        <div className="ts-empty">Nenhum lançamento pendente neste período</div>
      )}

      {entries.length > 0 && (
        <div className="ts-table">
          <div className="ts-table-header">
            <span>Dia</span>
            <span>Ce. Custo</span>
            <span>Qtd. Horas</span>
            <span>Status</span>
            <span></span>
          </div>
          {entries.map(entry => {
            const hasMultipleCostCenters = entry.costCenters && entry.costCenters.length > 1;
            
            if (hasMultipleCostCenters) {
              return (
                <TimesheetRowMultiple
                  key={entry.id}
                  entry={entry}
                  expanded={expandedId === entry.id}
                  onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                  onSave={updateEntryWithAllocations}
                  onFetchGpHours={fetchGpHours}
                />
              );
            }
            
            return (
              <TimesheetRowSingle
                key={entry.id}
                entry={entry}
                expanded={expandedId === entry.id}
                onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                onSave={updateEntry}
                onFetchGpHours={fetchGpHours}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// URL de login da plataforma Meta com callback direto pra rota do timesheet.
// Abrir numa aba REAL (visível) é o único caminho de reconexão confiável hoje:
// o SPA dispara as chamadas a api.meta.com.br, o webRequest captura o Bearer e
// o listener de storage do background re-sincroniza sozinho. O antigo botão
// "Reconectar" disparava REQUEST_TS_SYNC → auto-connect em aba escondida, que
// depende do /api/auth/session (quebrado: retorna {} após mudança de login).
const META_TS_LOGIN_URL =
  'https://plataforma.meta.com.br/login?callbackUrl=/modules/timesheet/create';

function openTimesheetTab(): void {
  try {
    const p = chrome.tabs?.create({ url: META_TS_LOGIN_URL, active: true });
    // Em MV3 é Promise; se falhar (ou API ausente) cai no window.open.
    (p as Promise<unknown> | undefined)?.catch?.(() =>
      window.open(META_TS_LOGIN_URL, '_blank', 'noreferrer'),
    );
  } catch (_) {
    window.open(META_TS_LOGIN_URL, '_blank', 'noreferrer');
  }
}

/**
 * BUG 2: card de reconexão exibido no SidePanel quando o token do Timesheet
 * expirou. Background nunca pede login automaticamente — só aqui, em ação
 * explícita do usuário (que abriu o painel). A ação abre o Timesheet numa aba
 * visível pra que a captura via webRequest reconecte a sessão.
 */
function ReconnectCard() {
  return (
    <div className="ts-reconnect" data-testid="ts-reconnect-card">
      <p className="ts-reconnect-msg">
        Sua sessão do Timesheet expirou. Abra o Timesheet e faça login — a
        sincronização volta sozinha assim que a página carregar.
      </p>
      <div className="ts-reconnect-actions">
        <button
          className="ts-reconnect-btn"
          onClick={openTimesheetTab}
          data-testid="ts-reconnect-btn"
        >
          Abrir Timesheet
        </button>
        <a
          href={META_TS_LOGIN_URL}
          target="_blank"
          rel="noreferrer"
          className="token-login-link"
        >
          ou abrir manualmente
        </a>
      </div>
    </div>
  );
}
