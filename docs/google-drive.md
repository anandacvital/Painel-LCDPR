# Importar o TXT do LCDPR direto do Google Drive

O painel tem um botão **"Importar do Google Drive"**, ao lado da área de arrastar arquivos.
Ele só aparece depois que as chaves do Google forem configuradas (passo a passo abaixo).
Enquanto isso, o painel funciona como sempre.

## Como funciona e o que muda no sigilo

1. Você clica no botão. Só então o painel carrega as bibliotecas oficiais do Google.
2. Abre a janela de login do Google. O painel pede a permissão **"ver e baixar só os arquivos
   que você abrir com este app"** (escopo `drive.file`). Ele **não** enxerga o resto do seu Drive.
3. Abre a janela do Google Drive para escolher um ou mais TXT (inclusive de Drives compartilhados).
4. Cada TXT é baixado **do Drive direto para o seu navegador** e analisado como se você tivesse
   arrastado o arquivo. Não existe servidor nosso no meio: o arquivo não passa pelo GitHub nem por
   ninguém além do próprio Google, onde ele já está guardado.
5. O acesso ao Google fica só na memória da aba: some ao fechar ou recarregar a página. O botão
   "Apagar dados deste computador" também revoga esse acesso.

**O que muda tecnicamente:** sem o Drive, a página é proibida pelo navegador de abrir qualquer
conexão de rede. Com o Drive configurado, ela passa a poder falar **só** com endereços do Google
(login, seletor de arquivos e download). Qualquer outro destino continua bloqueado.
A lista exata está em `src/config/csp.ts`.

## Passo a passo (uma vez só, cerca de 20 minutos, sem custo)

> Use a conta Google em que estão os arquivos. Se for uma conta do Grupo Paraná (Google Workspace),
> leia antes o item "Risco: administrador do Workspace" no fim desta página.

### 1. Criar o projeto no Google Cloud
1. Acesse <https://console.cloud.google.com/> com a sua conta Google e aceite os termos, se pedir.
2. No topo, clique no seletor de projetos e em **Novo projeto**. Nome: `Painel LCDPR`. Clique em **Criar**.
   Não é preciso cadastrar cartão de crédito: as APIs usadas aqui são gratuitas.
3. Com o projeto selecionado, abra o menu (☰) > **Painel** (Dashboard) ou **Configurações do projeto**
   e anote o **Número do projeto** (só dígitos, ex.: `123456789012`). Não confunda com o "ID do projeto",
   que tem letras.

### 2. Ativar as duas APIs
1. Menu > **APIs e serviços** > **Biblioteca**.
2. Pesquise **Google Drive API** e clique em **Ativar**.
3. Volte, pesquise **Google Picker API** e clique em **Ativar**.

### 3. Configurar a tela de consentimento (o que aparece no login)
1. Menu > **APIs e serviços** > **Tela de consentimento OAuth** (em alguns painéis aparece como
   **Google Auth Platform**). Clique em **Começar**.
2. Nome do app: `Painel LCDPR`. E-mail de suporte: o seu.
3. Público (Audience):
   - **Interno**, se você está usando a conta do Grupo Paraná (Workspace). Só pessoas da empresa
     conseguem usar e o Google não exige verificação. **Recomendado.**
   - **Externo**, se for uma conta Gmail pessoal. Depois de criar, vá em **Público** e adicione o seu
     e-mail (e de quem mais for usar) em **Usuários de teste**.
4. Informe o e-mail de contato, aceite a política e clique em **Criar**.
5. Em **Acesso a dados** (Data Access) > **Adicionar ou remover escopos**, marque
   `.../auth/drive.file` ("Ver, editar, criar e excluir apenas os arquivos do Google Drive que você
   usa com este app") e salve. O painel só lê; o nome do escopo é do Google.

### 4. Criar o ID do cliente (o "login")
1. Menu > **APIs e serviços** > **Credenciais** > **Criar credenciais** > **ID do cliente OAuth**
   (ou, na Google Auth Platform, **Clientes** > **Criar cliente**).
2. Tipo de aplicativo: **Aplicativo da Web**. Nome: `Painel LCDPR`.
3. Em **Origens JavaScript autorizadas**, clique em **Adicionar URI** e cole exatamente:
   `https://anandacvital.github.io` (sem barra no fim e sem `/Painel-LCDPR`).
4. Deixe **URIs de redirecionamento** em branco. Clique em **Criar**.
5. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).

### 5. Criar a chave de API (o "seletor de arquivos")
1. **Credenciais** > **Criar credenciais** > **Chave de API**. Copie a chave (começa com `AIza`).
2. Clique em **Editar chave** (ou no nome dela) e restrinja:
   - **Restrições de aplicativo**: **Sites (referenciadores HTTP)** > adicionar
     `https://anandacvital.github.io/*`.
   - **Restrições de API**: **Restringir chave** > marque só **Google Picker API**.
3. Clique em **Salvar**. A restrição pode levar alguns minutos para valer.

### 6. Guardar as três chaves no GitHub
1. Abra <https://github.com/anandacvital/Painel-LCDPR/settings/variables/actions>
   (Settings > Secrets and variables > Actions > aba **Variables**).
2. Clique em **New repository variable** três vezes, com estes nomes exatos:

   | Nome | Valor |
   |---|---|
   | `GOOGLE_CLIENT_ID` | o ID do cliente do passo 4 |
   | `GOOGLE_API_KEY` | a chave de API do passo 5 |
   | `GOOGLE_NUMERO_PROJETO` | o número do projeto do passo 1 |

3. Abra a aba **Actions** do repositório > **Deploy GitHub Pages** > **Run workflow** > **Run workflow**.
   Em uns 2 minutos o site é publicado de novo, já com o botão.

> Por que "Variables" e não "Secrets"? Essas chaves **não são senhas**: o Google foi feito para que elas
> fiquem visíveis no código de sites como este. O que impede o uso por terceiros são as restrições dos
> passos 4 e 5 (só funcionam a partir de `anandacvital.github.io`) e o fato de cada pessoa só ver os
> próprios arquivos, depois de fazer login.

Se alguma chave estiver faltando ou no formato errado, a publicação **falha de propósito** e o log da
Actions diz qual é o problema (melhor do que um botão que não funciona). O site anterior continua no ar.

### 7. Testar
1. Abra <https://anandacvital.github.io/Painel-LCDPR/> e recarregue com **Ctrl+Shift+R**.
2. Clique em **Importar do Google Drive**, faça login, autorize e escolha um TXT.
3. Se o navegador bloquear a janela de login, permita pop-ups para o site e clique de novo.
4. Na conta "Externo" em teste, o Google mostra "O Google não verificou este app": clique em
   **Continuar**. É esperado, porque o app é seu e não foi publicado para o público.

## Risco: administrador do Workspace

Se a conta for do Google Workspace do Grupo Paraná, o administrador pode ter bloqueado apps de
terceiros. Sinais: mensagem "Acesso bloqueado: o administrador não aprovou este app" ou "Erro 400:
admin_policy_enforced". Como resolver: o administrador abre o **Admin Console** > **Segurança** >
**Acesso e controle de dados** > **Controles de API** > **Gerenciar acesso de apps de terceiros** >
**Configurar novo app**, cola o **ID do cliente** do passo 4 e marca o app como **Confiável**.
Criar o projeto com público **Interno** dentro da própria organização costuma evitar o bloqueio.

## Para quem mantém o código

- Chaves: `src/config/google.ts` (leitura e conferência), `vite.config.ts` (falha o build se estiver pela
  metade) e `.github/workflows/deploy.yml` (passa as Variables para o build).
- Política de rede: `src/config/csp.ts`. Sem chaves, a CSP é idêntica à anterior (`connect-src 'none'`),
  coberto por teste.
- Login, seletor e download: `src/drive/googleDrive.ts` e `src/drive/download.ts`.
- Testar no computador: crie `.env.local` (bloqueado pelo .gitignore) com `VITE_GOOGLE_CLIENT_ID`,
  `VITE_GOOGLE_API_KEY` e `VITE_GOOGLE_NUMERO_PROJETO`, e adicione `http://localhost:5173` às origens
  autorizadas (passo 4) e `http://localhost:5173/*` aos referenciadores da chave (passo 5).
