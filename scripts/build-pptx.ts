/**
 * Gera o PowerPoint da apresentação didática do Ponto Meta.
 *
 * Pré-requisitos:
 *   pnpm add -D pptxgenjs
 *   pnpm tsx scripts/build-pptx.ts
 *
 * Saída: docs/apresentacao/Tutorial-Ponto-Meta.pptx
 *
 * Cada slide tem: título + texto curto à esquerda, screenshot à direita.
 * Se o PNG ainda não foi capturado, mostra um placeholder no lugar.
 */
import path from 'path'
import fs from 'fs'
import PptxGenJS from 'pptxgenjs'

const ROOT = path.resolve(__dirname, '..')
const SHOTS_DIR = path.join(ROOT, 'docs/apresentacao/screenshots')
const OUT_FILE = path.join(ROOT, 'docs/apresentacao/Tutorial-Ponto-Meta.pptx')

type Slide =
  | { kind: 'cover'; title: string; subtitle: string }
  | { kind: 'section'; title: string }
  | { kind: 'step'; title: string; body: string; image?: string }

const slides: Slide[] = [
  { kind: 'cover', title: 'Ponto Meta', subtitle: 'Como usar a extensão — passo a passo' },

  { kind: 'section', title: '1. Instalando' },
  {
    kind: 'step',
    title: 'Abra a página da extensão na Chrome Web Store',
    body: 'Acesse: chromewebstore.google.com/detail/ponto-meta/akghhfaeecgmcbaofoaadafleoliciaf',
    image: '01-store-page.png',
  },
  {
    kind: 'step',
    title: 'Clique em "Usar no Chrome"',
    body: 'O botão azul fica no canto superior direito da página da loja.',
    image: '02-add-button.png',
  },
  {
    kind: 'step',
    title: 'Confirme a instalação',
    body: 'Clique em "Adicionar extensão" no aviso que aparece logo abaixo da barra de endereço.',
    image: '03-confirm-install.png',
  },
  {
    kind: 'step',
    title: 'Fixe o ícone na barra',
    body: 'Clique no quebra-cabeça ao lado da barra de endereço e fixe o Ponto Meta com o alfinete.',
    image: '04-pin-icon.png',
  },

  { kind: 'section', title: '2. Primeiro acesso' },
  {
    kind: 'step',
    title: 'Abra o painel lateral',
    body: 'Clique no ícone do Ponto Meta. O painel abre do lado direito da tela.',
    image: '06-sidepanel-empty.png',
  },
  {
    kind: 'step',
    title: 'Entre no Meta Gestão de Ponto',
    body: 'Em outra aba, abra gestaoponto.meta.com.br e faça login. O plugin se conecta sozinho.',
    image: '07-meta-login.png',
  },
  {
    kind: 'step',
    title: 'Painel populado',
    body: 'Volte no painel lateral. Seus batimentos do dia já aparecem automaticamente.',
    image: '08-sidepanel-populated.png',
  },

  { kind: 'section', title: '3. Lendo o painel' },
  {
    kind: 'step',
    title: 'Saldo do período',
    body: 'O número grande no topo é o saldo do período. Verde = horas a receber. Vermelho = devendo.',
    image: '09-balance-positive.png',
  },
  {
    kind: 'step',
    title: 'Navegando entre períodos',
    body: 'Use as setas ‹ e › para ver períodos anteriores. Clique no nome para voltar ao atual.',
    image: '10-period-nav.png',
  },
  {
    kind: 'step',
    title: 'Tabela de dias',
    body: 'Cada linha é um dia: data, batimentos, horas trabalhadas e saldo. Clique para expandir.',
    image: '11-day-row.png',
  },

  { kind: 'section', title: '4. Ajustando ponto esquecido' },
  {
    kind: 'step',
    title: 'Abra o dia',
    body: 'Clique no dia que você esqueceu de bater. Os batimentos aparecem em pílulas.',
    image: '12-day-open.png',
  },
  {
    kind: 'step',
    title: 'Adicione o ajuste',
    body: 'Clique em "+ Adicionar", preencha o horário e escolha a justificativa.',
    image: '13-add-ajuste.png',
  },
  {
    kind: 'step',
    title: 'Pronto',
    body: 'O ajuste é enviado direto para o Meta. Você não precisa entrar no sistema deles.',
    image: '14-ajuste-success.png',
  },

  { kind: 'section', title: '5. Notificações' },
  {
    kind: 'step',
    title: 'Lembrete de almoço',
    body: '10 minutos antes do horário de almoço, uma notificação aparece no canto da tela.',
    image: '15-notif-almoco.png',
  },
  {
    kind: 'step',
    title: 'Lembrete de volta',
    body: 'Na hora de voltar do almoço, outra notificação avisa você.',
    image: '16-notif-volta.png',
  },
  {
    kind: 'step',
    title: 'Lembrete de saída',
    body: 'Antes do horário de saída, o plugin lembra você de bater o ponto.',
    image: '17-notif-saida.png',
  },

  { kind: 'section', title: '6. Widget flutuante' },
  {
    kind: 'step',
    title: 'Ícone de relógio',
    body: 'Em qualquer página, um pequeno relógio aparece no canto. Clique para ver os horários.',
    image: '18-widget-collapsed.png',
  },
  {
    kind: 'step',
    title: 'Cores dos horários',
    body: 'Verde = já bateu. Ciano = próximo. Amarelo = horário estimado.',
    image: '19-widget-expanded.png',
  },

  { kind: 'section', title: '7. Apontamentos (Timesheet)' },
  {
    kind: 'step',
    title: 'Aba Timesheet',
    body: 'No topo do painel, clique em "Timesheet" para ver os apontamentos pendentes.',
    image: '20-timesheet-tab.png',
  },
  {
    kind: 'step',
    title: 'Pendências',
    body: 'Os dias sem observação aparecem aqui. Clique para preencher pelo plugin.',
    image: '21-timesheet-pending.png',
  },
]

const COLORS = {
  bg: 'FFFFFF',
  primary: '1F3A93',
  text: '222222',
  muted: '888888',
  accent: 'F4B400',
}

function addImageOrPlaceholder(
  slide: PptxGenJS.Slide,
  filename: string | undefined,
  area: { x: number; y: number; w: number; h: number },
) {
  const file = filename ? path.join(SHOTS_DIR, filename) : null
  if (file && fs.existsSync(file)) {
    slide.addImage({ path: file, ...area, sizing: { type: 'contain', w: area.w, h: area.h } })
  } else {
    slide.addShape('rect', { ...area, fill: { color: 'F4F4F4' }, line: { color: 'CCCCCC' } })
    slide.addText(
      filename ? `print pendente:\n${filename}` : 'sem print',
      { ...area, fontSize: 14, color: COLORS.muted, align: 'center', valign: 'middle', italic: true },
    )
  }
}

function build() {
  const pres = new PptxGenJS()
  pres.layout = 'LAYOUT_WIDE' // 13.33 × 7.5 in
  pres.title = 'Tutorial Ponto Meta'

  for (const s of slides) {
    const slide = pres.addSlide()
    slide.background = { color: COLORS.bg }

    if (s.kind === 'cover') {
      slide.addText(s.title, {
        x: 0.5, y: 2.8, w: 12.3, h: 1.2,
        fontSize: 60, bold: true, color: COLORS.primary, align: 'center',
      })
      slide.addText(s.subtitle, {
        x: 0.5, y: 4.2, w: 12.3, h: 0.8,
        fontSize: 24, color: COLORS.text, align: 'center',
      })
      continue
    }

    if (s.kind === 'section') {
      slide.background = { color: COLORS.primary }
      slide.addText(s.title, {
        x: 0.5, y: 3.0, w: 12.3, h: 1.5,
        fontSize: 48, bold: true, color: 'FFFFFF', align: 'center',
      })
      continue
    }

    // step slide
    slide.addText(s.title, {
      x: 0.5, y: 0.4, w: 12.3, h: 0.8,
      fontSize: 32, bold: true, color: COLORS.primary,
    })
    slide.addShape('line', {
      x: 0.5, y: 1.2, w: 1.5, h: 0,
      line: { color: COLORS.accent, width: 4 },
    })
    slide.addText(s.body, {
      x: 0.5, y: 1.6, w: 5.0, h: 5.0,
      fontSize: 20, color: COLORS.text, valign: 'top',
    })
    addImageOrPlaceholder(slide, s.image, { x: 5.8, y: 1.6, w: 7.0, h: 5.4 })
  }

  return pres.writeFile({ fileName: OUT_FILE })
}

build()
  .then((file) => console.log(`PPTX gerado em: ${path.relative(ROOT, String(file))}`))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
