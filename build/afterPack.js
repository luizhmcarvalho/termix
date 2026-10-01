/**
 * build/afterPack.js
 * Executado pelo electron-builder logo após empacotar os arquivos da aplicação
 * Aplica assinatura ad-hoc consistente nos binários para macOS
 */

const { execSync } = require('child_process');
const path = require('path');

exports.default = async function (context) {
  if (context.electronPlatformName === 'darwin') {
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    console.log(`[Termix afterPack] Aplicando assinatura ad-hoc em: ${appPath}`);
    try {
      execSync(`codesign --force --deep -s - "${appPath}"`, { stdio: 'inherit' });
      console.log('[Termix afterPack] Assinatura ad-hoc concluída com sucesso!');
    } catch (e) {
      console.warn('[Termix afterPack] Aviso ao aplicar assinatura:', e.message);
    }
  }
};
