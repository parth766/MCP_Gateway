# Live Demo Walkthrough Script & Interview Guide

This guide provides the exact script, commands, and talking points needed to record the required **Demo Video** and ace the **Round 2 & Round 3 Interviews**.

---

## 🎬 Demo Video Checklist & Timing (Total: ~8–10 minutes)

| Section | Topic | Key Point to Show |
| :--- | :--- | :--- |
| **0:00 - 1:30** | System Overview & Architecture | Explain the 4 layers, why Streamable HTTP was used, and why REST API was chosen over WP-CLI |
| **1:30 - 3:00** | Kubernetes Resources & Network Isolation | Show Helm chart, namespaces, ClusterIP vs Ingress, non-root securityContext, and NetworkPolicies |
| **3:00 - 4:30** | Storefront & Chat Agent (User A) | Create product via Chat Agent, show product in store, place COD order, ask agent for today's orders |
| **4:30 - 6:30** | External MCP Client (User B) | Connect MCP Inspector / Claude Code using User B's key, list tools, run multi-server prompt |
| **6:30 - 8:30** | Team Control, Faults & Audit Log | Revoke User B's key (show 401), disable upstream, simulate dead pod, show audit log attribution |
| **8:30 - 10:00**| Local-to-VPS Production Story | Walk through `values-local.yaml` vs `values-prod.yaml`, storage classes, cert-manager TLS |

---

## 🚀 Step-by-Step Live Walkthrough

### Part 1: Architecture & Kubernetes Setup
**What to say:**
> *"Hello! Today I'm demonstrating the Urumi Team MCP Gateway on Kubernetes. The platform connects a stateful WooCommerce store to modern AI tooling, enabling team members to interact with internal tools through a single, secure MCP endpoint."*

**What to show:**
1. Show the repository structure in your IDE:
   - `charts/mcp-gateway/` (Helm chart, `values-local.yaml`, `values-prod.yaml`)
   - `services/woocommerce-mcp/` (Custom Streamable HTTP MCP server)
   - `services/gateway/` (Gateway backend, aggregator, auth, audit log)
   - `services/dashboard/` (React SPA)
   - `services/currency-mcp/` and `services/analytics-mcp/` (Additional upstream MCP servers)
2. Run `kubectl get pods,svc,pvc,ingress -n default` (or `docker compose ps` / local runner) to show all services running.

---

### Part 2: Storefront & Chat Agent Flow (User A - Admin)
**Objective**: Show product creation through agent and order retrieval.

1. **Open Dashboard**: Navigate to `http://localhost:5173` (or Ingress URL).
2. **Confirm User A Context**: In the top navbar, ensure `userA_admin (ADMIN)` is selected.
3. **Show Registered Servers**:
   - Go to the **Servers** tab.
   - Point out `WooCommerce Store MCP` is registered as Server #1.
   - Show `Currency & Pricing MCP` and `Store Analytics MCP` connected as servers #2 and #3.
   - Click "Tools" on WooCommerce to show the 5 custom tools: `list_products`, `create_product`, `list_orders`, `get_order`, `update_order_status`.
4. **Chat Agent - Create Product**:
   - Navigate to the **Chat Agent** tab.
   - Send: `"Create a product named 'Ergonomic Split Mechanical Keyboard' with price 129.99"`.
   - Show the collapsible pill: `⚡ woocommerce__create_product` was executed, with duration and response.
5. **Verify Product on Storefront**:
   - Click the **WooCommerce Store** button in the navbar (or visit `/store`).
   - Show the newly created keyboard visible on the storefront.
6. **Place an Order**:
   - Add the product to cart, proceed to checkout, select **Cash on Delivery (COD)**, and place the order.
7. **Ask Agent for Orders**:
   - Return to the Chat Agent tab.
   - Send: `"What orders came in today?"`.
   - Show the agent invoking `woocommerce__list_orders` and returning the order!

---

### Part 3: External MCP Client Flow (User B - Member)
**Objective**: Show connection via Gateway URL + User B's API key, tool aggregation, and multi-server prompt.

1. **Show User B Credentials**:
   - Switch user to `userB_member` or go to **Team & Keys** tab.
   - Copy User B's API key (`urumi_member_key_67890`).
2. **Connect via External Client / Inspector**:
   - Open the **External MCP** tab in the dashboard (or launch Claude Code / MCP Inspector).
   - Enter User B's key into the client header: `Authorization: Bearer urumi_member_key_67890`.
   - Method: `tools/list` -> Click **Send Request**.
   - Show that User B receives aggregated tools from all enabled servers, while restricted admin tools are filtered out according to RBAC!
3. **Query Orders as User B**:
   - Method: `tools/call`, Tool: `woocommerce__list_orders`, Args: `{"per_page": 5}`.
   - Click **Send Request** -> Show successful JSON-RPC result.
4. **Run Multi-Server Prompt**:
   - In the Chat Agent or External Client, run a prompt requiring tools from two different upstream servers:
     `"Summarize today's sales and convert total revenue to EUR"`.
   - Point out that the gateway coordinates:
     - `woocommerce__list_orders` (Store)
     - `analytics__calculate_sales_summary` (Upstream 2)
     - `currency__convert_currency` (Upstream 3)

---

### Part 4: Team and Control
**Objective**: Demonstrate security controls, key revocation, and fault tolerance.

1. **Revoke User B's Key**:
   - Switch back to `userA_admin` and open the **Team & Keys** tab.
   - Locate `userB_member`'s key and click **Revoke**.
   - Now return to the **External MCP** inspector tab and attempt any request with User B's key.
   - **Result**: Request is immediately rejected with `HTTP 401 Unauthorized` / Key Revoked!
2. **Disable an Upstream Server**:
   - Go to the **Servers** tab.
   - Click the power button to disable `Currency & Pricing MCP`.
   - Refresh the tool list in the External Client / Inspector.
   - **Result**: Currency tools immediately vanish from the tool registry.
3. **Simulate Dead Upstream / Pod Kill**:
   - In the Servers tab, register a dead server (`http://127.0.0.1:59999/sse`) or kill an upstream pod (`kubectl delete pod ...`).
   - Run a tool call to WooCommerce or Analytics.
   - **Result**: Healthy servers continue working without delay; the dead server is marked `Unreachable` in the dashboard with clear latency and error metrics.
4. **Show Audit Log**:
   - Open the **Audit Log** tab.
   - Show all recent tool invocations:
     - Clear distinction between `userA_admin` and `userB_member`.
     - Timestamp, duration (ms), outcome (`Success` vs `Error`).
     - Click **View Payload** on an event to inspect the exact input arguments and JSON output.

---

### Part 5: Local to Production Story
**What to say:**
> *"For production deployment on a VPS running k3s, we reuse the exact same Helm charts, modifying only `values-prod.yaml`. We configure production FQDNs with automated Let's Encrypt certificates managed by cert-manager, assign high-performance persistent storage classes, scale the gateway backend to multiple replicas, and enforce zero-trust NetworkPolicies that deny all unauthorized pod-to-pod ingress."*

---

## 💡 Top Interview Questions & Defenses

### Q1: Why did you build the WooCommerce MCP server using the REST API rather than WP-CLI?
**Answer**:
*"WP-CLI requires shell execution inside the WordPress container or shared filesystem volume mounting, which violates Kubernetes isolation boundaries and creates massive security risks. The WooCommerce REST API is the official HTTP standard, supports scoped consumer keys for least-privilege RBAC, and allows the MCP server to run as an independent, stateless microservice that scales on its own."*

### Q2: How does the Gateway handle tool name collisions when multiple upstreams share tool names?
**Answer**:
*"We employ a dual-scheme approach. Every tool is registered under a canonical namespaced identifier `${serverId}__${toolName}` (e.g. `woocommerce__list_orders`). If a tool name is completely unique across all active servers, we also expose the short alias for ergonomic client use. If a collision is detected, the alias is disabled, requiring explicit namespaced calls."*

### Q3: What happens if an admin registers a malicious MCP server URL?
**Answer**:
*"We built an active SSRF (Server-Side Request Forgery) guard. The gateway inspects the URL scheme and hostname, strictly blocking cloud instance metadata endpoints like `169.254.169.254`, `metadata.google.internal`, and unauthorized private IP ranges before any connection is initiated."*

### Q4: Why are client API keys not forwarded to upstream servers?
**Answer**:
*"Forwarding client tokens to third-party upstreams would leak user credentials and break upstream auth schemes. The Gateway acts as an authentication proxy: it verifies the user's identity, enforces RBAC, strips the client token, and injects the encrypted upstream credential stored in our AES-256 server vault."*
