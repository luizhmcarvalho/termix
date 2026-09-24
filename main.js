/**
 * Termix - Desktop Electron Application (macOS)
 * Processo Principal: Gerenciamento de Janelas e Processos Pseudoterminais (node-pty)
 */

// Executa verificação e correção de permissões no macOS para o spawn-helper
require('./fix-permissions');

const path = require('path');
const os = require('os');
const { app, BrowserWindow, ipcMain, Menu, clipboard } = require('electron');
const pty = require('node-pty');

// Configurações do shell no macOS
const DEFAULT_SHELL = process.env.SHELL || '/bin/zsh';
const DEFAULT_CWD = process.env.HOME || process.cwd();

// Armazenamento das instâncias ativas: Map<terminalId, { id, ptyProcess, title, createdAt }>
const terminals = new Map();

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 700,
    minHeight: 450,
    backgroundColor: '#0a0b10',
    title: 'Termix',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    show: false, // Evita flash visual antes de carregar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Habilita menu de contexto nativo com botão direito (Copiar, Colar, Selecionar Tudo)
  mainWindow.webContents.on('context-menu', () => {
    const contextMenuTemplate = [
      { role: 'undo', label: 'Desfazer' },
      { role: 'redo', label: 'Refazer' },
      { type: 'separator' },
      { role: 'cut', label: 'Recortar' },
      { role: 'copy', label: 'Copiar' },
      { role: 'paste', label: 'Colar' },
      { role: 'pasteAndMatchStyle', label: 'Colar com o Mesmo Estilo' },
      { role: 'delete', label: 'Excluir' },
      { type: 'separator' },
      { role: 'selectAll', label: 'Selecionar Tudo' }
    ];
    const contextMenu = Menu.buildFromTemplate(contextMenuTemplate);
    contextMenu.popup();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    cleanupAllTerminals();
  });

  setupMenu();
}

/**
 * Cria o menu nativo da aplicação no macOS
 */
function setupMenu() {
  const isMac = process.platform === 'darwin';

  if (isMac) {
    app.setAboutPanelOptions({
      applicationName: 'Termix',
      applicationVersion: '1.0.0',
      version: '1.0.0',
      copyright: 'Copyright © 2026 Luiz Carvalho',
      authors: ['Luiz Carvalho'],
      credits: 'Desenvolvido por Luiz Carvalho\nLicença: MIT'
    });
  }

  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            {
              label: 'Sobre o Termix',
              click: () => {
                app.showAboutPanel();
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('menu:show-about');
                }
              }
            },
            { type: 'separator' },
            { role: 'services', label: 'Serviços' },
            { type: 'separator' },
            { role: 'hide', label: 'Ocultar Termix' },
            { role: 'hideOthers', label: 'Ocultar Outros' },
            { role: 'unhide', label: 'Mostrar Tudo' },
            { type: 'separator' },
            { role: 'quit', label: 'Encerrar Termix' }
          ]
        }]
      : []),
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'pasteAndMatchStyle', label: 'Colar com o Mesmo Estilo' },
        { role: 'delete', label: 'Excluir' },
        { type: 'separator' },
        { role: 'selectAll', label: 'Selecionar Tudo' }
      ]
    },
    {
      label: 'Terminal',
      submenu: [
        {
          label: 'Novo Terminal',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:new-terminal');
            }
          }
        },
        {
          label: 'Transmitir Comando (Broadcast)',
          accelerator: 'CmdOrCtrl+B',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:toggle-broadcast');
            }
          }
        },
        {
          label: 'Limpar Terminal',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:clear-terminal');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Fechar Janela',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        }
      ]
    },
    {
      label: 'Exibir',
      submenu: [
        {
          label: 'Alternar Tema Claro / Escuro',
          accelerator: 'CmdOrCtrl+J',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:toggle-theme');
            }
          }
        },
        { type: 'separator' },
        { role: 'reload', label: 'Recarregar' },
        { role: 'forceReload', label: 'Forçar Recarregamento' },
        { role: 'toggleDevTools', label: 'Ferramentas do Desenvolvedor' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamanho Real' },
        { role: 'zoomIn', label: 'Aumentar Zoom' },
        { role: 'zoomOut', label: 'Diminuir Zoom' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela Cheia' }
      ]
    },
    {
      label: 'Janela',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'zoom', label: 'Zoom' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front', label: 'Trazer Todas para Frente' }
            ]
          : [])
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre o Termix',
          click: () => {
            if (isMac) {
              app.showAboutPanel();
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:show-about');
            }
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Cria uma nova sessão pseudoterminal real (node-pty)
 */
function createTerminalSession(options = {}) {
  const {
    id = `term-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    cols = 80,
    rows = 24,
    shell = DEFAULT_SHELL,
    cwd = DEFAULT_CWD,
    title = 'Terminal'
  } = options;

  try {
    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: process.env.LANG || 'en_US.UTF-8',
      LC_ALL: process.env.LC_ALL || 'en_US.UTF-8'
    };

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: Math.max(10, parseInt(cols, 10) || 80),
      rows: Math.max(5, parseInt(rows, 10) || 24),
      cwd,
      env
    });

    const session = {
      id,
      ptyProcess,
      title: `${title} (${path.basename(shell)})`,
      createdAt: new Date()
    };

    terminals.set(id, session);
    console.log(`[Termix Electron] Terminal [${id}] iniciado - PID: ${ptyProcess.pid}`);

    // Envia saída do terminal para a UI via IPC
    ptyProcess.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:output', { id, data });
      }
    });

    // Envia evento de encerramento
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[Termix Electron] Terminal [${id}] finalizado - Código: ${exitCode}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', { id, exitCode, signal });
      }
      terminals.delete(id);
    });

    // Notifica a UI da criação com sucesso
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:created', {
        id,
        pid: ptyProcess.pid,
        shell: path.basename(shell),
        title: session.title
      });
    }

    return session;
  } catch (error) {
    console.error(`[Termix Electron] Erro ao iniciar terminal [${id}]:`, error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal:error', {
        id,
        message: `Falha ao iniciar terminal nativo: ${error.message}`
      });
    }
    return null;
  }
}

/**
 * Fecha e encerra um terminal específico
 */
function closeTerminalSession(id) {
  const session = terminals.get(id);
  if (session) {
    try {
      session.ptyProcess.kill();
    } catch (e) {
      console.warn(`[Termix Electron] Erro ao encerrar processo [${id}]:`, e.message);
    }
    terminals.delete(id);
    console.log(`[Termix Electron] Terminal removido: [${id}]`);
  }
}

/**
 * Encerra todas as sessões para evitar processos zumbis
 */
function cleanupAllTerminals() {
  for (const [id, session] of terminals) {
    try {
      session.ptyProcess.kill();
    } catch (_) {}
  }
  terminals.clear();
}

// Configuração dos canais IPC
ipcMain.on('terminal:create', (event, options) => {
  createTerminalSession(options);
});

ipcMain.on('terminal:input', (event, { id, data }) => {
  const session = terminals.get(id);
  if (session && typeof data === 'string') {
    session.ptyProcess.write(data);
  }
});

ipcMain.on('terminal:resize', (event, { id, cols, rows }) => {
  const session = terminals.get(id);
  if (session && cols && rows) {
    session.ptyProcess.resize(Math.max(10, parseInt(cols, 10)), Math.max(5, parseInt(rows, 10)));
  }
});

ipcMain.on('terminal:close', (event, { id }) => {
  closeTerminalSession(id);
});

ipcMain.on('terminal:broadcast', (event, { data }) => {
  if (typeof data === 'string') {
    for (const [, session] of terminals) {
      try {
        session.ptyProcess.write(data);
      } catch (err) {
        console.error(`[Termix Electron] Erro no broadcast [${session.id}]:`, err);
      }
    }
  }
});

ipcMain.handle('system:info', () => {
  return {
    platform: process.platform,
    arch: process.arch,
    defaultShell: path.basename(DEFAULT_SHELL),
    hostname: os.hostname(),
    activeCount: terminals.size
  };
});

// Acesso seguro e direto à área de transferência do macOS
ipcMain.handle('clipboard:read', async () => {
  try {
    return await Promise.resolve(clipboard.readText());
  } catch (err) {
    console.error('[Termix Electron] Erro ao ler clipboard:', err);
    return '';
  }
});

ipcMain.on('clipboard:write', (event, text) => {
  if (typeof text === 'string') {
    clipboard.writeText(text);
  }
});

// Ciclo de vida do Electron
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  cleanupAllTerminals();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  cleanupAllTerminals();
});
