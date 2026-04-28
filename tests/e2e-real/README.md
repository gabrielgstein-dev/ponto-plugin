# E2E Reais

Testes que **batem nas APIs reais** de Senior, Meta Timesheet e Meta GP.
Servem como contract test: falham se um endpoint mudar shape ou parar de responder.

## Garantias

- **Apenas GET.** Nenhum POST/PATCH/DELETE é feito. Nunca alteram dados.
- **Opt-in.** O `playwright.config.ts` padrão não enxerga este diretório.
  Só roda via `pnpm test:e2e:real`.
- **Sem credenciais no repo.** O perfil persistente fica em
  `tests/.real-profile/` (gitignored). Login manual feito uma vez.

## Como rodar

```bash
pnpm test:e2e:real
```

Na **primeira execução**:
1. Um Chromium abre visível (headed).
2. Cada spec navega para a plataforma correspondente.
3. **Faça login** na janela manualmente. Aguarde a tela carregar completa.
4. Os testes detectam o login e seguem com os GETs.

A partir da **segunda execução**: cookies já estão salvos em
`tests/.real-profile/`, sem login manual.

## Quando rodar

- Antes de releases importantes — confirma que nada quebrou no contrato.
- Quando algum teste mockado começa a passar suspeito (pode ter perdido
  contato com a realidade).
- Periodicamente como smoke test manual.

## Como invalidar a sessão

Se quiser forçar um novo login (ex.: testar fluxo de SSO):

```bash
rm -rf tests/.real-profile
```
