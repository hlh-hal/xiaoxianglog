import React, { useState, useRef, useLayoutEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { SafeImage } from './SafeImage';

interface ImageViewerProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
  onChange?: (idx: number) => void;
}

// Manage each image natively so we can dynamically toggle panning based on zoom scale
const ImageSlide = ({ img, idx, onClose }: { img: string; idx: number; onClose: () => void }) => {
  const [scale, setScale] = useState(1);

  return (
    <div 
      className="flex-shrink-0 w-full h-full flex items-center justify-center relative snap-center snap-always"
      style={{ width: '100vw' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={4}
        centerOnInit={true}
        doubleClick={{
          disabled: false,
          step: 2,
        }}
        // Panning is strictly disabled when zoomed out so the browser native snapy swiping can kick in
        panning={{
          disabled: scale <= 1.01,
        }}
        onTransform={(ref: any) => {
          if (ref?.state?.scale !== undefined) {
            setScale(ref.state.scale);
          }
        }}
        onZoomStop={(ref: any) => {
          if (ref?.state?.scale !== undefined) {
             setScale(ref.state.scale);
          }
        }}
      >
        <TransformComponent 
          wrapperStyle={{ 
            width: '100%', 
            height: '100%',
            // Crucial: Re-enable touch actions when not zoomed to allow horizontal scrolling
            touchAction: scale <= 1.01 ? 'pan-x pan-y' : 'none'
          }}
          contentStyle={{
            width: '100%', 
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <SafeImage
            src={img} 
            alt={`View ${idx}`} 
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[100dvh] object-contain select-none w-full h-full"
            style={{ 
              objectFit: 'contain', 
              touchAction: scale <= 1.01 ? 'pan-x pan-y' : 'none' 
            }}
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
};

export default function ImageViewer({ images, initialIndex, onClose, onChange }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  useLayoutEffect(() => {
    const activeElement = document.activeElement as HTMLElement | null;
    activeElement?.blur?.();
  }, []);

  useLayoutEffect(() => {
    if (containerRef.current && !initializedRef.current) {
      const container = containerRef.current;
      // Scroll to initial index instantly on mount
      container.style.scrollBehavior = 'auto';
      container.scrollLeft = container.clientWidth * initialIndex;
      // Re-enable smooth scrolling if we want programmatic scrolls to be smooth
      container.style.scrollBehavior = 'smooth';
      initializedRef.current = true;
    }
  }, [initialIndex]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    if (width === 0) return;
    
    const index = Math.round(scrollLeft / width);
    if (index !== currentIndex && index >= 0 && index < images.length) {
      setCurrentIndex(index);
      onChange?.(index);
    }
  };

  return (
    <motion.div 
      data-testid="image-viewer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[200] bg-black/95 overflow-hidden flex flex-col"
      onPointerDown={(e) => {
        e.stopPropagation();
        const activeElement = document.activeElement as HTMLElement | null;
        activeElement?.blur?.();
      }}
    >
      <div className="absolute top-4 right-4 z-[210]">
        <button 
          onClick={onClose}
          className="bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {images.length > 1 && (
        <div className="absolute top-4 z-[210] text-white/80 text-sm font-medium tracking-wide left-1/2 -translate-x-1/2 bg-black/30 px-3 py-1 rounded-full">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Track */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
      <div
        ref={containerRef}
        className="flex-1 w-full h-full flex overflow-x-auto snap-x snap-mandatory hide-scrollbar"
        onScroll={handleScroll}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {images.map((img, idx) => (
          <ImageSlide key={idx} img={img} idx={idx} onClose={onClose} />
        ))}
      </div>
    </motion.div>
  );
}
