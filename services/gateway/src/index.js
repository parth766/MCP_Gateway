import express from 'express';
import cors from 'cors';
import { db } from './db.js';
import { upstreamManager } from './upstream-manager.js';
import { registerMcpRoutes, extractAuthUser } from './mcp-server.js';
import { validateUpstreamUrl } from './ssrf-guard.js';
import { generateApiKey } from './crypto.js';
import { chatAgent } from './chat-agent.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000', 10);

// Attach Model Context Protocol Streamable HTTP & SSE endpoints
registerMcpRoutes(app);

// -------------------------------------------------------------
// REST API Routes (Used by Dashboard)
// -------------------------------------------------------------

// Helper middleware for dashboard authentication
function requireAuth(req, res, next) {
  const { user, error } = extractAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: error || 'Authentication required' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin privileges required' });
    }
    next();
  });
}

// Current authenticated user info
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// List all registered upstream MCP servers (credentials redacted!)
app.get('/api/servers', async (req, res) => {
  const servers = db.getServers().map(s => ({
    id: s.id,
    name: s.name,
    url: s.url,
    auth_type: s.auth_type,
    auth_header_name: s.auth_header_name,
    has_credential: !!s.encrypted_credential,
    enabled: s.enabled,
    status: s.status,
    latency_ms: s.latency_ms,
    last_checked: s.last_checked,
    created_at: s.created_at
  }));

  // Also include cached aggregated tools
  const tools = await upstreamManager.aggregateTools();

  res.json({ servers, tools });
});

// Add a new upstream MCP server (Admin only, SSRF protected)
app.post('/api/servers', requireAdmin, async (req, res) => {
  const { id, name, url, auth_type, auth_header_name, credential } = req.body;

  if (!name || !url) {
    return res.status(400).json({ error: 'Name and URL are required' });
  }

  // SSRF Protection
  const urlCheck = validateUpstreamUrl(url);
  if (!urlCheck.valid) {
    return res.status(400).json({ error: `SSRF Validation Error: ${urlCheck.reason}` });
  }

  try {
    const server = db.addServer({
      id,
      name,
      url: urlCheck.url,
      auth_type,
      auth_header_name,
      credential
    });

    // Refresh tool aggregation immediately
    await upstreamManager.aggregateTools();

    res.status(201).json({
      success: true,
      server: {
        id: server.id,
        name: server.name,
        url: server.url,
        auth_type: server.auth_type,
        enabled: server.enabled,
        status: server.status
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Edit / toggle upstream server
app.put('/api/servers/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (updates.url) {
    const urlCheck = validateUpstreamUrl(updates.url);
    if (!urlCheck.valid) {
      return res.status(400).json({ error: `SSRF Validation Error: ${urlCheck.reason}` });
    }
    updates.url = urlCheck.url;
  }

  try {
    const server = db.updateServer(id, updates);
    await upstreamManager.aggregateTools();
    res.json({ success: true, server });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete upstream server
app.delete('/api/servers/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const removed = db.deleteServer(id);
    await upstreamManager.aggregateTools();
    res.json({ success: true, removed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Refresh server status
app.post('/api/servers/:id/refresh', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const server = db.getServerById(id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  try {
    await upstreamManager.sendJsonRpc(server, { jsonrpc: '2.0', id: 'refresh', method: 'ping' });
  } catch (e) {
    // Handled in sendJsonRpc
  }
  await upstreamManager.aggregateTools();
  res.json({ success: true, server: db.getServerById(id) });
});

// List users and their API keys
app.get('/api/users', requireAuth, (req, res) => {
  const users = db.getUsers().map(u => ({
    ...u,
    keys: db.getUserKeys(u.id).map(k => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      revoked: k.revoked,
      created_at: k.created_at
    }))
  }));
  res.json({ users });
});

// Invite / add a team member
app.post('/api/users', requireAdmin, (req, res) => {
  const { username, role } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const user = db.addUser(username, role || 'member');
  // Issue an initial API key
  const rawKey = generateApiKey(`urumi_${user.role}_`);
  const keyRecord = db.addApiKey(user.id, 'Default Initial Key', rawKey);

  res.status(201).json({
    user,
    apiKey: rawKey,
    keyRecord: { id: keyRecord.id, prefix: keyRecord.prefix, name: keyRecord.name }
  });
});

// Generate new API key for a user
app.post('/api/users/:userId/keys', requireAuth, (req, res) => {
  const { userId } = req.params;
  const { name } = req.body;

  // A member can only generate keys for themselves; admin can generate for anyone
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    return res.status(403).json({ error: 'You can only generate keys for your own account' });
  }

  const targetUser = db.getUserById(userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const rawKey = generateApiKey(`urumi_${targetUser.role}_`);
  const keyRecord = db.addApiKey(userId, name || 'User API Key', rawKey);

  res.status(201).json({
    apiKey: rawKey, // Returned ONCE upon generation
    keyRecord: {
      id: keyRecord.id,
      name: keyRecord.name,
      prefix: keyRecord.prefix,
      revoked: false,
      created_at: keyRecord.created_at
    }
  });
});

// Revoke an API key
app.delete('/api/keys/:keyId', requireAuth, (req, res) => {
  const { keyId } = req.params;
  const key = db.getApiKeys().find(k => k.id === keyId);
  if (!key) return res.status(404).json({ error: 'Key not found' });

  if (req.user.role !== 'admin' && req.user.id !== key.user_id) {
    return res.status(403).json({ error: 'You can only revoke your own keys' });
  }

  const revoked = db.revokeApiKey(keyId);
  res.json({ success: true, key: revoked });
});

// Audit Log Viewer
app.get('/api/audit', requireAuth, (req, res) => {
  const limit = parseInt(req.query.limit || '100', 10);
  const logs = db.getAuditLogs(limit);
  res.json({ logs });
});

// Chat Agent Endpoint
app.post('/api/chat', requireAuth, async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Message cannot be empty' });

  try {
    // Chat agent runs as the authenticated user!
    const result = await chatAgent.processMessage({
      message,
      history,
      user: req.user
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Observability: Metrics endpoint (Prometheus format)
app.get('/metrics', (req, res) => {
  const logs = db.getAuditLogs(1000);
  const servers = db.getServers();
  const totalCalls = logs.length;
  const errorCalls = logs.filter(l => l.outcome === 'error').length;
  const connectedServers = servers.filter(s => s.status === 'Connected').length;

  res.setHeader('Content-Type', 'text/plain');
  res.send(`
# HELP mcp_tool_calls_total Total tool calls handled by MCP gateway
# TYPE mcp_tool_calls_total counter
mcp_tool_calls_total ${totalCalls}

# HELP mcp_tool_errors_total Total failed tool calls
# TYPE mcp_tool_errors_total counter
mcp_tool_errors_total ${errorCalls}

# HELP mcp_upstream_servers_connected Number of healthy upstream servers
# TYPE mcp_upstream_servers_connected gauge
mcp_upstream_servers_connected ${connectedServers}

# HELP mcp_upstream_servers_total Total registered upstream servers
# TYPE mcp_upstream_servers_total gauge
mcp_upstream_servers_total ${servers.length}
  `.trim());
});

// Probes
app.get('/healthz', (req, res) => res.json({ status: 'ok', service: 'gateway-backend' }));
app.get('/readyz', (req, res) => res.json({ status: 'ready', service: 'gateway-backend' }));

// Periodic health check every 15 seconds
setInterval(() => {
  upstreamManager.checkAllHealth().catch(err => {
    console.warn('[gateway] Background health check error:', err.message);
  });
}, 15000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[mcp-gateway] Gateway listening on port ${PORT}`);
  console.log(`[mcp-gateway] MCP endpoint ready at /mcp and /mcp/sse`);
  console.log(`[mcp-gateway] Pre-seeded with 3 upstreams (WooCommerce, Currency, Analytics)`);
});
