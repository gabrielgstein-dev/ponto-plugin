# Sistema de Temas

Este projeto utiliza um sistema de tematização centralizado configurado por build.

## Como Alterar o Tema

### Usando o script (recomendado)

```bash
# Alterar para tema dark
pnpm set-theme dark

# Alterar para tema light
pnpm set-theme light

# Alterar para tema meta
pnpm set-theme meta
```

Após alterar o tema, execute `pnpm build` para aplicar as mudanças.

### Build específico para cada empresa

Para facilitar, existem scripts que configuram automaticamente todas as flags e o tema:

```bash
# Build para modo manual (sem integração)
pnpm build:manual

# Build para Senior (com tema dark)
pnpm build:senior

# Build para Meta (com tema meta e todas as configurações)
pnpm build:meta
```

### Gerando pacotes

```bash
# Gerar pacote Meta completo
pnpm zip:meta

# Gerar pacote Manual
pnpm zip:manual
```

### Editando manualmente

Edite o arquivo `lib/domain/build-flags.json` e altere o valor do campo `THEME`:

```json
{
  "THEME": "dark"
}
```

## Temas Disponíveis

- **dark**: Tema escuro padrão (verde/ciano)
- **light**: Tema claro (verde/azul)
- **meta**: Tema inspirado no Meta/Facebook (azul)

## Estrutura do Sistema

- `lib/domain/themes.ts`: Definição dos temas com cores e fontes
- `lib/domain/theme-utils.ts`: Utilitários para gerar variáveis CSS
- `lib/presentation/theme.css`: Arquivo CSS base com variáveis injetadas no build
- `lib/presentation/widget-styles.ts`: Gerador de estilos para o widget flutuante
- `wxt.config.ts`: Injeta as variáveis CSS do tema durante o build

## Adicionando Novo Tema

1. Adicione o novo tema em `lib/domain/themes.ts`
2. Adicione o nome do tema ao array `themes` em `scripts/set-theme.ts`
3. Pronto! O tema já estará disponível para uso

## Variáveis CSS

O sistema utiliza as seguintes variáveis CSS:

- `--bg`: Cor de fundo principal
- `--surface`: Cor de fundo secundária (cards, painéis)
- `--surface2`: Cor de fundo terciária (hover, estados)
- `--border`: Cor de bordas
- `--accent`: Cor primária de destaque
- `--accent2`: Cor secundária de destaque
- `--warn`: Cor para avisos
- `--danger`: Cor para erros/danger
- `--text`: Cor do texto principal
- `--text-dim`: Cor do texto secundário
- `--text-dimmer`: Cor do texto terciário
- `--mono`: Fonte monoespaçada
- `--sans`: Fonte sem serifa
