import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Image as ImageIcon, X } from 'lucide-react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { diaryService } from '../services/diaryService';
import { extractImages } from '../utils/imageUtils';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import ImageViewer from '../components/ImageViewer';
import { SafeImage } from '../components/SafeImage';
import { motion, AnimatePresence } from 'motion/react';

interface GalleryImage {
  url: string;
  entryId: string;
  date: string;
  entryTitle: string;
}

interface DayGroup {
  dayLabel: string;
  images: GalleryImage[];
}

interface MonthGroup {
  monthKey: string;
  monthLabel: string;
  days: DayGroup[];
}

// Cache variables to prevent slow loading flashes
let cachedGalleryImages: GalleryImage[] | null = null;
let cachedEntriesRef: any = null;

export default function Gallery() {
  const navigate = useNavigate();
  const location = useLocation();
  const { returnToDrawer } = useOutletContext<any>();
  const [images, setImages] = useState<GalleryImage[]>(cachedGalleryImages || []);
  const [loading, setLoading] = useState(!cachedGalleryImages);
  
  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxImages, setLightboxImages] = useState<GalleryImage[]>([]);

  useEffect(() => {
    // Scroll to top when entering gallery
    window.scrollTo(0, 0);

    const loadImages = async () => {
      let entries = diaryService.getCachedActiveEntries();
      if (!entries) {
        entries = await diaryService.getActiveEntries();
      }
      
      if (entries === cachedEntriesRef && cachedGalleryImages) {
        setImages(cachedGalleryImages);
        setLoading(false);
        return;
      }
      
      const allImages: GalleryImage[] = [];
      
      entries.forEach(entry => {
        let fullContent = '';
        if (entry.blocks && entry.blocks.length > 0) {
          fullContent = entry.blocks.map(b => (b.title ? b.title + '：\n' : '') + b.content).join('\n');
        } else {
          fullContent = entry.content || '';
        }
        
        const urls = extractImages(fullContent);
        
        // Also add images from the entry.images array
        if (entry.images && entry.images.length > 0) {
          entry.images.forEach(imgUrl => {
            if (!urls.includes(imgUrl)) {
              urls.push(imgUrl);
            }
          });
        }

        const dateStr = format(new Date(entry.diaryDate), 'yyyy-MM-dd');
        const entryTitle = entry.title || format(new Date(entry.diaryDate), 'yyyy年MM月dd日');
        
        urls.forEach(url => {
          allImages.push({
            url,
            entryId: entry.id,
            date: dateStr,
            entryTitle
          });
        });
      });
      
      // Sort by date descending
      allImages.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      cachedGalleryImages = allImages;
      cachedEntriesRef = entries;
      setImages(allImages);
      setLoading(false);
    };
    
    loadImages();
  }, []);

  const groupedImages = useMemo(() => {
    const groups: { [key: string]: MonthGroup } = {};
    
    images.forEach(img => {
      const date = new Date(img.date);
      const monthKey = format(date, 'yyyy-MM');
      const monthLabel = format(date, 'yyyy年M月');
      const dayLabel = format(date, 'M月d日');
      
      if (!groups[monthKey]) {
        groups[monthKey] = {
          monthKey,
          monthLabel,
          days: []
        };
      }
      
      let dayGroup = groups[monthKey].days.find(d => d.dayLabel === dayLabel);
      if (!dayGroup) {
        dayGroup = { dayLabel, images: [] };
        groups[monthKey].days.push(dayGroup);
      }
      
      dayGroup.images.push(img);
    });
    
    return Object.values(groups).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [images]);

  const openLightbox = (img: GalleryImage) => {
    const index = images.indexOf(img);
    if (index !== -1) {
      setLightboxImages(images);
      setLightboxIndex(index);
    }
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
    setLightboxImages([]);
  };

  const goBack = () => {
    if (location.state?.fromDrawer && returnToDrawer) {
      returnToDrawer();
    } else {
      navigate(-1);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-surface font-sans pb-12"
    >
      <header className="app-safe-header sticky top-0 w-full z-40 bg-surface flex items-center px-4">
        <button 
          onClick={goBack}
          className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-on-surface/5 transition-colors relative z-10"
        >
          <ArrowLeft className="w-6 h-6 text-on-surface" />
        </button>
        <div className="flex-1 flex flex-col items-center pr-8">
          <h1 className="text-[17px] font-medium text-on-surface">图库</h1>
          <span className="text-[12px] text-on-surface-variant mt-0.5">共 {images.length} 张图片</span>
        </div>
      </header>

      <main className="px-4 max-w-lg mx-auto">
        {!loading && images.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-32">
            <ImageIcon className="w-12 h-12 text-outline mb-4 opacity-50" />
            <p className="text-outline text-[14px]">还没有图片，在日记中插入图片后会显示在这里</p>
          </div>
        ) : (
          groupedImages.map((monthGroup) => (
            <section key={monthGroup.monthKey} className="mb-8">
              <h2 className="text-[13px] font-medium text-on-surface-variant mt-6 mb-2">
                {monthGroup.monthLabel}
              </h2>
              
              {monthGroup.days.map((dayGroup) => (
                <div key={dayGroup.dayLabel} className="mb-4">
                  <h3 className="text-[12px] text-outline mt-3 mb-1.5">
                    {dayGroup.dayLabel}
                  </h3>
                  <div className="grid grid-cols-3 gap-[6px]">
                    {dayGroup.images.map((img, idx) => (
                      <div 
                        key={`${img.entryId}-${idx}`} 
                        className="aspect-square bg-surface-container-low rounded-[12px] overflow-hidden cursor-pointer"
                        onClick={() => openLightbox(img)}
                      >
                        <SafeImage
                          src={img.url} 
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" 
                          alt="" 
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </main>

      {/* Lightbox */}
      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <>
          <ImageViewer
            images={lightboxImages.map(img => img.url)}
            initialIndex={lightboxIndex}
            onClose={closeLightbox}
            onChange={(idx) => setLightboxIndex(idx)}
          />
          <div 
            className="fixed bottom-0 left-0 w-full p-6 bg-gradient-to-t from-black/80 to-transparent cursor-pointer hover:bg-black/40 transition-colors z-[220]"
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
              navigate(`/editor?id=${lightboxImages[lightboxIndex].entryId}`);
            }}
          >
            <p className="text-white text-[15px] font-medium mb-1 line-clamp-1">
              {lightboxImages[lightboxIndex].entryTitle}
            </p>
            <p className="text-white/70 text-[12px]">
              {format(new Date(lightboxImages[lightboxIndex].date), 'yyyy年MM月dd日')}
            </p>
          </div>
        </>
      )}
    </motion.div>
  );
}
