# Publicação nas lojas

A publicação na **Chrome Web Store é automatizada** via GitHub Actions a partir de tags geradas pelo `release-please`. Firefox ainda é manual.

## Variantes publicadas

Hoje publicamos a variante **Meta** (`pnpm zip:meta`). Em breve teremos uma variante **genérica** publicada como extensão separada na loja — cada variante tem seu próprio `extension_id`, mas compartilham o mesmo repositório, mesma versão e mesmo changelog.

## Fluxo automatizado (Chrome Web Store)

1. Commit seguindo Conventional Commits (validado pelo hook `commit-msg` + CI).
2. PR → **rebase-and-merge** em `master`.
3. O `release-please` abre uma Release PR com bump de versão e changelog categorizado em PT-BR (Novidades, Correções, Mudanças Visuais, Performance, Acessibilidade, Reversões).
4. Mergeie a Release PR → tag `vX.Y.Z` + GitHub Release criados → workflow `publish-chrome` builda a variante Meta e sobe na Chrome Web Store.

### Quando bumpar major

Não existe bump automático para major. Para subir major:

- adicione o footer `Release-As: 1.0.0` num commit qualquer, **ou**
- edite a versão direto na Release PR antes de mergear.

## Setup inicial (uma vez)

### Secrets do GitHub Actions

| Secret | Escopo | Como obter |
|---|---|---|
| `CHROME_META_EXTENSION_ID` | variante Meta | Dashboard do Chrome Web Store, na URL da extensão publicada |
| `CHROME_CLIENT_ID` | conta Google (compartilhado entre variantes) | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID tipo "Desktop app". Ative antes a "Chrome Web Store API" no projeto |
| `CHROME_CLIENT_SECRET` | conta Google (compartilhado) | mesma tela do Client ID |
| `CHROME_REFRESH_TOKEN` | conta Google (compartilhado) | fluxo OAuth one-shot — ver https://wxt.dev/guide/essentials/publishing.html#chrome-web-store |

> Os 3 secrets de OAuth são da **conta Google**, não da extensão. Eles serão reusados quando a variante genérica entrar.

### Settings do repositório

- **Settings → Pull Requests:** apenas "Allow rebase merging" habilitado.
- **Settings → Branches → master:** require PR + status checks `commitlint` e `release-please`.

## Adicionar a variante genérica (futuro)

Quando publicar a genérica:

1. Cadastre a extensão na Chrome Web Store → anote o `extension_id`.
2. Adicione o secret `CHROME_GENERIC_EXTENSION_ID` (os 3 de OAuth são reaproveitados).
3. Adicione um script `zip:generic:ci` em `package.json` (espelho de `zip:meta:ci` com as flags da genérica).
4. Adicione um job `publish-chrome-generic` em `.github/workflows/release-please.yml`, em paralelo ao `publish-chrome`, mapeando {% raw %}`CHROME_EXTENSION_ID: ${{ secrets.CHROME_GENERIC_EXTENSION_ID }}`{% endraw %}.

Ambas as variantes vão compartilhar versão e changelog — o que mudar para uma vai aparecer no release da outra também. Se as variantes divergirem ao ponto de fazer sentido changelog separado, migrar para o modo monorepo do `release-please` (cada variante como package).

## Firefox Add-ons (manual por ora)

1. `pnpm zip:meta` localmente.
2. Acesse https://addons.mozilla.org/pt-BR/developers/.
3. Upload do ZIP em `.output/ponto-meta-X.Y.Z.zip`.

Quando quiser automatizar, adicione `--firefox-zip` ao `wxt submit` no workflow + secrets `FIREFOX_JWT_ISSUER` / `FIREFOX_JWT_SECRET`.

## Distribuição interna (alternativa, sem loja)

- **Enterprise Policy** (Chrome/Edge) via GPO/registry para instalação silenciosa.
- **Side-loading** (.crx/.xpi) via scripts internos.
- Hospedar `.crx` em servidor próprio com página de instalação.
