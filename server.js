/**
 * Termix - Multi-Terminal Local Dashboard para macOS
 * Servidor Backend Node.js com WebSockets e node-pty.
 */

// Executa verificação de permissões do macOS antes de inicializar o PTY
require('./fix-permissions');

const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');

const PORT = process.env.PORT || 3333;
const HOST = process.env.HOST || '127.0.0.1';

// Detecta o shell padrão do sistema operacional (zsh como padrão moderno no macOS)
const DEFAULT_SHELL = process.env.SHELL || '/bin/zsh';
const DEFAULT_CWD = process.env.HOME || process.cwd();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Armazena todas as instâncias de pseudoterminais ativas: Map<terminalId, { id, ptyProcess, ws, title, createdAt }>
const terminals = new Map();

// Servir arquivos estáticos do frontend
app.use(express.static(path.join(__dirname, 'public')));

// Servir bibliotecas xterm.js diretamente do node_modules (permite funcionamento 100% offline)
app.use('/vendor/@xterm/xterm', express.static(path.join(__dirname, 'node_modules/@xterm/xterm')));
app.use('/vendor/@xterm/addon-fit', express.static(path.join(__dirname, 'node_modules/@xterm/addon-fit')));
app.use('/vendor/@xterm/addon-web-links', express.static(path.join(__dirname, 'node_modules/@xterm/addon-web-links')));

// Rota de status da API
app.get('/api/status', (req, res) => {
  const terminalList = Array.from(terminals.values()).map(t => ({
    id: t.id,
    pid: t.ptyProcess.pid,
    title: t.title,
    createdAt: t.createdAt
  }));

  res.json({
    status: 'online',
    platform: process.platform,
    arch: process.arch,
    defaultShell: DEFAULT_SHELL,
    activeTerminalsCount: terminals.size,
    terminals: terminalList
  });
});

/**
 * Cria uma nova instância de terminal pseudoterminal (node-pty)
 */
function createTerminalSession(ws, options = {}) {
  const {
    id = `term-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    cols = 80,
    rows = 24,
    shell = DEFAULT_SHELL,
    cwd = DEFAULT_CWD,
    title = 'Terminal'
  } = options;

  try {
    // Configura variáveis de ambiente ideais para terminal 256 cores no macOS
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
      ws,
      title: `${title} (${path.basename(shell)})`,
      createdAt: new Date()
    };

    terminals.set(id, session);

    console.log(`[Termix] Terminal criado [${id}] - PID: ${ptyProcess.pid}, Shell: ${shell}`);

    // Envia dados do processo PTY para o navegador via WebSocket
    ptyProcess.onData((data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          action: 'output',
          id,
          data
        }));
      }
    });

    // Trata encerramento do processo PTY (ex: usuário digitou 'exit')
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[Termix] Terminal finalizado [${id}] com código ${exitCode}, sinal ${signal}`);
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          action: 'exit',
          id,
          exitCode,
          signal
        }));
      }
      terminals.delete(id);
    });

    // Notifica o cliente de que o terminal foi criado com sucesso
    ws.send(JSON.stringify({
      action: 'created',
      id,
      pid: ptyProcess.pid,
      shell: path.basename(shell),
      title: session.title
    }));

    return session;
  } catch (error) {
    console.error(`[Termix] Erro ao criar terminal [${id}]:`, error);
    ws.send(JSON.stringify({
      action: 'error',
      id,
      message: `Falha ao iniciar processo do terminal: ${error.message}`
    }));
    return null;
  }
}

/**
 * Fecha e encerra um terminal com segurança
 */
function closeTerminalSession(id) {
  const session = terminals.get(id);
  if (session) {
    try {
      session.ptyProcess.kill();
    } catch (e) {
      console.warn(`[Termix] Erro ao matar processo [${id}]:`, e.message);
    }
    terminals.delete(id);
    console.log(`[Termix] Terminal encerrado e removido [${id}]`);
  }
}

// Gerenciamento das conexões WebSocket
wss.on('connection', (ws) => {
  console.log('[Termix] Cliente conectado via WebSocket');

  // Ao conectar, envia informações do sistema
  ws.send(JSON.stringify({
    action: 'system_info',
    defaultShell: path.basename(DEFAULT_SHELL),
    platform: process.platform,
    hostname: require('os').hostname()
  }));

  ws.on('message', (message) => {
    try {
      const payload = JSON.parse(message.toString());
      const { action, id } = payload;

      switch (action) {
        case 'create':
          createTerminalSession(ws, payload);
          break;

        case 'input':
          {
            const session = terminals.get(id);
            if (session && typeof payload.data === 'string') {
              session.ptyProcess.write(payload.data);
            }
          }
          break;

        case 'resize':
          {
            const session = terminals.get(id);
            if (session && payload.cols && payload.rows) {
              const cols = Math.max(10, parseInt(payload.cols, 10));
              const rows = Math.max(5, parseInt(payload.rows, 10));
              session.ptyProcess.resize(cols, rows);
            }
          }
          break;

        case 'close':
          closeTerminalSession(id);
          break;

        case 'broadcast':
          // Envia um mesmo comando para todas as instâncias ativas
          if (typeof payload.data === 'string') {
            for (const [, session] of terminals) {
              try {
                session.ptyProcess.write(payload.data);
              } catch (err) {
                console.error(`[Termix] Erro no broadcast para [${session.id}]:`, err);
              }
            }
          }
          break;

        default:
          console.warn(`[Termix] Ação desconhecida recebida: ${action}`);
      }
    } catch (err) {
      console.error('[Termix] Erro ao processar mensagem do WebSocket:', err);
    }
  });

  ws.on('close', () => {
    console.log('[Termix] Conexão WebSocket encerrada pelo cliente');
    // Encerra terminais vinculados a esta conexão se necessário
    for (const [id, session] of terminals.entries()) {
      if (session.ws === ws) {
        try {
          session.ptyProcess.kill();
        } catch (_) {}
        terminals.delete(id);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('[Termix] Erro no socket do cliente:', err.message);
  });
});

// Finalização graciosa do servidor (limpa processos filhos do node-pty)
function gracefulShutdown(signal) {
  console.log(`\n[Termix] Recebido sinal ${signal}. Encerrando todos os processos PTY...`);
  for (const [id, session] of terminals) {
    try {
      session.ptyProcess.kill();
    } catch (_) {}
  }
  terminals.clear();
  server.close(() => {
    console.log('[Termix] Servidor finalizado com sucesso.');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

server.listen(PORT, HOST, () => {
  console.log('====================================================');
  console.log(`⚡ Termix Dashboard Iniciado com Sucesso!`);
  console.log(`🔗 URL Local: http://${HOST}:${PORT}`);
  console.log(`💻 Shell Padrão: ${DEFAULT_SHELL}`);
  console.log(`📂 Diretório Inicial: ${DEFAULT_CWD}`);
  console.log('====================================================');
});
