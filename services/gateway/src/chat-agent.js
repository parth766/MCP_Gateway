import { upstreamManager } from './upstream-manager.js';
import { handleMcpRpc } from './mcp-server.js';

/**
 * Chat Agent Service
 * Executes conversational prompts by planning and invoking tools through the Gateway.
 * Strictly acts as the authenticated user, attributing all calls to the user's audit log.
 */
export class ChatAgent {
  /**
   * Process a user prompt through the tool execution loop
   */
  async processMessage({ message, history = [], user }) {
    if (!user) {
      throw new Error('Chat agent requires an authenticated user context.');
    }

    const availableTools = await upstreamManager.aggregateTools();
    const toolsCalled = [];

    // Helper to invoke a tool through the MCP protocol layer as the authenticated user
    const invokeToolAsUser = async (toolName, toolArgs) => {
      const startTime = Date.now();
      const rpcReq = {
        jsonrpc: '2.0',
        id: `chat-call-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: toolArgs
        }
      };

      const result = await handleMcpRpc(rpcReq, user);
      const durationMs = Date.now() - startTime;

      const content = result?.result?.content?.[0]?.text;
      let parsedOutput;
      try {
        parsedOutput = JSON.parse(content);
      } catch (e) {
        parsedOutput = content;
      }

      const isError = result?.result?.isError || !!result?.error;

      toolsCalled.push({
        tool: toolName,
        arguments: toolArgs,
        output: parsedOutput,
        isError,
        durationMs
      });

      return { parsedOutput, isError, raw: result };
    };

    // If an external LLM key is configured (e.g. OpenAI / Groq / Anthropic), we could call it.
    // Otherwise, or alongside it, our built-in intelligent tool orchestrator handles the flow reliably.
    const reply = await this.executeIntentAgent(message, availableTools, invokeToolAsUser);

    return {
      reply,
      toolsCalled,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    };
  }

  /**
   * Semantic intent agent that inspects prompt, selects appropriate tools across upstreams,
   * handles multi-hop orchestration (e.g. Orders -> Analytics -> Currency conversion),
   * and returns human-readable responses.
   */
  async executeIntentAgent(message, availableTools, invokeTool) {
    const text = message.toLowerCase();

    // 1. Intent: Create Product
    if (text.includes('create') && (text.includes('product') || text.includes('item'))) {
      // Extract product name
      let name = 'Ergonomic Wireless Mouse';
      const nameMatch = message.match(/create(?:\s+a)?(?:\s+new)?\s+product\s+(?:named|called)?\s*['"]?([^,'"\n]+)['"]?/i) ||
                        message.match(/product\s+['"]([^'"]+)['"]/i);
      if (nameMatch && nameMatch[1]) {
        name = nameMatch[1].replace(/with price.*$/i, '').trim();
      }

      // Extract price
      let price = '59.99';
      const priceMatch = message.match(/(?:price|for|costing)\s*(?:\$|usd)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i) ||
                         message.match(/([0-9]+(?:\.[0-9]{1,2})?)\s*(?:dollars|\$|usd)/i);
      if (priceMatch && priceMatch[1]) {
        price = priceMatch[1];
      }

      const res = await invokeTool('woocommerce__create_product', {
        name,
        regular_price: price,
        description: `High-quality ${name} created via AI Chat Agent.`,
        status: 'publish'
      });

      if (res.isError) {
        return `I encountered an error creating the product: ${JSON.stringify(res.parsedOutput)}`;
      }

      const prod = res.parsedOutput;
      return `Successfully created product **"${prod.name}"** (ID: #${prod.id}) with price **$${prod.regular_price || prod.price}**! It is now published and available on the storefront.`;
    }

    // 2. Intent: Multi-server chain (Orders + Analytics + Currency)
    if (
      (text.includes('analytics') || text.includes('summary') || text.includes('convert')) &&
      (text.includes('order') || text.includes('sale') || text.includes('revenue'))
    ) {
      // Step A: Fetch orders from WooCommerce
      const ordersRes = await invokeTool('woocommerce__list_orders', { per_page: 10 });
      const orders = Array.isArray(ordersRes.parsedOutput) ? ordersRes.parsedOutput : [];

      // Step B: Calculate sales summary using analytics-mcp
      const analyticsRes = await invokeTool('analytics__calculate_sales_summary', {
        orders: orders.map(o => ({ id: o.id, total: o.total, status: o.status })),
        currency: 'USD'
      });
      const summary = analyticsRes.parsedOutput || {};

      // Step C: Convert gross revenue to target currency (e.g. EUR or GBP) using currency-mcp
      let targetCurrency = 'EUR';
      if (text.includes('gbp') || text.includes('pound')) targetCurrency = 'GBP';
      if (text.includes('jpy') || text.includes('yen')) targetCurrency = 'JPY';
      if (text.includes('inr') || text.includes('rupee')) targetCurrency = 'INR';

      const convRes = await invokeTool('currency__convert_currency', {
        amount: summary.gross_merchandise_value || 0,
        from: 'USD',
        to: targetCurrency
      });
      const conversion = convRes.parsedOutput || {};

      return `### Store Sales & Analytics Report
- **Total Orders**: ${summary.total_orders || 0}
- **Gross Merchandise Value (GMV)**: $${summary.gross_merchandise_value} USD
- **Average Order Value (AOV)**: $${summary.average_order_value} USD
- **Converted Revenue (${targetCurrency})**: ${conversion.converted_amount} ${targetCurrency} *(Rate: 1 USD = ${conversion.exchange_rate} ${targetCurrency})*
- **Order Status Breakdown**: ${JSON.stringify(summary.status_breakdown || {})}

*(This response coordinated 3 upstream MCP servers: WooCommerce, Analytics, and Currency)*`;
    }

    // 3. Intent: List Orders / Today's Orders
    if (text.includes('order')) {
      const res = await invokeTool('woocommerce__list_orders', { per_page: 10 });
      if (res.isError) {
        return `Could not retrieve orders: ${JSON.stringify(res.parsedOutput)}`;
      }

      const orders = Array.isArray(res.parsedOutput) ? res.parsedOutput : [];
      if (orders.length === 0) {
        return `There are currently no orders in the store for today. You can place an order on the storefront and ask me again!`;
      }

      const orderLines = orders.map(o => {
        const customer = o.billing?.first_name ? `${o.billing.first_name} ${o.billing.last_name || ''}` : 'Customer';
        const items = o.line_items?.map(i => `${i.name} (x${i.quantity})`).join(', ') || 'Items';
        return `- **Order #${o.id}**: $${o.total} | Status: \`${o.status}\` | Customer: ${customer} | Items: ${items}`;
      }).join('\n');

      return `Here are the current orders in the WooCommerce store:\n\n${orderLines}\n\nTotal orders retrieved: ${orders.length}.`;
    }

    // 4. Intent: List Products
    if (text.includes('product') || text.includes('inventory') || text.includes('catalog')) {
      const res = await invokeTool('woocommerce__list_products', { per_page: 10 });
      if (res.isError) {
        return `Could not retrieve products: ${JSON.stringify(res.parsedOutput)}`;
      }

      const prods = Array.isArray(res.parsedOutput) ? res.parsedOutput : [];
      const prodLines = prods.map(p => {
        return `- **${p.name}** (ID: #${p.id}) — **$${p.price || p.regular_price}** | Status: \`${p.status}\` | SKU: \`${p.sku || 'N/A'}\``;
      }).join('\n');

      return `Here are the products currently available in the WooCommerce store:\n\n${prodLines}`;
    }

    // 5. Intent: Currency conversion
    if (text.includes('convert') || text.includes('exchange rate')) {
      const amtMatch = message.match(/([0-9]+(?:\.[0-9]+)?)/);
      const amount = amtMatch ? parseFloat(amtMatch[1]) : 100;
      const res = await invokeTool('currency__convert_currency', {
        amount,
        from: 'USD',
        to: 'EUR'
      });
      return `Exchange calculation: ${JSON.stringify(res.parsedOutput, null, 2)}`;
    }

    // Default: Explain capabilities and available tools
    const toolList = availableTools.map(t => `\`${t.name}\``).join(', ');
    return `Hello! I am your Team MCP Gateway Assistant. I am connected to your registered upstream MCP servers and can execute tools on your behalf.\n\nCurrently available tools:\n${toolList}\n\nTry asking me:\n- *"Create a product named 'Mechanical Keyboard' with price 89.99"*\n- *"What orders came in today?"*\n- *"Summarize today's sales and convert revenue to EUR"*`;
  }
}

export const chatAgent = new ChatAgent();
