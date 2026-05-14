#!/usr/bin/env bash
# Captura logs do app Senior no celular via ADB.
# Foco: descobrir endpoints chamados pelo app mobile (URLs, hosts, auth flow)
# que o plugin não conhece ou usa de forma diferente.
#
# Uso:
#   ./scripts/spike-logcat.sh                    # captura interativa (Ctrl+C pra parar)
#   ./scripts/spike-logcat.sh out.log            # salva em arquivo específico
#   ./scripts/spike-logcat.sh --list-packages    # lista pacotes Senior instalados
#   ./scripts/spike-logcat.sh --raw out.log      # sem filtro, captura TUDO (arquivo grande)
#
# Pré-requisitos:
#   - adb instalado: brew install --cask android-platform-tools
#   - USB debugging on no Android: Configurações → Sobre → toca 7x em "Build" →
#     volta → Opções do desenvolvedor → USB debugging
#   - Cabo USB conectado, prompt "Permitir depuração USB?" aceito

set -euo pipefail

usage() {
  cat <<'EOF'
Uso: spike-logcat.sh [--list-packages | --raw <out.log> | <out.log>]

  <out.log>          Arquivo destino (default: mobile-traffic-YYYYMMDD-HHMMSS.log)
  --list-packages    Lista apps Senior/ponto instalados e sai
  --raw <out.log>    Captura tudo sem filtro (debugging do filtro)

Procedimento sugerido:
  1. Conecta o celular, roda --list-packages, confere se aparece o pacote do Senior
  2. Roda sem args, depois ABRE o app e bate ponto
  3. Ctrl+C, abre o .log gerado
  4. Procure linhas com URLs (http/https), hosts senior/pontomobile, status codes
EOF
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  --list-packages)
    if ! command -v adb >/dev/null; then echo "❌ adb não encontrado"; exit 1; fi
    echo "Pacotes instalados que mencionam senior/ponto/hcm/meta:"
    adb shell pm list packages 2>&1 | grep -iE 'senior|ponto|hcm|meta' || echo "  (nenhum match — talvez o pacote tenha outro nome, rode: adb shell pm list packages | grep -i <termo>)"
    exit 0
    ;;
esac

RAW=0
if [ "${1:-}" = "--raw" ]; then
  RAW=1
  shift
fi

OUTPUT="${1:-mobile-traffic-$(date +%Y%m%d-%H%M%S).log}"

if ! command -v adb >/dev/null; then
  echo "❌ adb não encontrado. Instale: brew install --cask android-platform-tools"
  exit 1
fi

if ! adb devices | tail -n +2 | grep -q $'\tdevice$'; then
  echo "❌ Nenhum device conectado. Cheque:"
  echo "   - USB debugging on (Opções do desenvolvedor)"
  echo "   - Cabo USB conectado e device desbloqueado"
  echo "   - Prompt 'Permitir depuração USB?' aceito no Android"
  echo
  echo "Status atual:"
  adb devices
  exit 1
fi

echo "✓ Device(s) conectado(s):"
adb devices | tail -n +2 | grep $'\tdevice$' | awk '{print "  " $1}'
echo
echo "→ Limpando buffer de log..."
adb logcat -c

echo "→ Salvando em: $OUTPUT"
if [ "$RAW" -eq 1 ]; then
  echo "→ Modo RAW — capturando TUDO. Arquivo pode ficar grande rápido."
else
  echo "→ Filtros: okhttp/retrofit/http, hosts senior, paths pontomobile/clocking/marcacao/batimento"
fi
echo "→ Agora abra o app no celular e bata o ponto. Ctrl+C pra parar."
echo

if [ "$RAW" -eq 1 ]; then
  adb logcat -v threadtime '*:V' 2>&1 | tee "$OUTPUT"
else
  adb logcat -v threadtime '*:V' 2>&1 \
    | grep --line-buffered -iE 'okhttp|retrofit|httpurlconnection|http response|senior\.com\.br|pontomobile|clocking|marcacao|batimento|gestaoponto|/bridge/[0-9]|api/auth' \
    | tee "$OUTPUT"
fi
