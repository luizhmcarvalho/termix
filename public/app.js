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

    // Modais e Estado de Hosts & Identidades (Estilo Termius)
    this.hostsModalEl = document.getElementById('hosts-modal');
    this.hostFormModalEl = document.getElementById('host-form-modal');
    this.identityFormModalEl = document.getElementById('identity-form-modal');
    this.savedHosts = [];
    this.savedIdentities = [];
    this.hostsFilterType = 'all';
    this.hostsSearchQuery = '';
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

    this.initGlobalEvents();
    this.initHostsManager();
    this.initWorkspacesManager();
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
      'auto': 'Auto',
      '1col': '1 Col',
      '2col': '2 Col',
      '3col': '3 Col'
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

      if (e.key === 'Escape') {
        layoutDropdownMenu?.classList.add('hidden');
        btnLayoutDropdown?.setAttribute('aria-expanded', 'false');
        this.helpModalEl?.classList.add('hidden');
        this.broadcastBarEl?.classList.add('hidden');
        this.hostFormModalEl?.classList.add('hidden');
        this.identityFormModalEl?.classList.add('hidden');
        this.hostsModalEl?.classList.add('hidden');
        this.workspaceFormModalEl?.classList.add('hidden');
        this.workspacesModalEl?.classList.add('hidden');
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

  renderHostsList() {
    const container = document.getElementById('hosts-list');
    const emptyEl = document.getElementById('hosts-empty');
    if (!container) return;

    container.innerHTML = '';

    const query = (this.hostsSearchQuery || '').toLowerCase().trim();
    const typeFilter = this.hostsFilterType || 'all';

    const filtered = this.savedHosts.filter(h => {
      if (typeFilter !== 'all' && h.host_type !== typeFilter) return false;
      if (!query) return true;

      const nameMatch = (h.name || '').toLowerCase().includes(query);
      const hostMatch = (h.hostname || '').toLowerCase().includes(query);
      const tagsMatch = Array.isArray(h.tags) && h.tags.some(t => t.toLowerCase().includes(query));
      const pathMatch = (h.default_path || '').toLowerCase().includes(query);
      const cmdMatch = (h.startup_command || '').toLowerCase().includes(query);
      return nameMatch || hostMatch || tagsMatch || pathMatch || cmdMatch;
    });

    if (filtered.length === 0) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    } else {
      if (emptyEl) emptyEl.classList.add('hidden');
    }

    filtered.forEach(host => {
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
          tagPill.textContent = tag;
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

      container.appendChild(card);
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
          <span class="traffic-dot dot-close" title="Fechar Terminal"></span>
          <span class="traffic-dot dot-clear" title="Limpar Tela"></span>
          <span class="traffic-dot dot-max" title="Maximizar / Restaurar"></span>
        </div>

        <div class="terminal-card-title" title="Dê duplo-clique para renomear">
          <span class="title-text">${this.title}</span>
        </div>

        <div class="terminal-card-tools">
          <span class="term-badge pid-badge">PID: ...</span>
          <button class="btn-card-tool btn-max-tool" title="Maximizar / Restaurar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </button>
          <button class="btn-card-tool btn-close-tool" title="Fechar">
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

    this.bindDomEvents();
  }

  bindDomEvents() {
    this.cardEl.addEventListener('click', () => {
      this.dashboard.setActiveTerminal(this.id);
      this.focus();
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

        // Cmd+V / Ctrl+V: Colar da área de transferência
        if (isCmdOrCtrl && (e.code === 'KeyV' || e.key === 'v' || e.key === 'V')) {
          this.pasteFromClipboard();
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
      this.dashboard.sendInput(this.id, text);
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
    this.term.writeln(`\r\n\x1b[33m[Processo finalizado com código ${exitCode}]\x1b[0m\r\n`);
    this.pidBadgeEl.textContent = `Encerrado (${exitCode})`;
    this.pidBadgeEl.style.color = '#f43f5e';
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
