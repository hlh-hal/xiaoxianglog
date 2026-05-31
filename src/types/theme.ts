export interface DiaryTheme {
  id: string
  name: string
  category: 'plain' | 'scene'
  isPro: boolean
  isCustom?: boolean
  // 背景图片 URL（风景主题使用）
  backgroundImage?: string
  // 背景颜色（纯色主题使用，或作为风景主题的 fallback）
  backgroundColor?: string
  // 纸张遮罩层颜色（风景主题使用，用于叠加在图片上）
  paperOverlay?: string
  // 纸张颜色（纯色主题使用）
  paperColor?: string
  // 文字颜色
  textColor: string
  // 次级文字
  secondaryColor: string
  // 工具栏背景
  toolbarColor: string
  // 预览色块（3个颜色）
  previewColors?: [string, string, string]
}

export const allThemes: DiaryTheme[] = [
  {
    id: 'warm-white',
    name: '米白',
    category: 'plain',
    isPro: false,
    backgroundColor: '#FAF9F5',
    textColor: '#1C1C1E',
    secondaryColor: '#6E6E73',
    toolbarColor: 'rgba(250,249,245,0.92)',
  },
  {
    id: 'matcha',
    name: '抹茶',
    category: 'plain',
    isPro: false,
    backgroundColor: '#EFF6EF',
    textColor: '#1A2E1A',
    secondaryColor: '#5A7A5A',
    toolbarColor: 'rgba(239,246,239,0.92)',
  },
  {
    id: 'rose-pink',
    name: '玫瑰',
    category: 'plain',
    isPro: false,
    backgroundColor: '#FDF0F2',
    textColor: '#2E1A1E',
    secondaryColor: '#9A6B72',
    toolbarColor: 'rgba(253,240,242,0.92)',
  },
  {
    id: 'midnight-indigo',
    name: '靛蓝',
    category: 'plain',
    isPro: false,
    backgroundColor: '#26306E',
    textColor: '#E7F3FF',
    secondaryColor: 'rgba(231,243,255,0.72)',
    toolbarColor: 'rgba(38,48,110,0.92)',
  },
  {
    id: 'sys-botanical-paper',
    name: '叶笺',
    category: 'scene',
    isPro: false,
    backgroundImage: '/themes/botanical-paper.png',
    backgroundColor: '#F5F0E8',
    textColor: '#2E2A24',
    secondaryColor: 'rgba(46,42,36,0.68)',
    toolbarColor: 'rgba(245,240,232,0.84)',
    paperOverlay: 'rgba(255,255,255,0.08)',
  },
  {
    id: 'sys-red-tree2',
    name: '红树',
    category: 'scene',
    isPro: false,
    backgroundImage: '/themes/red_tree2.jpg',
    backgroundColor: '#FAF9F5',
    textColor: '#FFFFFF',
    secondaryColor: 'rgba(255,255,255,0.7)',
    toolbarColor: 'transparent',
    paperOverlay: 'rgba(0,0,0,0.1)',
  },
]
