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
  mergeImagesVertically,
  downscaleImage
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
  const [activeHandleIdx, setActiveHandleIdx] = useState(null); // 0-3 for corners, 4-7 for edges
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('color'); // original, color, bw, grayscale

  // Multi-part scanning state
  const [scannedParts, setScannedParts] = useState([]);
  const pendingSegmentRef = useRef(null);
  const fileInputRef = useRef(null);

  // State for magnifier visibility and coordinate tracing
  const [magnifier, setMagnifier] = useState({ show: false, x: 0, y: 0, handleX: 0, handleY: 0 });

  // Store normalized corners in a Ref to prevent re-render loop on dragging,
  // while keeping handles beautifully responsive on resize or screen rotation.
  const normalizedCornersRef = useRef([]);
  const dragStartRef = useRef(null); // Tracks start coords for edge dragging deltas

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
    let isMounted = true;
    
    const initScanner = async () => {
      setImageLoaded(false); // Show spinner
      
      const img = new Image();
      img.src = currentImageSrc;
      
      await new Promise(resolve => {
        img.onload = () => {
          setNaturalDim({ width: img.width, height: img.height });
          imageRef.current = img;
          resolve();
        };
      });

      if (!isMounted) return;

      try {
        // Fetch the blob from the local object URL
        const blobRes = await fetch(currentImageSrc);
        const blob = await blobRes.blob();

        const formData = new FormData();
        formData.append('image', blob, 'scan.jpg');

        const detectRes = await fetch('/api/detect-corners', {
          method: 'POST',
          body: formData
        });

        if (!detectRes.ok) throw new Error('API failed');
        
        const detected = await detectRes.json();
        
        if (!isMounted) return;
        normalizedCornersRef.current = detected;

      } catch (err) {
        console.error('[Scanner] Backend OpenCV detection failed, using defaults:', err);
        const inset = 0.12;
        if (isMounted) {
          normalizedCornersRef.current = [
            { x: inset, y: inset },
            { x: 1.0 - inset, y: inset },
            { x: 1.0 - inset, y: 1.0 - inset },
            { x: inset, y: 1.0 - inset }
          ];
        }
      }

      if (isMounted) {
        setImageLoaded(true);
      }
    };

    initScanner();

    return () => { isMounted = false; };
  }, [currentImageSrc]);

  // Handle responsive canvas sizing and map crop handle positions
  useEffect(() => {
    if (!imageLoaded || !containerRef.current) return;

    const resizeHandler = () => {
      const containerW = containerRef.current.clientWidth;
      const isMobile = window.innerWidth <= 768;
      
      // We must subtract the height of the header, the bottom controls, and the safe-area paddings.
      // On mobile, the controls are much taller due to the safe-area swipe bar padding.
      const containerH = containerRef.current.clientHeight - (isMobile ? 360 : 180);

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

    // The corner handles themselves are now perfectly crisp HTML <div> elements 
    // rendered directly in the JSX, so we no longer draw them on this pixel canvas!
  }, [corners, displayDim]);

  /**
   * Helper to identify which handle is clicked/touched.
   * Returns 0-3 for corners. Returns 4-7 for edges.
   */
  const findClosestHandle = (x, y) => {
    const grabRadius = 35; // Generous touch target
    let foundIdx = -1;
    let minDist = grabRadius;

    // 1. Check corners first
    corners.forEach((corner, idx) => {
      const dist = Math.hypot(corner.x - x, corner.y - y);
      if (dist < minDist) {
        minDist = dist;
        foundIdx = idx;
      }
    });

    if (foundIdx !== -1) return foundIdx;

    // 2. Check edges (midpoints) if no corner was grabbed
    const edges = [
      { idx: 4, p1: corners[0], p2: corners[1] }, // Top Edge
      { idx: 5, p1: corners[1], p2: corners[2] }, // Right Edge
      { idx: 6, p1: corners[2], p2: corners[3] }, // Bottom Edge
      { idx: 7, p1: corners[3], p2: corners[0] }  // Left Edge
    ];

    edges.forEach((edge) => {
      const midX = (edge.p1.x + edge.p2.x) / 2;
      const midY = (edge.p1.y + edge.p2.y) / 2;
      // We check distance to the midpoint of the edge
      const dist = Math.hypot(midX - x, midY - y);
      if (dist < grabRadius * 1.5) { // Edges have a slightly larger grab area
        if (dist < minDist) {
          minDist = dist;
          foundIdx = edge.idx;
        }
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
    // Adaptive positioning: if the touch is near the very top of the screen, flip the magnifier below the finger!
    const flipDown = clientY < 180;
    
    setMagnifier({
      show: true,
      x: clientX - size / 2,
      y: flipDown ? clientY + 60 : clientY - size - 45,
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

    const idx = findClosestHandle(x, y);
    if (idx !== -1) {
      setActiveHandleIdx(idx);
      dragStartRef.current = {
        startX: clientX,
        startY: clientY,
        startCorners: JSON.parse(JSON.stringify(corners))
      };
      
      // Initial magnifier display
      let magX = x, magY = y;
      if (idx >= 4) {
        // If grabbing an edge, center magnifier on the finger
        magX = x; magY = y;
      } else {
        // If grabbing a corner, center magnifier precisely on the corner math
        magX = corners[idx].x; magY = corners[idx].y;
      }
      updateMagnifier(magX, magY, clientX, clientY);
    }
  };

  const handlePointerMove = (e) => {
    if (activeHandleIdx === null || !dragStartRef.current) return;

    // Prevent default scrolling on mobile while dragging handles
    if (e.cancelable) e.preventDefault();

    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const deltaX = clientX - dragStartRef.current.startX;
    const deltaY = clientY - dragStartRef.current.startY;

    const updatedCorners = [...dragStartRef.current.startCorners];

    // Helper to safely apply deltas while clamping within canvas bounds
    const applyDelta = (cornerIdx) => {
      const startCorner = dragStartRef.current.startCorners[cornerIdx];
      updatedCorners[cornerIdx] = {
        x: Math.max(0, Math.min(displayDim.width, startCorner.x + deltaX)),
        y: Math.max(0, Math.min(displayDim.height, startCorner.y + deltaY))
      };
    };

    if (activeHandleIdx < 4) {
      // Dragging a single corner
      applyDelta(activeHandleIdx);
    } else {
      // Dragging an edge -> move two adjacent corners simultaneously
      if (activeHandleIdx === 4) { applyDelta(0); applyDelta(1); } // Top
      else if (activeHandleIdx === 5) { applyDelta(1); applyDelta(2); } // Right
      else if (activeHandleIdx === 6) { applyDelta(2); applyDelta(3); } // Bottom
      else if (activeHandleIdx === 7) { applyDelta(3); applyDelta(0); } // Left
    }

    setCorners(updatedCorners);

    // Sync manual adjustments back to normalized coordinates ref
    if (normalizedCornersRef.current && normalizedCornersRef.current.length === 4) {
      for (let i = 0; i < 4; i++) {
        normalizedCornersRef.current[i] = {
          x: updatedCorners[i].x / displayDim.width,
          y: updatedCorners[i].y / displayDim.height
        };
      }
    }

    // Update magnifier visual position
    let magX = clientX - rect.left;
    let magY = clientY - rect.top;
    if (activeHandleIdx < 4) {
      magX = updatedCorners[activeHandleIdx].x;
      magY = updatedCorners[activeHandleIdx].y;
    }
    updateMagnifier(magX, magY, clientX, clientY);
  };

  const handlePointerUp = () => {
    setActiveHandleIdx(null);
    dragStartRef.current = null;
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
        // CRITICAL: Explicitly zero canvas to instantly drop the GPU memory allocation before OS kills tab
        offCanvas.width = 0;
        offCanvas.height = 0;
        setCurrentImageSrc(newUrl);
        setImageLoaded(false);
      }
    }, 'image/jpeg', 0.95);
  };

  /**
   * Applies perspective warp homography and filters to construct high-res clean JPEG document blob.
   */
  /**
   * Processes the current canvas projection and returns a high-res JPEG Blob.
   */
  const processCurrentCanvas = () => {
    return new Promise((resolve, reject) => {
      try {
        const img = imageRef.current;
        const scaleX = naturalDim.width / displayDim.width;
        const scaleY = naturalDim.height / displayDim.height;

        const rawQuad = corners.map((c) => ({
          x: c.x * scaleX,
          y: c.y * scaleY
        }));

        const widthTLTR = Math.hypot(rawQuad[0].x - rawQuad[1].x, rawQuad[0].y - rawQuad[1].y);
        const widthBLBR = Math.hypot(rawQuad[3].x - rawQuad[2].x, rawQuad[3].y - rawQuad[2].y);
        let destW = Math.max(500, Math.round(Math.max(widthTLTR, widthBLBR)));

        const heightTLBL = Math.hypot(rawQuad[0].x - rawQuad[3].x, rawQuad[0].y - rawQuad[3].y);
        const heightTRBR = Math.hypot(rawQuad[1].x - rawQuad[2].x, rawQuad[1].y - rawQuad[2].y);
        let destH = Math.max(700, Math.round(Math.max(heightTLBL, heightTRBR)));

        // Compress image resolution before warping (dramatically improves speed & reduces file size)
        const maxDim = 1200;
        if (destW > maxDim || destH > maxDim) {
          if (destW > destH) {
            destH = Math.round((destH * maxDim) / destW);
            destW = maxDim;
          } else {
            destW = Math.round((destW * maxDim) / destH);
            destH = maxDim;
          }
        }

        let warpedData = warpPerspective(img, rawQuad, destW, destH);

        if (selectedFilter === 'color') warpedData = applyColorScanFilter(warpedData);
        else if (selectedFilter === 'bw') warpedData = applyBWScanFilter(warpedData);
        else if (selectedFilter === 'grayscale') warpedData = applyGrayscaleFilter(warpedData);

        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = destW;
        outputCanvas.height = destH;
        const outputCtx = outputCanvas.getContext('2d');
        outputCtx.putImageData(warpedData, 0, 0);

        outputCanvas.toBlob((blob) => {
          // CRITICAL: Explicitly zero canvas to instantly drop the GPU memory allocation before OS kills tab
          outputCanvas.width = 0;
          outputCanvas.height = 0;
          
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from scan segment.'));
          }
        }, 'image/jpeg', 0.80);

      } catch (err) {
        reject(err);
      }
    });
  };

  const handleNextFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // User successfully captured a new image! Move the pending segment to the official list.
    if (pendingSegmentRef.current) {
      setScannedParts((prev) => [...prev, pendingSegmentRef.current]);
      pendingSegmentRef.current = null;
    }

    try {
      const safeBlob = await downscaleImage(file, 1600);
      const sourceUrl = URL.createObjectURL(safeBlob);
      setCurrentImageSrc(sourceUrl);
      setImageLoaded(false);
    } catch (err) {
      console.error('Failed to downscale next segment:', err);
      alert('Error loading image. Please try again.');
    }
  };

  /**
   * Processes the current segment, stores it, and opens the camera for the next segment.
   */
  const handleAddSegment = () => {
    if (isProcessing) return;
    setIsProcessing(true);

    setTimeout(async () => {
      try {
        const blob = await processCurrentCanvas();
        // Hold the processed segment in a pending state. 
        // We only add it to the final array IF they don't cancel the camera dialog.
        pendingSegmentRef.current = blob;
        
        if (fileInputRef.current) {
          fileInputRef.current.value = ''; // Reset input
          fileInputRef.current.click();
        }
      } catch (err) {
        console.error('[Scanner] Processing failure:', err);
        alert(`Failed to warp image: ${err.message}`);
      }
      setIsProcessing(false);
    }, 50);
  };

  /**
   * Processes final segment, posts to OpenCV backend, and returns merged document.
   */
  const handleApplyScan = () => {
    if (isProcessing) return;
    setIsProcessing(true);

    setTimeout(async () => {
      try {
        const currentBlob = await processCurrentCanvas();
        const allParts = [...scannedParts, currentBlob];
        
        // Single segment, just return it instantly (no stitching needed)
        if (allParts.length === 1) {
          onSave(allParts[0]);
          return;
        }

        // Multiple overlapping segments: Post to OpenCV backend API
        const formData = new FormData();
        allParts.forEach((blob, idx) => {
          formData.append('segments', blob, `segment-${idx}.jpg`);
        });

        const res = await fetch('/api/stitch', {
          method: 'POST',
          body: formData
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to stitch images');
        }

        const data = await res.json();
        
        // The backend returns the URL of the stitched JPEG.
        // We fetch the URL to convert it back to a Blob for the parent form.
        const stitchedRes = await fetch(data.url);
        const stitchedBlob = await stitchedRes.blob();

        onSave(stitchedBlob);
      } catch (err) {
        console.error('[Scanner] Processing failure:', err);
        alert(`Failed to merge images: ${err.message}`);
        setIsProcessing(false);
      }
    }, 50);
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
            style={{ width: displayDim.width, height: displayDim.height, position: 'relative' }}
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
            
            {/* High-res DOM visual handles */}
            {corners.map((corner, idx) => (
              <div
                key={`corner-${idx}`}
                className={`crop-handle ${activeHandleIdx === idx ? 'active' : ''}`}
                style={{ left: corner.x, top: corner.y }}
              >
                <div className="crop-handle-inner"></div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Real-time Magnifying glass lens float */}
      <div
        className="magnifier-lens"
        style={{
          position: 'fixed',
          left: magnifier.x,
          top: magnifier.y,
          pointerEvents: 'none',
          zIndex: 9999,
          display: magnifier.show ? 'block' : 'none'
        }}
      >
        <canvas ref={magnifierCanvasRef} className="magnifier-canvas" />
      </div>

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

        <div className="action-buttons-tray" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isProcessing}>
            Discard
          </button>
          
          <button
            type="button"
            className="btn"
            style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}
            onClick={handleAddSegment}
            disabled={!imageLoaded || isProcessing}
          >
            {isProcessing ? '...' : '+ Add Segment'}
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
                {scannedParts.length > 0 ? 'Stitching & Aligning...' : 'Warping & Filtering...'}
              </div>
            ) : (
              scannedParts.length > 0 ? `Finish & Save (${scannedParts.length + 1} Parts)` : 'Scan & Save Receipt'
            )}
          </button>

          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="image/*"
            capture="environment"
            onChange={handleNextFileChange}
          />
        </div>
      </div>
    </div>
  );
}
