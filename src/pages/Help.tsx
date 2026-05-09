import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Download,
  Footprints,
  History,
  Image as ImageIcon,
  Inbox,
  Lock,
  Mail,
  MessageSquare,
  PenTool,
  Search,
  Settings,
  Share,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

const FEEDBACK_EMAIL = '1647810838@qq.com';

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
    <path
      d="M6 3 C6 3.5 6.5 4 7 4 C6.5 4 6 4.5 6 5 C6 4.5 5.5 4 5 4 C5.5 4 6 3.5 6 3 Z"
      fill="currentColor"
      stroke="none"
      className="animate-pulse"
      style={{ animationDelay: '0.8s', animationDuration: '3s' }}
    />
    <path d="M4 20L9 7L14 20" />
    <path d="M5.5 15.5H12.5" />
    <path d="M19 20V12" />
    <path
      d="M19 5 C19 6.5 20 7.5 21.5 7.5 C20 7.5 19 8.5 19 10 C19 8.5 18 7.5 16.5 7.5 C18 7.5 19 6.5 19 5 Z"
      fill="currentColor"
      stroke="none"
      className="animate-pulse"
      style={{ transformOrigin: '19px 7.5px', animationDuration: '2s' }}
    />
  </svg>
);

type HelpSection = {
  id: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  items: string[];
};

type FaqGroup = {
  group: string;
  icon: React.ReactNode;
  items: { q: string; a: string }[];
};

const iconClass = 'w-7 h-7 text-primary';
const smallIconClass = 'w-[18px] h-[18px] text-on-surface-variant';

const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'write',
    icon: <PenTool className={iconClass} />,
    title: '记录与编辑',
    desc: '写日记、模板、图片、主题和历史版本',
    items: [
      '在首页右下角点“+”新建日记，点已有日记可继续编辑。',
      '编辑器支持加粗、高亮、标题、引用、有序/无序列表，也可以插入图片。',
      '右上角菜单可打开“日记模板”，选择系统模板、设为默认模板，或新建自定义模板。',
      '调色盘可切换日记主题背景；主题会随日记保存，新日记会记住上次使用的主题。',
      '开启“退出即保存”后，离开编辑器会自动保存；放弃未保存内容时会移入回收站。',
      '历史版本可恢复之前保存过的内容，恢复前当前内容也会作为新历史记录保留。',
    ],
  },
  {
    id: 'organize',
    icon: <BookOpen className={iconClass} />,
    title: '整理与回顾',
    desc: '列表样式、搜索、置顶、多选、图库和回顾',
    items: [
      '首页顶部月份可打开日历，选择某一天后会跳到最接近的日记。',
      '首页右上角菜单可切换列表样式：时间轴、卡片流、简报、杂志。',
      '长按日记卡片可复制内容、置顶、多选或移入回收站。',
      '搜索入口在首页顶部，可按标题和正文查找日记。',
      '左侧抽屉的“图库”会汇总日记里的图片；点图片可预览并回到原日记。',
      '“漫步”会随机抽取旧日记回顾；“那年今日”可查看一年前、半年前、100 天前或自定义天数前的记录。',
    ],
  },
  {
    id: 'ai',
    icon: <div className="w-7 h-7"><AiIcon /></div>,
    title: 'AI 小象',
    desc: '聊天、日记上下文、风格、模型和会话历史',
    items: [
      '首页顶部“Ai”图标进入 AI 聊天。',
      'AI 小象可结合你的提问和日记上下文，帮你做状态总结、情绪梳理或写作辅助。',
      '聊天页可切换对话风格，例如经典、温柔、傲娇、学者。',
      '模型选择支持当前应用内提供的模型，推理类模型可能等待更久。',
      '会话会保存到历史列表；可搜索、置顶、重命名或删除会话。',
      '需要更少上下文时，可在聊天页关闭读取日记或重新开启新会话。',
    ],
  },
  {
    id: 'community',
    icon: <Share className={iconClass} />,
    title: '日志圈与好友',
    desc: '分享、点赞评论、好友申请和收件箱',
    items: [
      '在日记编辑页点分享，可保存长图，也可分享到日志圈。',
      '日志圈分为推荐和好友动态；点帖子可查看详情、图片、评论和点赞列表。',
      '你可以点赞、发表评论，也可以在评论区回复别人。',
      '查看别人帖子时可发送好友申请，对方会在收件箱处理。',
      '“我的”页可进入收件箱，查看点赞、评论、好友申请等通知。',
      '通知提示和好友申请提示需要在系统或浏览器允许通知权限后才会推送。',
    ],
  },
  {
    id: 'backup',
    icon: <ShieldCheck className={iconClass} />,
    title: '备份与数据安全',
    desc: 'Markdown 导入导出、本地日志、回收站和账号同步',
    items: [
      '设置页的“导入导出”支持导出全部活动日记为 Markdown（.md）文件。',
      '导入备份支持普通导入和智能解析导入；日期不确定时可在确认页手动修改或跳过。',
      'Android App 可在设置页选择 Documents 本地日志文件夹，把日记同步为本地 Markdown 文件。',
      '如果本地索引丢失，可通过“从本地日志文件夹恢复索引”重新找回已授权文件夹里的日志。',
      '删除日记会先进入回收站；回收站内可恢复，永久删除后无法找回。',
      '登录账号后应用会尝试同步日记数据；离线或网络异常时会继续保留本地数据。',
    ],
  },
  {
    id: 'settings',
    icon: <Settings className={iconClass} />,
    title: '设置与反馈',
    desc: '提醒、字体、通知权限、协议和问题反馈',
    items: [
      '设置页可开启每日写日记提醒，并自定义提醒时间。',
      '“自动调整时间”开启后，中午 12 点前写的记录会自动归到前一天。',
      '“日记字体”可调整字体、字号、行高，也可以导入本地字体文件。',
      '消息通知、好友申请提示都依赖系统或浏览器通知权限。',
      '协议条款可在设置页或帮助页底部查看。',
      '遇到问题或有建议，可在帮助页提交反馈；系统会打开邮件应用发送给维护邮箱。',
    ],
  },
];

const FAQ_GROUPS: FaqGroup[] = [
  {
    group: '记录与恢复',
    icon: <Lock className={smallIconClass} />,
    items: [
      {
        q: '误删日记后还能找回来吗？',
        a: '可以先去左侧抽屉的“回收站”查看。回收站里的日记可以恢复；如果执行了永久删除，就无法再从应用内找回。',
      },
      {
        q: '为什么新日记一打开就有模板内容？',
        a: '你可能设置了默认模板。进入编辑器右上角菜单的“日记模板”，可以更换默认模板，或取消当前偏好的自定义模板。',
      },
      {
        q: '列表里找不到某篇日记怎么办？',
        a: '先用首页搜索查标题或正文；如果之前删除过，去回收站看看；如果是日历定位，应用会跳到最接近所选日期的日记。',
      },
    ],
  },
  {
    group: '备份与同步',
    icon: <Download className={smallIconClass} />,
    items: [
      {
        q: '导出的备份是什么格式？',
        a: '当前导出为 Markdown（.md）文件，文件名会带“小象日志备份”和当天日期。导入时也请选择 .md 文件。',
      },
      {
        q: 'Android 的本地日志文件夹有什么用？',
        a: '在 Android App 内授权 Documents 文件夹后，应用会把日记写成可见的 Markdown 文件，并记录附件路径；需要时也能从这个文件夹恢复索引。',
      },
      {
        q: '登录账号后数据还是本地的吗？',
        a: '日记会优先保存在本地；登录后应用会尝试和服务端同步，方便账号数据恢复。网络失败时，本地内容仍会保留。',
      },
    ],
  },
  {
    group: 'AI 与隐私',
    icon: <div className="w-[18px] h-[18px] text-on-surface-variant"><AiIcon /></div>,
    items: [
      {
        q: 'AI 小象为什么有时回复很慢？',
        a: '推理类模型的等待时间会更长，应用也设置了更长超时时间。你可以稍后重试，或切换到响应更快的模型。',
      },
      {
        q: 'AI 会读取我的日记吗？',
        a: '聊天页会构建日记上下文来帮助回答问题。涉及特别私密的内容时，建议先关闭读取日记或新开一段不带上下文的对话。',
      },
      {
        q: '会话历史可以整理吗？',
        a: '可以。打开聊天历史后，可搜索会话，长按会话进行置顶、重命名或删除。',
      },
    ],
  },
  {
    group: '社区与通知',
    icon: <MessageSquare className={smallIconClass} />,
    items: [
      {
        q: '我在日志圈点赞或评论，对方会知道吗？',
        a: '会。点赞、评论和好友申请会进入对方收件箱；如果对方开启了通知权限，也可能收到系统通知。',
      },
      {
        q: '为什么收不到通知？',
        a: '通知需要系统或浏览器权限。请在设置页开启对应开关，并在弹出的权限框里允许通知；如果已拒绝，需要到系统或浏览器设置中重新允许。',
      },
      {
        q: '删除日志圈分享会删掉本地日记吗？',
        a: '不会。删除日志圈帖子只会移除社区分享，不会删除你的本地日记。',
      },
    ],
  },
];

export default function Help() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark } = useTheme();

  const [expandedSection, setExpandedSection] = useState<string>(HELP_SECTIONS[0].id);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('问题反馈');
  const [feedbackText, setFeedbackText] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const c = {
    bg: isDark ? '#1C1C1E' : '#FAF9F5',
    card: isDark ? '#2C2C2E' : '#FFFFFF',
    text: isDark ? '#F2F2F7' : '#1C1C1E',
    secondary: isDark ? '#A1A1A6' : '#6E6E73',
    tertiary: '#A1A1A6',
    border: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    subtle: isDark ? '#3A3A3C' : '#F2F2F7',
    primary: '#446733',
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => setToastMessage(''), 3000);
  };

  const goBack = () => {
    if (location.state?.fromDrawer) {
      sessionStorage.setItem('openDrawerOnNextMount', 'true');
    }
    navigate(-1);
  };

  const submitFeedback = () => {
    const content = feedbackText.trim();
    if (!content) {
      showToast('请先写下你遇到的问题或建议');
      return;
    }

    const subject = feedbackType === '功能建议' ? '小象日志功能建议' : '小象日志问题反馈';
    const body = `反馈类型：${feedbackType}\n\n反馈内容：\n${content}`;
    window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    setIsFeedbackOpen(false);
    setFeedbackType('问题反馈');
    setFeedbackText('');
    window.setTimeout(() => showToast('已打开邮件应用'), 500);
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <div
      style={{
        fontSize: '13px',
        color: c.tertiary,
        fontWeight: 600,
        letterSpacing: '0.5px',
        padding: '0 16px',
        marginBottom: '12px',
      }}
    >
      {children}
    </div>
  );

  return (
    <div
      className="animate-in fade-in slide-in-from-right-8 duration-300 ease-out"
      style={{
        minHeight: '100vh',
        backgroundColor: c.bg,
        color: c.text,
        fontFamily: 'inherit',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '56px',
          paddingTop: 'env(safe-area-inset-top)',
          backgroundColor: isDark ? 'rgba(28, 28, 30, 0.9)' : 'rgba(250, 249, 245, 0.9)',
          backdropFilter: 'blur(10px)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        <button
          onClick={goBack}
          aria-label="返回"
          style={{ padding: '8px', marginLeft: '-8px', border: 'none', background: 'transparent', color: 'inherit' }}
        >
          <ChevronLeft size={24} />
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '17px', fontWeight: 600, marginRight: '24px' }}>
          帮助与反馈
        </div>
      </nav>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingTop: 'calc(56px + env(safe-area-inset-top))',
          paddingBottom: 'calc(32px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ padding: '20px 16px 8px' }}>
          <div
            style={{
              backgroundColor: c.card,
              borderRadius: '18px',
              padding: '18px',
              boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
              border: `1px solid ${c.border}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <BookOpen className="w-5 h-5 text-primary" />
              <span style={{ fontSize: '16px', fontWeight: 700 }}>新版功能指南</span>
            </div>
            <p style={{ margin: 0, color: c.secondary, fontSize: '14px', lineHeight: 1.7 }}>
              这里按当前功能整理了写日记、AI、社区、备份和设置说明。遇到问题也可以直接从本页发送反馈邮件。
            </p>
          </div>
        </div>

        <div style={{ padding: '20px 0 24px' }}>
          <SectionTitle>功能分类</SectionTitle>
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {HELP_SECTIONS.map((section) => {
              const isExpanded = expandedSection === section.id;
              return (
                <div
                  key={section.id}
                  style={{
                    backgroundColor: c.card,
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                    border: `1px solid ${c.border}`,
                  }}
                >
                  <button
                    onClick={() => setExpandedSection(isExpanded ? '' : section.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '16px',
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '14px',
                        backgroundColor: isDark ? 'rgba(68,103,51,0.18)' : 'rgba(68,103,51,0.10)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {section.icon}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{section.title}</span>
                      <span style={{ display: 'block', fontSize: '12px', color: c.tertiary, lineHeight: 1.5 }}>{section.desc}</span>
                    </span>
                    <span style={{ color: c.tertiary }}>{isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
                  </button>

                  <div
                    style={{
                      height: isExpanded ? 'auto' : 0,
                      overflow: 'hidden',
                      opacity: isExpanded ? 1 : 0,
                      transition: 'opacity 0.25s ease',
                    }}
                  >
                    <div style={{ padding: '0 16px 16px 72px' }}>
                      <ol style={{ margin: 0, paddingLeft: '18px', color: c.secondary, fontSize: '14px', lineHeight: 1.75 }}>
                        {section.items.map((item) => (
                          <li key={item} style={{ marginBottom: '8px' }}>{item}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '0 0 24px' }}>
          <SectionTitle>常见问题</SectionTitle>
          <div style={{ padding: '0 16px' }}>
            <div
              style={{
                backgroundColor: c.card,
                borderRadius: '16px',
                padding: '8px 16px',
                boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
                border: `1px solid ${c.border}`,
              }}
            >
              {FAQ_GROUPS.map((group, gIdx) => (
                <div key={group.group}>
                  <div style={{ fontSize: '13px', color: c.tertiary, padding: '16px 0 8px', display: 'flex', gap: '6px' }}>
                    <span>{group.icon}</span>
                    <span>{group.group}</span>
                  </div>
                  {group.items.map((item, iIdx) => {
                    const id = `${gIdx}-${iIdx}`;
                    const isExpanded = expandedFaq === id;
                    const isLast = gIdx === FAQ_GROUPS.length - 1 && iIdx === group.items.length - 1;

                    return (
                      <div key={item.q} style={{ borderBottom: isLast ? 'none' : `1px solid ${c.border}` }}>
                        <button
                          onClick={() => setExpandedFaq(isExpanded ? null : id)}
                          style={{
                            width: '100%',
                            padding: '16px 0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px',
                            cursor: 'pointer',
                            border: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            textAlign: 'left',
                          }}
                        >
                          <span style={{ fontSize: '15px', color: c.text, fontWeight: 600, lineHeight: 1.5 }}>{item.q}</span>
                          <span style={{ color: c.tertiary, flexShrink: 0 }}>
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </span>
                        </button>
                        <div
                          style={{
                            height: isExpanded ? 'auto' : 0,
                            overflow: 'hidden',
                            opacity: isExpanded ? 1 : 0,
                            transition: 'opacity 0.25s ease',
                          }}
                        >
                          <div
                            style={{
                              padding: '0 0 16px 16px',
                              borderLeft: `2px solid ${c.primary}`,
                              color: c.secondary,
                              fontSize: '14px',
                              lineHeight: 1.7,
                              marginLeft: '4px',
                              marginBottom: '4px',
                            }}
                          >
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

        <div style={{ padding: '0 0 24px' }}>
          <SectionTitle>快速入口</SectionTitle>
          <div
            style={{
              margin: '0 16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: '10px',
            }}
          >
            {[
              { label: '搜索', icon: <Search size={18} />, action: () => navigate('/search') },
              { label: '图库', icon: <ImageIcon size={18} />, action: () => navigate('/gallery') },
              { label: '漫步', icon: <Footprints size={18} />, action: () => navigate('/walk') },
              { label: '那年今日', icon: <History size={18} />, action: () => navigate('/on-this-day') },
              { label: '收件箱', icon: <Inbox size={18} />, action: () => navigate('/inbox') },
              { label: '设置', icon: <Settings size={18} />, action: () => navigate('/settings') },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  minHeight: '76px',
                  border: `1px solid ${c.border}`,
                  borderRadius: '14px',
                  backgroundColor: c.card,
                  color: c.text,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
                }}
              >
                <span style={{ color: c.primary, display: 'flex' }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '0 0 24px' }}>
          <SectionTitle>联系维护者</SectionTitle>
          <div
            onClick={() => setIsFeedbackOpen(true)}
            style={{
              margin: '0 16px',
              backgroundColor: c.card,
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
              border: `1px solid ${c.border}`,
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <Mail className="w-6 h-6 text-primary" />
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: c.text, marginBottom: '4px' }}>问题反馈与功能建议</div>
                <div style={{ fontSize: '12px', color: c.tertiary }}>会打开邮件应用发送到 {FEEDBACK_EMAIL}</div>
              </div>
            </div>
            <div style={{ fontSize: '14px', color: c.primary, fontWeight: 600, flexShrink: 0 }}>去反馈</div>
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '28px 16px 20px' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, color: c.text, marginBottom: '4px' }}>小象日志</div>
          <div style={{ fontSize: '12px', color: c.tertiary, marginBottom: '16px' }}>记录生活的美好 · Version 1.0.0</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <button
              onClick={() => navigate('/terms')}
              style={{ fontSize: '12px', color: c.tertiary, border: 'none', background: 'transparent' }}
            >
              用户协议
            </button>
            <button
              onClick={() => navigate('/privacy')}
              style={{ fontSize: '12px', color: c.tertiary, border: 'none', background: 'transparent' }}
            >
              隐私政策
            </button>
          </div>
        </div>
      </div>

      {isFeedbackOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
          onClick={() => setIsFeedbackOpen(false)}
        >
          <div
            style={{
              backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
              borderTopLeftRadius: '24px',
              borderTopRightRadius: '24px',
              padding: '24px 24px calc(24px + env(safe-area-inset-bottom))',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>提交反馈</div>
              <button
                onClick={() => setIsFeedbackOpen(false)}
                aria-label="关闭反馈"
                style={{ padding: '4px', background: 'transparent', border: 'none', color: c.tertiary }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
              {['问题反馈', '界面问题', '功能建议', '其他'].map((type) => (
                <button
                  key={type}
                  onClick={() => setFeedbackType(type)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    fontSize: '14px',
                    border: `1px solid ${feedbackType === type ? c.primary : c.subtle}`,
                    backgroundColor: feedbackType === type ? 'rgba(68, 103, 51, 0.1)' : 'transparent',
                    color: feedbackType === type ? c.primary : c.text,
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            <textarea
              placeholder="请描述你遇到的问题，或写下希望改进的地方..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              style={{
                width: '100%',
                height: '140px',
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: isDark ? '#2C2C2E' : '#F2F2F7',
                border: 'none',
                color: c.text,
                fontSize: '15px',
                resize: 'none',
                marginBottom: '24px',
                boxSizing: 'border-box',
                lineHeight: 1.6,
                outline: 'none',
              }}
            />

            <button
              onClick={submitFeedback}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                backgroundColor: c.primary,
                color: '#FFFFFF',
                border: 'none',
                fontSize: '16px',
                fontWeight: 700,
              }}
            >
              发送反馈邮件
            </button>
          </div>
        </div>
      )}

      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: isDark ? '#3A3A3C' : '#1C1C1E',
            color: '#FFFFFF',
            padding: '12px 24px',
            borderRadius: '24px',
            fontSize: '14px',
            zIndex: 110,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            whiteSpace: 'nowrap',
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
