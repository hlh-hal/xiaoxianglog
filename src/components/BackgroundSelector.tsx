import React, { useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { THEME_CONFIG, preloadThemeImages } from '../config/themes';

interface BackgroundSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  selectedId?: string;
  onSelect: (id: string) => void;
}

export default function BackgroundSelector({ isOpen, onClose, selectedId, onSelect }: BackgroundSelectorProps) {
  const [activeTab, setActiveTab] = React.useState<'solid' | 'landscape'>('solid');

  useEffect(() => {
    if (isOpen) {
      preloadThemeImages();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm transition-opacity" onClick={onClose}>
      <div 
        className="bg-surface w-full max-w-md rounded-t-3xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-full duration-300"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-container-high">
          <h3 className="font-headline font-semibold text-lg text-on-surface">主题定制</h3>
          <button onClick={onClose} className="p-2 -mr-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex px-6 py-2 gap-4 border-b border-surface-container-low">
          <button 
            className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'solid' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setActiveTab('solid')}
          >
            简约纯色
          </button>
          <button 
            className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'landscape' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setActiveTab('landscape')}
          >
            精选风景
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-3 gap-4">
            {THEME_CONFIG[activeTab].map((bg) => {
              const isSelected = selectedId === bg.id || (!selectedId && bg.id === 'solid-1');
              return (
                <div 
                  key={bg.id}
                  onClick={() => onSelect(bg.id)}
                  className="relative aspect-[9/16] rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-all duration-300 transform hover:scale-[1.02]"
                  style={{
                    background: bg.type === 'color' ? bg.value : `url(${bg.value}) center/cover no-repeat`
                  }}
                >
                  {/* Subtle overlay for image previews to make text readable and look premium */}
                  {bg.type === 'image' && (
                    <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/40"></div>
                  )}

                  {isSelected && (
                    <div className="absolute inset-0 bg-[#446733]/20 flex items-center justify-center backdrop-blur-[1px]">
                      <Check className="w-8 h-8 text-white drop-shadow-md" />
                    </div>
                  )}
                  
                  {bg.isPremium && (
                    <div className="absolute top-2 left-0 w-full text-center">
                      <span className="text-[10px] text-white/90 font-medium drop-shadow-md tracking-wider">高级版</span>
                    </div>
                  )}

                  {bg.type === 'image' && (
                    <div className="absolute bottom-2 left-0 w-full text-center">
                      <span className="text-[11px] text-white font-medium drop-shadow-md">{bg.name}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
