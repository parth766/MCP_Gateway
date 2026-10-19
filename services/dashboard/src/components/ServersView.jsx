import React, { useState } from 'react';
import { Server, Plus, RefreshCw, Power, Trash2, Shield, AlertTriangle, CheckCircle, Clock, Zap, ChevronRight, ChevronDown } from 'lucide-react';

export default function ServersView({ servers, tools, onRefresh, currentUser, getAuthHeaders }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    url: '',
    auth_type: 'none',
    auth_header_name: 'Authorization',
    credential: ''
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [expandedServerId, setExpandedServerId] = useState(null);

  const isAdmin = currentUser?.role === 'admin';

  const handleAddServer = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add server');

      setShowAddModal(false);
      setFormData({ name: '', url: '', auth_type: 'none', auth_header_name: 'Authorization', credential: '' });
      await onRefresh();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnable = async (server) => {
    try {
      await fetch(`/api/servers/${server.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ enabled: !server.enabled })
      });
      await onRefresh();
    } catch (err) {
      alert(`Error updating server: ${err.message}`);
    }
  };

  const handleDelete = async (server) => {
    if (!window.confirm(`Are you sure you want to remove MCP server "${server.name}"?`)) return;
    try {
      await fetch(`/api/servers/${server.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      await onRefresh();
    } catch (err) {
      alert(`Error deleting server: ${err.message}`);
    }
  };

  const handleServerRefresh = async (server) => {
    try {
      await fetch(`/api/servers/${server.id}/refresh`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      await onRefresh();
    } catch (err) {
      alert(`Error refreshing server: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Registered MCP Upstreams</h1>
          <p className="text-sm text-slate-400 mt-1">
            Aggregated upstream Model Context Protocol servers communicating over Streamable HTTP.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onRefresh}
            className="flex items-center px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-medium transition-colors border border-slate-700"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh All
          </button>

          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add MCP Server
            </button>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="h-5 w-5 text-indigo-400 flex-shrink-0" />
          <div className="text-xs text-slate-300">
            <span className="font-semibold text-slate-100">Zero-Trust Credential Isolation:</span> Upstream bearer tokens & API keys are encrypted at rest with AES-256-GCM in Kubernetes Secrets. Clients connect via Team Gateway API Keys and never inspect upstream secrets.
          </div>
        </div>
        <div className="hidden md:flex items-center space-x-4 text-xs text-slate-400 flex-shrink-0">
          <div className="flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
            Connected
          </div>
          <div className="flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mr-1.5" />
            Unreachable
          </div>
          <div className="flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500 mr-1.5" />
            Disabled
          </div>
        </div>
      </div>

      {/* Servers List */}
      <div className="grid grid-cols-1 gap-4">
        {servers.map((server, idx) => {
          const isWooCommerce = server.id === 'woocommerce';
          const serverTools = tools.filter(t => t.name.startsWith(`${server.id}__`));
          const isExpanded = expandedServerId === server.id;

          return (
            <div
              key={server.id}
              className={`border rounded-2xl transition-all ${
                !server.enabled
                  ? 'bg-slate-900/40 border-slate-800/60 opacity-70'
                  : server.status === 'Unreachable'
                  ? 'bg-rose-950/20 border-rose-900/40'
                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 shadow-xl'
              }`}
            >
              <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Left server details */}
                <div className="flex items-start space-x-4">
                  <div
                    className={`h-12 w-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      isWooCommerce
                        ? 'bg-purple-900/50 text-purple-400 border border-purple-700/50'
                        : 'bg-indigo-950 text-indigo-400 border border-indigo-800/50'
                    }`}
                  >
                    <Server className="h-6 w-6" />
                  </div>

                  <div>
                    <div className="flex items-center space-x-2.5">
                      <h3 className="text-base font-bold text-white">{server.name}</h3>
                      {isWooCommerce && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-purple-950 text-purple-300 border border-purple-800">
                          Primary Source (#1)
                        </span>
                      )}
                      {/* Status Badge */}
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center ${
                          !server.enabled
                            ? 'bg-slate-800 text-slate-400'
                            : server.status === 'Connected'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                            : 'bg-rose-950 text-rose-400 border border-rose-800/80'
                        }`}
                      >
                        {!server.enabled ? 'Disabled' : server.status}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span className="font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                        {server.url}
                      </span>
                      <span>Auth: <strong className="text-slate-300">{server.auth_type.toUpperCase()}</strong></span>
                      {server.has_credential && (
                        <span className="text-emerald-400 font-mono flex items-center">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Encrypted Credential
                        </span>
                      )}
                      {server.enabled && server.status === 'Connected' && (
                        <span className="flex items-center text-slate-300">
                          <Clock className="h-3 w-3 mr-1 text-slate-500" />
                          {server.latency_ms}ms
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right controls */}
                <div className="flex items-center space-x-2 self-end md:self-center">
                  <button
                    onClick={() => setExpandedServerId(isExpanded ? null : server.id)}
                    className="flex items-center px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors"
                  >
                    <Zap className="h-3.5 w-3.5 mr-1.5 text-indigo-400" />
                    {serverTools.length} Tools
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 ml-1" /> : <ChevronRight className="h-3.5 w-3.5 ml-1" />}
                  </button>

                  {isAdmin && (
                    <>
                      <button
                        onClick={() => handleServerRefresh(server)}
                        title="Ping and reload tools"
                        className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>

                      <button
                        onClick={() => handleToggleEnable(server)}
                        title={server.enabled ? 'Disable Server' : 'Enable Server'}
                        className={`p-2 rounded-xl transition-colors ${
                          server.enabled
                            ? 'bg-emerald-950 text-emerald-400 hover:bg-rose-950 hover:text-rose-400'
                            : 'bg-slate-800 text-slate-500 hover:text-emerald-400'
                        }`}
                      >
                        <Power className="h-4 w-4" />
                      </button>

                      {!isWooCommerce && (
                        <button
                          onClick={() => handleDelete(server)}
                          title="Remove Server"
                          className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Collapsible Tools List */}
              {isExpanded && (
                <div className="border-t border-slate-800/80 bg-slate-950/50 p-5 rounded-b-2xl space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Tools Exposed by {server.name}:
                  </div>
                  {serverTools.length === 0 ? (
                    <div className="text-xs text-slate-500 italic">No active tools reported (server may be unreachable or disabled).</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {serverTools.map((t) => (
                        <div key={t.name} className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-indigo-300">{t.name}</span>
                            <span className="text-[10px] text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                              MCP Tool
                            </span>
                          </div>
                          <p className="text-slate-400 mt-1 text-[11px] leading-relaxed line-clamp-2">
                            {t.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add MCP Server Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <h2 className="text-lg font-bold text-white">Register New MCP Server</h2>
            <p className="text-xs text-slate-400 mt-1">
              Add an upstream MCP server speaking Streamable HTTP (SSE or JSON-RPC POST).
            </p>

            {errorMsg && (
              <div className="mt-4 p-3 rounded-xl bg-rose-950/70 border border-rose-800/80 flex items-start space-x-2 text-rose-300 text-xs">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleAddServer} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Server Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weather & Fulfillment MCP"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Streamable HTTP URL (SSE or endpoint)
                </label>
                <input
                  type="url"
                  required
                  placeholder="http://my-service:4005/sse"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  * SSRF Protection enabled: Cloud metadata IPs (169.254.x.x) and link-local addresses are rejected.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Auth Scheme</label>
                  <select
                    value={formData.auth_type}
                    onChange={(e) => setFormData({ ...formData, auth_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="none">No Auth (Public/Internal)</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="header">Custom Header</option>
                  </select>
                </div>

                {formData.auth_type === 'header' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Header Name</label>
                    <input
                      type="text"
                      placeholder="X-API-Key"
                      value={formData.auth_header_name}
                      onChange={(e) => setFormData({ ...formData, auth_header_name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>

              {formData.auth_type !== 'none' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Credential Secret</label>
                  <input
                    type="password"
                    placeholder="Secret token or key (encrypted at rest)"
                    value={formData.credential}
                    onChange={(e) => setFormData({ ...formData, credential: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div className="mt-6 flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all"
                >
                  {loading ? 'Validating & Registering...' : 'Register Server'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
