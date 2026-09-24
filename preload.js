/**
 * preload.js - Ponte Segura de IPC entre o Processo Principal (Electron) e a UI (Renderer)
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('termix', {
  isElectron: true,

  // Solicita criação de novo terminal pseudoterminal
  createTerminal: (options) => {
    ipcRenderer.send('terminal:create', options);
  },

  // Envia dados de digitação do teclado
  sendInput: (id, data) => {
    ipcRenderer.send('terminal:input', { id, data });
  },

  // Informa novas dimensões de linhas e colunas
  resizeTerminal: (id, cols, rows) => {
    ipcRenderer.send('terminal:resize', { id, cols, rows });
  },

  // Fecha o terminal e mata o processo PTY
  closeTerminal: (id) => {
    ipcRenderer.send('terminal:close', { id });
  },

  // Envia comando broadcast para todas as sessões
  sendBroadcast: (data) => {
    ipcRenderer.send('terminal:broadcast', { data });
  },

  // Solicita dados do sistema
  getSystemInfo: () => {
    return ipcRenderer.invoke('system:info');
  },

  // Área de transferência nativa (macOS Clipboard)
  readClipboard: () => {
    return ipcRenderer.invoke('clipboard:read');
  },

  writeClipboard: (text) => {
    ipcRenderer.send('clipboard:write', text);
  },

  // Registro de ouvintes de eventos enviados pelo backend Electron
  onCreated: (callback) => {
    const handler = (event, msg) => callback(msg);
    ipcRenderer.on('terminal:created', handler);
    return () => ipcRenderer.removeListener('terminal:created', handler);
  },

  onOutput: (callback) => {
    const handler = (event, msg) => callback(msg);
    ipcRenderer.on('terminal:output', handler);
    return () => ipcRenderer.removeListener('terminal:output', handler);
  },

  onExit: (callback) => {
    const handler = (event, msg) => callback(msg);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },

  onError: (callback) => {
    const handler = (event, msg) => callback(msg);
    ipcRenderer.on('terminal:error', handler);
    return () => ipcRenderer.removeListener('terminal:error', handler);
  },

  onToggleTheme: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:toggle-theme', handler);
    return () => ipcRenderer.removeListener('menu:toggle-theme', handler);
  },

  onNewTerminal: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:new-terminal', handler);
    return () => ipcRenderer.removeListener('menu:new-terminal', handler);
  },

  onToggleBroadcast: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:toggle-broadcast', handler);
    return () => ipcRenderer.removeListener('menu:toggle-broadcast', handler);
  },

  onClearTerminal: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:clear-terminal', handler);
    return () => ipcRenderer.removeListener('menu:clear-terminal', handler);
  },

  onShowAbout: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('menu:show-about', handler);
    return () => ipcRenderer.removeListener('menu:show-about', handler);
  }
});
