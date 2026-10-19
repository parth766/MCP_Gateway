import React, { useState, useEffect } from 'react';
import { Users, Key, Plus, Trash2, Shield, UserPlus, Copy, Check, AlertCircle } from 'lucide-react';

export default function TeamView({ currentUser, getAuthHeaders }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyDisplay, setNewKeyDisplay] = useState(null);
  const [copied, setCopied] = useState(false);
  const [selectedUserForNewKey, setSelectedUserForNewKey] = useState(null);

  // Form states
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [keyName, setKeyName] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users', { headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ username: inviteUsername, role: inviteRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to invite user');

      setShowInviteModal(false);
      setInviteUsername('');
      setInviteRole('member');
      setNewKeyDisplay({ key: data.apiKey, user: data.user.username });
      await fetchUsers();
    } catch (err) {
      alert(`Error inviting user: ${err.message}`);
    }
  };

  const handleGenerateKey = async (e) => {
    e.preventDefault();
    if (!selectedUserForNewKey) return;

    try {
      const res = await fetch(`/api/users/${selectedUserForNewKey.id}/keys`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: keyName || 'Personal API Key' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate key');

      setShowKeyModal(false);
      setKeyName('');
      setNewKeyDisplay({ key: data.apiKey, user: selectedUserForNewKey.username });
      await fetchUsers();
    } catch (err) {
      alert(`Error generating key: ${err.message}`);
    }
  };

  const handleRevokeKey = async (keyId) => {
    if (!window.confirm('Are you sure you want to revoke this API key? Any MCP clients using this key will immediately be rejected!')) {
      return;
    }

    try {
      const res = await fetch(`/api/keys/${keyId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke key');
      await fetchUsers();
    } catch (err) {
      alert(`Error revoking key: ${err.message}`);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Team Members & Access Keys</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage user roles (Admin vs Member) and cryptographically hashed API keys for gateway access.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Invite Team Member
          </button>
        )}
      </div>

      {/* Users and their API Keys */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {users.map((user) => {
          const isMe = user.id === currentUser?.id;
          const canManageThisUser = isAdmin || isMe;

          return (
            <div
              key={user.id}
              className={`bg-slate-900/90 border rounded-2xl p-5 shadow-xl transition-all ${
                isMe ? 'border-indigo-500/50 ring-1 ring-indigo-500/20' : 'border-slate-800'
              }`}
            >
              {/* User Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center space-x-3">
                  <div
                    className={`h-11 w-11 rounded-2xl flex items-center justify-center font-bold text-base ${
                      user.role === 'admin'
                        ? 'bg-indigo-950 text-indigo-400 border border-indigo-700/50'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {user.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-sm">{user.username}</span>
                      {isMe && (
                        <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-1.5 py-0.2 rounded">
                          You
                        </span>
                      )}
                    </div>
                    <span
                      className={`inline-block mt-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        user.role === 'admin'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {user.role.toUpperCase()}
                    </span>
                  </div>
                </div>

                {canManageThisUser && (
                  <button
                    onClick={() => {
                      setSelectedUserForNewKey(user);
                      setShowKeyModal(true);
                    }}
                    className="flex items-center px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1 text-indigo-400" />
                    New Key
                  </button>
                )}
              </div>

              {/* API Keys List */}
              <div className="mt-4 space-y-2">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Issued API Keys:</span>
                  <span className="text-[11px] text-slate-500 font-normal">Hashed in Database</span>
                </div>

                {user.keys.length === 0 ? (
                  <div className="text-xs text-slate-500 italic py-2">No active API keys issued yet.</div>
                ) : (
                  user.keys.map((k) => (
                    <div
                      key={k.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
                        k.revoked
                          ? 'bg-rose-950/20 border-rose-900/40 text-slate-500 line-through'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="font-sans font-semibold text-slate-200 flex items-center space-x-1.5">
                          <Key className="h-3.5 w-3.5 text-indigo-400" />
                          <span>{k.name}</span>
                          {k.revoked && (
                            <span className="text-[10px] no-underline font-sans font-semibold px-1.5 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-800">
                              Revoked
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{k.prefix}</div>
                      </div>

                      {!k.revoked && canManageThisUser && (
                        <button
                          onClick={() => handleRevokeKey(k.id)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition-colors font-sans text-xs font-medium"
                          title="Revoke Key"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Generated Key Modal (Displays key once!) */}
      {newKeyDisplay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-base font-bold text-white flex items-center">
              <Key className="h-5 w-5 text-emerald-400 mr-2" />
              API Key Generated Successfully
            </h2>
            <p className="text-xs text-slate-400 mt-2">
              Assigned to user: <strong className="text-slate-200">{newKeyDisplay.user}</strong>. Please copy this key now; it will not be shown again!
            </p>

            <div className="mt-4 p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <code className="text-xs font-mono text-emerald-400 break-all select-all">
                {newKeyDisplay.key}
              </code>
              <button
                onClick={() => copyToClipboard(newKeyDisplay.key)}
                className="ml-3 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex-shrink-0"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <button
              onClick={() => setNewKeyDisplay(null)}
              className="mt-6 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all"
            >
              Done / Saved Key
            </button>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl">
            <h2 className="text-base font-bold text-white">Invite Team Member</h2>
            <form onSubmit={handleInvite} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. dev_sarah"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="member">Member (Tool caller)</option>
                  <option value="admin">Admin (Server & member manager)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-lg shadow-indigo-600/30"
                >
                  Invite & Issue Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Key Modal */}
      {showKeyModal && selectedUserForNewKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl">
            <h2 className="text-base font-bold text-white">Issue API Key</h2>
            <p className="text-xs text-slate-400 mt-1">
              For user: <strong className="text-slate-200">{selectedUserForNewKey.username}</strong>
            </p>

            <form onSubmit={handleGenerateKey} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Key Description / Name</label>
                <input
                  type="text"
                  placeholder="e.g. Cursor IDE Key, CI/CD"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Generate Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
