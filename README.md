# Urumi AI Platform: Team MCP Gateway on Kubernetes

[![License: MIT](https://img.shields.io/badge/License-MIT-indigo.svg)](https://opensource.org/licenses/MIT)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Kind%20%7C%20k3d%20%7C%20k3s-326CE5?logo=kubernetes&logoColor=white)](https://kubernetes.io)
[![Helm](https://img.shields.io/badge/Helm-v3.0+-0F1689?logo=helm&logoColor=white)](https://helm.sh)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Streamable%20HTTP-black)](https://modelcontextprotocol.io)
[![Tests: 32 Passed](https://img.shields.io/badge/Tests-32%20Passed%20(100%25)-brightgreen.svg)](tests/e2e-definition-of-done.test.js)

A production-grade, stateful WooCommerce hosting platform with an integrated **Team Model Context Protocol (MCP) Gateway** deployed on Kubernetes. The platform connects a WooCommerce store and auxiliary internal tools to AI clients (Claude Code, Cursor, MCP Inspector, and a dashboard Chat Agent) through a unified, authenticated, fault-tolerant Streamable HTTP endpoint.

---

## 🏛️ System Architecture

The system consists of **four decoupled layers** running inside Kubernetes:

```
+-----------------------------------------------------------------------------------+
|                            External MCP Clients / Users                           |
|       User A (Admin) via Dashboard      |      User B (Member) via Claude / Cursor|
+-----------------------------------------+-----------------------------------------+
                                          │
                                          ▼ Ingress (/store, /api, /mcp, /)
+-----------------------------------------------------------------------------------+
|  Layer 3 & 4: Gateway & Dashboard (Port 3000 & 80)                                |
|  - MCP Aggregator & Streamable HTTP Server (/mcp, /mcp/sse)                      |
|  - Zero-Trust Vault (AES-256-GCM encrypted upstream credentials at rest)          |
|  - Hashed API Key Authenticator (SHA-256 with Salt)                               |
|  - Role-Based Access Control (RBAC: Admin vs Member)                             |
|  - Active SSRF Guard (blocks metadata IPs & unauthorized subnets)                |
|  - Tamper-Evident Audit Logger                                                    |
|  - Context-Attributed Chat Agent Engine                                           |
+-----------------------------------------------------------------------------------+
       │ (Internal ClusterIP RPC)                 │ (Internal ClusterIP RPC)
       ▼                                          ▼
+------------------------------------+  +-------------------------------------------+
| Layer 2: Custom WooCommerce MCP    |  | Additional Upstream MCP Servers:          |
| Server (Port 4001, Internal Only)  |  | - Currency & Pricing MCP (Port 4002)      |
| - list_products, create_product    |  | - Store Analytics & Inventory (Port 4003) |
| - list_orders, get_order           |  +-------------------------------------------+
| - update_order_status              |
+------------------------------------+
       │ (REST API v3 over Basic Auth)
       ▼
+-----------------------------------------------------------------------------------+
| Layer 1: WooCommerce Store (Port 80) & MariaDB 11.4 Database (Port 3306)          |
| - WordPress 6.7 + WooCommerce Storefront & Admin                                 |
| - Persistent Volume Claims (ReadWriteOnce) for DB & WP Content                    |
+-----------------------------------------------------------------------------------+
```

---

## 🌟 Stand-Out Features Implemented

1. **Production-like VPS Deployment Ready**: Unified Helm chart supporting local development (`values-local.yaml`) and VPS/k3s production (`values-prod.yaml`) with cert-manager TLS, production storage classes, and horizontal scaling.
2. **Role-Based Tool Permissions (RBAC)**: Fine-grained access control where members can read orders and convert currency, but mutating actions (`create_product`, `update_order_status`) are restricted to admins.
3. **Tool Name Collision Resolution**: Deterministic namespacing (`${serverId}__${toolName}`) with automatic collision detection and conflict-free aliasing.
4. **Resilient Fault Isolation & Timeouts**: If an upstream server hangs or crashes, it never blocks tool listing or other servers. All upstream calls are guarded by strict timeouts.
5. **Security Hardening & SSRF Protection**: Rejects cloud metadata addresses (`169.254.169.254`, `metadata.google.internal`), containers execute as non-privileged user `node (UID 1000)`, and Kubernetes NetworkPolicies restrict pod-to-pod ingress.
6. **Encrypted Credentials at Rest**: Upstream secrets are encrypted using AES-256-GCM. Upstream credentials never leak to clients or browser responses.
7. **Multi-Server Tool Coordination**: Chat agent and external clients can orchestrate multi-step queries combining WooCommerce, Store Analytics, and Currency exchange in a single prompt.
8. **Observability**: Prometheus metrics endpoint (`/metrics`), live health probes (`/healthz`, `/readyz`), and detailed audit logging with duration and status tracking.

---

## 🚀 Quick Start (Local & Kubernetes)

### Option A: 10-Second Local Development Run (Zero Kubernetes setup needed)
Run the full stack natively on your machine using the bundled runner:
```bash
# 1. Install dependencies across all microservices
npm run install:all

# 2. Launch all MCP servers and Gateway backend concurrently
npm run dev

# 3. In another terminal, run the automated E2E Definition of Done test suite
npm run test
```
*Access the React Dashboard at `http://localhost:5173` (via `npm run dev --prefix services/dashboard`) or `http://localhost:3000`.*

---

### Option B: Local Kubernetes Deployment (Kind, k3d, or Minikube)

#### 1. Create a local cluster
```bash
# Using Kind:
kind create cluster --name urumi-mcp

# Or using Minikube:
minikube start --cpus=4 --memory=6144
```

#### 2. Install Ingress Controller
```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

#### 3. Build & Load Container Images
```bash
# Build images
docker build -t urumi/woocommerce-mcp:latest ./services/woocommerce-mcp
docker build -t urumi/currency-mcp:latest ./services/currency-mcp
docker build -t urumi/analytics-mcp:latest ./services/analytics-mcp
docker build -t urumi/mcp-gateway-backend:latest ./services/gateway
docker build -t urumi/mcp-dashboard:latest ./services/dashboard

# Load into Kind
kind load docker-image urumi/woocommerce-mcp:latest --name urumi-mcp
kind load docker-image urumi/currency-mcp:latest --name urumi-mcp
kind load docker-image urumi/analytics-mcp:latest --name urumi-mcp
kind load docker-image urumi/mcp-gateway-backend:latest --name urumi-mcp
kind load docker-image urumi/mcp-dashboard:latest --name urumi-mcp
```

#### 4. Deploy with Helm using `values-local.yaml`
```bash
helm upgrade --install mcp-gateway ./charts/mcp-gateway -f ./charts/mcp-gateway/values-local.yaml
```

#### 5. Verify Running Workloads
```bash
kubectl get pods,svc,pvc,ingress
```

#### 6. Local Domain Configuration
The local chart uses wildcard DNS `local.mcp-gateway.nip.io` resolving directly to `127.0.0.1`:
- **Dashboard & Chat**: `http://local.mcp-gateway.nip.io/`
- **MCP Endpoint**: `http://local.mcp-gateway.nip.io/mcp`
- **WooCommerce Storefront**: `http://local.mcp-gateway.nip.io/store`

---

### Option C: Production VPS Deployment (k3s)

#### 1. Setup k3s on VPS
```bash
curl -sfL https://get.k3s.io | sh -
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
```

#### 2. Install cert-manager for automated TLS
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

#### 3. Deploy Helm Chart with `values-prod.yaml`
```bash
# Edit domain in charts/mcp-gateway/values-prod.yaml to your VPS FQDN
helm upgrade --install mcp-gateway ./charts/mcp-gateway \
  -f ./charts/mcp-gateway/values-prod.yaml \
  --set global.domain="mcp.yourdomain.com"
```

---

## 🧪 Definition of Done: Verification Guide

The automated test suite in `tests/e2e-definition-of-done.test.js` covers every requirement:

```bash
node tests/e2e-definition-of-done.test.js
```

### Manual Walkthrough

#### 1. Storefront Flow
1. Visit the store at `/store` (or `http://localhost:8080`).
2. Add any product to your cart and proceed to checkout.
3. Select **Cash on Delivery (COD)** and click "Place Order".
4. Confirm order appears in WooCommerce Admin at `/store/wp-admin`.

#### 2. Chat Agent Flow (as User A - Admin)
1. Open the Dashboard at `/` and ensure **userA_admin (Admin)** is selected.
2. In the **Chat Agent** tab, ask:
   > *"Create a product named 'Ergonomic Mechanical Keyboard' with price 129.99"*
3. The agent calls `woocommerce__create_product`, displays the execution badge, and confirms creation.
4. Place an order for this product on the storefront.
5. In the Chat Agent, ask:
   > *"What orders came in today?"*
6. The agent calls `woocommerce__list_orders` and returns your placed order.

#### 3. External MCP Client Flow (as User B - Member)
1. Go to the **Team & Keys** tab and copy User B's API key:
   `urumi_member_key_67890`.
2. Connect Claude Code, Cursor, or use the built-in **External MCP Inspector** tab:
   - Gateway URL: `http://localhost:3000/mcp`
   - Header: `Authorization: Bearer urumi_member_key_67890`
3. Request `tools/list`:
   - Inspect all tools exposed across all 3 enabled servers.
4. Execute multi-server prompt:
   - Tool 1: `woocommerce__list_orders`
   - Tool 2: `analytics__calculate_sales_summary`
   - Tool 3: `currency__convert_currency` (converts total to EUR).

#### 4. Team and Security Control
1. **Revoke User B's Key**: In the **Team & Keys** tab, click "Revoke" on User B's key. Their next MCP request is immediately rejected with `401 Unauthorized`.
2. **Disable Upstream Server**: In the **Servers** tab, disable the Currency MCP server. Its tools disappear from `tools/list` on both the chat agent and external clients.
3. **Dead Upstream Fault Isolation**: Kill the pod of an upstream server (`kubectl delete pod ...`) or point a test server to a closed port. The dashboard marks it `Unreachable`, but all other servers continue functioning seamlessly.
4. **Audit Log Verification**: Open the **Audit Log** tab. Verify that all calls from both User A and User B appear with their usernames, roles, execution duration, and outcomes.

---

## 🔌 Connecting Claude Desktop & Cursor IDE

Add this to your Claude Desktop configuration file (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "team-mcp-gateway": {
      "url": "http://local.mcp-gateway.nip.io/mcp/sse",
      "headers": {
        "Authorization": "Bearer urumi_member_key_67890"
      }
    }
  }
}
```

Or test directly via `curl`:
```bash
curl -X POST "http://localhost:3000/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer urumi_member_key_67890" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list"}'
```

---

## 📚 Technical Documentation

- **[System Design & Tradeoffs Note](docs/system-design.md)**: Deep dive into WooCommerce REST API vs WP-CLI, Streamable HTTP SSE routing, collision resolution, and production storage/ingress strategies.
- **[Threat Model Note](docs/threat-model.md)**: Analysis of shared upstream credentials, client token separation, tool poisoning / prompt injection mitigations, and cross-member multi-tenancy.
- **[Demo Walkthrough Script](docs/demo-script.md)**: Complete script, timing, and talking points for the live submission video and interview walkthrough.

---

## 📄 License
This repository is released under the MIT License.
