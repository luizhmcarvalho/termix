
const { app, BrowserWindow, ipcMain } = require('electron');
const pty = require('node-pty');
app.whenReady().then(() => {
  const p = pty.spawn(process.env.SHELL || '/bin/zsh', [], { name: 'xterm-256color', cols: 80, rows: 24 });
  p.on('data', d => {
    console.log('PTY IN ELECTRON RECEIVED:', d.length);
    p.kill();
    console.log('ELECTRON PTY TEST FULL SUCCESS');
    app.quit();
  });
  p.write('echo ELECTRON_OK\r');
});
