# Como instalar a extensão Senior Ponto v2.1.0

## Arquivos para download

**Para usuários finais (instalação direta):**
- `senior-ponto-v2.1.0-chrome-store.zip` (113 KB) - Chrome/Edge
- `senior-ponto-v2.1.0-firefox-addons.zip` (113 KB) - Firefox

**Para desenvolvedores:**
- `senior-ponto-v2.1.0-timesheet-popup.zip` (114 KB) - pasta descompactada

---

## 🎯 Instalação SEM "Carregar sem compactação" (Recomendado)

### Chrome/Edge - Via arrastar e soltar

1. **Baixe** o arquivo `senior-ponto-v2.1.0-chrome-store.zip`
2. **Descompacte** o ZIP em uma pasta
3. Abra o Chrome/Edge e acesse: `chrome://extensions/`
4. **Ative o "Modo do desenvolvedor"** (canto superior direito)
5. **Arraste e solte** o arquivo `senior-ponto-v2.1.0-chrome-store.zip` diretamente na página de extensões
6. Confirme a instalação quando solicitado
7. Pronto! A extensão estará ativa

### Firefox - Via arrastar e soltar

1. **Baixe** o arquivo `senior-ponto-v2.1.0-firefox-addons.zip`
2. **Descompacte** o ZIP em uma pasta
3. Abra o Firefox e acesse: `about:addons`
4. Clique no ícone de **engrenagem** ⚙️ → "Instalar complemento a partir de arquivo"
5. Selecione o arquivo `senior-ponto-v2.1.0-firefox-addons.zip`
6. Confirme a instalação
7. Pronto! A extensão estará ativa

---

## 🏢 Instalação sem modo desenvolvedor (Empresas)

### Via CRX - Chrome/Edge Enterprise

1. **Baixe** o arquivo `senior-ponto-v2.1.0.crx`
2. **Abra** o Chrome/Edge
3. **Arraste e solte** o arquivo `.crx` na página `chrome://extensions/`
4. Confirme a instalação
5. Pronto! Sem modo desenvolvedor necessário

### Via GPO/Registry - Windows (Empresas)

```reg
[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist]
"1"="extension_id;https://sua-empresa.com/senior-ponto-v2.1.0.crx"
```

---

## 🌐 Instalação via lojas (Recomendado para público geral)

Aguardando publicação nas lojas oficiais:
- **Chrome Web Store** - Busque por "Senior Ponto"
- **Firefox Add-ons** - Busque por "Senior Ponto"

Após publicação, instalação com 1 clique, sem modo desenvolvedor.

---

## 🛠️ Instalação para desenvolvedores

Use o arquivo `senior-ponto-v2.1.0-timesheet-popup.zip` se precisar inspecionar ou modificar o código.

## O que mudou nesta versão

- ✅ **Popup do Timesheet agora fecha corretamente** ao clicar "Entendi"
- ✅ **Popup simplificado** — mostra apenas a contagem de apontamentos pendentes
- ✅ **Novo sistema de agendamento inteligente**:
  - 120 minutos após o 1º ponto do dia
  - Imediatamente ao bater ponto da volta do almoço
  - 120 minutos após a volta do almoço  
  - 30 minutos antes da saída estimada
- ✅ **Só aparece se houver apontamentos pendentes sem observação**

## Como testar

1. Use a extensão normalmente durante o dia
2. O popup do Timesheet aparecerá nos momentos agendados acima
3. Clique em "Entendi" — o popup deve fechar imediatamente
4. Verifique no console do service worker (chrome://extensions → Inspecionar service worker) se há erros

## Suporte

Se encontrar algum problema, envie print do console do service worker e descreva o passo a passo.
