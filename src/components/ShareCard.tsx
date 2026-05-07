import React, { forwardRef } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { getThemeById, calculateContrastColor } from '../config/themes';

interface ShareCardProps {
  contentHtml: string;
  images: string[];
  date: Date;
  backgroundId?: string;
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(({ contentHtml, images, date, backgroundId }, ref) => {
  const bgConfig = getThemeById(backgroundId);
  const contrastColor = bgConfig.textColor || calculateContrastColor(bgConfig.value);
  const isDarkBg = contrastColor === '#FFFFFF';
  
  const bgStyle = bgConfig.type === 'color' 
    ? { backgroundColor: bgConfig.value }
    : { backgroundImage: `url(${bgConfig.value})`, backgroundSize: 'cover', backgroundPosition: 'center' };

  return (
    <div 
      ref={ref}
      className="w-[375px] min-h-[667px] flex flex-col relative overflow-hidden"
      style={{ ...bgStyle, color: contrastColor }}
    >
      {/* Subtle overlay for image backgrounds to improve text readability */}
      {bgConfig.type === 'image' && (
        <div className="absolute inset-0 bg-black/10 pointer-events-none z-0"></div>
      )}

      {/* Header */}
      <div className="px-8 pt-12 pb-6 flex flex-col items-center text-center relative z-10">
        <div className={`w-12 h-1 mb-6 rounded-full ${isDarkBg ? 'bg-white/30' : 'bg-black/10'}`}></div>
        <div className="flex flex-col items-center">
          <span className={`text-4xl font-serif font-bold mb-2 ${isDarkBg ? 'text-white' : 'text-on-surface'}`}>
            {format(date, 'dd')}
          </span>
          <span className={`text-sm tracking-widest uppercase ${isDarkBg ? 'text-white/80' : 'text-on-surface-variant'}`}>
            {format(date, 'yyyy.MM')}
          </span>
          <span className={`text-xs mt-1 ${isDarkBg ? 'text-white/60' : 'text-outline'}`}>
            {format(date, 'EEEE', { locale: zhCN })}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="px-8 pb-12 flex-1 flex flex-col relative z-10">
        <div 
          className={`prose prose-sm max-w-none flex-1 ${isDarkBg ? 'prose-invert prose-headings:text-white prose-strong:text-white text-white/90' : 'prose-headings:text-on-surface prose-strong:text-on-surface text-on-surface/90'}`}
          style={{ fontFamily: 'var(--diary-font-family)', fontSize: '15px', lineHeight: '1.8' }}
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />

        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mt-8">
            {images.map((img, idx) => (
              <div key={idx} className="aspect-square rounded-xl overflow-hidden shadow-sm">
                <img src={img} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`px-8 py-6 mt-auto flex items-center justify-between border-t relative z-10 ${isDarkBg ? 'border-white/10' : 'border-black/5'}`}>
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs ${isDarkBg ? 'bg-white text-black' : 'bg-primary text-white'}`}>
            象
          </div>
          <span className={`text-xs font-medium tracking-wider ${isDarkBg ? 'text-white/80' : 'text-on-surface-variant'}`}>
            小象日志
          </span>
        </div>
        <span className={`text-[10px] tracking-widest ${isDarkBg ? 'text-white/40' : 'text-outline'}`}>
          记录生活的美好
        </span>
      </div>
    </div>
  );
});

ShareCard.displayName = 'ShareCard';
