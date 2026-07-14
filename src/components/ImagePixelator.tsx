import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { jsPDF } from 'jspdf';
import { useTranslation } from 'react-i18next';

import type { SavedColor } from '../types';

interface Props {
  imageUrl: string;
  palette: SavedColor[];
  onUpdatePalette: (palette: SavedColor[]) => void;
  initialPixelSize?: number;
  onUpdatePixelSize?: (size: number) => void;
  isPixelSizeLocked?: boolean;
  onUpdatePixelSizeLocked?: (isLocked: boolean) => void;
  currentRow?: number | null;
  onUpdateCurrentRow?: (row: number | null) => void;
  markedPixel?: { x: number, y: number } | null;
  onUpdateMarkedPixel?: (pixel: { x: number, y: number } | null) => void;
  isFocusMode?: boolean;
  onSetFocus?: (focus: boolean) => void;
  projectName?: string;
  onCreateProject?: () => void;
  onUpdateImageUrl?: (newUrl: string) => void;
  completedSegments?: Record<number, number[]>;
  onUpdateCompletedSegments?: (segments: Record<number, number[]>) => void;
}

export default function ImagePixelator({ imageUrl, palette, onUpdatePalette, initialPixelSize = 50, onUpdatePixelSize, isPixelSizeLocked = false, onUpdatePixelSizeLocked, currentRow = null, onUpdateCurrentRow, markedPixel = null, onUpdateMarkedPixel, isFocusMode = false, onSetFocus, projectName = 'Proyecto sin título', onCreateProject, onUpdateImageUrl, completedSegments = {}, onUpdateCompletedSegments }: Props) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pixelSize, setPixelSize] = useState(initialPixelSize);
  const [viewState, setViewState] = useState({ zoom: 1, panX: 0, panY: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const touchStartRef = useRef<{ dist: number, zoom: number, x: number, y: number, panX: number, panY: number } | null>(null);
  const [showFabMenu, setShowFabMenu] = useState(false);
  
  
  const [hoverColor, setHoverColor] = useState<{ hex: string; r: number; g: number; b: number } | null>(null);
  const [currentRowColors, setCurrentRowColors] = useState<{hex: string, count: number, startX: number, endX: number}[]>([]);
  const [selectedSegmentIdx, setSelectedSegmentIdx] = useState<number | null>(null);
  const [panelZoom, setPanelZoom] = useState(1);
  const panelTouchStartRef = useRef<{ dist: number, zoom: number } | null>(null);
  
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
    setSelectedSegmentIdx(null);
  }, [currentRow]);

  useEffect(() => {
    if (originalImage) {
      drawPixelated(
        originalImage, 
        pixelSize, 
        currentRow ?? null, 
        markedPixel ?? null, 
        selectedSegmentIdx, 
        completedSegments
      );
    }
  }, [originalImage, pixelSize, currentRow, markedPixel, selectedSegmentIdx, completedSegments]);

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
    
    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    
    resizeObserver.observe(wrapper);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const drawPixelated = (
    img: HTMLImageElement, 
    pointsWide: number, 
    rowToHighlight: number | null = null, 
    pixelToMark: {x: number, y: number} | null = null,
    activeSegmentIdx: number | null = null,
    allCompletedSegments: Record<number, number[]> = {}
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Calculate height in points based on aspect ratio
    const pointsHigh = Math.max(1, Math.round((img.height / img.width) * pointsWide));
    
    // To fix subpixel grid aliasing (ghost borders when zooming), we FORCE the 
    // canvas size to be an EXACT multiple of pointsWide and pointsHigh.
    // This ensures that every grid square is an exact integer number of pixels (e.g. 40x40).
    const PIXELS_PER_SQUARE = Math.max(20, Math.floor(2000 / pointsWide)); 
    canvas.width = pointsWide * PIXELS_PER_SQUARE;
    canvas.height = pointsHigh * PIXELS_PER_SQUARE;
    
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
       
       // rectWidth and rectHeight are now guaranteed to be EXACT integers
       const rectWidth = PIXELS_PER_SQUARE;
       const rectHeight = PIXELS_PER_SQUARE;
       
       pixelDataRef.current = {
         data: imgData.data,
         pointsWide,
         rectWidth,
         rectHeight
       };
       
       // Draw it back scaled up to the main canvas
       ctx.imageSmoothingEnabled = false;
       ctx.drawImage(offscreen, 0, 0, pointsWide, pointsHigh, 0, 0, canvas.width, canvas.height);
       
       // Draw grid with difference blending so it's always visible on dark and light areas
       ctx.globalCompositeOperation = 'difference';
       ctx.beginPath();
       ctx.strokeStyle = 'rgba(220, 220, 220, 1)';
       // Thick enough to not disappear when CSS zoomed
       ctx.lineWidth = Math.max(2, Math.floor(PIXELS_PER_SQUARE * 0.05));
       
       for (let x = 0; x <= canvas.width; x += rectWidth) {
         ctx.moveTo(x, 0);
         ctx.lineTo(x, canvas.height);
       }
       for (let y = 0; y <= canvas.height; y += rectHeight) {
         ctx.moveTo(0, y);
         ctx.lineTo(canvas.width, y);
       }
       
       ctx.stroke();
       ctx.globalCompositeOperation = 'source-over'; // Restore default
       
       // Since scaleRatio is gone, redefine a safe scale ratio for subsequent strokes
       const scaleRatio = canvas.width / 800;
       
       // Draw Indices (1 to N for each row) ONLY in Knitting Mode
       if (rowToHighlight != null) {
         ctx.textAlign = 'right';
         ctx.textBaseline = 'bottom';
         const fontSize = Math.max(6, rectHeight * 0.25);
         ctx.font = `600 ${fontSize}px sans-serif`;
         
         for (let y = 0; y < pointsHigh; y++) {
           for (let x = 0; x < pointsWide; x++) {
             const i = (y * pointsWide + x) * 4;
             const r = imgData.data[i];
             const g = imgData.data[i+1];
             const b = imgData.data[i+2];
             
             const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
             ctx.fillStyle = luminance > 140 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';
             
             const paddingX = Math.max(2, rectWidth * 0.06);
             const paddingY = Math.max(2, rectHeight * 0.06);
             ctx.fillText(`${x + 1}`, (x + 1) * rectWidth - paddingX, (y + 1) * rectHeight - paddingY);
           }
         }
       }
       
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

         // Calculate color sequence for the current row
         const sequence: { hex: string, count: number, startX: number, endX: number }[] = [];
         let lastHex = '';
         let count = 0;
         let startX = 0;
         
         for (let x = 0; x < pointsWide; x++) {
           const i = (rowToHighlight * pointsWide + x) * 4;
           const r = imgData.data[i];
           const g = imgData.data[i+1];
           const b = imgData.data[i+2];
           const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
           
           if (hex === lastHex) {
             count++;
           } else {
             if (count > 0) sequence.push({ hex: lastHex, count, startX, endX: x - 1 });
             lastHex = hex;
             count = 1;
             startX = x;
           }
         }
         if (count > 0) sequence.push({ hex: lastHex, count, startX, endX: pointsWide - 1 });
         
         setTimeout(() => setCurrentRowColors(sequence), 0);

         // Draw overlays for selected segment
         sequence.forEach((seg, idx) => {
           const isActive = activeSegmentIdx === idx;
           
           if (isActive) {
             const pxX = seg.startX * rectWidth;
             const pxY = rowToHighlight * rectHeight;
             const width = (seg.endX - seg.startX + 1) * rectWidth;
             
             ctx.strokeStyle = '#00FF00';
             ctx.lineWidth = Math.max(3, scaleRatio * 3);
             ctx.strokeRect(pxX, pxY, width, rectHeight);
             
             ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
             ctx.fillRect(pxX, pxY, width, rectHeight);
           }
         });

         // Draw completed segments for ALL rows
         Object.entries(allCompletedSegments).forEach(([rowStr, indices]) => {
           const row = parseInt(rowStr);
           if (indices.length === 0) return;
           if (row < 0 || row >= pointsHigh) return;
           
           const rowSequence: { startX: number, endX: number }[] = [];
           let lastHex = '';
           let count = 0;
           let startX = 0;
           for (let x = 0; x < pointsWide; x++) {
             const i = (row * pointsWide + x) * 4;
             const hex = '#' + [imgData.data[i], imgData.data[i+1], imgData.data[i+2]].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
             if (hex === lastHex) {
               count++;
             } else {
               if (count > 0) rowSequence.push({ startX, endX: x - 1 });
               lastHex = hex;
               count = 1;
               startX = x;
             }
           }
           if (count > 0) rowSequence.push({ startX, endX: pointsWide - 1 });
           
           indices.forEach(idx => {
             const seg = rowSequence[idx];
             if (!seg) return;
             
             ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
             ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
             ctx.lineWidth = Math.max(1, scaleRatio * 1.5);
             
             for (let x = seg.startX; x <= seg.endX; x++) {
               const pxX = x * rectWidth;
               const pxY = row * rectHeight;
               
               ctx.fillRect(pxX, pxY, rectWidth, rectHeight);
               ctx.beginPath();
               ctx.moveTo(pxX, pxY);
               ctx.lineTo(pxX + rectWidth, pxY + rectHeight);
               ctx.moveTo(pxX + rectWidth, pxY);
               ctx.lineTo(pxX, pxY + rectHeight);
               ctx.stroke();
             }
           });
         });
       }
       
       // Draw Marked Pixel
       if (pixelToMark && rowToHighlight != null) {
         const { x, y } = pixelToMark;
         if (x >= 0 && x < pointsWide && y >= 0 && y < pointsHigh) {
           const pxX = x * rectWidth;
           const pxY = y * rectHeight;
           
           ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
           ctx.fillRect(pxX, pxY, rectWidth, rectHeight);
           
           ctx.strokeStyle = '#FF0000'; // Bright red ring
           ctx.lineWidth = Math.max(2, scaleRatio * 2);
           ctx.beginPath();
           ctx.arc(pxX + rectWidth/2, pxY + rectHeight/2, Math.min(rectWidth, rectHeight) / 4, 0, Math.PI * 2);
           ctx.stroke();
           ctx.fillStyle = '#FF0000';
           ctx.fill();
         }
       }
    }
    
    // Update displayed dimensions
    setImageDims({ width: pointsWide, height: pointsHigh });
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setPixelSize(newSize);
    if (originalImage) {
      drawPixelated(originalImage, newSize, currentRow ?? null, markedPixel ?? null);
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

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      
      touchStartRef.current = { dist, zoom: viewState.zoom, x: centerX, y: centerY, panX: viewState.panX, panY: viewState.panY };
    } else if (e.touches.length === 1 && isFocusMode) {
      setIsPanning(true);
      panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX: viewState.panX, panY: viewState.panY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      const zoomFactor = dist / touchStartRef.current.dist;
      const newZoom = Math.max(0.1, touchStartRef.current.zoom * zoomFactor);
      
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const wrapperCenterX = rect.left + rect.width / 2;
      const wrapperCenterY = rect.top + rect.height / 2;

      const F = newZoom / touchStartRef.current.zoom;
      const distToCenterX = touchStartRef.current.x - (wrapperCenterX + touchStartRef.current.panX);
      const distToCenterY = touchStartRef.current.y - (wrapperCenterY + touchStartRef.current.panY);
      
      const dragX = centerX - touchStartRef.current.x;
      const dragY = centerY - touchStartRef.current.y;
      
      setViewState({
        zoom: newZoom,
        panX: touchStartRef.current.x - wrapperCenterX - distToCenterX * F + dragX,
        panY: touchStartRef.current.y - wrapperCenterY - distToCenterY * F + dragY
      });
    } else if (e.touches.length === 1 && isFocusMode && isPanning) {
      const dx = e.touches[0].clientX - panStartRef.current.x;
      const dy = e.touches[0].clientY - panStartRef.current.y;
      setViewState(prev => ({ ...prev, panX: panStartRef.current.panX + dx, panY: panStartRef.current.panY + dy }));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) touchStartRef.current = null;
    if (e.touches.length === 0) setIsPanning(false);
  };

  const handlePanelTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      e.stopPropagation();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      panelTouchStartRef.current = { dist, zoom: panelZoom };
    }
  };

  const handlePanelTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && panelTouchStartRef.current) {
      e.stopPropagation();
      // e.preventDefault(); // Might interfere with scrolling if we do this unconditionally, but we are capturing 2-finger touch
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const zoomFactor = dist / panelTouchStartRef.current.dist;
      const newZoom = Math.max(0.5, Math.min(3, panelTouchStartRef.current.zoom * zoomFactor));
      setPanelZoom(newZoom);
    }
  };

  const handlePanelTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) panelTouchStartRef.current = null;
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Only register click for palette on left click
    if (e.button !== 0) return;
    
    if (currentRow != null) {
      // Knitting Mode: Mark Pixel
      if (!pixelDataRef.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = canvasRef.current.width / rect.width;
      const scaleY = canvasRef.current.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      
      const gridX = Math.floor(x / pixelDataRef.current.rectWidth);
      const gridY = Math.floor(y / pixelDataRef.current.rectHeight);
      
      if (markedPixel && markedPixel.x === gridX && markedPixel.y === gridY) {
        onUpdateMarkedPixel?.(null);
      } else {
        onUpdateMarkedPixel?.({ x: gridX, y: gridY });
      }
      return; // Do not save color in knitting mode
    }
    
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

  const exportToPDF = () => {
    if (!canvasRef.current) return;
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    
    // -- PAGE 1: PATTERN --
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(157, 78, 221);
    doc.text(projectName, margin, margin + 10);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(t('pixelator.patternSubtitle'), margin, margin + 18);
    
    let currentY = margin + 25;
    
    const canvas = canvasRef.current;
    const canvasDataUrl = canvas.toDataURL('image/png', 1.0);
    
    const maxWidth = pageWidth - (margin * 2);
    const maxHeight = pageHeight - currentY - margin - 10;
    
    let imgWidth = maxWidth;
    let imgHeight = (canvas.height * maxWidth) / canvas.width;
    
    if (imgHeight > maxHeight) {
      imgHeight = maxHeight;
      imgWidth = (canvas.width * maxHeight) / canvas.height;
    }
    
    const imgX = margin + (maxWidth - imgWidth) / 2;
    doc.addImage(canvasDataUrl, 'PNG', imgX, currentY, imgWidth, imgHeight);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(t('pixelator.generatedBy'), pageWidth / 2, pageHeight - 8, { align: "center" });

    // -- PAGE 2: PALETTE --
    doc.addPage();
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(157, 78, 221);
    doc.text(projectName, margin, margin + 10);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(t('pixelator.paletteSubtitle'), margin, margin + 18);
    
    currentY = margin + 30;
    
    if (palette && palette.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const startX = margin;
      let x = startX;
      let y = currentY;
      
      const boxSize = 10;
      const spacingX = 45;
      const spacingY = 15;
      
      palette.forEach((color) => {
        if (x + spacingX > pageWidth - margin) {
          x = startX;
          y += spacingY;
        }
        
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color.hex);
        if (result) {
          const r = parseInt(result[1], 16);
          const g = parseInt(result[2], 16);
          const b = parseInt(result[3], 16);
          doc.setFillColor(r, g, b);
        } else {
          doc.setFillColor(0, 0, 0);
        }
        
        doc.rect(x, y, boxSize, boxSize, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.rect(x, y, boxSize, boxSize, 'S');
        
        doc.setTextColor(60, 60, 60);
        const label = color.name || color.hex;
        doc.text(label, x + boxSize + 3, y + 7);
        
        x += spacingX;
      });
      
    } else {
      doc.setFontSize(10);
      doc.setTextColor(150, 150, 150);
      doc.text(t('pixelator.noColorsSaved'), margin, currentY);
    }
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(t('pixelator.generatedBy'), pageWidth / 2, pageHeight - 8, { align: "center" });
    
    const safeName = projectName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    
    const pdfBase64 = doc.output('datauristring');
    window.electronAPI.savePdf({ base64Data: pdfBase64, filename: `${safeName}.pdf` })
      .then((saved) => {
        if (saved) {
          setNotification(t('pixelator.pdfSaved', { filename: `${safeName}.pdf` }));
          setTimeout(() => setNotification(null), 5000);
        }
      });
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

  const handleCrop = () => {
    if (!originalImage || !canvasRef.current || !onUpdateImageUrl) return;
    if (window.confirm(t('pixelator.confirmCrop'))) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const wrapperRect = wrapperRef.current?.getBoundingClientRect();
      if (!wrapperRect) return;

      const imgWidth = originalImage.width;
      const imgHeight = originalImage.height;
      
      const scaleX = imgWidth / fitWidth;
      const scaleY = imgHeight / fitHeight;

      const wrapperWidth = wrapperRect.width;
      const wrapperHeight = wrapperRect.height;
      
      const x0 = wrapperWidth / 2 + viewState.panX - (fitWidth * viewState.zoom) / 2;
      const y0 = wrapperHeight / 2 + viewState.panY - (fitHeight * viewState.zoom) / 2;
      
      let cropX = (-x0 / viewState.zoom) * scaleX;
      let cropY = (-y0 / viewState.zoom) * scaleY;
      let cropW = (wrapperWidth / viewState.zoom) * scaleX;
      let cropH = (wrapperHeight / viewState.zoom) * scaleY;
      
      const startX = Math.max(0, cropX);
      const startY = Math.max(0, cropY);
      const endX = Math.min(imgWidth, cropX + cropW);
      const endY = Math.min(imgHeight, cropY + cropH);
      
      const finalW = endX - startX;
      const finalH = endY - startY;
      
      if (finalW <= 0 || finalH <= 0) return;
      
      canvas.width = finalW;
      canvas.height = finalH;
      
      ctx.drawImage(originalImage, startX, startY, finalW, finalH, 0, 0, finalW, finalH);
      const newUrl = canvas.toDataURL('image/png');
      
      setViewState({ zoom: 1, panX: 0, panY: 0 });
      onUpdateImageUrl(newUrl);
    }
  };

  return (
    <div className="pixelator-container fade-in" style={{ gap: isFocusMode ? 0 : '20px' }}>
      <div className={`pixelator-main ${isFocusMode ? 'focus-mode' : ''}`} style={{ position: 'relative' }}>
        
        {currentRow != null && (
          <div className="knitting-controls">
            <button 
              onClick={() => {
                onUpdateCurrentRow?.(null);
                onSetFocus?.(false);
              }}
              style={{ background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem' }}
            >
              {t('pixelator.exit')}
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
                {t('pixelator.row')} {currentRow + 1} <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('pixelator.of')} {imageDims.height}</span>
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

        {currentRow != null && currentRowColors.length > 0 && (
          <div 
            className="row-colors-panel"
            onTouchStart={handlePanelTouchStart}
            onTouchMove={handlePanelTouchMove}
            onTouchEnd={handlePanelTouchEnd}
          >
            <span className="panel-title" style={{ fontSize: `${0.9 * panelZoom}rem` }}>
              {t('pixelator.rowColors', 'Colores de la fila:')}
            </span>
            {currentRowColors.map((item, idx) => {
              const matchedColor = palette.find(c => c.hex === item.hex);
              const label = matchedColor?.name || item.hex;
              const isCompleted = completedSegments[currentRow ?? -1]?.includes(idx);
              const isActive = selectedSegmentIdx === idx;
              return (
                <div 
                  key={idx} 
                  className="color-item" 
                  onClick={() => setSelectedSegmentIdx(isActive ? null : idx)}
                  onDoubleClick={() => {
                    const current = completedSegments[currentRow ?? -1] || [];
                    let newCurrent;
                    if (current.includes(idx)) {
                      newCurrent = current.filter(i => i !== idx);
                    } else {
                      newCurrent = [...current, idx];
                    }
                    if (onUpdateCompletedSegments) {
                      onUpdateCompletedSegments({
                        ...completedSegments,
                        [currentRow ?? -1]: newCurrent
                      });
                    }
                  }}
                  style={{
                    padding: `${6 * panelZoom}px ${10 * panelZoom}px`,
                    gap: `${8 * panelZoom}px`,
                    borderRadius: `${8 * panelZoom}px`,
                    background: isActive ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0,0,0,0.2)',
                    opacity: isCompleted ? 0.3 : 1,
                    border: isActive ? '1px solid #00FF00' : '1px solid transparent',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}>
                  <div style={{ width: `${18 * panelZoom}px`, height: `${18 * panelZoom}px`, borderRadius: `${4 * panelZoom}px`, background: item.hex, border: '1px solid rgba(255,255,255,0.2)' }}></div>
                  <span style={{ color: 'var(--text-main)', fontSize: `${1 * panelZoom}rem`, fontWeight: 600, minWidth: `${30 * panelZoom}px` }}>{item.count}x</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: `${0.9 * panelZoom}rem`, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                </div>
              );
            })}
          </div>
        )}

        {onSetFocus && (
          <button 
            onClick={() => onSetFocus(!isFocusMode)}
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
            title={isFocusMode ? t('pixelator.exitFocusMode') : t('pixelator.enterFocusMode')}
          >
            {isFocusMode ? '⤡' : '⤢'}
          </button>
        )}

        {viewState.zoom > 1.01 && currentRow == null && (
          <button 
            onClick={handleCrop}
            style={{
              position: 'absolute',
              top: onSetFocus ? 60 : 16,
              right: 16,
              zIndex: 100,
              background: 'var(--accent)',
              border: 'none',
              color: '#fff',
              borderRadius: '8px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              gap: '6px'
            }}
            title={t('pixelator.crop')}
          >
            {t('pixelator.crop')}
          </button>
        )}

        <div 
          className={`canvas-wrapper ${isFocusMode ? 'focus-mode' : ''}`}
          ref={wrapperRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
          style={{ 
            cursor: isPanning ? 'grabbing' : 'auto',
            overflow: 'hidden',
            position: 'relative',
            touchAction: isFocusMode ? 'none' : 'pan-y'
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
              {t('pixelator.inspectedColor')}
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
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>{t('pixelator.myPalette')}</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', padding: '4px 10px', borderRadius: '20px' }}>
            {palette.length} {t('pixelator.colors')}
          </span>
        </div>
        

        {palette.length === 0 ? (
          <div style={{ 
            flex: 1, display: 'flex', flexDirection: 'column', 
            justifyContent: 'center', alignItems: 'center', textAlign: 'center', 
            color: 'var(--text-muted)', opacity: 0.5, gap: '12px' 
          }}>
            <div style={{ fontSize: '3rem' }}>🎨</div>
            <div style={{ fontSize: '0.95rem', lineHeight: '1.5', whiteSpace: 'pre-line' }}>
              {t('pixelator.clickToSave')}
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
                  title={t('pixelator.deleteColor')}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>{t('pixelator.resolution')}</h3>
              <button
                onClick={() => onUpdatePixelSizeLocked?.(!isPixelSizeLocked)}
                disabled={currentRow != null}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: currentRow != null ? 'not-allowed' : 'pointer',
                  fontSize: '1.2rem',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: currentRow != null ? 0.5 : 1,
                  transition: 'transform 0.2s',
                }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.8)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                title={isPixelSizeLocked ? 'Desbloquear tamaño' : 'Bloquear tamaño'}
              >
                {isPixelSizeLocked ? '🔒' : '🔓'}
              </button>
            </div>
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
            disabled={currentRow != null || isPixelSizeLocked}
            className="slider"
            style={{ 
              margin: '12px 0 4px 0', 
              opacity: (currentRow != null || isPixelSizeLocked) ? 0.5 : 1,
              cursor: (currentRow != null || isPixelSizeLocked) ? 'not-allowed' : 'pointer',
              width: '100%'
            }}
          />
          <div className="slider-labels" style={{ fontSize: '0.75rem' }}>
            <span>{t('pixelator.less')}</span>
            <span>{t('pixelator.more')}</span>
          </div>
        </div>

        <div className="pixelator-actions desktop-only" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button 
            onClick={exportToPDF}
            style={{ 
              background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--panel-border)', 
              padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.2s',
              fontSize: '1rem',
              width: '100%'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {t('pixelator.exportPdf')}
          </button>
          
          <button 
            onClick={() => {
              onUpdateCurrentRow?.(0);
              onSetFocus?.(true);
            }}
            style={{ 
              background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', 
              padding: '14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.2s',
              fontSize: '1.2rem',
              width: '100%',
              boxShadow: '0 4px 15px rgba(157, 78, 221, 0.4)'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(157, 78, 221, 0.6)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(157, 78, 221, 0.4)';
            }}
          >
            {t('pixelator.knit')}
          </button>
        </div>

        {createPortal(
          <div className="mobile-fab-container">
             <div className={`fab-menu ${showFabMenu ? 'open' : ''}`}>
               {onCreateProject && (
                 <button className="fab-pill" onClick={() => { onCreateProject(); setShowFabMenu(false); }} title={t('project.newProject')}>
                   <span className="fab-pill-text">{t('project.newProject')}</span>
                 </button>
               )}
               <button className="fab-pill" onClick={() => { exportToPDF(); setShowFabMenu(false); }} title={t('pixelator.exportPdf')}>
                 <span className="fab-pill-text">{t('pixelator.exportPdf')}</span>
               </button>
               <button className="fab-pill" onClick={() => { onUpdateCurrentRow?.(0); onSetFocus?.(true); setShowFabMenu(false); }} title={t('pixelator.knit')}>
                 <span className="fab-pill-text">{t('pixelator.knit')}</span>
               </button>
             </div>
             <button className="fab-main" onClick={() => setShowFabMenu(!showFabMenu)}>
               {showFabMenu ? '✕' : '⋮'}
             </button>
          </div>,
          document.body
        )}


      </aside>
      )}

      {notification && (
        <>
          <style>{`
            @keyframes toastFadeIn {
              from { opacity: 0; transform: translate(-50%, 20px); }
              to { opacity: 1; transform: translate(-50%, 0); }
            }
          `}</style>
          <div style={{
            position: 'absolute',
            bottom: '40px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--accent)',
            color: '#fff',
            padding: '16px 32px',
            borderRadius: '30px',
            boxShadow: '0 8px 25px rgba(0,0,0,0.4)',
            zIndex: 9999,
            fontWeight: 'bold',
            fontSize: '1.1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            animation: 'toastFadeIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
          }}>
            {notification}
          </div>
        </>
      )}
    </div>
  );
}
