/**
 * Termix - Single Page Application Client
 * Compatível com Electron Nativo (IPC de alta velocidade, sem portas) e Navegador Web (WebSocket)
 */

const XTERM_THEMES = {
  dark: {
    background: '#0b0d14',
    foreground: '#e2e8f0',
    cursor: '#38bdf8',
    cursorAccent: '#0b0d14',
    selectionBackground: 'rgba(56, 189, 248, 0.25)',
    black: '#151928',
    red: '#f43f5e',
    green: '#10b981',
    yellow: '#f59e0b',
    blue: '#3b82f6',
    magenta: '#d946ef',
    cyan: '#06b6d4',
    white: '#cbd5e1',
    brightBlack: '#475569',
    brightRed: '#fb7185',
    brightGreen: '#34d399',
    brightYellow: '#fbbf24',
    brightBlue: '#60a5fa',
    brightMagenta: '#e879f9',
    brightCyan: '#22d3ee',
    brightWhite: '#ffffff'
  },
  light: {
    background: '#ffffff',
    foreground: '#0f172a',
    cursor: '#2563eb',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(37, 99, 235, 0.2)',
    black: '#0f172a',
    red: '#e11d48',
    green: '#059669',
    yellow: '#d97706',
    blue: '#2563eb',
    magenta: '#c026d3',
    cyan: '#0284c7',
    white: '#64748b',
    brightBlack: '#334155',
    brightRed: '#f43f5e',
    brightGreen: '#10b981',
    brightYellow: '#f59e0b',
    brightBlue: '#3b82f6',
    brightMagenta: '#d946ef',
    brightCyan: '#06b6d4',
    brightWhite: '#020617'
  }
};

class TermixDashboard {
  constructor() {
    this.terminals = new Map(); // id -> TerminalInstance
    this.activeTerminalId = null;
    this.currentLayout = 'auto';
    this.terminalCounter = 1;
    this.isElectron = typeof window.termix !== 'undefined' && window.termix.isElectron;
    this.currentTheme = localStorage.getItem('termix_theme') || 'dark';

    // Elementos DOM principais
    this.gridEl = document.getElementById('terminals-grid');
    this.emptyStateEl = document.getElementById('empty-state');
    this.footerCountEl = document.getElementById('footer-term-count');
    this.wsStatusEl = document.getElementById('ws-status');
    this.systemInfoEl = document.getElementById('system-info-text');
    this.broadcastBarEl = document.getElementById('broadcast-bar');
    this.broadcastInputEl = document.getElementById('broadcast-input');
    this.broadcastCountEl = document.getElementById('broadcast-count');
    this.helpModalEl = document.getElementById('help-modal');

    // Modais e Estado de Backup & Idioma
    this.backupModalEl = document.getElementById('backup-modal');
    this.languageDropdownMenuEl = document.getElementById('language-dropdown-menu');
    this.languageDropdownBtnEl = document.getElementById('btn-language-dropdown');
    this.currentImportFile = null;

    // Modais e Estado de Hosts & Identidades (Estilo Termius)
    this.hostsModalEl = document.getElementById('hosts-modal');
    this.hostFormModalEl = document.getElementById('host-form-modal');
    this.identityFormModalEl = document.getElementById('identity-form-modal');
    this.savedHosts = [];
    this.savedIdentities = [];
    this.hostsFilterType = 'all';
    this.hostsSearchQuery = '';
    this.hostsSelectedTag = 'all';
    this.hostsGroupMode = 'tag';
    this.collapsedTagGroups = new Set();
    this.activeHostsTab = 'hosts';

    // Modais e Estado de Workspaces (Conjuntos de Terminais Salvos)
    this.workspacesModalEl = document.getElementById('workspaces-modal');
    this.workspaceFormModalEl = document.getElementById('workspace-form-modal');
    this.savedWorkspaces = [];
    this.workspacesSearchQuery = '';

    // Inicializa o tema visual
    this.applyTheme(this.currentTheme);

    if (this.isElectron) {
      document.body.classList.add('electron-app');
      const platform = (window.termix && window.termix.platform) || 'darwin';
      document.body.classList.add(`platform-${platform}`);
      this.initElectronBridge();
    } else {
      this.initWebSocket();
    }

    this.initI18n();
    this.initGlobalEvents();
    this.initHostsManager();
    this.initWorkspacesManager();
    this.initAIManager();
    this.initBackupManager();
  }

  /**
   * Comunicação Nativa IPC do Electron (Sem portas TCP/HTTP, sem conflito com Docker)
   */
  initElectronBridge() {
    console.log('[Termix] Modo Electron Nativo Ativado');
    this.updateStatusBadge('connected', 'Electron Nativo');

    // Carrega informações do sistema
    window.termix.getSystemInfo().then(info => {
      if (info && info.platform) {
        document.body.classList.remove('platform-darwin', 'platform-win32', 'platform-linux');
        document.body.classList.add(`platform-${info.platform}`);
      }
      if (this.systemInfoEl) {
        this.systemInfoEl.textContent = `${info.platform} (${info.defaultShell}) • ${info.hostname}`;
      }
    });

    // Registra listeners de saída do terminal
    window.termix.onCreated((msg) => {
      let instance = this.terminals.get(msg.id);
      if (!instance) {
        instance = new TerminalInstance(this, msg.id, msg.title || 'Terminal');
        this.terminals.set(msg.id, instance);
        this.updateGridState();
        this.setActiveTerminal(msg.id);
      }
      instance.handleCreated(msg);
    });

    window.termix.onOutput((msg) => {
      const instance = this.terminals.get(msg.id);
      if (instance && msg.data) {
        instance.term.write(msg.data);
      }
    });

    window.termix.onExit((msg) => {
      const instance = this.terminals.get(msg.id);
      if (instance) instance.handleExit(msg.exitCode);
    });

    window.termix.onError((msg) => {
      const instance = this.terminals.get(msg.id);
      if (instance) {
        instance.term.writeln(`\r\n\x1b[31m[Erro]: ${msg.message}\x1b[0m\r\n`);
      }
    });

    if (window.termix.onToggleTheme) {
      window.termix.onToggleTheme(() => this.toggleTheme());
    }

    if (window.termix.onNewTerminal) {
      window.termix.onNewTerminal(() => this.createNewTerminal());
    }

    if (window.termix.onToggleBroadcast) {
      window.termix.onToggleBroadcast(() => {
        const isHidden = this.broadcastBarEl.classList.toggle('hidden');
        if (!isHidden) {
          this.broadcastInputEl.focus();
        }
      });
    }

    if (window.termix.onClearTerminal) {
      window.termix.onClearTerminal(() => {
        if (this.activeTerminalId) {
          const inst = this.terminals.get(this.activeTerminalId);
          if (inst && inst.term) {
            inst.term.clear();
            inst.focus();
          }
        }
      });
    }

    if (window.termix.onShowAbout) {
      window.termix.onShowAbout(() => {
        this.helpModalEl.classList.remove('hidden');
      });
    }

    if (window.termix.onOpenAICopilot) {
      window.termix.onOpenAICopilot(() => {
        this.openAICopilot();
      });
    }

    if (window.termix.onOpenBackup) {
      window.termix.onOpenBackup((initialTab) => {
        this.openBackupModal(initialTab || 'export');
      });
    }

    if (window.termix.onSetLanguage) {
      window.termix.onSetLanguage((lang) => {
        this.changeLanguage(lang);
      });
    }

    // Abre o primeiro terminal automaticamente
    setTimeout(() => {
      if (this.terminals.size === 0) {
        this.createNewTerminal();
      }
    }, 100);
  }

  /**
   * Modo Web: Conecta ao servidor WebSocket caso rode em navegador tradicional
   */
  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    this.updateStatusBadge('connecting', 'Conectando...');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.updateStatusBadge('connected', 'Conectado');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        if (this.terminals.size === 0) {
          this.createNewTerminal();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleServerMessage(message);
        } catch (err) {
          console.error('[Termix] Erro ao interpretar WebSocket:', err);
        }
      };

      this.ws.onclose = () => {
        this.updateStatusBadge('disconnected', 'Desconectado');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.updateStatusBadge('disconnected', 'Erro Socket');
      };
    } catch (err) {
      this.updateStatusBadge('disconnected', 'Desconectado');
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (!this.reconnectTimer && !this.isElectron) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.initWebSocket();
      }, 3000);
    }
  }

  updateStatusBadge(status, label) {
    if (!this.wsStatusEl) return;
    this.wsStatusEl.className = 'status-badge';

    if (status === 'connected') {
      this.wsStatusEl.classList.add('badge-connected');
      this.wsStatusEl.textContent = label || 'Conectado';
    } else if (status === 'connecting') {
      this.wsStatusEl.classList.add('badge-connecting');
      this.wsStatusEl.textContent = label || 'Conectando...';
    } else {
      this.wsStatusEl.classList.add('badge-disconnected');
      this.wsStatusEl.textContent = label || 'Desconectado';
    }
  }

  handleServerMessage(msg) {
    const { action, id } = msg;
    switch (action) {
      case 'system_info':
        if (this.systemInfoEl) {
          this.systemInfoEl.textContent = `${msg.platform} (${msg.defaultShell}) • ${msg.hostname}`;
        }
        break;
      case 'created':
        {
          let instance = this.terminals.get(id);
          if (!instance) {
            instance = new TerminalInstance(this, id, msg.title || 'Terminal');
            this.terminals.set(id, instance);
            this.updateGridState();
            this.setActiveTerminal(id);
          }
          instance.handleCreated(msg);
        }
        break;
      case 'output':
        {
          const instance = this.terminals.get(id);
          if (instance && msg.data) instance.term.write(msg.data);
        }
        break;
      case 'exit':
        {
          const instance = this.terminals.get(id);
          if (instance) instance.handleExit(msg.exitCode);
        }
        break;
      case 'error':
        {
          const instance = this.terminals.get(id);
          if (instance) {
            instance.term.writeln(`\r\n\x1b[31m[Erro]: ${msg.message}\x1b[0m\r\n`);
          }
        }
        break;
    }
  }

  /**
   * Cria uma nova instância de terminal
   */
  createNewTerminal(titlePrefix) {
    const id = `term-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const termNumber = this.terminalCounter++;
    const defaultTitle = titlePrefix || `Terminal #${termNumber}`;

    const instance = new TerminalInstance(this, id, defaultTitle);
    this.terminals.set(id, instance);

    this.updateGridState();
    this.setActiveTerminal(id);

    const payload = {
      id,
      title: defaultTitle,
      cols: instance.term.cols || 80,
      rows: instance.term.rows || 24
    };

    if (this.isElectron) {
      window.termix.createTerminal(payload);
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'create', ...payload }));
    }

    return instance;
  }

  /**
   * Remove uma instância de terminal
   */
  removeTerminal(id) {
    const instance = this.terminals.get(id);
    if (!instance) return;

    if (this.isElectron) {
      window.termix.closeTerminal(id);
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'close', id }));
    }

    instance.destroy();
    this.terminals.delete(id);

    if (this.activeTerminalId === id) {
      const remainingIds = Array.from(this.terminals.keys());
      this.activeTerminalId = remainingIds.length > 0 ? remainingIds[remainingIds.length - 1] : null;
      if (this.activeTerminalId) {
        const nextActive = this.terminals.get(this.activeTerminalId);
        if (nextActive) nextActive.focus();
      }
    }

    this.updateGridState();
  }

  setActiveTerminal(id) {
    this.activeTerminalId = id;
    for (const [tId, inst] of this.terminals) {
      if (tId === id) {
        inst.cardEl.classList.add('active-terminal');
      } else {
        inst.cardEl.classList.remove('active-terminal');
      }
    }
  }

  updateGridState() {
    const count = this.terminals.size;
    this.gridEl.setAttribute('data-count', count.toString());

    if (this.footerCountEl) {
      this.footerCountEl.textContent = count.toString();
    }
    if (this.broadcastCountEl) {
      this.broadcastCountEl.textContent = count.toString();
    }

    if (count === 0) {
      this.emptyStateEl.classList.remove('hidden');
    } else {
      this.emptyStateEl.classList.add('hidden');
    }

    this.fitAll();
  }

  fitAll() {
    requestAnimationFrame(() => {
      for (const inst of this.terminals.values()) {
        inst.fit();
      }
    });
  }

  setLayout(layout) {
    this.currentLayout = layout;
    this.gridEl.setAttribute('data-layout', layout);

    document.querySelectorAll('.btn-layout').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-layout') === layout);
    });

    // Atualiza o botão dropdown de layout
    const labelEl = document.getElementById('active-layout-label');
    const iconEl = document.getElementById('active-layout-icon');
    const dropdownMenu = document.getElementById('layout-dropdown-menu');
    const dropdownBtn = document.getElementById('btn-layout-dropdown');

    const layoutLabels = {
      'auto': window.t ? window.t('layout_auto') : 'Auto',
      '1col': window.t ? window.t('layout_1col') : '1 Col',
      '2col': window.t ? window.t('layout_2col') : '2 Col',
      '3col': window.t ? window.t('layout_3col') : '3 Col'
    };

    const layoutIcons = {
      'auto': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>`,
      '1col': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="4" y="4" width="16" height="16" rx="2"></rect>
              </svg>`,
      '2col': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="8" height="16" rx="1"></rect>
                <rect x="13" y="4" width="8" height="16" rx="1"></rect>
              </svg>`,
      '3col': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="4" width="5" height="16" rx="1"></rect>
                <rect x="9.5" y="4" width="5" height="16" rx="1"></rect>
                <rect x="17" y="4" width="5" height="16" rx="1"></rect>
              </svg>`
    };

    if (labelEl && layoutLabels[layout]) {
      labelEl.textContent = layoutLabels[layout];
    }
    if (iconEl && layoutIcons[layout]) {
      iconEl.innerHTML = layoutIcons[layout];
    }
    if (dropdownMenu) {
      dropdownMenu.classList.add('hidden');
    }
    if (dropdownBtn) {
      dropdownBtn.setAttribute('aria-expanded', 'false');
    }

    this.fitAll();
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme);
  }

  applyTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('termix_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);

    const sunIcon = document.getElementById('icon-theme-sun');
    const moonIcon = document.getElementById('icon-theme-moon');
    if (sunIcon && moonIcon) {
      if (theme === 'light') {
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
      } else {
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
      }
    }

    const xtermTheme = XTERM_THEMES[theme] || XTERM_THEMES.dark;
    for (const inst of this.terminals.values()) {
      if (inst.term) {
        inst.term.options.theme = xtermTheme;
      }
    }
  }

  sendBroadcast(command) {
    if (!command || !command.trim()) return;
    const dataToSend = command.endsWith('\r') ? command : command + '\r';

    if (this.isElectron) {
      window.termix.sendBroadcast(dataToSend);
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'broadcast', data: dataToSend }));
    }
  }

  sendInput(id, data) {
    if (this.isElectron) {
      window.termix.sendInput(id, data);
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'input', id, data }));
    }
  }

  sendResize(id, cols, rows) {
    if (this.isElectron) {
      window.termix.resizeTerminal(id, cols, rows);
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'resize', id, cols, rows }));
    }
  }

  initGlobalEvents() {
    // Botão "+ Novo Terminal"
    document.getElementById('btn-new-terminal')?.addEventListener('click', () => this.createNewTerminal());

    // Botões do Empty State
    document.getElementById('btn-start-single')?.addEventListener('click', () => {
      this.createNewTerminal();
    });
    document.getElementById('btn-start-pair')?.addEventListener('click', () => {
      this.createNewTerminal('Terminal A');
      setTimeout(() => this.createNewTerminal('Terminal B'), 100);
    });
    document.getElementById('btn-start-quad')?.addEventListener('click', () => {
      for (let i = 1; i <= 4; i++) {
        setTimeout(() => this.createNewTerminal(`Terminal ${i}`), i * 80);
      }
    });

    // Toggle do dropdown de Layout
    const btnLayoutDropdown = document.getElementById('btn-layout-dropdown');
    const layoutDropdownMenu = document.getElementById('layout-dropdown-menu');

    btnLayoutDropdown?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = layoutDropdownMenu?.classList.toggle('hidden');
      btnLayoutDropdown.setAttribute('aria-expanded', (!isHidden).toString());
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#layout-dropdown-container')) {
        layoutDropdownMenu?.classList.add('hidden');
        btnLayoutDropdown?.setAttribute('aria-expanded', 'false');
      }
    });

    // Seletor de layout
    document.querySelectorAll('.btn-layout').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const layout = e.currentTarget.getAttribute('data-layout');
        this.setLayout(layout);
      });
    });

    // Broadcast bar
    const btnToggleBroadcast = document.getElementById('btn-toggle-broadcast');
    const btnCloseBroadcast = document.getElementById('btn-close-broadcast');
    const btnSendBroadcast = document.getElementById('btn-send-broadcast');

    btnToggleBroadcast?.addEventListener('click', () => {
      const isHidden = this.broadcastBarEl.classList.toggle('hidden');
      if (!isHidden) {
        this.broadcastInputEl.focus();
      }
    });

    btnCloseBroadcast?.addEventListener('click', () => {
      this.broadcastBarEl.classList.add('hidden');
    });

    const executeBroadcast = () => {
      const val = this.broadcastInputEl.value;
      if (val) {
        this.sendBroadcast(val);
        this.broadcastInputEl.value = '';
      }
    };

    btnSendBroadcast?.addEventListener('click', executeBroadcast);
    this.broadcastInputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        executeBroadcast();
      } else if (e.key === 'Escape') {
        this.broadcastBarEl.classList.add('hidden');
      }
    });

    // Alternar Tema (Claro / Escuro)
    document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
      this.toggleTheme();
    });

    // Modal de Ajuda
    const btnHelp = document.getElementById('btn-help');
    const btnCloseModal = document.getElementById('btn-modal-close');
    btnHelp?.addEventListener('click', () => this.helpModalEl.classList.remove('hidden'));
    btnCloseModal?.addEventListener('click', () => this.helpModalEl.classList.add('hidden'));
    this.helpModalEl?.addEventListener('click', (e) => {
      if (e.target === this.helpModalEl) {
        this.helpModalEl.classList.add('hidden');
      }
    });

    // Dropdown de Idiomas (Pt, En, Es)
    this.languageDropdownBtnEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = this.languageDropdownMenuEl?.classList.toggle('hidden');
      this.languageDropdownBtnEl.setAttribute('aria-expanded', !isHidden ? 'true' : 'false');
    });

    document.querySelectorAll('.language-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const lang = item.getAttribute('data-lang');
        if (lang) {
          this.changeLanguage(lang);
        }
      });
    });

    window.addEventListener('click', (e) => {
      if (this.languageDropdownMenuEl && !this.languageDropdownMenuEl.contains(e.target) && e.target !== this.languageDropdownBtnEl && !this.languageDropdownBtnEl?.contains(e.target)) {
        this.languageDropdownMenuEl.classList.add('hidden');
        this.languageDropdownBtnEl?.setAttribute('aria-expanded', 'false');
      }
    });

    // Atalhos Globais de Teclado
    window.addEventListener('keydown', (e) => {
      if ((e.altKey && e.code === 'KeyT') || (e.metaKey && e.shiftKey && e.code === 'KeyT') || (e.ctrlKey && e.shiftKey && e.code === 'KeyT')) {
        e.preventDefault();
        this.createNewTerminal();
      }

      if (e.altKey && e.code === 'KeyB') {
        e.preventDefault();
        this.broadcastBarEl.classList.toggle('hidden');
        if (!this.broadcastBarEl.classList.contains('hidden')) {
          this.broadcastInputEl.focus();
        }
      }

      if (e.altKey && e.code === 'KeyM') {
        e.preventDefault();
        if (this.activeTerminalId) {
          const inst = this.terminals.get(this.activeTerminalId);
          if (inst) inst.toggleMaximize();
        }
      }

      // Alt + J: Alternar tema
      if (e.altKey && e.code === 'KeyJ') {
        e.preventDefault();
        this.toggleTheme();
      }

      // Alt + H ou Cmd + Shift + H: Gerenciador de Hosts
      if ((e.altKey && e.code === 'KeyH') || (e.metaKey && e.shiftKey && e.code === 'KeyH')) {
        e.preventDefault();
        this.openHostsModal();
      }

      // Alt + W ou Cmd + Shift + W: Gerenciador de Workspaces
      if ((e.altKey && e.code === 'KeyW') || (e.metaKey && e.shiftKey && e.code === 'KeyW')) {
        e.preventDefault();
        this.openWorkspacesModal();
      }

      // Alt + E ou Cmd + Shift + E: Exportar e Importar Configurações (Backup)
      if ((e.altKey && e.code === 'KeyE') || (e.metaKey && e.shiftKey && e.code === 'KeyE') || (e.ctrlKey && e.shiftKey && e.code === 'KeyE')) {
        e.preventDefault();
        this.openBackupModal('export');
      }

      // Cmd + Shift + I ou Ctrl + Shift + I: Importar Configurações (Restauração)
      if (((e.metaKey && e.shiftKey && e.code === 'KeyI') || (e.ctrlKey && e.shiftKey && e.code === 'KeyI')) && !e.altKey) {
        e.preventDefault();
        this.openBackupModal('import');
      }

      // Cmd + I ou Alt + I: Termix Copilot (Assistente de IA)
      if ((e.altKey && e.code === 'KeyI') || (e.metaKey && !e.shiftKey && e.code === 'KeyI') || (e.ctrlKey && !e.shiftKey && e.code === 'KeyI')) {
        e.preventDefault();
        this.openAICopilot();
      }

      if (e.key === 'Escape') {
        layoutDropdownMenu?.classList.add('hidden');
        btnLayoutDropdown?.setAttribute('aria-expanded', 'false');
        this.languageDropdownMenuEl?.classList.add('hidden');
        this.languageDropdownBtnEl?.setAttribute('aria-expanded', 'false');
        this.helpModalEl?.classList.add('hidden');
        this.broadcastBarEl?.classList.add('hidden');
        this.hostFormModalEl?.classList.add('hidden');
        this.identityFormModalEl?.classList.add('hidden');
        this.hostsModalEl?.classList.add('hidden');
        this.workspaceFormModalEl?.classList.add('hidden');
        this.workspacesModalEl?.classList.add('hidden');
        this.backupModalEl?.classList.add('hidden');
        this.aiCopilotModalEl?.classList.add('hidden');
        this.aiDiagnosisModalEl?.classList.add('hidden');
        this.aiBroadcastModalEl?.classList.add('hidden');
        this.aiSettingsModalEl?.classList.add('hidden');
      }
    });

    // Auto fit ao redimensionar a janela do navegador
    let resizeDebounce = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => this.fitAll(), 100);
    });
  }

  /**
   * Inicializa eventos e integração do Gerenciador de Hosts & Identidades
   */
  initHostsManager() {
    // Botões para abrir modal de hosts
    document.getElementById('btn-open-hosts')?.addEventListener('click', () => this.openHostsModal('hosts'));
    document.getElementById('btn-start-host')?.addEventListener('click', () => this.openHostsModal('hosts'));

    // Botão fechar modal de hosts
    document.getElementById('btn-close-hosts-modal')?.addEventListener('click', () => this.closeHostsModal());
    this.hostsModalEl?.addEventListener('click', (e) => {
      if (e.target === this.hostsModalEl) this.closeHostsModal();
    });

    // Abas do modal (Hosts / Identidades)
    document.querySelectorAll('.hosts-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        this.switchHostsTab(tab);
      });
    });

    // Busca e Filtros de Hosts
    document.getElementById('hosts-search-input')?.addEventListener('input', (e) => {
      this.hostsSearchQuery = e.target.value;
      this.renderHostsList();
    });

    document.getElementById('hosts-filter-type')?.addEventListener('change', (e) => {
      this.hostsFilterType = e.target.value;
      this.renderHostsList();
    });

    document.getElementById('hosts-group-mode')?.addEventListener('change', (e) => {
      this.hostsGroupMode = e.target.value;
      this.renderHostsList();
    });

    // Formulário de Host: Abertura e Fechamento
    document.getElementById('btn-add-host')?.addEventListener('click', () => this.openHostForm());
    document.getElementById('btn-close-host-form')?.addEventListener('click', () => this.closeHostForm());
    document.getElementById('btn-cancel-host-form')?.addEventListener('click', () => this.closeHostForm());
    this.hostFormModalEl?.addEventListener('click', (e) => {
      if (e.target === this.hostFormModalEl) this.closeHostForm();
    });

    // Alternar campos SSH / Local no formulário de host
    document.getElementById('host-input-type')?.addEventListener('change', (e) => {
      const sshFields = document.getElementById('host-ssh-fields');
      if (sshFields) {
        sshFields.style.display = e.target.value === 'local' ? 'none' : 'block';
      }
    });

    // Link rápido para criar identidade no formulário de host
    document.getElementById('link-create-identity-quick')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openIdentityForm();
    });

    // Submit formulário de Host
    document.getElementById('form-host')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const id = document.getElementById('host-input-id')?.value || undefined;
        const name = document.getElementById('host-input-name')?.value?.trim();
        const host_type = document.getElementById('host-input-type')?.value;
        const color = document.getElementById('host-input-color')?.value;
        const hostname = document.getElementById('host-input-hostname')?.value?.trim();
        const port = parseInt(document.getElementById('host-input-port')?.value, 10) || 22;
        const identity_id = document.getElementById('host-input-identity')?.value || null;
        const default_path = document.getElementById('host-input-path')?.value?.trim() || null;
        const startup_command = document.getElementById('host-input-command')?.value?.trim() || null;
        const tagsStr = document.getElementById('host-input-tags')?.value || '';
        const tags = tagsStr.split(',').map(s => s.trim()).filter(Boolean);

        if (!name) return;

        const payload = {
          id,
          name,
          host_type,
          color,
          hostname,
          port,
          identity_id,
          default_path,
          startup_command,
          tags
        };

        await this.apiSaveHost(payload);
        this.closeHostForm();
        await this.refreshHostsAndIdentities();
      } catch (err) {
        alert('Erro ao salvar host: ' + err.message);
      }
    });

    // Formulário de Identidade: Abertura e Fechamento
    document.getElementById('btn-add-identity')?.addEventListener('click', () => this.openIdentityForm());
    document.getElementById('btn-close-identity-form')?.addEventListener('click', () => this.closeIdentityForm());
    document.getElementById('btn-cancel-identity-form')?.addEventListener('click', () => this.closeIdentityForm());
    this.identityFormModalEl?.addEventListener('click', (e) => {
      if (e.target === this.identityFormModalEl) this.closeIdentityForm();
    });

    // Alternar campos no formulário de identidade conforme o tipo de auth
    document.getElementById('identity-input-auth-type')?.addEventListener('change', (e) => {
      const type = e.target.value;
      const passGroup = document.getElementById('identity-password-field');
      const keyGroup = document.getElementById('identity-key-fields');
      const certGroup = document.getElementById('identity-cert-fields');
      if (passGroup) passGroup.classList.toggle('hidden', type !== 'password');
      if (keyGroup) keyGroup.classList.toggle('hidden', type !== 'key');
      if (certGroup) certGroup.classList.toggle('hidden', type !== 'certificate');
    });

    // Submit formulário de Identidade
    document.getElementById('form-identity')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const id = document.getElementById('identity-input-id')?.value || undefined;
        const name = document.getElementById('identity-input-name')?.value?.trim();
        const username = document.getElementById('identity-input-username')?.value?.trim();
        const auth_type = document.getElementById('identity-input-auth-type')?.value;
        const password = document.getElementById('identity-input-password')?.value;
        const key_path = document.getElementById('identity-input-key-path')?.value?.trim() || null;
        const passphrase = auth_type === 'certificate'
          ? document.getElementById('identity-input-cert-passphrase')?.value
          : document.getElementById('identity-input-passphrase')?.value;
        const certificate = document.getElementById('identity-input-certificate')?.value?.trim() || null;

        if (!name || !username) return;

        const payload = {
          id,
          name,
          username,
          auth_type,
          password: password || undefined,
          key_path,
          passphrase: passphrase || undefined,
          certificate: certificate || undefined
        };

        await this.apiSaveIdentity(payload);
        this.closeIdentityForm();
        await this.refreshHostsAndIdentities();

        // Se o modal de host estiver aberto, atualiza o seletor de identidades
        this.populateIdentitySelect();
      } catch (err) {
        alert('Erro ao salvar identidade: ' + err.message);
      }
    });
  }

  // --- Helpers de API (Eletron Nativo com fallback REST Web) ---
  async apiGetHosts() {
    try {
      if (this.isElectron && window.termix?.hosts) {
        return await window.termix.hosts.list();
      }
      const res = await fetch('/api/hosts');
      return await res.json();
    } catch (err) {
      console.error('[Termix] Falha ao listar hosts:', err);
      return [];
    }
  }

  async apiGetHost(id) {
    try {
      if (this.isElectron && window.termix?.hosts) {
        return await window.termix.hosts.get(id);
      }
      const res = await fetch(`/api/hosts/${id}`);
      return await res.json();
    } catch (err) {
      console.error('[Termix] Falha ao obter host:', err);
      return null;
    }
  }

  async apiSaveHost(data) {
    if (this.isElectron && window.termix?.hosts) {
      return await window.termix.hosts.save(data);
    }
    const res = await fetch('/api/hosts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  }

  async apiDeleteHost(id) {
    if (this.isElectron && window.termix?.hosts) {
      return await window.termix.hosts.delete(id);
    }
    const res = await fetch(`/api/hosts/${id}`, { method: 'DELETE' });
    return await res.json();
  }

  async apiGetIdentities() {
    try {
      if (this.isElectron && window.termix?.identities) {
        return await window.termix.identities.list();
      }
      const res = await fetch('/api/identities');
      return await res.json();
    } catch (err) {
      console.error('[Termix] Falha ao listar identidades:', err);
      return [];
    }
  }

  async apiGetIdentity(id) {
    try {
      if (this.isElectron && window.termix?.identities) {
        return await window.termix.identities.get(id);
      }
      const res = await fetch(`/api/identities/${id}`);
      return await res.json();
    } catch (err) {
      console.error('[Termix] Falha ao obter identidade:', err);
      return null;
    }
  }

  async apiSaveIdentity(data) {
    if (this.isElectron && window.termix?.identities) {
      return await window.termix.identities.save(data);
    }
    const res = await fetch('/api/identities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  }

  async apiDeleteIdentity(id) {
    if (this.isElectron && window.termix?.identities) {
      return await window.termix.identities.delete(id);
    }
    const res = await fetch(`/api/identities/${id}`, { method: 'DELETE' });
    return await res.json();
  }

  // --- Controle de UI do Gerenciador de Hosts ---
  async openHostsModal(tab = 'hosts') {
    this.switchHostsTab(tab);
    await this.refreshHostsAndIdentities();
    this.hostsModalEl?.classList.remove('hidden');
    document.getElementById('hosts-search-input')?.focus();
  }

  closeHostsModal() {
    this.hostsModalEl?.classList.add('hidden');
  }

  switchHostsTab(tab) {
    this.activeHostsTab = tab;
    document.querySelectorAll('.hosts-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });

    const hostsPane = document.getElementById('tab-content-hosts');
    const identitiesPane = document.getElementById('tab-content-identities');
    if (tab === 'hosts') {
      hostsPane?.classList.add('active');
      identitiesPane?.classList.remove('active');
    } else {
      hostsPane?.classList.remove('active');
      identitiesPane?.classList.add('active');
    }
  }

  async refreshHostsAndIdentities() {
    const [hosts, identities] = await Promise.all([
      this.apiGetHosts(),
      this.apiGetIdentities()
    ]);

    this.savedHosts = hosts || [];
    this.savedIdentities = identities || [];

    const hostsBadge = document.getElementById('hosts-count-badge');
    if (hostsBadge) hostsBadge.textContent = this.savedHosts.length.toString();

    const identitiesBadge = document.getElementById('identities-count-badge');
    if (identitiesBadge) identitiesBadge.textContent = this.savedIdentities.length.toString();

    this.renderHostsList();
    this.renderIdentitiesList();
  }

  renderTagChipsBar() {
    const chipsBar = document.getElementById('hosts-tag-chips-bar');
    if (!chipsBar) return;
    chipsBar.innerHTML = '';

    const hosts = this.savedHosts || [];
    if (hosts.length === 0) {
      chipsBar.style.display = 'none';
      return;
    }
    chipsBar.style.display = 'flex';

    // Calcula contagem de cada tag
    const tagCounts = new Map();
    let untaggedCount = 0;

    hosts.forEach(h => {
      const tags = Array.isArray(h.tags) ? h.tags.filter(Boolean) : [];
      if (tags.length === 0) {
        untaggedCount++;
      } else {
        tags.forEach(t => {
          const norm = String(t).trim();
          if (norm) {
            tagCounts.set(norm, (tagCounts.get(norm) || 0) + 1);
          }
        });
      }
    });

    // Chip "Todas"
    const allChip = document.createElement('button');
    allChip.type = 'button';
    allChip.className = `tag-chip-btn ${this.hostsSelectedTag === 'all' ? 'active' : ''}`;
    allChip.innerHTML = `<span>🏷️ Todas</span><span class="tag-chip-count">${hosts.length}</span>`;
    allChip.addEventListener('click', () => {
      this.hostsSelectedTag = 'all';
      this.renderHostsList();
    });
    chipsBar.appendChild(allChip);

    // Tags ordenadas alfabeticamente
    const sortedTags = Array.from(tagCounts.keys()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    sortedTags.forEach(tag => {
      const count = tagCounts.get(tag);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `tag-chip-btn ${this.hostsSelectedTag === tag ? 'active' : ''}`;
      chip.innerHTML = `<span>#${this.escapeHtml(tag)}</span><span class="tag-chip-count">${count}</span>`;
      chip.addEventListener('click', () => {
        this.hostsSelectedTag = this.hostsSelectedTag === tag ? 'all' : tag;
        this.renderHostsList();
      });
      chipsBar.appendChild(chip);
    });

    // Chip "Sem Tag" (se houver algum)
    if (untaggedCount > 0) {
      const untaggedChip = document.createElement('button');
      untaggedChip.type = 'button';
      untaggedChip.className = `tag-chip-btn ${this.hostsSelectedTag === '__untagged__' ? 'active' : ''}`;
      untaggedChip.innerHTML = `<span>📁 Sem Tag</span><span class="tag-chip-count">${untaggedCount}</span>`;
      untaggedChip.addEventListener('click', () => {
        this.hostsSelectedTag = this.hostsSelectedTag === '__untagged__' ? 'all' : '__untagged__';
        this.renderHostsList();
      });
      chipsBar.appendChild(untaggedChip);
    }
  }

  createHostCard(host) {
    const card = document.createElement('div');
    card.className = 'host-card';

    const colorStripe = document.createElement('div');
    colorStripe.className = 'host-card-color-stripe';
    colorStripe.style.backgroundColor = host.color || '#38bdf8';
    card.appendChild(colorStripe);

    const header = document.createElement('div');
    header.className = 'host-card-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'host-card-title-group';

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.gap = '8px';

    const nameEl = document.createElement('span');
    nameEl.className = 'host-name';
    nameEl.textContent = host.name;
    titleRow.appendChild(nameEl);

    const badges = document.createElement('div');
    badges.className = 'host-badges';

    const typeBadge = document.createElement('span');
    typeBadge.className = `badge-pill ${host.host_type === 'ssh' ? 'badge-ssh' : 'badge-local'}`;
    typeBadge.textContent = host.host_type === 'ssh' ? 'SSH' : 'LOCAL';
    badges.appendChild(typeBadge);
    titleRow.appendChild(badges);

    titleGroup.appendChild(titleRow);

    const targetInfo = document.createElement('span');
    targetInfo.className = 'host-target-info';
    if (host.host_type === 'ssh') {
      const username = host.username || (host.identity && host.identity.username);
      const userPrefix = username ? `${username}@` : '';
      targetInfo.textContent = `${userPrefix}${host.hostname || 'localhost'}:${host.port || 22}`;
    } else {
      targetInfo.textContent = 'Terminal Local (PTY)';
    }
    titleGroup.appendChild(targetInfo);

    header.appendChild(titleGroup);
    card.appendChild(header);

    // Meta: Default Path e Startup Command
    if (host.default_path || host.startup_command) {
      const metaBox = document.createElement('div');
      metaBox.className = 'host-config-meta';

      if (host.default_path) {
        const pathLine = document.createElement('div');
        pathLine.className = 'meta-line';
        pathLine.title = `Diretório Padrão: ${host.default_path}`;
        pathLine.innerHTML = `
          <svg class="meta-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>${this.escapeHtml(host.default_path)}</span>
        `;
        metaBox.appendChild(pathLine);
      }

      if (host.startup_command) {
        const cmdLine = document.createElement('div');
        cmdLine.className = 'meta-line';
        cmdLine.title = `Comando Inicial: ${host.startup_command}`;
        cmdLine.innerHTML = `
          <svg class="meta-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <span><code>${this.escapeHtml(host.startup_command)}</code></span>
        `;
        metaBox.appendChild(cmdLine);
      }

      card.appendChild(metaBox);
    }

    // Tags
    if (Array.isArray(host.tags) && host.tags.length > 0) {
      const tagsRow = document.createElement('div');
      tagsRow.className = 'host-tags-row';
      host.tags.forEach(tag => {
        const tagPill = document.createElement('span');
        tagPill.className = 'host-tag';
        tagPill.textContent = `#${tag}`;
        tagPill.title = `Filtrar por #${tag}`;
        tagPill.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hostsSelectedTag = this.hostsSelectedTag === tag ? 'all' : tag;
          this.renderHostsList();
        });
        tagsRow.appendChild(tagPill);
      });
      card.appendChild(tagsRow);
    }

    // Rodapé do card: Ações
    const actions = document.createElement('div');
    actions.className = 'host-card-actions';

    const btnConnect = document.createElement('button');
    btnConnect.className = 'btn-connect-host';
    btnConnect.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="4 17 10 11 4 5"></polyline>
        <line x1="12" y1="19" x2="20" y2="19"></line>
      </svg>
      <span>Conectar</span>
    `;
    btnConnect.addEventListener('click', () => this.connectToHost(host));
    actions.appendChild(btnConnect);

    const iconActions = document.createElement('div');
    iconActions.className = 'card-action-icons';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn-icon-action';
    btnEdit.title = 'Editar Host';
    btnEdit.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
    `;
    btnEdit.addEventListener('click', () => this.openHostForm(host));
    iconActions.appendChild(btnEdit);

    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-icon-action btn-icon-delete';
    btnDelete.title = 'Excluir Host';
    btnDelete.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    `;
    btnDelete.addEventListener('click', async () => {
      if (confirm(`Deseja realmente remover o host "${host.name}"?`)) {
        await this.apiDeleteHost(host.id);
        await this.refreshHostsAndIdentities();
      }
    });
    iconActions.appendChild(btnDelete);

    actions.appendChild(iconActions);
    card.appendChild(actions);

    return card;
  }

  renderHostsList() {
    this.renderTagChipsBar();

    const container = document.getElementById('hosts-list');
    const emptyEl = document.getElementById('hosts-empty');
    if (!container) return;

    container.innerHTML = '';

    const query = (this.hostsSearchQuery || '').toLowerCase().trim();
    const typeFilter = this.hostsFilterType || 'all';
    const tagFilter = this.hostsSelectedTag || 'all';
    const groupMode = this.hostsGroupMode || 'tag';

    const filtered = (this.savedHosts || []).filter(h => {
      if (typeFilter !== 'all' && h.host_type !== typeFilter) return false;

      // Filtro por Tag do Chip selecionado
      if (tagFilter !== 'all') {
        const hTags = Array.isArray(h.tags) ? h.tags : [];
        if (tagFilter === '__untagged__') {
          if (hTags.length > 0) return false;
        } else {
          if (!hTags.includes(tagFilter)) return false;
        }
      }

      if (!query) return true;

      const nameMatch = (h.name || '').toLowerCase().includes(query);
      const hostMatch = (h.hostname || '').toLowerCase().includes(query);
      const tagsMatch = Array.isArray(h.tags) && h.tags.some(t => t.toLowerCase().includes(query));
      const pathMatch = (h.default_path || '').toLowerCase().includes(query);
      const cmdMatch = (h.startup_command || '').toLowerCase().includes(query);
      return nameMatch || hostMatch || tagsMatch || pathMatch || cmdMatch;
    });

    if (filtered.length === 0) {
      container.classList.remove('is-grouped');
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    } else {
      if (emptyEl) emptyEl.classList.add('hidden');
    }

    if (groupMode === 'none') {
      // Lista Plana
      container.classList.remove('is-grouped');
      filtered.forEach(host => {
        container.appendChild(this.createHostCard(host));
      });
      return;
    }

    // Modo Agrupado (por Tag ou por Tipo)
    container.classList.add('is-grouped');

    const groupsMap = new Map();

    if (groupMode === 'type') {
      filtered.forEach(host => {
        const key = host.host_type === 'ssh' ? 'Servidores SSH' : 'Terminais Locais (PTY)';
        if (!groupsMap.has(key)) groupsMap.set(key, []);
        groupsMap.get(key).push(host);
      });
    } else {
      // groupMode === 'tag'
      filtered.forEach(host => {
        const tags = Array.isArray(host.tags) && host.tags.length > 0 ? host.tags : ['__untagged__'];
        tags.forEach(tag => {
          if (!groupsMap.has(tag)) groupsMap.set(tag, []);
          groupsMap.get(tag).push(host);
        });
      });
    }

    // Ordena as chaves dos grupos
    const sortedGroupKeys = Array.from(groupsMap.keys()).sort((a, b) => {
      if (a === '__untagged__') return 1;
      if (b === '__untagged__') return -1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });

    sortedGroupKeys.forEach(groupKey => {
      const groupHosts = groupsMap.get(groupKey);
      if (!groupHosts || groupHosts.length === 0) return;

      const isUntagged = groupKey === '__untagged__';
      const groupName = isUntagged ? 'Sem Tag / Geral' : (groupMode === 'tag' ? `#${groupKey}` : groupKey);
      const groupIcon = isUntagged ? '📁' : (groupMode === 'tag' ? '🏷️' : (groupKey.includes('SSH') ? '🌐' : '💻'));
      const isCollapsed = this.collapsedTagGroups.has(groupKey);

      const sectionEl = document.createElement('div');
      sectionEl.className = `host-group-section ${isCollapsed ? 'collapsed' : ''}`;
      sectionEl.setAttribute('data-group-key', groupKey);

      const headerEl = document.createElement('div');
      headerEl.className = 'host-group-header';
      headerEl.innerHTML = `
        <div class="host-group-title">
          <span class="host-group-badge-icon">${groupIcon}</span>
          <span class="host-group-name">${this.escapeHtml(groupName)}</span>
          <span class="host-group-count-pill">${groupHosts.length} ${groupHosts.length === 1 ? 'host' : 'hosts'}</span>
        </div>
        <div class="host-group-toggle-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      `;

      headerEl.addEventListener('click', () => {
        if (this.collapsedTagGroups.has(groupKey)) {
          this.collapsedTagGroups.delete(groupKey);
          sectionEl.classList.remove('collapsed');
        } else {
          this.collapsedTagGroups.add(groupKey);
          sectionEl.classList.add('collapsed');
        }
      });

      sectionEl.appendChild(headerEl);

      const gridEl = document.createElement('div');
      gridEl.className = 'host-group-cards-grid';
      groupHosts.forEach(host => {
        gridEl.appendChild(this.createHostCard(host));
      });
      sectionEl.appendChild(gridEl);

      container.appendChild(sectionEl);
    });
  }

  renderIdentitiesList() {
    const container = document.getElementById('identities-list');
    const emptyEl = document.getElementById('identities-empty');
    if (!container) return;

    container.innerHTML = '';

    if (this.savedIdentities.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    } else {
      if (emptyEl) emptyEl.classList.add('hidden');
    }

    this.savedIdentities.forEach(identity => {
      const card = document.createElement('div');
      card.className = 'identity-card';

      const header = document.createElement('div');
      header.className = 'identity-card-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'host-card-title-group';

      const nameEl = document.createElement('span');
      nameEl.className = 'identity-name';
      nameEl.textContent = identity.name;
      titleGroup.appendChild(nameEl);

      const userEl = document.createElement('span');
      userEl.className = 'host-target-info';
      userEl.textContent = `Usuário: ${identity.username}`;
      titleGroup.appendChild(userEl);

      header.appendChild(titleGroup);

      const authBadge = document.createElement('span');
      authBadge.className = 'badge-pill';
      if (identity.auth_type === 'password') {
        authBadge.classList.add('badge-ssh');
        authBadge.textContent = 'SENHA (AES-256)';
      } else if (identity.auth_type === 'key') {
        authBadge.classList.add('badge-ssh');
        authBadge.textContent = 'CHAVE SSH';
      } else if (identity.auth_type === 'certificate') {
        authBadge.classList.add('badge-cert');
        authBadge.textContent = 'CERTIFICADO / OCI';
      } else {
        authBadge.classList.add('badge-ssh');
        authBadge.textContent = 'AGENTE SSH';
      }
      header.appendChild(authBadge);

      card.appendChild(header);

      if (identity.auth_type === 'certificate' || identity.has_certificate) {
        const metaBox = document.createElement('div');
        metaBox.className = 'host-config-meta';
        const certLine = document.createElement('div');
        certLine.className = 'meta-line';
        certLine.innerHTML = `
          <svg class="meta-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span>Certificado / Chave em texto (criptografia AES-256)</span>
        `;
        metaBox.appendChild(certLine);
        card.appendChild(metaBox);
      } else if (identity.key_path) {
        const metaBox = document.createElement('div');
        metaBox.className = 'host-config-meta';
        const keyLine = document.createElement('div');
        keyLine.className = 'meta-line';
        keyLine.innerHTML = `
          <svg class="meta-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 2l-2 2m-1.5 1.5L16 7l-2-2-1.5 1.5 2 2L13 10l-1.5-1.5-2 2L11 12l-1.5 1.5L8 12l-2 2"></path>
            <circle cx="7.5" cy="15.5" r="5.5"></circle>
          </svg>
          <span>${this.escapeHtml(identity.key_path)}</span>
        `;
        metaBox.appendChild(keyLine);
        card.appendChild(metaBox);
      }

      const actions = document.createElement('div');
      actions.className = 'identity-card-actions';

      const encryptedIndicator = document.createElement('div');
      encryptedIndicator.style.display = 'flex';
      encryptedIndicator.style.alignItems = 'center';
      encryptedIndicator.style.gap = '4px';
      encryptedIndicator.style.fontSize = '0.74rem';
      encryptedIndicator.style.color = '#10b981';
      encryptedIndicator.innerHTML = `<span>🔒 Criptografada</span>`;
      actions.appendChild(encryptedIndicator);

      const iconActions = document.createElement('div');
      iconActions.className = 'card-action-icons';

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn-icon-action';
      btnEdit.title = 'Editar Identidade';
      btnEdit.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      `;
      btnEdit.addEventListener('click', () => this.openIdentityForm(identity));
      iconActions.appendChild(btnEdit);

      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn-icon-action btn-icon-delete';
      btnDelete.title = 'Excluir Identidade';
      btnDelete.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      btnDelete.addEventListener('click', async () => {
        if (confirm(`Deseja realmente remover a identidade "${identity.name}"?`)) {
          await this.apiDeleteIdentity(identity.id);
          await this.refreshHostsAndIdentities();
        }
      });
      iconActions.appendChild(btnDelete);

      actions.appendChild(iconActions);
      card.appendChild(actions);

      container.appendChild(card);
    });
  }

  populateIdentitySelect(selectedId = '') {
    const identitySelect = document.getElementById('host-input-identity');
    if (!identitySelect) return;

    identitySelect.innerHTML = '<option value="">Sem identidade (solicitar senha na hora)</option>';
    this.savedIdentities.forEach(ident => {
      const opt = document.createElement('option');
      opt.value = ident.id;
      let typeLabel = 'Senha';
      if (ident.auth_type === 'key') typeLabel = 'Chave SSH';
      else if (ident.auth_type === 'certificate') typeLabel = 'Certificado / OCI';
      else if (ident.auth_type === 'agent') typeLabel = 'Agente SSH';
      opt.textContent = `${ident.name} (${ident.username} • ${typeLabel})`;
      identitySelect.appendChild(opt);
    });

    if (selectedId) {
      identitySelect.value = selectedId;
    }
  }

  openHostForm(host = null) {
    const titleEl = document.getElementById('host-form-title');
    const idInput = document.getElementById('host-input-id');
    const nameInput = document.getElementById('host-input-name');
    const typeSelect = document.getElementById('host-input-type');
    const colorSelect = document.getElementById('host-input-color');
    const hostnameInput = document.getElementById('host-input-hostname');
    const portInput = document.getElementById('host-input-port');
    const pathInput = document.getElementById('host-input-path');
    const cmdInput = document.getElementById('host-input-command');
    const tagsInput = document.getElementById('host-input-tags');
    const sshFields = document.getElementById('host-ssh-fields');

    this.populateIdentitySelect(host ? host.identity_id : '');

    if (host) {
      if (titleEl) titleEl.textContent = 'Editar Host';
      if (idInput) idInput.value = host.id || '';
      if (nameInput) nameInput.value = host.name || '';
      if (typeSelect) typeSelect.value = host.host_type || 'ssh';
      if (colorSelect) colorSelect.value = host.color || '#38bdf8';
      if (hostnameInput) hostnameInput.value = host.hostname || '';
      if (portInput) portInput.value = host.port || 22;
      if (pathInput) pathInput.value = host.default_path || '';
      if (cmdInput) cmdInput.value = host.startup_command || '';
      if (tagsInput) tagsInput.value = Array.isArray(host.tags) ? host.tags.join(', ') : (host.tags || '');
    } else {
      if (titleEl) titleEl.textContent = 'Novo Host';
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (typeSelect) typeSelect.value = 'ssh';
      if (colorSelect) colorSelect.value = '#38bdf8';
      if (hostnameInput) hostnameInput.value = '';
      if (portInput) portInput.value = 22;
      if (pathInput) pathInput.value = '';
      if (cmdInput) cmdInput.value = '';
      if (tagsInput) tagsInput.value = '';
    }

    if (sshFields) {
      sshFields.style.display = typeSelect && typeSelect.value === 'local' ? 'none' : 'block';
    }

    this.hostFormModalEl?.classList.remove('hidden');
    nameInput?.focus();
  }

  closeHostForm() {
    this.hostFormModalEl?.classList.add('hidden');
  }

  openIdentityForm(identity = null) {
    const titleEl = document.getElementById('identity-form-title');
    const idInput = document.getElementById('identity-input-id');
    const nameInput = document.getElementById('identity-input-name');
    const userInput = document.getElementById('identity-input-username');
    const authTypeSelect = document.getElementById('identity-input-auth-type');
    const passInput = document.getElementById('identity-input-password');
    const keyPathInput = document.getElementById('identity-input-key-path');
    const passPhraseInput = document.getElementById('identity-input-passphrase');
    const certInput = document.getElementById('identity-input-certificate');
    const certPassPhraseInput = document.getElementById('identity-input-cert-passphrase');
    const passGroup = document.getElementById('identity-password-field');
    const keyGroup = document.getElementById('identity-key-fields');
    const certGroup = document.getElementById('identity-cert-fields');

    if (identity) {
      if (titleEl) titleEl.textContent = 'Editar Identidade';
      if (idInput) idInput.value = identity.id || '';
      if (nameInput) nameInput.value = identity.name || '';
      if (userInput) userInput.value = identity.username || '';
      if (authTypeSelect) authTypeSelect.value = identity.auth_type || 'password';
      if (passInput) {
        passInput.value = '';
        passInput.placeholder = 'Deixe em branco para manter a senha atual';
      }
      if (keyPathInput) keyPathInput.value = identity.key_path || '';
      if (passPhraseInput) {
        passPhraseInput.value = '';
        passPhraseInput.placeholder = 'Deixe em branco para manter a passphrase';
      }
      if (certPassPhraseInput) {
        certPassPhraseInput.value = '';
        certPassPhraseInput.placeholder = 'Deixe em branco para manter a passphrase';
      }
      if (certInput) {
        certInput.value = '';
        certInput.placeholder = identity.has_certificate
          ? '🔒 Certificado / chave já configurado(a). Deixe em branco para manter ou cole novo conteúdo para substituir.'
          : 'Cole o certificado ou chave privada aqui (ex: OCI, AWS)...';
      }

      // Se for certificado, carrega conteúdo descriptografado do servidor para visualização / edição
      if (identity.id && (identity.auth_type === 'certificate' || identity.has_certificate)) {
        this.apiGetIdentity(identity.id).then(full => {
          if (full && full.certificate && certInput && idInput.value === identity.id) {
            certInput.value = full.certificate;
          }
        }).catch(() => {});
      }
    } else {
      if (titleEl) titleEl.textContent = 'Nova Identidade';
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (userInput) userInput.value = '';
      if (authTypeSelect) authTypeSelect.value = 'password';
      if (passInput) {
        passInput.value = '';
        passInput.placeholder = 'Digite a senha';
      }
      if (keyPathInput) keyPathInput.value = '';
      if (passPhraseInput) {
        passPhraseInput.value = '';
        passPhraseInput.placeholder = 'Passphrase da chave privada (se houver)';
      }
      if (certPassPhraseInput) {
        certPassPhraseInput.value = '';
        certPassPhraseInput.placeholder = 'Passphrase do certificado (se houver)';
      }
      if (certInput) {
        certInput.value = '';
        certInput.placeholder = 'Cole aqui o conteúdo do certificado ou chave privada (ex: OCI, AWS, GCP)...\n-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----';
      }
    }

    const currentType = authTypeSelect ? authTypeSelect.value : 'password';
    if (passGroup) passGroup.classList.toggle('hidden', currentType !== 'password');
    if (keyGroup) keyGroup.classList.toggle('hidden', currentType !== 'key');
    if (certGroup) certGroup.classList.toggle('hidden', currentType !== 'certificate');

    this.identityFormModalEl?.classList.remove('hidden');
    nameInput?.focus();
  }

  closeIdentityForm() {
    this.identityFormModalEl?.classList.add('hidden');
  }

  connectToHost(host) {
    const termId = `term-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const termTitle = host.name || (host.host_type === 'ssh' ? `${host.hostname} (SSH)` : 'Local Shell');

    const instance = new TerminalInstance(this, termId, termTitle);
    instance.hostId = host.id;
    instance.hostName = host.name;

    this.terminals.set(termId, instance);

    this.updateGridState();
    this.setActiveTerminal(termId);

    // Fecha o modal de hosts
    this.closeHostsModal();

    const payload = {
      id: host.id,
      termId,
      cols: instance.term.cols || 80,
      rows: instance.term.rows || 24
    };

    if (this.isElectron && window.termix?.hosts) {
      window.termix.hosts.connect(payload);
    } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'connect_host',
        hostId: host.id,
        termId,
        cols: payload.cols,
        rows: payload.rows
      }));
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================================================
  // GERENCIADOR DE WORKSPACES (Conjuntos de Terminais Salvos)
  // ==========================================================================

  initWorkspacesManager() {
    // Botão abrir modal
    document.getElementById('btn-open-workspaces')?.addEventListener('click', () => this.openWorkspacesModal());
    document.getElementById('btn-quick-workspaces')?.addEventListener('click', () => this.openWorkspacesModal());

    // Fechar modal
    document.getElementById('btn-close-workspaces-modal')?.addEventListener('click', () => this.closeWorkspacesModal());
    this.workspacesModalEl?.addEventListener('click', (e) => {
      if (e.target === this.workspacesModalEl) this.closeWorkspacesModal();
    });

    // Busca
    document.getElementById('workspaces-search-input')?.addEventListener('input', (e) => {
      this.workspacesSearchQuery = e.target.value;
      this.renderWorkspacesList();
    });

    // Salvar Sessão Atual
    document.getElementById('btn-save-current-session')?.addEventListener('click', () => {
      this.openSaveCurrentSessionModal();
    });

    // Novo Workspace
    document.getElementById('btn-add-workspace')?.addEventListener('click', () => {
      this.openWorkspaceForm();
    });

    // Form modal fechar
    document.getElementById('btn-close-workspace-form')?.addEventListener('click', () => this.closeWorkspaceForm());
    document.getElementById('btn-cancel-workspace-form')?.addEventListener('click', () => this.closeWorkspaceForm());
    this.workspaceFormModalEl?.addEventListener('click', (e) => {
      if (e.target === this.workspaceFormModalEl) this.closeWorkspaceForm();
    });

    // Botão adicionar linha de terminal no formulário
    document.getElementById('btn-add-terminal-row')?.addEventListener('click', () => {
      this.addWorkspaceTerminalRow();
    });

    // Submit do formulário de Workspace
    document.getElementById('form-workspace')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const id = document.getElementById('workspace-input-id')?.value || undefined;
        const name = document.getElementById('workspace-input-name')?.value?.trim();
        const layout = document.getElementById('workspace-input-layout')?.value || 'auto';
        const color = document.getElementById('workspace-input-color')?.value || '#8b5cf6';
        const description = document.getElementById('workspace-input-description')?.value?.trim() || '';

        if (!name) return;

        // Coleta todos os terminais definidos nas linhas
        const termRows = document.querySelectorAll('.workspace-term-row');
        const terminals = [];
        termRows.forEach(row => {
          const title = row.querySelector('.term-row-title')?.value?.trim() || 'Terminal';
          const type = row.querySelector('.term-row-type')?.value || 'local';
          const host_id = row.querySelector('.term-row-host')?.value || null;
          const cwd = row.querySelector('.term-row-cwd')?.value?.trim() || '';
          const startup_command = row.querySelector('.term-row-cmd')?.value?.trim() || '';

          terminals.push({
            title,
            type,
            host_id: type === 'host' ? host_id : null,
            cwd: type === 'local' ? cwd : '',
            startup_command
          });
        });

        if (terminals.length === 0) {
          alert('Adicione ao menos um terminal ao workspace.');
          return;
        }

        const payload = {
          id,
          name,
          layout,
          color,
          description,
          terminals
        };

        await this.apiSaveWorkspace(payload);
        this.closeWorkspaceForm();
        await this.refreshWorkspaces();
      } catch (err) {
        alert('Erro ao salvar workspace: ' + err.message);
      }
    });
  }

  async apiGetWorkspaces() {
    try {
      if (this.isElectron && window.termix?.workspaces) {
        return await window.termix.workspaces.list();
      }
      const res = await fetch('/api/workspaces');
      return await res.json();
    } catch (err) {
      console.error('[Termix] Falha ao listar workspaces:', err);
      return [];
    }
  }

  async apiSaveWorkspace(data) {
    if (this.isElectron && window.termix?.workspaces) {
      return await window.termix.workspaces.save(data);
    }
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  }

  async apiDeleteWorkspace(id) {
    if (this.isElectron && window.termix?.workspaces) {
      return await window.termix.workspaces.delete(id);
    }
    const res = await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
    return await res.json();
  }

  async openWorkspacesModal() {
    await this.refreshWorkspaces();
    this.workspacesModalEl?.classList.remove('hidden');
    document.getElementById('workspaces-search-input')?.focus();
  }

  closeWorkspacesModal() {
    this.workspacesModalEl?.classList.add('hidden');
  }

  async refreshWorkspaces() {
    if (this.savedHosts.length === 0) {
      this.savedHosts = (await this.apiGetHosts()) || [];
    }

    this.savedWorkspaces = (await this.apiGetWorkspaces()) || [];

    const badge = document.getElementById('workspaces-count-badge');
    if (badge) badge.textContent = this.savedWorkspaces.length.toString();

    this.renderWorkspacesList();
  }

  renderWorkspacesList() {
    const container = document.getElementById('workspaces-list');
    const emptyEl = document.getElementById('workspaces-empty');
    if (!container) return;

    container.innerHTML = '';

    const query = (this.workspacesSearchQuery || '').toLowerCase().trim();
    const filtered = this.savedWorkspaces.filter(ws => {
      if (!query) return true;
      const nameMatch = (ws.name || '').toLowerCase().includes(query);
      const descMatch = (ws.description || '').toLowerCase().includes(query);
      const termMatch = Array.isArray(ws.terminals) && ws.terminals.some(t => (t.title || '').toLowerCase().includes(query));
      return nameMatch || descMatch || termMatch;
    });

    if (filtered.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    } else {
      if (emptyEl) emptyEl.classList.add('hidden');
    }

    filtered.forEach(ws => {
      const card = document.createElement('div');
      card.className = 'workspace-card';

      const colorStripe = document.createElement('div');
      colorStripe.className = 'host-card-color-stripe';
      colorStripe.style.backgroundColor = ws.color || '#8b5cf6';
      card.appendChild(colorStripe);

      const header = document.createElement('div');
      header.className = 'host-card-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'host-card-title-group';

      const titleRow = document.createElement('div');
      titleRow.style.display = 'flex';
      titleRow.style.alignItems = 'center';
      titleRow.style.gap = '8px';

      const nameEl = document.createElement('span');
      nameEl.className = 'host-name';
      nameEl.textContent = ws.name;
      titleRow.appendChild(nameEl);

      const badges = document.createElement('div');
      badges.className = 'host-badges';

      const countBadge = document.createElement('span');
      countBadge.className = 'badge-pill badge-ssh';
      countBadge.textContent = `${ws.terminals.length} TERMINAIS`;
      badges.appendChild(countBadge);

      const layoutBadge = document.createElement('span');
      layoutBadge.className = 'badge-pill badge-local';
      layoutBadge.textContent = (ws.layout || 'auto').toUpperCase();
      badges.appendChild(layoutBadge);

      titleRow.appendChild(badges);
      titleGroup.appendChild(titleRow);

      if (ws.description) {
        const descEl = document.createElement('span');
        descEl.className = 'workspace-desc';
        descEl.textContent = ws.description;
        titleGroup.appendChild(descEl);
      }

      header.appendChild(titleGroup);
      card.appendChild(header);

      // Preview dos terminais configurados no workspace
      if (Array.isArray(ws.terminals) && ws.terminals.length > 0) {
        const previewBox = document.createElement('div');
        previewBox.className = 'workspace-terminals-preview';

        ws.terminals.forEach((term, idx) => {
          const item = document.createElement('div');
          item.className = 'preview-term-item';

          const left = document.createElement('div');
          left.className = 'preview-term-left';

          const num = document.createElement('span');
          num.className = 'workspace-term-index';
          num.textContent = `#${idx + 1}`;
          left.appendChild(num);

          const termTitle = document.createElement('span');
          termTitle.style.fontWeight = '500';
          termTitle.textContent = term.title || 'Terminal';
          left.appendChild(termTitle);

          item.appendChild(left);

          const meta = document.createElement('div');
          meta.className = 'preview-term-meta';

          if (term.type === 'host' && term.host_id) {
            const h = this.savedHosts.find(host => host.id === term.host_id);
            meta.textContent = `SSH: ${h ? h.name : 'Host'}`;
          } else {
            const pathInfo = term.cwd ? term.cwd : '';
            const cmdInfo = term.startup_command ? `⚡ ${term.startup_command}` : '';
            meta.textContent = [pathInfo, cmdInfo].filter(Boolean).join(' • ') || 'Shell Padrão';
          }

          item.appendChild(meta);
          previewBox.appendChild(item);
        });

        card.appendChild(previewBox);
      }

      // Rodapé: Ações
      const actions = document.createElement('div');
      actions.className = 'host-card-actions';

      const btnLaunch = document.createElement('button');
      btnLaunch.className = 'btn-launch-workspace';
      btnLaunch.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span>Abrir Workspace</span>
      `;
      btnLaunch.addEventListener('click', () => this.launchWorkspace(ws));
      actions.appendChild(btnLaunch);

      const iconActions = document.createElement('div');
      iconActions.className = 'card-action-icons';

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn-icon-action';
      btnEdit.title = 'Editar Workspace';
      btnEdit.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      `;
      btnEdit.addEventListener('click', () => this.openWorkspaceForm(ws));
      iconActions.appendChild(btnEdit);

      const btnDelete = document.createElement('button');
      btnDelete.className = 'btn-icon-action btn-icon-delete';
      btnDelete.title = 'Excluir Workspace';
      btnDelete.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      btnDelete.addEventListener('click', async () => {
        if (confirm(`Deseja realmente excluir o workspace "${ws.name}"?`)) {
          await this.apiDeleteWorkspace(ws.id);
          await this.refreshWorkspaces();
        }
      });
      iconActions.appendChild(btnDelete);

      actions.appendChild(iconActions);
      card.appendChild(actions);

      container.appendChild(card);
    });
  }

  openSaveCurrentSessionModal() {
    if (this.terminals.size === 0) {
      alert('Abra ao menos um terminal antes de salvar a sessão como workspace.');
      return;
    }

    const currentTerms = [];
    for (const [id, inst] of this.terminals) {
      currentTerms.push({
        title: inst.title || 'Terminal',
        type: inst.hostId ? 'host' : 'local',
        host_id: inst.hostId || null,
        cwd: inst.cwd || '',
        startup_command: inst.startupCommand || ''
      });
    }

    const now = new Date();
    const defaultName = `Sessão ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    this.openWorkspaceForm({
      name: defaultName,
      layout: this.currentLayout || 'auto',
      color: '#8b5cf6',
      description: `Workspace com ${currentTerms.length} terminais ativos`,
      terminals: currentTerms
    });
  }

  async openWorkspaceForm(workspace = null) {
    if (this.savedHosts.length === 0) {
      this.savedHosts = (await this.apiGetHosts()) || [];
    }

    const titleEl = document.getElementById('workspace-form-title');
    const idInput = document.getElementById('workspace-input-id');
    const nameInput = document.getElementById('workspace-input-name');
    const layoutSelect = document.getElementById('workspace-input-layout');
    const colorSelect = document.getElementById('workspace-input-color');
    const descInput = document.getElementById('workspace-input-description');
    const terminalsListEl = document.getElementById('workspace-terminals-list');

    if (!terminalsListEl) return;
    terminalsListEl.innerHTML = '';

    if (workspace) {
      if (titleEl) titleEl.textContent = workspace.id ? 'Editar Workspace' : 'Salvar Sessão como Workspace';
      if (idInput) idInput.value = workspace.id || '';
      if (nameInput) nameInput.value = workspace.name || '';
      if (layoutSelect) layoutSelect.value = workspace.layout || 'auto';
      if (colorSelect) colorSelect.value = workspace.color || '#8b5cf6';
      if (descInput) descInput.value = workspace.description || '';

      if (Array.isArray(workspace.terminals) && workspace.terminals.length > 0) {
        workspace.terminals.forEach(term => this.addWorkspaceTerminalRow(term));
      } else {
        this.addWorkspaceTerminalRow();
      }
    } else {
      if (titleEl) titleEl.textContent = 'Novo Workspace';
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (layoutSelect) layoutSelect.value = 'auto';
      if (colorSelect) colorSelect.value = '#8b5cf6';
      if (descInput) descInput.value = '';
      this.addWorkspaceTerminalRow();
    }

    this.updateWorkspaceTerminalsCount();
    this.workspaceFormModalEl?.classList.remove('hidden');
    nameInput?.focus();
  }

  closeWorkspaceForm() {
    this.workspaceFormModalEl?.classList.add('hidden');
  }

  addWorkspaceTerminalRow(data = null) {
    const listEl = document.getElementById('workspace-terminals-list');
    if (!listEl) return;

    const row = document.createElement('div');
    row.className = 'workspace-term-row';

    const index = listEl.children.length + 1;

    row.innerHTML = `
      <div class="workspace-term-row-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="workspace-term-index">#${index}</span>
          <input type="text" class="term-row-title" placeholder="Nome do Terminal (ex: Backend, Frontend, Logs)" value="${this.escapeHtml(data?.title || `Terminal #${index}`)}" style="width: 240px; padding: 6px 10px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-main); font-size: 0.8rem;">
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <select class="term-row-type select-filter" style="padding: 5px 8px; font-size: 0.78rem;">
            <option value="local" ${(data?.type || 'local') === 'local' ? 'selected' : ''}>Terminal Local</option>
            <option value="host" ${(data?.type || '') === 'host' ? 'selected' : ''}>Host SSH Remoto</option>
          </select>
          <button type="button" class="btn-remove-term-row" title="Remover este terminal">✕</button>
        </div>
      </div>

      <div class="term-row-local-fields" style="display: ${(data?.type || 'local') === 'local' ? 'flex' : 'none'}; gap: 10px;">
        <div style="flex: 1;">
          <input type="text" class="term-row-cwd" placeholder="Diretório (ex: ~/Projetos/app)" value="${this.escapeHtml(data?.cwd || '')}" style="width: 100%; padding: 6px 10px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-main); font-size: 0.78rem;">
        </div>
        <div style="flex: 1;">
          <input type="text" class="term-row-cmd" placeholder="Comando Inicial (ex: npm run dev)" value="${this.escapeHtml(data?.startup_command || '')}" style="width: 100%; padding: 6px 10px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-main); font-size: 0.78rem;">
        </div>
      </div>

      <div class="term-row-host-fields" style="display: ${(data?.type || '') === 'host' ? 'block' : 'none'};">
        <select class="term-row-host select-filter" style="width: 100%; padding: 6px 10px; font-size: 0.78rem;">
          <option value="">Selecione um Host cadastrado...</option>
          ${this.savedHosts.map(h => `<option value="${h.id}" ${data?.host_id === h.id ? 'selected' : ''}>${this.escapeHtml(h.name)} (${h.host_type === 'ssh' ? h.hostname : 'Local'})</option>`).join('')}
        </select>
      </div>
    `;

    // Alternar campos conforme o tipo selecionado
    const typeSelect = row.querySelector('.term-row-type');
    const localFields = row.querySelector('.term-row-local-fields');
    const hostFields = row.querySelector('.term-row-host-fields');

    typeSelect?.addEventListener('change', (e) => {
      if (e.target.value === 'host') {
        localFields.style.display = 'none';
        hostFields.style.display = 'block';
      } else {
        localFields.style.display = 'flex';
        hostFields.style.display = 'none';
      }
    });

    // Botão remover
    row.querySelector('.btn-remove-term-row')?.addEventListener('click', () => {
      row.remove();
      this.reindexWorkspaceTerminalRows();
      this.updateWorkspaceTerminalsCount();
    });

    listEl.appendChild(row);
    this.updateWorkspaceTerminalsCount();
  }

  reindexWorkspaceTerminalRows() {
    const listEl = document.getElementById('workspace-terminals-list');
    if (!listEl) return;
    Array.from(listEl.children).forEach((row, idx) => {
      const idxSpan = row.querySelector('.workspace-term-index');
      if (idxSpan) idxSpan.textContent = `#${idx + 1}`;
    });
  }

  updateWorkspaceTerminalsCount() {
    const listEl = document.getElementById('workspace-terminals-list');
    const countEl = document.getElementById('workspace-terminals-count');
    if (countEl && listEl) {
      countEl.textContent = listEl.children.length.toString();
    }
  }

  async launchWorkspace(workspace) {
    if (!workspace || !Array.isArray(workspace.terminals) || workspace.terminals.length === 0) {
      alert('Este workspace não possui terminais configurados.');
      return;
    }

    // Fecha o modal de workspaces
    this.closeWorkspacesModal();

    // Se já existirem terminais abertos, pergunta se o usuário deseja limpar a tela ou manter
    if (this.terminals.size > 0) {
      const confirmReplace = confirm(
        `Existem ${this.terminals.size} terminais abertos.\n\n` +
        `Clique em "OK" para fechar os atuais e abrir o workspace "${workspace.name}" do zero.\n` +
        `Clique em "Cancelar" para abrir os novos terminais lado a lado com os atuais.`
      );

      if (confirmReplace) {
        const currentIds = Array.from(this.terminals.keys());
        for (const id of currentIds) {
          this.removeTerminal(id);
        }
      }
    }

    // Aplica o layout salvo no workspace
    this.setLayout(workspace.layout || 'auto');

    // Abre cada terminal do workspace sequencialmente com delay suave
    workspace.terminals.forEach((term, index) => {
      setTimeout(() => {
        if (term.type === 'host' && term.host_id) {
          const host = this.savedHosts.find(h => h.id === term.host_id);
          if (host) {
            this.connectToHost(host);
          } else {
            const fallbackInstance = this.createNewTerminal(term.title || 'Terminal');
            fallbackInstance.term?.writeln(`\r\n\x1b[33m[Aviso: O host configurado neste workspace não foi encontrado no banco]\x1b[0m\r\n`);
          }
        } else {
          // Terminal Local
          const termId = `term-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const defaultTitle = term.title || `Terminal #${this.terminalCounter++}`;

          const instance = new TerminalInstance(this, termId, defaultTitle);
          instance.cwd = term.cwd || '';
          instance.startupCommand = term.startup_command || '';

          this.terminals.set(termId, instance);
          this.updateGridState();
          this.setActiveTerminal(termId);

          const payload = {
            id: termId,
            title: defaultTitle,
            cwd: term.cwd || undefined,
            startupCommand: term.startup_command || undefined,
            cols: instance.term.cols || 80,
            rows: instance.term.rows || 24
          };

          if (this.isElectron) {
            window.termix.createTerminal(payload);
          } else if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ action: 'create', ...payload }));
          }
        }
      }, index * 120);
    });
  }

  // ==========================================================================
  // MOTOR DE INTELIGÊNCIA ARTIFICIAL (TERMIX COPILOT)
  // ==========================================================================

  initAIManager() {
    this.btnOpenAi = document.getElementById('btn-open-ai');
    this.btnOpenAiSettings = document.getElementById('btn-open-ai-settings');
    this.btnBroadcastAi = document.getElementById('btn-broadcast-ai');

    this.aiCopilotModalEl = document.getElementById('ai-copilot-modal');
    this.aiDiagnosisModalEl = document.getElementById('ai-diagnosis-modal');
    this.aiBroadcastModalEl = document.getElementById('ai-broadcast-modal');
    this.aiSettingsModalEl = document.getElementById('ai-settings-modal');

    this.aiPromptInputEl = document.getElementById('ai-prompt-input');
    this.btnGenerateAiCommand = document.getElementById('btn-generate-ai-command');
    this.aiLoadingStateEl = document.getElementById('ai-loading-state');
    this.aiErrorBannerEl = document.getElementById('ai-error-banner');
    this.aiErrorMessageEl = document.getElementById('ai-error-message');
    this.aiResultCardEl = document.getElementById('ai-result-card');
    this.aiDangerWarningEl = document.getElementById('ai-danger-warning');
    this.aiDangerTextEl = document.getElementById('ai-danger-text');
    this.aiSuggestedCodeEl = document.getElementById('ai-suggested-code');
    this.aiExplanationTextEl = document.getElementById('ai-explanation-text');
    this.aiModelBadgeEl = document.getElementById('ai-model-badge');
    this.copilotContextPillEl = document.getElementById('copilot-context-pill');

    this.lastGeneratedCommand = '';
    this.currentDiagnosisFix = '';
    this.diagnosisTargetTermId = null;

    // Abertura de modais
    this.btnOpenAi?.addEventListener('click', () => this.openAICopilot());
    this.btnOpenAiSettings?.addEventListener('click', () => this.openAISettings());
    this.btnBroadcastAi?.addEventListener('click', () => this.openBroadcastAISummary());

    // Fechamento de modais
    document.getElementById('btn-close-ai-copilot')?.addEventListener('click', () => {
      this.aiCopilotModalEl?.classList.add('hidden');
    });
    document.getElementById('btn-close-diagnosis-modal')?.addEventListener('click', () => {
      this.aiDiagnosisModalEl?.classList.add('hidden');
    });
    document.getElementById('btn-close-diagnosis-action')?.addEventListener('click', () => {
      this.aiDiagnosisModalEl?.classList.add('hidden');
    });
    document.getElementById('btn-close-broadcast-ai-modal')?.addEventListener('click', () => {
      this.aiBroadcastModalEl?.classList.add('hidden');
    });
    document.getElementById('btn-close-ai-settings')?.addEventListener('click', () => {
      this.aiSettingsModalEl?.classList.add('hidden');
    });
    document.getElementById('btn-go-ai-settings')?.addEventListener('click', () => {
      this.aiCopilotModalEl?.classList.add('hidden');
      this.openAISettings();
    });

    // Envio de prompt no Copilot
    this.btnGenerateAiCommand?.addEventListener('click', () => this.generateAICommand());
    this.aiPromptInputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.generateAICommand();
      }
    });

    // Pílulas de comandos rápidos
    document.querySelectorAll('.ai-quick-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt');
        if (prompt && this.aiPromptInputEl) {
          this.aiPromptInputEl.value = prompt;
          this.generateAICommand();
        }
      });
    });

    // Ações do comando gerado
    document.getElementById('btn-ai-copy-command')?.addEventListener('click', () => {
      if (this.lastGeneratedCommand) {
        this.copyToClipboard(this.lastGeneratedCommand);
        const span = document.getElementById('btn-ai-copy-command')?.querySelector('span');
        if (span) {
          const original = span.textContent;
          span.textContent = 'Copiado!';
          setTimeout(() => { span.textContent = original; }, 1500);
        }
      }
    });

    document.getElementById('btn-ai-insert-only')?.addEventListener('click', () => {
      if (this.lastGeneratedCommand) {
        this.insertCommandToActiveTerminal(this.lastGeneratedCommand, false);
        this.aiCopilotModalEl?.classList.add('hidden');
      }
    });

    document.getElementById('btn-ai-run-now')?.addEventListener('click', () => {
      if (this.lastGeneratedCommand) {
        this.insertCommandToActiveTerminal(this.lastGeneratedCommand, true);
        this.aiCopilotModalEl?.classList.add('hidden');
      }
    });

    // Configurações de IA
    const selectProvider = document.getElementById('ai-select-provider');
    const inputModel = document.getElementById('ai-input-model');
    const modelDatalist = document.getElementById('ai-model-datalist');
    const modelSuggestions = document.getElementById('ai-model-suggestions');
    const selectRegion = document.getElementById('ai-select-region');
    const regionGroup = document.getElementById('ai-region-group');
    const baseUrlGroup = document.getElementById('ai-baseurl-group');
    const apiKeyGroup = document.getElementById('ai-apikey-group');
    const keyLabel = document.getElementById('ai-key-label');
    const keyHelp = document.getElementById('ai-key-help');
    const keyPreviewText = document.getElementById('ai-key-preview-text');
    const btnClearKey = document.getElementById('btn-clear-ai-key');
    const inputApiKey = document.getElementById('ai-input-apikey');
    const inputBaseUrl = document.getElementById('ai-input-baseurl');
    const baseUrlHint = document.getElementById('ai-baseurl-hint');

    this.clearKeyForProvider = {};
    this.aiConfigCache = null;

    btnClearKey?.addEventListener('click', () => {
      const p = selectProvider?.value || 'gemini';
      this.clearKeyForProvider[p] = true;
      if (inputApiKey) inputApiKey.value = '';
      if (keyPreviewText) {
        keyPreviewText.textContent = 'Chave será removida ao salvar.';
        keyPreviewText.style.color = '#ef4444';
      }
      btnClearKey.classList.add('hidden');
    });

    selectProvider?.addEventListener('change', () => {
      const p = selectProvider.value;

      // Modelos disponíveis por provedor
      const modelPresets = {
        gemini: [
          { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash (Mais Recente e Rápido)' },
          { value: 'gemini-2.5-pro', label: 'gemini-2.5-pro (Raciocínio Profundo)' },
          { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash' },
          { value: 'gemini-1.5-pro', label: 'gemini-1.5-pro' }
        ],
        openai: [
          { value: 'gpt-4o-mini', label: 'gpt-4o-mini (Econômico e Rápido)' },
          { value: 'gpt-4o', label: 'gpt-4o (Avançado)' },
          { value: 'o3-mini', label: 'o3-mini (Raciocínio Rápido)' },
          { value: 'o1-mini', label: 'o1-mini' }
        ],
        anthropic: [
          { value: 'claude-3-5-sonnet-20241022', label: 'claude-3-5-sonnet (Mais Capaz)' },
          { value: 'claude-3-5-haiku-20241022', label: 'claude-3-5-haiku (Rápido e Preciso)' },
          { value: 'claude-3-opus-20240229', label: 'claude-3-opus' }
        ],
        deepseek: [
          { value: 'deepseek-chat', label: 'deepseek-chat (DeepSeek V3 - Código & Shell)' },
          { value: 'deepseek-reasoner', label: 'deepseek-reasoner (DeepSeek R1 - Raciocínio)' }
        ],
        nvidia: [
          { value: 'meta/llama-3.3-70b-instruct', label: 'meta/llama-3.3-70b-instruct (Recomendado)' },
          { value: 'deepseek-ai/deepseek-r1', label: 'deepseek-ai/deepseek-r1 (R1 na Nuvem NVIDIA)' },
          { value: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'nvidia/llama-3.1-nemotron-70b-instruct' },
          { value: 'mistralai/mistral-large-2-instruct', label: 'mistralai/mistral-large-2-instruct' },
          { value: 'meta/llama-3.1-8b-instruct', label: 'meta/llama-3.1-8b-instruct (Ultra Rápido)' }
        ],
        bedrock: [
          { value: 'anthropic.claude-3-5-sonnet-20241022-v2:0', label: 'Claude 3.5 Sonnet v2' },
          { value: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0', label: 'Claude 3.5 Sonnet v2 (Cross-Region)' },
          { value: 'anthropic.claude-3-5-haiku-20241022-v1:0', label: 'Claude 3.5 Haiku' },
          { value: 'amazon.nova-pro-v1:0', label: 'Amazon Nova Pro' },
          { value: 'amazon.nova-lite-v1:0', label: 'Amazon Nova Lite' },
          { value: 'amazon.nova-micro-v1:0', label: 'Amazon Nova Micro' },
          { value: 'meta.llama3-3-70b-instruct-v1:0', label: 'Meta Llama 3.3 70B' },
          { value: 'mistral.mistral-large-2407-v1:0', label: 'Mistral Large' }
        ],
        ollama: [
          { value: 'llama3.2', label: 'llama3.2 (Meta)' },
          { value: 'qwen2.5-coder', label: 'qwen2.5-coder (Alibaba)' },
          { value: 'deepseek-r1', label: 'deepseek-r1 (Local)' },
          { value: 'mistral', label: 'mistral' }
        ],
        custom: [
          { value: 'gpt-4o-mini', label: 'gpt-4o-mini (Padrão OpenAI)' },
          { value: 'gpt-4o', label: 'gpt-4o' },
          { value: 'llama3.3', label: 'llama3.3' }
        ]
      };

      const options = modelPresets[p] || modelPresets.gemini;

      // Popula datalist nativo para autocompletion na caixa de texto
      if (modelDatalist) {
        modelDatalist.innerHTML = options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
      }

      // Popula pílulas clicáveis de sugestão rápida
      if (modelSuggestions) {
        modelSuggestions.innerHTML = options.map(opt => `
          <button type="button" class="ai-model-pill" data-model="${opt.value}" title="${opt.label}">
            ${opt.value}
          </button>
        `).join('');

        modelSuggestions.querySelectorAll('.ai-model-pill').forEach(pill => {
          pill.addEventListener('click', () => {
            const mVal = pill.getAttribute('data-model');
            if (mVal && inputModel) {
              inputModel.value = mVal;
            }
          });
        });
      }

      // Restaura modelo salvo anteriormente para este provedor se houver, ou primeiro preset
      const savedModel = this.aiConfigCache?.savedModels?.[p];
      if (inputModel) {
        inputModel.value = savedModel || options[0]?.value || '';
      }

      // Região AWS Bedrock
      if (p === 'bedrock') {
        regionGroup?.classList.remove('hidden');
        const savedRegion = this.aiConfigCache?.savedRegions?.bedrock || 'us-east-1';
        if (selectRegion) selectRegion.value = savedRegion;
      } else {
        regionGroup?.classList.add('hidden');
      }

      // URL Base / Endpoint
      if (p === 'ollama') {
        baseUrlGroup?.classList.remove('hidden');
        if (inputBaseUrl) {
          inputBaseUrl.placeholder = 'http://localhost:11434/v1';
          inputBaseUrl.value = this.aiConfigCache?.savedBaseUrls?.ollama || '';
        }
        if (baseUrlHint) baseUrlHint.textContent = 'Padrão Ollama local: http://localhost:11434/v1';
        apiKeyGroup?.classList.add('hidden');
      } else if (p === 'custom') {
        baseUrlGroup?.classList.remove('hidden');
        if (inputBaseUrl) {
          inputBaseUrl.placeholder = 'https://api.openai-compatible.com/v1';
          inputBaseUrl.value = this.aiConfigCache?.baseUrl || '';
        }
        if (baseUrlHint) baseUrlHint.textContent = 'URL do seu endpoint compatível com OpenAI (ex: Groq, vLLM, OpenRouter)';
        apiKeyGroup?.classList.remove('hidden');
      } else {
        baseUrlGroup?.classList.add('hidden');
        apiKeyGroup?.classList.remove('hidden');
      }

      // Rótulos e Links de Ajuda por Provedor
      const helpTexts = {
        gemini: {
          label: 'Chave de API do Google Gemini',
          help: 'Obtenha gratuitamente no Google AI Studio (aistudio.google.com)'
        },
        openai: {
          label: 'Chave de API da OpenAI (sk-...)',
          help: 'Console da plataforma OpenAI (platform.openai.com/api-keys)'
        },
        anthropic: {
          label: 'Chave de API da Anthropic (sk-ant-...)',
          help: 'Console da Anthropic Claude (console.anthropic.com/settings/keys)'
        },
        deepseek: {
          label: 'Chave de API da DeepSeek (sk-...)',
          help: 'Painel da plataforma DeepSeek (platform.deepseek.com/api_keys)'
        },
        nvidia: {
          label: 'Chave de API da NVIDIA NIM (nvapi-...)',
          help: 'Obtenha gratuitamente no portal NVIDIA Build (build.nvidia.com)'
        },
        bedrock: {
          label: 'Chave Bedrock (Bearer Token) ou Credenciais AWS (AKIA...:SECRET)',
          help: 'AWS Bedrock Console (console.aws.amazon.com/bedrock) ou Chave IAM (ACCESS_KEY:SECRET_KEY)'
        },
        custom: {
          label: 'Chave de API / Bearer Token (se requerido)',
          help: 'Chave de autorização para o servidor customizado'
        }
      };

      if (keyLabel && helpTexts[p]) keyLabel.textContent = helpTexts[p].label;
      if (keyHelp && helpTexts[p]) keyHelp.textContent = helpTexts[p].help;

      // Status de chave salva para este provedor específico
      if (inputApiKey) inputApiKey.value = '';
      const pStatus = this.aiConfigCache?.providersStatus?.[p];
      if (p === 'ollama') {
        if (keyPreviewText) {
          keyPreviewText.textContent = '100% Local / Offline (não requer chave de API).';
          keyPreviewText.style.color = 'var(--text-muted)';
        }
        btnClearKey?.classList.add('hidden');
      } else if (pStatus && pStatus.hasKey && !this.clearKeyForProvider[p]) {
        if (keyPreviewText) {
          keyPreviewText.textContent = `✓ Chave ativa: ${pStatus.keyPreview} (Criptografada AES-256-GCM)`;
          keyPreviewText.style.color = '#34d399';
        }
        if (inputApiKey) inputApiKey.placeholder = '•••••••••••••••• (deixe em branco para manter a atual)';
        btnClearKey?.classList.remove('hidden');
      } else {
        if (keyPreviewText) {
          keyPreviewText.textContent = 'Nenhuma chave configurada para este provedor.';
          keyPreviewText.style.color = 'var(--text-muted)';
        }
        if (inputApiKey) inputApiKey.placeholder = 'Cole sua chave de API aqui...';
        btnClearKey?.classList.add('hidden');
      }
    });

    const btnToggleAiKey = document.getElementById('btn-toggle-ai-key');
    btnToggleAiKey?.addEventListener('click', () => {
      if (inputApiKey) {
        inputApiKey.type = inputApiKey.type === 'password' ? 'text' : 'password';
      }
    });

    document.getElementById('btn-test-ai-connection')?.addEventListener('click', () => {
      this.testAIConnection();
    });

    document.getElementById('form-ai-settings')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveAISettings();
    });

    document.getElementById('btn-diagnosis-apply-fix')?.addEventListener('click', () => {
      if (this.currentDiagnosisFix && this.diagnosisTargetTermId) {
        this.insertCommandToTerminal(this.diagnosisTargetTermId, this.currentDiagnosisFix, true);
        this.aiDiagnosisModalEl?.classList.add('hidden');
      }
    });

    document.getElementById('btn-diagnosis-copy-fix')?.addEventListener('click', () => {
      if (this.currentDiagnosisFix) {
        this.copyToClipboard(this.currentDiagnosisFix);
        const span = document.getElementById('btn-diagnosis-copy-fix')?.querySelector('span');
        if (span) {
          const original = span.textContent;
          span.textContent = 'Copiado!';
          setTimeout(() => { span.textContent = original; }, 1500);
        }
      }
    });
  }

  async callAI(action, payload) {
    if (this.isElectron && window.termix && window.termix.ai) {
      if (action === 'getConfig') return await window.termix.ai.getConfig();
      if (action === 'saveConfig') return await window.termix.ai.saveConfig(payload);
      if (action === 'testConnection') return await window.termix.ai.testConnection(payload);
      if (action === 'generateCommand') return await window.termix.ai.generateCommand(payload);
      if (action === 'diagnoseError') return await window.termix.ai.diagnoseError(payload);
      if (action === 'explainCommand') return await window.termix.ai.explainCommand(payload);
      if (action === 'summarizeBroadcast') return await window.termix.ai.summarizeBroadcast(payload);
    } else {
      const isGet = action.startsWith('get') || action === 'getConfig';
      const endpoint = action === 'getConfig' ? 'config' : action;
      const res = await fetch(`/api/ai/${endpoint}`, {
        method: isGet ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: isGet ? undefined : JSON.stringify(payload)
      });
      return await res.json();
    }
  }

  copyToClipboard(text) {
    if (!text) return;
    if (this.isElectron && window.termix && window.termix.writeClipboard) {
      window.termix.writeClipboard(text);
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  getActiveTerminalContext() {
    const term = this.activeTerminalId ? this.terminals.get(this.activeTerminalId) : null;
    if (!term) {
      return {
        platform: this.isElectron ? window.termix.platform : 'darwin',
        shell: 'zsh',
        hostName: 'Local',
        isSSH: false,
        cwd: '~',
        recentOutput: ''
      };
    }

    const isSSH = Boolean(term.title && term.title.toLowerCase().includes('ssh'));
    return {
      platform: this.isElectron ? window.termix.platform : 'darwin',
      shell: term.shell || 'zsh',
      hostName: term.title || 'Terminal',
      isSSH,
      cwd: term.cwd || '~',
      recentOutput: term.getRecentOutput(30)
    };
  }

  openAICopilot(targetTermId = null) {
    if (targetTermId) {
      this.setActiveTerminal(targetTermId);
    }

    const term = this.activeTerminalId ? this.terminals.get(this.activeTerminalId) : null;
    if (this.copilotContextPillEl) {
      if (term) {
        this.copilotContextPillEl.textContent = `✦ ${term.title} (${term.shell || 'shell'})`;
        this.copilotContextPillEl.title = `Terminal ID: ${term.id}`;
      } else {
        this.copilotContextPillEl.textContent = 'Nenhum terminal ativo';
      }
    }

    // Limpa estado anterior se houver
    this.aiErrorBannerEl?.classList.add('hidden');
    this.aiLoadingStateEl?.classList.add('hidden');
    this.aiResultCardEl?.classList.add('hidden');

    this.aiCopilotModalEl?.classList.remove('hidden');
    setTimeout(() => {
      this.aiPromptInputEl?.focus();
      this.aiPromptInputEl?.select();
    }, 50);
  }

  async generateAICommand() {
    const prompt = this.aiPromptInputEl?.value?.trim();
    if (!prompt) return;

    this.aiErrorBannerEl?.classList.add('hidden');
    this.aiResultCardEl?.classList.add('hidden');
    this.aiLoadingStateEl?.classList.remove('hidden');

    try {
      const context = this.getActiveTerminalContext();
      const res = await this.callAI('generateCommand', { prompt, context });

      this.aiLoadingStateEl?.classList.add('hidden');

      if (!res || res.error) {
        throw new Error(res?.error || 'Falha ao gerar comando.');
      }

      this.lastGeneratedCommand = res.command || '';
      if (this.aiSuggestedCodeEl) {
        this.aiSuggestedCodeEl.textContent = res.command || '';
      }
      if (this.aiExplanationTextEl) {
        this.aiExplanationTextEl.textContent = res.explanation || 'Comando pronto para execução.';
      }

      // Alerta de comando de risco
      if (res.isDangerous && this.aiDangerWarningEl) {
        this.aiDangerWarningEl.classList.remove('hidden');
        if (this.aiDangerTextEl) {
          this.aiDangerTextEl.textContent = res.riskWarning || 'Este comando pode modificar ou remover arquivos do sistema.';
        }
      } else {
        this.aiDangerWarningEl?.classList.add('hidden');
      }

      this.aiResultCardEl?.classList.remove('hidden');
    } catch (err) {
      this.aiLoadingStateEl?.classList.add('hidden');
      if (this.aiErrorMessageEl) {
        this.aiErrorMessageEl.textContent = err.message || 'Erro ao processar comando com IA.';
      }
      this.aiErrorBannerEl?.classList.remove('hidden');
    }
  }

  insertCommandToActiveTerminal(command, executeNow = false) {
    if (!this.activeTerminalId && this.terminals.size > 0) {
      this.setActiveTerminal(Array.from(this.terminals.keys())[0]);
    }
    if (this.activeTerminalId) {
      this.insertCommandToTerminal(this.activeTerminalId, command, executeNow);
    }
  }

  insertCommandToTerminal(termId, command, executeNow = false) {
    const inst = this.terminals.get(termId);
    if (!inst) return;
    const finalCmd = executeNow ? `${command}\r` : command;
    this.sendInput(termId, finalCmd);
    inst.focus();
  }

  async openErrorDiagnosis(termId) {
    const inst = this.terminals.get(termId);
    if (!inst) return;

    this.diagnosisTargetTermId = termId;
    this.currentDiagnosisFix = '';

    const titleEl = document.getElementById('diagnosis-term-title');
    if (titleEl) {
      titleEl.textContent = `Analisando erro em: ${inst.title}`;
    }

    const hostBadge = document.getElementById('diagnosis-host-badge');
    if (hostBadge) {
      hostBadge.textContent = inst.title.includes('SSH') ? 'SSH Remoto' : 'Local';
    }

    const loadingEl = document.getElementById('diagnosis-loading');
    const contentEl = document.getElementById('diagnosis-content');
    loadingEl?.classList.remove('hidden');
    contentEl?.classList.add('hidden');

    this.aiDiagnosisModalEl?.classList.remove('hidden');

    try {
      const recentOutput = inst.getRecentOutput(50);
      const res = await this.callAI('diagnoseError', {
        command: '',
        errorText: recentOutput,
        exitCode: inst.exitCode || null,
        context: {
          platform: this.isElectron ? window.termix.platform : 'darwin',
          isSSH: inst.title.includes('SSH'),
          cwd: inst.cwd || '~'
        }
      });

      loadingEl?.classList.add('hidden');

      if (!res || res.error) {
        throw new Error(res?.error || 'Falha ao diagnosticar erro.');
      }

      const rootCauseEl = document.getElementById('diagnosis-root-cause');
      if (rootCauseEl) rootCauseEl.textContent = res.rootCause || 'Falha de Execução';
      const diagTextEl = document.getElementById('diagnosis-text');
      if (diagTextEl) diagTextEl.textContent = res.diagnosis || 'Erro detectado no terminal.';

      const fixContainer = document.getElementById('diagnosis-fix-container');
      const applyBtn = document.getElementById('btn-diagnosis-apply-fix');

      if (res.fixCommand) {
        this.currentDiagnosisFix = res.fixCommand;
        const fixCodeEl = document.getElementById('diagnosis-fix-code');
        if (fixCodeEl) fixCodeEl.textContent = res.fixCommand;
        const fixExplEl = document.getElementById('diagnosis-fix-explanation');
        if (fixExplEl) fixExplEl.textContent = res.explanation || '';
        fixContainer?.classList.remove('hidden');
        applyBtn?.classList.remove('hidden');
      } else {
        fixContainer?.classList.add('hidden');
        applyBtn?.classList.add('hidden');
      }

      const prevBox = document.getElementById('diagnosis-preventive-box');
      if (res.preventiveTip) {
        const prevTextEl = document.getElementById('diagnosis-preventive-text');
        if (prevTextEl) prevTextEl.textContent = res.preventiveTip;
        prevBox?.classList.remove('hidden');
      } else {
        prevBox?.classList.add('hidden');
      }

      contentEl?.classList.remove('hidden');
    } catch (err) {
      loadingEl?.classList.add('hidden');
      const diagTextEl = document.getElementById('diagnosis-text');
      if (diagTextEl) diagTextEl.textContent = `Falha na análise: ${err.message}`;
      contentEl?.classList.remove('hidden');
    }
  }

  async openBroadcastAISummary() {
    if (this.terminals.size === 0) {
      alert('Nenhum terminal ativo para resumir.');
      return;
    }

    const broadcastCmd = this.broadcastInputEl?.value?.trim() || 'Comando transmitido aos terminais';
    const outputs = [];

    for (const [id, inst] of this.terminals) {
      outputs.push({
        title: inst.title,
        host: inst.title.includes('SSH') ? 'SSH' : 'Local',
        exitCode: inst.exitCode || 0,
        output: inst.getRecentOutput(35)
      });
    }

    const loadingEl = document.getElementById('broadcast-ai-loading');
    const contentEl = document.getElementById('broadcast-ai-content');
    loadingEl?.classList.remove('hidden');
    contentEl?.classList.add('hidden');

    this.aiBroadcastModalEl?.classList.remove('hidden');

    try {
      const res = await this.callAI('summarizeBroadcast', {
        broadcastCommand: broadcastCmd,
        outputs
      });

      loadingEl?.classList.add('hidden');

      if (!res || res.error) {
        throw new Error(res?.error || 'Falha ao resumir broadcast.');
      }

      const totalEl = document.getElementById('broadcast-metric-total');
      if (totalEl) totalEl.textContent = res.totalHosts || outputs.length;
      const successEl = document.getElementById('broadcast-metric-success');
      if (successEl) successEl.textContent = res.successfulHosts || 0;
      const failedEl = document.getElementById('broadcast-metric-failed');
      if (failedEl) failedEl.textContent = res.failedHosts || 0;

      const summaryTextEl = document.getElementById('broadcast-summary-text');
      if (summaryTextEl) summaryTextEl.textContent = res.summary || 'Resumo concluído.';

      const anomaliesList = document.getElementById('broadcast-anomalies-list');
      if (anomaliesList) {
        anomaliesList.innerHTML = '';
        if (res.anomalies && res.anomalies.length > 0) {
          res.anomalies.forEach(ano => {
            const item = document.createElement('div');
            item.className = 'broadcast-anomaly-item';
            item.innerHTML = `
              <span class="anomaly-host">${ano.host || 'Host'}:</span>
              <span>${ano.issue || ''}</span>
            `;
            anomaliesList.appendChild(item);
          });
          document.getElementById('broadcast-anomalies-section')?.classList.remove('hidden');
        } else {
          anomaliesList.innerHTML = '<span style="font-size: 0.82rem; color: #10b981;">✓ Nenhuma discrepância ou erro encontrado em nenhum host.</span>';
        }
      }

      const recBox = document.getElementById('broadcast-recommendation-box');
      if (res.actionRecommended) {
        const recTextEl = document.getElementById('broadcast-recommendation-text');
        if (recTextEl) recTextEl.textContent = res.actionRecommended;
        recBox?.classList.remove('hidden');
      } else {
        recBox?.classList.add('hidden');
      }

      contentEl?.classList.remove('hidden');
    } catch (err) {
      loadingEl?.classList.add('hidden');
      const summaryTextEl = document.getElementById('broadcast-summary-text');
      if (summaryTextEl) summaryTextEl.textContent = `Falha ao processar resumo: ${err.message}`;
      contentEl?.classList.remove('hidden');
    }
  }

  async openAISettings() {
    try {
      this.clearKeyForProvider = {};
      const config = await this.callAI('getConfig');
      this.aiConfigCache = config;

      if (config) {
        const selectProvider = document.getElementById('ai-select-provider');
        if (selectProvider) {
          selectProvider.value = config.provider || 'gemini';
          selectProvider.dispatchEvent(new Event('change'));
        }

        const inputModel = document.getElementById('ai-input-model');
        if (inputModel && config.model) {
          inputModel.value = config.model;
        }

        const selectRegion = document.getElementById('ai-select-region');
        if (selectRegion && config.region) {
          selectRegion.value = config.region;
        }

        const inputBaseUrl = document.getElementById('ai-input-baseurl');
        if (inputBaseUrl) {
          inputBaseUrl.value = config.baseUrl || '';
        }

        const checkRedact = document.getElementById('ai-check-redact');
        if (checkRedact) {
          checkRedact.checked = config.redactSecrets !== false;
        }
      }

      const testStatus = document.getElementById('ai-test-status');
      testStatus?.classList.add('hidden');

      // Sincroniza seletor de idioma
      const selectLang = document.getElementById('settings-select-language');
      if (selectLang && window.i18n) {
        selectLang.value = window.i18n.getLanguage();
      }

      this.aiSettingsModalEl?.classList.remove('hidden');
    } catch (err) {
      console.error('[Termix AI] Erro ao carregar configurações:', err);
    }
  }

  async saveAISettings() {
    const provider = document.getElementById('ai-select-provider')?.value || 'gemini';
    const model = document.getElementById('ai-input-model')?.value?.trim() || 'gemini-2.5-flash';
    const region = document.getElementById('ai-select-region')?.value || 'us-east-1';
    const apiKey = document.getElementById('ai-input-apikey')?.value || '';
    const baseUrl = document.getElementById('ai-input-baseurl')?.value || '';
    const redactSecrets = document.getElementById('ai-check-redact')?.checked;
    const clearKey = Boolean(this.clearKeyForProvider?.[provider]);

    try {
      const savedConfig = await this.callAI('saveConfig', {
        provider,
        model,
        region,
        apiKey,
        baseUrl,
        clearKey,
        redactSecrets
      });

      // Salva idioma se alterado
      const selectLang = document.getElementById('settings-select-language');
      if (selectLang && selectLang.value) {
        await this.changeLanguage(selectLang.value);
      }

      this.aiConfigCache = savedConfig;
      this.clearKeyForProvider = {};

      const testStatus = document.getElementById('ai-test-status');
      if (testStatus) {
        testStatus.className = 'ai-test-status success';
        testStatus.textContent = 'Configurações de IA salvas com sucesso!';
        testStatus.classList.remove('hidden');
      }

      setTimeout(() => {
        this.aiSettingsModalEl?.classList.add('hidden');
      }, 900);
    } catch (err) {
      const testStatus = document.getElementById('ai-test-status');
      if (testStatus) {
        testStatus.className = 'ai-test-status error';
        testStatus.textContent = `Erro ao salvar: ${err.message}`;
        testStatus.classList.remove('hidden');
      }
    }
  }

  async testAIConnection() {
    const btn = document.getElementById('btn-test-ai-connection');
    const spinner = btn?.querySelector('.test-spinner');
    const testStatus = document.getElementById('ai-test-status');

    spinner?.classList.remove('hidden');
    testStatus?.classList.add('hidden');

    const provider = document.getElementById('ai-select-provider')?.value || 'gemini';
    const model = document.getElementById('ai-input-model')?.value?.trim() || 'gemini-2.5-flash';
    const region = document.getElementById('ai-select-region')?.value || 'us-east-1';
    const apiKey = document.getElementById('ai-input-apikey')?.value || '';
    const baseUrl = document.getElementById('ai-input-baseurl')?.value || '';

    try {
      const res = await this.callAI('testConnection', {
        provider,
        model,
        region,
        apiKey,
        baseUrl
      });

      spinner?.classList.add('hidden');

      if (res && res.success) {
        testStatus.className = 'ai-test-status success';
        testStatus.textContent = `✓ Conexão bem-sucedida com [${res.provider.toUpperCase()} - ${res.model}]!`;
      } else {
        testStatus.className = 'ai-test-status error';
        testStatus.textContent = `✗ Falha na conexão: ${res?.error || 'Verifique sua chave de API e parâmetros.'}`;
      }
      testStatus?.classList.remove('hidden');
    } catch (err) {
      spinner?.classList.add('hidden');
      if (testStatus) {
        testStatus.className = 'ai-test-status error';
        testStatus.textContent = `✗ Erro: ${err.message}`;
        testStatus?.classList.remove('hidden');
      }
    }
  }

  /* ==========================================================================
     SISTEMA DE INTERNACIONALIZAÇÃO (i18n) & PREFERÊNCIAS
     ========================================================================== */

  /**
   * Inicializa o suporte a múltiplos idiomas (pt, en, es) e sincroniza com o banco
   */
  async initI18n() {
    if (!window.i18n) return;

    // Carrega preferência de idioma persistida no backend
    try {
      const savedLang = await this.getAppSetting('app_language');
      if (savedLang && ['pt', 'en', 'es'].includes(savedLang)) {
        window.i18n.setLanguage(savedLang);
      }
    } catch (e) {
      console.warn('[Termix] Falha ao carregar idioma do banco:', e.message);
    }

    // Reage a alterações de idioma
    window.i18n.onLanguageChange(() => {
      this.setLayout(this.currentLayout);
      this.updateGridState();
      this.updateExportCountsPreview();
    });

    // Seletor de idioma na modal de configurações
    const langSelect = document.getElementById('settings-select-language');
    langSelect?.addEventListener('change', (e) => {
      this.changeLanguage(e.target.value);
    });
  }

  /**
   * Altera o idioma ativo do Termix em tempo real e sincroniza com o armazenamento
   */
  async changeLanguage(lang, persistBackend = true) {
    if (!window.i18n || !lang) return;
    window.i18n.setLanguage(lang);

    this.languageDropdownMenuEl?.classList.add('hidden');
    this.languageDropdownBtnEl?.setAttribute('aria-expanded', 'false');

    if (persistBackend) {
      try {
        await this.saveAppSetting('app_language', lang);
      } catch (err) {
        console.warn('[Termix] Falha ao persistir idioma no backend:', err.message);
      }
    }
  }

  /**
   * Lê uma configuração geral do Termix
   */
  async getAppSetting(key) {
    try {
      if (this.isElectron && window.termix?.settings) {
        return await window.termix.settings.get(key);
      }
      const res = await fetch(`/api/settings/${encodeURIComponent(key)}`);
      const data = await res.json();
      return data?.value;
    } catch (err) {
      console.error(`[Termix] Falha ao obter setting [${key}]:`, err);
      return null;
    }
  }

  /**
   * Salva uma configuração geral do Termix
   */
  async saveAppSetting(key, value) {
    try {
      if (this.isElectron && window.termix?.settings) {
        return await window.termix.settings.save(key, value);
      }
      const res = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value })
      });
      return await res.json();
    } catch (err) {
      console.error(`[Termix] Falha ao salvar setting [${key}]:`, err);
      return null;
    }
  }

  /* ==========================================================================
     GERENCIADOR DE BACKUP (EXPORTAÇÃO & IMPORTAÇÃO DE CONFIGS E CREDENCIAIS)
     ========================================================================== */

  /**
   * Inicializa formulários, eventos de drag-and-drop e controles da modal de Backup
   */
  initBackupManager() {
    // Botões que abrem o gerenciador de backup
    document.getElementById('btn-open-backup')?.addEventListener('click', () => this.openBackupModal('export'));
    document.getElementById('btn-hosts-backup')?.addEventListener('click', () => this.openBackupModal('export'));
    document.getElementById('btn-identities-backup')?.addEventListener('click', () => this.openBackupModal('export'));
    document.getElementById('btn-settings-open-backup')?.addEventListener('click', () => this.openBackupModal('export'));

    // Botões de fechar e cancelar
    document.getElementById('btn-close-backup-modal')?.addEventListener('click', () => this.closeBackupModal());
    document.getElementById('btn-cancel-backup-export')?.addEventListener('click', () => this.closeBackupModal());
    document.getElementById('btn-cancel-backup-import')?.addEventListener('click', () => this.closeBackupModal());

    this.backupModalEl?.addEventListener('click', (e) => {
      if (e.target === this.backupModalEl) {
        this.closeBackupModal();
      }
    });

    // Alternar abas (Exportar / Importar)
    document.getElementById('tab-btn-export')?.addEventListener('click', () => this.switchBackupTab('export'));
    document.getElementById('tab-btn-import')?.addEventListener('click', () => this.switchBackupTab('import'));

    // Alternar modo de segurança no Export (Criptografado vs Aberto)
    const radioEncrypted = document.getElementById('radio-export-encrypted');
    const radioPlain = document.getElementById('radio-export-plain');
    const labelEncrypted = document.getElementById('label-security-encrypted');
    const labelPlain = document.getElementById('label-security-plain');
    const passFields = document.getElementById('export-password-fields');
    const plainFields = document.getElementById('export-plain-options');
    const btnExportText = document.getElementById('btn-export-text');

    const updateSecurityUI = () => {
      const isEnc = radioEncrypted ? radioEncrypted.checked : true;
      labelEncrypted?.classList.toggle('active', isEnc);
      labelPlain?.classList.toggle('active', !isEnc);
      passFields?.classList.toggle('hidden', !isEnc);
      plainFields?.classList.toggle('hidden', isEnc);
      if (btnExportText) {
        btnExportText.textContent = isEnc
          ? (window.t ? window.t('export_btn_action') : 'Baixar Arquivo de Backup (.termix)')
          : (window.t ? window.t('export_btn_action_json') : 'Baixar Arquivo JSON (.json)');
      }
    };

    radioEncrypted?.addEventListener('change', updateSecurityUI);
    radioPlain?.addEventListener('change', updateSecurityUI);

    // Botões de visualizar/ocultar senha no Export
    const togglePass = (inputEl, btnEl) => {
      if (!inputEl) return;
      const isPass = inputEl.type === 'password';
      inputEl.type = isPass ? 'text' : 'password';
      if (btnEl) btnEl.textContent = isPass ? '🙈' : '👁';
    };

    document.getElementById('btn-toggle-export-pass')?.addEventListener('click', (e) => {
      togglePass(document.getElementById('export-input-password'), e.currentTarget);
    });

    document.getElementById('btn-toggle-export-pass-confirm')?.addEventListener('click', (e) => {
      togglePass(document.getElementById('export-input-password-confirm'), e.currentTarget);
    });

    // Submissão do formulário de Exportar
    document.getElementById('form-backup-export')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleExecuteExport();
    });

    // Área de Upload e Drag-and-Drop do Import
    const dropzone = document.getElementById('import-dropzone');
    const fileInput = document.getElementById('import-file-input');
    const btnBrowse = document.getElementById('btn-browse-file');

    btnBrowse?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.isElectron && window.termix?.config?.openImportFile) {
        const res = await window.termix.config.openImportFile();
        if (res && res.success && res.content) {
          this.handleFileLoaded(res.content, res.fileName, res.sizeBytes);
          return;
        }
      }
      fileInput?.click();
    });

    dropzone?.addEventListener('click', (e) => {
      if (e.target !== btnBrowse) {
        btnBrowse?.click();
      }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzone?.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone?.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone?.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
          this.handleFileLoaded(event.target.result, file.name, file.size);
        };
        reader.readAsText(file);
      }
    });

    fileInput?.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        const file = files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
          this.handleFileLoaded(event.target.result, file.name, file.size);
        };
        reader.readAsText(file);
      }
    });

    // Remover arquivo selecionado no Import
    document.getElementById('btn-remove-import-file')?.addEventListener('click', () => {
      this.resetImportState();
    });

    // Botão de revelar senha no Import
    document.getElementById('btn-toggle-import-pass')?.addEventListener('click', (e) => {
      togglePass(document.getElementById('import-input-password'), e.currentTarget);
    });

    // Desbloquear preview com senha
    const btnUnlock = document.getElementById('btn-unlock-preview');
    const inputImportPass = document.getElementById('import-input-password');

    btnUnlock?.addEventListener('click', () => this.testImportDecryption());
    inputImportPass?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.testImportDecryption();
      }
    });

    // Submissão do formulário de Importar
    document.getElementById('form-backup-import')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleExecuteImport();
    });
  }

  /**
   * Abre a modal de backup na aba desejada
   */
  openBackupModal(initialTab = 'export') {
    this.backupModalEl?.classList.remove('hidden');
    this.switchBackupTab(initialTab);
    this.updateExportCountsPreview();
    this.hideBackupStatus(document.getElementById('export-status-box'));
    this.hideBackupStatus(document.getElementById('import-status-box'));
  }

  /**
   * Fecha a modal de backup
   */
  closeBackupModal() {
    this.backupModalEl?.classList.add('hidden');
  }

  /**
   * Alterna entre as abas Exportar e Importar
   */
  switchBackupTab(tab) {
    const isExport = tab === 'export';
    const tabBtnExport = document.getElementById('tab-btn-export');
    const tabBtnImport = document.getElementById('tab-btn-import');
    const viewExport = document.getElementById('backup-view-export');
    const viewImport = document.getElementById('backup-view-import');

    tabBtnExport?.classList.toggle('active', isExport);
    tabBtnImport?.classList.toggle('active', !isExport);
    viewExport?.classList.toggle('hidden', !isExport);
    viewImport?.classList.toggle('hidden', isExport);
  }

  /**
   * Atualiza a descrição de quantidades nos cards da aba de Exportação
   */
  updateExportCountsPreview() {
    const hostsDesc = document.getElementById('export-desc-hosts');
    const idDesc = document.getElementById('export-desc-identities');
    const wsDesc = document.getElementById('export-desc-workspaces');

    const hCount = (this.savedHosts && this.savedHosts.length) || 0;
    const iCount = (this.savedIdentities && this.savedIdentities.length) || 0;
    const wCount = (this.savedWorkspaces && this.savedWorkspaces.length) || 0;

    if (hostsDesc) {
      hostsDesc.textContent = `${hCount} hosts configurados, portas, diretórios e tags`;
    }
    if (idDesc) {
      idDesc.textContent = `${iCount} identidades salvas (senhas e chaves criptografadas)`;
    }
    if (wsDesc) {
      wsDesc.textContent = `${wCount} workspaces salvos e configurações de layout`;
    }
  }

  /**
   * Executa a exportação e download/salvamento do arquivo de backup
   */
  async handleExecuteExport() {
    const checkHosts = document.getElementById('export-check-hosts')?.checked;
    const checkIdentities = document.getElementById('export-check-identities')?.checked;
    const checkWorkspaces = document.getElementById('export-check-workspaces')?.checked;
    const checkSettings = document.getElementById('export-check-settings')?.checked;
    const isEncrypted = document.getElementById('radio-export-encrypted')?.checked;
    const statusBox = document.getElementById('export-status-box');
    const btnExport = document.getElementById('btn-do-export');
    const btnText = document.getElementById('btn-export-text');

    if (!checkHosts && !checkIdentities && !checkWorkspaces && !checkSettings) {
      this.showBackupStatus(statusBox, 'error', window.t ? window.t('export_error_no_selection') : 'Selecione ao menos um item para exportar.');
      return;
    }

    let password = '';
    if (isEncrypted) {
      const p1 = document.getElementById('export-input-password')?.value || '';
      const p2 = document.getElementById('export-input-password-confirm')?.value || '';
      if (!p1) {
        this.showBackupStatus(statusBox, 'error', window.t ? window.t('export_error_pass_required') : 'Informe uma senha para proteger o backup.');
        document.getElementById('export-input-password')?.focus();
        return;
      }
      if (p1.length < 4) {
        this.showBackupStatus(statusBox, 'error', window.t ? window.t('export_error_pass_short') : 'A senha deve ter pelo menos 4 caracteres.');
        document.getElementById('export-input-password')?.focus();
        return;
      }
      if (p1 !== p2) {
        this.showBackupStatus(statusBox, 'error', window.t ? window.t('export_error_pass_mismatch') : 'As senhas digitadas não coincidem.');
        document.getElementById('export-input-password-confirm')?.focus();
        return;
      }
      password = p1;
    }

    const includeCredentialsPlain = document.getElementById('export-check-plain-creds')?.checked;

    try {
      if (btnExport) btnExport.disabled = true;
      if (btnText) btnText.textContent = window.t ? window.t('export_generating') : 'Gerando arquivo de backup...';
      this.hideBackupStatus(statusBox);

      const options = {
        includeHosts: checkHosts,
        includeIdentities: checkIdentities,
        includeWorkspaces: checkWorkspaces,
        includeSettings: checkSettings,
        securityType: isEncrypted ? 'encrypted' : 'plain',
        password: isEncrypted ? password : '',
        includeCredentialsPlain: !isEncrypted && includeCredentialsPlain
      };

      const bundle = await this.exportConfig(options);
      if (!bundle || bundle.error) {
        throw new Error(bundle?.error || 'Falha ao gerar pacote de exportação.');
      }

      const ext = isEncrypted ? 'termix' : 'json';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const defaultFilename = `termix-backup-${timestamp}.${ext}`;
      const fileContent = typeof bundle === 'string' ? bundle : JSON.stringify(bundle, null, 2);

      if (this.isElectron && window.termix?.config?.saveExportFile) {
        const saveRes = await window.termix.config.saveExportFile(fileContent, defaultFilename);
        if (saveRes.canceled) {
          if (btnExport) btnExport.disabled = false;
          if (btnText) {
            btnText.textContent = isEncrypted
              ? (window.t ? window.t('export_btn_action') : 'Baixar Arquivo de Backup (.termix)')
              : (window.t ? window.t('export_btn_action_json') : 'Baixar Arquivo JSON (.json)');
          }
          return;
        }
        if (!saveRes.success) {
          throw new Error(saveRes.error || 'Falha ao salvar arquivo no disco.');
        }
        this.showBackupStatus(statusBox, 'success', `✓ Backup salvo com sucesso em: ${saveRes.filePath}`);
      } else {
        const blob = new Blob([fileContent], { type: isEncrypted ? 'application/octet-stream' : 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultFilename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 500);
        this.showBackupStatus(statusBox, 'success', `✓ Arquivo [${defaultFilename}] baixado com sucesso!`);
      }

      // Limpa os campos de senha
      const p1El = document.getElementById('export-input-password');
      const p2El = document.getElementById('export-input-password-confirm');
      if (p1El) p1El.value = '';
      if (p2El) p2El.value = '';

      setTimeout(() => {
        if (btnExport) btnExport.disabled = false;
        if (btnText) {
          btnText.textContent = isEncrypted
            ? (window.t ? window.t('export_btn_action') : 'Baixar Arquivo de Backup (.termix)')
            : (window.t ? window.t('export_btn_action_json') : 'Baixar Arquivo JSON (.json)');
        }
      }, 1500);
    } catch (err) {
      console.error('[Termix Backup] Erro na exportação:', err);
      this.showBackupStatus(statusBox, 'error', `Erro ao exportar: ${err.message}`);
      if (btnExport) btnExport.disabled = false;
      if (btnText) {
        btnText.textContent = isEncrypted
          ? (window.t ? window.t('export_btn_action') : 'Baixar Arquivo de Backup (.termix)')
          : (window.t ? window.t('export_btn_action_json') : 'Baixar Arquivo JSON (.json)');
      }
    }
  }

  /**
   * Processa o arquivo carregado no Import
   */
  async handleFileLoaded(content, fileName, sizeBytes) {
    this.currentImportFile = { content, fileName, sizeBytes };
    const dropzone = document.getElementById('import-dropzone');
    const fileCard = document.getElementById('import-file-card');
    const nameEl = document.getElementById('import-file-name');
    const metaEl = document.getElementById('import-file-meta');
    const encPrompt = document.getElementById('import-encrypted-prompt');
    const previewBox = document.getElementById('import-preview-box');
    const statusBox = document.getElementById('import-status-box');
    const btnImport = document.getElementById('btn-do-import');

    this.hideBackupStatus(statusBox);
    dropzone?.classList.add('hidden');
    fileCard?.classList.remove('hidden');

    if (nameEl) nameEl.textContent = fileName || 'backup.termix';
    const sizeKb = ((sizeBytes || content.length) / 1024).toFixed(1);
    if (metaEl) metaEl.textContent = `${sizeKb} KB • Carregado`;

    try {
      const preview = await this.previewImportConfig(content, '');
      if (!preview.valid) {
        this.showBackupStatus(statusBox, 'error', `Arquivo inválido ou corrompido: ${preview.error || 'Estrutura não reconhecida'}`);
        if (btnImport) btnImport.disabled = true;
        encPrompt?.classList.add('hidden');
        previewBox?.classList.add('hidden');
        return;
      }

      if (preview.encrypted) {
        encPrompt?.classList.remove('hidden');
        previewBox?.classList.add('hidden');
        if (btnImport) btnImport.disabled = true;
        const passInput = document.getElementById('import-input-password');
        if (passInput) {
          passInput.value = '';
          passInput.focus();
        }
      } else {
        encPrompt?.classList.add('hidden');
        this.renderImportPreview(preview);
        if (btnImport) btnImport.disabled = false;
      }
    } catch (err) {
      this.showBackupStatus(statusBox, 'error', `Falha ao inspecionar arquivo: ${err.message}`);
      if (btnImport) btnImport.disabled = true;
    }
  }

  /**
   * Testa a descriptografia do arquivo com a senha digitada
   */
  async testImportDecryption(password) {
    if (!this.currentImportFile) return;
    const pass = password !== undefined ? password : (document.getElementById('import-input-password')?.value || '');
    const statusBox = document.getElementById('import-status-box');
    const encPrompt = document.getElementById('import-encrypted-prompt');
    const previewBox = document.getElementById('import-preview-box');
    const btnImport = document.getElementById('btn-do-import');
    const btnUnlock = document.getElementById('btn-unlock-preview');

    if (!pass) {
      this.showBackupStatus(statusBox, 'error', window.t ? window.t('import_error_pass_required') : 'Por favor, digite a senha do backup.');
      document.getElementById('import-input-password')?.focus();
      return;
    }

    try {
      if (btnUnlock) btnUnlock.disabled = true;
      const preview = await this.previewImportConfig(this.currentImportFile.content, pass);
      if (btnUnlock) btnUnlock.disabled = false;

      if (preview && preview.passwordValid) {
        this.hideBackupStatus(statusBox);
        encPrompt?.classList.add('hidden');
        this.renderImportPreview(preview);
        if (btnImport) btnImport.disabled = false;
      } else {
        this.showBackupStatus(statusBox, 'error', preview?.error || (window.t ? window.t('import_error_pass_invalid') : 'Senha incorreta para este backup.'));
        if (btnImport) btnImport.disabled = true;
        previewBox?.classList.add('hidden');
        document.getElementById('import-input-password')?.select();
      }
    } catch (err) {
      if (btnUnlock) btnUnlock.disabled = false;
      this.showBackupStatus(statusBox, 'error', `Erro ao verificar senha: ${err.message}`);
    }
  }

  /**
   * Renderiza os pills de contagem do conteúdo do arquivo de backup
   */
  renderImportPreview(preview) {
    const previewBox = document.getElementById('import-preview-box');
    const dateEl = document.getElementById('import-preview-date');
    const pillsEl = document.getElementById('import-preview-pills');
    if (!previewBox || !pillsEl) return;

    const counts = preview.counts || {};
    if (dateEl && preview.timestamp) {
      try {
        dateEl.textContent = new Date(preview.timestamp).toLocaleString();
      } catch {
        dateEl.textContent = preview.timestamp;
      }
    }

    pillsEl.innerHTML = `
      <span class="preview-pill">🖥️ ${counts.hosts || 0} ${window.t ? window.t('backup_item_hosts') : 'Hosts'}</span>
      <span class="preview-pill">🔑 ${counts.identities || 0} ${window.t ? window.t('backup_item_identities') : 'Credenciais'}</span>
      <span class="preview-pill">🗂️ ${counts.workspaces || 0} ${window.t ? window.t('backup_item_workspaces') : 'Workspaces'}</span>
      <span class="preview-pill">${counts.settings ? '✓ ' + (window.t ? window.t('backup_item_settings') : 'Configurações de IA & Preferências') : '✕ Sem Configurações'}</span>
    `;

    previewBox.classList.remove('hidden');
  }

  /**
   * Reseta o estado do importador para permitir nova seleção de arquivo
   */
  resetImportState() {
    this.currentImportFile = null;
    const dropzone = document.getElementById('import-dropzone');
    const fileCard = document.getElementById('import-file-card');
    const encPrompt = document.getElementById('import-encrypted-prompt');
    const previewBox = document.getElementById('import-preview-box');
    const statusBox = document.getElementById('import-status-box');
    const btnImport = document.getElementById('btn-do-import');
    const fileInput = document.getElementById('import-file-input');
    const passInput = document.getElementById('import-input-password');

    if (fileInput) fileInput.value = '';
    if (passInput) passInput.value = '';
    dropzone?.classList.remove('hidden');
    fileCard?.classList.add('hidden');
    encPrompt?.classList.add('hidden');
    previewBox?.classList.add('hidden');
    this.hideBackupStatus(statusBox);
    if (btnImport) btnImport.disabled = true;
  }

  /**
   * Executa a importação dos dados selecionados
   */
  async handleExecuteImport() {
    if (!this.currentImportFile) return;
    const statusBox = document.getElementById('import-status-box');
    const btnImport = document.getElementById('btn-do-import');
    const btnText = document.getElementById('btn-import-text');
    const conflictRadio = document.querySelector('input[name="import-conflict-mode"]:checked');
    const conflictMode = conflictRadio?.value || 'merge';
    const password = document.getElementById('import-input-password')?.value || '';

    if (conflictMode === 'replace') {
      const confirmMsg = window.t ? window.t('import_confirm_replace') : 'Atenção: A opção "Substituir Tudo" apagará hosts, identidades e workspaces existentes no seu Termix antes de restaurar este backup. Deseja realmente prosseguir?';
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }

    try {
      if (btnImport) btnImport.disabled = true;
      if (btnText) btnText.textContent = window.t ? window.t('import_progress') : 'Restaurando dados...';
      this.hideBackupStatus(statusBox);

      const options = {
        password,
        conflictMode
      };

      const res = await this.importConfig(this.currentImportFile.content, options);
      if (!res || !res.success) {
        throw new Error(res?.error || 'Falha ao importar dados.');
      }

      const imp = res.imported || {};
      const successMsg = `✓ Restauração concluída com sucesso! (${imp.hosts || 0} hosts, ${imp.identities || 0} credenciais, ${imp.workspaces || 0} workspaces).`;
      this.showBackupStatus(statusBox, 'success', successMsg);

      // Atualiza listas e dados no dashboard
      await this.refreshHostsAndIdentities();
      await this.refreshWorkspaces();

      // Sincroniza idioma caso tenha sido importado
      try {
        const importedLang = await this.getAppSetting('app_language');
        if (importedLang && importedLang !== (window.i18n ? window.i18n.getLanguage() : 'pt')) {
          this.changeLanguage(importedLang, false);
        }
      } catch {}

      setTimeout(() => {
        this.closeBackupModal();
        this.resetImportState();
        if (btnImport) btnImport.disabled = false;
        if (btnText) btnText.textContent = window.t ? window.t('import_btn_action') : 'Importar e Restaurar Dados';
      }, 1800);
    } catch (err) {
      console.error('[Termix Backup] Erro na importação:', err);
      this.showBackupStatus(statusBox, 'error', `Falha na restauração: ${err.message}`);
      if (btnImport) btnImport.disabled = false;
      if (btnText) btnText.textContent = window.t ? window.t('import_btn_action') : 'Importar e Restaurar Dados';
    }
  }

  /**
   * Chamadas de API para Backup (compatíveis com Electron e Web)
   */
  async exportConfig(options) {
    if (this.isElectron && window.termix?.config?.export) {
      return await window.termix.config.export(options);
    }
    const res = await fetch('/api/config/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options)
    });
    return await res.json();
  }

  async previewImportConfig(payload, password = '') {
    if (this.isElectron && window.termix?.config?.preview) {
      return await window.termix.config.preview(payload, password);
    }
    const res = await fetch('/api/config/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, password })
    });
    return await res.json();
  }

  async importConfig(payload, options) {
    if (this.isElectron && window.termix?.config?.import) {
      return await window.termix.config.import(payload, options);
    }
    const res = await fetch('/api/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, options })
    });
    return await res.json();
  }

  showBackupStatus(el, type, message) {
    if (!el) return;
    el.className = `backup-status-box ${type}`;
    el.textContent = message;
    el.classList.remove('hidden');
  }

  hideBackupStatus(el) {
    if (!el) return;
    el.className = 'backup-status-box hidden';
    el.textContent = '';
  }
}

/**
 * Representa um bloco de terminal individual no dashboard
 */
class TerminalInstance {
  constructor(dashboard, id, title) {
    this.dashboard = dashboard;
    this.id = id;
    this.title = title;
    this.pid = null;
    this.shell = 'zsh';
    this.isMaximized = false;
    this.hostId = null;
    this.hostName = null;
    this.cwd = '';
    this.startupCommand = '';

    this.createDom();
    this.initXterm();
  }

  createDom() {
    this.cardEl = document.createElement('div');
    this.cardEl.className = 'terminal-card';
    this.cardEl.setAttribute('data-id', this.id);

    this.cardEl.innerHTML = `
      <div class="terminal-card-header">
        <div class="mac-traffic-lights">
          <span class="traffic-dot dot-close" data-i18n-title="term_close_title" title="${window.t ? window.t('term_close_title') : 'Fechar Terminal'}"></span>
          <span class="traffic-dot dot-clear" data-i18n-title="term_clear_title" title="${window.t ? window.t('term_clear_title') : 'Limpar Tela'}"></span>
          <span class="traffic-dot dot-max" data-i18n-title="term_maximize_title" title="${window.t ? window.t('term_maximize_title') : 'Maximizar / Restaurar'}"></span>
        </div>

        <div class="terminal-card-title" data-i18n-title="term_rename_title" title="${window.t ? window.t('term_rename_title') : 'Dê duplo-clique para renomear'}">
          <span class="title-text">${this.title}</span>
        </div>

        <div class="terminal-card-tools">
          <span class="term-badge pid-badge">PID: ...</span>
          <button class="btn-card-tool btn-ai-tool" data-i18n-title="btn_ai_title" title="${window.t ? window.t('btn_ai_title') : 'Assistente de IA / Copilot (⌘+I)'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"></path>
            </svg>
          </button>
          <button class="btn-card-tool btn-max-tool" data-i18n-title="term_maximize_title" title="${window.t ? window.t('term_maximize_title') : 'Maximizar / Restaurar'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </button>
          <button class="btn-card-tool btn-close-tool" data-i18n-title="term_close_title" title="${window.t ? window.t('term_close_title') : 'Fechar'}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="terminal-body" id="body-${this.id}"></div>
    `;

    this.dashboard.gridEl.appendChild(this.cardEl);

    this.bodyEl = this.cardEl.querySelector('.terminal-body');
    this.titleTextEl = this.cardEl.querySelector('.title-text');
    this.pidBadgeEl = this.cardEl.querySelector('.pid-badge');
    this.btnAiTool = this.cardEl.querySelector('.btn-ai-tool');

    this.bindDomEvents();
  }

  bindDomEvents() {
    this.cardEl.addEventListener('click', () => {
      this.dashboard.setActiveTerminal(this.id);
      this.focus();
    });

    this.btnAiTool?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dashboard.setActiveTerminal(this.id);
      if (this.hasExitError) {
        this.dashboard.openErrorDiagnosis(this.id);
      } else {
        this.dashboard.openAICopilot(this.id);
      }
    });

    this.cardEl.querySelector('.dot-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.dashboard.removeTerminal(this.id);
    });
    this.cardEl.querySelector('.btn-close-tool').addEventListener('click', (e) => {
      e.stopPropagation();
      this.dashboard.removeTerminal(this.id);
    });

    this.cardEl.querySelector('.dot-clear').addEventListener('click', (e) => {
      e.stopPropagation();
      this.term.clear();
      this.focus();
    });

    this.cardEl.querySelector('.dot-max').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMaximize();
    });
    this.cardEl.querySelector('.btn-max-tool').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMaximize();
    });

    const titleContainer = this.cardEl.querySelector('.terminal-card-title');
    titleContainer.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.startEditingTitle();
    });
  }

  startEditingTitle() {
    const currentTitle = this.titleTextEl.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'terminal-title-input';
    input.value = currentTitle;

    this.titleTextEl.replaceWith(input);
    input.focus();
    input.select();

    const save = () => {
      const newTitle = input.value.trim() || currentTitle;
      this.title = newTitle;
      this.titleTextEl.textContent = newTitle;
      input.replaceWith(this.titleTextEl);
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        save();
      } else if (e.key === 'Escape') {
        input.value = currentTitle;
        save();
      }
    });
  }

  initXterm() {
    const currentTheme = this.dashboard.currentTheme || 'dark';
    const activeXtermTheme = XTERM_THEMES[currentTheme] || XTERM_THEMES.dark;

    this.term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      lineHeight: 1.25,
      letterSpacing: 0,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Monaco, Consolas, monospace",
      allowProposedApi: true,
      theme: activeXtermTheme,
      scrollback: 15000,
      scrollOnUserInput: true,
      smoothScrollDuration: 0,
      convertEol: true
    });

    const FitClass = (typeof FitAddon !== 'undefined' && FitAddon.FitAddon)
      ? FitAddon.FitAddon
      : (typeof FitAddon === 'function' ? FitAddon : null);

    if (FitClass) {
      this.fitAddon = new FitClass();
      this.term.loadAddon(this.fitAddon);
    }

    const WebLinksClass = (typeof WebLinksAddon !== 'undefined' && WebLinksAddon.WebLinksAddon)
      ? WebLinksAddon.WebLinksAddon
      : (typeof WebLinksAddon === 'function' ? WebLinksAddon : null);

    if (WebLinksClass) {
      this.term.loadAddon(new WebLinksClass());
    }

    this.term.open(this.bodyEl);

    // Garante que o helper textarea do xterm fique estritamente fora da tela e sem margem no topo
    const helperTextarea = this.bodyEl.querySelector('.xterm-helper-textarea');
    if (helperTextarea) {
      helperTextarea.style.position = 'absolute';
      helperTextarea.style.opacity = '0';
      helperTextarea.style.left = '-99999px';
      helperTextarea.style.top = '-99999px';
      helperTextarea.style.width = '0px';
      helperTextarea.style.height = '0px';
      helperTextarea.style.margin = '0px';
      helperTextarea.style.padding = '0px';
      helperTextarea.style.border = 'none';
      helperTextarea.style.outline = 'none';
      helperTextarea.style.pointerEvents = 'none';
    }

    // Gerenciador de atalhos de teclado (Cmd+C, Cmd+V, Cmd+A, Cmd+K)
    this.term.attachCustomKeyEventHandler((e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (e.type === 'keydown') {
        // Cmd+C / Ctrl+C: Copiar texto selecionado
        if (isCmdOrCtrl && (e.code === 'KeyC' || e.key === 'c' || e.key === 'C')) {
          if (this.term.hasSelection()) {
            this.copySelection();
            return false;
          }
          // No macOS, se Cmd+C for pressionado sem seleção ativa, previne apagar clipboard
          if (isMac && e.metaKey) {
            return false;
          }
          // Ctrl+C normal envia sinal SIGINT (\x03)
          return true;
        }

        // Cmd+V / Ctrl+V: Deixar o evento nativo de 'paste' agir
        // Retornar false impede que o xterm trate a tecla como entrada direta de caractere (ex: '^V' no Linux),
        // permitindo que o evento nativo DOM 'paste' disparado pelo Electron/navegador seja tratado pelo xterm exatamente uma vez.
        if (isCmdOrCtrl && (e.code === 'KeyV' || e.key === 'v' || e.key === 'V')) {
          return false;
        }

        // Cmd+A / Ctrl+A: Selecionar todo o buffer do terminal
        if (isCmdOrCtrl && (e.code === 'KeyA' || e.key === 'a' || e.key === 'A')) {
          this.term.selectAll();
          return false;
        }

        // Cmd+K: Limpar terminal (padrão nativo do macOS)
        if (isMac && e.metaKey && (e.code === 'KeyK' || e.key === 'k' || e.key === 'K')) {
          this.term.clear();
          return false;
        }

        // Cmd+I / Ctrl+I: Abrir Assistente de IA / Copilot para este terminal
        if (isCmdOrCtrl && (e.code === 'KeyI' || e.key === 'i' || e.key === 'I')) {
          this.dashboard.openAICopilot(this.id);
          return false;
        }
      }

      return true;
    });

    // Entrada do teclado enviada para o Electron IPC ou WebSocket
    this.term.onData((data) => {
      this.dashboard.sendInput(this.id, data);
    });

    this.resizeObserver = new ResizeObserver(() => {
      this.fit();
    });
    this.resizeObserver.observe(this.bodyEl);

    setTimeout(() => {
      this.fit();
      this.focus();
    }, 50);
  }

  copySelection() {
    const text = this.term.getSelection();
    if (!text) return;

    if (this.dashboard.isElectron && window.termix && window.termix.writeClipboard) {
      window.termix.writeClipboard(text);
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  async pasteFromClipboard() {
    let text = '';
    try {
      if (this.dashboard.isElectron && window.termix && window.termix.readClipboard) {
        text = await window.termix.readClipboard();
      } else if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch (err) {
      console.warn('[Termix] Falha ao ler clipboard:', err);
    }

    if (text) {
      if (this.term && typeof this.term.paste === 'function') {
        this.term.paste(text);
      } else {
        this.dashboard.sendInput(this.id, text);
      }
    }
  }

  fit() {
    if (!this.fitAddon || !this.bodyEl || this.bodyEl.clientHeight === 0) return;

    try {
      this.fitAddon.fit();
      const cols = this.term.cols;
      const rows = this.term.rows;

      if (cols > 0 && rows > 0) {
        this.dashboard.sendResize(this.id, cols, rows);
      }
    } catch (e) {
      // Ignora pequenos desajustes transitórios
    }
  }

  focus() {
    if (this.term) {
      this.term.focus();
    }
  }

  toggleMaximize() {
    this.isMaximized = !this.isMaximized;
    this.cardEl.classList.toggle('maximized', this.isMaximized);

    const toolBtn = this.cardEl.querySelector('.btn-max-tool');
    if (this.isMaximized) {
      toolBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>
        </svg>
      `;
      toolBtn.title = "Restaurar tamanho";
    } else {
      toolBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
        </svg>
      `;
      toolBtn.title = "Maximizar";
    }

    setTimeout(() => {
      this.fit();
      this.focus();
    }, 50);
  }

  handleCreated(msg) {
    this.pid = msg.pid;
    this.shell = msg.shell;
    this.pidBadgeEl.textContent = `PID: ${this.pid} (${this.shell})`;
    if (msg.title && this.titleTextEl) {
      this.titleTextEl.textContent = msg.title;
      this.title = msg.title;
    }
  }

  handleExit(exitCode) {
    this.exitCode = exitCode;
    this.term.writeln(`\r\n\x1b[33m[Processo finalizado com código ${exitCode}]\x1b[0m\r\n`);
    this.pidBadgeEl.textContent = `Encerrado (${exitCode})`;
    this.pidBadgeEl.style.color = '#f43f5e';

    if (exitCode !== 0 && exitCode !== null) {
      this.hasExitError = true;
      if (this.btnAiTool) {
        this.btnAiTool.classList.add('btn-ai-error-pulse');
        this.btnAiTool.title = `Erro detectado (código ${exitCode}). Clique para diagnosticar com IA!`;
      }
    }
  }

  getRecentOutput(lineCount = 40) {
    if (!this.term || !this.term.buffer || !this.term.buffer.active) return '';
    try {
      const buf = this.term.buffer.active;
      const lines = [];
      const start = Math.max(0, buf.length - lineCount);
      for (let i = start; i < buf.length; i++) {
        const line = buf.getLine(i);
        if (line) lines.push(line.translateToString(true));
      }
      return lines.join('\n').trim();
    } catch (_) {
      return '';
    }
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.term) {
      this.term.dispose();
    }
    if (this.cardEl && this.cardEl.parentNode) {
      this.cardEl.parentNode.removeChild(this.cardEl);
    }
  }
}

// Inicializa no carregamento do DOM
window.addEventListener('DOMContentLoaded', () => {
  window.termixApp = new TermixDashboard();
});
