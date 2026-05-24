import React, { useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { sendBrowserNotification } from '../utils/notify';
import { api } from '../services/apiClient';
import { AppToast } from '../components/AppToast';
import { UserAvatar } from '../components/UserAvatar';

type FriendStatus = 'none' | 'pending' | 'accepted' | 'declined';

export interface Notification {
  id: string;
  type: string;
  sourceUser: {
    id: string;
    nickname: string;
    avatarUrl: string | null;
  };
  content: string | null;
  friendStatus?: FriendStatus;
  post: {
    id: string;
    content: string;
  } | null;
  createdAt: string;
  isRead: boolean;
}

const TABS = [
  { label: '通知', types: ['like', 'comment', 'poke'] },
  { label: '好友申请', types: ['friend_request'] },
];

const getDisplayTitle = (item: Notification): string => {
  const dateStr = item.createdAt;
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}月${day}日的日记`;
};

const typeText = (item: Notification) => {
  const title = getDisplayTitle(item);
  return {
    friend_request: ' 申请添加你为好友',
    like: item.post ? ` 赞了你的日记` : ' 赞了你的日志排行榜',
    comment: ` 评论了你的日记`,
    poke: ' 戳了戳你',
  }[item.type as keyof typeof typeText] || ' 有新互动';
};

const formatTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  const hour = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  if (hour < 24) return `${hour}小时前`;
  if (day < 7) return `${day}天前`;
  return new Date(iso).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};

const getFriendStatus = (userId: string, serverStatus?: FriendStatus): FriendStatus => {
  if (serverStatus) return serverStatus;
  const relations = JSON.parse(localStorage.getItem('xiang_friend_relations') || '{}');
  return relations[userId] || 'none';
};

const setFriendStatus = (userId: string, status: string) => {
  const relations = JSON.parse(localStorage.getItem('xiang_friend_relations') || '{}');
  relations[userId] = status;
  localStorage.setItem('xiang_friend_relations', JSON.stringify(relations));
};

export default function Inbox() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isDark = document.documentElement.classList.contains('dark');

  const notifyUnreadCleared = () => {
    sessionStorage.setItem('xiang_notifications_cleared', '1');
    window.dispatchEvent(new CustomEvent('xiang-notifications-read'));
  };

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const data = await api.get<any[]>('/notifications');
        const formatted = (data || []).map(n => ({
          id: n.id,
          type: n.type,
          sourceUser: {
            id: n.fromUser?.id || '',
            nickname: n.fromUser?.name || '未知',
            avatarUrl: n.fromUser?.avatar || null,
          },
          content: n.content,
          friendStatus: n.friendStatus || undefined,
          post: n.refPostId ? { id: n.refPostId, content: '' } : null,
          createdAt: n.createdAt,
          isRead: n.isRead,
        }));
        setNotifications(formatted);
        
        if (formatted.some(n => !n.isRead)) {
          await api.post('/notifications/read-all');
          setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
          notifyUnreadCleared();
        }
      } catch (e) {
        console.error('Failed to load notifications', e);
      }
    };
    fetchNotifications();

    // On unmount (user navigates away), ensure the cleared flag is set
    // so Profile picks it up immediately on mount
    return () => {
      sessionStorage.setItem('xiang_notifications_cleared', '1');
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const updateNotification = (id: string, updates: Partial<Notification>) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  };

  const acceptFriend = async (item: Notification) => {
    if (!item.sourceUser.id) return;
    try {
      await api.post(`/friends/${item.sourceUser.id}/accept`);
      setFriendStatus(item.sourceUser.id, 'accepted');
      showToast(`已接受 ${item.sourceUser.nickname} 的好友申请 🎉`);
      
      // Update local ui to hide buttons
      updateNotification(item.id, { isRead: true, friendStatus: 'accepted' });
    } catch(e) {
      showToast('接受失败');
    }
  };

  const declineFriend = async (item: Notification) => {
    if (!item.sourceUser.id) return;
    try {
      await api.post(`/friends/${item.sourceUser.id}/decline`);
      setFriendStatus(item.sourceUser.id, 'declined');
      showToast('已拒绝');
      updateNotification(item.id, { isRead: true, friendStatus: 'declined' });
    } catch (e) {
      showToast('操作失败');
    }
  };

  const handleNotificationClick = async (item: Notification) => {
    if (item.type === 'friend_request') return;

    if (!item.isRead) {
      updateNotification(item.id, { isRead: true });
      notifyUnreadCleared();
      api.post(`/notifications/${item.id}/read`).catch(console.error);
    }
    
    // 戳一戳
    if (item.type === 'poke') {
       navigate(`/leaderboard?focusUser=${encodeURIComponent(item.sourceUser.nickname)}`);
       return;
    }

    // 排行榜点赞 (没有 post ID)
    if (item.type === 'like' && !item.post?.id) {
      navigate('/leaderboard');
      return;
    }

    // 日记点赞 / 评论
    let search = '';
    if (item.type === 'comment') {
      search = '?focus=comments';
    } else if (item.type === 'like') {
      search = '?tab=likes';
    }
    
    const targetId = item.post?.id || 'post-001';
    navigate(`/post/${targetId}${search}`);
  };

  const currentFilterTypes = TABS[activeTab].types;
  const filteredList = notifications.filter(n => currentFilterTypes.includes(n.type));

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: isDark ? '#1C1C1E' : '#FAF9F5',
      fontFamily: 'inherit',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* TopAppBar */}
      <div style={{
        height: 'var(--app-total-header-height)',
        paddingTop: 'var(--app-safe-top)',
        backgroundColor: isDark ? 'rgba(28, 28, 30, 0.9)' : 'rgba(250, 249, 245, 0.9)',
        backdropFilter: 'blur(10px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: '8px',
        paddingRight: '16px',
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
        boxSizing: 'border-box'
      }}>
        <button 
          onClick={() => navigate(-1)}
          style={{ padding: '8px', border: 'none', background: 'transparent', color: isDark ? '#F2F2F7' : '#1C1C1E', cursor: 'pointer' }}
        >
          <ChevronLeft size={24} />
        </button>
        <div style={{ fontSize: '17px', fontWeight: '600', color: isDark ? '#F2F2F7' : '#1C1C1E' }}>
          消息
        </div>
        <div style={{ width: '40px' }} /> {/* Empty div to keep title centered */}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        height: '44px',
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
        backgroundColor: isDark ? '#1C1C1E' : '#FAF9F5',
        position: 'sticky',
        top: 'var(--app-total-header-height)',
        zIndex: 40
      }}>
        {TABS.map((tab, idx) => {
          const isActive = activeTab === idx;
          return (
            <div
              key={idx}
              onClick={() => setActiveTab(idx)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? (isDark ? '#F2F2F7' : '#1C1C1E') : '#A1A1A6',
                position: 'relative',
                cursor: 'pointer'
              }}
            >
              {tab.label}
              {isActive && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '24px',
                  height: '3px',
                  backgroundColor: '#446733',
                  borderRadius: '3px 3px 0 0'
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredList.map(item => (
          <div
            key={item.id}
            onClick={() => handleNotificationClick(item)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '16px',
              backgroundColor: item.isRead
                ? 'transparent'
                : (isDark ? 'rgba(68,103,51,0.08)' : 'rgba(68,103,51,0.05)'),
              borderBottom: `1px solid ${isDark ? '#2C2C2E' : '#F2F2F7'}`,
              cursor: item.type !== 'friend_request' ? 'pointer' : 'default'
            }}
          >
            {/* 左侧：头像 + 类型角标 */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {/* 头像 40px 圆形 */}
              <UserAvatar
                userId={item.sourceUser.id}
                src={item.sourceUser.avatarUrl}
                name={item.sourceUser.nickname}
                className="w-[40px] h-[40px] rounded-full"
                fallbackClassName="bg-[#E5E5EA] dark:bg-[#3A3A3C] flex items-center justify-center text-[#6E6E73]"
              />
            </div>

            {/* 中间：通知文字 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Row 1: Username & Time */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, color: isDark ? '#F2F2F7' : '#1C1C1E' }}>
                  {item.sourceUser.nickname}
                </div>
                <div style={{ fontSize: 12, color: '#A1A1A6' }}>
                  {formatTime(item.createdAt)}
                </div>
              </div>

              {/* Row 2: Action (Like/Comment/Poke) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontSize: 14, color: isDark ? '#EBEBF5' : '#1C1C1E' }}>
                {item.type === 'like' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#A1A1A6', fill: '#A1A1A6' }}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>}
                {item.type === 'comment' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#A1A1A6' }}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>}
                {item.type === 'poke' && <span style={{ fontSize: 14 }}>👋</span>}
                {item.type === 'friend_request' && <span style={{ fontSize: 14 }}>👋</span>}
                <span>{item.type === 'friend_request' ? '申请添加你为好友' : String(typeText(item)).trim()}</span>
              </div>

              {/* Row 3: Content Snippet */}
              {item.type === 'comment' && item.content && (
                <div style={{ marginTop: '6px', fontSize: 14, color: isDark ? '#8E8E93' : '#8E8E93', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {item.content}
                </div>
              )}
              {/* For likes, we could display a snippet of the diary if available, currently we just use the diary title in the action text. */}

              {/* 如果有附言，在通知文字下方显示 */}
              {item.type === 'friend_request' && item.content && (
                <div style={{
                  marginTop: 4,
                  fontSize: 13,
                  color: isDark ? '#8E8E93' : '#6E6E73',
                  borderLeft: '2px solid #A1A1A6',
                  paddingLeft: 8,
                  lineHeight: 1.5,
                }}>
                  {item.content}
                </div>
              )}
            </div>

            {/* 右侧：好友申请的操作按钮 / 状态文字 */}
            {item.type === 'friend_request' && (
              <div style={{ flexShrink: 0 }}>
                {!['accepted', 'declined'].includes(getFriendStatus(item.sourceUser.id, item.friendStatus)) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button onClick={e => { e.stopPropagation(); acceptFriend(item); }}
                      style={{
                        padding: '4px 14px', borderRadius: 20,
                        backgroundColor: '#446733', color: '#fff',
                        border: 'none', fontSize: 13, cursor: 'pointer',
                        fontWeight: 500,
                      }}>
                      接受
                    </button>
                    <button onClick={e => { e.stopPropagation(); declineFriend(item); }}
                      style={{
                        padding: '4px 14px', borderRadius: 20,
                        backgroundColor: isDark ? '#3A3A3C' : '#F2F2F7',
                        color: isDark ? '#F2F2F7' : '#1C1C1E',
                        border: 'none', fontSize: 13, cursor: 'pointer',
                      }}>
                      拒绝
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: 13, color: '#A1A1A6', display: 'flex', height: '100%', alignItems: 'center' }}>
                    {getFriendStatus(item.sourceUser.id, item.friendStatus) === 'accepted' ? '已接受' : '已拒绝'}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
        {filteredList.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: '#A1A1A6' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 14 }}>暂时没有新消息</div>
          </div>
        )}
      </div>
      <AppToast message={toastMessage} />
    </div>
  );
}
