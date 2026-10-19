import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { hashApiKey, encryptCredential } from './crypto.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve('./data');
const DB_FILE = path.join(DATA_DIR, 'gateway_data.json');

// Initial seed data
const DEFAULT_DATA = () => {
  const adminRawKey = 'urumi_admin_key_12345';
  const memberRawKey = 'urumi_member_key_67890';

  const wcUrl = process.env.WOOCOMMERCE_MCP_URL || 'http://woocommerce-mcp:4001/sse';
  const currencyUrl = process.env.CURRENCY_MCP_URL || 'http://currency-mcp:4002/sse';
  const analyticsUrl = process.env.ANALYTICS_MCP_URL || 'http://analytics-mcp:4003/sse';

  return {
    users: [
      {
        id: 'usr-admin-01',
        username: 'userA_admin',
        role: 'admin', // 'admin' | 'member'
        status: 'active',
        created_at: new Date().toISOString()
      },
      {
        id: 'usr-member-02',
        username: 'userB_member',
        role: 'member',
        status: 'active',
        created_at: new Date().toISOString()
      }
    ],
    api_keys: [
      {
        id: 'key-admin-01',
        user_id: 'usr-admin-01',
        name: 'Admin Master Key',
        key_hash: hashApiKey(adminRawKey),
        prefix: 'urumi_admin_****',
        revoked: false,
        created_at: new Date().toISOString()
      },
      {
        id: 'key-member-02',
        user_id: 'usr-member-02',
        name: "User B's Development Key",
        key_hash: hashApiKey(memberRawKey),
        prefix: 'urumi_member_****',
        revoked: false,
        created_at: new Date().toISOString()
      }
    ],
    servers: [
      {
        id: 'woocommerce',
        name: 'WooCommerce Store MCP',
        url: wcUrl,
        auth_type: 'none',
        auth_header_name: '',
        encrypted_credential: '',
        enabled: true,
        status: 'Connected',
        last_checked: new Date().toISOString(),
        latency_ms: 12,
        created_at: new Date().toISOString()
      },
      {
        id: 'currency',
        name: 'Currency & Pricing MCP',
        url: currencyUrl,
        auth_type: 'bearer',
        auth_header_name: 'Authorization',
        encrypted_credential: encryptCredential('currency_secret_token_123'),
        enabled: true,
        status: 'Connected',
        last_checked: new Date().toISOString(),
        latency_ms: 8,
        created_at: new Date().toISOString()
      },
      {
        id: 'analytics',
        name: 'Store Analytics & Inventory MCP',
        url: analyticsUrl,
        auth_type: 'header',
        auth_header_name: 'X-API-Key',
        encrypted_credential: encryptCredential('analytics_secret_key_456'),
        enabled: true,
        status: 'Connected',
        last_checked: new Date().toISOString(),
        latency_ms: 10,
        created_at: new Date().toISOString()
      }
    ],
    audit_logs: [
      {
        id: 'log-seed-01',
        user_id: 'usr-admin-01',
        username: 'userA_admin',
        user_role: 'admin',
        server_id: 'woocommerce',
        server_name: 'WooCommerce Store MCP',
        tool_name: 'list_products',
        input_summary: '{}',
        duration_ms: 15,
        outcome: 'success',
        error_message: null,
        timestamp: new Date(Date.now() - 3600000).toISOString()
      }
    ]
  };
};

class Database {
  constructor() {
    this.data = null;
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
      } else {
        this.data = DEFAULT_DATA();
        this.save();
      }
    } catch (err) {
      console.warn('[db] Failed to load disk state, using memory seed:', err.message);
      this.data = DEFAULT_DATA();
    }
  }

  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[db] Error saving database to file:', err.message);
    }
  }

  // --- Users ---
  getUsers() {
    return this.data.users;
  }

  getUserById(id) {
    return this.data.users.find(u => u.id === id);
  }

  addUser(username, role = 'member') {
    const user = {
      id: `usr-${randomUUID().slice(0, 8)}`,
      username,
      role,
      status: 'active',
      created_at: new Date().toISOString()
    };
    this.data.users.push(user);
    this.save();
    return user;
  }

  // --- API Keys ---
  getApiKeys() {
    return this.data.api_keys;
  }

  getUserKeys(userId) {
    return this.data.api_keys.filter(k => k.user_id === userId);
  }

  addApiKey(userId, name, rawKey) {
    const keyRecord = {
      id: `key-${randomUUID().slice(0, 8)}`,
      user_id: userId,
      name,
      key_hash: hashApiKey(rawKey),
      prefix: `${rawKey.slice(0, 12)}****`,
      revoked: false,
      created_at: new Date().toISOString()
    };
    this.data.api_keys.push(keyRecord);
    this.save();
    return keyRecord;
  }

  revokeApiKey(keyId) {
    const key = this.data.api_keys.find(k => k.id === keyId);
    if (!key) throw new Error(`API key ${keyId} not found`);
    key.revoked = true;
    this.save();
    return key;
  }

  authenticateApiKey(rawKey) {
    if (!rawKey) return null;
    const computedHash = hashApiKey(rawKey);
    const keyRecord = this.data.api_keys.find(k => k.key_hash === computedHash);
    if (!keyRecord) return null;
    if (keyRecord.revoked) return { error: 'API key has been revoked' };

    const user = this.getUserById(keyRecord.user_id);
    if (!user || user.status !== 'active') return { error: 'User is deactivated or deleted' };

    return { user, keyRecord };
  }

  // --- Servers ---
  getServers() {
    return this.data.servers;
  }

  getServerById(id) {
    return this.data.servers.find(s => s.id === id);
  }

  addServer({ id, name, url, auth_type, auth_header_name, credential }) {
    const serverId = id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (this.getServerById(serverId)) {
      throw new Error(`Server with ID "${serverId}" already exists.`);
    }

    const server = {
      id: serverId,
      name,
      url,
      auth_type: auth_type || 'none',
      auth_header_name: auth_header_name || '',
      encrypted_credential: credential ? encryptCredential(credential) : '',
      enabled: true,
      status: 'Connected',
      last_checked: new Date().toISOString(),
      latency_ms: 0,
      created_at: new Date().toISOString()
    };
    this.data.servers.push(server);
    this.save();
    return server;
  }

  updateServer(id, updates) {
    const server = this.getServerById(id);
    if (!server) throw new Error(`Server "${id}" not found`);

    if (updates.name !== undefined) server.name = updates.name;
    if (updates.url !== undefined) server.url = updates.url;
    if (updates.auth_type !== undefined) server.auth_type = updates.auth_type;
    if (updates.auth_header_name !== undefined) server.auth_header_name = updates.auth_header_name;
    if (updates.credential !== undefined) {
      server.encrypted_credential = updates.credential ? encryptCredential(updates.credential) : '';
    }
    if (updates.enabled !== undefined) server.enabled = !!updates.enabled;
    if (updates.status !== undefined) server.status = updates.status;
    if (updates.last_checked !== undefined) server.last_checked = updates.last_checked;
    if (updates.latency_ms !== undefined) server.latency_ms = updates.latency_ms;

    this.save();
    return server;
  }

  deleteServer(id) {
    const idx = this.data.servers.findIndex(s => s.id === id);
    if (idx === -1) throw new Error(`Server "${id}" not found`);
    const removed = this.data.servers.splice(idx, 1)[0];
    this.save();
    return removed;
  }

  // --- Audit Logs ---
  getAuditLogs(limit = 100) {
    return [...this.data.audit_logs].reverse().slice(0, limit);
  }

  logToolCall({ user, serverId, serverName, toolName, inputSummary, durationMs, outcome, errorMessage }) {
    const entry = {
      id: `log-${randomUUID().slice(0, 10)}`,
      user_id: user?.id || 'anonymous',
      username: user?.username || 'anonymous',
      user_role: user?.role || 'member',
      server_id: serverId,
      server_name: serverName || serverId,
      tool_name: toolName,
      input_summary: typeof inputSummary === 'string' ? inputSummary : JSON.stringify(inputSummary || {}),
      duration_ms: Math.round(durationMs),
      outcome: outcome || 'success', // 'success' | 'error'
      error_message: errorMessage || null,
      timestamp: new Date().toISOString()
    };
    this.data.audit_logs.push(entry);
    // Keep max 2000 log entries in storage
    if (this.data.audit_logs.length > 2000) {
      this.data.audit_logs.shift();
    }
    this.save();
    return entry;
  }
}

export const db = new Database();
