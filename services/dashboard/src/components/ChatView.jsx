import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Zap, Clock, CheckCircle2, XCircle, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

export default function ChatView({ currentUser, getAuthHeaders }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Hello! I am your Team MCP Assistant. I can interact with your WooCommerce store and all registered upstream tools.\n\nAsk me to create products, check orders, or run multi-server analytics!`,
      toolsCalled: [],
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedToolIdx, setExpandedToolIdx] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend) => {
    const prompt = textToSend || input;
    if (!prompt.trim() || loading) return;

    const userMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      text: prompt,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: prompt,
          history: messages.slice(-4)
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat agent error');

      const botMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        text: data.reply,
        toolsCalled: data.toolsCalled || [],
        user: data.user,
        timestamp: new Date().toLocaleTimeString()
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          text: `Error calling tools: ${err.message}`,
          toolsCalled: [],
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-10rem)] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
      {/* Top Identity Attribution Bar */}
      <div className="bg-slate-950/70 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white">Agent Execution Context</div>
            <div className="text-[11px] text-slate-400">
              Tool calls are authenticated and logged as:{' '}
              <span className="font-mono text-indigo-300 font-semibold">{currentUser?.username}</span>{' '}
              <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 uppercase font-medium">
                {currentUser?.role}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() =>
            setMessages([
              {
                id: 'welcome',
                role: 'assistant',
                text: 'Chat history cleared. How can I help you with your MCP tools today?',
                toolsCalled: [],
                timestamp: new Date().toLocaleTimeString()
              }
            ])
          }
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Clear History
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, mIdx) => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}>
              {/* Avatar */}
              <div
                className={`h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  isUser
                    ? 'bg-gradient-to-tr from-indigo-600 to-violet-600 text-white'
                    : 'bg-slate-800 text-indigo-400 border border-slate-700'
                }`}
              >
                {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              {/* Message Bubble */}
              <div className={`max-w-2xl space-y-2 ${isUser ? 'items-end' : ''}`}>
                <div
                  className={`rounded-2xl p-4 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-600/20'
                      : 'bg-slate-950/80 text-slate-200 border border-slate-800 rounded-tl-none whitespace-pre-wrap'
                  }`}
                >
                  {msg.text}
                </div>

                {/* Render Tools Called Pills if any */}
                {msg.toolsCalled && msg.toolsCalled.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-semibold text-slate-400 flex items-center space-x-1">
                      <Zap className="h-3 w-3 text-amber-400" />
                      <span>Executed MCP Tools ({msg.toolsCalled.length}):</span>
                    </div>

                    <div className="space-y-1">
                      {msg.toolsCalled.map((t, tIdx) => {
                        const isExpanded = expandedToolIdx === `${mIdx}-${tIdx}`;
                        return (
                          <div
                            key={tIdx}
                            className="bg-slate-950 border border-slate-800/80 rounded-xl p-2 text-xs font-mono"
                          >
                            <div
                              onClick={() => setExpandedToolIdx(isExpanded ? null : `${mIdx}-${tIdx}`)}
                              className="flex items-center justify-between cursor-pointer hover:text-indigo-300"
                            >
                              <div className="flex items-center space-x-2">
                                {t.isError ? (
                                  <XCircle className="h-3.5 w-3.5 text-rose-400" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                )}
                                <span className="font-semibold text-indigo-400">{t.tool}</span>
                              </div>
                              <div className="flex items-center space-x-2 text-[10px] text-slate-500">
                                <span>{t.durationMs}ms</span>
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="mt-2 pt-2 border-t border-slate-800 space-y-1 text-[11px]">
                                <div>
                                  <span className="text-slate-500">Args: </span>
                                  <span className="text-slate-300">{JSON.stringify(t.arguments)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">Output: </span>
                                  <pre className="text-slate-300 max-h-32 overflow-y-auto bg-slate-900 p-1.5 rounded mt-0.5">
                                    {typeof t.output === 'object' ? JSON.stringify(t.output, null, 2) : String(t.output)}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-slate-500 px-1">{msg.timestamp}</div>
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center space-x-3 text-slate-400 text-xs">
            <div className="h-8 w-8 rounded-xl bg-slate-800 text-indigo-400 flex items-center justify-center border border-slate-700 animate-spin">
              <Zap className="h-4 w-4" />
            </div>
            <span>Agent planning & calling MCP tools through gateway...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts Quick Bar */}
      <div className="px-6 py-2 bg-slate-950/40 border-t border-slate-800/80 flex items-center space-x-2 overflow-x-auto text-xs">
        <span className="text-slate-500 font-medium whitespace-nowrap text-[11px]">Try:</span>
        <button
          onClick={() => handleSend("Create a product named 'Ergonomic Mechanical Keyboard' with price 129.99")}
          className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 hover:text-white transition-colors text-[11px]"
        >
          Create Product
        </button>
        <button
          onClick={() => handleSend("What orders came in today?")}
          className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 hover:text-white transition-colors text-[11px]"
        >
          What orders came in today?
        </button>
        <button
          onClick={() => handleSend("Summarize today's sales and convert total revenue to EUR")}
          className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 hover:text-white transition-colors text-[11px]"
        >
          Multi-Server Summary (Analytics + Currency)
        </button>
      </div>

      {/* Input Bar */}
      <div className="p-4 bg-slate-950 border-t border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask a question or issue a command as ${currentUser?.username}...`}
            className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="h-11 w-11 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-all flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
