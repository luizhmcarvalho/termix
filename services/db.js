/**
 * services/db.js
 * Gerenciador de Banco de Dados Local SQLite com node:sqlite
 * Armazenamento criptografado de Hosts e Identidades (estilo Termius)
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const os = require('os');
const CryptoManager = require('./crypto');

class DatabaseManager {
  constructor(storageDir) {
    this.storageDir = storageDir || path.join(os.homedir(), '.termix');
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this.dbPath = path.join(this.storageDir, 'termix.db');
    this.crypto = new CryptoManager(this.storageDir);
    this.db = new DatabaseSync(this.dbPath);

    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS identities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT NOT NULL,
        auth_type TEXT NOT NULL DEFAULT 'password',
        password_enc TEXT,
        key_path TEXT,
        key_passphrase_enc TEXT,
        certificate_enc TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hosts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        host_type TEXT NOT NULL DEFAULT 'ssh',
        hostname TEXT,
        port INTEGER DEFAULT 22,
        identity_id TEXT,
        default_path TEXT,
        startup_command TEXT,
        tags TEXT,
        color TEXT DEFAULT '#38bdf8',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        layout TEXT NOT NULL DEFAULT 'auto',
        color TEXT DEFAULT '#8b5cf6',
        description TEXT,
        terminals_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_hosts_name ON hosts(name);
      CREATE INDEX IF NOT EXISTS idx_identities_name ON identities(name);
      CREATE INDEX IF NOT EXISTS idx_workspaces_name ON workspaces(name);
    `);

    // Migração de coluna para bancos existentes
    try {
      this.db.exec('ALTER TABLE identities ADD COLUMN certificate_enc TEXT;');
    } catch (_) {}
  }

  // --- IDENTIDADES ---

  getIdentities() {
    const stmt = this.db.prepare("SELECT id, name, username, auth_type, key_path, created_at, updated_at, (password_enc IS NOT NULL AND password_enc != '') as has_password, (key_passphrase_enc IS NOT NULL AND key_passphrase_enc != '') as has_passphrase, (certificate_enc IS NOT NULL AND certificate_enc != '') as has_certificate FROM identities ORDER BY name ASC");
    return stmt.all().map(row => ({
      ...row,
      has_password: Boolean(row.has_password),
      has_passphrase: Boolean(row.has_passphrase),
      has_certificate: Boolean(row.has_certificate)
    }));
  }

  getIdentity(id, includeDecrypted = false) {
    const stmt = this.db.prepare('SELECT * FROM identities WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;

    const res = {
      id: row.id,
      name: row.name,
      username: row.username,
      auth_type: row.auth_type,
      key_path: row.key_path,
      created_at: row.created_at,
      updated_at: row.updated_at,
      has_password: Boolean(row.password_enc),
      has_passphrase: Boolean(row.key_passphrase_enc),
      has_certificate: Boolean(row.certificate_enc)
    };

    if (includeDecrypted) {
      res.password = this.crypto.decrypt(row.password_enc);
      res.passphrase = this.crypto.decrypt(row.key_passphrase_enc);
      res.certificate = this.crypto.decrypt(row.certificate_enc);
    }

    return res;
  }

  saveIdentity(data) {
    const now = new Date().toISOString();
    const id = data.id || `id-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const existing = this.db.prepare('SELECT password_enc, key_passphrase_enc, certificate_enc FROM identities WHERE id = ?').get(id);
    const isNew = !existing;

    let passwordEnc = null;
    let passphraseEnc = null;
    let certificateEnc = null;

    if (!isNew && existing) {
      passwordEnc = existing.password_enc;
      passphraseEnc = existing.key_passphrase_enc;
      certificateEnc = existing.certificate_enc;
    }

    if (data.password !== undefined && data.password !== '') {
      passwordEnc = this.crypto.encrypt(data.password);
    }
    if (data.passphrase !== undefined && data.passphrase !== '') {
      passphraseEnc = this.crypto.encrypt(data.passphrase);
    }
    if (data.certificate !== undefined && data.certificate !== '') {
      certificateEnc = this.crypto.encrypt(data.certificate.trim());
    }

    if (isNew) {
      const stmt = this.db.prepare(`
        INSERT INTO identities (id, name, username, auth_type, password_enc, key_path, key_passphrase_enc, certificate_enc, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        data.name || 'Nova Identidade',
        data.username || '',
        data.auth_type || 'password',
        passwordEnc,
        data.key_path || '',
        passphraseEnc,
        certificateEnc,
        now,
        now
      );
    } else {
      const stmt = this.db.prepare(`
        UPDATE identities SET
          name = ?,
          username = ?,
          auth_type = ?,
          password_enc = ?,
          key_path = ?,
          key_passphrase_enc = ?,
          certificate_enc = ?,
          updated_at = ?
        WHERE id = ?
      `);
      stmt.run(
        data.name || 'Identidade',
        data.username || '',
        data.auth_type || 'password',
        passwordEnc,
        data.key_path || '',
        passphraseEnc,
        certificateEnc,
        now,
        id
      );
    }

    // Se forneceu conteúdo de certificado ou já tem certificado salvo, sincroniza arquivo de chave local
    if (data.certificate || certificateEnc) {
      const identityObj = this.getIdentity(id, true);
      if (identityObj && identityObj.certificate) {
        this.ensureCertificateFile(identityObj);
      }
    }

    return this.getIdentity(id);
  }

  deleteIdentity(id) {
    const stmt = this.db.prepare('DELETE FROM identities WHERE id = ?');
    stmt.run(id);

    // Remove arquivos de certificado gerados se existirem
    try {
      const certFilePath = path.join(this.storageDir, 'certificates', `identity_${id}.pem`);
      if (fs.existsSync(certFilePath)) fs.unlinkSync(certFilePath);
      const certPubPath = `${certFilePath}-cert.pub`;
      if (fs.existsSync(certPubPath)) fs.unlinkSync(certPubPath);
    } catch (_) {}

    return { success: true, id };
  }

  /**
   * Garante a existência do arquivo de certificado / chave privada com permissões 0600
   * para conexão segura no SSH (compatível com chaves PEM/OpenSSH do OCI, AWS, etc.)
   */
  ensureCertificateFile(identity) {
    if (!identity) return null;
    let certContent = identity.certificate;
    if (!certContent && identity.id) {
      const full = this.getIdentity(identity.id, true);
      certContent = full?.certificate;
    }
    if (!certContent || typeof certContent !== 'string' || !certContent.trim()) {
      return null;
    }

    const certDir = path.join(this.storageDir, 'certificates');
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true, mode: 0o700 });
    }

    const cleanContent = certContent.replace(/\r\n/g, '\n').trim() + '\n';
    const certFilePath = path.join(certDir, `identity_${identity.id}.pem`);

    // Detecta se inclui linha de certificado OpenSSH separada
    const certMatch = cleanContent.match(/^(ssh-[a-z0-9-]+-cert-v\d+@openssh\.com\s+[^\r\n]+)/m) 
                   || cleanContent.match(/^(ecdsa-[a-z0-9-]+-cert-v\d+@openssh\.com\s+[^\r\n]+)/m);

    if (certMatch) {
      const certLine = certMatch[0].trim() + '\n';
      const keyPart = cleanContent.replace(certMatch[0], '').trim() + '\n';
      fs.writeFileSync(certFilePath, keyPart, { mode: 0o600 });
      fs.writeFileSync(`${certFilePath}-cert.pub`, certLine, { mode: 0o600 });
      try {
        fs.chmodSync(certFilePath, 0o600);
        fs.chmodSync(`${certFilePath}-cert.pub`, 0o600);
      } catch (_) {}
    } else {
      fs.writeFileSync(certFilePath, cleanContent, { mode: 0o600 });
      try {
        fs.chmodSync(certFilePath, 0o600);
      } catch (_) {}
    }

    return certFilePath;
  }

  // --- HOSTS ---

  getHosts() {
    const stmt = this.db.prepare(`
      SELECT 
        h.id, h.name, h.host_type, h.hostname, h.port, h.identity_id, 
        h.default_path, h.startup_command, h.tags, h.color, h.created_at, h.updated_at,
        i.name as identity_name, i.username, i.auth_type, i.key_path
      FROM hosts h
      LEFT JOIN identities i ON h.identity_id = i.id
      ORDER BY h.name ASC
    `);

    return stmt.all().map(row => ({
      ...row,
      tags: row.tags ? row.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    }));
  }

  getHost(id, includeDecrypted = false) {
    const stmt = this.db.prepare('SELECT * FROM hosts WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;

    const host = {
      ...row,
      tags: row.tags ? row.tags.split(',').map(t => t.trim()).filter(Boolean) : []
    };

    if (row.identity_id) {
      host.identity = this.getIdentity(row.identity_id, includeDecrypted);
    } else {
      host.identity = null;
    }

    return host;
  }

  saveHost(data) {
    const now = new Date().toISOString();
    const id = data.id || `host-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const existing = this.db.prepare('SELECT id FROM hosts WHERE id = ?').get(id);
    const isNew = !existing;

    const tagsStr = Array.isArray(data.tags) 
      ? data.tags.join(',') 
      : (typeof data.tags === 'string' ? data.tags : '');

    if (isNew) {
      const stmt = this.db.prepare(`
        INSERT INTO hosts (id, name, host_type, hostname, port, identity_id, default_path, startup_command, tags, color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        data.name || 'Novo Host',
        data.host_type || 'ssh',
        data.hostname || '',
        parseInt(data.port, 10) || 22,
        data.identity_id || null,
        data.default_path || '',
        data.startup_command || '',
        tagsStr,
        data.color || '#38bdf8',
        now,
        now
      );
    } else {
      const stmt = this.db.prepare(`
        UPDATE hosts SET
          name = ?,
          host_type = ?,
          hostname = ?,
          port = ?,
          identity_id = ?,
          default_path = ?,
          startup_command = ?,
          tags = ?,
          color = ?,
          updated_at = ?
        WHERE id = ?
      `);
      stmt.run(
        data.name || 'Host',
        data.host_type || 'ssh',
        data.hostname || '',
        parseInt(data.port, 10) || 22,
        data.identity_id || null,
        data.default_path || '',
        data.startup_command || '',
        tagsStr,
        data.color || '#38bdf8',
        now,
        id
      );
    }

    return this.getHost(id);
  }

  deleteHost(id) {
    const stmt = this.db.prepare('DELETE FROM hosts WHERE id = ?');
    stmt.run(id);
    return { success: true, id };
  }

  // --- WORKSPACES (Conjunto de Terminais Salvos) ---

  getWorkspaces() {
    const stmt = this.db.prepare('SELECT * FROM workspaces ORDER BY name ASC');
    return stmt.all().map(row => {
      let terminals = [];
      try {
        terminals = JSON.parse(row.terminals_json || '[]');
      } catch (e) {
        terminals = [];
      }
      return {
        ...row,
        terminals
      };
    });
  }

  getWorkspace(id) {
    const stmt = this.db.prepare('SELECT * FROM workspaces WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    let terminals = [];
    try {
      terminals = JSON.parse(row.terminals_json || '[]');
    } catch (e) {
      terminals = [];
    }
    return {
      ...row,
      terminals
    };
  }

  saveWorkspace(data) {
    const now = new Date().toISOString();
    const id = data.id || `ws-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const existing = this.db.prepare('SELECT id FROM workspaces WHERE id = ?').get(id);
    const isNew = !existing;

    const terminalsJson = JSON.stringify(data.terminals || []);

    if (isNew) {
      const stmt = this.db.prepare(`
        INSERT INTO workspaces (id, name, layout, color, description, terminals_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        id,
        data.name || 'Novo Workspace',
        data.layout || 'auto',
        data.color || '#8b5cf6',
        data.description || '',
        terminalsJson,
        now,
        now
      );
    } else {
      const stmt = this.db.prepare(`
        UPDATE workspaces
        SET name = ?, layout = ?, color = ?, description = ?, terminals_json = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(
        data.name || 'Workspace',
        data.layout || 'auto',
        data.color || '#8b5cf6',
        data.description || '',
        terminalsJson,
        now,
        id
      );
    }

    return this.getWorkspace(id);
  }

  deleteWorkspace(id) {
    const stmt = this.db.prepare('DELETE FROM workspaces WHERE id = ?');
    stmt.run(id);
    return { success: true, id };
  }

  // --- CONFIGURAÇÕES DO SISTEMA & IA ---

  getSetting(key) {
    const stmt = this.db.prepare('SELECT value_json FROM settings WHERE key = ?');
    const row = stmt.get(key);
    if (!row || !row.value_json) return null;
    try {
      return JSON.parse(row.value_json);
    } catch (_) {
      return null;
    }
  }

  saveSetting(key, value) {
    const now = new Date().toISOString();
    const valueJson = JSON.stringify(value);
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `);
    stmt.run(key, valueJson, now);
    return value;
  }

  deleteSetting(key) {
    const stmt = this.db.prepare('DELETE FROM settings WHERE key = ?');
    stmt.run(key);
    return { success: true, key };
  }

  getAIConfig(includeDecryptedKey = false) {
    const raw = this.getSetting('ai_config') || {};
    const provider = raw.provider || 'gemini';

    // Suporte a armazenamento de chaves independentes por provedor
    const keysEnc = { ...(raw.keys_enc || {}) };
    if (raw.apiKey_enc && !keysEnc[provider]) {
      keysEnc[provider] = raw.apiKey_enc;
    }

    const savedModels = {
      gemini: 'gemini-2.5-flash',
      openai: 'gpt-4o-mini',
      anthropic: 'claude-3-5-sonnet-20241022',
      deepseek: 'deepseek-chat',
      nvidia: 'meta/llama-3.3-70b-instruct',
      bedrock: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      ollama: 'llama3.2',
      custom: 'gpt-4o-mini',
      ...(raw.models || {})
    };

    const savedRegions = {
      bedrock: 'us-east-1',
      ...(raw.regions || {})
    };

    const savedBaseUrls = {
      ollama: 'http://localhost:11434/v1',
      deepseek: 'https://api.deepseek.com',
      nvidia: 'https://integrate.api.nvidia.com/v1',
      openai: 'https://api.openai.com/v1',
      ...(raw.baseUrls || {})
    };

    // Computa status de cada provedor para a interface
    const knownProviders = ['gemini', 'openai', 'anthropic', 'deepseek', 'nvidia', 'bedrock', 'ollama', 'custom'];
    const providersStatus = {};
    const decryptedKeysMap = {};

    for (const p of knownProviders) {
      let dec = '';
      if (keysEnc[p]) {
        try {
          dec = this.crypto.decrypt(keysEnc[p]) || '';
        } catch (_) {}
      }

      if (includeDecryptedKey) {
        decryptedKeysMap[p] = dec;
      }

      const hasKey = p === 'ollama' ? true : Boolean(dec);
      let keyPreview = '';
      if (p === 'ollama') {
        keyPreview = 'Local / Offline';
      } else if (hasKey) {
        if (dec.length > 8) {
          keyPreview = `${dec.substring(0, 4)}...${dec.substring(dec.length - 4)}`;
        } else {
          keyPreview = '••••••••';
        }
      }

      providersStatus[p] = {
        hasKey,
        keyPreview,
        model: savedModels[p] || '',
        region: savedRegions[p] || (p === 'bedrock' ? 'us-east-1' : ''),
        baseUrl: savedBaseUrls[p] || ''
      };
    }

    const activeModel = raw.model || savedModels[provider] || 'gemini-2.5-flash';
    const activeRegion = raw.region || savedRegions[provider] || (provider === 'bedrock' ? 'us-east-1' : '');
    const activeBaseUrl = raw.baseUrl !== undefined ? raw.baseUrl : (savedBaseUrls[provider] || '');

    const activeDecryptedKey = decryptedKeysMap[provider] || (keysEnc[provider] ? (this.crypto.decrypt(keysEnc[provider]) || '') : '');
    const hasActiveKey = provider === 'ollama' ? true : Boolean(activeDecryptedKey);
    let activeKeyPreview = '';
    if (provider === 'ollama') {
      activeKeyPreview = 'Local / Offline';
    } else if (hasActiveKey) {
      if (activeDecryptedKey.length > 8) {
        activeKeyPreview = `${activeDecryptedKey.substring(0, 4)}...${activeDecryptedKey.substring(activeDecryptedKey.length - 4)}`;
      } else {
        activeKeyPreview = '••••••••';
      }
    }

    return {
      provider,
      model: activeModel,
      region: activeRegion,
      baseUrl: activeBaseUrl,
      redactSecrets: raw.redactSecrets !== false,
      autoSuggestOnExitError: raw.autoSuggestOnExitError !== false,
      hasKey: hasActiveKey,
      keyPreview: activeKeyPreview,
      providersStatus,
      savedModels,
      savedRegions,
      savedBaseUrls,
      ...(includeDecryptedKey ? { apiKey: activeDecryptedKey, keys_decrypted: decryptedKeysMap } : {})
    };
  }

  saveAIConfig(data = {}) {
    const current = this.getSetting('ai_config') || {};
    const provider = data.provider || current.provider || 'gemini';

    const keysEnc = { ...(current.keys_enc || {}) };
    if (current.apiKey_enc && !keysEnc[current.provider || 'gemini']) {
      keysEnc[current.provider || 'gemini'] = current.apiKey_enc;
    }

    // Se o usuário solicitou explicitamente a remoção da chave do provedor
    if (data.clearKey === true) {
      delete keysEnc[provider];
    } else if (typeof data.apiKey === 'string') {
      const trimmed = data.apiKey.trim();
      // Não sobrescreve chave existente se o campo estiver vazio ou for placeholder mascarado
      if (trimmed !== '' && !trimmed.includes('••••') && !trimmed.includes('...')) {
        keysEnc[provider] = this.crypto.encrypt(trimmed);
      }
    }

    const savedModels = { ...(current.models || {}) };
    if (data.model) {
      savedModels[provider] = data.model;
    }

    const savedRegions = { ...(current.regions || {}) };
    if (data.region) {
      savedRegions[provider] = data.region;
    }

    const savedBaseUrls = { ...(current.baseUrls || {}) };
    if (typeof data.baseUrl === 'string') {
      savedBaseUrls[provider] = data.baseUrl.trim();
    }

    const activeKeyEnc = keysEnc[provider] || '';

    const newConfig = {
      provider,
      model: data.model || savedModels[provider] || (provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini'),
      region: data.region || savedRegions[provider] || (provider === 'bedrock' ? 'us-east-1' : ''),
      baseUrl: typeof data.baseUrl === 'string' ? data.baseUrl.trim() : (savedBaseUrls[provider] || ''),
      redactSecrets: data.redactSecrets !== undefined ? Boolean(data.redactSecrets) : (current.redactSecrets !== false),
      autoSuggestOnExitError: data.autoSuggestOnExitError !== undefined ? Boolean(data.autoSuggestOnExitError) : (current.autoSuggestOnExitError !== false),
      apiKey_enc: activeKeyEnc,
      keys_enc: keysEnc,
      models: savedModels,
      regions: savedRegions,
      baseUrls: savedBaseUrls
    };

    this.saveSetting('ai_config', newConfig);
    return this.getAIConfig(false);
  }

  // --- EXPORTAÇÃO E IMPORTAÇÃO DE CONFIGURAÇÕES E CREDENCIAIS ---

  /**
   * Exporta dados do Termix (Hosts, Identidades, Workspaces, Configurações de IA e Preferências)
   * Suporta exportação criptografada com senha (AES-256-GCM + PBKDF2) ou JSON puro
   * @param {Object} options
   * @returns {Object} Bundle de backup pronto para salvar em arquivo
   */
  exportData(options = {}) {
    const {
      includeHosts = true,
      includeIdentities = true,
      includeCredentials = true,
      includeWorkspaces = true,
      includeSettings = true,
      password = null
    } = options;

    const exportedAt = new Date().toISOString();
    const items = {};

    if (includeIdentities) {
      const rows = this.db.prepare('SELECT * FROM identities ORDER BY name ASC').all();
      items.identities = rows.map(r => {
        const item = {
          id: r.id,
          name: r.name,
          username: r.username,
          auth_type: r.auth_type,
          key_path: r.key_path,
          created_at: r.created_at,
          updated_at: r.updated_at
        };

        if (includeCredentials) {
          item.password = this.crypto.decrypt(r.password_enc) || '';
          item.passphrase = this.crypto.decrypt(r.key_passphrase_enc) || '';
          item.certificate = this.crypto.decrypt(r.certificate_enc) || '';
        }

        return item;
      });
    }

    if (includeHosts) {
      items.hosts = this.getHosts();
    }

    if (includeWorkspaces) {
      items.workspaces = this.getWorkspaces();
    }

    if (includeSettings) {
      const aiConfig = this.getAIConfig(includeCredentials);
      const appLanguage = this.getSetting('app_language') || 'pt';
      const appTheme = this.getSetting('app_theme') || 'dark';

      items.settings = {
        app_language: appLanguage,
        app_theme: appTheme,
        ai_config: {
          provider: aiConfig.provider,
          model: aiConfig.model,
          region: aiConfig.region,
          baseUrl: aiConfig.baseUrl,
          redactSecrets: aiConfig.redactSecrets,
          autoSuggestOnExitError: aiConfig.autoSuggestOnExitError,
          savedModels: aiConfig.savedModels,
          savedRegions: aiConfig.savedRegions,
          savedBaseUrls: aiConfig.savedBaseUrls,
          ...(includeCredentials ? {
            apiKey: aiConfig.apiKey,
            keys_decrypted: aiConfig.keys_decrypted
          } : {})
        }
      };
    }

    const counts = {
      hosts: items.hosts ? items.hosts.length : 0,
      identities: items.identities ? items.identities.length : 0,
      workspaces: items.workspaces ? items.workspaces.length : 0,
      hasSettings: Boolean(items.settings),
      hasCredentials: Boolean(includeCredentials)
    };

    // Caso o usuário defina uma senha de criptografia para o backup
    if (password && typeof password === 'string' && password.trim()) {
      const encryptedBundle = this.crypto.encryptWithPassword(JSON.stringify(items), password.trim());
      return {
        type: 'termix_backup',
        version: '1.6.0',
        encrypted: true,
        exported_at: exportedAt,
        counts,
        salt: encryptedBundle.salt,
        iv: encryptedBundle.iv,
        tag: encryptedBundle.tag,
        ciphertext: encryptedBundle.ciphertext
      };
    }

    // Exportação aberta em JSON puro
    return {
      type: 'termix_backup',
      version: '1.6.0',
      encrypted: false,
      exported_at: exportedAt,
      counts,
      data: items
    };
  }

  /**
   * Pré-visualiza um arquivo de backup antes da importação
   * @param {Object|string} payload
   * @param {string} password
   */
  previewImport(payload, password = null) {
    let parsed = payload;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch (_) {
        throw new Error('Arquivo de backup inválido: formato JSON corrompido.');
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Arquivo de backup inválido ou vazio.');
    }

    const isEncrypted = Boolean(parsed.encrypted);
    const exportedAt = parsed.exported_at || null;
    const version = parsed.version || '1.0';

    if (isEncrypted) {
      if (!password) {
        return {
          valid: true,
          encrypted: true,
          exported_at: exportedAt,
          version,
          counts: parsed.counts || { hosts: 0, identities: 0, workspaces: 0 },
          needsPassword: true
        };
      }

      try {
        const decryptedStr = this.crypto.decryptWithPassword(parsed, password.trim());
        const items = JSON.parse(decryptedStr);
        return {
          valid: true,
          encrypted: true,
          exported_at: exportedAt,
          timestamp: exportedAt,
          version,
          needsPassword: false,
          passwordValid: true,
          counts: {
            hosts: Array.isArray(items.hosts) ? items.hosts.length : 0,
            identities: Array.isArray(items.identities) ? items.identities.length : 0,
            workspaces: Array.isArray(items.workspaces) ? items.workspaces.length : 0,
            hasSettings: Boolean(items.settings)
          },
          summary: {
            hostNames: (items.hosts || []).map(h => h.name).slice(0, 5),
            identityNames: (items.identities || []).map(i => i.name).slice(0, 5),
            workspaceNames: (items.workspaces || []).map(w => w.name).slice(0, 5)
          }
        };
      } catch (_) {
        return {
          valid: true,
          encrypted: true,
          exported_at: exportedAt,
          version,
          needsPassword: true,
          passwordValid: false,
          counts: parsed.counts || { hosts: 0, identities: 0, workspaces: 0 },
          error: 'Senha incorreta para descriptografia do arquivo de backup.'
        };
      }
    }

    const items = parsed.data || parsed.items || parsed;
    return {
      valid: true,
      encrypted: false,
      exported_at: exportedAt,
      timestamp: exportedAt,
      version,
      needsPassword: false,
      counts: {
        hosts: Array.isArray(items.hosts) ? items.hosts.length : 0,
        identities: Array.isArray(items.identities) ? items.identities.length : 0,
        workspaces: Array.isArray(items.workspaces) ? items.workspaces.length : 0,
        hasSettings: Boolean(items.settings)
      },
      summary: {
        hostNames: (items.hosts || []).map(h => h.name).slice(0, 5),
        identityNames: (items.identities || []).map(i => i.name).slice(0, 5),
        workspaceNames: (items.workspaces || []).map(w => w.name).slice(0, 5)
      }
    };
  }

  /**
   * Importa e restaura configurações, credenciais, hosts e workspaces
   * Re-criptografa segredos com a chave mestra nativa da máquina atual
   * @param {Object|string} payload
   * @param {Object} options
   */
  importData(payload, options = {}) {
    const {
      password = null,
      mode = 'merge', // 'merge' | 'add_new' | 'replace'
      importHosts = true,
      importIdentities = true,
      importWorkspaces = true,
      importSettings = true
    } = options;

    let parsed = payload;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch (_) {
        throw new Error('Arquivo de backup inválido: não é um JSON válido.');
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Arquivo de backup inválido ou vazio.');
    }

    let items = null;

    if (parsed.encrypted) {
      if (!password || !password.trim()) {
        throw new Error('Este arquivo está protegido com senha. Informe a senha de descriptografia.');
      }
      try {
        const decryptedStr = this.crypto.decryptWithPassword(parsed, password.trim());
        items = JSON.parse(decryptedStr);
      } catch (err) {
        throw new Error('Falha ao descriptografar: Senha incorreta ou arquivo adulterado.');
      }
    } else {
      items = parsed.data || parsed.items || parsed;
    }

    if (!items || typeof items !== 'object') {
      throw new Error('Nenhum dado válido encontrado no arquivo de backup.');
    }

    const result = {
      hosts: 0,
      identities: 0,
      workspaces: 0,
      settings: false
    };

    // Modo Substituir Tudo (Replace): limpa tabelas antes de restaurar
    if (mode === 'replace') {
      if (importHosts && importIdentities) {
        this.db.exec('DELETE FROM hosts;');
        this.db.exec('DELETE FROM identities;');
      } else if (importHosts) {
        this.db.exec('DELETE FROM hosts;');
      } else if (importIdentities) {
        this.db.exec('DELETE FROM identities;');
      }
      if (importWorkspaces) {
        this.db.exec('DELETE FROM workspaces;');
      }
    }

    // 1. Importa Identidades (Primeiro, pois Hosts dependem de identity_id)
    const identityIdMap = new Map(); // oldId -> newId

    if (importIdentities && Array.isArray(items.identities)) {
      for (const idData of items.identities) {
        let targetId = idData.id;

        if (mode === 'add_new') {
          targetId = `id-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          identityIdMap.set(idData.id, targetId);
        } else if (mode === 'merge') {
          // Se for merge e não tiver id, gera um
          if (!targetId) {
            targetId = `id-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          }
        }

        this.saveIdentity({
          id: targetId,
          name: idData.name,
          username: idData.username,
          auth_type: idData.auth_type,
          password: idData.password,
          key_path: idData.key_path,
          passphrase: idData.passphrase,
          certificate: idData.certificate
        });
        result.identities++;
      }
    }

    // 2. Importa Hosts
    if (importHosts && Array.isArray(items.hosts)) {
      for (const hostData of items.hosts) {
        let targetId = hostData.id;
        if (mode === 'add_new' || !targetId) {
          targetId = `host-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        }

        let assignedIdentityId = hostData.identity_id;
        if (assignedIdentityId && identityIdMap.has(assignedIdentityId)) {
          assignedIdentityId = identityIdMap.get(assignedIdentityId);
        }

        this.saveHost({
          id: targetId,
          name: hostData.name,
          host_type: hostData.host_type,
          hostname: hostData.hostname,
          port: hostData.port,
          identity_id: assignedIdentityId,
          default_path: hostData.default_path,
          startup_command: hostData.startup_command,
          tags: hostData.tags,
          color: hostData.color
        });
        result.hosts++;
      }
    }

    // 3. Importa Workspaces
    if (importWorkspaces && Array.isArray(items.workspaces)) {
      for (const wsData of items.workspaces) {
        let targetId = wsData.id;
        if (mode === 'add_new' || !targetId) {
          targetId = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        }

        this.saveWorkspace({
          id: targetId,
          name: wsData.name,
          layout: wsData.layout,
          color: wsData.color,
          description: wsData.description,
          terminals: wsData.terminals || []
        });
        result.workspaces++;
      }
    }

    // 4. Importa Configurações Gerais e de IA
    if (importSettings && items.settings) {
      if (items.settings.app_language) {
        this.saveSetting('app_language', items.settings.app_language);
      }
      if (items.settings.app_theme) {
        this.saveSetting('app_theme', items.settings.app_theme);
      }

      if (items.settings.ai_config) {
        const incoming = items.settings.ai_config;
        const current = this.getAIConfig(true);

        const mergedDecryptedKeys = {
          ...(current.keys_decrypted || {}),
          ...(incoming.keys_decrypted || {})
        };
        if (incoming.apiKey && incoming.provider && !mergedDecryptedKeys[incoming.provider]) {
          mergedDecryptedKeys[incoming.provider] = incoming.apiKey;
        }

        const newAIConfig = {
          provider: incoming.provider || current.provider || 'gemini',
          model: incoming.model || current.model,
          region: incoming.region || current.region,
          baseUrl: incoming.baseUrl !== undefined ? incoming.baseUrl : current.baseUrl,
          redactSecrets: incoming.redactSecrets !== undefined ? incoming.redactSecrets : current.redactSecrets,
          autoSuggestOnExitError: incoming.autoSuggestOnExitError !== undefined ? incoming.autoSuggestOnExitError : current.autoSuggestOnExitError,
          models: { ...(current.savedModels || {}), ...(incoming.savedModels || {}) },
          regions: { ...(current.savedRegions || {}), ...(incoming.savedRegions || {}) },
          baseUrls: { ...(current.savedBaseUrls || {}), ...(incoming.savedBaseUrls || {}) }
        };

        const keysEnc = {};
        for (const [p, k] of Object.entries(mergedDecryptedKeys)) {
          if (k && typeof k === 'string' && k.trim() && !k.includes('••••') && !k.includes('...')) {
            keysEnc[p] = this.crypto.encrypt(k.trim());
          }
        }
        newAIConfig.keys_enc = keysEnc;
        if (keysEnc[newAIConfig.provider]) {
          newAIConfig.apiKey_enc = keysEnc[newAIConfig.provider];
        }

        this.saveSetting('ai_config', newAIConfig);
      }
      result.settings = true;
    }

    return {
      success: true,
      counts: result,
      imported: result
    };
  }
}

DatabaseManager.DatabaseManager = DatabaseManager;
module.exports = DatabaseManager;
