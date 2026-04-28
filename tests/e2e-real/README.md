# E2E Reais (extensão real + APIs de produção)

Dois testes que carregam a **extensão de produção** (`.output/chrome-mv3`)
num Chromium headed e exercitam o fluxo end-to-end contra as APIs reais
de Senior e Meta. Servem como prova de que o plugin inteiro — service
worker, captura de token, cache de tabs, fetch via tab — funciona.

## Garantias

- **Apenas GET.** Nenhum POST/PATCH/DELETE é executado em qualquer fluxo
  testado. As asserções leem `chrome.storage.local` populado pela
  extensão a partir de respostas read-only das APIs.
- **Opt-in.** O `playwright.config.ts` padrão não enxerga este diretório.
  Só roda via `pnpm test:e2e:real`.
- **Sem credenciais no repo.** Perfil persistente em
  `tests/.real-profile/` (gitignored). Login feito uma vez fica salvo.

## Como rodar

```bash
pnpm build:meta       # 1ª vez ou após mudanças no código da extensão
pnpm test:e2e:real
```

Na **primeira execução**:
1. Chromium abre visível com a extensão carregada.
2. Cada spec abre uma aba na plataforma correspondente (Senior ou Meta).
3. **Faça login** manualmente quando aparecer a tela.
4. Os testes detectam a sessão pronta e seguem com as asserções.

A partir da **segunda execução**: cookies persistem, login é silencioso.

## O que cada teste valida

| Spec | Fluxo |
|---|---|
| `senior-real.spec.ts` | `backgroundDetect` da extensão chama o GP backend (GET acertoPontoColaboradorPeriodo). Espera `pontoState` populado em `chrome.storage.local` com pelo menos uma marcação no formato `HH:MM`. |
| `meta-timesheet-real.spec.ts` | Sidepanel abre a aba Timesheet → `useTimesheetData` → `metaTimesheetProvider.getSummary` → `fetchViaMetaTab` faz 3 GETs (hours-summary, cost-centers, reported-hours) numa aba em `/modules/timesheet/create`. Espera `timesheetSummaryCache` populado com `{ period, pendingHours, entries[] }`. |

## Quando rodar

- Antes de releases — garante que o fluxo real (com a extensão) ainda
  funciona contra os ambientes de produção.
- Quando um endpoint mudou ou está suspeito de ter mudado.
- Para reproduzir bugs de integração que mocks não pegam.

## Resetando a sessão

```bash
rm -rf tests/.real-profile
```
