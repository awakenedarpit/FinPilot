import { useEffect, useState } from 'react';
import { Bot, MessageSquarePlus, Send, Wrench } from 'lucide-react';
import type { CopilotEvidenceItem } from '../core/types.ts';
import { api, type ChatMessageItem, type ChatSessionSummary } from '../lib/api.ts';
import { formatCurrency } from '../lib/format.ts';

interface CopilotViewProps {
  currency: string;
}

const SUGGESTED_QUESTIONS = [
  'Where did most of my money go?',
  'What if I reduce my shopping expenses by 15%?',
  'Are there any unusual transactions?',
  'What is my projected cash flow?',
];

export function CopilotView({ currency }: CopilotViewProps) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = async () => {
    try {
      const res = await api.listCopilotSessions();
      setSessions(res.sessions);
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  const openSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setError(null);
    try {
      const data = await api.getCopilotSession(sessionId);
      setMessages(data.messages);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const startNewChat = () => {
    setActiveSessionId(undefined);
    setMessages([]);
    setError(null);
  };

  const submitQuestion = async (textToAsk: string) => {
    const trimmed = textToAsk.trim();
    if (trimmed.length < 2 || sending) return;

    setSending(true);
    setError(null);
    setQuestion('');

    const optimisticUserMsg: ChatMessageItem = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: trimmed,
      toolMetadata: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      const res = await api.sendCopilotMessage(trimmed, activeSessionId);
      setActiveSessionId(res.sessionId);

      const assistantMsg: ChatMessageItem = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        toolMetadata: {
          intent: res.intent,
          tools_used: res.tools_used,
          evidence: res.evidence,
          limitations: res.limitations,
          fallback_used: res.fallback_used,
          generated_at: res.generated_at,
        },
        createdAt: res.generated_at,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      await loadSessions();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const formatEvidenceValue = (ev: CopilotEvidenceItem) => {
    if (typeof ev.value === 'number' && ev.currency) {
      return formatCurrency(ev.value, ev.currency || currency);
    }
    return String(ev.value);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Conversation History Sidebar */}
      <aside className="lg:col-span-3 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] flex flex-col">
        <button
          type="button"
          onClick={startNewChat}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold text-white bg-[#101B32] dark:bg-[#4169E1] rounded-lg hover:opacity-95 cursor-pointer"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>New Copilot Session</span>
        </button>

        <div className="mt-4 flex-1 space-y-1">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2 mb-2">
            Recent Conversations
          </p>
          {sessions.length === 0 ? (
            <p className="text-xs text-slate-400 px-2">No saved sessions yet.</p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => void openSession(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate transition-colors cursor-pointer ${
                  activeSessionId === s.id
                    ? 'bg-slate-100 dark:bg-slate-800 font-semibold text-[#101B32] dark:text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                {s.title}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Chat Viewport */}
      <section className="lg:col-span-9 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111B30] flex flex-col min-h-[540px]">
        <div className="pb-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Bot className="w-5 h-5 text-[#4169E1]" />
            <div>
              <h2 className="text-base font-semibold text-[#101B32] dark:text-white">
                FinPilot AI Copilot
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tool-grounded financial Q&amp;A backed strictly by your PostgreSQL transactions
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            6 Registered Tools · Deterministic Evidence
          </span>
        </div>

        {/* Suggested Prompts */}
        <div className="py-3 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap gap-2">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void submitQuestion(q)}
              disabled={sending}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-[#F6F8FC] dark:bg-[#0F172A] text-slate-700 dark:text-slate-200 hover:border-[#4169E1] transition-colors cursor-pointer"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Messages Feed */}
        <div className="flex-1 py-4 space-y-5 overflow-y-auto max-h-[460px]">
          {messages.length === 0 ? (
            <div className="py-12 text-center max-w-md mx-auto">
              <p className="text-sm font-semibold text-[#101B32] dark:text-white">
                Ask anything about your spending, anomalies, or cash-flow outlook
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                Select a suggested prompt above or type your own question below. Every answer lists
                the deterministic tools invoked and the exact supporting metrics.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-2xl rounded-xl p-4 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#101B32] text-white dark:bg-[#4169E1]'
                      : 'bg-[#F6F8FC] dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-[#202B40] dark:text-[#EDF2FA]'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {msg.role === 'assistant' && msg.toolMetadata && (
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                      {msg.toolMetadata.tools_used && msg.toolMetadata.tools_used.length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <Wrench className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Tools executed: {msg.toolMetadata.tools_used.join(', ')}
                            {msg.toolMetadata.fallback_used ? ' (Deterministic fallback)' : ''}
                          </span>
                        </div>
                      )}

                      {msg.toolMetadata.evidence && msg.toolMetadata.evidence.length > 0 && (
                        <div className="divide-y divide-slate-200/80 dark:divide-slate-800 border-t border-slate-200/80 dark:border-slate-800 pt-1">
                          {msg.toolMetadata.evidence.map((ev, idx) => (
                            <div
                              key={`${ev.metric}-${idx}`}
                              className="py-2 flex items-baseline justify-between gap-4 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="text-slate-600 dark:text-slate-300 capitalize">
                                  {ev.metric.replace(/_/g, ' ')}
                                </span>
                                {ev.detail && (
                                  <span className="text-slate-400 dark:text-slate-500 ml-2">
                                    · {ev.detail}
                                  </span>
                                )}
                              </div>
                              <span className="font-mono-num font-semibold text-[#101B32] dark:text-white whitespace-nowrap shrink-0">
                                {formatEvidenceValue(ev)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {msg.toolMetadata.limitations && msg.toolMetadata.limitations.length > 0 && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300">
                          Note: {msg.toolMetadata.limitations.join(' ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Executing financial tools and synthesizing grounded explanation...
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-3 p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300"
          >
            {error}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitQuestion(question);
          }}
          className="pt-3 border-t border-slate-200 dark:border-slate-800 flex gap-2"
        >
          <label htmlFor="copilot-input" className="sr-only">
            Ask FinPilot AI Copilot a financial question
          </label>
          <input
            id="copilot-input"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about spending trends, anomalies, forecasts, or what-if scenarios..."
            className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0F172A] text-[#101B32] dark:text-white"
          />
          <button
            type="submit"
            disabled={sending || question.trim().length < 2}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#4169E1] hover:bg-[#3358CC] rounded-lg disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Ask</span>
          </button>
        </form>
      </section>
    </div>
  );
}
