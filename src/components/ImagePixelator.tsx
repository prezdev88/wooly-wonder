import React, { useRef, useEffect, useState } from 'react';

interface Props {
  imageUrl: string;
}

export default function ImagePixelator({ imageUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pixelSize, setPixelSize] = useState(50);
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  
  const [hoverColor, setHoverColor] = useState<{ hex: string; r: number; g: number; b: number } | null>(null);
  
  // Store pixel data for fast lookup on hover
  const pixelDataRef = useRef<{ data: Uint8ClampedArray; pointsWide: number; rectWidth: number; rectHeight: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      setOriginalImage(img);
      drawPixelated(img, pixelSize);
    };
  }, [imageUrl]);

  const drawPixelated = (img: HTMLImageElement, pointsWide: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Calculate height in points based on aspect ratio
    const pointsHigh = Math.max(1, Math.round((img.height / img.width) * pointsWide));
    
    // Set actual canvas size to the source image size for high quality display
    canvas.width = img.width;
    canvas.height = img.height;
    
    // Turn off smoothing to get crisp blocks
    ctx.imageSmoothingEnabled = false;

    // Create an offscreen canvas to scale down and extract pixel data
    const offscreen = document.createElement('canvas');
    offscreen.width = pointsWide;
    offscreen.height = pointsHigh;
    const offCtx = offscreen.getContext('2d');
    
    if (offCtx) {
       // Draw image tiny
       offCtx.drawImage(img, 0, 0, pointsWide, pointsHigh);
       
       // Save pixel data for the hover color inspector
       const imgData = offCtx.getImageData(0, 0, pointsWide, pointsHigh);
       
       const rectWidth = canvas.width / pointsWide;
       const rectHeight = canvas.height / pointsHigh;
       
       pixelDataRef.current = {
         data: imgData.data,
         pointsWide,
         rectWidth,
         rectHeight
       };
       
       // Draw it back scaled up to the main canvas
       ctx.drawImage(offscreen, 0, 0, pointsWide, pointsHigh, 0, 0, canvas.width, canvas.height);
       
       // Draw white grid on top
       ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
       ctx.lineWidth = Math.max(1, canvas.width / 1500); // Slight scaling for better visibility
       ctx.beginPath();
       
       for (let x = 0; x <= pointsWide; x++) {
         ctx.moveTo(x * rectWidth, 0);
         ctx.lineTo(x * rectWidth, canvas.height);
       }
       for (let y = 0; y <= pointsHigh; y++) {
         ctx.moveTo(0, y * rectHeight);
         ctx.lineTo(canvas.width, y * rectHeight);
       }
       
       ctx.stroke();
    }
    
    // Update displayed dimensions
    setImageDims({ width: pointsWide, height: pointsHigh });
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setPixelSize(newSize);
    if (originalImage) {
      drawPixelated(originalImage, newSize);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !pixelDataRef.current) return;
    
    const rect = canvas.getBoundingClientRect();
    
    // Calculate display scaling
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    // Mouse position on actual canvas pixels
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const { data, pointsWide, rectWidth, rectHeight } = pixelDataRef.current;
    
    // Find which grid point we are hovering
    const gridX = Math.floor(x / rectWidth);
    const gridY = Math.floor(y / rectHeight);
    
    const idx = (gridY * pointsWide + gridX) * 4;
    
    if (idx >= 0 && idx < data.length) {
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
      setHoverColor({ hex, r, g, b });
    }
  };
  
  const handleMouseLeave = () => {
    setHoverColor(null);
  }

  return (
    <div className="pixelator-container fade-in">
      <div className="canvas-wrapper">
        <canvas 
          ref={canvasRef} 
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'crosshair' }}
        ></canvas>
      </div>
      <div className="controls">
        <div className="controls-header">
          <h3>Ajuste de Puntos</h3>
          <span className="dimensions">{imageDims.width} × {imageDims.height} puntos</span>
        </div>
        <input 
          type="range" 
          min="10" 
          max="200" 
          value={pixelSize} 
          onChange={handleSliderChange} 
          className="slider"
        />
        <div className="slider-labels">
          <span>Menos detalle</span>
          <span>Más detalle (200 pts)</span>
        </div>
        
        {/* Color Inspector */}
        <div style={{ 
          marginTop: '24px', 
          padding: '16px', 
          background: 'var(--panel-bg)', 
          border: '1px solid var(--panel-border)',
          borderRadius: '12px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '16px',
          transition: 'var(--transition)'
        }}>
          <div style={{ 
             width: '48px', 
             height: '48px', 
             borderRadius: '8px', 
             background: hoverColor ? hoverColor.hex : 'transparent',
             border: '2px solid rgba(255,255,255,0.1)',
             boxShadow: hoverColor ? '0 4px 12px rgba(0,0,0,0.3)' : 'none'
          }}></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Color Inspeccionado
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 600, color: hoverColor ? 'var(--text-main)' : 'var(--text-muted)' }}>
              {hoverColor ? hoverColor.hex : '#------'}
            </div>
          </div>
          <div style={{ 
            textAlign: 'right', 
            fontSize: '0.85rem', 
            color: 'var(--text-muted)',
            opacity: hoverColor ? 1 : 0,
            visibility: hoverColor ? 'visible' : 'hidden',
            transition: 'opacity 0.2s'
          }}>
            <div>R: {hoverColor ? hoverColor.r : '--'}</div>
            <div>G: {hoverColor ? hoverColor.g : '--'}</div>
            <div>B: {hoverColor ? hoverColor.b : '--'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
