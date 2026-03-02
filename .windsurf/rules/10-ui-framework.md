---
trigger: glob
globs: ["**/*.tsx", "**/*.jsx", "**/entrypoints/popup/**", "**/entrypoints/sidepanel/**"]
---

# UI Framework — Senior Ponto

## Stack
- **React 19** com function components exclusivamente
- **WXT** (`@wxt-dev/module-react`) como framework de extensão — provê HMR e build automático
- **CSS vanilla** — sem Tailwind, sem CSS-in-JS, sem CSS Modules
- **Sem biblioteca de componentes** — todos os componentes são custom, feitos à mão

## Entry Points de UI
- **Popup** (`entrypoints/popup/`) — interface principal, renderiza `App.tsx`
- **SidePanel** (`entrypoints/sidepanel/`) — painel lateral com histórico, renderiza `SidePanelApp.tsx`
- **Widget** (`entrypoints/widget.content.ts`) — widget flutuante injetado via DOM puro (sem React)

## Padrão de Componentes
- Componentes em `lib/presentation/components/` — um por arquivo, PascalCase
- Props definidas como interface no topo do mesmo arquivo (sem arquivo separado de tipos)
- Componentes são funções exportadas nomeadas: `export function PunchCard({ ... }: PunchCardProps)`
- Sem `React.FC<>` — tipagem direta nos parâmetros
- Sem `forwardRef`, `memo`, ou HOCs — componentes simples e diretos

## Componentes Existentes
| Componente | Propósito |
|---|---|
| `LiveClock` | Relógio em tempo real (HH:mm:ss) |
| `TokenStatus` | Indicador de status de autenticação Senior |
| `PunchCard` | Card individual de batimento (entrada/almoço/volta/saída) |
| `ProgressBar` | Barra de progresso da jornada |
| `StatusBanner` | Banner de status textual (trabalhando, almoço, concluída) |
| `NextAction` | Countdown para próximo evento |
| `PunchButton` | Botão para bater ponto via API |
| `SettingsPanel` | Painel colapsável de configurações |
| `Toast` | Notificação temporária |
| `PunchHistory` | Lista de histórico de batimentos manuais |
| `HourBankBanner` | Banner de saldo do banco de horas com link para side panel |
| `DayRow` | Linha de dia no histórico do side panel (editável) |

## Regras
- **NUNCA adicionar bibliotecas de UI** (shadcn, MUI, Chakra, etc.) — o projeto usa CSS vanilla propositalmente por ser extensão de navegador com restrição de tamanho
- O widget (`widget.content.ts`) usa DOM puro com innerHTML + style inline — NÃO é React
- Estilos do popup/sidepanel ficam nos respectivos CSS em `entrypoints/popup/style.css` e `entrypoints/sidepanel/style.css`
- Conditional rendering via build flags: `{ENABLE_SENIOR_PUNCH_BUTTON && <PunchButton />}`
