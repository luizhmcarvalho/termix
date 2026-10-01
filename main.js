/**
 * Termix - Desktop Electron Application (macOS)
 * Processo Principal: Gerenciamento de Janelas e Processos Pseudoterminais (node-pty)
 */

// Executa verificação e correção de permissões no macOS para o spawn-helper
require('./fix-permissions');

const path = require('path');
const os = require('os');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, Menu, clipboard, dialog } = require('electron');
const pty = require('node-pty');
const DatabaseManager = require('./services/db');
const AIService = require('./services/ai');

// Identificação da plataforma
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

// Garante que o ambiente macOS e Linux carregue o PATH completo do usuário
function fixUserPath() {
  if (isWin) {
    return; // No Windows o PATH já é gerenciado pelo sistema operacional
  }

  const defaultPaths = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), '.cargo', 'bin'),
    path.join(os.homedir(), 'bin'),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ];

  try {
    const loginShell = process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash');
    const userPath = require('child_process')
      .execFileSync(loginShell, ['-ilc', 'echo -n "$PATH"'], {
        encoding: 'utf8',
        timeout: 3000,
        env: { ...process.env, HOME: os.homedir() }
      })
      .trim();

    if (userPath) {
      const merged = Array.from(new Set([...userPath.split(':'), ...defaultPaths, ...(process.env.PATH || '').split(':')]))
        .filter(Boolean)
        .join(':');
      process.env.PATH = merged;
      return;
    }
  } catch (_) {}

  const current = (process.env.PATH || '').split(':');
  const merged = Array.from(new Set([...defaultPaths, ...current]))
    .filter(Boolean)
    .join(':');
  process.env.PATH = merged;
}

fixUserPath();

// Configurações do shell por plataforma (PowerShell/CMD no Windows, zsh no Mac, bash no Linux)
const DEFAULT_SHELL = isWin
  ? (process.env.COMSPEC || 'powershell.exe')
  : (process.env.SHELL || (isMac ? '/bin/zsh' : '/bin/bash'));
const DEFAULT_CWD = process.env.HOME || (isWin ? process.env.USERPROFILE : null) || process.cwd();

// Instância do banco de dados SQLite local
let dbInstance = null;
function getDatabase() {
  if (!dbInstance) {
    const storageDir = path.join(app.getPath('userData'));
    dbInstance = new DatabaseManager(storageDir);
  }
  return dbInstance;
}

// Instância do serviço de Inteligência Artificial
let aiInstance = null;
function getAIService() {
  if (!aiInstance) {
    aiInstance = new AIService(getDatabase());
  }
  return aiInstance;
}

// Armazenamento das instâncias ativas: Map<terminalId, { id, ptyProcess, title, createdAt }>
const terminals = new Map();

let mainWindow = null;

function createWindow() {
  const windowOptions = {
    width: 1280,
    height: 840,
    minWidth: 700,
    minHeight: 450,
    backgroundColor: '#0a0b10',
    title: 'Termix',
    show: false, // Evita flash visual antes de carregar
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  };

  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 14, y: 14 };
    if (app.dock) {
      const iconPath = path.join(__dirname, 'build', 'icon.png');
      if (fs.existsSync(iconPath)) {
        app.dock.setIcon(iconPath);
      }
    }
  } else if (isWin) {
    // No Windows, titleBarOverlay oferece visual moderno integrado com botões nativos
    windowOptions.titleBarStyle = 'hidden';
    windowOptions.titleBarOverlay = {
      color: '#0a0b10',
      symbolColor: '#94a3b8',
      height: 42
    };
    windowOptions.icon = path.join(__dirname, 'build', 'icon.ico');
  } else {
    // Linux: define ícone da janela
    windowOptions.icon = path.join(__dirname, 'build', 'icon.png');
  }

  mainWindow = new BrowserWindow(windowOptions);

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
      applicationVersion: '1.6.0',
      version: '1.6.0',
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
      label: 'Arquivo',
      submenu: [
        {
          label: 'Exportar Configurações e Credenciais...',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:open-backup', 'export');
            }
          }
        },
        {
          label: 'Importar Configurações e Credenciais...',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:open-backup', 'import');
            }
          }
        },
        { type: 'separator' },
        { role: isMac ? 'close' : 'quit', label: isMac ? 'Fechar Janela' : 'Sair' }
      ]
    },
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
          label: 'Assistente de IA (Copilot)',
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:open-ai-copilot');
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
      label: 'Idioma',
      submenu: [
        {
          label: '🇧🇷 Português (Brasil)',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:set-language', 'pt');
            }
          }
        },
        {
          label: '🇺🇸 English',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:set-language', 'en');
            }
          }
        },
        {
          label: '🇪🇸 Español',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:set-language', 'es');
            }
          }
        }
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
    args = [],
    cwd = DEFAULT_CWD,
    title = 'Terminal',
    startupCommand = null
  } = options;

  try {
    let targetCwd = cwd;
    if (typeof targetCwd === 'string' && targetCwd.startsWith('~')) {
      targetCwd = path.join(os.homedir(), targetCwd.slice(1));
    }
    if (!targetCwd || !fs.existsSync(targetCwd)) {
      targetCwd = DEFAULT_CWD;
    }

    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    };

    if (!isWin) {
      env.LANG = process.env.LANG || 'en_US.UTF-8';
      env.LC_ALL = process.env.LC_ALL || 'en_US.UTF-8';
    }

    const shellArgs = (args && args.length > 0)
      ? args
      : (isWin
          ? []
          : (shell === DEFAULT_SHELL || shell.endsWith('/zsh') || shell.endsWith('/bash') || shell.endsWith('/sh') ? ['-l'] : []));

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: Math.max(10, parseInt(cols, 10) || 80),
      rows: Math.max(5, parseInt(rows, 10) || 24),
      cwd: targetCwd,
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

    // Executa comando de inicialização configurado para o Host, se houver
    if (startupCommand && typeof startupCommand === 'string' && startupCommand.trim()) {
      setTimeout(() => {
        try {
          const cmd = startupCommand.trim();
          ptyProcess.write(cmd.endsWith('\r') ? cmd : cmd + '\r');
        } catch (e) {
          console.warn('[Termix] Falha ao enviar comando de inicialização:', e.message);
        }
      }, 400);
    }

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
 * Conecta a um Host configurado (SSH ou Local) com diretório padrão e comando de inicialização
 */
function connectHostSession(hostId, options = {}) {
  const db = getDatabase();
  const host = db.getHost(hostId, true);
  if (!host) {
    throw new Error(`Host com ID ${hostId} não encontrado.`);
  }

  const { cols = 80, rows = 24 } = options;
  const id = options.termId || options.terminalId || `term-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  if (host.host_type === 'local') {
    return createTerminalSession({
      id,
      cols,
      rows,
      title: host.name,
      cwd: host.default_path || DEFAULT_CWD,
      startupCommand: host.startup_command
    });
  }

  // Conexão SSH
  const identity = host.identity;
  const sshArgs = [];

  if (host.port && parseInt(host.port, 10) !== 22) {
    sshArgs.push('-p', String(host.port));
  }

  let resolvedKeyPath = null;
  if (identity) {
    if (identity.auth_type === 'certificate' || identity.certificate) {
      resolvedKeyPath = db.ensureCertificateFile(identity);
    } else if (identity.key_path) {
      let keyPath = identity.key_path.trim();
      if (keyPath.startsWith('~')) {
        keyPath = path.join(os.homedir(), keyPath.slice(1));
      }
      if (fs.existsSync(keyPath)) {
        resolvedKeyPath = keyPath;
      }
    }
  }

  if (resolvedKeyPath) {
    sshArgs.push('-i', resolvedKeyPath);
    // Evita testar outras chaves do ssh-agent que causariam 'Too many authentication failures'
    sshArgs.push('-o', 'IdentitiesOnly=yes');
  }

  // Parâmetros de estabilidade e persistência de conexão SSH (Keep-Alive):
  // - ServerAliveInterval=15 e ServerAliveCountMax=3: envia pacotes de pulso (heartbeat) a cada 15 segundos,
  //   mantendo a conexão aberta e impedindo que firewalls, NATs, roteadores e VCNs (Oracle Cloud / AWS)
  //   encerrem a conexão silenciosamente por inatividade.
  // - TCPKeepAlive=yes: mantém keepalive na camada de transporte TCP.
  // - StrictHostKeyChecking=accept-new: aceita chaves novas sem abortar o terminal.
  // - ConnectTimeout=15: evita travamentos longos caso o host esteja inacessível.
  sshArgs.push(
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-o', 'TCPKeepAlive=yes',
    '-o', 'ConnectTimeout=15',
    '-o', 'StrictHostKeyChecking=accept-new'
  );

  const userPrefix = identity && identity.username ? `${identity.username}@` : '';
  const target = `${userPrefix}${host.hostname}`;

  // Força alocação de pseudoterminal no servidor remoto (-t) para suporte interativo total
  sshArgs.push('-t');

  // Se houver default_path ou startup_command remoto
  if (host.default_path || host.startup_command) {
    const cdPart = host.default_path ? `if cd "${host.default_path.replace(/"/g, '\\"')}" 2>/dev/null; then :; fi; ` : '';
    const cmdPart = host.startup_command ? `${host.startup_command}; ` : '';
    // Garante inicialização interativa e login (-l -i) sem suprimir stderr (onde o readline/bash renderiza o prompt/path)
    const remoteCommand = `${cdPart}${cmdPart}exec "\${SHELL:-bash}" -l -i || exec sh -i`;
    sshArgs.push(target, remoteCommand);
  } else {
    sshArgs.push(target);
  }

  return createTerminalSession({
    id,
    cols,
    rows,
    shell: '/usr/bin/ssh',
    args: sshArgs,
    title: `${host.name} (SSH)`,
    cwd: DEFAULT_CWD
  });
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

// IPC: Gerenciador de Hosts (SQLite)
ipcMain.handle('db:hosts:list', () => {
  return getDatabase().getHosts();
});

ipcMain.handle('db:hosts:get', (event, id) => {
  return getDatabase().getHost(id);
});

ipcMain.handle('db:hosts:save', (event, data) => {
  return getDatabase().saveHost(data);
});

ipcMain.handle('db:hosts:delete', (event, id) => {
  return getDatabase().deleteHost(id);
});

ipcMain.handle('db:hosts:connect', (event, options = {}) => {
  try {
    const hostId = options.id || options.hostId;
    connectHostSession(hostId, options);
    return { success: true };
  } catch (err) {
    console.error('[Termix Electron] Erro ao conectar host:', err);
    return { success: false, error: err.message };
  }
});

// IPC: Gerenciador de Identidades (SQLite com Criptografia)
ipcMain.handle('db:identities:list', () => {
  return getDatabase().getIdentities();
});

ipcMain.handle('db:identities:get', (event, id) => {
  return getDatabase().getIdentity(id, true);
});

ipcMain.handle('db:identities:save', (event, data) => {
  return getDatabase().saveIdentity(data);
});

ipcMain.handle('db:identities:delete', (event, id) => {
  return getDatabase().deleteIdentity(id);
});

// IPC: Gerenciador de Workspaces (Conjuntos de Terminais)
ipcMain.handle('db:workspaces:list', () => {
  return getDatabase().getWorkspaces();
});

ipcMain.handle('db:workspaces:get', (event, id) => {
  return getDatabase().getWorkspace(id);
});

ipcMain.handle('db:workspaces:save', (event, data) => {
  return getDatabase().saveWorkspace(data);
});

ipcMain.handle('db:workspaces:delete', (event, id) => {
  return getDatabase().deleteWorkspace(id);
});

// IPC: Motor de Inteligência Artificial (Google Gemini, OpenAI, Ollama, Anthropic)
ipcMain.handle('ai:config:get', () => {
  return getDatabase().getAIConfig(false);
});

ipcMain.handle('ai:config:save', (event, data) => {
  return getDatabase().saveAIConfig(data);
});

ipcMain.handle('ai:config:test', async (event, data) => {
  try {
    return await getAIService().testConnection(data);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('ai:command:generate', async (event, args) => {
  try {
    return await getAIService().generateCommand(args);
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('ai:error:diagnose', async (event, args) => {
  try {
    return await getAIService().diagnoseError(args);
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('ai:command:explain', async (event, args) => {
  try {
    return await getAIService().explainCommand(args);
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('ai:broadcast:summarize', async (event, args) => {
  try {
    return await getAIService().summarizeBroadcast(args);
  } catch (err) {
    return { error: err.message };
  }
});

// IPC: Configurações Gerais do Sistema & Idioma
ipcMain.handle('db:settings:get', (event, key) => {
  return getDatabase().getSetting(key);
});

ipcMain.handle('db:settings:save', (event, { key, value }) => {
  return getDatabase().saveSetting(key, value);
});

// IPC: Exportação e Importação de Configurações e Credenciais
ipcMain.handle('db:config:export', (event, options = {}) => {
  try {
    return getDatabase().exportData(options);
  } catch (err) {
    console.error('[Termix Electron] Erro ao exportar dados:', err);
    throw err;
  }
});

ipcMain.handle('db:config:import', (event, { payload, options = {} }) => {
  try {
    return getDatabase().importData(payload, options);
  } catch (err) {
    console.error('[Termix Electron] Erro ao importar dados:', err);
    throw err;
  }
});

ipcMain.handle('db:config:preview', (event, { payload, password }) => {
  try {
    return getDatabase().previewImport(payload, password);
  } catch (err) {
    console.error('[Termix Electron] Erro ao pré-visualizar backup:', err);
    throw err;
  }
});

// IPC: Diálogos Nativos do Sistema Operacional para Salvar e Abrir Arquivos de Backup
ipcMain.handle('dialog:save-export-file', async (event, { content, defaultFilename }) => {
  try {
    const defaultPath = path.join(app.getPath('downloads'), defaultFilename || 'termix-backup.termix');
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar Configurações e Credenciais do Termix',
      defaultPath,
      filters: [
        { name: 'Termix Backup (*.termix)', extensions: ['termix'] },
        { name: 'JSON Backup (*.json)', extensions: ['json'] },
        { name: 'Todos os Arquivos', extensions: ['*'] }
      ]
    });

    if (!canceled && filePath) {
      const fileData = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      fs.writeFileSync(filePath, fileData, 'utf8');
      return { success: true, filePath, fileName: path.basename(filePath) };
    }
    return { canceled: true };
  } catch (err) {
    console.error('[Termix Electron] Erro no diálogo de salvar arquivo:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('dialog:open-import-file', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Selecionar Arquivo de Backup do Termix',
      properties: ['openFile'],
      filters: [
        { name: 'Arquivos Termix & JSON (*.termix, *.json)', extensions: ['termix', 'json'] },
        { name: 'Todos os Arquivos', extensions: ['*'] }
      ]
    });

    if (!canceled && filePaths && filePaths.length > 0) {
      const targetPath = filePaths[0];
      const rawContent = fs.readFileSync(targetPath, 'utf8');
      const stats = fs.statSync(targetPath);
      return {
        success: true,
        fileName: path.basename(targetPath),
        filePath: targetPath,
        sizeBytes: stats.size,
        content: rawContent
      };
    }
    return { canceled: true };
  } catch (err) {
    console.error('[Termix Electron] Erro no diálogo de abrir arquivo:', err);
    return { success: false, error: err.message };
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
