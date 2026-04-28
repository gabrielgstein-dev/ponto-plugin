# Changelog

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
