#!/usr/bin/env bash
# Replica via cURL as chamadas que o plugin faz aos endpoints do Senior e GP.
# Útil pra ver a resposta COMPLETA (sem o cap de 4 slots que o plugin aplica)
# e isolar onde está a falha de sync mobile→plugin.
#
# ── Como obter os tokens ──────────────────────────────────────────────────────
#
# SENIOR_TOKEN — service worker do plugin (mais fácil):
#   1. chrome://extensions → Senior Ponto → clica "Service worker" (link azul)
#   2. Console (F12 dentro do popup do SW):
#      chrome.storage.local.get('seniorToken').then(d => copy(d.seniorToken))
#   3. Token copiado pra clipboard. Cole numa env var:
#      export SENIOR_TOKEN="<cole-aqui>"
#
# GP_ASSERTION + IDs:
#   No mesmo console do service worker:
#      chrome.storage.local.get(['gpAssertion','gestaoPontoColaboradorId','gestaoPontoCodigoCalculo']).then(d => copy(JSON.stringify(d, null, 2)))
#   Cole o JSON em algum lugar e exporte cada campo:
#      export GP_ASSERTION="<gpAssertion>"
#      export GP_COLABORADOR_ID="<gestaoPontoColaboradorId>"
#      export GP_CODIGO_CALCULO="<gestaoPontoCodigoCalculo>"  # opcional
#
# ── Uso ──────────────────────────────────────────────────────────────────────
#
#   ./scripts/spike-curl.sh senior   # só endpoints Senior pontomobile_bff
#   ./scripts/spike-curl.sh gp       # só GP acertoPontoColaboradorPeriodo
#   ./scripts/spike-curl.sh both     # ambos (default)
#   ./scripts/spike-curl.sh all      # both + os 5 fallbacks do senior-api-provider

set -euo pipefail

MODE="${1:-both}"
TODAY="$(date +%Y-%m-%d)"

# zone-offset esperado pelo GP é getTimezoneOffset() do JS (minutos do UTC,
# sinal invertido em relação ao "+HH:MM" do `date`).
# BR padrão: UTC-03 → 180. Override via env GP_ZONE_OFFSET se quiser.
GP_ZONE_OFFSET="${GP_ZONE_OFFSET:-180}"

red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
dim()    { printf "\033[2m%s\033[0m\n" "$*"; }
bold()   { printf "\033[1m%s\033[0m\n" "$*"; }

curl_call() {
  local LABEL="$1" METHOD="$2" URL="$3"
  shift 3
  bold "─── $LABEL"
  dim "  $METHOD $URL"
  # -i mostra headers de resposta; -w summary no fim
  # Limita preview pra 1.5KB pra não poluir terminal
  local OUT
  OUT="$(curl -s -i -X "$METHOD" "$URL" "$@" -w $'\n___STATUS___ %{http_code} %{time_total}s %{size_download}B\n' 2>&1 || true)"
  local STATUS_LINE
  STATUS_LINE="$(echo "$OUT" | grep '^___STATUS___' || true)"
  local HEADERS
  HEADERS="$(echo "$OUT" | sed -n '1,/^\r\?$/p' | head -20)"
  local BODY
  BODY="$(echo "$OUT" | sed '1,/^\r\?$/d' | sed '/^___STATUS___/d')"

  echo "$STATUS_LINE"
  echo "$BODY" | head -c 1500
  if [ "$(echo "$BODY" | wc -c)" -gt 1500 ]; then
    dim "  [truncated — ${#BODY} bytes total]"
  fi
  echo
  echo
}

senior_call() {
  if [ -z "${SENIOR_TOKEN:-}" ]; then
    red "❌ SENIOR_TOKEN não definido. Veja header do script."
    return 1
  fi

  local BASE="https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest"
  local AUTH="Authorization: bearer $SENIOR_TOKEN"
  local CT="Content-Type: application/json"

  green "═══ Senior — varrendo os 11 endpoints do senior-api-provider ═══"
  echo

  # Os 11 endpoints do senior-api-provider.ts (mesma lista que o plugin spike).
  # Achado em 2026-05-14: pontomobile_bff/queries/* retornam
  # `bridge.unknown_command` — serviço existe mas comando deprecated.
  # Outros sub-services (pontomobile_clocking_event, gestao_ponto) podem
  # ainda funcionar.
  curl_call "getClockingEventsQuery" \
    POST "$BASE/hcm/pontomobile_bff/queries/getClockingEventsQuery" \
    -H "$AUTH" -H "$CT" -d '{}'

  curl_call "getLastClockingEventsQuery" \
    POST "$BASE/hcm/pontomobile_bff/queries/getLastClockingEventsQuery" \
    -H "$AUTH" -H "$CT" -d '{}'

  curl_call "getEmployeeClockingEventsQuery" \
    POST "$BASE/hcm/pontomobile_bff/queries/getEmployeeClockingEventsQuery" \
    -H "$AUTH" -H "$CT" -d '{}'

  curl_call "listClockingEvent" \
    POST "$BASE/hcm/pontomobile_clocking_event/queries/listClockingEvent" \
    -H "$AUTH" -H "$CT" -d '{}'

  curl_call "getClockingEvent" \
    POST "$BASE/hcm/pontomobile_clocking_event/queries/getClockingEvent" \
    -H "$AUTH" -H "$CT" -d '{}'

  curl_call "clockingEventList (com data)" \
    POST "$BASE/hcm/pontomobile_clocking_event/queries/clockingEventList" \
    -H "$AUTH" -H "$CT" -d "{\"startDate\":\"$TODAY\",\"endDate\":\"$TODAY\"}"

  curl_call "getClockingEventByEmployee" \
    POST "$BASE/hcm/pontomobile_clocking_event/queries/getClockingEventByEmployee" \
    -H "$AUTH" -H "$CT" -d "{\"startDate\":\"$TODAY\",\"endDate\":\"$TODAY\"}"

  curl_call "entities/clockingEvent (GET)" \
    GET "$BASE/hcm/pontomobile_clocking_event/entities/clockingEvent" \
    -H "$AUTH" -H "$CT"

  curl_call "getByDate" \
    POST "$BASE/hcm/pontomobile_clocking_event/queries/getByDate" \
    -H "$AUTH" -H "$CT" -d "{\"date\":\"$TODAY\"}"

  curl_call "getMarcacoes (gestao_ponto via Senior)" \
    POST "$BASE/hcm/gestao_ponto/queries/getMarcacoes" \
    -H "$AUTH" -H "$CT" -d "{\"dataInicio\":\"$TODAY\",\"dataFim\":\"$TODAY\"}"

  curl_call "getClockingsByPeriod (gestao_ponto via Senior)" \
    POST "$BASE/hcm/gestao_ponto/queries/getClockingsByPeriod" \
    -H "$AUTH" -H "$CT" -d "{\"startDate\":\"$TODAY\",\"endDate\":\"$TODAY\"}"
}

gp_call() {
  if [ -z "${GP_ASSERTION:-}" ] || [ -z "${GP_COLABORADOR_ID:-}" ]; then
    red "❌ GP_ASSERTION e GP_COLABORADOR_ID precisam estar definidos."
    red "   Veja header do script."
    return 1
  fi

  green "═══ GestaoPonto acertoPontoColaboradorPeriodo ═══"
  echo

  local URL="https://gestaoponto.meta.com.br/gestaoponto-backend/api/acertoPontoColaboradorPeriodo/colaborador/$GP_COLABORADOR_ID?dataInicial=$TODAY&dataFinal=$TODAY&orderby=-dataApuracao"
  if [ -n "${GP_CODIGO_CALCULO:-}" ]; then
    URL="$URL&codigoCalculo=$GP_CODIGO_CALCULO"
  fi

  curl_call \
    "acertoPontoColaboradorPeriodo (hoje)" \
    GET "$URL" \
    -H "Accept: application/json" \
    -H "assertion: $GP_ASSERTION" \
    -H "zone-offset: $GP_ZONE_OFFSET"
}

case "$MODE" in
  senior) senior_call ;;
  gp)     gp_call ;;
  both)   senior_call; echo; gp_call ;;
  all)    MODE_ALL=1; senior_call; echo; gp_call ;;
  -h|--help)
    echo "Uso: $0 [senior|gp|both|all]"
    echo "  senior  apenas endpoints Senior pontomobile_bff"
    echo "  gp      apenas GP"
    echo "  both    ambos (default)"
    echo "  all     both + 3 fallbacks do senior-api-provider"
    ;;
  *) echo "Modo inválido: $MODE. Use: senior, gp, both, all"; exit 1 ;;
esac
