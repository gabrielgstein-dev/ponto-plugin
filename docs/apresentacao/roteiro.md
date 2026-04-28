# Roteiro — Apresentação Didática do Ponto Meta

> Tutorial passo a passo para um usuário não-técnico. Cada passo tem texto curto e um print correspondente. Os prints são gerados pelo script [`scripts/capture-tutorial.ts`](../../scripts/capture-tutorial.ts).

---

## Convenções

- **Tom**: direto, sem jargão técnico (sem dizer "extension", "service worker", "API"…).
- **Formato dos prints**: 1280×800, recortados na área relevante, com retângulo amarelo destacando o ponto de clique.
- **Dados sensíveis**: nome, matrícula e CNPJ borrados antes da publicação.

---

## Capítulo 1 — Instalando

### 1.1 Abrir a página da extensão na Chrome Web Store
- Texto: *"Acesse `chromewebstore.google.com/detail/ponto-meta/akghhfaeecgmcbaofoaadafleoliciaf` no Chrome."*
- Print: `01-store-page.png` — card do "Ponto Meta" na loja.

### 1.2 Clicar em "Usar no Chrome"
- Texto: *"O botão azul fica no canto superior direito da página."*
- Print: `02-add-button.png` — close-up do botão.

### 1.3 Confirmar a instalação
- Texto: *"Clique em **Adicionar extensão** no aviso que aparece logo abaixo da barra de endereço."*
- Print: `03-confirm-install.png` — modal de confirmação (captura manual).

### 1.4 Fixar o ícone na barra
- Texto: *"Clique no quebra-cabeça 🧩 ao lado da barra de endereço e fixe o **Ponto Meta** com o alfinete."*
- Print: `04-pin-icon.png` — menu de extensões, alfinete destacado (captura manual).

---

## Capítulo 2 — Primeiro acesso

### 2.1 Abrir o painel lateral
- Texto: *"Clique no ícone do Ponto Meta. O painel lateral abre do lado direito."*
- Print: `06-sidepanel-empty.png` — sidepanel ainda sem dados, mostrando "Aguardando entrada".

### 2.2 Entrar no Meta Gestão de Ponto
- Texto: *"Em outra aba, abra `gestaoponto.meta.com.br` e faça login normalmente. O plugin se conecta sozinho."*
- Print: `07-meta-login.png` — tela de login do Meta (dados borrados).

### 2.3 Painel populado
- Texto: *"Volte no painel lateral. Seus batimentos do dia já aparecem."*
- Print: `08-sidepanel-populated.png` — sidepanel com entrada/almoço/volta preenchidos.

---

## Capítulo 3 — Lendo o painel lateral

### 3.1 Saldo do período
- Texto: *"O número grande no topo é o **saldo do período**: positivo (verde) você tem horas a receber, negativo (vermelho) está devendo."*
- Print: `09-balance-positive.png` — destaque no card de saldo.

### 3.2 Navegação entre períodos
- Texto: *"Use as setas **‹** e **›** para ver períodos anteriores. Clique no nome do período para voltar ao atual."*
- Print: `10-period-nav.png` — destaque nas setas.

### 3.3 Tabela de dias
- Texto: *"Cada linha é um dia: data, batimentos, horas trabalhadas e saldo. Clique numa linha para abrir os detalhes."*
- Print: `11-day-row.png` — linha expandida.

---

## Capítulo 4 — Ajustando um ponto esquecido

### 4.1 Abrir o dia
- Texto: *"Clique no dia que você esqueceu de bater. Os batimentos aparecem em forma de pílulas."*
- Print: `12-day-open.png` — dia expandido.

### 4.2 Adicionar ajuste
- Texto: *"Clique em **+ Adicionar** e preencha o horário. Escolha a justificativa na lista."*
- Print: `13-add-ajuste.png` — modal de ajuste com justificativa.

### 4.3 Confirmar envio
- Texto: *"Confirme. O ajuste é enviado direto para o Meta — você não precisa entrar lá pra registrar."*
- Print: `14-ajuste-success.png` — toast de sucesso.

---

## Capítulo 5 — Notificações automáticas

### 5.1 Lembrete de almoço
- Texto: *"10 minutos antes do horário de almoço, uma notificação aparece no canto da tela."*
- Print: `15-notif-almoco.png` — notificação do sistema.

### 5.2 Lembrete de volta
- Texto: *"Na hora de voltar do almoço, outra notificação te avisa."*
- Print: `16-notif-volta.png` — popup de lembrete.

### 5.3 Lembrete de saída
- Texto: *"Antes do horário de saída, o plugin lembra você de bater o ponto."*
- Print: `17-notif-saida.png` — popup de lembrete de saída.

---

## Capítulo 6 — Widget flutuante

### 6.1 O ícone de relógio
- Texto: *"Em qualquer página da web, um pequeno relógio aparece no canto inferior direito. Clique pra ver seus horários sem abrir o painel."*
- Print: `18-widget-collapsed.png` — widget fechado.

### 6.2 Painel expandido
- Texto: *"Verde = já bateu. Ciano = próximo. Amarelo = horário estimado."*
- Print: `19-widget-expanded.png` — widget aberto com cores.

---

## Capítulo 7 — Aba Timesheet (apontamentos)

### 7.1 Trocar para a aba Timesheet
- Texto: *"No topo do painel, clique em **Timesheet** para ver seus apontamentos pendentes."*
- Print: `20-timesheet-tab.png` — aba Timesheet ativa.

### 7.2 Apontamentos pendentes
- Texto: *"Os dias sem observação aparecem aqui. Clique para preencher direto pelo plugin."*
- Print: `21-timesheet-pending.png` — lista de pendências.

---

## O que precisa de login real

Os passos abaixo dependem de uma sessão logada no Meta. Para capturar:
1. Rode `pnpm build:meta` uma vez.
2. Use um perfil persistente do Chromium (`--user-data-dir`) e logue manualmente.
3. Re-execute o script — ele reaproveita o perfil.

**Capítulos com login**: 2.2, 2.3, 3.x, 4.x, 7.x.

**Capítulos sem login** (storage seedable): 1.x, 2.1, 5.x, 6.x.

---

## Saída final

- Markdown com os prints embutidos: `docs/apresentacao/tutorial.md`
- Slides (Keynote/PowerPoint): exportar manualmente colando texto + imagem.
