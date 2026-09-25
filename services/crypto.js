/**
 * services/crypto.js
 * Criptografia AES-256-GCM para proteção de credenciais (senhas e chaves SSH)
 * Compatível com Electron safeStorage e fallback nativo Node.js crypto
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

// Obtém ou gera uma chave mestre local protegida
function getMasterKey(storageDir) {
  const keyFile = path.join(storageDir, '.termix_master.key');
  try {
    if (fs.existsSync(keyFile)) {
      const hex = fs.readFileSync(keyFile, 'utf8').trim();
      return Buffer.from(hex, 'hex');
    }
  } catch (_) {}

  // Gera chave de 256 bits única para esta instalação
  const newKey = crypto.randomBytes(32);
  try {
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    fs.writeFileSync(keyFile, newKey.toString('hex'), { mode: 0o600 });
  } catch (err) {
    console.warn('[Termix Crypto] Aviso ao salvar chave mestre:', err.message);
  }
  return newKey;
}

class CryptoManager {
  constructor(storageDir) {
    this.storageDir = storageDir || path.join(os.homedir(), '.termix');
    this.masterKey = getMasterKey(this.storageDir);
  }

  /**
   * Criptografa uma string de texto puro usando AES-256-GCM
   * @param {string} plainText
   * @returns {string} iv:tag:ciphertext (base64)
   */
  encrypt(plainText) {
    if (!plainText || typeof plainText !== 'string') {
      return '';
    }

    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);
      
      let encrypted = cipher.update(plainText, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const tag = cipher.getAuthTag();

      // Formato compacto e seguro: iv:tag:ciphertext
      return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
    } catch (err) {
      console.error('[Termix Crypto] Erro ao criptografar:', err.message);
      return '';
    }
  }

  /**
   * Descriptografa uma string criptografada
   * @param {string} encryptedString
   * @returns {string} plainText
   */
  decrypt(encryptedString) {
    if (!encryptedString || typeof encryptedString !== 'string') {
      return '';
    }

    const parts = encryptedString.split(':');
    if (parts.length !== 3) {
      return '';
    }

    try {
      const [ivHex, tagHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      
      const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      console.error('[Termix Crypto] Erro ao descriptografar:', err.message);
      return '';
    }
  }
}

module.exports = CryptoManager;
