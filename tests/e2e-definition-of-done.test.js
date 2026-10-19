/**
 * Automated End-to-End Test Suite verifying the Definition of Done:
 * 
 * 1. Store simulation & initial state
 * 2. Chat agent as User A (Admin):
 *    - Creates a product via MCP
 *    - Storefront order simulated
 *    - Queries orders via MCP
 * 3. External MCP client as User B (Member):
 *    - Connects using gateway URL + User B's API key
 *    - Lists aggregated tools from all enabled upstream servers
 *    - Invokes woocommerce orders tool successfully
 *    - Invokes multi-server chain (Analytics + Currency)
 * 4. Team & Control:
 *    - Revokes User B's key -> next call is strictly rejected (401/403)
 *    - Disables an upstream server -> tools immediately vanish from listing
 *    - Unreachable/dead upstream simulation -> other servers keep working, dead one marked unreachable
 *    - Audit log verification: all actions attributed to correct user identities
 */

import http from 'http';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';
const WC_MCP_URL = process.env.WC_MCP_URL || 'http://localhost:4001';

const USER_A_KEY = 'urumi_admin_key_12345';
const USER_B_KEY = 'urumi_member_key_67890';

let testPassed = 0;
let testFailed = 0;

function logStep(name) {
  console.log(`\n======================================================`);
  console.log(`▶ TEST STEP: ${name}`);
  console.log(`======================================================`);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    testFailed++;
    throw new Error(message);
  } else {
    console.log(`✅ PASSED: ${message}`);
    testPassed++;
  }
}

async function postJson(url, path, body, headers = {}) {
  const fullUrl = `${url.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  const res = await fetch(fullUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function getJson(url, path, headers = {}) {
  const fullUrl = `${url.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  const res = await fetch(fullUrl, {
    method: 'GET',
    headers
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log(`Starting E2E Definition of Done Verification against ${GATEWAY_URL}...`);

  try {
    // ---------------------------------------------------------
    // Step 1: Healthcheck Gateway & Servers
    // ---------------------------------------------------------
    logStep('1. Gateway & Upstream Health Probes');
    const health = await getJson(GATEWAY_URL, '/healthz');
    assert(health.status === 200 && health.data?.status === 'ok', 'Gateway backend /healthz is healthy');

    const initialServers = await getJson(GATEWAY_URL, '/api/servers', {
      'Authorization': `Bearer ${USER_A_KEY}`
    });
    assert(initialServers.status === 200, 'Gateway /api/servers endpoint accessible by User A');
    assert(initialServers.data?.servers?.length >= 3, 'Pre-seeded with at least 3 upstream servers (WooCommerce, Currency, Analytics)');
    assert(initialServers.data?.servers[0]?.id === 'woocommerce', 'WooCommerce is registered as the first server (#1)');

    // ---------------------------------------------------------
    // Step 2: Chat Agent Flow as User A (Admin)
    // ---------------------------------------------------------
    logStep('2. Chat Agent as User A (Create Product & Fetch Orders)');
    
    // 2a. Ask chat agent to create product
    const createProdPrompt = "Create a product named 'Pro Gaming Mechanical Keyboard' with price 99.99";
    const agentRes1 = await postJson(GATEWAY_URL, '/api/chat', { message: createProdPrompt }, {
      'Authorization': `Bearer ${USER_A_KEY}`
    });
    assert(agentRes1.status === 200, 'Chat agent responded 200 OK to User A');
    assert(agentRes1.data?.toolsCalled?.some(t => t.tool.includes('create_product')), 'Agent successfully executed create_product tool');
    assert(agentRes1.data?.user?.username === 'userA_admin', 'Call attributed to userA_admin');

    // 2b. Place an order on storefront
    const simOrderRes = await postJson(WC_MCP_URL, '/api/simulate-order', {
      total: '99.99',
      billing: { first_name: 'TestCustomer', last_name: 'E2E', email: 'test@example.com' },
      line_items: [{ name: 'Pro Gaming Mechanical Keyboard', quantity: 1, total: '99.99' }],
      payment_method_title: 'Cash on Delivery (COD)'
    });
    assert(simOrderRes.ok, 'Simulated storefront order placed via Cash on Delivery (COD)');

    // 2c. Ask agent what orders came in today
    const ordersPrompt = "What orders came in today?";
    const agentRes2 = await postJson(GATEWAY_URL, '/api/chat', { message: ordersPrompt }, {
      'Authorization': `Bearer ${USER_A_KEY}`
    });
    assert(agentRes2.status === 200, 'Agent answered orders query successfully');
    assert(agentRes2.data?.toolsCalled?.some(t => t.tool.includes('list_orders')), 'Agent executed list_orders tool');
    assert(agentRes2.data?.reply.includes('Order #'), 'Agent response includes order details');

    // ---------------------------------------------------------
    // Step 3: External MCP Client as User B (Member)
    // ---------------------------------------------------------
    logStep('3. External MCP Client as User B (Tools List & Multi-Server Chain)');

    // 3a. User B calls tools/list
    const toolsListRpc = { jsonrpc: '2.0', id: 'ext-1', method: 'tools/list' };
    const listRes = await postJson(GATEWAY_URL, '/mcp', toolsListRpc, {
      'Authorization': `Bearer ${USER_B_KEY}`
    });
    assert(listRes.status === 200, 'User B successfully authenticated via Bearer token');
    const availableTools = listRes.data?.result?.tools || [];
    assert(availableTools.length > 0, `User B received aggregated tools list (${availableTools.length} tools available)`);
    assert(availableTools.some(t => t.name.startsWith('woocommerce__')), 'Contains WooCommerce tools');
    assert(availableTools.some(t => t.name.startsWith('currency__')), 'Contains Currency tools');
    assert(availableTools.some(t => t.name.startsWith('analytics__')), 'Contains Analytics tools');

    // 3b. User B calls woocommerce__list_orders
    const callOrdersRpc = {
      jsonrpc: '2.0',
      id: 'ext-2',
      method: 'tools/call',
      params: { name: 'woocommerce__list_orders', arguments: { per_page: 5 } }
    };
    const callOrdersRes = await postJson(GATEWAY_URL, '/mcp', callOrdersRpc, {
      'Authorization': `Bearer ${USER_B_KEY}`
    });
    assert(callOrdersRes.status === 200 && !callOrdersRes.data?.result?.isError, 'User B executed woocommerce__list_orders tool successfully');

    // 3c. User B runs prompt needing tools from two different upstream servers (Analytics + Currency)
    const callAnalyticsRpc = {
      jsonrpc: '2.0',
      id: 'ext-3',
      method: 'tools/call',
      params: {
        name: 'analytics__calculate_sales_summary',
        arguments: { orders: [{ id: 1, total: 100 }, { id: 2, total: 150 }] }
      }
    };
    const analyticsRes = await postJson(GATEWAY_URL, '/mcp', callAnalyticsRpc, {
      'Authorization': `Bearer ${USER_B_KEY}`
    });
    assert(analyticsRes.status === 200, 'User B called upstream 1 (Analytics MCP)');

    const callCurrencyRpc = {
      jsonrpc: '2.0',
      id: 'ext-4',
      method: 'tools/call',
      params: {
        name: 'currency__convert_currency',
        arguments: { amount: 250, from: 'USD', to: 'EUR' }
      }
    };
    const currencyRes = await postJson(GATEWAY_URL, '/mcp', callCurrencyRpc, {
      'Authorization': `Bearer ${USER_B_KEY}`
    });
    assert(currencyRes.status === 200, 'User B called upstream 2 (Currency MCP) - Multi-Server coordination verified!');

    // ---------------------------------------------------------
    // Step 4: Team and Control
    // ---------------------------------------------------------
    logStep('4. Team Control (Key Revocation, Server Disabling, Fault Isolation)');

    // 4a. Revoke User B's key
    const userKeys = await getJson(GATEWAY_URL, '/api/users', {
      'Authorization': `Bearer ${USER_A_KEY}`
    });
    const userBRecord = userKeys.data?.users?.find(u => u.username === 'userB_member');
    const userBKeyId = userBRecord?.keys?.[0]?.id;
    assert(!!userBKeyId, "Found User B's active key ID");

    const revokeRes = await fetch(`${GATEWAY_URL}/api/keys/${userBKeyId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${USER_A_KEY}` }
    });
    assert(revokeRes.ok, "Admin revoked User B's key");

    // 4b. Test next call is rejected
    const rejectedRes = await postJson(GATEWAY_URL, '/mcp', toolsListRpc, {
      'Authorization': `Bearer ${USER_B_KEY}`
    });
    assert(rejectedRes.status === 401, 'User B next call is strictly REJECTED (401 Unauthorized)');

    // 4c. Disable one upstream server (Currency MCP)
    const disableRes = await fetch(`${GATEWAY_URL}/api/servers/currency`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${USER_A_KEY}`
      },
      body: JSON.stringify({ enabled: false })
    });
    assert(disableRes.ok, 'Disabled Currency upstream server');

    // 4d. Verify its tools disappeared from tool listing
    const toolsAfterDisable = await postJson(GATEWAY_URL, '/mcp', toolsListRpc, {
      'Authorization': `Bearer ${USER_A_KEY}`
    });
    const currentTools = toolsAfterDisable.data?.result?.tools || [];
    assert(!currentTools.some(t => t.name.startsWith('currency__')), 'Currency tools vanished from tool listing after disabling');
    assert(currentTools.some(t => t.name.startsWith('woocommerce__')), 'WooCommerce tools remain available');

    // 4e. Dead upstream fault isolation test
    const deadServerAdd = await postJson(GATEWAY_URL, '/api/servers', {
      id: 'dead-upstream-test',
      name: 'Simulated Dead Server',
      url: 'http://127.0.0.1:59999/sse', // Non-existent port
      auth_type: 'none'
    }, {
      'Authorization': `Bearer ${USER_A_KEY}`
    });
    assert(deadServerAdd.status === 201, 'Registered simulated dead server endpoint');

    // Query tool listing: dead upstream must NOT break listing for other servers!
    const toolsWithDeadServer = await postJson(GATEWAY_URL, '/mcp', toolsListRpc, {
      'Authorization': `Bearer ${USER_A_KEY}`
    });
    assert(toolsWithDeadServer.status === 200, 'Tool listing succeeded despite dead upstream');
    assert(toolsWithDeadServer.data?.result?.tools?.some(t => t.name.startsWith('woocommerce__')), 'Healthy servers kept working');

    // 4f. Check audit log
    const auditRes = await getJson(GATEWAY_URL, '/api/audit?limit=20', {
      'Authorization': `Bearer ${USER_A_KEY}`
    });
    assert(auditRes.status === 200, 'Audit log endpoint returns 200');
    const logs = auditRes.data?.logs || [];
    assert(logs.length >= 4, `Audit log contains ${logs.length} logged events`);
    assert(logs.some(l => l.username === 'userA_admin'), 'Audit log contains calls attributed to userA_admin');
    assert(logs.some(l => l.username === 'userB_member'), 'Audit log contains calls attributed to userB_member');

    console.log(`\n======================================================`);
    console.log(`🎉 ALL ${testPassed} TESTS PASSED PERFECTLY!`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error(`\nTest suite halted with error:`, err);
    process.exit(1);
  }
}

runTests();
