# Roadmap: Contador de Hora Extra

## Contexto
Atualmente, a barra de progresso de jornada para em 100% quando o usuário completa sua jornada. Se o colaborador continuar trabalhando sem bater o ponto de saída, não há indicação visual de quantas horas extras estão sendo acumuladas.

## Objetivo
Implementar visualização de hora extra em tempo real após completar a jornada, com reset automático à meia-noite para evitar contagem infinita quando o usuário esquece de bater o ponto.

## Solução Proposta

### Opção Escolhida: Barra Fixa + Contador Separado
- Barra de progresso para em 100% quando jornada completa
- Nova seção visual aparece mostrando tempo de hora extra acumulado
- Contador para automaticamente à meia-noite (00:00:00)

### Estados Visuais

#### Estado 1: Jornada em Andamento (0-100%)
```
JORNADA                    3h01 / 8h
[████████░░░░░░░░░░░░░░]   38%
```
- Barra azul progressiva
- Label mostra tempo trabalhado vs jornada total
- Percentual de 0% a 100%

#### Estado 2: Hora Extra Ativa (>100%, antes da meia-noite)
```
JORNADA                    8h00 / 8h
[████████████████████████] 100%

⏱️ HORA EXTRA              +0h45
```
- Barra permanece em 100% (azul)
- Nova linha aparece abaixo com ícone de relógio
- Mostra tempo extra em formato `+Xh YYm`
- Cor diferenciada (laranja/amarelo) para destacar

#### Estado 3: Após Meia-Noite (reset)
```
JORNADA                    --
[░░░░░░░░░░░░░░░░░░░░░░░░]  0%

⚠️ Ponto de saída pendente
```
- Barra reseta para 0%
- Mensagem de alerta sobre ponto pendente
- Para de contar hora extra

## Implementação Técnica

### 1. Modificar `ProgressBar.tsx`

**Arquivo:** `lib/presentation/components/ProgressBar.tsx`

**Mudanças:**
```typescript
interface ProgressBarProps {
  workedMinutes: number;
  totalMinutes: number;
  showOvertime?: boolean;  // NOVO: indica se deve mostrar hora extra
}

export function ProgressBar({ workedMinutes, totalMinutes, showOvertime = true }: ProgressBarProps) {
  const isOvertime = workedMinutes > totalMinutes;
  const displayMinutes = Math.min(workedMinutes, totalMinutes);
  const pct = Math.min(100, Math.round((displayMinutes / totalMinutes) * 100));
  
  const hours = Math.floor(displayMinutes / 60);
  const mins = displayMinutes % 60;
  const label = `${hours}h${String(mins).padStart(2, '0')} / ${Math.floor(totalMinutes / 60)}h`;

  const overtimeMinutes = isOvertime && showOvertime ? workedMinutes - totalMinutes : 0;
  const overtimeHours = Math.floor(overtimeMinutes / 60);
  const overtimeMins = overtimeMinutes % 60;

  return (
    <div className="progress-section">
      <div className="progress-label">
        <span>Jornada</span>
        <span>{label}</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-pct">{pct}%</div>
      
      {overtimeMinutes > 0 && (
        <div className="overtime-section">
          <span className="overtime-icon">⏱️</span>
          <span className="overtime-label">Hora Extra</span>
          <span className="overtime-value">+{overtimeHours}h{String(overtimeMins).padStart(2, '0')}</span>
        </div>
      )}
    </div>
  );
}
```

### 2. Adicionar Lógica de Reset à Meia-Noite

**Arquivo:** `lib/presentation/App.tsx`

**Função:** `calcWorkedMinutes`

**Mudanças:**
```typescript
function calcWorkedMinutes(ps: PunchState, nowMin: number): number {
  const entMin = timeToMinutes(ps.entrada);
  if (entMin == null) return 0;
  
  // NOVO: Detecta se virou o dia (meia-noite passou)
  // Se nowMin < entMin, significa que é um novo dia
  if (nowMin < entMin && !ps.saida) {
    // Usuário esqueceu de bater ponto - para de contar
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
```

**Passar flag para ProgressBar:**
```typescript
// Em App.tsx, linha ~72
const shouldShowOvertime = !ps.saida && nowMin >= entMin; // NOVO

<ProgressBar 
  workedMinutes={workedMin} 
  totalMinutes={settings.jornada}
  showOvertime={shouldShowOvertime}  // NOVO
/>
```

### 3. Adicionar Estilos CSS

**Arquivo:** `entrypoints/popup/style.css`

**Adicionar:**
```css
.overtime-section {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--overtime-bg, rgba(255, 165, 0, 0.1));
  border-radius: 6px;
  border-left: 3px solid var(--overtime-accent, #ff9500);
}

.overtime-icon {
  font-size: 16px;
}

.overtime-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--overtime-text, #ff9500);
  flex: 1;
}

.overtime-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--overtime-value, #ff9500);
  font-variant-numeric: tabular-nums;
}
```

### 4. Adicionar Variáveis de Tema

**Arquivo:** `lib/presentation/theme.css`

**Adicionar em cada tema:**
```css
/* Light theme */
[data-theme="light"] {
  --overtime-bg: rgba(255, 165, 0, 0.1);
  --overtime-accent: #ff9500;
  --overtime-text: #cc7700;
  --overtime-value: #ff9500;
}

/* Dark theme */
[data-theme="dark"] {
  --overtime-bg: rgba(255, 165, 0, 0.15);
  --overtime-accent: #ffaa33;
  --overtime-text: #ffaa33;
  --overtime-value: #ffcc66;
}
```

## Critérios de Aceite

### ✅ Funcionalidades Obrigatórias

1. **Exibição de Hora Extra**
   - [ ] Quando `workedMinutes > totalMinutes` E `saida === null`, mostrar seção de hora extra
   - [ ] Formato do contador: `+Xh YYm` (ex: `+1h23`, `+0h45`)
   - [ ] Atualização em tempo real (a cada minuto)

2. **Reset à Meia-Noite**
   - [ ] Se `nowMin < entradaMin` E `saida === null`, parar contagem
   - [ ] Zerar `workedMinutes` quando detectar virada de dia
   - [ ] Não aplicar reset se já bateu ponto de saída

3. **Estados Visuais**
   - [ ] Barra de progresso para em 100% quando jornada completa
   - [ ] Seção de hora extra só aparece após 100%
   - [ ] Cor diferenciada para hora extra (laranja/amarelo)

4. **Compatibilidade**
   - [ ] Funcionar em todos os temas (light/dark/custom)
   - [ ] Responsivo no popup
   - [ ] Não quebrar layout existente

### 🎯 Casos de Teste

#### Caso 1: Jornada Normal
```
Entrada: 09:00
Almoço: 12:00
Volta: 13:00
Hora atual: 15:30
Jornada: 8h (480min)

Esperado:
- workedMinutes = 270 (4h30)
- Barra em 56%
- SEM seção de hora extra
```

#### Caso 2: Hora Extra Ativa
```
Entrada: 09:00
Almoço: 12:00
Volta: 13:00
Saída estimada: 18:00
Hora atual: 19:15
Jornada: 8h (480min)

Esperado:
- workedMinutes = 555 (9h15)
- Barra em 100%
- Seção de hora extra: "+1h15"
```

#### Caso 3: Virada de Dia (Reset)
```
Entrada: 09:00 (dia anterior)
Almoço: 12:00
Volta: 13:00
Hora atual: 01:30 (novo dia)
Saída: null

Esperado:
- workedMinutes = 0
- Barra em 0%
- SEM seção de hora extra
- Mensagem de alerta (opcional)
```

#### Caso 4: Saída Batida (Não Mostra Extra)
```
Entrada: 09:00
Almoço: 12:00
Volta: 13:00
Saída: 19:00
Hora atual: 19:30
Jornada: 8h

Esperado:
- workedMinutes = 540 (9h)
- Barra em 100%
- SEM seção de hora extra (ponto já batido)
```

## Pontos de Atenção

### ⚠️ Detecção de Virada de Dia

**Problema:** `nowMin < entMin` pode dar falso positivo se:
- Usuário trabalha em turno noturno (ex: 22:00 às 06:00)
- Entrada após meia-noite (ex: 01:00)

**Solução:**
- Adicionar verificação de data além de minutos
- Usar `Date` completo em vez de apenas minutos do dia
- Comparar `new Date().getDate()` com data da entrada armazenada

**Implementação Segura:**
```typescript
// Armazenar timestamp da entrada no state
interface PunchState {
  entrada: string | null;
  _entradaTimestamp?: number; // NOVO: timestamp completo
  // ...
}

// Na detecção de reset
function calcWorkedMinutes(ps: PunchState, nowMin: number): number {
  const entMin = timeToMinutes(ps.entrada);
  if (entMin == null) return 0;
  
  // Verificação robusta de virada de dia
  const now = new Date();
  const entradaDate = ps._entradaTimestamp ? new Date(ps._entradaTimestamp) : null;
  
  if (entradaDate && now.getDate() !== entradaDate.getDate() && !ps.saida) {
    // Virou o dia e não bateu saída
    return 0;
  }
  
  // ... resto do cálculo
}
```

### ⚠️ Performance

- Componente `ProgressBar` renderiza a cada segundo (via `useClock`)
- Cálculo de hora extra é leve, mas evitar operações pesadas
- Usar `useMemo` se necessário para otimizar

### ⚠️ Sincronização com Widget

- Widget flutuante (`widget.content.ts`) também mostra horários
- Garantir que lógica de hora extra seja consistente
- Considerar adicionar contador de hora extra no widget também

### ⚠️ Notificações

- Não enviar notificação de "hora de bater ponto" durante hora extra
- Considerar notificação opcional: "Você está em hora extra há X minutos"

## Critérios que NUNCA Podem Acontecer

### 🚫 Proibições Absolutas

1. **Contagem Infinita**
   - ❌ NUNCA permitir que hora extra conte indefinidamente
   - ❌ NUNCA ignorar virada de dia
   - ✅ SEMPRE resetar após meia-noite se não bateu saída

2. **Cálculo Incorreto**
   - ❌ NUNCA mostrar hora extra se já bateu ponto de saída
   - ❌ NUNCA contar tempo de almoço como hora extra
   - ✅ SEMPRE descontar intervalos do cálculo

3. **Estado Inconsistente**
   - ❌ NUNCA mostrar hora extra E "Jornada concluída" ao mesmo tempo
   - ❌ NUNCA permitir barra >100% (visual quebrado)
   - ✅ SEMPRE manter barra em 100% quando mostrar hora extra

4. **Falsos Positivos**
   - ❌ NUNCA resetar se usuário trabalha turno noturno legítimo
   - ❌ NUNCA resetar se já bateu saída (mesmo após meia-noite)
   - ✅ SEMPRE verificar timestamp completo, não só minutos

5. **UX Confusa**
   - ❌ NUNCA usar mesma cor para jornada e hora extra
   - ❌ NUNCA ocultar informação de jornada completa
   - ✅ SEMPRE deixar claro que são estados diferentes

6. **Quebra de Layout**
   - ❌ NUNCA permitir que seção de hora extra quebre responsividade
   - ❌ NUNCA sobrepor outros elementos
   - ✅ SEMPRE testar em todos os tamanhos de popup

## Ordem de Implementação

1. **Fase 1: Lógica de Cálculo**
   - Modificar `calcWorkedMinutes` com detecção de virada de dia
   - Adicionar `_entradaTimestamp` ao state
   - Testes unitários para casos de borda

2. **Fase 2: Componente Visual**
   - Atualizar `ProgressBar.tsx` com seção de hora extra
   - Adicionar estilos CSS
   - Variáveis de tema

3. **Fase 3: Integração**
   - Passar props corretos em `App.tsx`
   - Garantir atualização em tempo real
   - Testes manuais

4. **Fase 4: Polimento**
   - Ajustes de UX/UI
   - Documentação
   - Testes E2E

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Falso positivo em turno noturno | Alto | Usar timestamp completo, não só minutos |
| Performance degradada | Médio | Otimizar cálculos, usar memoization |
| Layout quebrado em temas custom | Baixo | Testar todos os temas, usar variáveis CSS |
| Confusão do usuário | Médio | UX clara, cores distintas, labels descritivos |

## Métricas de Sucesso

- [ ] 0 bugs reportados de contagem infinita
- [ ] 0 falsos positivos de reset
- [ ] Feedback positivo de usuários sobre visualização de hora extra
- [ ] Sem degradação de performance (< 5ms por render)

## Documentação Relacionada

- `REGRAS_DE_NEGOCIO.md` - Regras de cálculo de jornada
- `lib/domain/time-utils.ts` - Utilitários de tempo
- `lib/application/calc-schedule.ts` - Cálculo de horários
