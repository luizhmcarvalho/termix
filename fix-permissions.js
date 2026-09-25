/**
 * fix-permissions.js
 * Garante que os binários nativos do node-pty (como o spawn-helper no macOS)
 * possuam permissão de execução (+x), prevenindo o erro 'posix_spawnp failed'.
 */
const fs = require('fs');
const path = require('path');

function ensureExecutablePermissions() {
  if (process.platform !== 'darwin') {
    return;
  }
  const ptyDir = path.join(__dirname, 'node_modules', 'node-pty', 'prebuilds');
  if (!fs.existsSync(ptyDir)) {
    return;
  }

  try {
    const entries = fs.readdirSync(ptyDir);
    for (const entry of entries) {
      if (entry.startsWith('darwin-')) {
        const helperPath = path.join(ptyDir, entry, 'spawn-helper');
        if (fs.existsSync(helperPath)) {
          const stat = fs.statSync(helperPath);
          // Adiciona permissão de execução se não tiver
          fs.chmodSync(helperPath, stat.mode | 0o111);
          console.log(`[Termix] Permissão de execução garantida para: ${helperPath}`);
        }
      }
    }
  } catch (err) {
    console.warn('[Termix] Aviso ao ajustar permissões do spawn-helper:', err.message);
  }
}

ensureExecutablePermissions();

module.exports = ensureExecutablePermissions;
