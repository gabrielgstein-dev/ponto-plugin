# Roadmap — Migração do GestãoPonto para `gestaoponto.insi.com`

**Data do diagnóstico:** 2026-08-26
**Sintoma reportado:** usuários "não ficam logados"; ao abrir o plugin aparece uma aba em
`gestaoponto.insi.com/gestaoponto-frontend/login` (login local usuário/senha, que ninguém usa).

## Diagnóstico

```
$ curl -sI https://gestaoponto.meta.com.br/
HTTP/2 301  location: https://gestaoponto.insi.com/gestaoponto-frontend/login

$ curl -X POST https://gestaoponto.meta.com.br/gestaoponto-backend/api/senior/auth/g7
301 → https://gestaoponto.insi.com/gestaoponto-frontend/login       (redirect cego: perde path e query)

$ curl -X POST https://gestaoponto.insi.com/gestaoponto-backend/api/senior/auth/g7
401                                                                  (host novo funciona, só falta token)

$ curl 'https://gestaoponto.insi.com/gestaoponto-frontend/?portal=g7&showMenu=S'
200
```

Cadeia de falha no plugin (todos com `gestaoponto.meta.com.br` hardcoded):

1. `gp-auth.ts` → `POST {GP_API_BASE}senior/auth/g7` segue o 301, vira GET no HTML de login,
   `r.json()` explode → `getGpAssertion()` retorna `null` sempre → plugin acha que deslogou.
2. Sem assertion, `gp-provider.ts` cai no fallback por aba → `gp-tab-utils.ts` abre `GP_FRONTEND_URL`
   → 301 engole o `?portal=g7` (o SSO via token Senior) → tela de login local.
3. `interceptor.content.ts` e `host_permissions` só cobrem o host antigo → nada é capturado na aba nova.

**Lado Senior está OK.** Captura de rede de 26/08 mostra `platform.senior.com.br/login?tenant=meta.com.br`
→ `sso.senior.com.br` → SAML → `login.microsoftonline.com` (tenant `insi.com`, MFA) → `:9443/commonauth`
→ `/senior-x/` com todas as chamadas do bridge 200. Tenant Senior continua `meta.com.br`.

## Restrição de rollout

Adicionar host em `host_permissions` faz o Chrome **desabilitar a extensão no update** até o usuário
aceitar as novas permissões. Não tem como evitar (fetch do SW com headers `token`/`assertion` e o
content script precisam da permissão). "Transparente" = um aviso, uma vez, com texto nosso; depois
nunca mais pensar em login.

## Fase 1 — Fix do domínio ✅ (branch `fix/gp-insi-domain`)

- [x] `constants.ts`: `GP_HOST`, `GP_LEGACY_HOST`, `GP_ORIGIN`, `GP_API_BASE`, `GP_FRONTEND_URL`, `GP_LOCAL_LOGIN_PATH`
- [x] `wxt.config.ts`: `host_permissions` += `*://gestaoponto.insi.com/*` (legado mantido até a Fase 4; remover não gera prompt, mas manter é inofensivo)
- [x] `interceptor.content.ts`, `widget.content.ts`: `matches` com os dois hosts
- [x] `gp-ajuste.ts`: header `origin` → `GP_ORIGIN`
- [x] `gp-tab-utils.ts`: `findGpTab` ignora aba parada em `/gestaoponto-frontend/login`
- [x] `tests/unit/gp-constants.test.ts`
- [ ] Verificação real em browser: `auth/g7` 200 com `token`, marcações lidas sem abrir aba (evidência no PR)

## Fase 2 — Nunca mais falhar em silêncio ✅

- [x] `callGpAuthG7` e `fetchDirect`: `fetch(..., { redirect: 'manual' })`; `opaqueredirect`/`r.redirected` →
      `logError` `category: 'auth'`, `severity: 'high'`, `operation: 'gp.hostRedirected'`, `metadata.location`
      (`gp-host-guard.ts`; storage `gpUnreachableTs`/`gpUnreachableUrl`, limpo no próximo `auth/g7` OK).
- [x] Estado de auth `'gp_unreachable'` (≠ deslogado): redirect/5xx **com** sessão Senior válida
      (`hasSeniorSession()`) → sidepanel mostra "Sua sessão está OK, mas o GestãoPonto mudou de endereço —
      atualize o plugin" em vez de "Reconectar" (`useGpUnreachable` + `TokenStatus gpUnreachable`).

## Fase 3 — Transparência no update

- [ ] `onInstalled` (`reason === 'update'`, `previousVersion < 0.15.0`) seta `pendingHostMigration`.
      Se `chrome.permissions.contains({ origins: ['*://gestaoponto.insi.com/*'] })` for `false`, popup mostra
      banner "O GestãoPonto mudou para gestaoponto.insi.com. Clique em Ativar para o plugin voltar a
      sincronizar" → `chrome.permissions.request()`.
- [ ] Ao aceitar: `invalidateGpCache()` + `resetGpPunchCache()` + sync imediato.
- [ ] Release notes 0.15.0 (`/release-notes`) com seção "Por que o Chrome pediu permissão nova". Mesma frase
      no CHANGELOG e na descrição da loja.
- [ ] Atualizar `public/privacy.html`, `PRIVACY.md`, `APRENDIZADOS_API_SENIOR.md` (política de privacidade é
      revisada pela loja — precisa citar o domínio novo).

## Fase 4 — Rollout

1. PR Fase 1+2 primeiro; Fase 3 em PR separado no mesmo release.
2. `release-please` → 0.15.0 → publicar na CWS como atualização com novas permissões (review mais lenta;
   submeter cedo).
3. Comunicado interno no dia da aprovação (Chrome desabilita o plugin de todo mundo ao mesmo tempo).
4. Após ~2 releases estáveis, remover `gestaoponto.meta.com.br` de `host_permissions`/`matches`
   (remoção não gera prompt).

## Fora de escopo

- Lado Senior (login SAML/Microsoft, refresh token): funcionando, não mexer.
- Timesheet (`plataforma.meta.com.br` / `api.meta.com.br`): responde normal; se migrar, é o mesmo tipo de fix
  e a Fase 2 acusa no log.
