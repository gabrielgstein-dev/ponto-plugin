# Como publicar a extensão Senior Ponto nas lojas

## Pacotes para submissão

- `senior-ponto-v2.1.0-chrome-store.zip` (112 KB) - Chrome Web Store
- `senior-ponto-v2.1.0-firefox-addons.zip` (112 KB) - Firefox Add-ons

## Chrome Web Store

1. Acesse: https://chrome.google.com/webstore/developer/dashboard
2. Faça login com sua conta Google
3. Clique em "Adicionar novo item"
4. Faça upload do arquivo `senior-ponto-v2.1.0-chrome-store.zip`
5. Preencha as informações:
   - **Nome**: Senior Ponto — Calculadora de Horários
   - **Descrição**: Calcula automaticamente seus horários de almoço e saída com base nos batimentos do ponto.
   - **Categoria**: Produtividade
   - **Idioma**: Português (Brasil)
6. Envie para revisão (geralmente leva alguns dias)

## Firefox Add-ons

1. Acesse: https://addons.mozilla.org/pt-BR/developers/
2. Faça login com sua conta Mozilla
3. Clique "Enviar um novo complemento"
4. Faça upload do arquivo `senior-ponto-v2.1.0-firefox-addons.zip`
5. Preencha as informações (mesmos dados do Chrome)
6. Envie para revisão

## Após aprovação

Usuários poderão instalar diretamente:
- **Chrome**: Pesquisar "Senior Ponto" na Chrome Web Store
- **Firefox**: Pesquisar "Senior Ponto" nos Add-ons do Firefox
- **Instalação com 1 clique**, sem modo desenvolvedor

## Alternativa: Distribuição interna

Se precisar distribuir internamente sem publicar nas lojas:

1. **Enterprise Policy** (Chrome/Edge):
   - Configure via GPO/registry para empresas
   - Instalação silenciosa em todos os funcionários

2. **Side-loading** (Windows):
   - Converta para .crx/.xpi
   - Distribua via scripts de instalação

3. **Página interna**:
   - Hospede os arquivos em seu servidor
   - Crie página de instalação com instruções específicas

## Recomendação

**Publicar nas lojas oficiais** é a melhor opção:
- ✅ Instalação com 1 clique
- ✅ Atualizações automáticas  
- ✅ Maior confiança dos usuários
- ✅ Verificação de segurança pelo Google/Mozilla
