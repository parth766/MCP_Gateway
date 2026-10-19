import React, { useState } from 'react';
import { Terminal, Key, Play, Copy, Check, ShieldAlert, Cpu, Sparkles, BookOpen } from 'lucide-react';

export default function InspectorView({ currentUser }) {
  const [apiKeyInput, setApiKeyInput] = useState('urumi_member_key_67890');
  const [method, setMethod] = useState('tools/list');
  const [selectedTool, setSelectedTool] = useState('woocommerce__list_orders');
  const [toolArgs, setToolArgs] = useState('{\n  "per_page": 5\n}');
  const [loading, setLoading] = useState(false);
  const [responseOutput, setResponseOutput] = useState(null);
  const [activeTab, setActiveTab] = useState('inspector');
  const [copiedSnippet, setCopiedSnippet] = useState(null);

  const gatewayUrl = `${window.location.protocol}//${window.location.host}/mcp`;
  const sseUrl = `${window.location.protocol}//${window.location.host}/mcp/sse`;

  const handleExecute = async () => {
    setLoading(true);
    setResponseOutput(null);

    const payload = {
      jsonrpc: '2.0',
      id: `inspect-${Date.now()}`,
      method,
      params: method === 'tools/call' ? {
        name: selectedTool,
        arguments: JSON.parse(toolArgs || '{}')
      } : {}
    };

    try {
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeyInput.trim()}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      setResponseOutput({
        status: res.status,
        ok: res.ok,
        data
      });
    } catch (err) {
      setResponseOutput({
        status: 500,
        ok: false,
        error: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(id);
    setTimeout(() => setCopiedSnippet(null), 2000);
  };

  const claudeConfig = JSON.stringify({
    mcpServers: {
      "team-mcp-gateway": {
        "url": sseUrl,
        "headers": {
          "Authorization": `Bearer ${apiKeyInput}`
        }
      }
    }
  }, null, 2);

  const curlListCommand = `curl -X POST "${gatewayUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKeyInput}" \\
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list"}'`;

  const curlCallCommand = `curl -X POST "${gatewayUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKeyInput}" \\
  -d '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"woocommerce__list_orders","arguments":{"per_page":5}}}'`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">External MCP Client & Inspector</h1>
          <p className="text-sm text-slate-400 mt-1">
            Connect Claude Code, Cursor, MCP Inspector, or any standard Streamable HTTP MCP client to the gateway.
          </p>
        </div>

        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('inspector')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'inspector' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Live Inspector
          </button>
          <button
            onClick={() => setActiveTab('claude')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeTab === 'claude' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Claude / Cursor Config
          </button>
        </div>
      </div>

      {activeTab === 'inspector' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Request Configurator */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center">
              <Terminal className="h-4 w-4 text-indigo-400 mr-2" />
              Client Simulator
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Gateway Endpoint</label>
              <input
                type="text"
                readOnly
                value={gatewayUrl}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-slate-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                <span>Client API Key (Bearer Header)</span>
                <span className="text-[10px] text-slate-500 font-normal">e.g. User B's key</span>
              </label>
              <input
                type="text"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="urumi_member_key_..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">MCP Method</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="tools/list">tools/list (List all tools)</option>
                  <option value="tools/call">tools/call (Call specific tool)</option>
                  <option value="initialize">initialize</option>
                  <option value="ping">ping</option>
                </select>
              </div>

              {method === 'tools/call' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Tool Identifier</label>
                  <input
                    type="text"
                    value={selectedTool}
                    onChange={(e) => setSelectedTool(e.target.value)}
                    placeholder="woocommerce__list_orders"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>

            {method === 'tools/call' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Arguments (JSON)</label>
                <textarea
                  rows={4}
                  value={toolArgs}
                  onChange={(e) => setToolArgs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}

            <button
              onClick={handleExecute}
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50"
            >
              <Play className="h-4 w-4 mr-2" />
              {loading ? 'Executing MCP Request...' : 'Send Request'}
            </button>
          </div>

          {/* Response Output */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                MCP Response Stream
              </h2>
              {responseOutput && (
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    responseOutput.ok
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                  }`}
                >
                  HTTP {responseOutput.status}
                </span>
              )}
            </div>

            <div className="mt-4 flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-4 overflow-y-auto max-h-[460px]">
              {loading ? (
                <div className="text-slate-500 text-xs italic">Waiting for response...</div>
              ) : responseOutput ? (
                <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap">
                  {JSON.stringify(responseOutput.data || responseOutput.error, null, 2)}
                </pre>
              ) : (
                <div className="text-slate-500 text-xs italic">
                  Select a method and click "Send Request" to test MCP gateway routing, credential verification, and key revocation live.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Claude / Cursor Config Tab */
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center">
                <BookOpen className="h-5 w-5 text-indigo-400 mr-2" />
                Claude Desktop & Cursor IDE Setup
              </h2>
              <button
                onClick={() => copyText(claudeConfig, 'claude')}
                className="flex items-center text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                {copiedSnippet === 'claude' ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                Copy Config
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Paste the following configuration into your Claude Desktop configuration file (<code>claude_desktop_config.json</code>) or Cursor settings.
            </p>
            <pre className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-indigo-300 overflow-x-auto">
              {claudeConfig}
            </pre>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center">
                <Terminal className="h-5 w-5 text-emerald-400 mr-2" />
                cURL CLI Commands
              </h2>
              <button
                onClick={() => copyText(curlListCommand, 'curl')}
                className="flex items-center text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                {copiedSnippet === 'curl' ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                Copy cURL
              </button>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-400">List Tools:</div>
              <pre className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-slate-300 overflow-x-auto">
                {curlListCommand}
              </pre>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-400">Call Tool:</div>
              <pre className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-slate-300 overflow-x-auto">
                {curlCallCommand}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
