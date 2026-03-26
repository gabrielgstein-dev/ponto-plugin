# Política de Privacidade - Senior Ponto

## Propósito Único

A extensão Senior Ponto tem como **único propósito** auxiliar colaboradores CLT no controle de sua jornada de trabalho e ponto eletrônico. A extensão calcula automaticamente horários de almoço, volta e saída com base nos batimentos de ponto registrados no sistema Senior X / GestãoPonto, permitindo que o usuário acompanhe seu banco de horas e receba notificações sobre horários importantes.

## Justificativas de Permissões

### activeTab
**Justificativa:** Utilizada para acessar a aba atual do sistema Senior X ou GestãoPonto quando o usuário deseja visualizar ou interagir com os dados de ponto. A permissão permite que a extensão injete scripts de content apenas nas páginas relevantes do sistema de ponto, sem acessar outras abas.

### alarms
**Justificativa:** Necessária para agendar notificações automáticas que alertam o usuário sobre horários de saída, retorno do almoço e fechamento de período. Os alarmes são criados localmente no dispositivo do usuário e não enviam dados para servidores externos.

### cookies
**Justificativa:** Utilizada para ler cookies de autenticação das plataformas Senior X (senior.com.br) e GestãoPonto (gestaoponto.meta.com.br). Esses cookies são necessários para que a extensão possa acessar os dados de ponto do usuário de forma segura, sem armazenar credenciais.

### notifications
**Justificativa:** Permite exibir notificações nativas do sistema operacional para alertar o usuário sobre horários importantes (saída para almoço, retorno, fim do expediente, fechamento de período). As notificações são geradas localmente e não envolvem comunicação externa.

### Host Permission (`<all_urls>`)
**Justificativa:** A permissão `<all_urls>` é necessária porque:
1. A extensão precisa injetar o widget flutuante em qualquer página que o usuário esteja navegando, permitindo acesso rápido aos horários de ponto
2. O sistema Senior X pode ser acessado por diferentes subdomínios corporativos que variam por empresa
3. A extensão não coleta dados de navegação de outras páginas - apenas injeta o widget visual

### Código Remoto
**Justificativa:** A extensão **não utiliza código remoto**. Todo o código executado está empacotado localmente na extensão. Os únicos recursos externos acessados são:
- APIs oficiais da Senior Platform (senior.com.br) para leitura de batimentos de ponto
- APIs do sistema GestãoPonto (gestaoponto.meta.com.br) quando configurado para empresas Meta

Essas comunicações são feitas através de requisições HTTPS autenticadas com tokens obtidos via cookies do usuário.

### scripting
**Justificativa:** Permite injetar scripts de content nas páginas do sistema Senior X e GestãoPonto para:
1. Interceptar tokens de autenticação de forma segura
2. Realizar scraping dos batimentos de ponto exibidos na interface
3. Injetar o widget flutuante com horários calculados
Todos os scripts injetados operam apenas nos domínios autorizados e não coletam dados de outras páginas.

### sidePanel
**Justificativa:** Utilizada para fornecer uma interface lateral persistente onde o usuário pode visualizar histórico completo de batimentos, banco de horas e configurações. O sidePanel oferece uma experiência mais conveniente que o popup, permitindo manter as informações de ponto visíveis enquanto o usuário trabalha em outras abas.

### storage
**Justificativa:** Necessária para armazenar localmente:
1. Tokens de autenticação capturados (temporariamente, com expiração)
2. Cache dos últimos batimentos de ponto lidos
3. Configurações do usuário (tema, preferências de notificação)
4. Histórico de banco de horas calculado
Todos os dados são armazenados apenas no dispositivo local usando `chrome.storage.local` e nunca são sincronizados com servidores externos.

### tabs
**Justificativa:** Permite que a extensão:
1. Detecte quando o usuário está navegando nas páginas do sistema Senior X ou GestãoPonto
2. Atualize automaticamente os dados de ponto quando o usuário acessa a página de batimentos
3. Abra o sidePanel de forma programática quando solicitado pelo usuário

### webRequest
**Justificativa:** Utilizada para interceptar requisições de rede feitas pelo sistema Senior X / GestãoPonto. Isso permite capturar automaticamente tokens de autenticação (Bearer tokens) quando o usuário faz login na plataforma, eliminando a necessidade de login manual na extensão. A interceptação é feita apenas nos headers das requisições para os domínios autorizados.

## Coleta e Uso de Dados

**Dados coletados:**
- Batimentos de ponto (entrada, saída para almoço, retorno, saída) lidos do sistema Senior/GestãoPonto
- Tokens de autenticação temporários (expiram após 60 minutos)
- Configurações de preferência do usuário (tema, notificações)

**Como os dados são usados:**
- Cálculos de horários de almoço, volta e saída são realizados localmente no dispositivo
- Notificações são agendadas e exibidas localmente
- Banco de horas é calculado a partir dos batimentos históricos armazenados localmente

**Compartilhamento de dados:**
- Nenhum dado é compartilhado com terceiros
- Nenhum dado é enviado para servidores externos além das APIs oficiais da Senior Platform
- Nenhum dado é vendido ou utilizado para fins publicitários

## Segurança

- Todos os tokens de autenticação possuem expiração automática (60 minutos)
- Comunicações com APIs externas utilizam apenas HTTPS
- Dados sensíveis são armazenados usando criptografia do navegador (`chrome.storage.local`)
- A extensão não executa código remoto nem utiliza eval()/Function()

## Contato

Para questões sobre privacidade ou uso de dados, entre em contato através do repositório do projeto.

---

**Última atualização:** Março de 2026
