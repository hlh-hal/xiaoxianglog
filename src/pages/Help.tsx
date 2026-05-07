import React, { useState } from 'react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronDown, ChevronUp, X, PenTool, Users, Share, Lock, MessageSquare } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const AiIcon = () => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className="w-full h-full text-primary"
  >
    {/* Floating small spark */}
    <path 
      d="M6 3 C6 3.5 6.5 4 7 4 C6.5 4 6 4.5 6 5 C6 4.5 5.5 4 5 4 C5.5 4 6 3.5 6 3 Z" 
      fill="currentColor" 
      stroke="none" 
      className="animate-pulse"
      style={{ animationDelay: '0.8s', animationDuration: '3s' }}
    />
    
    {/* Letter A */}
    <path d="M4 20L9 7L14 20" />
    <path d="M5.5 15.5H12.5" />
    
    {/* Letter i */}
    <path d="M19 20V12" />
    
    {/* Sparkle replacing dot of 'i' */}
    <path 
      d="M19 5 C19 6.5 20 7.5 21.5 7.5 C20 7.5 19 8.5 19 10 C19 8.5 18 7.5 16.5 7.5 C18 7.5 19 6.5 19 5 Z" 
      fill="currentColor" 
      stroke="none" 
      className="animate-pulse" 
      style={{ transformOrigin: '19px 7.5px', animationDuration: '2s' }}
    />
  </svg>
);

const GUIDE_CARDS = [
  {
    icon: <PenTool className="w-8 h-8 text-primary" />,
    title: '如何写日记',
    desc: '模板、主题背景、高级格式',
    content: `1. 点击首页右下角或各处「+」新建日记\n2. 可选用不同的系统模板或自定义保存您的模板\n3. 点击上方调色板可随时更换背景颜色或配图主题\n4. 长按或选中文字可以标记加粗、高亮，或插入标题、引用`,
  },
  {
    icon: <Users className="w-8 h-8 text-primary" />,
    title: '日志圈与互动',
    desc: '分享日常，和大家一起交流',
    content: `1. 在底部导航栏点击「日志圈」进入社区\n2. 社区分为推荐、关注、还能通过顶部日历查看大家那天的发帖\n3. 阅读别人公开的日记，并在底部进行点赞和评论互动\n4. 在收件箱中您会收到新好友、评论、点赞的通知并随时跳转回去`,
  },
  {
    icon: <div className="w-8 h-8"><AiIcon /></div>,
    title: 'AI 小象',
    desc: '你的私人懂你助手',
    content: `1. 点击首页顶部「Ai✨」图标进入小象聊天\n2. 小象能通过与你聊天以及翻阅历史日记来为你提供情感分析或总结\n3. 你可以点击左上角设置随时切换更适合你的大型 AI 模型（如 GPT-4o, DeepSeek 等）\n4. 支持发文件给小象，并在右侧记录你们的长久聊天会话`,
  },
  {
    icon: <Share className="w-8 h-8 text-primary" />,
    title: '导出与分享',
    desc: '保存长图、备份与导入',
    content: `1. 阅读日记时点击右上角分享图标即可「生成分享长图」并保存到相册\n2. 在「设置」中进入「导入导出」，您可以一键打包将全部数据下载为 Markdown 压缩包\n3. 如果您在其他地方有备份或模板，可以在设置页重新将 Zip 包导入回小象库中`,
  },
];

const FAQ_GROUPS = [
  {
    group: '数据与设备保护',
    icon: <Lock className="w-[18px] h-[18px] text-on-surface-variant" />,
    items: [
      {
        q: '我的日记会存到服务器上吗？',
        a: '小象把你所有的日记安全地存在您的设备本地中，绝对不会上传到任何服务器去分析。即使有了账号系统，您的日记文字也仅存放于您的个人设备中。',
      },
      {
        q: '如果不小心卸载了应用或者清除数据怎么办？',
        a: '如果清除网站数据，本地日记会丢失。所以极度建议您在左侧抽屉进入「设置 → 导入导出」定期把您的日记包导出为 Markdown 压缩文件留作物理备份，随时还能导入回来！',
      },
      {
        q: '不小心误删了日记怎么办？',
        a: '进入左侧抽屉的「回收站」能够看到被删掉的日记，您可以重新将其放回主页时间流里；如果您在回收站里点了永久删除，那就找不回来了。',
      },
    ],
  },
  {
    group: '社区交互',
    icon: <MessageSquare className="w-[18px] h-[18px] text-on-surface-variant" />,
    items: [
      {
        q: '我在社区跟别人点赞/评论别人会知道吗？',
        a: '会的，当您在社区帖子留下红心或者足迹评论时，对方会在自己的收件箱或消息提醒里看到您的昵称和这篇日记的互动信息。',
      },
      {
        q: '我的主页点赞榜是什么？',
        a: '进入「我的」页面可查看每月日志排行榜，这会根据收到其他小象用户的点赞数进行排名。快多在日志圈发精美日记吧！',
      },
      {
        q: '为什么有时候戳一戳没反应？',
        a: '「戳一戳」功能会在对方开启了浏览器推送权限，或正打开小象时在界面里发出横幅提示。如果对方关闭推送就看不到了。',
      },
    ],
  },
  {
    group: 'AI 小象',
    icon: <div className="w-[18px] h-[18px] text-on-surface-variant"><AiIcon /></div>,
    items: [
      {
        q: '小象会拿我的日记隐私去训练别的东西吗？',
        a: '绝对不会！当您与小象聊天时，它只是带着当前上下文短期理解您的意思以便当好助手，没有任何厂商会将您的敏感日记用作底层语料长期训练，隐私至上。',
      },
      {
        q: '小象有时候卡很久或者不说话？',
        a: '如果您当前开启了深度思考（如推理模型）模式，小象会在后台做长思维链演化，通常需要 20 秒左右出结果。您也可以在小象会话列表旁的全局选项里切回速度较快的大语言模型。',
      },
    ],
  },
];

export default function Help() {
  const navigate = useNavigate();
  const location = useLocation();
  const { openDrawer } = useOutletContext<any>();
  const { isDark } = useTheme();

  const [activeGuide, setActiveGuide] = useState<typeof GUIDE_CARDS[0] | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('功能异常');
  const [feedbackText, setFeedbackText] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  const submitFeedback = () => {
    if (!feedbackText.trim()) {
      showToast('小象：想听听你的心声，请写点什么吧 🐘');
      return;
    }
    setIsFeedbackOpen(false);
    setFeedbackType('功能异常');
    setFeedbackText('');
    showToast('感谢你的反馈，小象会认真看的 🐘');
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div style={{ 
      fontSize: '13px', color: '#A1A1A6', 
      fontWeight: '500', letterSpacing: '0.5px',
      padding: '0 16px', marginBottom: '12px' 
    }}>
      {children}
    </div>
  );

  return (
    <div 
      className="animate-in fade-in slide-in-from-right-8 duration-300 ease-out"
      style={{
      minHeight: '100vh',
      backgroundColor: isDark ? '#1C1C1E' : '#FAF9F5',
      color: isDark ? '#F2F2F7' : '#1C1C1E',
      fontFamily: 'inherit',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* AppBar */}
      <nav style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        height: '56px',
        paddingTop: 'env(safe-area-inset-top)',
        backgroundColor: isDark ? 'rgba(28, 28, 30, 0.9)' : 'rgba(250, 249, 245, 0.9)',
        backdropFilter: 'blur(10px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`
      }}>
        <button 
          onClick={() => {
            if (location.state?.fromDrawer) {
              sessionStorage.setItem('openDrawerOnNextMount', 'true');
              navigate(-1);
            } else {
              navigate(-1);
            }
          }}
          style={{ padding: '8px', marginLeft: '-8px', border: 'none', background: 'transparent', color: 'inherit' }}
        >
          <ChevronLeft size={24} />
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '17px', fontWeight: '600', marginRight: '24px' }}>
          帮助与反馈
        </div>
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 'calc(56px + env(safe-area-inset-top))', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        
        {/* Module 1: Quick Start */}
        <div style={{ padding: '24px 0' }}>
          <SectionTitle>快速入门</SectionTitle>
          <div style={{
            display: 'flex',
            overflowX: 'auto',
            padding: '0 16px',
            gap: '16px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }} className="no-scrollbar">
            {GUIDE_CARDS.map((card, idx) => (
              <div 
                key={idx}
                onClick={() => setActiveGuide(card)}
                style={{
                  minWidth: '200px',
                  backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
                  borderRadius: '16px',
                  padding: '20px 16px',
                  boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                  flexShrink: 0,
                  cursor: 'pointer'
                }}
              >
                <div style={{ marginBottom: '10px' }}>{card.icon}</div>
                <div style={{ fontSize: '15px', fontWeight: '600', color: isDark ? '#F2F2F7' : '#1C1C1E', marginBottom: '4px' }}>
                  {card.title}
                </div>
                <div style={{ fontSize: '12px', color: '#A1A1A6' }}>{card.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Module 2: FAQ */}
        <div style={{ padding: '0 0 24px' }}>
          <SectionTitle>常见问题</SectionTitle>
          <div style={{ padding: '0 16px' }}>
            <div style={{
              backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
              borderRadius: '16px',
              padding: '8px 16px',
              boxShadow: '0 1px 6px rgba(0,0,0,0.06)'
            }}>
              {FAQ_GROUPS.map((group, gIdx) => (
                <div key={group.group}>
                  <div style={{ fontSize: '13px', color: '#A1A1A6', padding: '16px 0 8px', display: 'flex', gap: '6px' }}>
                    <span>{group.icon}</span>
                    <span>{group.group}</span>
                  </div>
                  {group.items.map((item, iIdx) => {
                    const id = `${gIdx}-${iIdx}`;
                    const isExpanded = expandedFaq === id;
                    return (
                      <div key={iIdx} style={{ borderBottom: (gIdx === FAQ_GROUPS.length - 1 && iIdx === group.items.length - 1) ? 'none' : `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#F2F2F7'}` }}>
                        <div 
                          onClick={() => setExpandedFaq(isExpanded ? null : id)}
                          style={{
                            padding: '16px 0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <div style={{ fontSize: '15px', color: isDark ? '#F2F2F7' : '#1C1C1E', fontWeight: '500' }}>
                            {item.q}
                          </div>
                          <div style={{ color: '#A1A1A6' }}>
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </div>
                        </div>
                        <div style={{
                          height: isExpanded ? 'auto' : 0,
                          overflow: 'hidden',
                          opacity: isExpanded ? 1 : 0,
                          transition: 'all 0.3s ease-in-out'
                        }}>
                          <div style={{
                            padding: '0 0 16px 16px',
                            borderLeft: '2px solid #446733',
                            color: '#8E8E93',
                            fontSize: '14px',
                            lineHeight: 1.7,
                            marginLeft: '4px',
                            marginBottom: '4px'
                          }}>
                            {item.a}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Module 3: Feedback */}
        <div style={{ padding: '0 0 24px' }}>
          <SectionTitle>联系小象</SectionTitle>
          <div 
            onClick={() => setIsFeedbackOpen(true)}
            style={{
              margin: '0 16px',
              backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
              cursor: 'pointer'
          }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: isDark ? '#F2F2F7' : '#1C1C1E', marginBottom: '4px' }}>
                💬 遇到问题？告诉我们
              </div>
              <div style={{ fontSize: '12px', color: '#A1A1A6' }}>
                你的反馈让小象越来越好
              </div>
            </div>
            <div style={{ fontSize: '14px', color: '#446733', fontWeight: '500' }}>
              去反馈 →
            </div>
          </div>
        </div>

        {/* Module 4: About */}
        <div style={{ textAlign: 'center', padding: '32px 16px 48px' }}>
          <div style={{ fontSize: '36px', marginBottom: '8px' }}>🐘</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: isDark ? '#F2F2F7' : '#1C1C1E', marginBottom: '4px' }}>
            小象日志
          </div>
          <div style={{ fontSize: '12px', color: '#A1A1A6', marginBottom: '16px' }}>
            记录生活的美好 · Version 1.0.0
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
            {['用户协议', '隐私政策'].map(item => (
              <span key={item} style={{ fontSize: '12px', color: '#A1A1A6' }}>
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Guide Detail Modal */}
      {activeGuide && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          backgroundColor: isDark ? '#1C1C1E' : '#FAF9F5',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{
            height: '56px', paddingTop: 'env(safe-area-inset-top)',
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 16px'
          }}>
            <button 
              onClick={() => setActiveGuide(null)}
              style={{ padding: '8px', borderRadius: '50%', background: isDark ? '#2C2C2E' : '#F2F2F7', border: 'none', color: isDark ? '#F2F2F7' : '#1C1C1E' }}
            >
              <X size={20} />
            </button>
          </div>
          <div style={{ padding: '32px 24px', flex: 1 }}>
            <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center' }}>
              <div style={{ transform: 'scale(1.8)', transformOrigin: 'left center' }}>{activeGuide.icon}</div>
            </div>
            <div style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>{activeGuide.title}</div>
            <div style={{ fontSize: '14px', color: '#A1A1A6', marginBottom: '32px' }}>{activeGuide.desc}</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {activeGuide.content.split('\n').map((line, idx) => (
                <div key={idx} style={{
                  paddingLeft: '16px',
                  borderLeft: '3px solid #446733',
                  fontSize: '15px',
                  lineHeight: '1.8',
                  color: isDark ? '#E5E5EA' : '#3A3A3C'
                }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Feedback Bottom Sheet */}
      {isFeedbackOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end'
        }} onClick={() => setIsFeedbackOpen(false)}>
          <div 
            style={{
              backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              padding: '24px 24px calc(24px + env(safe-area-inset-bottom))',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '18px', fontWeight: '600' }}>提交反馈</div>
              <button 
                onClick={() => setIsFeedbackOpen(false)}
                style={{ padding: '4px', background: 'transparent', border: 'none', color: '#A1A1A6' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
              {['功能异常', '界面问题', '功能建议', '其他'].map(type => (
                <button
                  key={type}
                  onClick={() => setFeedbackType(type)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    fontSize: '14px',
                    border: `1px solid ${feedbackType === type ? '#446733' : (isDark ? '#3A3A3C' : '#E5E5EA')}`,
                    backgroundColor: feedbackType === type ? 'rgba(68, 103, 51, 0.1)' : 'transparent',
                    color: feedbackType === type ? '#446733' : (isDark ? '#F2F2F7' : '#1C1C1E')
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            <textarea
              placeholder="详细描述一下..."
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              style={{
                width: '100%',
                height: '120px',
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7',
                border: 'none',
                color: isDark ? '#F2F2F7' : '#1C1C1E',
                fontSize: '15px',
                resize: 'none',
                marginBottom: '24px',
                boxSizing: 'border-box'
              }}
            />

            <button
              onClick={submitFeedback}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                backgroundColor: '#446733',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '16px',
                fontWeight: '600'
              }}
            >
              提交反馈
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: isDark ? '#3A3A3C' : '#1C1C1E',
          color: '#FFFFFF',
          padding: '12px 24px',
          borderRadius: '24px',
          fontSize: '14px',
          zIndex: 110,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'fadeIn 0.3s ease'
        }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
