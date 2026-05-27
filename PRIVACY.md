# Política de Privacidade - Senior Ponto

## Propósito Único

A extensão Senior Ponto tem como **único propósito** auxiliar colaboradores CLT no controle de sua jornada de trabalho e ponto eletrônico. A extensão calcula automaticamente horários de almoço, volta e saída com base nos batimentos de ponto registrados no sistema Senior X / GestãoPonto, permitindo que o usuário acompanhe seu banco de horas e receba notificações sobre horários importantes.

## Justificativas de Permissões

### alarms
**Justificativa:** Necessária para agendar notificações automáticas que alertam o usuário sobre horários de saída, retorno do almoço e fechamento de período. Os alarmes são criados localmente no dispositivo do usuário e não enviam dados para servidores externos.

### cookies
**Justificativa:** Utilizada para ler o cookie de sessão do usuário em `platform.senior.com.br` (`com.senior.token`), permitindo que a extensão consulte a API de ponto reaproveitando o login que o usuário já fez no Senior X. A leitura é restrita a esse domínio específico. A extensão nunca armazena credenciais do usuário (senha) — apenas o token de sessão já existente, com expiração automática.

### notifications
**Justificativa:** Permite exibir notificações nativas do sistema operacional para alertar o usuário sobre horários importantes (saída para almoço, retorno, fim do expediente, fechamento de período). As notificações são geradas localmente e não envolvem comunicação externa.

### Host Permissions (domínios autorizados)
**Justificativa:** A extensão acessa apenas 4 domínios corporativos específicos do sistema de ponto eletrônico:

1. `platform.senior.com.br` — sistema Senior X, onde o usuário faz login (SSO) e onde fica a API de batimentos de ponto.
2. `gestaoponto.meta.com.br` — sistema GestãoPonto da empresa Meta, utilizado para consulta e ajuste dos batimentos.
3. `plataforma.meta.com.br` — portal corporativo Meta, de onde é acessado o módulo de banco de horas (timesheet).
4. `api.meta.com.br` — API consultada diretamente para obter o banco de horas calculado, com a sessão já autenticada do usuário.

A extensão **não utiliza `<all_urls>`** nem qualquer permissão ampla. Não há leitura, injeção de script ou monitoramento de navegação em outras páginas além desses 4 domínios.

### Código Remoto
**Justificativa:** A extensão **não utiliza código remoto**. Todo o código executado está empacotado localmente na extensão. Os únicos recursos externos acessados são:
- APIs oficiais da Senior Platform (senior.com.br) para leitura de batimentos de ponto
- APIs do sistema GestãoPonto (gestaoponto.meta.com.br) quando configurado para empresas Meta

Essas comunicações são feitas através de requisições HTTPS autenticadas com tokens obtidos via cookies do usuário.

### scripting
**Justificativa:** Permite executar scripts apenas nos próprios domínios autorizados do sistema de ponto (Senior X, GestãoPonto e plataforma Meta) para:
1. Ler o token de sessão já gerado pelo usuário ao se autenticar nessas plataformas, reaproveitando a sessão dele sem pedir login novamente.
2. Ler os batimentos de ponto exibidos na própria página do sistema, quando a API não está acessível.
3. Exibir um widget visual com os horários calculados sobre a página do sistema de ponto.

Os scripts rodam apenas nos domínios autorizados e os dados ficam armazenados localmente no dispositivo do usuário (`chrome.storage.local`). Nenhum dado é enviado a servidores externos da extensão.

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
**Justificativa:** Permite à extensão consultar e abrir abas apenas nos domínios autorizados, para:
1. Verificar se o usuário já tem o sistema Senior X ou GestãoPonto aberto antes de tentar ler os dados de ponto.
2. Abrir, quando necessário, uma aba do próprio sistema de ponto para que o usuário conclua o login (SSO) e a extensão possa reaproveitar a sessão.
3. Abrir o painel lateral (sidePanel) da extensão quando solicitado pelo usuário.

A extensão não acessa o conteúdo de abas de outras páginas.

### webRequest
**Justificativa:** Utilizada para observar os cabeçalhos de autenticação das próprias requisições que o sistema Senior X e a plataforma Meta já fazem quando o usuário está logado nesses sistemas. Isso permite reaproveitar a sessão já autenticada do usuário sem pedir login adicional na extensão.

A observação é restrita aos domínios autorizados (`host_permissions`), não envolve a leitura do corpo das requisições, e os dados nunca são enviados a servidores externos da extensão.

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

**Última atualização:** Maio de 2026
