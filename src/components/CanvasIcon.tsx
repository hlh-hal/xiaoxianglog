import React, { useEffect, useRef } from 'react';

export type IconStyle = 'classic' | 'gentle' | 'tsundere' | 'scholar';

interface CanvasIconProps {
  type: IconStyle;
  size?: number;
  className?: string;
}

export const CanvasIcon: React.FC<CanvasIconProps> = ({ type, size = 24, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Support high DPI
    const dpr = window.devicePixelRatio || 1;
    // Set internal canvas resolution
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    // Keep visual size consistent
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    
    ctx.scale(dpr, dpr);
    
    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    const center = size / 2;

    switch (type) {
      case 'classic': {
        // Complete Elephant
        ctx.fillStyle = '#A1A1A6';
        
        // Body
        ctx.beginPath();
        ctx.ellipse(center - size * 0.05, center + size * 0.1, size * 0.25, size * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Legs (4 legs)
        const legW = size * 0.08;
        const legH = size * 0.2;
        const legY = center + size * 0.15;
        
        ctx.fillStyle = '#8E8E93';
        ctx.fillRect(center - size * 0.22, legY, legW, legH); // back left
        ctx.fillRect(center + size * 0.02, legY, legW, legH); // front left
        
        ctx.fillStyle = '#A1A1A6';
        ctx.fillRect(center - size * 0.12, legY + size * 0.02, legW, legH); // back right
        ctx.fillRect(center + size * 0.12, legY + size * 0.02, legW, legH); // front right

        // Head
        ctx.beginPath();
        ctx.arc(center + size * 0.15, center, size * 0.18, 0, Math.PI * 2);
        ctx.fill();

        // Trunk
        ctx.beginPath();
        ctx.moveTo(center + size * 0.25, center + size * 0.08);
        ctx.quadraticCurveTo(center + size * 0.35, center + size * 0.2, center + size * 0.3, center + size * 0.35);
        ctx.lineWidth = size * 0.08;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#A1A1A6';
        ctx.stroke();

        // Ear
        ctx.fillStyle = '#8E8E93';
        ctx.beginPath();
        ctx.ellipse(center + size * 0.1, center, size * 0.12, size * 0.18, Math.PI * -0.1, 0, Math.PI * 2);
        ctx.fill();

        // Tail
        ctx.beginPath();
        ctx.moveTo(center - size * 0.28, center + size * 0.05);
        ctx.quadraticCurveTo(center - size * 0.35, center + size * 0.15, center - size * 0.35, center + size * 0.2);
        ctx.lineWidth = size * 0.03;
        ctx.strokeStyle = '#A1A1A6';
        ctx.stroke();
        
        // Eye
        ctx.fillStyle = '#1C1C1E';
        ctx.beginPath();
        ctx.arc(center + size * 0.2, center - size * 0.02, size * 0.025, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      
      case 'gentle': {
        // Gentle Plant/Leaf motif
        ctx.beginPath();
        ctx.moveTo(center, center + size * 0.25);
        ctx.quadraticCurveTo(center - size * 0.3, center, center, center - size * 0.4);
        ctx.quadraticCurveTo(center + size * 0.3, center, center, center + size * 0.25);
        ctx.fillStyle = '#E8F5E9';
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(center, center + size * 0.35);
        ctx.lineTo(center, center - size * 0.4);
        ctx.strokeStyle = '#81C784';
        ctx.lineWidth = size * 0.05;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(center, center + size * 0.1);
        ctx.quadraticCurveTo(center - size * 0.3, center + size * 0.1, center - size * 0.25, center - size * 0.1);
        ctx.quadraticCurveTo(center - size * 0.1, center - size * 0.1, center, center + size * 0.05);
        ctx.fillStyle = '#C8E6C9';
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(center, center + size * 0.15);
        ctx.quadraticCurveTo(center + size * 0.3, center + size * 0.15, center + size * 0.25, center - size * 0.05);
        ctx.quadraticCurveTo(center + size * 0.1, center - size * 0.05, center, center + size * 0.1);
        ctx.fillStyle = '#A5D6A7';
        ctx.fill();
        break;
      }

      case 'tsundere': {
        // Tsundere / Spiky Star
        const numPoints = 8;
        const outerRadius = size * 0.38;
        const innerRadius = size * 0.25;
        
        ctx.beginPath();
        for (let i = 0; i < numPoints * 2; i++) {
          const radius = i % 2 === 0 ? outerRadius : innerRadius;
          const angle = (i * Math.PI) / numPoints;
          const x = center + Math.cos(angle) * radius;
          const y = center + Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = '#FFE082';
        ctx.fill();
        ctx.strokeStyle = '#FFB300';
        ctx.lineWidth = size * 0.04;
        ctx.lineJoin = 'round';
        ctx.stroke();
        
        // Tsundere face (Eyes and smirk)
        ctx.beginPath();
        ctx.moveTo(center - size * 0.15, center - size * 0.05);
        ctx.lineTo(center - size * 0.05, center + size * 0.05);
        
        ctx.moveTo(center + size * 0.15, center - size * 0.05);
        ctx.lineTo(center + size * 0.05, center + size * 0.05);
        ctx.strokeStyle = '#1C1C1E';
        ctx.lineWidth = size * 0.04;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(center - size * 0.08, center + size * 0.15);
        ctx.quadraticCurveTo(center, center + size * 0.1, center + size * 0.1, center + size * 0.15);
        ctx.stroke();
        break;
      }
      
      case 'scholar': {
        // Scholar: Book motif
        ctx.fillStyle = '#E3F2FD';
        ctx.beginPath();
        ctx.moveTo(center, center + size * 0.2);
        ctx.lineTo(center - size * 0.35, center + size * 0.1);
        ctx.lineTo(center - size * 0.35, center - size * 0.2);
        ctx.lineTo(center, center - size * 0.1);
        ctx.fill();
        ctx.strokeStyle = '#1E88E5';
        ctx.lineWidth = size * 0.04;
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.fillStyle = '#BBDEFB';
        ctx.beginPath();
        ctx.moveTo(center, center + size * 0.2);
        ctx.lineTo(center + size * 0.35, center + size * 0.1);
        ctx.lineTo(center + size * 0.35, center - size * 0.2);
        ctx.lineTo(center, center - size * 0.1);
        ctx.fill();
        ctx.stroke();

        // Spine
        ctx.beginPath();
        ctx.moveTo(center, center + size * 0.2);
        ctx.lineTo(center, center - size * 0.1);
        ctx.stroke();

        // Lines on pages
        ctx.beginPath();
        ctx.moveTo(center - size * 0.25, center - size * 0.05);
        ctx.lineTo(center - size * 0.1, center + size * 0.02);
        ctx.moveTo(center + size * 0.25, center - size * 0.05);
        ctx.lineTo(center + size * 0.1, center + size * 0.02);
        ctx.lineWidth = size * 0.02;
        ctx.stroke();
        break;
      }
    }
  }, [type, size]);

  return (
    <canvas 
      ref={canvasRef} 
      className={`shrink-0 ${className}`}
    />
  );
};

