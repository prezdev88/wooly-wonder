import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';

import type { SavedColor } from '../types';

interface Props {
  imageUrl: string;
  palette: SavedColor[];
  onUpdatePalette: (palette: SavedColor[]) => void;
  initialPixelSize?: number;
  onUpdatePixelSize?: (size: number) => void;
  currentRow?: number | null;
  onUpdateCurrentRow?: (row: number | null) => void;
  isFocusMode?: boolean;
  onToggleFocus?: () => void;
}

export default function ImagePixelator({ imageUrl, palette, onUpdatePalette, initialPixelSize = 50, onUpdatePixelSize, currentRow = null, onUpdateCurrentRow, isFocusMode = false, onToggleFocus }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pixelSize, setPixelSize] = useState(initialPixelSize);
  const [viewState, setViewState] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  
  const [hoverColor, setHoverColor] = useState<{ hex: string; r: number; g: number; b: number } | null>(null);
  
  // Store pixel data for fast lookup on hover
  const pixelDataRef = useRef<{ data: Uint8ClampedArray; pointsWide: number; rectWidth: number; rectHeight: number } | null>(null);

  const updateSize = () => {
    if (wrapperRef.current) {
      setWrapperSize({ 
        width: wrapperRef.current.clientWidth, 
        height: wrapperRef.current.clientHeight 
      });
    }
  };

  useEffect(() => {
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      setOriginalImage(img);
      drawPixelated(img, pixelSize, currentRow ?? null);
      updateSize(); // Measure container when image loads!
      setViewState({ zoom: 1, panX: 0, panY: 0 }); // Reset view
    };
  }, [imageUrl]);

  useEffect(() => {
    if (originalImage) {
      drawPixelated(originalImage, pixelSize, currentRow ?? null);
    }
  }, [currentRow]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      
      if (!wrapperRef.current) return;

      const rect = wrapperRef.current.getBoundingClientRect();
      const wrapperCenterX = rect.left + rect.width / 2;
      const wrapperCenterY = rect.top + rect.height / 2;

      setViewState(prev => {
        const newZoom = Math.max(0.1, prev.zoom * zoomFactor);
        const F = newZoom / prev.zoom;
        
        const distX = e.clientX - (wrapperCenterX + prev.panX);
        const distY = e.clientY - (wrapperCenterY + prev.panY);
        
        return {
          zoom: newZoom,
          panX: e.clientX - wrapperCenterX - distX * F,
          panY: e.clientY - wrapperCenterY - distY * F
        };
      });
    };
    
    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      wrapper.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    
    updateSize(); // Initial measure
    window.addEventListener('resize', updateSize);
    
    return () => {
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const drawPixelated = (img: HTMLImageElement, pointsWide: number, rowToHighlight: number | null = null) => {
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
       
       // Draw Row Highlight for Knitting Mode
       if (rowToHighlight != null && rowToHighlight >= 0 && rowToHighlight < pointsHigh) {
         // Dim upper rows
         ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
         if (rowToHighlight > 0) {
           ctx.fillRect(0, 0, canvas.width, rowToHighlight * rectHeight);
         }
         // Dim lower rows
         if (rowToHighlight < pointsHigh - 1) {
           ctx.fillRect(0, (rowToHighlight + 1) * rectHeight, canvas.width, canvas.height - (rowToHighlight + 1) * rectHeight);
         }
         
         // Accentuate current row
         const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#9D4EDD';
         ctx.strokeStyle = accentColor;
         ctx.lineWidth = Math.max(3, scaleRatio * 3);
         ctx.strokeRect(0, rowToHighlight * rectHeight, canvas.width, rectHeight);
       }
    }
    
    // Update displayed dimensions
    setImageDims({ width: pointsWide, height: pointsHigh });
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setPixelSize(newSize);
    if (originalImage) {
      drawPixelated(originalImage, newSize, currentRow ?? null);
    }
  };

  const handleSliderRelease = () => {
    if (onUpdatePixelSize) {
        onUpdatePixelSize(pixelSize);
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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 1) { // Middle click
      e.preventDefault();
      setIsPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      if (wrapperRef.current) {
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: viewState.panX,
          panY: viewState.panY
        };
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanning) {
      e.preventDefault();
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setViewState(prev => ({
        ...prev,
        panX: panStartRef.current.panX + dx,
        panY: panStartRef.current.panY + dy
      }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 1 && isPanning) {
      setIsPanning(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Only register click for palette on left click
    if (e.button !== 0) return;
    
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

  let fitWidth = 0;
  let fitHeight = 0;
  if (originalImage && wrapperSize.width > 0 && wrapperSize.height > 0) {
    const imgAspect = originalImage.width / originalImage.height;
    const wrapperAspect = wrapperSize.width / wrapperSize.height;
    
    if (imgAspect > wrapperAspect) {
      fitWidth = wrapperSize.width;
      fitHeight = fitWidth / imgAspect;
    } else {
      fitHeight = wrapperSize.height;
      fitWidth = fitHeight * imgAspect;
    }
  }

  return (
    <div className="pixelator-container fade-in" style={{ gap: isFocusMode ? 0 : '20px' }}>
      <div className="pixelator-main" style={{ position: 'relative' }}>
        
        {currentRow != null && (
          <div style={{
            position: 'absolute',
            bottom: '30px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 200,
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '40px',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
          }}>
            <button 
              onClick={() => onUpdateCurrentRow?.(null)}
              style={{ background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem' }}
            >
              ⏹ Salir
            </button>
            <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.2)' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <button 
                onClick={() => onUpdateCurrentRow?.(Math.max(0, currentRow - 1))}
                disabled={currentRow === 0}
                style={{ 
                  background: 'var(--panel-bg)', color: 'var(--text-main)', border: '1px solid var(--panel-border)',
                  width: '40px', height: '40px', borderRadius: '50%', cursor: currentRow === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: currentRow === 0 ? 0.5 : 1
                }}
              >
                ▲
              </button>
              <div style={{ color: 'white', fontWeight: 500, fontSize: '1.1rem', minWidth: '120px', textAlign: 'center' }}>
                Fila {currentRow + 1} <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>de {imageDims.height}</span>
              </div>
              <button 
                onClick={() => onUpdateCurrentRow?.(Math.min(imageDims.height - 1, currentRow + 1))}
                disabled={currentRow === imageDims.height - 1}
                style={{ 
                  background: 'var(--panel-bg)', color: 'var(--text-main)', border: '1px solid var(--panel-border)',
                  width: '40px', height: '40px', borderRadius: '50%', cursor: currentRow === imageDims.height - 1 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: currentRow === imageDims.height - 1 ? 0.5 : 1
                }}
              >
                ▼
              </button>
            </div>
          </div>
        )}

        {onToggleFocus && (
          <button 
            onClick={onToggleFocus}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              zIndex: 100,
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.2)',
              backdropFilter: 'blur(8px)',
              color: 'var(--text-main)',
              borderRadius: '8px',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              opacity: isFocusMode ? 0.3 : 0.8,
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              fontSize: '1.2rem'
            }}
            onMouseOver={e => e.currentTarget.style.opacity = '1'}
            onMouseOut={e => e.currentTarget.style.opacity = isFocusMode ? '0.3' : '0.8'}
            title={isFocusMode ? "Salir de Modo Concentración (Esc)" : "Modo Concentración"}
          >
            {isFocusMode ? '⤡' : '⤢'}
          </button>
        )}

        <div 
          className="canvas-wrapper" 
          ref={wrapperRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
          style={{ 
            cursor: isPanning ? 'grabbing' : 'auto',
            overflow: 'hidden',
            position: 'relative',
            touchAction: 'none',
            borderRadius: isFocusMode ? 'var(--radius)' : undefined
          }}
        >
          <canvas 
            ref={canvasRef} 
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleCanvasClick}
            style={{ 
              cursor: isPanning ? 'grabbing' : 'crosshair',
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) translate(${viewState.panX}px, ${viewState.panY}px) scale(${viewState.zoom})`,
              transformOrigin: '50% 50%',
              width: fitWidth ? `${fitWidth}px` : '100%',
              height: fitHeight ? `${fitHeight}px` : '100%',
              maxWidth: 'none',
              maxHeight: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
          ></canvas>
        </div>
        
      </div>
      
      {!isFocusMode && (
        <aside className="pixelator-sidebar">
        <div style={{ 
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
        
        {/* Right Sidebar for Saved Colors */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', marginTop: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>Mi Paleta</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', padding: '4px 10px', borderRadius: '20px' }}>
            {palette.length} colores
          </span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          <button 
            onClick={() => onUpdateCurrentRow?.(0)}
            style={{ 
              background: 'var(--accent)', color: 'var(--bg-color)', border: 'none', 
              padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            ▶ Tejer desde Arriba
          </button>
          <button 
            onClick={() => onUpdateCurrentRow?.(imageDims.height - 1)}
            style={{ 
              background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)', border: '1px solid var(--panel-border)', 
              padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'}}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'translateY(0)'}}
          >
            ▶ Tejer desde Abajo
          </button>
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

        {/* Nivel de detalle (Slider) */}
        <div style={{ 
          marginTop: '16px', 
          paddingTop: '20px', 
          borderTop: '1px solid var(--panel-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>Resolución</h3>
            <span className="dimensions" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
              {imageDims.width} x {imageDims.height} pts
            </span>
          </div>
          <input 
            type="range" 
            min="10" 
            max="150" 
            value={pixelSize} 
            onChange={handleSliderChange}
            onPointerUp={handleSliderRelease}
            className="slider"
            style={{ margin: '12px 0 4px 0' }}
          />
          <div className="slider-labels" style={{ fontSize: '0.75rem' }}>
            <span>Menos</span>
            <span>Más</span>
          </div>
        </div>

      </aside>
      )}
    </div>
  );
}
