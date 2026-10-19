/**
 * All-in-One Automated Test Runner
 * Automatically resets seed state, starts all background MCP servers,
 * waits for them to be ready, runs the E2E Definition of Done test suite, and shuts down cleanly.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Reset database file to ensure pristine initial test state
const dbFile = path.resolve('services/gateway/data/gateway_data.json');
try {
  if (fs.existsSync(dbFile)) {
    fs.unlinkSync(dbFile);
  }
} catch (e) {
  // Ignore
}

const services = [
  { name: 'woocommerce-mcp', dir: 'services/woocommerce-mcp', port: 4001 },
  { name: 'currency-mcp', dir: 'services/currency-mcp', port: 4002 },
  { name: 'analytics-mcp', dir: 'services/analytics-mcp', port: 4003 },
  { name: 'gateway', dir: 'services/gateway', port: 3000 },
];

console.log('⚡ Starting background MCP services for automated testing...\n');

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
    stdio: 'ignore'
  });

  procs.push(child);
}

function cleanup() {
  for (const p of procs) {
    try { p.kill(); } catch (e) {}
  }
}

process.on('SIGINT', cleanup);
process.on('exit', cleanup);

// Poll gateway until ready
async function waitForGateway(maxAttempts = 30) {
  process.stdout.write('Waiting for Gateway on http://localhost:3000');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch('http://localhost:3000/healthz');
      if (res.ok) {
        console.log(' -> Ready!\n');
        return true;
      }
    } catch (e) {}
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('Gateway backend failed to start within timeout.');
}

async function main() {
  try {
    await waitForGateway();

    // Run E2E test script
    const testProc = spawn('node', ['tests/e2e-definition-of-done.test.js'], {
      stdio: 'inherit'
    });

    testProc.on('exit', (code) => {
      cleanup();
      process.exit(code || 0);
    });
  } catch (err) {
    console.error('\nError running tests:', err.message);
    cleanup();
    process.exit(1);
  }
}

main();
