# Roadmaps

## [Popup de Lembrete de Ponto](roadmap-popup-lembrete-ponto.md)

Cobre os 5 fluxos críticos do popup de lembrete de bater ponto:

| Fluxo | Descrição | Status |
|-------|-----------|--------|
| P1 | Popup abre no horário exato do ponto | ✅ Implementado |
| P2 | Re-exibição a cada 5 min enquanto não bater | ✅ Implementado |
| P3 | Verificação do slot correto (não qualquer ponto) | ✅ Implementado |
| P4 | Apenas um popup por vez | ✅ Implementado |
| P5 | Encerramento preciso ao bater o ponto correto | ✅ Implementado |
| P6 | Popup só abre após o ponto de entrada | ✅ Implementado |
| P7 | Popup nunca abre após o ponto de saída | ✅ Implementado |

---

## [Garantia de Sincronização](roadmap-sincronizacao.md)

Cobre os 5 fluxos críticos de sincronização do plugin:

| Fluxo | Descrição | Status |
|-------|-----------|--------|
| F1 | Ponto sendo batido (plugin → API Senior) | ✅ Testado |
| F2 | Sincronização imediata plugin → Senior | ✅ Testado |
| F3 | Senior → Plugin (batimento no Senior atualiza o plugin) | ✅ Testado |
| F4 | Sincronização de token com o Senior | ✅ Testado |
| F5 | Sincronização com Timesheet Meta | ✅ Testado |

**Cobertura:** 91 testes unitários passando (7 arquivos de teste) + suite E2E com Playwright.

**Implementado (2026-03-25):** Sistema completo de popup de lembrete de ponto substituindo `chrome.notifications`. Novos arquivos: `public/punch-reminder.html`, `public/punch-reminder.js`, `lib/application/punch-reminder-manager.ts`. Modificados: `lib/domain/types.ts` (tipos `PunchReminderSlot`/`PunchReminderStorage`), `lib/application/handle-alarm.ts` (handler `punch_popup_*` + cleanup no dailyReset), `lib/application/schedule-notifications.ts` (alarmes `punch_popup_almoco/volta/saida` no horário exato), `entrypoints/background.ts` (`windows.onRemoved`, `punch_recheck`, detecção de `pontoState` no `storage.onChanged`). Cobertura: 21 testes unitários (U1–U14) + 10 testes E2E (P1–P7).

**Bug corrigido (2026-03-25):** `usePunchAction` não propagava `punchSuccessTime` ao storage após batimento via API — o background usava fallback (hora atual) ao invés do horário confirmado pela API Senior. Corrigido em [lib/presentation/hooks/usePunchAction.ts](../../lib/presentation/hooks/usePunchAction.ts).

**Melhoria (2026-03-25):** "Saldo do Período" no Histórico de Ponto passou a consumir o endpoint `/colaborador/{id}/bancos-horas/saldo-mensal` da API do GeståoPonto, removendo o cálculo local que somava `balanceMinutes` dia a dia. O valor `saldoMinutos` retornado pela API é usado diretamente; negativo exibe vermelho, positivo exibe azul. Alterado em [lib/infrastructure/meta/gestaoponto/gp-history-provider.ts](../../lib/infrastructure/meta/gestaoponto/gp-history-provider.ts).

**Melhoria (2026-03-25):** Popup de timesheet (`ts-notification`) passou a respeitar a janela de trabalho — só exibe se `pontoState.entrada` está registrada e `pontoState.saida` ainda não foi batida (mesmos guards P6/P7 do punch-reminder). Alterado em [lib/application/background-detect.ts](../../lib/application/background-detect.ts) (`notifyPendingTimesheet`).

---

## [Melhorias Críticas — Análise 2026-03](roadmap-melhorias-criticas.md)

Roadmaps de refatoração baseados em análise crítica rigorosa do projeto. Score atual: **7.5/10**.

| Roadmap | Prioridade | Complexidade | Impacto | Tempo | Status |
|---------|-----------|--------------|---------|-------|--------|
| [Refatoração de Estado](roadmap-refatoracao-estado.md) | 🔥 CRÍTICO | Alta | Muito Alto | 1-2 semanas | 📋 Planejado |
| [Tratamento de Erros](roadmap-tratamento-erros.md) | 🔥 CRÍTICO | Média | Alto | 3-5 dias | 📋 Planejado |
| [Otimização de Performance](roadmap-otimizacao-performance.md) | ⚠️ ALTO | Média | Alto | 1 semana | 📋 Planejado |

**Problemas Críticos Identificados:**
1. Estado global mutável singleton → race conditions
2. Cache fragmentado sem estratégia unificada
3. Polling a cada 10min → desperdício de recursos
4. Erros silenciosos (`catch (_) {}`) → dificulta debug

**Meta:** Score 9.0/10 após implementação completa.
