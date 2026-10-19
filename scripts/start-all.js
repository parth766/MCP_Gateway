/**
 * Unified Live Platform Runner
 * Starts all MCP microservices, Gateway backend, and React Dashboard frontend.
 */

import { spawn } from 'child_process';
import path from 'path';

const services = [
  { name: 'woocommerce-mcp', dir: 'services/woocommerce-mcp', port: 4001, cmd: 'node', args: ['src/index.js'] },
  { name: 'currency-mcp', dir: 'services/currency-mcp', port: 4002, cmd: 'node', args: ['src/index.js'] },
  { name: 'analytics-mcp', dir: 'services/analytics-mcp', port: 4003, cmd: 'node', args: ['src/index.js'] },
  { name: 'gateway-backend', dir: 'services/gateway', port: 3000, cmd: 'node', args: ['src/index.js'] },
  { name: 'dashboard-ui', dir: 'services/dashboard', port: 5173, cmd: 'npm.cmd', args: ['run', 'dev', '--', '--host', '0.0.0.0'] }
];

console.log('===========================================================');
console.log('🚀 Starting Urumi Team MCP Gateway & Live React Dashboard...');
console.log('===========================================================\n');

const procs = [];

for (const svc of services) {
  const env = {
    ...process.env,
    PORT: String(svc.port),
    NODE_ENV: 'development',
    WOOCOMMERCE_MCP_URL: 'http://localhost:4001/sse',
    CURRENCY_MCP_URL: 'http://localhost:4002/sse',
    ANALYTICS_MCP_URL: 'http://localhost:4003/sse',
    ALLOW_LOOPBACK_UPSTREAMS: 'true'
  };

  const child = spawn(svc.cmd, svc.args, {
    cwd: path.resolve(svc.dir),
    env,
    shell: true,
    stdio: 'pipe'
  });

  child.stdout.on('data', (d) => {
    const text = d.toString().trim();
    if (text) console.log(`[${svc.name}] ${text}`);
  });

  child.stderr.on('data', (d) => {
    const text = d.toString().trim();
    if (text) console.error(`[${svc.name}] ${text}`);
  });

  child.on('error', (err) => {
    console.error(`[${svc.name} ERROR]`, err.message);
  });

  procs.push(child);
}

function cleanup() {
  console.log('\nShutting down all services...');
  for (const p of procs) {
    try { p.kill(); } catch (e) {}
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

console.log('\n===========================================================');
console.log('✨ All services are running!');
console.log('👉 Open your browser at: http://localhost:5173');
console.log('===========================================================\n');
