import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/apiClient';
import { UserAvatar } from '../components/UserAvatar';

interface Friend {
  id: string;
  name: string;
  avatar?: string | null;
  monthCount?: number;
}

export default function FriendList() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { user, loading } = useAuth();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [filteredFriends, setFilteredFriends] = useState<Friend[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const fetchFriends = async () => {
    if (!user?.userId) {
      setFriends([]);
      return;
    }

    try {
      const data = await api.get<any[]>('/friends');
      setFriends((data || []).map(f => ({
        id: f.id,
        name: f.name || 'Unknown',
        avatar: f.avatar,
        monthCount: f.monthCount || 0
      })));
    } catch (e) {
      console.error('Failed to fetch friends:', e);
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!user?.userId) {
      setFriends([]);
      navigate('/login', { replace: true });
      return;
    }

    fetchFriends();
  }, [loading, navigate, user?.userId]);

  useEffect(() => {
    const kw = searchKeyword.trim().toLowerCase();
    setFilteredFriends(
      kw ? friends.filter(f => f.name.toLowerCase().includes(kw)) : friends
    );
  }, [searchKeyword, friends]);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoved = useRef(false);

  const handleTouchStart = (friendId: string) => {
    touchMoved.current = false;
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        setIsSelecting(true);
        setSelectedIds(new Set([friendId]));
        if (navigator.vibrate) navigator.vibrate(40);
      }
    }, 500);
  };

  const handleTouchMove = () => {
    touchMoved.current = true;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const toggleSelect = (friendId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(friendId) ? next.delete(friendId) : next.add(friendId);
      return next;
    });
  };

  const cancelSelect = () => {
    setIsSelecting(false);
    setSelectedIds(new Set());
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;

    const count = selectedIds.size;
    if (!window.confirm(`确定删除 ${count} 位好友吗？`)) return;

    for (const id of selectedIds) {
      try {
        await api.delete(`/friends/${id}`);
      } catch (e) {
        console.error('Delete failed', e);
      }
    }

    setFriends(prev => prev.filter(f => !selectedIds.has(f.id)));
    cancelSelect();
    showToast(`已删除 ${count} 位好友`);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: isDark ? '#1C1C1E' : '#FAF9F5',
      color: isDark ? '#F2F2F7' : '#1C1C1E',
      fontFamily: 'inherit',
      paddingTop: 'var(--app-total-header-height)',
      paddingBottom: 'var(--app-safe-bottom)',
    }}>
      <header className="app-safe-header fixed top-0 left-0 w-full z-50 bg-surface/80 backdrop-blur-xl">
        <div className="flex items-center justify-between w-full h-[var(--app-header-height)] px-4 mx-auto max-w-[800px]">
          <button onClick={isSelecting ? cancelSelect : () => navigate(-1)}
            style={{ width: 36, height: 36, background: 'none', border: 'none',
                     display: 'flex', alignItems: 'center', justifyContent: 'center',
                     cursor: 'pointer', flexShrink: 0 }}>
            {isSelecting ? (
              <span style={{ fontSize: 15, color: '#446733', fontWeight: 500 }}>取消</span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M19 12H5M5 12L12 19M5 12L12 5"
                  stroke={isDark ? '#F2F2F7' : '#1C1C1E'}
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>

          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 600,
                          color: isDark ? '#F2F2F7' : '#1C1C1E' }}>
              {isSelecting ? `已选 ${selectedIds.size} 人` : '好友列表'}
            </div>
            {!isSelecting && (
              <div style={{ fontSize: 12, color: '#A1A1A6', marginTop: 1 }}>
                共 {friends.length} 位好友
              </div>
            )}
          </div>

          {isSelecting ? (
            <button
              onClick={deleteSelected}
              disabled={selectedIds.size === 0}
              style={{
                padding: '6px 12px', borderRadius: 16,
                backgroundColor: selectedIds.size > 0 ? '#FF3B30' : '#E5E5EA',
                color: selectedIds.size > 0 ? '#FFFFFF' : '#A1A1A6',
                border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              }}>
              删除
            </button>
          ) : (
            <button onClick={() => setShowSearch(true)}
              style={{ width: 36, height: 36, background: 'none', border: 'none',
                       display: 'flex', alignItems: 'center', justifyContent: 'center',
                       cursor: 'pointer', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                   stroke={isDark ? '#F2F2F7' : '#1C1C1E'}
                   strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
          )}
        </div>
      </header>

      {showSearch && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          height: 'var(--app-total-header-height)',
          display: 'flex',
          alignItems: 'center',
          padding: 'var(--app-safe-top) 16px 0',
          gap: '10px',
          backgroundColor: isDark ? '#1C1C1E' : '#FAF9F5',
          borderBottom: `1px solid ${isDark ? '#3A3A3C' : '#F2F2F7'}`,
          zIndex: 51,
          boxSizing: 'border-box',
        }}>
          <div style={{
            flex: 1,
            display: 'flex', alignItems: 'center', gap: 8,
            backgroundColor: isDark ? '#2C2C2E' : '#EFEFEF',
            borderRadius: 12, padding: '0 12px', height: 36,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="#A1A1A6" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              autoFocus
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder="搜索好友昵称..."
              style={{
                flex: 1, border: 'none', background: 'none', outline: 'none',
                fontSize: 15, color: isDark ? '#F2F2F7' : '#1C1C1E',
                fontFamily: 'inherit',
              }}
            />
            {searchKeyword && (
              <button onClick={() => setSearchKeyword('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                         color: '#A1A1A6', fontSize: 16, padding: 0, lineHeight: 1 }}>
                ×
              </button>
            )}
          </div>
          <button onClick={() => { setShowSearch(false); setSearchKeyword(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
                     fontSize: 15, color: '#446733', fontWeight: 500, flexShrink: 0 }}>
            取消
          </button>
        </div>
      )}

      <main className="w-full max-w-[800px] mx-auto px-4 mt-2">
        {friends.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '80px 24px', gap: 12,
          }}>
            <div style={{ fontSize: 48 }}>👥</div>
            <div style={{ fontSize: 15, fontWeight: 500,
                          color: isDark ? '#F2F2F7' : '#1C1C1E' }}>
              还没有好友
            </div>
            <div style={{ fontSize: 13, color: '#A1A1A6', textAlign: 'center' }}>
              在日志圈发现感兴趣的日记，点击添加好友吧
            </div>
            <button
              onClick={() => navigate('/community')}
              style={{
                marginTop: 8, padding: '10px 24px', borderRadius: 20,
                backgroundColor: '#446733', color: '#FFFFFF',
                border: 'none', fontSize: 14, cursor: 'pointer',
              }}>
              去日志圈逛逛
            </button>
          </div>
        )}

        {filteredFriends.map(friend => (
          <div
            key={friend.id}
            onTouchStart={() => handleTouchStart(friend.id)}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchMove}
            onClick={() => isSelecting && toggleSelect(friend.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              gap: '12px',
              backgroundColor: isSelecting && selectedIds.has(friend.id)
                ? (isDark ? 'rgba(68,103,51,0.12)' : 'rgba(68,103,51,0.06)')
                : 'transparent',
              transition: 'background-color 0.15s ease',
              cursor: isSelecting ? 'pointer' : 'default',
            }}
          >
            {isSelecting && (
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                border: `2px solid ${selectedIds.has(friend.id) ? '#446733' : '#C7C7CC'}`,
                backgroundColor: selectedIds.has(friend.id) ? '#446733' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.15s ease',
              }}>
                {selectedIds.has(friend.id) && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17L4 12" stroke="white"
                          strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                )}
              </div>
            )}

            <div style={{
              width: 46, height: 46, borderRadius: '50%',
              backgroundColor: isDark ? '#3A3A3C' : '#E5E5EA',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, flexShrink: 0, overflow: 'hidden'
            }}>
              <UserAvatar
                userId={friend.id}
                src={friend.avatar}
                name={friend.name}
                className="w-full h-full rounded-full"
                fallbackClassName="bg-[#E5E5EA] dark:bg-[#3A3A3C] flex items-center justify-center text-[#6E6E73]"
              />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15, fontWeight: 500,
                color: isDark ? '#F2F2F7' : '#1C1C1E',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {friend.name}
              </div>
              <div style={{ fontSize: 12, color: '#A1A1A6', marginTop: 2 }}>
                本月已写 {friend.monthCount} 篇
              </div>
            </div>

            {!isSelecting && (
              <button
                onClick={() => showToast(`已戳一下 ${friend.name} 👋`)}
                style={{
                  width: 34, height: 34,
                  borderRadius: '50%',
                  backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 16 }}>👋</span>
              </button>
            )}
          </div>
        ))}
      </main>

      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: 'max(var(--app-safe-bottom), 24px)',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: isDark ? '#F2F2F7' : '#1C1C1E',
          color: isDark ? '#1C1C1E' : '#F2F2F7',
          padding: '12px 24px',
          borderRadius: 24,
          fontSize: 14,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 9999,
          pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
