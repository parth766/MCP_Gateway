import { randomUUID } from 'crypto';
import { db } from './db.js';
import { upstreamManager } from './upstream-manager.js';

// Connected SSE clients: sessionId -> { res, user }
const sseSessions = new Map();

/**
 * Extract and authenticate API key from request
 */
export function extractAuthUser(req) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];
  const queryKey = req.query.apiKey || req.query.api_key;

  let rawKey = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawKey = authHeader.slice(7).trim();
  } else if (apiKeyHeader) {
    rawKey = apiKeyHeader.trim();
  } else if (queryKey) {
    rawKey = String(queryKey).trim();
  }

  if (!rawKey) return { user: null, error: 'Missing API key. Provide Authorization: Bearer <key>' };

  const auth = db.authenticateApiKey(rawKey);
  if (!auth) return { user: null, error: 'Invalid API key.' };
  if (auth.error) return { user: null, error: auth.error };

  return { user: auth.user, error: null };
}

/**
 * Stand-out Feature: Role-Based Tool Access Control (RBAC)
 * Admins have access to all tools.
 * Members are restricted from destructive / mutating operations unless granted.
 */
function isToolAllowedForUser(user, toolName) {
  if (!user || user.role === 'admin') return true;

  // If role is member:
  // Disallowed mutating tools: create_product, update_order_status
  const restrictedToolsForMembers = ['create_product', 'woocommerce__create_product', 'update_order_status', 'woocommerce__update_order_status'];
  if (restrictedToolsForMembers.includes(toolName)) {
    return false;
  }
  return true;
}

/**
 * Handle incoming MCP JSON-RPC 2.0 requests
 */
export async function handleMcpRpc(request, user) {
  const { id, method, params } = request;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: { listChanged: true }
        },
        serverInfo: {
          name: 'urumi-mcp-gateway',
          version: '1.0.0'
        }
      }
    };
  }

  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };

  if (method === 'tools/list') {
    const allTools = await upstreamManager.aggregateTools();
    // Filter according to user's permissions
    const visibleTools = allTools.filter(t => isToolAllowedForUser(user, t.name));
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: visibleTools }
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: toolArgs } = params || {};

    // Check RBAC permission
    if (!isToolAllowedForUser(user, name)) {
      const errMsg = `Permission Denied: User role "${user.role}" is not authorized to call restricted tool "${name}".`;
      db.logToolCall({
        user,
        serverId: 'gateway-security',
        serverName: 'Gateway RBAC Policy',
        toolName: name,
        inputSummary: toolArgs,
        durationMs: 1,
        outcome: 'error',
        errorMessage: errMsg
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: errMsg }],
          isError: true
        }
      };
    }

    // Route tool call to upstream
    const callResult = await upstreamManager.callTool(name, toolArgs);

    if (callResult.error) {
      // Log failed call in audit log
      db.logToolCall({
        user,
        serverId: callResult.serverId,
        serverName: callResult.serverName,
        toolName: name,
        inputSummary: toolArgs,
        durationMs: callResult.durationMs,
        outcome: 'error',
        errorMessage: callResult.error
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Upstream Error (${callResult.serverName}): ${callResult.error}` }],
          isError: true
        }
      };
    }

    // Extract content from upstream response
    const upstreamRes = callResult.response?.result;
    const isError = upstreamRes?.isError || false;
    const content = upstreamRes?.content || [{ type: 'text', text: JSON.stringify(upstreamRes || {}) }];

    // Log success in audit log
    db.logToolCall({
      user,
      serverId: callResult.serverId,
      serverName: callResult.serverName,
      toolName: name,
      inputSummary: toolArgs,
      durationMs: callResult.durationMs,
      outcome: isError ? 'error' : 'success',
      errorMessage: isError ? JSON.stringify(content) : null
    });

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content,
        isError
      }
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  };
}

/**
 * Attach Streamable HTTP MCP routes to Express
 */
export function registerMcpRoutes(app) {
  // GET /mcp/sse - Standard MCP Server-Sent Events stream
  app.get('/mcp/sse', (req, res) => {
    const { user, error } = extractAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: error || 'Unauthorized' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sessionId = randomUUID();
    sseSessions.set(sessionId, { res, user });

    // Send endpoint event according to MCP specification
    res.write(`event: endpoint\ndata: /mcp/messages?sessionId=${sessionId}\n\n`);

    req.on('close', () => {
      sseSessions.delete(sessionId);
    });
  });

  // POST /mcp/messages - Client message receiver for active SSE sessions
  app.post('/mcp/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    const session = sseSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'SSE session not found or expired' });
    }

    const response = await handleMcpRpc(req.body, session.user);
    if (response) {
      session.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    }

    res.status(202).send('Accepted');
  });

  // POST /mcp - Direct Streamable HTTP JSON-RPC endpoint
  app.post('/mcp', async (req, res) => {
    const { user, error } = extractAuthUser(req);
    if (!user) {
      return res.status(401).json({
        jsonrpc: '2.0',
        id: req.body?.id || null,
        error: { code: -32000, message: error || 'Unauthorized' }
      });
    }

    const response = await handleMcpRpc(req.body, user);
    if (response) {
      res.json(response);
    } else {
      res.status(204).end();
    }
  });
}
