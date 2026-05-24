import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Share, ArrowLeft, Heart, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ImageViewer from '../components/ImageViewer';
import { useKeyboardInset } from '../hooks/useKeyboardInset';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { api } from '../services/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { AppToast } from '../components/AppToast';
import { UserAvatar } from '../components/UserAvatar';
import { SafeImage } from '../components/SafeImage';

const formatTime = (isoString: string) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 30) return `${diffDays}天前`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const formatComments = (rawComments: any[]) => {
  if (!Array.isArray(rawComments)) return [];
  const map = new Map<string, any>();
  const roots: any[] = [];
  
  rawComments.forEach(c => {
    map.set(c.id, {
      ...c,
      fromUser: c.user,
      replies: []
    });
  });

  rawComments.forEach(c => {
    const node = map.get(c.id);
    if (c.parentId) {
      const parent = map.get(c.parentId);
      if (parent) {
        node.toUser = parent.fromUser;
        parent.replies.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  return roots;
};

const flattenComments = (formattedComments: any[]) => {
  const result: any[] = [];
  const visit = (comment: any) => {
    const { replies = [], fromUser, user, ...rest } = comment;
    result.push({
      ...rest,
      user: user || fromUser,
    });
    replies.forEach(visit);
  };
  formattedComments.forEach(visit);
  return result;
};

const mergeFetchedComments = (currentComments: any[], fetchedComments: any[]) => {
  const fetchedFlat = flattenComments(formatComments(fetchedComments));
  const fetchedIds = new Set(fetchedFlat.map(comment => comment.id));
  const localOnly = flattenComments(currentComments).filter(comment => !fetchedIds.has(comment.id));

  return formatComments([...fetchedFlat, ...localOnly]);
};

export default function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const keyboardInset = useKeyboardInset();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [replyTarget, setReplyTarget] = useState<any>(null);
  const [previewGallery, setPreviewGallery] = useState<{ images: string[], index: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'comments' | 'likes'>('comments');

  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const hasRecordedRead = useRef(false);

  const [showFriendRequestSheet, setShowFriendRequestSheet] = useState(false);
  const [friendRequestNote, setFriendRequestNote] = useState('');
  const [currentFriendStatus, setCurrentFriendStatus] = useState<'none' | 'pending' | 'accepted' | 'declined'>('none');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  const { user } = useAuth();

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  useEffect(() => {
    if (!id) return;
    const loadData = async () => {
      try {
        const postData = await api.get(`/community/posts/${id}`);
        setPost(postData);

        // Load comments separately so a failure here doesn't block the post
        try {
          const commentData = await api.get<any[]>(`/community/posts/${id}/comments`);
          if (Array.isArray(commentData)) {
            setComments(formatComments(commentData));
          }
        } catch (commentErr) {
          console.warn('Failed to load comments:', commentErr);
        }

        try {
          const friendsData = await api.get<any[]>('/friends');
          const isFriend = (friendsData || []).some(f => f.id === postData.user.id);
          if (isFriend) setCurrentFriendStatus('accepted');
        } catch {}

      } catch (e) {
        console.error(e);
      }
    };
    loadData();
    
    if (location.search.includes('focus=comments')) {
      setActiveTab('comments');
      setTimeout(() => document.getElementById('comments-section')?.scrollIntoView({ behavior: 'smooth' }), 500);
    } else if (location.search.includes('tab=likes')) {
      setActiveTab('likes');
      setTimeout(() => document.getElementById('comments-section')?.scrollIntoView({ behavior: 'smooth' }), 500);
    }
  }, [id, location.search]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
      const isBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 60;
      if (isBottom && !hasRecordedRead.current && id) {
        hasRecordedRead.current = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [id]);

  const isDark = document.documentElement.classList.contains('dark');

  const openGallery = (idx: number) => {
    setPreviewGallery({ images: post.images, index: idx });
    if (location.hash !== '#preview') navigate('#preview');
  };

  const closeGallery = () => {
    if (location.hash === '#preview') navigate(-1);
    else setPreviewGallery(null);
  };

  useEffect(() => {
    if (location.hash !== '#preview') setPreviewGallery(null);
  }, [location.hash]);

  const togglePostLike = async () => {
    if (!post) return;
    const oldPost = { ...post };
    const newLiked = !post.likedByMe;
    setPost({ 
        ...post, 
        likedByMe: newLiked, 
        likes: Math.max(0, post.likes + (newLiked ? 1 : -1)),
        likedUsers: newLiked 
            ? [{ id: user?.userId, name: user?.nickname, avatar: user?.avatarUrl }, ...(post.likedUsers || [])]
            : (post.likedUsers || []).filter((u:any) => u.id !== user?.userId)
    });
    try {
      await api.post(`/community/posts/${post.id}/like`);
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (message.includes('已经')) {
        setCurrentFriendStatus(message.includes('好友') ? 'accepted' : 'pending');
        setShowFriendRequestSheet(false);
        setFriendRequestNote('');
        showToast(message);
        return;
      }
      setPost(oldPost);
      showToast('点赞失败');
    }
  };

  const toggleCommentLike = async (commentId: string) => {
    const updateCommentLikeState = (list: any[], likedByMe: boolean, likes: number): any[] => {
      return list.map(c => {
        if (c.id === commentId) {
          return { ...c, likedByMe, likes: Math.max(0, likes) };
        }
        if (c.replies) {
          return { ...c, replies: updateCommentLikeState(c.replies, likedByMe, likes) };
        }
        return c;
      });
    };

    const updateCommentLikes = (list: any[]): any[] => {
      return list.map(c => {
        if (c.id === commentId) {
          const liked = !c.likedByMe;
          return { ...c, likedByMe: liked, likes: Math.max(0, c.likes + (liked ? 1 : -1)) };
        }
        if (c.replies) {
          return { ...c, replies: updateCommentLikes(c.replies) };
        }
        return c;
      });
    };
    
    // Find if currently liked to know action
    let currentlyLiked = false;
    const findLike = (list: any[]) => {
      for (const c of list) {
        if (c.id === commentId) currentlyLiked = c.likedByMe;
        if (c.replies) findLike(c.replies);
      }
    };
    findLike(comments);
    
    const previousComments = comments;
    setComments(updateCommentLikes(comments));

    try {
      const result = await api.post<{ likedByMe?: boolean; liked?: boolean; likes: number }>(
        `/community/comments/${commentId}/like`,
        { action: currentlyLiked ? 'unlike' : 'like' }
      );
      setComments(current => updateCommentLikeState(
        current,
        result.likedByMe ?? result.liked ?? false,
        result.likes
      ));
    } catch (e) {
      setComments(previousComments);
    }
  };

  const submitComment = async () => {
    if (!commentInput.trim() || !post) return;
    try {
      const createdComment = await api.post<any>(`/community/posts/${post.id}/comments`, {
        content: commentInput.trim(),
        parentId: replyTarget ? (replyTarget.parentId || replyTarget.id) : undefined // if replying to a reply, attach to its parent
      });
      setCommentInput('');
      setReplyTarget(null);
      setActiveTab('comments');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      setComments(prev => formatComments([...flattenComments(prev), createdComment]));
      setPost(prev => prev ? { ...prev, comments: (prev.comments || 0) + 1 } : prev);

      // Merge the refresh result so a stale cached response cannot hide the freshly posted comment.
      setTimeout(() => {
        api.get<any[]>(`/community/posts/${post.id}/comments?_=${Date.now()}`)
          .then(commentData => {
            if (Array.isArray(commentData)) {
              setComments(current => mergeFetchedComments(current, commentData));
            }
          })
          .catch(console.warn);
      }, 500);

      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch(e) {
      showToast('发送失败');
    }
  };

  const handleAddFriend = () => {
    if (currentFriendStatus === 'accepted') {
      showToast('你们已经是好友了 🎉');
      return;
    }
    if (currentFriendStatus === 'pending') {
      showToast('已发送好友申请，等待对方确认');
      return;
    }
    setShowFriendRequestSheet(true);
  };

  const sendFriendRequest = async () => {
    try {
      const result = await api.post<{ status?: string }>('/friends/request', {
        addresseeId: post.user.id,
        note: friendRequestNote.trim()
      });
      const nextStatus = result?.status === 'accepted' ? 'accepted' : 'pending';
      setCurrentFriendStatus(nextStatus);
      setShowFriendRequestSheet(false);
      setFriendRequestNote('');
      showToast(nextStatus === 'accepted' ? '你们已经是好友了' : '好友申请已发送，等待对方确认');
      return;
      showToast('好友申请已发送 🐘');
    } catch (e) {
      showToast('申请发送失败');
    }
  };

  if (!post) {
    return <div className="min-h-screen bg-surface flex items-center justify-center">加载中...</div>;
  }

  const userName = user?.nickname || '我';
  const isMyPost = post.user.id === user?.userId;

  const focusInput = () => {
    inputRef.current?.focus();
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  };

  return (
    <div className="min-h-screen bg-surface pb-[100px]">
      <style>{`
        @keyframes heartBeat {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
      `}</style>

      <header style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        height: 'var(--app-total-header-height)',
        display: 'flex',
        alignItems: 'center',
        padding: 'var(--app-safe-top) 16px 0',
        backgroundColor: isDark ? 'rgba(28,28,30,0.95)' : 'rgba(250,249,245,0.95)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: isScrolled ? `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` : '1px solid transparent',
        transition: 'border-color 0.25s ease',
        zIndex: 50,
        boxSizing: 'border-box',
      }}>
        {/* 左：返回按钮（始终显示） */}
        <button
          onClick={() => navigate(-1)}
          style={{
            width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12L12 19M5 12L12 5"
              stroke={isDark ? '#F2F2F7' : '#1C1C1E'}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* 中：作者头像 + 昵称（滚动后淡入） */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          paddingLeft: '8px',
          opacity: isScrolled ? 1 : 0,
          transform: isScrolled ? 'translateY(0)' : 'translateY(4px)',
          transition: 'opacity 0.25s ease, transform 0.25s ease',
          pointerEvents: isScrolled ? 'auto' : 'none',
          overflow: 'hidden',
        }}>
          <UserAvatar
            userId={post.user.id}
            src={post.user.avatar}
            name={post.user.name}
            className="w-[30px] h-[30px] rounded-full"
            fallbackClassName="bg-[#E5E5EA] dark:bg-[#3A3A3C] flex items-center justify-center text-[#6E6E73]"
          />
          <span style={{
            fontSize: '15px', fontWeight: '600',
            color: isDark ? '#F2F2F7' : '#1C1C1E',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {post.user.name}
          </span>
        </div>

        {/* 右：添加好友图标按钮（滚动后淡入） */}
        {!isMyPost && (
          <button
            onClick={handleAddFriend}
            style={{
              opacity: isScrolled ? 1 : 0,
              transform: isScrolled ? 'translateY(0)' : 'translateY(4px)',
              transition: 'opacity 0.25s ease, transform 0.25s ease',
              pointerEvents: isScrolled ? 'auto' : 'none',
              width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {/* 根据 currentFriendStatus 渲染不同图标 */}
            {currentFriendStatus === 'accepted' ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                   stroke="#446733" strokeWidth="2" strokeLinecap="round">
                <path d="M20 6L9 17L4 12"/>
              </svg>
            ) : currentFriendStatus === 'pending' ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                   stroke={isDark ? '#A1A1A6' : '#8E8E93'}
                   strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                   stroke={isDark ? '#F2F2F7' : '#1C1C1E'}
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="8" x2="19" y2="14"/>
                <line x1="16" y1="11" x2="22" y2="11"/>
              </svg>
            )}
          </button>
        )}
      </header>

      <main className="px-6 py-4" style={{ paddingTop: 'calc(var(--app-total-header-height) + 16px)' }}>
        {/* Post Content */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-3 items-center">
            <UserAvatar
              userId={post.user.id}
              src={post.user.avatar}
              name={post.user.name}
              className="w-10 h-10 rounded-full"
              fallbackClassName="bg-primary/10 text-primary flex items-center justify-center font-medium"
            />
            <div>
              <div className="font-medium text-[15px] text-on-surface leading-tight">{post.user.name}</div>
              <div className="text-[11px] text-on-surface-variant flex mt-1">
                <span>{post.user.time}</span>
              </div>
            </div>
          </div>
          
          {!isMyPost && (
            <button 
              className="w-10 h-10 flex items-center justify-center rounded-full active:scale-95 transition-transform ml-auto"
              onClick={handleAddFriend}
              style={{ color: currentFriendStatus === 'accepted' ? '#446733' : (currentFriendStatus === 'pending' ? (isDark ? '#A1A1A6' : '#8E8E93') : (isDark ? '#F2F2F7' : '#1C1C1E')) }}
            >
              {currentFriendStatus === 'accepted' ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M20 6L9 17L4 12"/>
                </svg>
              ) : currentFriendStatus === 'pending' ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 6v6l4 2"/>
                </svg>
              ) : (
                <UserPlus className="w-6 h-6" strokeWidth={1.5} />
              )}
            </button>
          )}
        </div>

        <div 
          className={`mb-4 max-w-none ${post.content.includes('<p>') ? 'ProseMirror' : ''} prose prose-headings:font-headline prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-strong:font-medium prose-a:text-primary prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:bg-surface-variant/30 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:rounded-r-lg text-[var(--diary-font-size)] leading-[var(--diary-line-height)] prose-headings:text-on-surface prose-strong:text-on-surface text-on-surface font-sans`}
        >
          <div className="break-words" style={{ fontFamily: 'var(--diary-font-family)' }}>
            <Markdown 
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[rehypeRaw, rehypeSanitize]}
            >
              {post.content}
            </Markdown>
          </div>
        </div>

        {post.images && post.images.length > 0 && (
          <div className={`grid gap-1 mb-4 rounded-xl overflow-hidden ${post.images.length === 1 ? 'grid-cols-1' : post.images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {post.images.map((img: string, idx: number) => (
              <div 
                key={idx} 
                className={`relative cursor-pointer ${post.images.length === 1 ? 'aspect-video' : 'aspect-square'}`}
                onClick={() => openGallery(idx)}
              >
                <SafeImage src={img} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div id="comments-section" className="flex gap-6 mt-6 mb-4 border-b border-outline-variant/10">
          <button 
            className={`pb-2 text-[14px] font-medium transition-colors ${activeTab === 'comments' ? 'text-on-surface border-b-2 border-primary' : 'text-on-surface-variant'}`}
            onClick={() => setActiveTab('comments')}
          >
            评论 {post.comments || comments.length}
          </button>
          <button 
            className={`pb-2 text-[14px] font-medium transition-colors ${activeTab === 'likes' ? 'text-on-surface border-b-2 border-primary' : 'text-on-surface-variant'}`}
            onClick={() => setActiveTab('likes')}
          >
            赞 {post.likes || 0}
          </button>
        </div>

        {/* Comments section */}
        {activeTab === 'comments' && (
          <div className="space-y-2">
            {comments.length === 0 ? (
              <div className="text-center text-on-surface-variant text-[13px] py-10">暂无评论，来抢沙发吧~</div>
            ) : (
              comments.map(comment => (
                <div key={comment.id} style={{ padding: '14px 0', display: 'flex', gap: '10px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%',
                                backgroundColor: isDark ? '#3A3A3C' : '#E5E5EA',
                                flexShrink: 0, display: 'flex',
                                alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <UserAvatar
                      userId={comment.fromUser.id}
                      src={comment.fromUser.avatar}
                      name={comment.fromUser.name}
                      className="w-full h-full rounded-full"
                      fallbackClassName="bg-[#E5E5EA] dark:bg-[#3A3A3C] flex items-center justify-center text-[#6E6E73]"
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                                  alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span onClick={() => { setReplyTarget(comment); focusInput(); }} style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                       color: isDark ? '#F2F2F7' : '#1C1C1E' }}>
                          {comment.fromUser.name}
                        </span>
                        <span style={{ fontSize: 11, color: '#A1A1A6' }}>
                          {formatTime(comment.createdAt)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => toggleCommentLike(comment.id)} style={{
                          display: 'flex', alignItems: 'center', gap: 2,
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: comment.likedByMe ? '#FF3B30' : '#A1A1A6',
                          fontSize: 12,
                        }}>
                          {comment.likedByMe ? '❤️' : '🤍'} {comment.likes || ''}
                        </button>
                      </div>
                    </div>

                    <div onClick={() => { setReplyTarget(comment); focusInput(); }} style={{ cursor: 'pointer', fontSize: 15, color: isDark ? '#E5E5EA' : '#1C1C1E',
                                  lineHeight: 1.6, marginBottom: 8 }}>
                      {comment.content}
                    </div>

                    {comment.replies && comment.replies.length > 0 && (
                      <div style={{ backgroundColor: isDark ? '#2C2C2E' : '#F7F7F7',
                                    borderRadius: 8, padding: '8px 10px' }}>
                        {comment.replies.map(reply => (
                          <div key={reply.id} onClick={() => { setReplyTarget({ ...comment, fromUser: reply.fromUser }); focusInput(); }} style={{ cursor: 'pointer', fontSize: 13,
                                                       color: isDark ? '#D1D1D6' : '#3C3C3E',
                                                       lineHeight: 1.6, marginBottom: 4 }}>
                            <span style={{ fontWeight: 600 }}>{reply.fromUser.name}</span>
                            {' 回复 '}
                            <span style={{ color: '#446733' }}>@{reply.toUser.name}</span>
                            {' '}{reply.content}
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Likes Tab Content */}
        {activeTab === 'likes' && (
          <div className="space-y-4 pt-2">
            {(post.likedUsers || []).map((u: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <div style={{ width: 36, height: 36, borderRadius: '50%',
                              backgroundColor: isDark ? '#3A3A3C' : '#E5E5EA',
                              flexShrink: 0, display: 'flex',
                              alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <UserAvatar
                    userId={u.id}
                    src={u.avatar}
                    name={u.name}
                    className="w-full h-full rounded-full"
                    fallbackClassName="bg-[#E5E5EA] dark:bg-[#3A3A3C] flex items-center justify-center text-[#6E6E73]"
                  />
                </div>
                <span className="text-[15px] text-on-surface font-medium">{u.name}</span>
              </div>
            ))}
            {(post.likedUsers || []).length === 0 && (
              <div className="text-center text-on-surface-variant text-[13px] py-10">还没有人点赞哦</div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Bottom Input Area */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        transform: `translateY(-${keyboardInset}px)`,
        backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
        borderTop: `1px solid ${isDark ? '#3A3A3C' : '#F2F2F7'}`,
        padding: '8px 16px',
        paddingBottom: keyboardInset > 0 ? '8px' : 'max(var(--app-safe-bottom), 8px)',
        display: 'flex', alignItems: 'flex-end', gap: '10px',
        zIndex: 100
      }}>
        {replyTarget && (
          <div style={{
            position: 'absolute', top: -32, left: 0, right: 0,
            backgroundColor: isDark ? '#2C2C2E' : '#F7F7F7',
            padding: '6px 16px',
            fontSize: 12, color: '#6E6E73',
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>回复 <span style={{ color: '#446733' }}>{replyTarget.fromUser.name}</span></span>
            <span onClick={() => setReplyTarget(null)}
                  style={{ color: '#446733', cursor: 'pointer' }}>取消</span>
          </div>
        )}

        <textarea
          ref={inputRef}
          className="no-scrollbar"
          value={commentInput}
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
          onChange={e => {
            setCommentInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          placeholder={replyTarget ? `回复 ${replyTarget.fromUser.name}...` : '发表评论...'}
          rows={1}
          style={{
            flex: 1,
            minHeight: '36px',
            maxHeight: '120px',
            borderRadius: '18px',
            backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7',
            border: 'none',
            padding: '8px 12px',
            fontSize: '15px',
            lineHeight: '20px',
            color: isDark ? '#F2F2F7' : '#1C1C1E',
            outline: 'none',
            resize: 'none',
            overflowY: 'auto',
            fontFamily: 'inherit',
            textAlign: 'justify',
            wordBreak: 'break-all',
          }}
        />

        {!(isInputFocused || commentInput.trim()) && (
          <button
            onClick={togglePostLike}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              flexShrink: 0,
            }}
          >
            <div style={{ animation: post.likedByMe ? 'heartBeat 0.3s ease' : 'none', display: 'flex' }}>
              <Heart
                className="w-[24px] h-[24px]"
                fill={post.likedByMe ? '#FF3B30' : 'transparent'}
                color={post.likedByMe ? '#FF3B30' : '#A1A1A6'}
                strokeWidth={post.likedByMe ? 0 : 2.5}
              />
            </div>
            {post.likes > 0 && (
              <span style={{ 
                position: 'absolute', 
                bottom: '2px', 
                right: '-4px', 
                fontSize: '11px', 
                color: '#A1A1A6', 
                lineHeight: 1,
                fontWeight: 600,
                backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                padding: '0 2px',
                borderRadius: '4px'
              }}>
                {post.likes}
              </span>
            )}
          </button>
        )}

        <button
          onClick={submitComment}
          disabled={!commentInput.trim()}
          style={{
            width: '38px', height: '38px',
            borderRadius: '50%',
            backgroundColor: commentInput.trim() ? '#446733' : (isDark ? '#2C2C2E' : '#F2F2F7'),
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            transition: 'background-color 0.2s ease',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <line x1="12" y1="19" x2="12" y2="5"
              stroke={commentInput.trim() ? '#FFFFFF' : '#A1A1A6'}
              strokeWidth="2.5" strokeLinecap="round"/>
            <polyline points="5 12 12 5 19 12"
              stroke={commentInput.trim() ? '#FFFFFF' : '#A1A1A6'}
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {previewGallery && (
        <ImageViewer
          images={previewGallery.images}
          initialIndex={previewGallery.index}
          onClose={closeGallery}
        />
      )}

      {/* 好友申请 Bottom Sheet */}
      {showFriendRequestSheet && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          pointerEvents: 'auto',
        }}>
          {/* 遮罩 */}
          <div
            onClick={() => setShowFriendRequestSheet(false)}
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
            padding: '20px 20px calc(32px + var(--app-safe-bottom))',
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
              <UserAvatar
                userId={post.user.id}
                src={post.user.avatar}
                name={post.user.name}
                className="w-[44px] h-[44px] rounded-full flex-shrink-0"
                fallbackClassName="bg-[#E5E5EA] dark:bg-[#48484A] flex items-center justify-center text-[#6E6E73]"
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600,
                              color: isDark ? '#F2F2F7' : '#1C1C1E',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {post.user.name}
                </div>
                <div style={{ fontSize: 12, color: '#A1A1A6', marginTop: 2, 
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(post.user as any).bio || post.user.name}
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

      <AppToast message={toastMessage} />
    </div>
  );
}
