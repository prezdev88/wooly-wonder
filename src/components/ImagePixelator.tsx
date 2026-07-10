import React, { useRef, useEffect, useState } from 'react';

interface Props {
  imageUrl: string;
}

export default function ImagePixelator({ imageUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pixelSize, setPixelSize] = useState(50);
  const [imageDims, setImageDims] = useState({ width: 0, height: 0 });
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);

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

    // Create an offscreen canvas to scale down
    const offscreen = document.createElement('canvas');
    offscreen.width = pointsWide;
    offscreen.height = pointsHigh;
    const offCtx = offscreen.getContext('2d');
    
    if (offCtx) {
       // Draw image tiny
       offCtx.drawImage(img, 0, 0, pointsWide, pointsHigh);
       // Draw it back scaled up to the main canvas
       ctx.drawImage(offscreen, 0, 0, pointsWide, pointsHigh, 0, 0, canvas.width, canvas.height);
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

  return (
    <div className="pixelator-container fade-in">
      <div className="canvas-wrapper">
        <canvas ref={canvasRef}></canvas>
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
      </div>
    </div>
  );
}
