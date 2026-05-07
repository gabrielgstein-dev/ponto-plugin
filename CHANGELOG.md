# Changelog

## [0.6.0](https://github.com/gabrielgstein-dev/ponto-plugin/compare/senior-ponto-v0.5.0...senior-ponto-v0.6.0) (2026-05-07)


### Novidades

* **auth:** refresh silencioso robusto atrás de feature flag ([d620018](https://github.com/gabrielgstein-dev/ponto-plugin/commit/d6200181b6796ab1920d92f2aa151891c19e08aa))
* **auth:** silent refresh + storage listener filtrado + single-flight TS sync ([759ed72](https://github.com/gabrielgstein-dev/ponto-plugin/commit/759ed726bfd21bf8acca26e36e82d3757f7591e7))
* **error-logger:** logging estruturado de erros (auth) ([6fbb9c0](https://github.com/gabrielgstein-dev/ponto-plugin/commit/6fbb9c030a8742bd47f2d1d79ef73f09e2fe0d7e))
* **meta-ts:** aguarda webNavigation.onCompleted antes de executeScript ([db117ea](https://github.com/gabrielgstein-dev/ponto-plugin/commit/db117eabfadadab6db141b652423a1bd30171614))
* **meta-ts:** centraliza fetch no service worker (single tab owner) ([5de7d7b](https://github.com/gabrielgstein-dev/ponto-plugin/commit/5de7d7b801d8f8b2c923a1b9ade39cf92f6ee806))
* **meta-ts:** elimina fluxo via aba — fetch direto via host_permissions ([7adaaf8](https://github.com/gabrielgstein-dev/ponto-plugin/commit/7adaaf8d16862cbe067ecdbf657308f0c3a28f00))
* **ui:** loading state correto no sidepanel + try/finally robusto ([8fc4a0a](https://github.com/gabrielgstein-dev/ponto-plugin/commit/8fc4a0a40b771266f9e1cfa2e8fd6d3c9124a334))


### Correções

* **auth+ui:** destrava UI presa, refresh robusto + override manual ([7aa1116](https://github.com/gabrielgstein-dev/ponto-plugin/commit/7aa1116f5f12372043c666af8ab9af8a3768b5c7))
* **auth:** preserva token + UI Reconectar no sidepanel quando sessão expira ([0fe5e49](https://github.com/gabrielgstein-dev/ponto-plugin/commit/0fe5e49ce5247a6079341ac2d87974ba9e61dde5))
* **background:** nunca abre abas em ciclos automáticos (background silencioso) ([84418da](https://github.com/gabrielgstein-dev/ponto-plugin/commit/84418dae0db2d2aaa827be501933c2b80e77fae1))
* corrige 3 bugs críticos reportados (entrada notif, tab spam, auth/login) ([9cac790](https://github.com/gabrielgstein-dev/ponto-plugin/commit/9cac79070c7ca0599674435c9e7836de2bbf4f3b))
* **meta-ts:** valida exp do Bearer antes de persistir no storage ([6da7516](https://github.com/gabrielgstein-dev/ponto-plugin/commit/6da75160d276867ae54257595835427b39ec9de8))
* **notifications:** adiciona slot 'entrada' para lembrar início da jornada ([08aef70](https://github.com/gabrielgstein-dev/ponto-plugin/commit/08aef702078612f5b87e8df3b6e87ddd8eca58bd))
* pathname match URL, link Senior correto, body 5xx em auth/g7 ([1efd954](https://github.com/gabrielgstein-dev/ponto-plugin/commit/1efd9543addb767cbd764fddc98d4ae348198e5b))
* **senior-auth:** refresh silencioso usando contrato real do endpoint ([9dace71](https://github.com/gabrielgstein-dev/ponto-plugin/commit/9dace7117b9b1cadc488340e7792e6bf0a09d2f3))
* **senior-auth:** refresh silencioso usando contrato real do endpoint ([447fd5d](https://github.com/gabrielgstein-dev/ponto-plugin/commit/447fd5d9b926d0141f387829c38d8f0af9955007))
* **senior:** SeniorPageAuth extrai payload.token do sessionStorage Senior X ([467da0c](https://github.com/gabrielgstein-dev/ponto-plugin/commit/467da0c6f6ad5ba5338d0180d92462279e68419b))
* **ui:** destrava \"Verificando token...\" preso e adiciona override manual ([fe10ac2](https://github.com/gabrielgstein-dev/ponto-plugin/commit/fe10ac262ae6f40b28c56ec8d18e53c5aec3bfc8))


### Reversões

* PR [#17](https://github.com/gabrielgstein-dev/ponto-plugin/issues/17) (senior refresh) — regressão em produção ([bfecb33](https://github.com/gabrielgstein-dev/ponto-plugin/commit/bfecb3335d319feb71f42f446fdb662430454824))

## [0.5.0](https://github.com/gabrielgstein-dev/ponto-plugin/compare/senior-ponto-v0.4.0...senior-ponto-v0.5.0) (2026-04-30)


### Novidades

* **auth:** refresh silencioso de tokens Senior e Meta TS ([7187e58](https://github.com/gabrielgstein-dev/ponto-plugin/commit/7187e58a1762a971705aff803f04765eef69efae))
* **detect:** integra refresh silencioso e skip de aba GP sem sessão ([f3633db](https://github.com/gabrielgstein-dev/ponto-plugin/commit/f3633db31416b3aa0b674b54435a0ef3d281fda4))
* refresh silencioso de tokens, skip de aba GP sem sessão e fixes de testes ([0bfeb92](https://github.com/gabrielgstein-dev/ponto-plugin/commit/0bfeb920c3c1bddf9ce4b69d0343b6d3b16875ca))


### Correções

* **hooks:** evita reload em loop em renovação silenciosa do token ([6ebb4f1](https://github.com/gabrielgstein-dev/ponto-plugin/commit/6ebb4f151209ef4b678507b173deaf3194449c67))
* **tests:** atualiza mocks e expectativas após refactor ([e15b8c1](https://github.com/gabrielgstein-dev/ponto-plugin/commit/e15b8c19388ed9483187d4c7b14abe5a7adeaaaf))

## [0.4.0](https://github.com/gabrielgstein-dev/ponto-plugin/compare/senior-ponto-v0.3.1...senior-ponto-v0.4.0) (2026-04-30)


### Novidades

* **debug:** botão de teste do popup de lembrete ([740b951](https://github.com/gabrielgstein-dev/ponto-plugin/commit/740b95164e931b4c1c811ac19dba5bfec799365e))
* redirect ao bater ponto e UX de observação no timesheet ([d874450](https://github.com/gabrielgstein-dev/ponto-plugin/commit/d874450790fcd33e570aa069a5bc053f1ff440a8))
* **reminder:** abre tela de ponto ao clicar "Entendido" no popup ([4d5cb09](https://github.com/gabrielgstein-dev/ponto-plugin/commit/4d5cb095bef9a32042dcd973b6e8496e746b7431))
* **timesheet:** modo readonly e flash ao salvar observação ([2bc10a3](https://github.com/gabrielgstein-dev/ponto-plugin/commit/2bc10a3d669bf94cd1389a18d69470ed64ae6606))


### Correções

* **timesheet:** filtra apenas lançamentos pendentes em qualquer período ([df53a77](https://github.com/gabrielgstein-dev/ponto-plugin/commit/df53a77b4edb3e83eb81a4f28291ea1da22596aa))

## [0.3.1](https://github.com/gabrielgstein-dev/ponto-plugin/compare/senior-ponto-v0.3.0...senior-ponto-v0.3.1) (2026-04-28)


### Correções

* **timesheet:** remove credentials:include do fetchViaMetaTab ([42716ed](https://github.com/gabrielgstein-dev/ponto-plugin/commit/42716ed9e01cfc86d6606cff83e89e7d57cfef65))
* **timesheet:** remove credentials:include que causava Failed to fetch ([c9b0814](https://github.com/gabrielgstein-dev/ponto-plugin/commit/c9b08144a277db514e13f9fd25790f6c615b5438))
* **timesheet:** remove credentials:include que causava Failed to fetch ([c9b0814](https://github.com/gabrielgstein-dev/ponto-plugin/commit/c9b08144a277db514e13f9fd25790f6c615b5438))
* **timesheet:** usar competência fiscal Meta (corte dia 26) ao montar period ([08f7a5c](https://github.com/gabrielgstein-dev/ponto-plugin/commit/08f7a5c067020968556a72ead0c55c301b901890))
* **timesheet:** usar competência fiscal Meta (corte dia 26) ao montar period ([08f7a5c](https://github.com/gabrielgstein-dev/ponto-plugin/commit/08f7a5c067020968556a72ead0c55c301b901890))
* **timesheet:** usar competência fiscal Meta (corte dia 26) ao montar period ([57c6fe8](https://github.com/gabrielgstein-dev/ponto-plugin/commit/57c6fe87cede80be4da4b5382a4bf4bd51b209a1))

## [0.3.0](https://github.com/gabrielgstein-dev/ponto-plugin/compare/senior-ponto-v0.2.0...senior-ponto-v0.3.0) (2026-04-28)


### Novidades

* **auth:** persist tokens 24h and re-login on 401 ([3918208](https://github.com/gabrielgstein-dev/ponto-plugin/commit/39182087e1747ba41313d2d2f93b7e1dc18779b0))
* **auth:** persistir tokens 24h e re-logar em 401 ([98fc17e](https://github.com/gabrielgstein-dev/ponto-plugin/commit/98fc17e5fb6d15b60746266ece21b752ec7eb268))
* **gp:** add manual punch adjustment with justification ([14a0a3f](https://github.com/gabrielgstein-dev/ponto-plugin/commit/14a0a3fbd8c212e22ea994bbfea7a4f64f49a891))
* **login-link:** parametrize TokenStatus loginUrl per tenant ([b8cbede](https://github.com/gabrielgstein-dev/ponto-plugin/commit/b8cbede2e41eeadfc7b65fb70563c806dd4eff75))
* **logs:** persistent ring buffer with export/clear UI ([900dcaa](https://github.com/gabrielgstein-dev/ponto-plugin/commit/900dcaa7f718baea108baf23e717c9feecaaf348))
* **meta-timesheet:** bootstrap hidden tab through Senior SSO URL ([783e56c](https://github.com/gabrielgstein-dev/ponto-plugin/commit/783e56caff2428864b74db2216a9da6ba6161505))
* **notif:** aviso de 5min, lembrete de atraso e fix de saída ([25c8c9d](https://github.com/gabrielgstein-dev/ponto-plugin/commit/25c8c9d16ce7adc4b9a4e0d10732765944c35be8))


### Correções

* **application:** better lunch/return detection in punch flow ([972e7cb](https://github.com/gabrielgstein-dev/ponto-plugin/commit/972e7cbec9a8c8294cbd61cfb8212cf28a0a2e0d))
* **meta-timesheet:** bootstrap on /modules/timesheet/create so SPA loads timesheet module ([a82e3f9](https://github.com/gabrielgstein-dev/ponto-plugin/commit/a82e3f9d74a5981eefb2248b19df754b7e38af6b))
* **meta-timesheet:** cache tab across getSummary and detect SSO redirect ([3588768](https://github.com/gabrielgstein-dev/ponto-plugin/commit/3588768f6da7db87e24ac3d5bef7030daf005104))
* **meta-timesheet:** route API fetch through plataforma.meta.com.br tab ([7cfeafb](https://github.com/gabrielgstein-dev/ponto-plugin/commit/7cfeafb28e2401263d426c1410e6dacdbb1a0c2c))
* **slots:** atribuir por índice puro + avisos 5min/atraso/saída ([76e3182](https://github.com/gabrielgstein-dev/ponto-plugin/commit/76e31827af91b6c5324f2ed65d6756137234759c))
* **slots:** atribuir slots por índice puro, sem heurística de horário ([cbb57db](https://github.com/gabrielgstein-dev/ponto-plugin/commit/cbb57dba073b21ec1031db65c33c1269f1926a66))
* **ui:** debounce, cooldown and focus reuse for timesheet popup ([3f87f3f](https://github.com/gabrielgstein-dev/ponto-plugin/commit/3f87f3f3884b902d3952db0c081196e49358f0e8))

## [0.2.0](https://github.com/gabrielgstein-dev/ponto-plugin/compare/senior-ponto-v0.1.0...senior-ponto-v0.2.0) (2026-04-27)


### Novidades

* add timesheet auto-sync and mutation detection ([a5111e7](https://github.com/gabrielgstein-dev/ponto-plugin/commit/a5111e7503e842f597be6a1a7cabd6d6d90d2b5c))
* add timesheet notification system ([d73c6e3](https://github.com/gabrielgstein-dev/ponto-plugin/commit/d73c6e3581fad2796acb8992b41f90fa50d93f55))
* **application:** add punch reminder manager and enhanced alarm handling ([f4912f2](https://github.com/gabrielgstein-dev/ponto-plugin/commit/f4912f2e4eec3b0545912c020c7eac78fc183b3c))
* **build:** add build-time company switching ([d41d82b](https://github.com/gabrielgstein-dev/ponto-plugin/commit/d41d82b823cade5fa45860ccff46a52e5a2ea49b))
* **domain:** add punch reminder types and timesheet cost center allocations ([088cb45](https://github.com/gabrielgstein-dev/ponto-plugin/commit/088cb4568aa999a93223fcbf2cd29943bb317a1b))
* enhance build system for theme support ([0395ed6](https://github.com/gabrielgstein-dev/ponto-plugin/commit/0395ed673226d6afd2cc7ac033284b9cf11eee12))
* **entrypoints:** update background and sidepanel for reminder features ([9012129](https://github.com/gabrielgstein-dev/ponto-plugin/commit/90121292902f9ee4f18b2bfb126fc3d2442c29fc))
* implement proactive token refresh and enhanced punch detection ([138f16b](https://github.com/gabrielgstein-dev/ponto-plugin/commit/138f16b6c0e934aaeeb902e1c2087187376b0c85))
* implement theme system with Meta color palette ([e63d75a](https://github.com/gabrielgstein-dev/ponto-plugin/commit/e63d75aec7172df77031e89e5f0147525c8d9207))
* implement theme system with Meta color palette ([2701ede](https://github.com/gabrielgstein-dev/ponto-plugin/commit/2701ede260a9532b11c2260ad02dd61fa2876083))
* **infrastructure:** update providers for timesheet allocations ([ed41624](https://github.com/gabrielgstein-dev/ponto-plugin/commit/ed41624cf8df542905c069f5db0ca09018d9c493))
* integrate theme system into UI components ([5637f10](https://github.com/gabrielgstein-dev/ponto-plugin/commit/5637f10211c9626204db5c0d2afefd00c7dafff7))
* **presentation:** add timesheet row components and panel enhancements ([87ba477](https://github.com/gabrielgstein-dev/ponto-plugin/commit/87ba477912e5cb93af45fe89f5f4e69c98807439))
* **punches:** add pending punch system with time extraction and multi-provider merge ([0c0c495](https://github.com/gabrielgstein-dev/ponto-plugin/commit/0c0c495da08ba591216dd1a054d38af0b954d304))
* **timesheet:** add expandable row details with hourType field ([0f9eb2d](https://github.com/gabrielgstein-dev/ponto-plugin/commit/0f9eb2d7aace4ed560abdfe46394e98742c1fd76))
* **timesheet:** add Meta Timesheet integration ([71b6e72](https://github.com/gabrielgstein-dev/ponto-plugin/commit/71b6e728f4b97e86b41ed9547fe2441a868fb67a))
* **ui:** add Meta Timesheet tab to sidepanel with improved typography and status display ([3aeb432](https://github.com/gabrielgstein-dev/ponto-plugin/commit/3aeb43248dde006f049d6ab6f26e817229bf9f1f))
* **ui:** add overtime tracking and display in progress bar ([646b9d3](https://github.com/gabrielgstein-dev/ponto-plugin/commit/646b9d384d63877e2c7bf04bbeb7d3f7e25f306d))
* **ui:** add punch reminder popup window ([356e367](https://github.com/gabrielgstein-dev/ponto-plugin/commit/356e36740d1fb8c6a417c068e8d49d1587fde8c9))
* update domain layer for theme and timesheet support ([4d931f3](https://github.com/gabrielgstein-dev/ponto-plugin/commit/4d931f31187de0ea6899cb7113c2bca123b7316e))
* update infrastructure and background scripts for timesheet support ([16d68de](https://github.com/gabrielgstein-dev/ponto-plugin/commit/16d68dee0ec8b600d1e7e32e02d335f4a679115e))
* update presentation layer with theme and timesheet features ([0916cb3](https://github.com/gabrielgstein-dev/ponto-plugin/commit/0916cb3615c48c8a13852a6054d2cb5ea6888d21))


### Correções

* **consumers:** update imports to use #company providers ([96ee1a8](https://github.com/gabrielgstein-dev/ponto-plugin/commit/96ee1a8462f5c429a58e5da4e921b7106425f2be))
