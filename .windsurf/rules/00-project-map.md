---
trigger: always_on
---

# Mapa do Projeto — Senior Ponto

## Propósito
Extensão Chrome/Firefox que calcula automaticamente horários de almoço e saída com base nos batimentos de ponto do sistema Senior X / GestaoPonto. Voltada para colaboradores CLT que usam a plataforma Senior para registro de ponto eletrônico.

## Domínio e Fluxos Críticos
1. **Detecção de batimentos** — busca punches via chain de providers (GestaoPonto API → localStorage Senior → API Senior → DOM scraping)
2. **Cálculo de horários** — a partir dos batimentos detectados, calcula almoço sugerido, volta e saída estimada
3. **Registro de ponto** — bate ponto via API Senior (`clockingEventImportByBrowser`) usando tokens capturados
4. **Banco de horas** — calcula saldo do período com base em histórico de batimentos
5. **Widget flutuante** — exibe horários em qualquer página do navegador

## Classificação
**FRONTEND_ONLY** — extensão de navegador, sem servidor próprio. Toda comunicação é com APIs externas (Senior Platform, GestaoPonto).

## Arquitetura — Clean Architecture

```
lib/domain/          → Tipos, interfaces, utilitários de tempo, build flags
lib/application/     → Use cases puros (detect, apply, calc, register, schedule)
lib/infrastructure/  → Implementações concretas (Senior API, GP API, chrome.storage)
lib/presentation/    → React components, hooks
entrypoints/         → Entry points WXT (background, content scripts, popup, sidepanel)
```

## Entry Points
- **`background.ts`** — Service worker: intercepta headers, gerencia alarms (reset diário, notificações), side panel
- **`interceptor.content.ts`** — MAIN world em `senior.com.br` e `gestaoponto.meta.com.br`: intercepta fetch/XHR para capturar tokens e assertions
- **`senior-platform.content.ts`** — ISOLATED world em `senior.com.br`: scraping DOM + captura tokens via CustomEvents
- **`widget.content.ts`** — ISOLATED world em `<all_urls>`: widget flutuante com horários
- **`popup/`** — Popup principal com App.tsx
- **`sidepanel/`** — Side panel com histórico e banco de horas (SidePanelApp.tsx)

## Fluxo de Dados
1. Content scripts interceptam tokens (Bearer, assertion) e disparam CustomEvents
2. `senior-platform.content.ts` captura eventos e salva em `chrome.storage.local`
3. Popup/SidePanel usam hooks → use cases → providers (que leem tokens do storage)
4. Providers tentam em ordem de prioridade; primeiro sucesso prevalece
5. Estado local via módulo singleton (`application/state.ts`) + persistência via `chrome.storage.local`

## Decisões Arquiteturais
- **Build flags** (`build-flags.json`) controlam features: `ENABLE_SENIOR_INTEGRATION`, `ENABLE_MANUAL_PUNCH` (mutuamente exclusivos), `ENABLE_WIDGET`, `ENABLE_NOTIFICATIONS`, `ENABLE_YESTERDAY`
- **Priority-based fallback chain** para detecção e autenticação — resiliência máxima
- **Dois mundos de content script** — MAIN para interceptar APIs nativas, ISOLATED para chrome APIs
- **Sem framework de estado** — estado global via singleton mutável + React hooks para reatividade
- **CSS vanilla** — estilos inline no widget, classes CSS no popup/sidepanel (sem Tailwind/CSS-in-JS)

## Módulos Principais
| Módulo | Responsabilidade |
|---|---|
| `detect-punches.ts` | Orquestra chain de IPunchProvider por prioridade |
| `apply-punches.ts` | Mapeia array de horários para slots (entrada/almoço/volta/saída) com heurísticas |
| `calc-schedule.ts` | Calcula horários estimados a partir do estado atual |
| `calc-hour-bank.ts` | Cálculos de banco de horas, períodos, saldo |
| `register-punch.ts` | Orquestra chain de IAuthProvider + IPunchRegistrar |
| `schedule-notifications.ts` | Agenda chrome.alarms para notificações |
| `manage-period.ts` | Fechamento automático de período do banco de horas |
