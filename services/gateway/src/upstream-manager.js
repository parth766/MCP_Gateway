import { db } from './db.js';
import { decryptCredential } from './crypto.js';

const TIMEOUT_MS = parseInt(process.env.UPSTREAM_TIMEOUT_MS || '5000', 10);

export class UpstreamManager {
  constructor() {
    this.cachedTools = [];
    this.toolRoutingMap = new Map(); // resolvedName -> { serverId, originalToolName }
  }

  getHeaders(server) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (!server.encrypted_credential) return headers;

    const secret = decryptCredential(server.encrypted_credential);
    if (!secret) return headers;

    if (server.auth_type === 'bearer') {
      headers['Authorization'] = `Bearer ${secret}`;
    } else if (server.auth_type === 'header' && server.auth_header_name) {
      headers[server.auth_header_name] = secret;
    }
    return headers;
  }

  // Derive JSON-RPC POST endpoint from server URL
  getRpcUrl(server) {
    const url = server.url.replace(/\/+$/, '');
    if (url.endsWith('/sse')) {
      // Streamable HTTP standard fallback for direct RPC
      return url.replace(/\/sse$/, '/mcp');
    }
    return url;
  }

  /**
   * Send JSON-RPC request to upstream server with strict timeout and error capture
   */
  async sendJsonRpc(server, payload) {
    const rpcUrl = this.getRpcUrl(server);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const startTime = Date.now();

    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: this.getHeaders(server),
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);

      const latency = Date.now() - startTime;
      db.updateServer(server.id, {
        status: 'Connected',
        latency_ms: latency,
        last_checked: new Date().toISOString()
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeout);
      const isTimeout = err.name === 'AbortError';
      const errMsg = isTimeout
        ? `Upstream timed out after ${TIMEOUT_MS}ms`
        : `Upstream connection failed: ${err.message}`;

      // Mark server as Unreachable in state
      db.updateServer(server.id, {
        status: 'Unreachable',
        last_checked: new Date().toISOString()
      });

      throw new Error(errMsg);
    }
  }

  /**
   * Aggregate tools from all enabled upstream servers.
   * Resilient: Failure or timeout of one server does NOT block others.
   */
  async aggregateTools() {
    const servers = db.getServers().filter(s => s.enabled);
    const aggregated = [];
    const routing = new Map();
    const toolNameCounts = new Map();

    // Query each enabled server in parallel
    const promises = servers.map(async (server) => {
      try {
        const res = await this.sendJsonRpc(server, {
          jsonrpc: '2.0',
          id: `list-${Date.now()}`,
          method: 'tools/list',
          params: {}
        });

        const tools = res?.result?.tools || [];
        return { server, tools, error: null };
      } catch (err) {
        console.warn(`[upstream-manager] Could not fetch tools from "${server.name}" (${server.id}): ${err.message}`);
        return { server, tools: [], error: err.message };
      }
    });

    const results = await Promise.all(promises);

    // First pass: count name occurrences for collision detection
    for (const { server, tools } of results) {
      for (const t of tools) {
        toolNameCounts.set(t.name, (toolNameCounts.get(t.name) || 0) + 1);
      }
    }

    // Second pass: construct aggregated tool specifications
    for (const { server, tools } of results) {
      for (const t of tools) {
        const namespacedName = `${server.id}__${t.name}`;

        // Primary namespaced entry (always collision-free)
        const namespacedTool = {
          name: namespacedName,
          description: `[Server: ${server.name}] ${t.description || ''}`,
          inputSchema: t.inputSchema || { type: 'object', properties: {} }
        };
        aggregated.push(namespacedTool);
        routing.set(namespacedName, {
          serverId: server.id,
          serverName: server.name,
          originalToolName: t.name
        });

        // Convenient short alias IF there is no collision across servers
        if (toolNameCounts.get(t.name) === 1) {
          aggregated.push({
            name: t.name,
            description: `(Alias for ${namespacedName}) ${t.description || ''}`,
            inputSchema: t.inputSchema || { type: 'object', properties: {} }
          });
          routing.set(t.name, {
            serverId: server.id,
            serverName: server.name,
            originalToolName: t.name
          });
        }
      }
    }

    this.cachedTools = aggregated;
    this.toolRoutingMap = routing;
    return aggregated;
  }

  /**
   * Execute a tool call by routing it to the appropriate upstream server
   */
  async callTool(toolName, toolArgs) {
    // If routing cache is empty or tool is unknown, re-aggregate
    if (!this.toolRoutingMap.has(toolName)) {
      await this.aggregateTools();
    }

    const route = this.toolRoutingMap.get(toolName);
    if (!route) {
      throw new Error(`Tool "${toolName}" not found on any active upstream server.`);
    }

    const server = db.getServerById(route.serverId);
    if (!server) {
      throw new Error(`Upstream server "${route.serverId}" no longer exists.`);
    }

    if (!server.enabled) {
      throw new Error(`Upstream server "${server.name}" (${server.id}) is disabled by administrator.`);
    }

    const startTime = Date.now();
    try {
      const response = await this.sendJsonRpc(server, {
        jsonrpc: '2.0',
        id: `call-${Date.now()}`,
        method: 'tools/call',
        params: {
          name: route.originalToolName,
          arguments: toolArgs || {}
        }
      });

      const durationMs = Date.now() - startTime;
      return {
        serverId: server.id,
        serverName: server.name,
        targetTool: route.originalToolName,
        durationMs,
        response
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      return {
        serverId: server.id,
        serverName: server.name,
        targetTool: route.originalToolName,
        durationMs,
        error: err.message
      };
    }
  }

  /**
   * Health-check all registered servers in background
   */
  async checkAllHealth() {
    const servers = db.getServers();
    for (const s of servers) {
      if (!s.enabled) {
        db.updateServer(s.id, { status: 'Disabled' });
        continue;
      }
      try {
        await this.sendJsonRpc(s, {
          jsonrpc: '2.0',
          id: 'ping',
          method: 'ping'
        });
      } catch (e) {
        // Status updated to Unreachable inside sendJsonRpc
      }
    }
  }
}

export const upstreamManager = new UpstreamManager();
