# System Design and Tradeoffs Note

This document details the architectural decisions, tool aggregation pipeline, fault isolation strategy, and production considerations for the **Urumi Team MCP Gateway on Kubernetes**.

---

## 1. High-Level Architecture

The system is structured into four distinct, loosely coupled layers running inside a Kubernetes cluster:

```mermaid
flowchart TD
    subgraph ClientLayer["External & Internal Clients"]
        ClientA["Admin (User A)\nReact Dashboard / Chat"]
        ClientB["Member (User B)\nClaude Code / Cursor / Inspector"]
    end

    subgraph IngressLayer["Ingress & Edge Routing"]
        Ingress["Kubernetes Ingress (Nginx / Traefik)\nSSL Termination & Path Routing"]
    end

    subgraph GatewayCluster["Team MCP Gateway Layer (Port 3000)"]
        Dashboard["React Dashboard (Nginx)\nStatic SPA"]
        Gateway["Gateway Backend\n- Aggregator & Router\n- Auth & Hashed Keys\n- SSRF Guard\n- AES-256 Vault\n- Audit Logger"]
        ChatAgent["Chat Agent Engine\n- Context Attribution\n- Multi-tool Orchestrator"]
    end

    subgraph InternalMCP["Internal Upstream MCP Servers (ClusterIP)"]
        WcMcp["WooCommerce MCP Server\n(Port 4001, Streamable HTTP)"]
        CurrMcp["Currency MCP Server\n(Port 4002, Bearer Auth)"]
        AnalMcp["Analytics MCP Server\n(Port 4003, Header Auth)"]
    end

    subgraph StoreLayer["WooCommerce Store Layer"]
        WP["WordPress + WooCommerce\n(Apache / PHP 8.2)"]
        DB["MariaDB 11.4 Database\n(PersistentVolumeClaim)"]
    end

    ClientA -->|HTTP / Web| Ingress
    ClientB -->|Streamable HTTP / SSE| Ingress

    Ingress -->|/| Dashboard
    Ingress -->|/api and /mcp| Gateway
    Ingress -->|/store| WP

    Dashboard --> Gateway
    Gateway --> ChatAgent
    Gateway -->|Internal RPC| WcMcp
    Gateway -->|Internal RPC| CurrMcp
    Gateway -->|Internal RPC| AnalMcp

    WcMcp -->|REST API v3 (ck/cs)| WP
    WP -->|TCP 3306| DB
```

---

## 2. Core Architecture Choices

### 2.1 WooCommerce Integration: REST API vs. WP-CLI
The WooCommerce MCP server interacts with WooCommerce via the **official WooCommerce REST API v3** rather than WP-CLI.
- **Network Isolation & Security Boundaries**: WP-CLI requires direct shell execution or mounting shared persistent volumes inside the WordPress pod. This violates container isolation principles and creates massive privilege escalation attack surfaces. REST API communicates over standard HTTP using dedicated, revocable consumer keys (`ck_...` and `cs_...`).
- **Statelessness & Horizontal Scalability**: The MCP server and WordPress can run as independent pods in separate namespaces, scaling according to their respective traffic patterns without coupling filesystem state.
- **Atomic Operations & HTTP Semantics**: REST endpoints provide native HTTP status codes, structured error payloads, and atomic updates.

### 2.2 Protocol Choice: Streamable HTTP (SSE & Direct JSON-RPC)
The MCP specification supports stdio and Streamable HTTP (SSE). For a shared team gateway on Kubernetes:
- **Streamable HTTP** is mandatory because clients (Claude Code, Cursor, MCP Inspector, and the web chat agent) connect over the network.
- The gateway exposes:
  - `GET /mcp/sse`: Establishes an SSE stream, returning an `endpoint` event with a unique session ID.
  - `POST /mcp/messages?sessionId=...`: Receives client JSON-RPC messages and pipes responses over the SSE channel.
  - `POST /mcp`: Direct Streamable HTTP JSON-RPC POST endpoint for single-turn calls or standard HTTP clients.

---

## 3. Tool Aggregation, Collision Handling, and Fault Isolation

### 3.1 Dynamic Aggregation
When a client requests `tools/list`:
1. The gateway queries all **enabled** upstream servers concurrently (`Promise.all`).
2. Tools are dynamically collected and cached in memory.
3. If an upstream server is disabled or deleted in the admin dashboard, its tools are instantly purged from the aggregated registry without requiring gateway restarts.

### 3.2 Tool Name Collision Resolution
When multiple upstream servers expose tools with identical names (e.g. `ping`, `get_status`, or store tools):
- **Canonical Namespacing**: Every tool is exposed using its fully qualified namespaced identifier:
  $$\text{Target Tool Name} = \text{serverId}\_\_\text{originalToolName}$$
  *(Examples: `woocommerce__list_orders`, `currency__convert_currency`, `analytics__calculate_sales_summary`)*.
- **Collision-Free Aliasing**: If a tool name is completely unique across all enabled servers (count = 1), the gateway also registers the unprefixed alias (`list_orders`) for ergonomic compatibility with third-party LLMs. If another server is registered with the same name, the alias is automatically disabled, requiring the explicit namespaced identifier.

### 3.3 Fault Isolation and Resilient Timeouts
In a microservices architecture, upstream servers can fail, hang, or experience network partitions:
- **Strict Timeouts**: Every upstream call is wrapped in an `AbortController` timeout (default 5000ms).
- **Dead Upstream Isolation**:
  - If server X times out or throws `ECONNREFUSED` during `tools/list`, the gateway flags server X as `Unreachable`, updates its status in the database, and **returns the tools of the remaining healthy servers**. The failure of one server never brings down the gateway or impacts other tools.
  - If a client explicitly invokes a tool on a dead or disabled server, the gateway catches the error, logs the failure in the audit log, and returns an informative MCP error payload (`isError: true`), preventing client connection crashes.

---

## 4. Local vs. Production VPS Deployment Differences

The same Helm chart deploys both environments, toggled purely via Helm values (`values-local.yaml` vs. `values-prod.yaml`):

| Aspect | Local Development (`values-local.yaml`) | Production VPS (`values-prod.yaml`) |
| :--- | :--- | :--- |
| **Cluster Engine** | Kind, k3d, Minikube, or Docker Desktop k8s | k3s (single-node VPS) or Managed K8s (EKS/GKE) |
| **Ingress Controller** | `ingress-nginx` or NodePort | `traefik` (standard in k3s) or `ingress-nginx` |
| **Domain Strategy** | `local.mcp-gateway.nip.io` or `localhost` | Production FQDN (`gateway.example.com`) |
| **TLS / SSL** | Disabled (plain HTTP for fast local loop) | Automated TLS via `cert-manager` and Let's Encrypt |
| **StorageClass** | `standard` or `local-path` (hostPath) | `local-path` on k3s or cloud persistent block (gp3/longhorn) |
| **Gateway Replicas** | 1 replica | 2+ replicas behind a Service load balancer |
| **Resource Limits** | Low requests (25m CPU, 64Mi RAM) | Higher burstable limits (500m-1000m CPU, 512Mi-1Gi RAM) |
| **Secrets Management**| Base64 Kubernetes Secrets | SealedSecrets, HashiCorp Vault, or AWS Secrets Manager |

---

## 5. Security Posture and Hardening

1. **Non-Root Execution**: All containers (`woocommerce-mcp`, `currency-mcp`, `analytics-mcp`, `gateway-backend`) enforce `securityContext: runAsNonRoot: true` with non-privileged user `node (UID 1000)`.
2. **Cluster-Internal Isolation**: All upstream MCP servers and MariaDB bind to `ClusterIP` Services. They have no Ingress paths and are unreachable from outside the cluster.
3. **NetworkPolicies**: Kubernetes NetworkPolicies enforce least-privilege traffic flow:
   - `woocommerce-mcp` only accepts TCP ingress on port 4001 from `gateway-backend`.
   - `mariadb` only accepts TCP ingress on port 3306 from `wordpress`.
4. **SSRF Guard**: When an admin registers an upstream MCP URL, the gateway validates that the hostname is not a cloud metadata address (`169.254.169.254`, `metadata.google.internal`) or an unauthorized internal subnet.
5. **AES-256-GCM Vault**: Upstream bearer tokens and credentials are encrypted at rest with a master encryption key injected from a Kubernetes Secret. Upstream credentials are never returned to clients or frontend responses.
