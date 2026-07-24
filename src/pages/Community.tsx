import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { BookOpen, Heart, MessageCircle } from 'lucide-react';
import { stripAllMarkdown } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import ImageViewer from '../components/ImageViewer';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/apiClient';
import { UserAvatar } from '../components/UserAvatar';
import { SafeImage } from '../components/SafeImage';

type CommunityTab = 'recommend' | 'friends';

const cachedPostsByTab: Partial<Record<CommunityTab, any[]>> = {};

export default function Community() {
  const [activeTab, setActiveTab] = useState<CommunityTab>('recommend');
  const [previewGallery, setPreviewGallery] = useState<{ images: string[], index: number } | null>(null);
  const [posts, setPosts] = useState<any[]>(cachedPostsByTab.recommend || []);
  const [loading, setLoading] = useState(!cachedPostsByTab.recommend);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const fetchPosts = async (tab: CommunityTab = activeTab, showLoading = !cachedPostsByTab[tab]) => {
    if (showLoading) setLoading(true);
    try {
      const data = await api.get<{posts: any[]}>(`/community/posts?tab=${tab}&_=${Date.now()}`);
      const nextPosts = data.posts || [];
      cachedPostsByTab[tab] = nextPosts;
      if (tab === activeTabRef.current) {
        setPosts(nextPosts);
      }
    } catch (e) {
      console.error('Failed to fetch posts:', e);
    } finally {
      if (tab === activeTabRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const cachedPosts = cachedPostsByTab[activeTab];
    if (cachedPosts) {
      setPosts(cachedPosts);
      setLoading(false);
      fetchPosts(activeTab, false);
    } else {
      setPosts([]);
      fetchPosts(activeTab, true);
    }
  }, [activeTab]);

  useEffect(() => {
    const state = location.state as { createdPost?: any; refreshPosts?: boolean } | null;
    if (!state?.createdPost) return;

    const createdPost = {
      ...state.createdPost,
      user: {
        ...state.createdPost.user,
        time: '刚刚',
      },
      likes: state.createdPost.likes || 0,
      comments: state.createdPost.comments || 0,
      likedByMe: false,
    };

    setPosts(prev => [
      createdPost,
      ...prev.filter(post => post.id !== createdPost.id),
    ]);
    cachedPostsByTab[activeTab] = [
      createdPost,
      ...(cachedPostsByTab[activeTab] || []).filter(post => post.id !== createdPost.id),
    ];
    navigate(location.pathname + location.search, { replace: true, state: null });

    if (state.refreshPosts) {
      setTimeout(() => fetchPosts(activeTab, false), 300);
    }
  }, [location.pathname, location.search, location.state, navigate]);

  useLayoutEffect(() => {
    // Focus scrolling logic similar to original
    const params = new URLSearchParams(location.search);
    const urlFocusId = params.get('focus');
    const storageFocusId = sessionStorage.getItem('last_viewed_community_post');
    const focusId = urlFocusId || storageFocusId;

    if (focusId && posts.length > 0) {
      sessionStorage.removeItem('last_viewed_community_post');
      const el = document.getElementById(focusId);
      if (el) {
        el.scrollIntoView({ behavior: urlFocusId ? 'smooth' : 'instant', block: 'center' });
        if (urlFocusId) {
          const newParams = new URLSearchParams(location.search);
          newParams.delete('focus');
          navigate({ search: newParams.toString() }, { replace: true });
        }
      }
    }
  }, [location.search, navigate, posts]);

  const openGallery = (images: string[], index: number) => {
    setPreviewGallery({ images, index });
    if (location.hash !== '#preview') navigate('#preview');
  };

  const closeGallery = () => {
    if (location.hash === '#preview') navigate(-1);
    else setPreviewGallery(null);
  };

  useEffect(() => {
    if (location.hash !== '#preview') setPreviewGallery(null);
  }, [location.hash]);

  const handleDeletePost = async (postId: string) => {
    try {
      await api.delete(`/community/posts/${postId}`);
      const nextPosts = posts.filter(p => p.id !== postId);
      cachedPostsByTab[activeTab] = nextPosts;
      setPosts(nextPosts);
    } catch (e) {
      console.error('Delete failed', e);
    }
  };

  const togglePostLike = async (postId: string) => {
    // Optimistic update
    const newPosts = [...posts];
    const index = newPosts.findIndex(p => p.id === postId);
    if (index === -1) return;
    
    const post = newPosts[index];
    post.likedByMe = !post.likedByMe;
    post.likes += post.likedByMe ? 1 : -1;
    setPosts(newPosts);
    cachedPostsByTab[activeTab] = newPosts;

    try {
      await api.post(`/community/posts/${postId}/like`);
    } catch (e) {
      // Revert on fail
      const reverted = [...newPosts];
      const p = reverted[index];
      p.likedByMe = !p.likedByMe;
      p.likes += p.likedByMe ? 1 : -1;
      cachedPostsByTab[activeTab] = reverted;
      setPosts(reverted);
    }
  };

  return (
    <div className="app-page-scroll min-h-0 h-full flex-1 overflow-y-auto bg-surface">
      <header className="app-main-fixed-header app-safe-header fixed top-0 z-40 flex justify-between items-center px-6 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-outline" />
          <h1 className="text-xl font-bold tracking-tight text-on-surface font-body">日志圈</h1>
        </div>
      </header>

      <main className="app-content-container !px-2 pt-[calc(var(--app-total-header-height)+12px)] pb-24 sm:!px-4 md:!px-6 md:pb-10">
        <nav className="flex justify-center gap-10 mb-6 sticky top-[var(--app-total-header-height)] z-30 py-2 bg-surface/90 backdrop-blur-md">
          <button 
            onClick={() => setActiveTab('recommend')}
            className={`relative py-2 text-sm font-medium tracking-wide transition-colors ${activeTab === 'recommend' ? 'text-on-surface' : 'text-outline hover:text-on-surface'}`}
          >
            推荐
            {activeTab === 'recommend' && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-primary rounded-full"></span>}
          </button>
          <button 
            onClick={() => setActiveTab('friends')}
            className={`relative py-2 text-sm font-medium tracking-wide transition-colors ${activeTab === 'friends' ? 'text-on-surface' : 'text-outline hover:text-on-surface'}`}
          >
            好友
            {activeTab === 'friends' && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-primary rounded-full"></span>}
          </button>
        </nav>

        <div className="space-y-8">
          {loading ? (
             <div className="text-center py-20 text-outline">加载中...</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-20 text-outline">暂无内容</div>
          ) : (
            posts.map((post) => (
              <article id={post.id} key={post.id} className="bg-surface-container-lowest rounded-2xl p-5 md:p-6 flex flex-col gap-5 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.03)] relative">
                <header className="flex items-start gap-3">
                  <UserAvatar
                    userId={post.user.id}
                    src={post.user.avatar}
                    name={post.user.name}
                    className="w-10 h-10 rounded-full"
                    fallbackClassName="bg-surface-container flex items-center justify-center text-outline font-serif text-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-on-surface font-body truncate">{post.user.name}</h3>
                    {typeof post.user.bio === 'string' && post.user.bio.trim() && (
                      <p className="mt-0.5 text-[12px] leading-4 text-outline/80 line-clamp-1 break-words">
                        {post.user.bio.trim()}
                      </p>
                    )}
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    {user && post.user.id === user.userId && (
                      <button onClick={(e) => { e.stopPropagation(); setPostToDelete(post.id); }} className="text-[14px] text-[#4A6B8C]">
                        删除
                      </button>
                    )}
                    <span className="text-[12px] text-outline/80 tracking-wide font-medium">{post.user.time}</span>
                  </div>
                </header>

                <div className="cursor-pointer active:opacity-70 transition-opacity" onClick={() => { sessionStorage.setItem('last_viewed_community_post', post.id); navigate(`/post/${post.id}`); }}>
                  <p className="text-on-surface leading-relaxed text-[15px] font-light whitespace-pre-wrap line-clamp-7 break-words">
                    {stripAllMarkdown(post.content || '').replace(/\n{3,}/g, '\n\n').trim()}
                  </p>
                </div>

                {post.images && post.images.length > 0 && (
                  <div className={`grid gap-2 ${post.images.length === 1 ? 'grid-cols-1' : post.images.length === 2 ? 'grid-cols-2' : post.images.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {post.images.map((img: string, idx: number) => (
                      <div key={idx} className="aspect-square">
                        <SafeImage src={img} alt="Post image" referrerPolicy="no-referrer" className="w-full h-full object-cover rounded-xl cursor-pointer" onClick={(e) => { e.stopPropagation(); openGallery(post.images, idx); }} />
                      </div>
                    ))}
                  </div>
                )}

                <footer className="flex items-center justify-center gap-16 pt-2 pb-1">
                  <button className="flex items-center gap-1.5 text-outline hover:text-primary transition-colors text-xs" onClick={(e) => { e.stopPropagation(); sessionStorage.setItem('last_viewed_community_post', post.id); navigate(`/post/${post.id}?focus=comments`); }}>
                    <MessageCircle className="w-5 h-5" />
                    <span>{post.comments || 0}</span>
                  </button>
                  <button className="flex items-center gap-1.5 text-outline transition-colors text-xs" onClick={(e) => { e.stopPropagation(); togglePostLike(post.id); }}>
                    <Heart
                      className="w-5 h-5 transition-colors"
                      fill={post.likedByMe ? '#FF3B30' : 'transparent'}
                      color={post.likedByMe ? '#FF3B30' : '#A1A1A6'}
                      strokeWidth={post.likedByMe ? 0 : 2.5}
                    />
                    <span className={post.likedByMe ? 'text-[#FF3B30]' : 'text-[#A1A1A6]'}>{post.likes || 0}</span>
                  </button>
                </footer>
              </article>
            ))
          )}
        </div>
      </main>

      <AnimatePresence>
        {previewGallery && <ImageViewer images={previewGallery.images} initialIndex={previewGallery.index} onClose={closeGallery} />}
      </AnimatePresence>

      <AnimatePresence>
        {postToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/40" onClick={() => setPostToDelete(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-surface relative z-10 w-full max-w-[320px] rounded-3xl p-6 shadow-xl">
              <h3 className="text-[18px] font-bold text-on-surface text-center mb-2">删除分享</h3>
              <p className="text-[15px] text-on-surface-variant text-center mb-6 leading-relaxed">确定要从日志圈删除这篇分享吗？<br/><span className="text-[13px] opacity-80">（这不会删除您的本地日记）</span></p>
              <div className="flex gap-3">
                <button onClick={() => setPostToDelete(null)} className="flex-1 py-3 bg-surface-container-high rounded-xl text-[15px] font-medium text-on-surface active:bg-surface-container-highest transition-colors">取消</button>
                <button onClick={() => { handleDeletePost(postToDelete); setPostToDelete(null); }} className="flex-1 py-3 bg-[#E5484D] text-white rounded-xl text-[15px] font-medium active:opacity-90 transition-opacity">确定删除</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
