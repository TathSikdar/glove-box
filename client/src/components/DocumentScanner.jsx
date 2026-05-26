/**
 * @fileoverview Interactive Document Scanner React Component.
 * Features an overlay canvas with 4 draggable corner handles, glowing guide paths,
 * responsive mobile touch support, real-time magnifying glass preview, and filter selection.
 * Warps the cropped area using browser-side homography calculations.
 * Follows Google Coding Standards and React best practices.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  warpPerspective,
  applyColorScanFilter,
  applyBWScanFilter,
  applyGrayscaleFilter,
  autoDetectDocumentCorners
} from '../utils/scannerUtils';

/**
 * Renders the Document Scanner modal.
 * @param {!Object} props React component props.
 * @param {string} props.imageSrc The source URL of the image to scan (DataURI or ObjectURL).
 * @param {function(!Blob): void} props.onSave Callback with the processed image Blob.
 * @param {function(): void} props.onCancel Callback to exit the scanner.
 * @return {!React.ReactElement}
 */
export default function DocumentScanner({ imageSrc, onSave, onCancel }) {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const canvasRef = useRef(null);
  const magnifierCanvasRef = useRef(null);

  // Core scanner states
  const [currentImageSrc, setCurrentImageSrc] = useState(imageSrc);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalDim, setNaturalDim] = useState({ width: 0, height: 0 });
  const [displayDim, setDisplayDim] = useState({ width: 0, height: 0 });
  
  // Handles in display canvas coordinates: 0=TL, 1=TR, 2=BR, 3=BL
  const [corners, setCorners] = useState([]);
  const [activeCornerIdx, setActiveCornerIdx] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('color'); // original, color, bw, grayscale

  // State for magnifier visibility and coordinate tracing
  const [magnifier, setMagnifier] = useState({ show: false, x: 0, y: 0, handleX: 0, handleY: 0 });

  // Store normalized corners in a Ref to prevent re-render loop on dragging,
  // while keeping handles beautifully responsive on resize or screen rotation.
  const normalizedCornersRef = useRef([]);

  // Sync prop changes
  useEffect(() => {
    setCurrentImageSrc(imageSrc);
  }, [imageSrc]);

  // Clean up rotated object URLs
  useEffect(() => {
    return () => {
      if (currentImageSrc && currentImageSrc.startsWith('blob:') && currentImageSrc !== imageSrc) {
        URL.revokeObjectURL(currentImageSrc);
      }
    };
  }, [currentImageSrc, imageSrc]);

  // Initialize and load the receipt image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setNaturalDim({ width: img.width, height: img.height });
      imageRef.current = img;

      // Run automatic receipt edge and corner detection
      try {
        const detected = autoDetectDocumentCorners(img);
        normalizedCornersRef.current = detected;
      } catch (err) {
        console.error('[Scanner] Automatic border detection failed, using defaults:', err);
        const inset = 0.12;
        normalizedCornersRef.current = [
          { x: inset, y: inset },
          { x: 1.0 - inset, y: inset },
          { x: 1.0 - inset, y: 1.0 - inset },
          { x: inset, y: 1.0 - inset }
        ];
      }

      setImageLoaded(true);
    };
    img.src = currentImageSrc;
  }, [currentImageSrc]);

  // Handle responsive canvas sizing and map crop handle positions
  useEffect(() => {
    if (!imageLoaded || !containerRef.current) return;

    const resizeHandler = () => {
      const containerW = containerRef.current.clientWidth;
      const isMobile = window.innerWidth <= 768;
      const containerH = containerRef.current.clientHeight - (isMobile ? 260 : 180); // Subtract padding for buttons

      const imgW = naturalDim.width;
      const imgH = naturalDim.height;

      // Maintain image aspect ratio inside container constraints
      const ratio = Math.min(containerW / imgW, containerH / imgH);
      const dispW = Math.round(imgW * ratio);
      const dispH = Math.round(imgH * ratio);

      setDisplayDim({ width: dispW, height: dispH });

      // Map normalized corners to active display dimensions
      if (normalizedCornersRef.current && normalizedCornersRef.current.length === 4) {
        const mapped = normalizedCornersRef.current.map((nc) => ({
          x: Math.round(nc.x * dispW),
          y: Math.round(nc.y * dispH)
        }));
        setCorners(mapped);
      }
    };

    resizeHandler();
    window.addEventListener('resize', resizeHandler);
    return () => window.removeEventListener('resize', resizeHandler);
  }, [imageLoaded, naturalDim]);

  // Redraw corners and boundary lines on display changes
  useEffect(() => {
    if (corners.length === 0 || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, displayDim.width, displayDim.height);

    // Draw glowing cropping boundary lines
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();

    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00f2fe';
    ctx.stroke();
    
    // Reset shadow for corners
    ctx.shadowBlur = 0;

    // Draw lines fill color overlay
    ctx.fillStyle = 'rgba(0, 242, 254, 0.08)';
    ctx.fill();

    // Draw corner handles
    corners.forEach((corner, idx) => {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 11, 0, 2 * Math.PI);
      ctx.fillStyle = activeCornerIdx === idx ? '#00f2fe' : '#ffffff';
      ctx.strokeStyle = '#0b0f19';
      ctx.lineWidth = 2.5;
      ctx.fill();
      ctx.stroke();

      // Core anchor inner dot
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = '#0b0f19';
      ctx.fill();
    });
  }, [corners, displayDim, activeCornerIdx]);

  /**
   * Helper to identify which handle is clicked/touched.
   * @param {number} x Event horizontal position relative to display canvas.
   * @param {number} y Event vertical position relative to display canvas.
   * @return {number} Index of closest corner or -1.
   */
  const findClosestCorner = (x, y) => {
    const grabRadius = 25; // Large touch targets for easier interaction on phones
    let foundIdx = -1;
    let minDist = grabRadius;

    corners.forEach((corner, idx) => {
      const dist = Math.hypot(corner.x - x, corner.y - y);
      if (dist < minDist) {
        minDist = dist;
        foundIdx = idx;
      }
    });

    return foundIdx;
  };

  /**
   * Updates the coordinates of the magnifier lens canvas.
   * @param {number} displayX Drag point inside display canvas.
   * @param {number} displayY Drag point inside display canvas.
   * @param {number} clientX Pointer X on screen.
   * @param {number} clientY Pointer Y on screen.
   */
  const updateMagnifier = (displayX, displayY, clientX, clientY) => {
    if (!imageRef.current || !magnifierCanvasRef.current) return;

    const magCanvas = magnifierCanvasRef.current;
    const magCtx = magCanvas.getContext('2d');
    const scaleX = naturalDim.width / displayDim.width;
    const scaleY = naturalDim.height / displayDim.height;

    // Convert display coordinate to raw high-res image coordinate
    const sourceX = displayX * scaleX;
    const sourceY = displayY * scaleY;

    // Lens parameters
    const size = 110;
    const zoom = 2;

    magCanvas.width = size;
    magCanvas.height = size;

    magCtx.save();
    // Circular clipping path
    magCtx.beginPath();
    magCtx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    magCtx.clip();

    // Draw zoomed-in segment from original raw image
    magCtx.drawImage(
      imageRef.current,
      sourceX - (size / (2 * zoom)),
      sourceY - (size / (2 * zoom)),
      size / zoom,
      size / zoom,
      0,
      0,
      size,
      size
    );
    magCtx.restore();

    // Draw center crosshair target in magnifier lens
    magCtx.beginPath();
    magCtx.arc(size / 2, size / 2, 3, 0, 2 * Math.PI);
    magCtx.fillStyle = '#ff3b30';
    magCtx.fill();

    magCtx.strokeStyle = '#ffffff';
    magCtx.lineWidth = 1;
    magCtx.beginPath();
    magCtx.moveTo(size / 2, 0);
    magCtx.lineTo(size / 2, size);
    magCtx.moveTo(0, size / 2);
    magCtx.lineTo(size, size / 2);
    magCtx.stroke();

    // Offset magnifier upwards by 70px to avoid fingers blocking the view
    setMagnifier({
      show: true,
      x: clientX - size / 2,
      y: clientY - size - 45,
      handleX: displayX,
      handleY: displayY
    });
  };

  // Drag handlers
  const handlePointerDown = (e) => {
    if (corners.length === 0) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const idx = findClosestCorner(x, y);
    if (idx !== -1) {
      setActiveCornerIdx(idx);
      updateMagnifier(corners[idx].x, corners[idx].y, clientX, clientY);
    }
  };

  const handlePointerMove = (e) => {
    if (activeCornerIdx === null) return;

    // Prevent default scrolling on mobile while dragging handles
    if (e.cancelable) e.preventDefault();

    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Bound check relative to display canvas dimensions
    const x = Math.max(0, Math.min(displayDim.width, clientX - rect.left));
    const y = Math.max(0, Math.min(displayDim.height, clientY - rect.top));

    // Update corner coordinate
    const updatedCorners = [...corners];
    updatedCorners[activeCornerIdx] = { x, y };
    setCorners(updatedCorners);

    // Sync manual adjustments back to normalized coordinates ref
    if (normalizedCornersRef.current && normalizedCornersRef.current.length === 4) {
      normalizedCornersRef.current[activeCornerIdx] = {
        x: x / displayDim.width,
        y: y / displayDim.height
      };
    }

    updateMagnifier(x, y, clientX, clientY);
  };

  const handlePointerUp = () => {
    setActiveCornerIdx(null);
    setMagnifier((prev) => ({ ...prev, show: false }));
  };

  /**
   * Rotates the image physically 90 degrees clockwise using an offscreen canvas.
   */
  const handleRotate = () => {
    if (!imageRef.current) return;

    const img = imageRef.current;
    const offCanvas = document.createElement('canvas');
    // Swap width and height
    offCanvas.width = img.height;
    offCanvas.height = img.width;

    const ctx = offCanvas.getContext('2d');
    ctx.translate(offCanvas.width / 2, offCanvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    offCanvas.toBlob((blob) => {
      if (blob) {
        const newUrl = URL.createObjectURL(blob);
        // Clean up previous blob url
        if (currentImageSrc && currentImageSrc.startsWith('blob:') && currentImageSrc !== imageSrc) {
          URL.revokeObjectURL(currentImageSrc);
        }
        setCurrentImageSrc(newUrl);
        setImageLoaded(false);
      }
    }, 'image/jpeg', 0.95);
  };

  /**
   * Applies perspective warp homography and filters to construct high-res clean JPEG document blob.
   */
  const handleApplyScan = () => {
    if (isProcessing) return;
    setIsProcessing(true);

    // Timeout allows DOM loading spinners to render before lockups on heavy canvas math
    setTimeout(() => {
      try {
        const img = imageRef.current;
        const scaleX = naturalDim.width / displayDim.width;
        const scaleY = naturalDim.height / displayDim.height;

        // Convert Display corner coordinates back to high-res raw image coordinates
        const rawQuad = corners.map((c) => ({
          x: c.x * scaleX,
          y: c.y * scaleY
        }));

        // Determine destination dimensions: standard A4 receipt aspect ratio (e.g. 900x1200)
        // Adjust values dynamically based on bounding box to retain resolution quality
        const widthTLTR = Math.hypot(rawQuad[0].x - rawQuad[1].x, rawQuad[0].y - rawQuad[1].y);
        const widthBLBR = Math.hypot(rawQuad[3].x - rawQuad[2].x, rawQuad[3].y - rawQuad[2].y);
        const destW = Math.max(500, Math.round(Math.max(widthTLTR, widthBLBR)));

        const heightTLBL = Math.hypot(rawQuad[0].x - rawQuad[3].x, rawQuad[0].y - rawQuad[3].y);
        const heightTRBR = Math.hypot(rawQuad[1].x - rawQuad[2].x, rawQuad[1].y - rawQuad[2].y);
        const destH = Math.max(700, Math.round(Math.max(heightTLBL, heightTRBR)));

        // 1. Perform perspective warp in memory
        let warpedData = warpPerspective(img, rawQuad, destW, destH);

        // 2. Apply shadow removal and scanning threshold filters
        if (selectedFilter === 'color') {
          warpedData = applyColorScanFilter(warpedData);
        } else if (selectedFilter === 'bw') {
          warpedData = applyBWScanFilter(warpedData);
        } else if (selectedFilter === 'grayscale') {
          warpedData = applyGrayscaleFilter(warpedData);
        } // 'original' bypasses processing, retaining natural lighting warp

        // Write output pixel data onto a final processing canvas
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = destW;
        outputCanvas.height = destH;
        const outputCtx = outputCanvas.getContext('2d');
        outputCtx.putImageData(warpedData, 0, 0);

        // Convert canvas image into high quality, lightweight JPEG Blob
        outputCanvas.toBlob((blob) => {
          if (blob) {
            onSave(blob);
          } else {
            alert('Failed to construct receipt file. Please try again.');
            setIsProcessing(false);
          }
        }, 'image/jpeg', 0.85);

      } catch (err) {
        console.error('[Scanner] Processing failure:', err);
        alert(`Failed to warp image: ${err.message}`);
        setIsProcessing(false);
      }
    }, 100);
  };

  return (
    <div className="scanner-overlay" ref={containerRef}>
      {/* Visual background header status bar */}
      <div className="scanner-header">
        <button className="btn-icon" onClick={onCancel} title="Go Back">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <div className="scanner-title">
          <h3>Receipt Document Scanner</h3>
          <p>Drag the corner anchors to fit the invoice receipt boundary</p>
        </div>
        <button type="button" className="btn-icon" onClick={handleRotate} title="Rotate 90° Clockwise">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: 'scaleX(-1)' }}>
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
          </svg>
        </button>
      </div>

      {/* Main Image display and interactive canvas container */}
      <div className="scanner-body">
        {!imageLoaded ? (
          <div className="spinner-container">
            <div className="spinner"></div>
            <p>Loading photo raw channels...</p>
          </div>
        ) : (
          <div
            className="canvas-wrapper"
            style={{ width: displayDim.width, height: displayDim.height }}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
          >
            {/* Base Image */}
            <img
              src={currentImageSrc}
              alt="Scan Target"
              className="scanner-img-base"
              style={{ width: displayDim.width, height: displayDim.height }}
              draggable={false}
            />

            {/* Draggable Anchors Interactive Overlay Canvas */}
            <canvas
              ref={canvasRef}
              width={displayDim.width}
              height={displayDim.height}
              className="scanner-canvas-overlay"
            />
          </div>
        )}
      </div>

      {/* Real-time Magnifying glass lens float */}
      {magnifier.show && (
        <div
          className="magnifier-lens"
          style={{
            position: 'fixed',
            left: magnifier.x,
            top: magnifier.y,
            pointerEvents: 'none',
            zIndex: 9999
          }}
        >
          <canvas ref={magnifierCanvasRef} className="magnifier-canvas" />
        </div>
      )}

      {/* Bottom controls tray */}
      <div className="scanner-controls">
        <div className="filter-selector-tray">
          <button
            type="button"
            className={`filter-tab ${selectedFilter === 'original' ? 'active' : ''}`}
            onClick={() => setSelectedFilter('original')}
          >
            Original
          </button>
          <button
            type="button"
            className={`filter-tab ${selectedFilter === 'color' ? 'active' : ''}`}
            onClick={() => setSelectedFilter('color')}
          >
            Photo Scan
          </button>
          <button
            type="button"
            className={`filter-tab ${selectedFilter === 'bw' ? 'active' : ''}`}
            onClick={() => setSelectedFilter('bw')}
          >
            B&W Scan
          </button>
          <button
            type="button"
            className={`filter-tab ${selectedFilter === 'grayscale' ? 'active' : ''}`}
            onClick={() => setSelectedFilter('grayscale')}
          >
            Grayscale
          </button>
        </div>

        <div className="action-buttons-tray">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isProcessing}>
            Discard
          </button>
          <button
            type="button"
            className="btn btn-primary btn-glow"
            onClick={handleApplyScan}
            disabled={!imageLoaded || isProcessing}
          >
            {isProcessing ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="spinner spinner-sm"></div>
                Warping & Filtering...
              </div>
            ) : (
              'Scan & Save Receipt'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
