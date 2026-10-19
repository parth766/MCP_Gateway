import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.PORT || '4002', 10);
const EXPECTED_BEARER = process.env.AUTH_BEARER_TOKEN || 'currency_secret_token_123';

// Optional Bearer Auth validation
function checkAuth(req, res, next) {
  if (process.env.REQUIRE_AUTH === 'true') {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${EXPECTED_BEARER}`) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing Bearer token' });
    }
  }
  next();
}

app.use(checkAuth);

const sessions = new Map();

// Base rates relative to 1 USD
const RATES_TO_USD = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 152.4,
  CAD: 1.36,
  AUD: 1.51,
  INR: 83.5
};

const TOOLS = [
  {
    name: 'convert_currency',
    description: 'Convert an amount from one fiat currency to another (e.g. USD to EUR, GBP, JPY).',
    inputSchema: {
      type: 'object',
      required: ['amount', 'from', 'to'],
      properties: {
        amount: { type: 'number', description: 'Monetary amount to convert' },
        from: { type: 'string', description: 'Source 3-letter currency code (e.g. USD, EUR, GBP)' },
        to: { type: 'string', description: 'Target 3-letter currency code (e.g. EUR, USD, JPY)' }
      }
    }
  },
  {
    name: 'get_exchange_rates',
    description: 'Get current exchange rates against a base currency.',
    inputSchema: {
      type: 'object',
      properties: {
        base: { type: 'string', default: 'USD', description: 'Base 3-letter currency code' }
      }
    }
  }
];

function handleToolCall(name, args) {
  if (name === 'convert_currency') {
    const { amount, from, to } = args || {};
    const fromCode = (from || 'USD').toUpperCase();
    const toCode = (to || 'EUR').toUpperCase();
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount)) throw new Error('Invalid numeric amount');
    if (!RATES_TO_USD[fromCode]) throw new Error(`Unsupported source currency: ${fromCode}`);
    if (!RATES_TO_USD[toCode]) throw new Error(`Unsupported target currency: ${toCode}`);

    // Convert from -> USD -> to
    const inUSD = numAmount / RATES_TO_USD[fromCode];
    const converted = inUSD * RATES_TO_USD[toCode];

    return {
      original_amount: numAmount,
      from_currency: fromCode,
      to_currency: toCode,
      converted_amount: parseFloat(converted.toFixed(2)),
      exchange_rate: parseFloat((RATES_TO_USD[toCode] / RATES_TO_USD[fromCode]).toFixed(4)),
      timestamp: new Date().toISOString()
    };
  }

  if (name === 'get_exchange_rates') {
    const base = (args?.base || 'USD').toUpperCase();
    if (!RATES_TO_USD[base]) throw new Error(`Unsupported base currency: ${base}`);

    const baseToUsd = RATES_TO_USD[base];
    const rates = {};
    for (const [curr, val] of Object.entries(RATES_TO_USD)) {
      rates[curr] = parseFloat((val / baseToUsd).toFixed(4));
    }
    return {
      base_currency: base,
      rates,
      timestamp: new Date().toISOString()
    };
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
        serverInfo: { name: 'currency-mcp', version: '1.0.0' }
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

app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok', service: 'currency-mcp' }));
app.get('/readyz', (req, res) => res.status(200).json({ status: 'ready', service: 'currency-mcp' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[currency-mcp] Listening on port ${PORT}`);
});
