import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { WooCommerceClient } from './woocommerce-client.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '4001', 10);
const wcClient = new WooCommerceClient();

// Active SSE client sessions
const sessions = new Map();

// MCP Tool Definitions
const TOOLS = [
  {
    name: 'list_products',
    description: 'List products from WooCommerce store with optional filtering by status and search keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search term to filter products by title or SKU' },
        status: { type: 'string', enum: ['any', 'publish', 'draft', 'pending'], description: 'Product status' },
        per_page: { type: 'number', description: 'Number of products per page (default 10)' },
        page: { type: 'number', description: 'Page number' }
      }
    }
  },
  {
    name: 'create_product',
    description: 'Create a new product in the WooCommerce store with name, price, description and SKU.',
    inputSchema: {
      type: 'object',
      required: ['name', 'regular_price'],
      properties: {
        name: { type: 'string', description: 'Product name/title' },
        regular_price: { type: 'string', description: 'Product price in store currency (e.g. "49.99")' },
        description: { type: 'string', description: 'Full HTML or text description of the product' },
        short_description: { type: 'string', description: 'Brief excerpt for product cards' },
        sku: { type: 'string', description: 'Stock Keeping Unit identifier' },
        status: { type: 'string', enum: ['publish', 'draft'], default: 'publish', description: 'Initial publication status' }
      }
    }
  },
  {
    name: 'list_orders',
    description: 'List orders from WooCommerce store, optionally filtered by status or after a given ISO timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'],
          description: 'Filter by order status'
        },
        after_date: { type: 'string', description: 'ISO 8601 timestamp (e.g. 2026-10-19T00:00:00Z) to fetch orders after' },
        per_page: { type: 'number', description: 'Number of orders per page (default 10)' },
        page: { type: 'number', description: 'Page number' }
      }
    }
  },
  {
    name: 'get_order',
    description: 'Retrieve detailed information for a single order by its numeric ID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'number', description: 'Numeric ID of the order' }
      }
    }
  },
  {
    name: 'update_order_status',
    description: 'Update the status of an existing WooCommerce order (e.g. mark as processing or completed).',
    inputSchema: {
      type: 'object',
      required: ['id', 'status'],
      properties: {
        id: { type: 'number', description: 'Numeric ID of the order' },
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'],
          description: 'Target order status'
        }
      }
    }
  }
];

// Execute MCP Tool call
async function handleToolCall(name, args) {
  switch (name) {
    case 'list_products':
      return await wcClient.listProducts(args || {});
    case 'create_product':
      return await wcClient.createProduct(args || {});
    case 'list_orders':
      return await wcClient.listOrders(args || {});
    case 'get_order':
      return await wcClient.getOrder(args?.id);
    case 'update_order_status':
      return await wcClient.updateOrderStatus(args?.id, args?.status);
    default:
      throw new Error(`Unknown tool "${name}" on WooCommerce MCP server`);
  }
}

// Handle JSON-RPC 2.0 messages
async function handleJsonRpc(request) {
  const { id, method, params } = request;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: 'woocommerce-mcp',
          version: '1.0.0'
        }
      }
    };
  }

  if (method === 'notifications/initialized') {
    return null; // Notifications do not return a result
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOLS
      }
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: toolArgs } = params || {};
    try {
      const data = await handleToolCall(name, toolArgs);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: typeof data === 'string' ? data : JSON.stringify(data, null, 2)
            }
          ],
          isError: false
        }
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${err.message}`
            }
          ],
          isError: true
        }
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`
    }
  };
}

// -------------------------------------------------------------
// Streamable HTTP (SSE) Transports
// -------------------------------------------------------------

// GET /sse - Establishes MCP SSE session
app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sessionId = randomUUID();
  sessions.set(sessionId, res);

  // Send initial endpoint event directing client where to POST messages
  const messageUrl = `/messages?sessionId=${sessionId}`;
  res.write(`event: endpoint\ndata: ${messageUrl}\n\n`);

  req.on('close', () => {
    sessions.delete(sessionId);
  });
});

// POST /messages - Processes messages for an active SSE session
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const sseRes = sessions.get(sessionId);

  const request = req.body;
  const response = await handleJsonRpc(request);

  if (response && sseRes) {
    sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
  }

  // Acknowledge receipt
  res.status(202).send('Accepted');
});

// POST /mcp or POST / - Direct Streamable HTTP JSON-RPC endpoint
app.post(['/mcp', '/'], async (req, res) => {
  const request = req.body;
  const response = await handleJsonRpc(request);
  if (response) {
    res.json(response);
  } else {
    res.status(204).end();
  }
});

// Helper for test checkout simulation
app.post('/api/simulate-order', (req, res) => {
  const order = wcClient.recordStorefrontOrder(req.body);
  res.json({ success: true, order });
});

// Kubernetes Health & Readiness Probes
app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok', service: 'woocommerce-mcp' }));
app.get('/readyz', (req, res) => res.status(200).json({ status: 'ready', service: 'woocommerce-mcp' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[woocommerce-mcp] Server listening on port ${PORT}`);
  console.log(`[woocommerce-mcp] Speaking MCP over Streamable HTTP (SSE: /sse, RPC: /mcp)`);
});
