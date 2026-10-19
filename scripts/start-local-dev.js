/**
 * Local Development Runner
 * Starts all MCP services locally without needing Docker or Kubernetes.
 */

import { spawn } from 'child_process';
import path from 'path';

const services = [
  { name: 'woocommerce-mcp', dir: 'services/woocommerce-mcp', port: 4001 },
  { name: 'currency-mcp', dir: 'services/currency-mcp', port: 4002 },
  { name: 'analytics-mcp', dir: 'services/analytics-mcp', port: 4003 },
  { name: 'gateway', dir: 'services/gateway', port: 3000 },
];

console.log('🚀 Starting local MCP Gateway development stack...\n');

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

  const child = spawn('node', ['src/index.js'], {
    cwd: path.resolve(svc.dir),
    env,
    stdio: 'pipe'
  });

  child.stdout.on('data', (d) => {
    process.stdout.write(`[${svc.name}] ${d}`);
  });

  child.stderr.on('data', (d) => {
    process.stderr.write(`[${svc.name} ERR] ${d}`);
  });

  child.on('exit', (code) => {
    console.log(`[${svc.name}] Exited with code ${code}`);
  });

  procs.push(child);
}

process.on('SIGINT', () => {
  console.log('\nShutting down services...');
  for (const p of procs) p.kill();
  process.exit(0);
});

console.log('\nAll background MCP servers initiated. Gateway backend accessible at http://localhost:3000');
console.log('To run tests: node tests/e2e-definition-of-done.test.js\n');
