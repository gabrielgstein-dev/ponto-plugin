# Documentação das Windsurf Rules

Este documento descreve todas as regras configuradas no projeto Senior Ponto, explicando **o que cada uma faz** e **quando utilizá-la**.

## Índice

- [Regras Always On](#regras-always-on)
  - [00-project-map](#00-project-map)
  - [01-typescript-conventions](#01-typescript-conventions)
- [Regras por Glob](#regras-por-glob)
  - [10-ui-framework](#10-ui-framework)
  - [12-state-management](#12-state-management)
  - [20-infrastructure-layer](#20-infrastructure-layer)
- [Regras Manuais](#regras-manuais)
  - [90-debug-mode](#90-debug-mode)
  - [91-new-feature](#91-new-feature)
  - [92-code-review](#92-code-review)

---

## Regras Always On

Estas regras são carregadas **automaticamente em todas as interações** com o projeto, fornecendo contexto base essencial.

### 00-project-map 🟢 **Automático**

**Trigger:** `always_on`

**O que faz:**
- Define o propósito do projeto: extensão Chrome/Firefox para cálculo de horários de ponto
- Documenta os fluxos críticos: detecção de batimentos, cálculo de horários, registro de ponto, banco de horas, widget flutuante
- Apresenta a arquitetura Clean Architecture (domain → application → infrastructure → presentation)
- Lista todos os entry points da extensão
- Explica o fluxo de dados entre content scripts, storage e UI
- Documenta as decisões arquiteturais (build flags, fallback chain, dois mundos de content script)
- Cataloga os módulos principais e suas responsabilidades

**Quando usar:**
- Esta regra está sempre ativa e fornece contexto base para qualquer tarefa
- Útil para entender a estrutura geral antes de modificar qualquer parte do código
- Consulte quando precisar saber qual camada da arquitetura usar para uma nova funcionalidade

---

### 01-typescript-conventions 🟢 **Automático**

**Trigger:** `always_on`

**O que faz:**
- Define padrões de tipagem (interfaces com prefixo `I`, types para unions)
- Estabelece nomenclatura: kebab-case para arquivos, PascalCase para classes, camelCase para funções
- Documenta convenções de import/export (sem default exports exceto entry points WXT)
- Lista anti-patterns proibidos: `any`, barrel files (`index.ts`), `enum`, comentários de código
- Define tratamento de erros com prefixo `[Senior Ponto]` em logs

**Quando usar:**
- Ao criar novos arquivos TypeScript
- Ao nomear variáveis, funções ou classes
- Ao decidir entre interface vs type
- Para garantir consistência de código em PRs

---

## Regras por Glob

Estas regras são carregadas **automaticamente quando arquivos específicos são abertos**, fornecendo contexto especializado.

### 10-ui-framework 🟡 **Automático em arquivos UI**

**Trigger:** `glob: **/*.tsx, **/*.jsx, **/entrypoints/popup/**, **/entrypoints/sidepanel/**`

**O que faz:**
- Documenta o stack de UI: React 19 + CSS vanilla + WXT
- Lista os entry points de UI (Popup, SidePanel, Widget)
- Define padrão de componentes (PascalCase, um por arquivo, sem React.FC)
- Cataloga todos os componentes existentes e seus propósitos
- Proíbe bibliotecas de UI (shadcn, MUI, Chakra, etc.)

**Quando usar:**
- Ao criar ou modificar componentes React
- Ao trabalhar no popup ou sidepanel
- Ao decidir se um componente já existe ou precisa ser criado
- Para garantir que não sejam adicionadas dependências de UI desnecessárias

---

### 12-state-management 🟡 **Automático em arquivos TS/TSX**

**Trigger:** `glob: **/*.tsx, **/*.ts, !**/entrypoints/interceptor.content.ts, !**/entrypoints/widget.content.ts`

**O que faz:**
- Explica a arquitetura de estado: módulo singleton mutável sem bibliotecas externas
- Documenta o estado global (`application/state.ts`) e seus campos
- Descreve o fluxo de persistência via `chrome.storage.local`
- Lista todos os hooks existentes e suas responsabilidades
- Explica a comunicação entre contextos (content scripts, popup, background)

**Quando usar:**
- Ao criar ou modificar hooks
- Ao implementar fluxos de dados entre componentes
- Ao adicionar estado global ou settings
- Ao entender como os dados fluem entre content scripts e UI

---

### 20-infrastructure-layer 🟡 **Automático em infraestrutura**

**Trigger:** `glob: **/infrastructure/**/*.ts, **/entrypoints/background.ts, **/entrypoints/interceptor.content.ts, **/entrypoints/senior-platform.content.ts`

**O que faz:**
- Documenta as APIs externas (Senior Platform e GestaoPonto)
- Lista endpoints, headers necessários, e padrões de autenticação
- Descreve a cadeia de providers de detecção (GpPunchProvider, SeniorStoragePunchProvider, etc.)
- Descreve a cadeia de auth providers (SeniorCookieAuth, SeniorPageAuth, SeniorInterceptorAuth)
- Documenta as chaves de storage usadas
- Explica o padrão de comunicação entre content scripts via CustomEvents

**Quando usar:**
- Ao implementar novos providers de detecção ou autenticação
- Ao trabalhar com APIs externas
- Ao modificar content scripts ou background
- Ao entender como tokens são capturados e propagados
- Ao adicionar novas integrações com serviços externos

---

## Regras Manuais

Estas regras **devem ser explicitamente solicitadas** pelo usuário para serem carregadas, ativando modos especializados de trabalho.

### 90-debug-mode 🔵 **Manual — Chame explicitamente**

**Trigger:** `manual`

**O que faz:**
- Define regras rigorosas para debugging
- Proíbe compressão ou resumo de código durante análise
- Estabelece ordem de investigação: Props → estado local → estado global → efeitos colaterais → rede
- Proíbe refatoração durante debug (foco exclusivo no bug)
- Define uso de early returns para isolamento de problemas

**Quando usar:**
- Ativar explicitamente ao investigar bugs: *"ative o modo debug"*
- Use quando precisar de análise profunda de código sem abstrações
- Útil para problemas complexos que requerem investigação sistemática

**Como ativar:**
```
"Ative o modo debug para investigar este problema"
```

---

### 91-new-feature 🔵 **Manual — Chame explicitamente**

**Trigger:** `manual`

**O que faz:**
- Define checklist obrigatório para implementação de features
- Exige verificação de funcionalidades similares existentes
- Requer identificação de todos os arquivos a serem criados/modificados
- Exige confirmação de padrão de pasta com base em features existentes
- Proíbe adicionar dependências sem justificativa
- **Bloqueia execução sem aprovação de plano**

**Quando usar:**
- Ativar antes de implementar qualquer funcionalidade nova: *"ative o modo nova feature"*
- Útil para garantir que não se duplique código existente
- Força planejamento antes de execução

**Como ativar:**
```
"Quero adicionar uma nova feature. Ative o modo nova feature."
```

**Fluxo esperado:**
1. Usuário solicita ativação
2. Agente apresenta checklist e pede descrição da feature
3. Agente verifica código existente e propõe plano
4. Usuário aprova plano
5. Implementação começa

---

### 92-code-review 🔵 **Manual — Chame explicitamente**

**Trigger:** `manual`

**O que faz:**
- Define checklist de code review com 8 pontos de verificação
- Verifica convenções TypeScript, uso do design system, separação de responsabilidades
- Identifica lógica de negócio em lugar errado
- Verifica tratamento de erros e edge cases
- Procura código duplicado
- Valida aspectos de segurança
- **Proíbe sugerir mudanças de estilo ou formatação** (responsabilidade do linter)

**Quando usar:**
- Ativar ao revisar código: *"ative o modo code review"*
- Útil para análise de PRs próprios ou de terceiros
- Garante qualidade e consistência do código

**Como ativar:**
```
"Revise este código" ou "Ative o modo code review"
```

---

## Resumo de Uso

| Regra | Tipo | Ativação |
|-------|------|----------|
| 00-project-map | Always On | Automática |
| 01-typescript-conventions | Always On | Automática |
| 10-ui-framework | Glob | Ao abrir .tsx/.jsx |
| 12-state-management | Glob | Ao abrir .tsx/.ts (exceto entrypoints) |
| 20-infrastructure-layer | Glob | Ao abrir infra ou entrypoints específicos |
| 90-debug-mode | Manual | Solicitar explicitamente |
| 91-new-feature | Manual | Solicitar explicitamente |
| 92-code-review | Manual | Solicitar explicitamente |

---

## Dicas de Produtividade

1. **Sempre carregado:** As regras `always_on` garantem que eu tenha contexto básico do projeto em qualquer interação

2. **Contexto automático:** Ao abrir arquivos específicos, as regras de glob fornecem contexto especializado sem necessidade de pedir

3. **Modos especializados:** Para tarefas complexas (debug, nova feature, code review), explicitamente solicite a ativação da regra manual correspondente

4. **Evite overloading:** Não peça para ativar múltiplas regras manuais simultaneamente — elas são projetadas para foco específico
