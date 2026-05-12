import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { settingsService, FontSettings, CustomFont, PRESET_FONTS } from '../services/settingsService';
import { diaryService, StoredFont } from '../services/diaryService';
import { createClientId } from '../utils/id';
import { motion, AnimatePresence } from 'motion/react';

interface FontToolbarProps {
  fontSettings: FontSettings;
  onChange: (settings: FontSettings) => void;
}

export const FontToolbar: React.FC<FontToolbarProps> = ({ fontSettings, onChange }) => {
  const { isDark } = useTheme();
  
  // Custom fonts state
  const [customFonts, setCustomFonts] = useState<StoredFont[]>([]);
  const [activePanel, setActivePanel] = useState<'font' | 'lineHeight' | null>(null);

  // pendingSettings keeps track of changes before they receive "Apply"
  const [pendingSettings, setPendingSettings] = useState<FontSettings>(fontSettings);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newFontLabel, setNewFontLabel] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const toolbarRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadCustomFonts = async () => {
      const fonts = await diaryService.getCustomFonts();
      for (const font of fonts) {
        try {
          const alreadyLoaded = [...document.fonts].some(
            f => f.family === font.fontFamily
          );
          if (!alreadyLoaded) {
            const fontFace = new FontFace(font.fontFamily, font.fileData);
            await fontFace.load();
            document.fonts.add(fontFace);
          }
        } catch (err) {
          console.warn(`字体 ${font.label} 恢复失败`, err);
        }
      }
      setCustomFonts(fonts);
    };
    loadCustomFonts();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (activePanel && toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setActivePanel(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [activePanel]);

  // Sync to local state when external settings change
  useEffect(() => {
    setPendingSettings(fontSettings);
  }, [fontSettings]);

  // Apply preview effects whenever pendingSettings changes
  useEffect(() => {
    settingsService.applyFontSettings(pendingSettings);
  }, [pendingSettings]);

  // Save the latest applied settings so we can revert to them on unmount
  const fontSettingsRef = React.useRef(fontSettings);
  fontSettingsRef.current = fontSettings;

  useEffect(() => {
    return () => {
      // Revert to saved settings on unmount (covers cases where user leaves without saving)
      settingsService.applyFontSettings(fontSettingsRef.current);
    };
  }, []);

  const allFonts = [...PRESET_FONTS, ...customFonts];

  const LINE_HEIGHT_OPTIONS = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7];

  const handleFontFileImport = async (file: File) => {
    // 1. 校验文件类型
    const validTypes = ['.ttf', '.otf', '.woff', '.woff2'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validTypes.includes(ext)) {
      showToast('请选择 TTF、OTF、WOFF 或 WOFF2 格式的字体文件');
      return;
    }

    // 2. 校验文件大小（最大 20MB）
    if (file.size > 20 * 1024 * 1024) {
      showToast('字体文件不能超过 20MB');
      return;
    }

    setIsImporting(true);
    try {
      // 3. 读取文件为 ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // 4. 生成唯一字体名（避免冲突）
      const fontId = createClientId();
      const fontFamilyName = `custom-font-${fontId.slice(0, 8)}`;

      // 5. 使用 FontFace API 动态注册字体
      try {
        const fontFace = new FontFace(fontFamilyName, arrayBuffer);
        await fontFace.load();
        document.fonts.add(fontFace);
      } catch (err) {
        showToast('字体文件无效，加载失败');
        return;
      }

      // 6. 存入 IndexedDB
      const storedFont: StoredFont = {
        id: fontId,
        label: newFontLabel.trim() || file.name.replace(/\.[^.]+$/, ''),
        fontFamily: fontFamilyName,
        fileData: arrayBuffer,
        fileName: file.name,
        fileSize: file.size,
        createdAt: new Date().toISOString(),
      };
      await diaryService.saveCustomFont(storedFont);

      // 7. 更新本地状态
      setCustomFonts(prev => [...prev, storedFont]);
      setNewFontLabel('');
      setShowAddForm(false);
      showToast(`字体「${storedFont.label}」导入成功`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div ref={toolbarRef} className={`flex flex-col border-t ${isDark ? 'border-[#3A3A3C] bg-[#1C1C1E]' : 'border-[#F2F2F7] bg-white'}`} style={{ position: 'relative', zIndex: 10 }}>
      {/* active panel content mapping */}
      <AnimatePresence initial={false}>
        {activePanel && (
          <motion.div
            key="config-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              borderBottom: `1px solid ${isDark ? '#3A3A3C' : '#F2F2F7'}`,
              backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
              overflow: 'hidden', // Add overflow hidden for height animation
            }}
          >
            <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
              {activePanel === 'font' && (
                <div>
              {allFonts.map(font => (
                <div key={font.id} style={{
                  display: 'flex', alignItems: 'center',
                  padding: '14px 20px',
                  backgroundColor: pendingSettings.fontFamily === font.id
                    ? (isDark ? 'rgba(68,103,51,0.1)' : 'rgba(68,103,51,0.06)')
                    : 'transparent',
                  cursor: 'pointer',
                  borderBottom: `1px solid ${isDark ? '#2C2C2E' : '#F7F7F7'}`,
                }}>
                  <div
                    onClick={() => setPendingSettings(prev => ({
                      ...prev, fontFamily: font.id
                    }))}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <span style={{
                      fontSize: 16,
                      fontFamily: font.fontFamily,
                      fontWeight: ('weight' in font) ? font.weight : 400,
                      color: isDark ? '#F2F2F7' : '#1C1C1E',
                    }}>
                      {font.label}
                    </span>
                    {(('isCustom' in font && font.isCustom) || ('fileSize' in font)) && (
                      <span style={{ fontSize: 11, color: '#A1A1A6',
                                     backgroundColor: isDark ? '#3A3A3C' : '#F2F2F7',
                                     padding: '2px 6px', borderRadius: 4 }}>
                        自定义
                      </span>
                    )}
                  </div>

                  {/* Right icon: Checkmark or Delete */}
                  {pendingSettings.fontFamily === font.id ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17L4 12" stroke="#446733" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                  ) : ('fileSize' in font) ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* 文件大小 */}
                      <span style={{ fontSize: 11, color: '#A1A1A6' }}>
                        {((font as StoredFont).fileSize / 1024).toFixed(0)}KB
                      </span>
                      {/* 删除按钮 */}
                      <button
                        onClick={async e => {
                          e.stopPropagation();
                          await diaryService.deleteCustomFont(font.id);
                          setCustomFonts(prev => prev.filter(f => f.id !== font.id));
                          if (pendingSettings.fontFamily === font.fontFamily) {
                            setPendingSettings(prev => ({ ...prev, fontFamily: 'noto-sans' }));
                          }
                          showToast('字体已删除');
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#FF3B30', fontSize: 20, padding: '0 4px',
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}

              <div style={{ padding: '12px 20px' }}>
                {!showAddForm ? (
                  // 导入按钮
                  <button
                    onClick={() => setShowAddForm(true)}
                    style={{
                      width: '100%', height: 48,
                      borderRadius: 12,
                      border: `1.5px dashed ${isDark ? '#48484A' : '#C7C7CC'}`,
                      backgroundColor: 'transparent',
                      color: '#446733', fontSize: 15,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: 8,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                         stroke="#446733" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    导入字体文件
                  </button>
                ) : (
                  // 导入表单
                  <div style={{
                    borderRadius: 12,
                    border: `1px solid ${isDark ? '#3A3A3C' : '#E5E5EA'}`,
                    backgroundColor: isDark ? '#2C2C2E' : '#F7F7F7',
                    padding: '16px',
                    display: 'flex', flexDirection: 'column', gap: 12,
                  }}>
                    {/* 字体显示名称输入 */}
                    <div>
                      <div style={{ fontSize: 12, color: '#A1A1A6', marginBottom: 6 }}>
                        字体名称（可选，不填则使用文件名）
                      </div>
                      <input
                        value={newFontLabel}
                        onChange={e => setNewFontLabel(e.target.value)}
                        placeholder="如：霞鹜文楷"
                        style={{
                          width: '100%', height: 40, borderRadius: 10,
                          border: `1px solid ${isDark ? '#48484A' : '#E5E5EA'}`,
                          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                          padding: '0 12px', fontSize: 14,
                          color: isDark ? '#F2F2F7' : '#1C1C1E',
                          outline: 'none', boxSizing: 'border-box',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>

                    {/* 文件选择区域 */}
                    {isImporting ? (
                      <div style={{
                        height: 80,
                        borderRadius: 10,
                        border: `2px dashed ${isDark ? '#48484A' : '#D1D1D6'}`,
                        backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ color: '#446733', fontSize: 13 }}>
                          正在加载字体...
                        </span>
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.ttf,.otf,.woff,.woff2';
                          input.onchange = async (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) await handleFontFileImport(file);
                          };
                          input.click();
                        }}
                        style={{
                          height: 80,
                          borderRadius: 10,
                          border: `2px dashed ${isDark ? '#48484A' : '#D1D1D6'}`,
                          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                          display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          gap: 6, cursor: 'pointer',
                        }}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                             stroke="#A1A1A6" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="12" y1="18" x2="12" y2="12"/>
                          <line x1="9" y1="15" x2="15" y2="15"/>
                        </svg>
                        <span style={{ fontSize: 13, color: '#A1A1A6' }}>
                          点击选择字体文件
                        </span>
                        <span style={{ fontSize: 11, color: '#C7C7CC' }}>
                          支持 TTF · OTF · WOFF · WOFF2（最大 20MB）
                        </span>
                      </div>
                    )}

                    {/* 取消按钮 */}
                    <button
                      onClick={() => {
                        setShowAddForm(false);
                        setNewFontLabel('');
                      }}
                      style={{
                        width: '100%', height: 38, borderRadius: 10,
                        border: `1px solid ${isDark ? '#48484A' : '#E5E5EA'}`,
                        backgroundColor: 'transparent',
                        color: isDark ? '#A1A1A6' : '#6E6E73',
                        fontSize: 14, cursor: 'pointer',
                      }}
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activePanel === 'lineHeight' && (
            <div>
              {LINE_HEIGHT_OPTIONS.map(val => (
                <div
                  key={val}
                  onClick={() => setPendingSettings(prev => ({ ...prev, lineHeight: val }))}
                  style={{
                    display: 'flex', alignItems: 'center',
                    gap: 16, padding: '13px 20px',
                    cursor: 'pointer',
                    borderBottom: `1px solid ${isDark ? '#2C2C2E' : '#F7F7F7'}`,
                    backgroundColor: pendingSettings.lineHeight === val
                      ? (isDark ? 'rgba(68,103,51,0.1)' : 'rgba(68,103,51,0.06)')
                      : 'transparent',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: `2px solid ${pendingSettings.lineHeight === val ? '#446733' : '#C7C7CC'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {pendingSettings.lineHeight === val && (
                      <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#446733' }} />
                    )}
                  </div>
                  <span style={{
                    fontSize: 16,
                    color: pendingSettings.lineHeight === val ? '#446733' : (isDark ? '#F2F2F7' : '#1C1C1E'),
                    fontWeight: pendingSettings.lineHeight === val ? 500 : 400,
                  }}>
                    {val.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF', borderTop: `1px solid ${isDark ? '#3A3A3C' : '#F2F2F7'}` }}>
        {[
          { label: '选择字体', panel: 'font' as const },
          { label: '行间距', panel: 'lineHeight' as const },
        ].map(item => (
          <button
            key={item.panel}
            onClick={() => setActivePanel(activePanel === item.panel ? null : item.panel)}
            style={{
              padding: '12px 0',
              fontSize: 15,
              fontWeight: 500,
              color: activePanel === item.panel ? '#446733' : (isDark ? '#F2F2F7' : '#1C1C1E'),
              backgroundColor: activePanel === item.panel
                ? (isDark ? 'rgba(68,103,51,0.12)' : 'rgba(68,103,51,0.06)')
                : 'transparent',
              border: 'none',
              borderBottom: activePanel === item.panel ? '2px solid #446733' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Slider */}
      <div style={{
        display: 'flex', alignItems: 'center',
        gap: 12, padding: '12px 20px',
        backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF'
      }}>
        <span style={{ fontSize: 13, color: '#A1A1A6' }}>小</span>
        <input
          type="range"
          min={13} max={22} step={1}
          value={pendingSettings.fontSize}
          onChange={e => {
            const val = Number(e.target.value);
            setPendingSettings(prev => ({ ...prev, fontSize: val }));
          }}
          style={{
            flex: 1, height: 4,
            accentColor: '#446733',
            cursor: 'pointer',
          }}
        />
        <span style={{ fontSize: 19, color: '#A1A1A6', fontWeight: 600 }}>大</span>
      </div>

      {/* Apply Button */}
      <div style={{
        padding: '12px 16px',
        borderTop: `1px solid ${isDark ? '#3A3A3C' : '#F2F2F7'}`,
        backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}>
        <button
          onClick={() => {
            onChange(pendingSettings);
            setActivePanel(null);
          }}
          style={{
            width: '100%', height: 46, borderRadius: 23,
            backgroundColor: '#446733', color: '#FFFFFF',
            fontSize: 16, fontWeight: 600, border: 'none',
            cursor: 'pointer',
            opacity: JSON.stringify(pendingSettings) === JSON.stringify(fontSettings) ? 0.6 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          应用
        </button>
      </div>
      
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95, x: '-50%' }}
            animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, y: -20, scale: 0.95, x: '-50%' }}
            className="fixed top-20 left-1/2 z-50 pointer-events-none"
          >
            <div className="bg-[#1C1C1E] dark:bg-[#F2F2F7] text-white dark:text-[#1C1C1E] px-6 py-3 rounded-full shadow-lg font-medium text-sm flex items-center gap-2 whitespace-nowrap">
              {toastMsg}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

