---
name: release-notes
description: Gera release notes em PT-BR no formato Crimson Desert (Novidades / Correções / Qualidade) a partir dos conventional commits entre duas versões. Use quando o user pedir "release notes", "patch notes", "resumo da versão X.Y.Z", "o que entrou na 0.X.0", "changelog formatado", "anúncio de versão". Salva em docs/release-notes/X.Y.Z.md.
metadata:
  version: 1.0.0
---

# Release Notes — formato Crimson Desert

Gera release notes em PT-BR organizadas em três seções fixas: **◆ Novidades**, **◆ Correções**, **◆ Qualidade**. Estilo inspirado em patch notes de MMORPGs — categorizado, escaneável, com bullets ricos que explicam o WHY além do WHAT.

## Quando usar

- User pede resumo de uma release: "resumo da 0.11.0", "o que entrou na última versão", "release notes da 0.X.Y"
- User pede patch notes / changelog formatado
- User quer anúncio de versão pra publicação externa (post, Notion, e-mail)
- User menciona "Crimson Desert", "formato MMO", "estilo categorizado"

NÃO use para:
- Listar commits crus sem análise (use `git log` direto)
- Gerar CHANGELOG.md automatizado (já é feito pelo release-please)
- Mensagens de commit individuais

## Pré-requisitos do projeto

- Conventional commits em PT-BR ou EN (`feat:`, `fix:`, `test:`, `refactor:`, `perf:`, `a11y:`, `docs:`, `chore:`)
- Suite de testes acessível via `pnpm test`
- Tags semânticas (ex: `senior-ponto-v0.10.0`) ou `package.json` com `version`

## Pipeline de execução

### Passo 1 — Identificar a janela de mudanças

Determine `PREV` e `CURRENT`:

- Se o user passou a versão explicitamente (ex: "0.11.0"), use-a como `CURRENT`
- `PREV` = versão imediatamente anterior na lista de tags
- Se não houver tags, use `HEAD` como `CURRENT` e o último merge para master como `PREV`

Comandos de referência:
```bash
# tags ordenadas
git tag --sort=-v:refname | head -5
# range
git log --oneline PREV_TAG..CURRENT_TAG
```

### Passo 2 — Delegar análise para um subagente

CRÍTICO: não leia commits/diffs no contexto principal. Use o `Agent` tool com `subagent_type=general-purpose` (ou `Explore` se for só listagem).

O prompt do subagente DEVE pedir:

1. Listar todos os commits no range `PREV..CURRENT`, excluindo:
   - Merge commits (`Merge pull request #...`)
   - Release commits do release-please (`chore(master): release ...`)
   - Bumps de versão / changelog auto-gerados
2. Para cada commit restante, ler `git show --stat <hash>` e extrair:
   - Tipo (feat/fix/test/etc.) do prefixo
   - Arquivos tocados (resumo)
   - O QUE mudou tecnicamente
   - O POR QUÊ (impacto pra usuário, problema resolvido, edge case tratado)
3. Classificar em buckets:
   - `feat` → **Novidades**
   - `fix` → **Correções**
   - `test`, `refactor`, `perf`, `a11y`, `docs` (quando relevante pra usuário), `chore` (quando relevante) → **Qualidade**
4. Dentro de **Qualidade**, identificar sub-temas naturais:
   - `Cobertura de testes` — sempre, mesmo que sem novos testes (reporta total)
   - `Acessibilidade` — só se houver mudanças a11y (`prefers-reduced-motion`, `aria-*`, contraste, etc.)
   - `Validação visual` — só se houver screenshots/Playwright preview
   - `Performance` — só se houver mudança perf
5. Rodar comandos para métricas:
   ```bash
   pnpm test 2>&1 | tail -10           # captura "Tests N passed (N)"
   grep -rE "^\s*(test|it)\(" tests/e2e/*.spec.ts 2>/dev/null | wc -l   # E2E count
   ```

### Passo 3 — Saída do subagente: bloco EVIDÊNCIA + bloco MARKDOWN

O subagente DEVE retornar nessa ordem exata:

```
EVIDÊNCIA:
- Range: PREV..CURRENT (ex: senior-ponto-v0.10.0..senior-ponto-v0.11.0)
- Commits analisados:
  - <hash> <type>: <subject>
  - ... (todos)
- Commits ignorados (com motivo):
  - <hash> <subject> — release-please / merge / etc.
- Total testes unitários: N (comando: pnpm test | grep "Tests ")
- Total testes E2E: M (comando: grep -rE ... | wc -l)

---

MARKDOWN:

**Versão {VERSION} no ar**

Versão {VERSION} — {DD/MM/YYYY}

### ◆ Novidades

**{Título descritivo do feat}**
- Bullet com impacto pra usuário
- Bullet com detalhe técnico relevante
- (sub-bullets quando há lista, ex: estados de um componente)

(repetir para cada feat. Se não houver features, omitir a seção inteira.)

### ◆ Correções

**{Título descritivo do fix}**
- Bullet: problema → solução
- Bullet: impacto

(repetir para cada fix. Se não houver correções, omitir a seção inteira.)

### ◆ Qualidade

**Cobertura de testes**
- {N} novos testes unitários cobrindo {tema}
- Total de **{N total} testes unitários** e **{M} testes fim a fim** executados com sucesso

**Acessibilidade** (omitir se nada relacionado)
- ...

**Validação visual** (omitir se nada relacionado)
- ...

**Performance** (omitir se nada relacionado)
- ...
```

### Passo 4 — Validação no Claude principal

Antes de salvar o arquivo, o Claude principal DEVE:

1. Conferir que o bloco EVIDÊNCIA tem range, lista de commits e métricas
2. Conferir que cada bullet do markdown tem referência a um commit do bloco EVIDÊNCIA (não inventou nada)
3. Conferir que as métricas batem com os comandos descritos

Se algo não bater: NÃO salve. Retorne pro user explicando o que faltou.

### Passo 5 — Salvar o arquivo

Caminho: `docs/release-notes/{VERSION}.md` (criar pasta se não existir).

Conteúdo: só o bloco MARKDOWN (sem o EVIDÊNCIA — esse é descartado depois da validação).

### Passo 6 — Imprimir o resultado no chat

Sempre mostre o conteúdo final ao user em texto, mesmo após salvar. Termine com:
- Caminho do arquivo salvo
- Pergunta: "Quer que eu commite + abra PR?"

## Regras de exclusão (duras)

- Commits `chore(master): release ...` → **ignorar sempre**
- Commits `Merge pull request #...` → **ignorar sempre** (são wrappers)
- Commits sem prefixo conventional → **flagar no bloco EVIDÊNCIA**, não classificar erroneamente
- Se não houver testes E2E, **omitir a métrica** em vez de inventar
- Se um commit `chore:` ou `docs:` não tem impacto pra usuário, **omitir** da seção Qualidade

## Retorno parcial é permitido

Se não conseguir classificar um commit (ex: sem mensagem clara, sem prefixo), liste-o no bloco EVIDÊNCIA como "não classificado" e siga com os demais. **Não force** um bucket onde o commit não cabe.

Se não houver commits do tipo `feat`, a seção **◆ Novidades** simplesmente não aparece. Mesma regra para **◆ Correções**.

## Princípios de estilo

- Cada item em **Novidades** ou **Correções** tem um título em **bold** + 1-4 bullets
- Bullets devem explicar **WHY** além do WHAT — o que mudou para o usuário, qual problema resolveu, qual edge case foi coberto
- Use code spans para nomes de arquivos, comandos, propriedades CSS, identificadores de API
- Tom: formal mas direto. Sem emoji. Sem "🚀 Nova feature!". Sem hype.
- Idioma: PT-BR. Termos técnicos em inglês quando consagrados (ex: "payload", "toggle", "endpoint").

## Exemplo de saída bem-formada

Para referência do tom esperado, ver:
- `docs/release-notes/0.11.0.md` (criado nesta release)
- Estilo da 0.10.0 (post de anúncio externo, formato denso e explicativo)
