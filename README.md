# ⚡ Termix • macOS Desktop App

Um aplicativo desktop nativo para macOS, moderno e de alta performance, para gerenciar múltiplos terminais interativos simultaneamente em uma única tela (dashboard em mosaico).

Construído com **Electron**, **node-pty** (pseudoterminais nativos do macOS) e **xterm.js**.

> 💡 **Zero Conflito de Portas:** Como é um app Desktop Electron nativo com IPC (`ipcMain` / `ipcRenderer`), **nenhuma porta de rede é utilizada** (a porta 3000 fica 100% livre para o seu Docker).

---

## 🔍 Abrir Diretamente pelo Spotlight

O **Termix** já foi empacotado e instalado em `/Applications/Termix.app`. Para abri-lo:

1. Pressione <kbd>Cmd</kbd> + <kbd>Espaço</kbd> para abrir o **Spotlight**.
2. Digite `Termix`.
3. Pressione <kbd>Enter</kbd>!

O Termix abrirá instantaneamente como qualquer outro aplicativo nativo do seu Mac.

---

## 📦 Pacotes de Distribuição Gerados

Os instaladores oficiais foram gerados na pasta [`dist/`](file:///Users/luiz/Projetos/factorivm/termix/dist):

| Arquivo | Descrição |
| :--- | :--- |
| **`Termix-1.0.0-arm64.dmg`** | Instalador no formato padrão da Apple (arraste para `/Applications`). |
| **`Termix-1.0.0-arm64-mac.zip`** | Arquivo zip portátil contendo o `Termix.app` já pronto. |
| **`dist/mac-arm64/Termix.app`** | O bundle `.app` nativo descompactado. |

---

## 🚀 Como Distribuir para Outros Macs

### 1. Enviar o Instalador
Você pode enviar o arquivo `Termix-1.0.0-arm64.dmg` para qualquer colega com Mac Apple Silicon (M1/M2/M3/M4).

### 2. Gerar para Outras Arquiteturas (Intel ou Universal)

No terminal do projeto, você tem scripts prontos para qualquer arquitetura:

```bash
# Para Macs com processador Intel (x64)
npm run dist:intel

# Para criar um binário Universal (roda nativamente em Intel E Apple Silicon no mesmo DMG)
npm run dist:universal

# Para Apple Silicon (M1/M2/M3/M4)
npm run dist:arm
```

### 3. Dica para o Primeiro Acesso em Outro Mac (Gatekeeper)

Como o app é compilado de forma autônoma sem pagar a anuidade de US$ 99 da Apple Developer Account para assinatura notarizada, o macOS pode exibir no outro computador o aviso de *"desenvolvedor não verificado"*.

Para liberar o app no outro Mac (apenas na 1ª vez):

- **Opção A (Interface Gráfica):** Clique com o **botão direito** no `Termix.app` dentro de `/Applications` -> Selecione **Abrir** -> Confirme clicando em **Abrir**.
- **Opção B (Preferências do Sistema):** Vá em *Ajustes do Sistema* -> *Privacidade e Segurança* -> Role até a seção de Segurança e clique em **"Abrir mesmo assim"**.
- **Opção C (Terminal rápido):**
  ```bash
  xattr -cr /Applications/Termix.app
  ```

---

## ⌨️ Atalhos Principais

| Atalho | Ação |
| :--- | :--- |
| <kbd>Cmd</kbd> + <kbd>T</kbd> ou <kbd>Alt</kbd> + <kbd>T</kbd> | Abrir um **Novo Terminal** |
| <kbd>Cmd</kbd> + <kbd>J</kbd> ou <kbd>Alt</kbd> + <kbd>J</kbd> | **Alternar Tema (Claro / Escuro)** |
| <kbd>Cmd</kbd> + <kbd>B</kbd> ou <kbd>Alt</kbd> + <kbd>B</kbd> | Abrir/Fechar barra de **Broadcast** |
| <kbd>Alt</kbd> + <kbd>M</kbd> | **Maximizar / Restaurar** o terminal focado |
| <kbd>Ctrl</kbd> + <kbd>L</kbd> ou Botão Amarelo | **Limpar** buffer do terminal |
| **Duplo Clique no Título** | **Renomear** o terminal |
| Botão Verde | Alternar tela cheia do bloco |
| Botão Vermelho | Fechar terminal |
