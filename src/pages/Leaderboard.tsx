import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, UserPlus, Heart } from 'lucide-react';
import { diaryService } from '../services/diaryService';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { api } from '../services/apiClient';
import { UserAvatar } from '../components/UserAvatar';

interface LeaderboardUser {
  id: string;
  name: string;
  avatar: string | null;
  monthCount: number;
  likes: number;
  isCurrentUser?: boolean;
  likedBy?: string[];
  likedByMe?: boolean;
}

interface User {
  id: string;
  name: string;
  avatar: string | null;
  monthCount: number;
  bio: string;
  friendStatus?: 'none' | 'pending' | 'accepted' | 'declined';
}

const getFriendStatus = (userId: string): 'none' | 'pending' | 'accepted' | 'declined' => {
  const relations = JSON.parse(localStorage.getItem('xiang_friend_relations') || '{}');
  return relations[userId] || 'none';
};

const setFriendStatus = (userId: string, status: string) => {
  const relations = JSON.parse(localStorage.getItem('xiang_friend_relations') || '{}');
  relations[userId] = status;
  localStorage.setItem('xiang_friend_relations', JSON.stringify(relations));
};

const highlightKeyword = (text: string, keyword: string): React.ReactNode => {
  if (!keyword) return text;
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: '#446733', fontWeight: 600 }}>
        {text.slice(idx, idx + keyword.length)}
      </span>
      {text.slice(idx + keyword.length)}
    </>
  );
};

export default function Leaderboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [likesState, setLikesState] = useState<Record<string, boolean>>({});

  const [showSearchPage, setShowSearchPage] = useState(false);
  const [searchPageVisible, setSearchPageVisible] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [friendRequestTarget, setFriendRequestTarget] = useState<User | null>(null);
  const [friendRequestNote, setFriendRequestNote] = useState('');
  const [showRequestSheet, setShowRequestSheet] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus user scroll ref
  const focusRef = useRef<HTMLDivElement>(null);
  const params = new URLSearchParams(location.search);
  const focusUser = params.get('focusUser');

  useEffect(() => {
    if (users.length > 0 && focusUser && focusRef.current) {
      setTimeout(() => {
        focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [users, focusUser]);

  useEffect(() => {
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const data = await api.get<User[]>(`/friends/search?q=${encodeURIComponent(kw)}`);

        const currentUser = JSON.parse(localStorage.getItem('xiang_current_user') || 'null');
        const myId = currentUser?.id || currentUser?.userId || user?.userId;

        const results = (data || []).filter(u => u.id !== myId);
        setSearchResults(results);
      } catch (e) {
        console.error('Search failed', e);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchKeyword, user?.userId]);

  const openSearchPage = () => {
    setShowSearchPage(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setSearchPageVisible(true));
    });
  };

  const closeSearchPage = () => {
    setSearchPageVisible(false);
    setSearchKeyword('');
    setSearchResults([]);
    setTimeout(() => setShowSearchPage(false), 350);
  };

  const openFriendRequestSheet = (user: User) => {
    setFriendRequestTarget(user);
    setShowRequestSheet(true);
  };

  const sendFriendRequest = async () => {
    if (!friendRequestTarget) return;

    try {
      await api.post('/friends/request', {
        addresseeId: friendRequestTarget.id,
        note: friendRequestNote.trim()
      });
      setFriendStatus(friendRequestTarget.id, 'pending');
      setSearchResults(prev => prev.map(item =>
        item.id === friendRequestTarget.id ? { ...item, friendStatus: 'pending' } : item
      ));

      setShowRequestSheet(false);
      setFriendRequestNote('');
      setTimeout(() => showToast(`已向 ${friendRequestTarget.name} 发送好友申请 🐘`), 300);
    } catch(e) {
      showToast('申请发送失败');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await api.get<LeaderboardUser[]>('/leaderboard');
        const allUsers = Array.isArray(data) ? data : [];
        let localMonthCount = 0;
        if (user?.userId) {
          const now = new Date();
          const currentYear = now.getFullYear();
          const currentMonth = now.getMonth();
          const localEntries = await diaryService.getActiveEntries();
          localMonthCount = localEntries.filter(entry => {
            const entryDate = new Date(entry.diaryDate);
            return entryDate.getFullYear() === currentYear && entryDate.getMonth() === currentMonth;
          }).length;
        }

        const normalizedUsers = (allUsers.length > 0 || !user?.userId
          ? allUsers.map(item => item.isCurrentUser
              ? { ...item, monthCount: localMonthCount }
              : item
            )
          : [{
              id: user.userId,
              name: user.nickname || '我',
              avatar: user.avatarUrl || null,
              monthCount: localMonthCount,
              likes: 0,
              isCurrentUser: true,
            }]).sort((a, b) => b.monthCount - a.monthCount);
        setUsers(normalizedUsers);

        const initialLikes: Record<string, boolean> = {};
        normalizedUsers.forEach(u => {
          initialLikes[u.id] = !!u.likedByMe;
        });
        setLikesState(initialLikes);
      } catch (e) {
        console.error('Failed to load leaderboard data', e);
        if (user?.userId) {
          setUsers([{
            id: user.userId,
            name: user.nickname || '我',
            avatar: user.avatarUrl || null,
            monthCount: 0,
            likes: 0,
            isCurrentUser: true,
          }]);
        }
      }
    };

    loadData();
  }, [user]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const handleLike = async (userId: string) => {
    const isCurrentlyLiked = !!likesState[userId];
    const newIsLiked = !isCurrentlyLiked;
    
    // Get current user details to append to likedBy
    const currentUser = users.find(u => u.isCurrentUser);
    const myName = currentUser ? currentUser.name : '我';
    
    setLikesState(prev => ({ ...prev, [userId]: newIsLiked }));
    
    setUsers(currentUsers => 
      currentUsers.map(u => {
        if (u.id === userId) {
          let newLikedBy = u.likedBy ? [...u.likedBy] : [];
          
          if (newIsLiked) {
            if (!newLikedBy.includes(myName)) {
              newLikedBy.push(myName);
            }
          } else {
            newLikedBy = newLikedBy.filter(name => name !== myName);
          }
          
          return { 
            ...u, 
            likes: u.likes + (newIsLiked ? 1 : -1),
            likedBy: newLikedBy,
            likedByMe: newIsLiked
          };
        }
        return u;
      })
    );

    try {
      await api.post(`/leaderboard/${userId}/like`);
    } catch (e) {
      // Revert optimism if failed
      setLikesState(prev => ({ ...prev, [userId]: isCurrentlyLiked }));
      setUsers(currentUsers => 
        currentUsers.map(u => {
          if (u.id === userId) {
            return { 
              ...u, 
              likes: u.likes + (isCurrentlyLiked ? 1 : -1),
              likedByMe: isCurrentlyLiked
            };
          }
          return u;
        })
      );
      showToast('点赞失败');
    }
  };

  const bgColor = isDark ? '#1C1C1E' : '#FAF9F5';
  const cardColor = isDark ? '#2C2C2E' : '#FFFFFF';
  const textColor = isDark ? '#F2F2F7' : '#1C1C1E';
  const dividerColor = isDark ? '#3A3A3C' : '#F2F2F7';

  // Find current user index
  const currentUserIndex = users.findIndex(u => u.isCurrentUser);

  return (
    <div className="min-h-screen font-body flex flex-col relative" style={{ backgroundColor: bgColor, color: textColor }}>
      {/* AppBar */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-14 backdrop-blur-md" style={{ backgroundColor: isDark ? 'rgba(28,28,30,0.8)' : 'rgba(250,249,245,0.8)' }}>
        <button 
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/profile', { replace: true });
            }
          }}
          className="w-10 h-10 flex items-center justify-center rounded-full active:scale-95 transition-transform relative z-10"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        
        <div className="flex flex-col items-center justify-center">
          <h1 className="font-bold text-[17px] leading-tight">日志排行榜</h1>
          <span className="text-[12px] text-[#A1A1A6]">每月1日重新结算</span>
        </div>

        <button 
          onClick={openSearchPage}
          className="w-10 h-10 flex items-center justify-center rounded-full active:scale-95 transition-transform"
        >
          <UserPlus className="w-6 h-6" />
        </button>
      </header>

      {/* List */}
      <div className="flex-1 pb-20">
        {users.map((u, index) => {
          const rank = index + 1;
          const isTop3 = rank <= 3;
          const rankColor = isTop3 ? '#B8860B' : '#A1A1A6';
          const nameColor = textColor;
          const nameWeight = 400;
          const bgHighlight = u.isCurrentUser ? (isDark ? 'rgba(68,103,51,0.15)' : 'rgba(68,103,51,0.06)') : 'transparent';

          const isFocused = u.name === focusUser;
          
          return (
            <React.Fragment key={u.id}>
              <div 
                ref={isFocused ? focusRef : undefined}
                className="flex items-center px-4"
                style={{ 
                  height: '70px', 
                  backgroundColor: bgHighlight
                }}
              >
                {/* Rank */}
                <div 
                  className="w-[28px] text-center flex-shrink-0 mr-3"
                  style={{ 
                    color: rankColor, 
                    fontWeight: isTop3 ? 'bold' : 'normal',
                    fontSize: isTop3 ? '18px' : '16px'
                  }}
                >
                  {rank}
                </div>

                {/* Avatar */}
                <div className="w-[40px] h-[40px] rounded-full flex-shrink-0 mr-3 flex items-center justify-center overflow-hidden" style={{ backgroundColor: isDark ? '#3A3A3C' : '#E5E5EA' }}>
                  {u.avatar ? (
                    <img src={u.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : u.isCurrentUser ? (
                    <span className="text-xl">🐘</span>
                  ) : (
                    <span className="text-sm font-medium text-[#6E6E73]">{u.name.slice(0, 1)}</span>
                  )}
                </div>

                {/* Name */}
                <div className="flex-grow truncate mr-2" style={{ color: nameColor, fontWeight: nameWeight, fontSize: '16px' }}>
                  {u.name}
                </div>

                {/* Right Content */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span style={{ fontSize: '12px', color: '#A1A1A6', minWidth: 28, textAlign: 'right' }}>{u.monthCount} 篇</span>
                  <button 
                    onClick={() => handleLike(u.id)}
                    className="flex flex-col items-center justify-center w-10 h-10 relative active:scale-90 transition-transform"
                    aria-label="点赞"
                  >
                    <Heart 
                      className="w-6 h-6" 
                      fill={likesState[u.id] ? '#FF3B30' : 'transparent'} 
                      color={likesState[u.id] ? '#FF3B30' : '#A1A1A6'} 
                      strokeWidth={likesState[u.id] ? 0 : 2}
                    />
                    {u.likes > 0 && (
                      <span className="absolute -bottom-1 -right-1 text-[10px]" style={{ color: '#FF3B30' }}>
                        {u.likes}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* 点赞者提示条：满贯整行（仅限当前用户展示） */}
              {u.isCurrentUser && u.likedBy && u.likedBy.length > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px 12px 56px',  // 用 padding 取代左右 margin 使其一通到底，总高度一致
                  backgroundColor: isDark ? '#2A2A2C' : '#F4F4F5',
                }}>
                  {/* 灰色心形图标 (微信读书用的是灰色以降低干扰) */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#A1A1A6" style={{ flexShrink: 0 }}>
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                  {/* 点赞者名单文字 */}
                  <span style={{
                    fontSize: '12px',
                    color: isDark ? '#8E8E93' : '#8A8A8E',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {u.likedBy.slice(0, 3).map(n => n).join('、')}
                    {u.likedBy.length > 3
                      ? ` 等 ${u.likedBy.length} 人给你点了赞`
                      : ' 给你点了赞'
                    }
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-auto" style={{ textAlign: 'center', padding: '24px 16px', fontSize: '12px', color: '#A1A1A6' }}>
        添加好友后可参与排行 
        <span 
          onClick={() => navigate('/friends')}
          style={{ color: '#446733', cursor: 'pointer', marginLeft: 4 }}
        >
          管理好友列表
        </span>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[300] px-4 py-2 rounded-lg shadow-lg text-sm text-white bg-black/80 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
          {toastMessage}
        </div>
      )}

      {showSearchPage && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: isDark ? '#1C1C1E' : '#FAF9F5',
          transform: searchPageVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          paddingTop: 'max(env(safe-area-inset-top), 12px)',
        }}>

          {/* 搜索栏 AppBar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 16px 12px',
            flexShrink: 0,
          }}>
            {/* 搜索输入框 */}
            <div style={{
              flex: 1,
              display: 'flex', alignItems: 'center', gap: 8,
              backgroundColor: isDark ? '#2C2C2E' : '#EFEFEF',
              borderRadius: 14, padding: '0 12px', height: 40,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                   stroke="#A1A1A6" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                ref={searchInputRef}
                autoFocus
                value={searchKeyword}
                onChange={e => setSearchKeyword(e.target.value)}
                placeholder="搜索用户昵称..."
                style={{
                  flex: 1, border: 'none', background: 'none', outline: 'none',
                  fontSize: 16, color: isDark ? '#F2F2F7' : '#1C1C1E',
                  fontFamily: 'inherit',
                }}
              />
              {searchKeyword && (
                <button onClick={() => setSearchKeyword('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                           color: '#A1A1A6', fontSize: 18, lineHeight: 1, padding: 0 }}>
                  ×
                </button>
              )}
            </div>

            {/* 取消按钮 */}
            <button onClick={closeSearchPage}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                       fontSize: 15, color: '#446733', fontWeight: 500,
                       flexShrink: 0, padding: '0 4px' }}>
              取消
            </button>
          </div>

          {/* 分割线 */}
          <div style={{ height: 1, backgroundColor: isDark ? '#3A3A3C' : '#F2F2F7' }} />

          {/* 搜索结果列表 */}
          <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>

            {/* 未输入时的提示 */}
            {!searchKeyword.trim() && (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '60px 24px', gap: 12, color: '#A1A1A6',
              }}>
                <div style={{ fontSize: 40 }}>🔍</div>
                <div style={{ fontSize: 14 }}>输入昵称搜索用户</div>
              </div>
            )}

            {/* 有搜索词但无结果 */}
            {searchKeyword.trim() && searchResults.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', padding: '60px 24px', gap: 12, color: '#A1A1A6',
              }}>
                <div style={{ fontSize: 40 }}>😶</div>
                <div style={{ fontSize: 14 }}>没有找到「{searchKeyword}」</div>
              </div>
            )}

            {/* 搜索结果 */}
            {searchResults.map(u => {
              const status = u.friendStatus || getFriendStatus(u.id);
              return (
                <div key={u.id} style={{
                  display: 'flex', alignItems: 'center',
                  padding: '12px 16px', gap: 12,
                }}>
                  {/* 头像 */}
                  <div style={{
                    width: 46, height: 46, borderRadius: '50%',
                    backgroundColor: isDark ? '#3A3A3C' : '#E5E5EA',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, flexShrink: 0, overflow: 'hidden'
                  }}>
                    {u.avatar ? <img src={u.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : '🐘'}
                  </div>

                  {/* 昵称 + 简介 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 15, fontWeight: 500,
                      color: isDark ? '#F2F2F7' : '#1C1C1E',
                    }}>
                      {/* 关键词高亮 */}
                      {highlightKeyword(u.name, searchKeyword)}
                    </div>
                    {u.bio && (
                      <div style={{
                        fontSize: 12, color: '#A1A1A6', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {u.bio}
                      </div>
                    )}
                  </div>

                  {/* 右侧：申请按钮 / 状态 */}
                  {status === 'accepted' ? (
                    <span style={{ fontSize: 13, color: '#446733', fontWeight: 500 }}>
                      已是好友
                    </span>
                  ) : status === 'pending' ? (
                    <span style={{ fontSize: 13, color: '#A1A1A6' }}>
                      已申请
                    </span>
                  ) : (
                    <button
                      onClick={() => openFriendRequestSheet(u)}
                      style={{
                        padding: '6px 16px', borderRadius: 20,
                        backgroundColor: '#446733', color: '#FFFFFF',
                        border: 'none', fontSize: 13, fontWeight: 500,
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      + 申请
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 好友申请 Bottom Sheet */}
      {showRequestSheet && friendRequestTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 210,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          pointerEvents: 'auto',
        }}>
          {/* 遮罩 */}
          <div
            onClick={() => setShowRequestSheet(false)}
            style={{
              position: 'absolute', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.4)',
            }}
          />

          {/* Sheet 内容 */}
          <div style={{
            position: 'relative',
            backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
            borderTopLeftRadius: '20px',
            borderTopRightRadius: '20px',
            padding: '20px 20px calc(32px + env(safe-area-inset-bottom))',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>
            <style>{`
              @keyframes slideUp {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
              }
            `}</style>
            
            {/* 拖拽条 */}
            <div style={{
              width: 36, height: 4, borderRadius: 2,
              backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)',
              margin: '0 auto 20px',
            }} />

            {/* 标题 */}
            <div style={{
              fontSize: 17, fontWeight: 600, textAlign: 'center',
              color: isDark ? '#F2F2F7' : '#1C1C1E',
              marginBottom: 20,
            }}>
              添加好友
            </div>

            {/* 对方信息 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px',
              backgroundColor: isDark ? '#3A3A3C' : '#F7F7F7',
              borderRadius: 12,
              marginBottom: 16,
            }}>
              {friendRequestTarget.avatar ? (
                <img src={friendRequestTarget.avatar} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} alt="" referrerPolicy="no-referrer" />
              ) : (
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  backgroundColor: isDark ? '#48484A' : '#E5E5EA',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, flexShrink: 0,
                }}>🐘</div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600,
                              color: isDark ? '#F2F2F7' : '#1C1C1E',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {friendRequestTarget.name}
                </div>
                <div style={{ fontSize: 12, color: '#A1A1A6', marginTop: 2,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {friendRequestTarget.bio || friendRequestTarget.name}
                </div>
              </div>
            </div>

            {/* 附言输入框 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: '#A1A1A6', marginBottom: 8 }}>
                附言（可选）
              </div>
              <textarea
                value={friendRequestNote}
                onChange={e => {
                  if (e.target.value.length <= 50) setFriendRequestNote(e.target.value);
                }}
                placeholder="打个招呼吧..."
                style={{
                  width: '100%',
                  height: 80,
                  borderRadius: 12,
                  backgroundColor: isDark ? '#3A3A3C' : '#F7F7F7',
                  border: 'none',
                  padding: '10px 14px',
                  fontSize: 15,
                  color: isDark ? '#F2F2F7' : '#1C1C1E',
                  outline: 'none',
                  resize: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ textAlign: 'right', fontSize: 11,
                            color: '#A1A1A6', marginTop: 4 }}>
                {friendRequestNote.length}/50
              </div>
            </div>

            {/* 发送按钮 */}
            <button
              onClick={sendFriendRequest}
              style={{
                width: '100%',
                height: 48,
                borderRadius: 24,
                backgroundColor: '#446733',
                color: '#FFFFFF',
                fontSize: 16,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              发送申请
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
