import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import ServersView from './components/ServersView.jsx';
import ChatView from './components/ChatView.jsx';
import AuditLogView from './components/AuditLogView.jsx';
import TeamView from './components/TeamView.jsx';
import InspectorView from './components/InspectorView.jsx';

// Default static keys for demo user personas
const USER_KEYS = {
  'usr-admin-01': 'urumi_admin_key_12345',
  'usr-member-02': 'urumi_member_key_67890'
};

export default function App() {
  const [activeTab, setActiveTab] = useState('servers');
  const [users, setUsers] = useState([
    { id: 'usr-admin-01', username: 'userA_admin', role: 'admin' },
    { id: 'usr-member-02', username: 'userB_member', role: 'member' }
  ]);
  const [currentUser, setCurrentUser] = useState(users[0]);
  const [servers, setServers] = useState([]);
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);

  const getAuthHeaders = () => {
    const key = USER_KEYS[currentUser?.id] || 'urumi_admin_key_12345';
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    };
  };

  const refreshData = async () => {
    try {
      // 1. Fetch servers and tools
      const resServers = await fetch('/api/servers', {
        headers: getAuthHeaders()
      });
      if (resServers.ok) {
        const data = await resServers.json();
        setServers(data.servers || []);
        setTools(data.tools || []);
      }

      // 2. Fetch users
      const resUsers = await fetch('/api/users', {
        headers: getAuthHeaders()
      });
      if (resUsers.ok) {
        const data = await resUsers.json();
        if (data.users && data.users.length > 0) {
          setUsers(data.users);
          // sync current user role
          const updatedCurrent = data.users.find(u => u.id === currentUser?.id);
          if (updatedCurrent) setCurrentUser(updatedCurrent);
        }
      }
    } catch (err) {
      console.warn('Initial data load warning:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [currentUser?.id]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        users={users}
        setCurrentUser={setCurrentUser}
      />

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'servers' && (
          <ServersView
            servers={servers}
            tools={tools}
            onRefresh={refreshData}
            currentUser={currentUser}
            getAuthHeaders={getAuthHeaders}
          />
        )}

        {activeTab === 'chat' && (
          <ChatView
            currentUser={currentUser}
            getAuthHeaders={getAuthHeaders}
          />
        )}

        {activeTab === 'audit' && (
          <AuditLogView
            getAuthHeaders={getAuthHeaders}
          />
        )}

        {activeTab === 'team' && (
          <TeamView
            currentUser={currentUser}
            getAuthHeaders={getAuthHeaders}
          />
        )}

        {activeTab === 'inspector' && (
          <InspectorView
            currentUser={currentUser}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        Urumi AI Platform • MCP Gateway on Kubernetes • Streamable HTTP Protocol
      </footer>
    </div>
  );
}
