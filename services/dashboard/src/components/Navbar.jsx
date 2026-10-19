import React from 'react';
import { Server, MessageSquare, ShieldCheck, Users, Terminal, Store, ChevronDown } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, currentUser, users, setCurrentUser }) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Server className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                Urumi MCP Gateway
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800/60">
                Kubernetes Cloud
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex space-x-1">
            <button
              onClick={() => setActiveTab('servers')}
              className={`flex items-center px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'servers'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Server className="h-4 w-4 mr-2" />
              Servers
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'chat'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Chat Agent
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'audit'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Audit Log
            </button>

            <button
              onClick={() => setActiveTab('team')}
              className={`flex items-center px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'team'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Users className="h-4 w-4 mr-2" />
              Team & Keys
            </button>

            <button
              onClick={() => setActiveTab('inspector')}
              className={`flex items-center px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'inspector'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Terminal className="h-4 w-4 mr-2" />
              External MCP
            </button>
          </nav>

          {/* User Switcher (User A vs User B demo switcher) & Store Link */}
          <div className="flex items-center space-x-3">
            <a
              href="/store"
              target="_blank"
              rel="noreferrer"
              className="hidden lg:flex items-center text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-950/70 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-900/50 transition-colors"
              title="Open WooCommerce Storefront"
            >
              <Store className="h-3.5 w-3.5 mr-1.5" />
              WooCommerce Store
            </a>

            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1">
              <span className="text-xs text-slate-400 mr-2">Logged in:</span>
              <div className="relative">
                <select
                  value={currentUser?.id || ''}
                  onChange={(e) => {
                    const u = users.find(x => x.id === e.target.value);
                    if (u) setCurrentUser(u);
                  }}
                  className="bg-slate-800 text-xs text-indigo-300 font-semibold rounded-lg px-2.5 py-1 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer pr-6 appearance-none"
                >
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.role.toUpperCase()})
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3 w-3 text-slate-400 absolute right-2 top-2 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
