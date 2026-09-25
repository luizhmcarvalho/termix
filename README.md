# ⚡ Termix

<p align="center">
  <strong>Multi-Terminal Dashboard Desktop App para macOS</strong><br>
  Gerenciamento simultâneo de múltiplos pseudoterminais nativos em mosaico com máxima performance e zero conflito de portas.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS%20(Apple%20Silicon%20%7C%20Intel)-000000?style=flat-square&logo=apple&logoColor=white" alt="Platform macOS" />
  <img src="https://img.shields.io/badge/Electron-44.4.5-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Terminal-xterm.js%205.5-blue?style=flat-square" alt="xterm.js" />
  <img src="https://img.shields.io/badge/PTY-node--pty%201.1-68a063?style=flat-square&logo=node.js&logoColor=white" alt="node-pty" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License MIT" />
</p>

---

## 📖 Visão Geral

O **Termix** é um aplicativo desktop nativo para macOS projetado para desenvolvedores, engenheiros DevOps e administradores de sistemas que necessitam monitorar e operar dezenas de sessões interativas de shell simultaneamente. 

Diferente de alternativas baseadas puramente em navegadores web locais que prendem portas de rede (como `3000` ou `8080`), o Termix foi arquitetado como uma aplicação **Electron Nativa**. Toda a comunicação entre o frontend e os pseudoterminais reais do sistema operacional ocorre via **IPC assíncrono de alta velocidade (`ipcMain` / `ipcRenderer`)**, garantindo latência zero, consumo eficiente de memória e portas de rede 100% livres para seus containers Docker e microsserviços.

---

## ✨ Principais Funcionalidades

- **⚡ Pseudoterminais Reais (node-pty):** Criação de instâncias nativas do seu shell padrão (`/bin/zsh`, `bash`, `fish`) com suporte total a PTY, cores ANSI 256/Truecolor e interatividade com programas como `htop`, `vim`, `ssh` e `docker`.
- **🗂️ Workspaces & Sessões Salvas (Novo!):**
  - Salve o conjunto atual de terminais abertos (ex: 4 terminais com diretórios específicos, comandos de inicialização, títulos e hosts SSH conectados) como um **Workspace** reutilizável.
  - Botão rápido **"Salvar Sessão Atual"** para capturar tudo o que está em execução no momento.
  - Ao clicar em **"Abrir Workspace"** (<kbd>⌥</kbd> + <kbd>W</kbd>), o Termix restaura todos os terminais do grupo, reconecta aos respectivos hosts/diretórios e reaplica o layout configurado.
- **🌐 Gerenciador de Hosts e Identidades (Estilo Termius):**
  - Cadastro organizado de **Hosts SSH remotos** e **Sessões Locais**.
  - **Diretório Padrão (*Default Path*):** Abertura automática da sessão navegando diretamente para a pasta do seu projeto ou repositório.
  - **Comando de Inicialização (*Startup Command*):** Execução automática de comandos no momento da conexão (ex: `docker compose ps`, `git status`, `tail -f logs`).
  - **Identidades & Credenciais Criptografadas:** Senhas e chaves privadas SSH salvas localmente em banco **SQLite (`~/.termix/termix.db`)** protegidas com criptografia autenticada de nível militar **AES-256-GCM**.
  - Tags coloridas e categorização rápida para servidores de Produção, Staging e Desenvolvimento.
- **🖥️ Layouts Dinâmicos em Mosaico:** Alterne instantaneamente entre visualização em mosaico automático (*Auto Grid*), 1 Coluna (Foco), 2 Colunas lado a lado ou 3 Colunas.
- **📡 Broadcast de Comandos Sincronizado:** Transmita o mesmo comando simultaneamente para todas as instâncias ativas com um único clique ou atalho de teclado (<kbd>⌘</kbd> + <kbd>B</kbd>).
- **📋 Suporte Completo à Área de Transferência do macOS:**
  - <kbd>⌘</kbd> + <kbd>C</kbd> para copiar seleção ativa (sem sobrescrever a área de transferência caso nada esteja selecionado).
  - <kbd>⌘</kbd> + <kbd>V</kbd> para colar instantaneamente no terminal ativo.
  - <kbd>⌘</kbd> + <kbd>A</kbd> para selecionar todo o buffer do terminal.
  - <kbd>⌘</kbd> + <kbd>K</kbd> para limpar o terminal (comportamento padrão do macOS / iTerm2).
  - Menu de contexto nativo via botão direito (Copiar, Colar, Selecionar Tudo).
- **🎨 Design System Elegante & Temas:** Interface inspirada nos padrões de design do macOS (traffic lights nativos, glassmorphism e tipografia técnica com `JetBrains Mono`). Suporte a alternância rápida de temas Claro e Escuro (<kbd>⌘</kbd> + <kbd>J</kbd> ou <kbd>⌥</kbd> + <kbd>J</kbd>).
- **🔍 Maximização Individual de Bloco:** Aumente o foco em qualquer terminal específico (<kbd>⌥</kbd> + <kbd>M</kbd>) e retorne ao mosaico sem perder o estado da sessão.
- **✏️ Títulos Customizáveis:** Dê duplo-clique no cabeçalho de qualquer terminal para renomeá-lo de acordo com o serviço ou host conectado.

---

## 🏛️ Arquitetura do Sistema

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        TERMIX DESKTOP APP                              │
├────────────────────────────────┬───────────────────────────────────────┤
│    PROCESSO PRINCIPAL (MAIN)   │           INTERFACE (RENDERER)        │
│                                │                                       │
│  • Electron Lifecycle          │  • Single Page Application (Vanilla)  │
│  • NSMenu & Context Menu       │  • xterm.js (FitAddon + WebLinks)     │
│  • Gerenciador PTY (node-pty)  │  • Grid Responsivo de Terminais       │
│  • macOS System Clipboard API  │  • Barra de Transmissão (Broadcast)   │
│                                │  • Seletor de Temas (Dark / Light)    │
└───────────────▲────────────────┴──────────────────▲────────────────────┘
                │                                   │
                └─────────── IPC Bridge ────────────┘
                         (preload.js com
                      contextIsolation: true)
```

---

## 🚀 Instalação e Execução

### 1. Executando pelo Spotlight (App Instalado)

O Termix já vem instalado no diretório de aplicações do seu Mac. Para iniciar:

1. Pressione <kbd>Cmd</kbd> + <kbd>Espaço</kbd> para abrir o **Spotlight**.
2. Digite `Termix`.
3. Pressione <kbd>Enter</kbd>.

### 2. Desenvolvimento Local

Para clonar e rodar o projeto em modo de desenvolvimento local:

```bash
# Clone o repositório
git clone https://github.com/luizhmcarvalho/termix.git
cd termix

# Instale as dependências e compile o node-pty para a versão do Electron
npm install

# Inicie o Termix em modo desenvolvimento
npm start
```

### 3. Modo Web (Opcional)

Se desejar executar o Termix através de um navegador web via WebSocket:

```bash
npm run web
# Acesse http://localhost:3333 no seu navegador
```

---

## 📦 Gerando Pacotes de Distribuição

O Termix utiliza o `electron-builder` para criar instaladores e bundles `.app` otimizados para macOS.

```bash
# Para arquitetura Apple Silicon (M1 / M2 / M3 / M4)
npm run dist:arm

# Para processadores Intel (x64)
npm run dist:intel

# Pacote Universal (executa nativamente em Intel e Apple Silicon)
npm run dist:universal
```

Os artefatos gerados são salvos no diretório `dist/`:
- **`Termix-1.1.0-arm64.dmg`**: Imagem de disco padrão para instalação fácil (arraste para `/Applications`).
- **`Termix-1.1.0-arm64-mac.zip`**: Pacote comprimido portátil.
- **`dist/mac-arm64/Termix.app`**: Binário da aplicação pronto para execução direta.

> **Nota sobre o macOS Gatekeeper:**  
> Caso distribua o arquivo DMG para outro Mac sem certificado corporativo pago da Apple, basta remover o atributo de quarentena na primeira execução:
> ```bash
> xattr -cr /Applications/Termix.app
> ```

---

## ⌨️ Atalhos de Teclado

| Atalho | Descrição |
| :--- | :--- |
| <kbd>⌘</kbd> + <kbd>C</kbd> | **Copiar** o texto selecionado no terminal ou campo de entrada |
| <kbd>⌘</kbd> + <kbd>V</kbd> | **Colar** o conteúdo da área de transferência |
| <kbd>⌘</kbd> + <kbd>A</kbd> | **Selecionar tudo** no buffer do terminal ativo |
| <kbd>⌘</kbd> + <kbd>K</kbd> ou <kbd>⌃</kbd> + <kbd>L</kbd> | **Limpar** o buffer de saída do terminal |
| <kbd>⌘</kbd> + <kbd>T</kbd> ou <kbd>⌥</kbd> + <kbd>T</kbd> | Abrir uma nova sessão de terminal |
| <kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>W</kbd> ou <kbd>⌥</kbd> + <kbd>W</kbd> | Abrir o **Gerenciador de Workspaces** (Sessões Salvas) |
| <kbd>⌘</kbd> + <kbd>⇧</kbd> + <kbd>H</kbd> ou <kbd>⌥</kbd> + <kbd>H</kbd> | Abrir o **Gerenciador de Hosts e Identidades** |
| <kbd>⌘</kbd> + <kbd>B</kbd> ou <kbd>⌥</kbd> + <kbd>B</kbd> | Abrir ou fechar a barra de comando **Broadcast** |
| <kbd>⌘</kbd> + <kbd>J</kbd> ou <kbd>⌥</kbd> + <kbd>J</kbd> | Alternar entre tema **Claro** e **Escuro** |
| <kbd>⌥</kbd> + <kbd>M</kbd> | **Maximizar / Restaurar** o tamanho do terminal focado |
| **Botão Direito** | Abrir o menu de contexto nativo (Copiar, Colar, Selecionar Tudo) |
| **Duplo Clique no Cabeçalho** | Habilitar edição inline para **renomear** o terminal |
| **Botão Amarelo** (Traffic Light) | Limpar saída do terminal |
| **Botão Verde** (Traffic Light) | Alternar foco/maximização do card |
| **Botão Vermelho** (Traffic Light) | Encerrar e fechar o processo PTY daquele terminal |

---

## 🛠️ Stack Tecnológica

| Componente | Tecnologia | Função |
| :--- | :--- | :--- |
| **Runtime Desktop** | [Electron](https://www.electronjs.org/) | Container desktop nativo com integração profunda ao macOS |
| **Engine PTY** | [node-pty](https://github.com/microsoft/node-pty) | Forks reais de pseudoterminais integrados ao shell do sistema |
| **Banco de Dados Local** | `node:sqlite` (SQLite Sync) | Persistência ultra-rápida e nativa de hosts e identidades salvas |
| **Segurança & Criptografia** | `node:crypto` (AES-256-GCM) | Criptografia autenticada local para senhas e passphrases SSH |
| **Terminal Frontend** | [xterm.js](https://xtermjs.org/) | Renderizador de emulação de terminal de alto desempenho |
| **Addons xterm** | `@xterm/addon-fit`, `@xterm/addon-web-links` | Ajuste dinâmico de viewport e links clicáveis |
| **Empacotamento** | [electron-builder](https://www.electron.build/) | Geração de instaladores `.dmg` e `.app` para macOS |

---

## 👤 Autor

Desenvolvido por **Luiz Carvalho**  
GitHub: [@luizhmcarvalho](https://github.com/luizhmcarvalho)  
Email: [luizhmcarvalho@gmail.com](mailto:luizhmcarvalho@gmail.com)

---

## 📄 Licença

Este projeto está licenciado sob a **Licença MIT** — consulte o arquivo [LICENSE](file:///Users/luiz/Projetos/factorivm/termix/LICENSE) para obter mais informações.
