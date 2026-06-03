import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { diaryService, ChatMessage, ChatSession } from '../services/diaryService';
import { buildDiaryContext } from '../services/diaryContext';
import { sendMessage as sendToAI, AI_STYLES } from '../services/aiService';
import { isAuthenticated } from '../services/apiClient';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import { createClientId } from '../utils/id';
import Markdown from 'react-markdown';
import { CanvasIcon, IconStyle } from '../components/CanvasIcon';

const MODEL_LIST = [
  { id: 'xiaomi-mimo',                    label: 'Xiaomi MiMo'      },
  { id: 'LongCat-Flash-Lite',             label: 'LongCat Lite'     },
  { id: 'LongCat-Flash-Thinking-2601',    label: 'LongCat Thinking' }
];

const DEFAULT_MODEL_TIMEOUT_MS = 45000;
const MODEL_TIMEOUT_MS: Record<string, number> = {
  'LongCat-Flash-Thinking-2601': 120000,
};

function extractAnswer(rawText: string): string {
  // Remove all <think>...</think> paired blocks, and any unclosed <think> block at the end (for streaming)
  return rawText.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trimStart();
}

function getModelTimeoutMs(modelId: string) {
  return MODEL_TIMEOUT_MS[modelId] || DEFAULT_MODEL_TIMEOUT_MS;
}

function getTimeoutMessage(modelId: string) {
  if (modelId === 'LongCat-Flash-Thinking-2601') {
    return 'LongCat Thinking 响应较慢，本次等待超时。你可以稍后再试，或先切换到 LongCat Lite / Xiaomi MiMo。';
  }

  return 'AI 响应超时，请稍后再试。';
}

function createId() {
  return createClientId();
}

export default function AIChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();
  const keyboardInset = useKeyboardInset();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  type Attachment = {
    id: string;
    type: 'photo' | 'file' | 'link' | 'diary';
    name: string;
    content: string;
  };

  const [session, setSession] = useState<ChatSession | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSheetMounted, setIsSheetMounted] = useState(false);
  const [isSheetVisible, setIsSheetVisible] = useState(false);
  const [footerHeight, setFooterHeight] = useState(76);
  const footerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<(ChatMessage & { isStreaming?: boolean })[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isReadingDiary, setIsReadingDiary] = useState(true);
  const [systemHint, setSystemHint] = useState<string | null>(null);
  const [attachedContext, setAttachedContext] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historySessions, setHistorySessions] = useState<ChatSession[]>([]);
  const [historySearchKeyword, setHistorySearchKeyword] = useState('');
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('preferred_ai_model') || 'xiaomi-mimo';
  });
  const [isModelSheetVisible, setIsModelSheetVisible] = useState(false);
  const [isModelSheetMounted, setIsModelSheetMounted] = useState(false);
  const [currentStyleId, setCurrentStyleId] = useState(() => localStorage.getItem('xiang_ai_style') || 'classic');
  const [showStyleSheet, setShowStyleSheet] = useState(false);
  const [styleSheetVisible, setStyleSheetVisible] = useState(false);
  const [activeContextSession, setActiveContextSession] = useState<ChatSession | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState<{x: number, y: number} | null>(null);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const handledDailyEchoStateKeyRef = useRef('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const currentStyle = AI_STYLES.find(s => s.id === currentStyleId) || AI_STYLES[0];

  const STYLE_WELCOMES: Record<string, string> = {
    classic:  '我可以陪你聊天，或帮你分析日记。',
    gentle:   '我会先听见你的感受，再陪你慢慢看清它。',
    tsundere: '有事就说，小麻烦精。我会认真看，哼，别误会。',
    scholar:  '把问题交给我，我们把它拆到能看清为止。',
  };

  const STYLE_PROMPTS: Record<string, string[]> = {
    classic: [
      '📊 根据我的日记，我最近状态怎么样？',
      '💡 从我的日记看，我擅长什么？有什么特点？',
      '🌱 我最近情绪的变化趋势是什么？',
      '🎯 根据我的日记，给我一些成长建议',
    ],
    gentle: [
      '📊 最近我的状态怎么样？',
      '🫶 我的情绪里有什么值得留意的模式？',
      '🌿 从我的日记里，你看到了什么？',
      '✨ 给我一些温柔但有力量的建议',
    ],
    tsundere: [
      '📊 说吧，我最近状态到底怎么样？',
      '😤 有什么问题你就直接吐槽，别留情。',
      '🪞 你觉得我是个什么样的人？',
      '🧭 给我点建议，别说空话。',
    ],
    scholar: [
      '📊 系统分析我近期的状态。',
      '🧠 我的日记里有哪些规律性的主题？',
      '🔍 从心理视角解读一下我的情绪变化。',
      '🧩 帮我把这个复杂问题拆清楚。',
    ],
  };

  const openStyleSheet = () => {
    setShowStyleSheet(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setStyleSheetVisible(true));
    });
  };

  const closeStyleSheet = () => {
    setStyleSheetVisible(false);
    setTimeout(() => setShowStyleSheet(false), 300);
  };

  const switchStyle = (styleId: string) => {
    setCurrentStyleId(styleId);
    localStorage.setItem('xiang_ai_style', styleId);
    startNewChat();
    setSystemHint(`已切换为「${AI_STYLES.find(s => s.id === styleId)?.name}」风格`);
    setTimeout(() => setSystemHint(null), 3000);
    closeStyleSheet();
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadHistory();
    buildDiaryContext(true).then(() => {
      setIsReadingDiary(false);
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, keyboardInset, footerHeight]);

  useEffect(() => {
    if (!footerRef.current) return;
    const observer = new ResizeObserver(entries => {
      setFooterHeight(entries[0].contentRect.height);
    });
    observer.observe(footerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '52px';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 184)}px`;
    }
  }, [input]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadHistory = async () => {
    const sessions = await diaryService.getChatSessions();
    setHistorySessions(sessions);
  };

  const startNewChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSession(null);
    setMessages([]);
    setAttachedContext(null);
    setSystemHint(null);
    setShowHistory(false);
  };

  useEffect(() => {
    const state = location.state as {
      source?: string;
      entryId?: string;
      entryDate?: string;
      diaryText?: string;
      echoText?: string;
    } | null;

    if (state?.source !== 'daily-echo' || !state.entryId || !state.echoText) return;
    const stateKey = `${state.entryId}:${state.echoText}`;
    if (handledDailyEchoStateKeyRef.current === stateKey) return;
    handledDailyEchoStateKeyRef.current = stateKey;

    setCurrentStyleId('gentle');
    localStorage.setItem('xiang_ai_style', 'gentle');
    startNewChat();
    setAttachedContext(`你正在接续“小象回声”之后的对话。请继续使用温柔陪伴风格，先接住感受，再轻轻帮助用户把这篇日记看清楚，不要长篇说教。

【日记日期】
${state.entryDate || ''}

【日记内容】
${state.diaryText || ''}

【小象回声】
${state.echoText}`);
    setInput('想继续聊聊这篇小象回声。');
    setSystemHint('已带入这篇日记和小象回声');
    setTimeout(() => setSystemHint(null), 3000);
  }, [location.state]);

  const loadSession = (s: ChatSession) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setSession(s);
    setMessages(s.messages.filter(m => m.role !== 'system').map(m => ({
      ...m,
      content: m.role === 'assistant' ? extractAnswer(m.rawText || m.content) : m.content
    })));
    setAttachedContext(null);
    setSystemHint(null);
    setShowHistory(false);
  };

  const handlePressStart = (e: React.TouchEvent | React.MouseEvent, s: ChatSession) => {
    const isTouch = 'touches' in e;
    const clientX = isTouch ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = isTouch ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      setActiveContextSession(s);
      setContextMenuPos({ x: clientX, y: clientY });
      pressTimer.current = null;
    }, 500); 
  };

  const handlePressEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleRenameSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSessionId || !editingTitle.trim()) return;
    const s = historySessions.find(x => x.id === editingSessionId);
    if (s) {
      const updated = { ...s, title: editingTitle.trim() }; // Keep updatedAt same so it doesn't move 
      await diaryService.saveChatSession(updated);
      setHistorySessions(prev => prev.map(x => x.id === s.id ? updated : x));
      if (session?.id === s.id) setSession(updated);
    }
    setEditingSessionId(null);
  };

  const handlePinSession = async (s: ChatSession) => {
    const updated = { ...s, pinned: !s.pinned };
    await diaryService.saveChatSession(updated);
    setHistorySessions(prev =>
      prev.map(x => x.id === s.id ? updated : x)
    );
    setActiveContextSession(null);
  };

  const handleDeleteSession = async (s: ChatSession) => {
    await diaryService.deleteChatSession(s.id);
    setHistorySessions(prev => prev.filter(x => x.id !== s.id));
    setActiveContextSession(null);
    if (session?.id === s.id) {
      startNewChat();
    }
  };

  const openSheet = () => {
    setIsSheetMounted(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsSheetVisible(true);
      });
    });
  };

  const closeSheet = () => {
    setIsSheetVisible(false);
    setTimeout(() => {
      setIsSheetMounted(false);
    }, 220);
  };

  const handleAddPhoto = () => {
    setSystemHint('当前模型暂不支持图片识别');
    setTimeout(() => setSystemHint(null), 3000);
    closeSheet();
  };

  const handleAddFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const ext = file.name.split('.').pop()?.toLowerCase();
        
        if (['jpg','jpeg','png','gif','webp','heic'].includes(ext || '')) {
          setSystemHint('当前模型暂不支持图片识别');
          setTimeout(() => setSystemHint(null), 3000);
          return;
        }

        if (['md','txt','json','csv'].includes(ext || '')) {
          const text = await file.text();
          const truncated = text.slice(0, 8000);
          const fileMessage = `[文件: ${file.name}]\n\n${truncated}${text.length > 8000 ? '\n...(内容过长，已截断)' : ''}`;
          
          setAttachments(prev => [...prev, {
            id: createId(),
            type: 'file',
            name: `📄 ${file.name}`,
            content: fileMessage
          }]);
          return;
        }

        setSystemHint('暂不支持该文件格式');
        setTimeout(() => setSystemHint(null), 3000);
      }
    };
    input.click();
    closeSheet();
  };

  const handleAddTodayDiary = async () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const entries = await diaryService.getActiveEntries();
    const todayEntries = entries.filter(e => e.diaryDate.startsWith(today));
    
    if (todayEntries.length === 0) {
      setSystemHint('今天还没有日记');
      setTimeout(() => setSystemHint(null), 3000);
      closeSheet();
      return;
    }
    
    const stripHTML = (html: string) => {
      const temp = document.createElement('div');
      temp.innerHTML = html;
      return temp.innerText || temp.textContent || '';
    };
    
    const newAttachments = todayEntries.map((entry, index) => {
      let cleanContent = '';
      if (entry.content.includes('<') && entry.content.includes('>')) {
        cleanContent = stripHTML(entry.content);
      } else {
        cleanContent = entry.content; // plain text
      }
      
      const nameSuffix = todayEntries.length > 1 ? `-${index + 1}` : '';
      return {
        id: createId(),
        type: 'diary' as const,
        name: `今日日记(${today})${nameSuffix}`,
        content: `【今日日记（${today}）】\n${cleanContent}`
      };
    });
    
    setAttachments(prev => {
      const existingNames = new Set(prev.filter(a => a.type === 'diary').map(a => a.name));
      const toAdd = newAttachments.filter(a => !existingNames.has(a.name));
      return [...prev, ...toAdd];
    });
    
    closeSheet();
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const userText = input.trim();
    setInput('');
    
    const attachmentMarkdown = attachments.map(a => a.content).join('\n\n');
    const finalUserText = attachmentMarkdown 
      ? `${attachmentMarkdown}\n\n---\n【用户的问题/消息】\n${userText}`.trim() 
      : userText;
    
    // For display, only show attachment names and user text
    const displayAttachmentText = attachments.map(a => a.name).join('\n');
    const displayUserText = displayAttachmentText ? `${displayAttachmentText}\n\n${userText}`.trim() : userText;
    
    setAttachments([]);

    if (!isAuthenticated()) {
      setInput('');
      setMessages(prev => [
        ...prev,
        { role: 'user', content: displayUserText, rawText: finalUserText },
        { role: 'assistant', content: '需要登录后才可使用哦。', rawText: '需要登录后才可使用哦。' },
      ]);
      setSystemHint('需要登录后才可使用哦。');
      setTimeout(() => setSystemHint(null), 3000);
      return;
    }

    setIsLoading(true);

    const newUserMsg: ChatMessage = { role: 'user', content: displayUserText, rawText: finalUserText };
    const assistantMsg: ChatMessage & { isStreaming?: boolean } = { role: 'assistant', content: '', isStreaming: true };
    
    setMessages(prev => [...prev, newUserMsg, assistantMsg]);

    // Prepare messages for API
    const apiMessages: ChatMessage[] = [];

    if (attachedContext) {
      apiMessages.push({ role: 'system', content: attachedContext });
      setAttachedContext(null); // Clear after sending once
    }

    // Add previous context (last 10 messages to save tokens)
    const contextMessages = session ? [...session.messages, newUserMsg] : [...messages, newUserMsg];
    apiMessages.push(...contextMessages.slice(-10).map(m => ({ role: m.role, content: m.rawText || m.content })));

    abortControllerRef.current = new AbortController();
    let responseTimedOut = false;
    const requestTimeoutMs = getModelTimeoutMs(selectedModel);
    const timeoutId = window.setTimeout(() => {
      responseTimedOut = true;
      abortControllerRef.current?.abort();
    }, requestTimeoutMs);
    let fullReply = '';

    try {
      await sendToAI(apiMessages, (chunk) => {
        fullReply += chunk;
        setMessages(prev => {
          const newMsgs = [...prev];
          const lastIdx = newMsgs.length - 1;
          if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
            newMsgs[lastIdx] = { 
              ...newMsgs[lastIdx], 
              content: extractAnswer(fullReply),
              rawText: fullReply
            };
          }
          return newMsgs;
        });
      }, abortControllerRef.current.signal, selectedModel);

      const finalContent = extractAnswer(fullReply) || 'AI 没有返回内容，请稍后再试。';

      setMessages(prev => {
        const newMsgs = [...prev];
        const lastIdx = newMsgs.length - 1;
        if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
          newMsgs[lastIdx] = { 
            ...newMsgs[lastIdx], 
            content: finalContent,
            isStreaming: false 
          };
        }
        return newMsgs;
      });

      const finalAssistantMsg: ChatMessage = {
        role: 'assistant',
        content: finalContent,
        rawText: fullReply || finalContent
      };
      
      const now = new Date().toISOString();
      let currentSession = session;
      
      if (!currentSession) {
        currentSession = {
          id: createId(),
          title: userText.substring(0, 15) + (userText.length > 15 ? '...' : ''),
          styleId: currentStyleId,
          messages: [newUserMsg, finalAssistantMsg],
          createdAt: now,
          updatedAt: now,
        };
      } else {
        currentSession = {
          ...currentSession,
          messages: [...currentSession.messages, newUserMsg, finalAssistantMsg],
          updatedAt: now,
        };
      }
      
      setSession(currentSession);
      await diaryService.saveChatSession(currentSession);
      loadHistory();

    } catch (error: any) {
      const partialReply = extractAnswer(fullReply);
      const errorMessage = String(error?.message || '');
      const fallbackContent = responseTimedOut
        ? getTimeoutMessage(selectedModel)
        : error.name === 'AbortError'
          ? (partialReply || '已停止生成。')
          : /未登录|请登录|Unauthorized|HTTP 401|401/.test(errorMessage)
            ? '需要登录后才可使用哦。'
            : 'AI 服务暂时不可用，请稍后再试。';

      if (error.name === 'AbortError') {
        console.log('Chat aborted');
      } else {
        console.error(error);
      }

      setMessages(prev => {
        const newMsgs = [...prev];
        const lastIdx = newMsgs.length - 1;
        if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
          newMsgs[lastIdx] = {
            ...newMsgs[lastIdx],
            content: fallbackContent,
            rawText: fullReply || fallbackContent,
            isStreaming: false,
          };
        }
        return newMsgs;
      });
    } finally {
      window.clearTimeout(timeoutId);
      abortControllerRef.current = null;
      setMessages(prev => {
        const newMsgs = [...prev];
        const lastIdx = newMsgs.length - 1;
        if (lastIdx >= 0 && newMsgs[lastIdx].role === 'assistant') {
          newMsgs[lastIdx] = { ...newMsgs[lastIdx], isStreaming: false };
        }
        return newMsgs;
      });
      setIsLoading(false);
    }
  };

  const sendMessage = (text: string) => {
    setInput(text);
    // Use setTimeout to allow state to update before sending
    setTimeout(() => {
      const sendBtn = document.getElementById('ai-send-btn');
      if (sendBtn) sendBtn.click();
    }, 0);
  };

  const groupSessions = (sessions: ChatSession[]) => {
    const pinned = sessions.filter(s => s.pinned);
    const unpinned = sessions.filter(s => !s.pinned);

    const now = new Date();
    const today = now.toDateString();
    const week = new Date(now.getTime() - 7 * 86400000);

    const groups = [
      { label: '置顶', sessions: pinned },
      { label: '今天', sessions: unpinned.filter(s => new Date(s.updatedAt).toDateString() === today) },
      { label: '7 天内', sessions: unpinned.filter(s => {
        const d = new Date(s.updatedAt);
        return d.toDateString() !== today && d > week;
      })},
      { label: '更早', sessions: unpinned.filter(s => new Date(s.updatedAt) <= week) },
    ].filter(g => g.sessions.length > 0);

    return groups;
  };

  const filteredSessions = historySearchKeyword.trim()
    ? historySessions.filter(s =>
        s.title.toLowerCase().includes(historySearchKeyword.toLowerCase())
      )
    : historySessions;

  const groupedSessions = groupSessions(filteredSessions);
  let startX = 0;

  const quickPrompts = [
    '📊 根据我的日记，我最近状态怎么样？',
    '💡 从我的日记看，我擅长什么？有什么特点？',
    '🌱 我最近情绪的变化趋势是什么？',
    '🎯 根据我的日记，给我一些成长建议',
  ];

  return (
    <div 
      className="flex flex-col w-full relative" 
      style={{ 
        height: '100dvh',
        backgroundColor: isDark ? '#1C1C1E' : '#FAF9F5',
        boxSizing: 'border-box'
      }}
      onTouchStart={e => { startX = e.touches[0].clientX; }}
      onTouchEnd={e => {
        const delta = e.changedTouches[0].clientX - startX;
        if (delta > 60 && startX < 40) {
          if (window.history.length > 1) {
            navigate(-1);
          } else {
            navigate('/', { replace: true });
          }
        }
      }}
    >
      {/* AppBar */}
      <header style={{
        height: 'var(--app-total-header-height)',
        display: 'flex',
        alignItems: 'center',
        padding: 'var(--app-safe-top) 20px 0',
        backgroundColor: isDark ? '#1C1C1E' : '#FAF9F5',
        borderBottom: `1px solid ${isDark ? '#3A3A3C' : '#F2F2F7'}`,
        flexShrink: 0,
        zIndex: 10,
        boxSizing: 'border-box',
      }}>
        {/* 宸︿晶锛氬巻鍙插璇濓紙娴嚭鎰熷崱鐗囷級 */}
        <button
          onClick={() => setShowHistory(true)}
          style={{ 
            width: '40px', 
            height: '40px', 
            background: isDark ? '#3A3A3C' : '#FFFFFF',
            borderRadius: '12px',
            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.12)',
            border: 'none',
            display: 'flex',
            alignItems: 'center', 
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <line x1="3" y1="6" x2="21" y2="6"
              stroke={isDark ? '#FFFFFF' : '#1C1C1E'} strokeWidth="2" strokeLinecap="round"/>
            <line x1="3" y1="12" x2="21" y2="12"
              stroke={isDark ? '#FFFFFF' : '#1C1C1E'} strokeWidth="2" strokeLinecap="round"/>
            <line x1="3" y1="18" x2="15" y2="18"
              stroke={isDark ? '#FFFFFF' : '#1C1C1E'} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        {/* 鏍囬鍖哄煙锛堝眳宸︼級 */}
        <div style={{ flex: 1, paddingLeft: 12 }}>
          {/* 绗竴琛岋細App鍚嶇О */}
          <div style={{
            fontSize: 17,
            fontWeight: 700,
            color: isDark ? '#F2F2F7' : '#1C1C1E',
            lineHeight: '1.2',
            fontFamily: 'inherit',
          }}>
            小象日志
          </div>

          {/* 绗簩琛岋細妯″瀷鍚?+ 绠ご锛堢偣鍑诲垏鎹㈡ā鍨嬶級 */}
          <div
            onClick={() => {
              setIsModelSheetMounted(true);
              requestAnimationFrame(() => {
                requestAnimationFrame(() => setIsModelSheetVisible(true));
              });
            }}
            style={{
              fontSize: 12,
              color: isDark ? '#A1A1A6' : '#6E6E73',
              display: 'flex', alignItems: 'center', gap: 2,
              marginTop: 1, cursor: 'pointer',
            }}
          >
            <span>{MODEL_LIST.find(m => m.id === selectedModel)?.label || '选择模型'}</span>
            <span style={{ fontSize: 14, lineHeight: 1 }}>›</span>
          </div>
        </div>

        {/* 鍙充晶锛氭柊寤哄璇濓紙姘旀场+鍔犲彿鍥炬爣锛?*/}
        <button
          onClick={startNewChat}
          style={{ background: 'none', border: 'none', cursor: 'pointer',
            width: '36px', height: '36px', display: 'flex',
            alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z"
              stroke={isDark ? '#F2F2F7' : '#1C1C1E'} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="12" y1="8" x2="12" y2="14"
              stroke={isDark ? '#F2F2F7' : '#1C1C1E'} strokeWidth="2" strokeLinecap="round"/>
            <line x1="9" y1="11" x2="15" y2="11"
              stroke={isDark ? '#F2F2F7' : '#1C1C1E'} strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto relative" style={{ 
        display: 'flex', flexDirection: 'column',
        paddingBottom: `${footerHeight + keyboardInset}px`
      }}>
        {isReadingDiary ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#446733] mb-4"></div>
            <p style={{ fontSize: '14px', color: '#A1A1A6' }}>正在读取你的日记...</p>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <CanvasIcon type={currentStyleId as IconStyle} size={56} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: isDark ? '#F2F2F7' : '#1C1C1E', marginBottom: '8px' }}>
              你好，我是小象
            </h2>
            <p style={{ fontSize: '14px', color: '#A1A1A6', textAlign: 'center', lineHeight: 1.7 }}>
              {STYLE_WELCOMES[currentStyleId]}
            </p>

            <div style={{ width: '100%', marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {STYLE_PROMPTS[currentStyleId].map(p => (
                <button key={p} onClick={() => { setInput(p); setTimeout(handleSend, 0); }} style={{
                  width: '100%',
                  padding: '14px 16px',
                  backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
                  borderRadius: '14px',
                  border: 'none',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: isDark ? '#F2F2F7' : '#1C1C1E',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx}>
                {msg.role === 'user' ? (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 16px' }}>
                    <div style={{
                      maxWidth: '75%',
                      backgroundColor: '#446733',
                      color: '#FFFFFF',
                      borderRadius: '18px 18px 4px 18px',
                      padding: '10px 14px',
                      fontSize: '15px',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '4px 16px' }}>
                    <div style={{
                      width: '32px', height: '32px',
                      borderRadius: '50%',
                      backgroundColor: '#F0F7EB',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <CanvasIcon type={currentStyleId as IconStyle} size={18} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '75%', width: '100%' }}>
                      {msg.isStreaming && !msg.content ? (
                        <div style={{
                          backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
                          borderRadius: '18px 18px 18px 4px',
                          padding: '14px 16px',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          height: '42px',
                        }}>
                          {[0, 1, 2].map(i => (
                            <div key={i} style={{
                              width: '7px',
                              height: '7px',
                              borderRadius: '50%',
                              backgroundColor: '#A1A1A6',
                              animation: `dotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                            }} />
                          ))}
                        </div>
                      ) : (
                        msg.content && (
                          <div style={{
                            backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
                            color: isDark ? '#F2F2F7' : '#1C1C1E',
                            borderRadius: '18px 18px 18px 4px',
                            padding: '14px 16px',
                            fontSize: '15px',
                            lineHeight: '1.6',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                            wordBreak: 'break-word',
                          }}>
                            <div className="markdown-body" style={{ color: 'inherit', fontSize: 'inherit', fontFamily: 'inherit' }}>
                              <Markdown>{msg.content}</Markdown>
                            </div>
                            {msg.isStreaming && (
                              <span style={{
                                display: 'inline-block',
                                width: '2px', height: '14px',
                                backgroundColor: '#446733',
                                marginLeft: '2px',
                                animation: 'blink 1s infinite',
                              }} />
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* System Hint */}
        {systemHint && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
            <div className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2">
              {systemHint}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Input Area */}
      <div 
        ref={footerRef}
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          transform: `translateY(-${keyboardInset}px)`,
          backgroundColor: isDark ? '#1C1C1E' : '#FAF9F5',
          borderTop: `1px solid ${isDark ? '#3A3A3C' : '#F2F2F7'}`,
          paddingBottom: keyboardInset > 0 ? '0px' : 'var(--app-safe-bottom)',
          zIndex: 50,
        }}
      >
        <div style={{
          margin: '12px 16px',
          backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Chips Area */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', padding: '12px 16px 0', overflowX: 'auto' }}>
              {attachments.map(att => (
                <div key={att.id} style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 10px',
                  backgroundColor: isDark ? '#3A3A3C' : '#F2F2F7',
                  borderRadius: '12px',
                  fontSize: '12px',
                  color: isDark ? '#F2F2F7' : '#1C1C1E',
                  whiteSpace: 'nowrap'
                }}>
                  <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{att.name}</span>
                  <button onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} style={{ background: 'none', border: 'none', color: '#A1A1A6', padding: '0 2px', cursor: 'pointer' }}>×</button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="和小象说说话..."
            rows={1}
            style={{
              width: '100%',
              minHeight: '52px',
              maxHeight: '184px',
              border: 'none',
              backgroundColor: 'transparent',
              padding: '15px 16px',
              fontSize: '16px',
              lineHeight: '22px',
              color: isDark ? '#F2F2F7' : '#1C1C1E',
              resize: 'none',
              outline: 'none',
              overflowY: 'auto'
            }}
          />

          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '0 12px 12px 12px',
            gap: '12px',
          }}>
            {/* 鏆傛椂闅愯棌闄勪欢鎸夐挳 
            <button onClick={openSheet} style={{
              width: '32px', height: '32px',
              borderRadius: '50%',
              backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
              border: `1px solid ${isDark ? '#48484A' : '#E5E5EA'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              color: isDark ? '#F2F2F7' : '#1C1C1E',
              cursor: 'pointer'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            */}

            <button
              id="ai-send-btn"
              onClick={isLoading ? handleStop : handleSend}
              disabled={!isLoading && (!input.trim() && attachments.length === 0)}
              style={{
                width: '32px', height: '32px',
                borderRadius: '50%',
                backgroundColor: isLoading ? (isDark ? '#3A3A3C' : '#F2F2F7') : ((input.trim() || attachments.length > 0) ? '#446733' : (isDark ? '#3A3A3C' : '#F2F2F7')),
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                transition: 'background-color 0.2s',
                cursor: 'pointer'
              }}
            >
              {isLoading ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" color={isDark ? '#F2F2F7' : '#1C1C1E'}>
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <line x1="12" y1="19" x2="12" y2="5"
                    stroke={(input.trim() || attachments.length > 0) ? '#FFFFFF' : '#A1A1A6'} strokeWidth="2.5" strokeLinecap="round"/>
                  <polyline points="5 12 12 5 19 12"
                    stroke={(input.trim() || attachments.length > 0) ? '#FFFFFF' : '#A1A1A6'} strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Attachment Bottom Sheet */}
      {isSheetMounted && (
        <div style={{
          position: 'fixed', inset: 0,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          pointerEvents: isSheetVisible ? 'auto' : 'none',
        }}>
          {/* Overlay */}
          <div 
            onClick={closeSheet}
            style={{
              position: 'absolute', inset: 0,
              backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.35)',
              opacity: isSheetVisible ? 1 : 0,
              transition: 'opacity 200ms ease-out',
            }}
          />
          
          {/* Sheet */}
          <div style={{
            position: 'relative',
            backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
            padding: '12px 16px calc(24px + var(--app-safe-bottom))',
            transform: isSheetVisible ? `translateY(-${keyboardInset}px)` : `translateY(100%)`,
            transition: 'transform 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Grabber */}
            <div style={{
              width: '36px', height: '4px',
              borderRadius: '2px',
              backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)',
              margin: '0 auto 20px',
            }} />

            {/* Options Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <SheetOption 
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                }
                label="相册" 
                onClick={handleAddPhoto} 
                isDark={isDark} 
              />
              <SheetOption 
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                  </svg>
                }
                label="文件" 
                onClick={handleAddFile} 
                isDark={isDark} 
              />
              <SheetOption 
                icon={
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                  </svg>
                }
                label="今日日记" 
                onClick={handleAddTodayDiary} 
                isDark={isDark} 
              />
            </div>
          </div>
        </div>
      )}

      {/* History Sidebar */}
      {showHistory && (
        <div
          onClick={() => setShowHistory(false)}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 100,
          }}
        />
      )}

      {/* 渚ц竟鏍?*/}
      <div style={{
        position: 'fixed',
        top: 0, left: 0, bottom: 0,
        width: '75vw',
        maxWidth: '300px',
        backgroundColor: isDark ? '#1C1C1E' : '#FAF9F5',
        zIndex: 101,
        transform: showHistory ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'var(--app-safe-top)',
      }}>

        {/* 渚ц竟鏍忛《閮細鎼滅储妗?*/}
        <div style={{
          padding: '16px 12px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}>
          {/* 鎼滅储妗?*/}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: isDark ? '#3A3A3C' : '#EFEFEF',
            borderRadius: '12px',
            padding: '0 10px',
            height: '36px',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="#A1A1A6" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={historySearchKeyword}
              onChange={e => setHistorySearchKeyword(e.target.value)}
              placeholder="搜索对话..."
              style={{
                flex: 1, border: 'none', background: 'none', outline: 'none',
                fontSize: '14px',
                color: isDark ? '#F2F2F7' : '#1C1C1E',
                fontFamily: 'inherit',
              }}
            />
            {historySearchKeyword && (
              <button
                onClick={() => setHistorySearchKeyword('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                         color: '#A1A1A6', fontSize: 16, padding: 0, lineHeight: 1 }}>
                ×
              </button>
            )}
          </div>
        </div>

        {/* 鏂板缓瀵硅瘽鎸夐挳 */}
        <div style={{ padding: '0 12px 8px' }}>
          <button
            onClick={() => { startNewChat(); setShowHistory(false); }}
            style={{
              width: '100%', height: '40px',
              borderRadius: '10px',
              backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
              border: `1px solid ${isDark ? '#3A3A3C' : '#E5E5EA'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '6px', fontSize: '14px',
              color: isDark ? '#F2F2F7' : '#1C1C1E',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <line x1="12" y1="5" x2="12" y2="19"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="5" y1="12" x2="19" y2="12"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            新建对话
          </button>
        </div>

        {/* 灏忚薄椋庢牸 */}
        <div style={{ padding: '4px 12px 12px', flexShrink: 0 }}>
          {/* 鍒嗙粍鏍囬 */}
          <div style={{
            fontSize: '11px',
            color: isDark ? '#636366' : '#A1A1A6',
            fontWeight: '500',
            letterSpacing: '0.5px',
            padding: '0 4px 8px',
          }}>
            小象风格
          </div>

          <button
            onClick={() => {
              setShowHistory(false);
              openStyleSheet();
            }}
            style={{
              width: '100%',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
              border: `1px solid ${isDark ? '#3A3A3C' : '#E5E5EA'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CanvasIcon type={currentStyle.id as IconStyle} size={18} />
              <span style={{ fontSize: '14px', color: isDark ? '#F2F2F7' : '#1C1C1E', fontWeight: '500' }}>
                {currentStyle.name}
              </span>
            </div>
            <span style={{ fontSize: '13px', color: '#A1A1A6' }}>更改 ›</span>
          </button>
        </div>

        {/* 鍒嗗壊绾?*/}
        <div style={{
          height: '1px',
          backgroundColor: isDark ? '#3A3A3C' : '#F2F2F7',
          margin: '0 12px',
          flexShrink: 0,
        }} />

        {/* 鍘嗗彶鍒楄〃锛堝彲婊氬姩锛?*/}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', overscrollBehavior: 'contain' }}>

          {/* 鎸夋椂闂村垎缁勶細浠婂ぉ / 7澶╁唴 / 鏇存棭 */}
          {groupedSessions.map(group => (
            <div key={group.label}>
              <div style={{
                fontSize: '11px',
                color: isDark ? '#636366' : '#A1A1A6',
                padding: '12px 8px 6px',
                fontWeight: '500',
                letterSpacing: '0.5px',
              }}>
                {group.label}
              </div>

              {group.sessions.map(s => (
                <div key={s.id} style={{ position: 'relative' }}>
                  {editingSessionId === s.id ? (
                    <form onSubmit={handleRenameSession} style={{ padding: '4px 0', marginBottom: '2px' }}>
                      <input
                        autoFocus
                        value={editingTitle}
                        onChange={e => setEditingTitle(e.target.value)}
                        onBlur={handleRenameSession}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          fontSize: '14px',
                          borderRadius: '10px',
                          border: `1px solid ${isDark ? '#3A3A3C' : '#E5E5EA'}`,
                          backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
                          color: isDark ? '#F2F2F7' : '#1C1C1E',
                          outline: 'none',
                        }}
                      />
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        if (pressTimer.current) return;
                        loadSession(s); 
                        setShowHistory(false); 
                      }}
                      onTouchStart={e => handlePressStart(e, s)}
                      onTouchEnd={handlePressEnd}
                      onTouchMove={handlePressEnd}
                      onMouseDown={e => handlePressStart(e, s)}
                      onMouseUp={handlePressEnd}
                      onMouseLeave={handlePressEnd}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        backgroundColor: session?.id === s.id
                          ? (isDark ? '#2C2C2E' : '#F0F7EB')
                          : 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        marginBottom: '2px',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{
                        fontSize: '14px',
                        color: isDark ? '#F2F2F7' : '#1C1C1E',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: 'flex', alignItems: 'center', gap: '6px',
                        flex: 1,
                      }}>
                        {/* 椋庢牸 emoji锛堣嫢鏈夛級 */}
                        {s.styleId && (
                          <div style={{ flexShrink: 0, display: 'flex' }}>
                            <CanvasIcon type={s.styleId as IconStyle} size={14} />
                          </div>
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.title}
                        </span>
                      </div>
                      
                      {s.pinned && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginLeft: '6px' }}>
                          <path d="M12 2L15 8H9L12 2Z" fill={isDark ? '#A1A1A6' : '#6E6E73'} />
                          <path d="M12 22V14" stroke={isDark ? '#A1A1A6' : '#6E6E73'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M5 14H19L15 8H9L5 14Z" stroke={isDark ? '#A1A1A6' : '#6E6E73'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}

          {/* 鎼滅储鏃犵粨鏋滄椂 */}
          {historySearchKeyword && filteredSessions.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '32px 16px',
              color: isDark ? '#636366' : '#A1A1A6', fontSize: '14px',
            }}>
              {`没有找到「${historySearchKeyword}」`}
            </div>
          )}
          {historySessions.length === 0 && !historySearchKeyword && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: isDark ? '#636366' : '#A1A1A6', fontSize: '14px' }}>
              还没有对话记录
            </div>
          )}
        </div>

      </div>

      {/* Model Selection Sheet */}
      {isModelSheetMounted && (
        <div 
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ pointerEvents: isModelSheetVisible ? 'auto' : 'none' }}
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 transition-opacity duration-300"
            style={{ opacity: isModelSheetVisible ? 1 : 0 }}
            onClick={() => {
              setIsModelSheetVisible(false);
              setTimeout(() => setIsModelSheetMounted(false), 300);
            }}
          />
          
          {/* Sheet */}
          <div 
            className="relative bg-surface rounded-t-3xl flex flex-col overflow-hidden transition-transform duration-300"
            style={{ 
              transform: isModelSheetVisible ? 'translateY(0)' : 'translateY(100%)',
              backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
              paddingBottom: 'var(--app-safe-bottom)',
              zIndex: 160
            }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: isDark ? '#3A3A3C' : '#F2F2F7' }}>
              <h3 className="font-headline font-semibold text-lg" style={{ color: isDark ? '#F2F2F7' : '#1C1C1E' }}>选择模型</h3>
              <button 
                onClick={() => {
                  setIsModelSheetVisible(false);
                  setTimeout(() => setIsModelSheetMounted(false), 300);
                }} 
                className="p-2 -mr-2 rounded-full transition-colors"
                style={{ color: isDark ? '#A1A1A6' : '#8E8E93' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            <div className="flex flex-col py-2">
              {MODEL_LIST.map(model => (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModel(model.id);
                    localStorage.setItem('preferred_ai_model', model.id);
                    setIsModelSheetVisible(false);
                    setTimeout(() => setIsModelSheetMounted(false), 300);
                  }}
                  className="flex items-center justify-between px-6 py-4 transition-colors"
                  style={{ backgroundColor: selectedModel === model.id ? (isDark ? 'rgba(68,103,51,0.15)' : 'rgba(68,103,51,0.08)') : 'transparent' }}
                >
                  <span style={{ fontSize: '16px', color: isDark ? '#F2F2F7' : '#1C1C1E', fontWeight: selectedModel === model.id ? 600 : 400 }}>
                    {model.label}
                  </span>
                  {selectedModel === model.id && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17L4 12" stroke="#446733" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 椋庢牸閫夋嫨 Bottom Sheet */}
      {showStyleSheet && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 150,
          display: 'flex', flexDirection: 'column', justifyItems: 'flex-end', justifyContent: 'flex-end',
          pointerEvents: 'auto',
        }}>
          {/* 閬僵 */}
          <div
            onClick={closeStyleSheet}
            style={{
              position: 'absolute', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.4)',
              opacity: styleSheetVisible ? 1 : 0,
              transition: 'opacity 0.25s ease',
            }}
          />

          {/* Sheet */}
          <div style={{
            position: 'relative',
            backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingBottom: 'max(var(--app-safe-bottom), 24px)',
            transform: styleSheetVisible ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}>
            {/* 鎷栨嫿鏉?*/}
            <div style={{
              width: 36, height: 4, borderRadius: 2,
              backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)',
              margin: '12px auto 0',
            }} />

            {/* 鏍囬 */}
            <div style={{
              fontSize: 17, fontWeight: 600, textAlign: 'center',
              color: isDark ? '#F2F2F7' : '#1C1C1E',
              padding: '16px 20px 12px',
            }}>
              选择小象的风格
            </div>

            {/* 椋庢牸鍗＄墖鍒楄〃 */}
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {AI_STYLES.map(style => (
                <div
                  key={style.id}
                  onClick={() => switchStyle(style.id)}
                  style={{
                    borderRadius: 16,
                    border: currentStyleId === style.id
                      ? '2px solid #446733'
                      : `2px solid ${isDark ? '#3A3A3C' : '#F2F2F7'}`,
                    backgroundColor: currentStyleId === style.id
                      ? (isDark ? 'rgba(68,103,51,0.12)' : 'rgba(68,103,51,0.06)')
                      : (isDark ? '#2C2C2E' : '#F7F7F7'),
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', marginBottom: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CanvasIcon type={style.id as IconStyle} size={22} className="shrink-0" />
                      <span style={{
                        fontSize: 15, fontWeight: 600,
                        color: currentStyleId === style.id
                          ? '#446733'
                          : (isDark ? '#F2F2F7' : '#1C1C1E'),
                      }}>
                        {style.name}
                      </span>
                    </div>
                    {currentStyleId === style.id && (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17L4 12"
                          stroke="#446733" strokeWidth="2.5" strokeLinecap="round"/>
                      </svg>
                    )}
                  </div>
                  <div style={{
                    fontSize: 13, color: '#A1A1A6', lineHeight: 1.5,
                  }}>
                    {style.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History item context menu overlay */}
      {activeContextSession && contextMenuPos && !editingSessionId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, WebkitTapHighlightColor: 'transparent' }} onClick={() => setActiveContextSession(null)}>
          <div 
            style={{
              position: 'absolute',
              top: Math.min(contextMenuPos.y, window.innerHeight - 150),
              left: Math.min(contextMenuPos.x, window.innerWidth - 180),
              backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
              borderRadius: '12px',
              padding: '6px',
              minWidth: '160px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              border: `1px solid ${isDark ? '#3A3A3C' : '#E5E5EA'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setEditingSessionId(activeContextSession.id);
                setEditingTitle(activeContextSession.title);
                setActiveContextSession(null);
              }}
              style={{ padding: '12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '14px', borderRadius: '8px', color: isDark ? '#F2F2F7' : '#1C1C1E', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              重命名
            </button>
            <button
              onClick={() => handlePinSession(activeContextSession)}
              style={{ padding: '12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '14px', borderRadius: '8px', color: isDark ? '#F2F2F7' : '#1C1C1E', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L15 8H9L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 22V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 14H19L15 8H9L5 14Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {activeContextSession.pinned ? '取消置顶' : '置顶'}
            </button>
            <button
              onClick={() => handleDeleteSession(activeContextSession)}
              style={{ padding: '12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '14px', borderRadius: '8px', color: '#FF3B30', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              删除
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const SheetOption = ({ icon, label, onClick, isDark }: { icon: React.ReactNode, label: string, onClick: () => void, isDark: boolean }) => {
  const [isActive, setIsActive] = useState(false);
  
  return (
    <button 
      onClick={onClick}
      onTouchStart={() => setIsActive(true)}
      onTouchEnd={() => setIsActive(false)}
      onMouseDown={() => setIsActive(true)}
      onMouseUp={() => setIsActive(false)}
      onMouseLeave={() => setIsActive(false)}
      style={{ 
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', 
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        transform: isActive ? 'scale(0.96)' : 'scale(1)',
        transition: 'transform 0.2s ease',
      }}
    >
      <div style={{ 
        width: '56px', height: '56px', borderRadius: '16px', 
        backgroundColor: isActive ? 'rgba(68,103,51,0.10)' : (isDark ? 'rgba(255,255,255,0.08)' : '#F2F2F7'), 
        display: 'flex', alignItems: 'center', justifyContent: 'center', 
        color: isActive ? '#446733' : (isDark ? '#F2F2F7' : '#1C1C1E'),
        transition: 'background-color 0.2s ease, color 0.2s ease',
      }}>
        {icon}
      </div>
      <span style={{ fontSize: '14px', color: isDark ? '#F2F2F7' : '#1C1C1E' }}>{label}</span>
    </button>
  );
};
