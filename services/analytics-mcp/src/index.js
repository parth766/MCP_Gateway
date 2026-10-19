import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '4003', 10);
const EXPECTED_API_KEY = process.env.AUTH_API_KEY || 'analytics_secret_key_456';

function checkAuth(req, res, next) {
  if (process.env.REQUIRE_AUTH === 'true') {
    const key = req.headers['x-api-key'] || req.headers['authorization'];
    if (!key || (key !== EXPECTED_API_KEY && key !== `Bearer ${EXPECTED_API_KEY}`)) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key header' });
    }
  }
  next();
}

app.use(checkAuth);

const sessions = new Map();

const TOOLS = [
  {
    name: 'calculate_sales_summary',
    description: 'Calculate gross sales summary, average order value (AOV), and status breakdown given an array of orders or order totals.',
    inputSchema: {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              total: { type: ['string', 'number'] },
              status: { type: 'string' }
            }
          },
          description: 'List of order objects to aggregate'
        },
        currency: { type: 'string', default: 'USD', description: 'Store currency' }
      }
    }
  },
  {
    name: 'check_inventory_alert',
    description: 'Check a product list against low stock threshold and return actionable inventory replenishment alerts.',
    inputSchema: {
      type: 'object',
      properties: {
        threshold: { type: 'number', default: 5, description: 'Low stock threshold count' },
        products: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              stock_quantity: { type: 'number' }
            }
          }
        }
      }
    }
  },
  {
    name: 'generate_order_receipt',
    description: 'Generate an official formatted text receipt for a customer order.',
    inputSchema: {
      type: 'object',
      required: ['order_id', 'total'],
      properties: {
        order_id: { type: 'number', description: 'Order ID' },
        customer_name: { type: 'string', description: 'Customer full name' },
        total: { type: ['string', 'number'], description: 'Total paid amount' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              quantity: { type: 'number' },
              total: { type: ['string', 'number'] }
            }
          }
        }
      }
    }
  }
];

function handleToolCall(name, args) {
  if (name === 'calculate_sales_summary') {
    const orders = Array.isArray(args?.orders) ? args.orders : [];
    let grossRevenue = 0;
    const statusCounts = {};

    for (const order of orders) {
      const amt = parseFloat(order.total || 0);
      if (!isNaN(amt)) grossRevenue += amt;
      const st = order.status || 'unknown';
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    }

    const orderCount = orders.length;
    const aov = orderCount > 0 ? grossRevenue / orderCount : 0;

    return {
      period: 'Today / Selected Period',
      total_orders: orderCount,
      gross_merchandise_value: parseFloat(grossRevenue.toFixed(2)),
      average_order_value: parseFloat(aov.toFixed(2)),
      currency: args?.currency || 'USD',
      status_breakdown: statusCounts,
      calculated_at: new Date().toISOString()
    };
  }

  if (name === 'check_inventory_alert') {
    const threshold = args?.threshold ?? 5;
    const products = Array.isArray(args?.products) ? args.products : [];
    const alerts = [];

    for (const p of products) {
      const qty = p.stock_quantity ?? 0;
      if (qty <= threshold) {
        alerts.push({
          product_id: p.id,
          name: p.name,
          current_stock: qty,
          severity: qty === 0 ? 'CRITICAL_OUT_OF_STOCK' : 'WARNING_LOW_STOCK',
          recommendation: `Restock at least ${Math.max(10, threshold * 2)} units immediately.`
        });
      }
    }

    return {
      threshold,
      items_checked: products.length,
      alerts_count: alerts.length,
      alerts
    };
  }

  if (name === 'generate_order_receipt') {
    const { order_id, customer_name, total, items = [] } = args || {};
    const formattedItems = items.map(i => `  • ${i.name || 'Item'} x${i.quantity || 1} - $${i.total || '0.00'}`).join('\n');

    const receipt = `
========================================
       WOOCOMMERCE OFFICIAL RECEIPT     
========================================
Order ID: #${order_id}
Date: ${new Date().toLocaleString()}
Customer: ${customer_name || 'Valued Customer'}
----------------------------------------
Items:
${formattedItems || '  • Storefront Purchase'}
----------------------------------------
Total Paid: $${total}
Status: Confirmed / Paid via Cash on Delivery
========================================
Thank you for shopping with our store!
`;
    return { receipt: receipt.trim() };
  }

  throw new Error(`Unknown tool "${name}"`);
}

async function handleJsonRpc(request) {
  const { id, method, params } = request;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'analytics-mcp', version: '1.0.0' }
      }
    };
  }

  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }

  if (method === 'tools/call') {
    const { name, arguments: toolArgs } = params || {};
    try {
      const data = handleToolCall(name, toolArgs);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          isError: false
        }
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        }
      };
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sessionId = randomUUID();
  sessions.set(sessionId, res);

  res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

  req.on('close', () => sessions.delete(sessionId));
});

app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;
  const sseRes = sessions.get(sessionId);
  const response = await handleJsonRpc(req.body);

  if (response && sseRes) {
    sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
  }
  res.status(202).send('Accepted');
});

app.post(['/mcp', '/'], async (req, res) => {
  const response = await handleJsonRpc(req.body);
  if (response) res.json(response);
  else res.status(204).end();
});

app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok', service: 'analytics-mcp' }));
app.get('/readyz', (req, res) => res.status(200).json({ status: 'ready', service: 'analytics-mcp' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[analytics-mcp] Listening on port ${PORT}`);
});
