import React, { useRef, useEffect, useState } from 'react';

import type { SavedColor } from '../types';

interface Props {
  imageUrl: string;
  palette: SavedColor[];
  onUpdatePalette: (palette: SavedColor[]) => void;
  initialPixelSize?: number;
  onUpdatePixelSize: (size: number) => void;
}

export default function ImagePixelator({ imageUrl, palette, onUpdatePalette, initialPixelSize = 50, onUpdatePixelSize }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pixelSize, setPixelSize] = useState(initialPixelSize);
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
       
       let rSum = 0, gSum = 0, bSum = 0;
       for (let i = 0; i < imgData.data.length; i += 4) {
         rSum += imgData.data[i];
         gSum += imgData.data[i+1];
         bSum += imgData.data[i+2];
       }
       const pixelCount = pointsWide * pointsHigh;
       const luminance = (0.299 * (rSum / pixelCount) + 0.587 * (gSum / pixelCount) + 0.114 * (bSum / pixelCount));
       const isLightImage = luminance > 127;
       
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
       
       // Draw dynamic grid on top based on image brightness
       ctx.strokeStyle = isLightImage ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.5)';
       
       // Calculate a line width that survives CSS downscaling (assuming display width ~800px)
       const scaleRatio = canvas.width / 800;
       ctx.lineWidth = Math.max(1.5, scaleRatio * 1.5);
       
       ctx.beginPath();
       
       for (let x = 0; x <= pointsWide; x++) {
         const lineX = Math.round(x * rectWidth);
         ctx.moveTo(lineX, 0);
         ctx.lineTo(lineX, canvas.height);
       }
       for (let y = 0; y <= pointsHigh; y++) {
         const lineY = Math.round(y * rectHeight);
         ctx.moveTo(0, lineY);
         ctx.lineTo(canvas.width, lineY);
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

  const handleCanvasClick = () => {
    if (hoverColor) {
      if (!palette.find(c => c.hex === hoverColor.hex)) {
        onUpdatePalette([...palette, { id: Date.now().toString(), ...hoverColor }]);
      }
    }
  };

  const updateColorName = (id: string, name: string) => {
    onUpdatePalette(palette.map(c => c.id === id ? { ...c, name } : c));
  };

  const removeColor = (id: string) => {
    onUpdatePalette(palette.filter(c => c.id !== id));
  };

  return (
    <div className="pixelator-container fade-in">
      <div className="pixelator-main">
        <div className="canvas-wrapper">
          <canvas 
            ref={canvasRef} 
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleCanvasClick}
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
          onPointerUp={() => onUpdatePixelSize(pixelSize)}
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
      
      {/* Right Sidebar for Saved Colors */}
      <div className="pixelator-sidebar">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>Mi Paleta</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', padding: '4px 10px', borderRadius: '20px' }}>
            {palette.length} colores
          </span>
        </div>
        
        {palette.length === 0 ? (
          <div style={{ 
            flex: 1, display: 'flex', flexDirection: 'column', 
            justifyContent: 'center', alignItems: 'center', textAlign: 'center', 
            color: 'var(--text-muted)', opacity: 0.5, gap: '12px' 
          }}>
            <div style={{ fontSize: '3rem' }}>🎨</div>
            <div style={{ fontSize: '0.95rem', lineHeight: '1.5' }}>
              Haz clic en cualquier punto<br/>de la imagen para guardar<br/>su color aquí.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
            {palette.map(color => (
              <div key={color.id} style={{ 
                display: 'flex', alignItems: 'center', gap: '12px', 
                background: 'rgba(0,0,0,0.2)', padding: '10px 14px', 
                borderRadius: '10px', border: '1px solid rgba(255,255,255,0.03)',
                transition: 'transform 0.2s, background 0.2s',
                cursor: 'default'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.4)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.2)'}
              >
                <div style={{ 
                  width: '32px', height: '32px', borderRadius: '6px', 
                  background: color.hex, border: '2px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}></div>
                
                <input 
                  type="text" 
                  value={color.name || ''} 
                  placeholder={color.hex}
                  onChange={(e) => updateColorName(color.id, e.target.value)}
                  style={{ 
                    flex: 1, background: 'transparent', border: '1px solid transparent', 
                    color: 'var(--text-main)', fontSize: '0.9rem', outline: 'none',
                    padding: '4px 6px', borderRadius: '4px', width: '100px',
                    transition: 'border 0.2s, background 0.2s'
                  }}
                  onFocus={(e) => {
                    e.target.style.background = 'rgba(255,255,255,0.05)';
                    e.target.style.borderColor = 'rgba(255,255,255,0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.background = 'transparent';
                    e.target.style.borderColor = 'transparent';
                  }}
                />
                
                <button 
                  onClick={() => removeColor(color.id)}
                  style={{ 
                    background: 'transparent', border: 'none', color: 'var(--text-muted)', 
                    cursor: 'pointer', padding: '6px', display: 'flex', alignItems: 'center', 
                    justifyContent: 'center', borderRadius: '6px', transition: 'all 0.2s' 
                  }}
                  title="Eliminar color"
                  onMouseOver={(e) => {
                    e.currentTarget.style.color = '#ff6b6b';
                    e.currentTarget.style.background = 'rgba(255,107,107,0.1)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
