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

    // Inicializa o tema visual
    this.applyTheme(this.currentTheme);

    if (this.isElectron) {
      document.body.classList.add('electron-app');
      this.initElectronBridge();
    } else {
      this.initWebSocket();
    }

    this.initGlobalEvents();
  }

  /**
   * Comunicação Nativa IPC do Electron (Sem portas TCP/HTTP, sem conflito com Docker)
   */
  initElectronBridge() {
    console.log('[Termix] Modo Electron Nativo Ativado');
    this.updateStatusBadge('connected', 'Electron Nativo');

    // Carrega informações do sistema
    window.termix.getSystemInfo().then(info => {
      if (this.systemInfoEl) {
        this.systemInfoEl.textContent = `${info.platform} (${info.defaultShell}) • ${info.hostname}`;
      }
    });

    // Registra listeners de saída do terminal
    window.termix.onCreated((msg) => {
      const instance = this.terminals.get(msg.id);
      if (instance) instance.handleCreated(msg);
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
          const instance = this.terminals.get(id);
          if (instance) instance.handleCreated(msg);
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

      if (e.key === 'Escape') {
        this.helpModalEl.classList.add('hidden');
        this.broadcastBarEl.classList.add('hidden');
      }
    });

    // Auto fit ao redimensionar a janela do navegador
    let resizeDebounce = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => this.fitAll(), 100);
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
      theme: activeXtermTheme
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
