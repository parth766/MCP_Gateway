import React, { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, CheckCircle, XCircle, Clock, User, Filter, Eye } from 'lucide-react';

export default function AuditLogView({ getAuthHeaders }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [userFilter, setUserFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/audit?limit=100', {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const filteredLogs = logs.filter((log) => {
    if (userFilter !== 'all' && log.username !== userFilter) return false;
    if (outcomeFilter !== 'all' && log.outcome !== outcomeFilter) return false;
    return true;
  });

  const uniqueUsers = Array.from(new Set(logs.map(l => l.username)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Security & Tool Call Audit Log</h1>
          <p className="text-sm text-slate-400 mt-1">
            Tamper-evident record of all tool invocations from both the Chat Agent and External MCP Clients.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
            />
            <span>Auto-refresh (4s)</span>
          </label>

          <button
            onClick={fetchLogs}
            className="flex items-center px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-medium transition-colors border border-slate-700"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center space-x-2 text-slate-400">
          <Filter className="h-4 w-4 text-indigo-400" />
          <span>Filters:</span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-slate-500">User:</span>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2.5 py-1 focus:outline-none"
          >
            <option value="all">All Users</option>
            {uniqueUsers.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-slate-500">Outcome:</span>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2.5 py-1 focus:outline-none"
          >
            <option value="all">All Outcomes</option>
            <option value="success">Success Only</option>
            <option value="error">Error Only</option>
          </select>
        </div>

        <div className="ml-auto text-slate-400">
          Showing <strong className="text-white">{filteredLogs.length}</strong> events
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Caller Identity</th>
                <th className="py-3 px-4">Target Server</th>
                <th className="py-3 px-4">Tool Name</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4">Outcome</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 font-sans italic">
                    No audit records match criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isSuccess = log.outcome === 'success';
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5 font-sans">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span className="font-semibold text-slate-200">{log.username}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 uppercase">
                            {log.user_role}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-indigo-300 font-sans font-medium whitespace-nowrap">
                        {log.server_name}
                      </td>
                      <td className="py-3 px-4 text-slate-200 font-semibold whitespace-nowrap">
                        {log.tool_name}
                      </td>
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {log.duration_ms}ms
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold font-sans ${
                            isSuccess
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                              : 'bg-rose-950 text-rose-400 border border-rose-800/60'
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          ) : (
                            <XCircle className="h-3 w-3 mr-1" />
                          )}
                          {isSuccess ? 'Success' : 'Error'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                          title="View Tool Payload"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-white flex items-center">
                <ShieldCheck className="h-5 w-5 text-indigo-400 mr-2" />
                Audit Record #{selectedLog.id}
              </h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-slate-400">
                <div>User: <strong className="text-slate-200">{selectedLog.username}</strong> ({selectedLog.user_role})</div>
                <div>Server: <strong className="text-indigo-300">{selectedLog.server_name}</strong></div>
                <div>Tool: <strong className="text-slate-200">{selectedLog.tool_name}</strong></div>
                <div>Duration: <strong className="text-slate-200">{selectedLog.duration_ms}ms</strong></div>
                <div className="col-span-2">Time: <strong className="text-slate-200">{selectedLog.timestamp}</strong></div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Input Arguments:</label>
                <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 max-h-36 overflow-y-auto">
                  {selectedLog.input_summary}
                </pre>
              </div>

              {selectedLog.error_message && (
                <div>
                  <label className="block text-rose-400 font-semibold mb-1">Error Message:</label>
                  <pre className="bg-rose-950/40 p-3 rounded-xl border border-rose-900/60 font-mono text-[11px] text-rose-300 max-h-36 overflow-y-auto">
                    {selectedLog.error_message}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
