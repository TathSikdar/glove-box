/**
 * @fileoverview Image processing utilities for GloveBox's browser-side document scanner.
 * Includes a closed-form 2D homography solver, perspective warp engine,
 * and high-fidelity scanning filters (division-normalization shadow removal, high-contrast B&W, and grayscale).
 * Follows Google JavaScript Coding Standards.
 */

/**
 * Solves a 2x2 system of linear equations using Cramer's Rule.
 * Ax + By = C
 * Dx + Ey = F
 * @param {number} a Coefficient A
 * @param {number} b Coefficient B
 * @param {number} c Target value C
 * @param {number} d Coefficient D
 * @param {number} e Coefficient E
 * @param {number} f Target value F
 * @return {?Array<number>} Solving coefficients [x, y] or null if singular.
 */
function solve2x2(a, b, c, d, e, f) {
  const det = a * e - b * d;
  if (Math.abs(det) < 1e-8) {
    return null;
  }
  const x = (c * e - b * f) / det;
  const y = (a * f - c * d) / det;
  return [x, y];
}

/**
 * Computes the 3x3 homography matrix mapping from destination rectangle
 * to source quadrilateral coordinates. Used for backward mapping in warping.
 *
 * Source quadrilateral corner mappings:
 *   (0, 0) -> src0 (top-left)
 *   (w, 0) -> src1 (top-right)
 *   (w, h) -> src2 (bottom-right)
 *   (0, h) -> src3 (bottom-left)
 *
 * @param {number} w Destination width.
 * @param {number} h Destination height.
 * @param {Array<{x: number, y: number}>} srcQuad Array of 4 points {x, y} representing crop handles.
 * @return {?Array<number>} Flattend 9-element 3x3 homography matrix.
 */
export function computeHomography(w, h, srcQuad) {
  const [p0, p1, p2, p3] = srcQuad;

  const x0 = p0.x;
  const y0 = p0.y;
  const x1 = p1.x;
  const y1 = p1.y;
  const x2 = p2.x;
  const y2 = p2.y;
  const x3 = p3.x;
  const y3 = p3.y;

  // Deviation in coordinates to detect if the transformation is perspective
  const dx = x0 - x1 + x2 - x3;
  const dy = y0 - y1 + y2 - y3;

  // Coefficients for the perspective terms
  let h20 = 0;
  let h21 = 0;

  if (Math.abs(dx) > 1e-8 || Math.abs(dy) > 1e-8) {
    // Solve the 2x2 system for A and B
    // A*(x1 - x2) + B*(x3 - x2) = -dx
    // A*(y1 - y2) + B*(y3 - y2) = -dy
    const dx1 = x1 - x2;
    const dx2 = x3 - x2;
    const dy1 = y1 - y2;
    const dy2 = y3 - y2;

    const sol = solve2x2(dx1, dx2, -dx, dy1, dy2, -dy);
    if (!sol) {
      return null;
    }
    
    const [a, b] = sol;
    h20 = a / w;
    h21 = b / h;
  }

  // Calculate the remaining homography matrix terms
  const h00 = (x1 - x0 + h20 * w * x1) / w;
  const h01 = (x3 - x0 + h21 * h * x3) / h;
  const h02 = x0;

  const h10 = (y1 - y0 + h20 * w * y1) / w;
  const h11 = (y3 - y0 + h21 * h * y3) / h;
  const h12 = y0;

  return [
    h00, h01, h02,
    h10, h11, h12,
    h20, h21, 1.0
  ];
}

/**
 * Warps a source image from a cropped quadrilateral area into a flat,
 * rectangular destination canvas using bilinear interpolation to prevent aliasing.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} srcImage Source image element.
 * @param {Array<{x: number, y: number}>} srcQuad The 4 points of the cropping quadrilateral.
 * @param {number} destWidth Width of the destination canvas.
 * @param {number} destHeight Height of the destination canvas.
 * @return {ImageData} The warped pixel data.
 */
export function warpPerspective(srcImage, srcQuad, destWidth, destHeight) {
  // Draw the source image onto a temporary canvas to read its pixel data
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = srcImage.naturalWidth || srcImage.width;
  tempCanvas.height = srcImage.naturalHeight || srcImage.height;
  
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(srcImage, 0, 0);
  
  const srcData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const srcPixels = srcData.data;
  const srcW = srcData.width;
  const srcH = srcData.height;

  // Compute homography matrix mapping dest coords to source coords
  const h = computeHomography(destWidth, destHeight, srcQuad);
  if (!h) {
    throw new Error('Singular matrix exception: Invalid cropping quadrilateral.');
  }

  const [
    h00, h01, h02,
    h10, h11, h12,
    h20, h21
  ] = h;

  // Initialize output pixel buffer
  const destData = new ImageData(destWidth, destHeight);
  const destPixels = destData.data;

  // Perform backward mapping with bilinear interpolation
  for (let dy = 0; dy < destHeight; dy++) {
    for (let dx = 0; dx < destWidth; dx++) {
      // Apply projection formulas
      const wCoeff = h20 * dx + h21 * dy + 1.0;
      const sx = (h00 * dx + h01 * dy + h02) / wCoeff;
      const sy = (h10 * dx + h11 * dy + h12) / wCoeff;

      const destIdx = (dy * destWidth + dx) * 4;

      // Handle out of bound source coordinates
      if (sx < 0 || sx >= srcW - 1 || sy < 0 || sy >= srcH - 1) {
        destPixels[destIdx] = 255;     // White padding
        destPixels[destIdx + 1] = 255;
        destPixels[destIdx + 2] = 255;
        destPixels[destIdx + 3] = 255;
        continue;
      }

      // Bilinear interpolation
      const xFloor = Math.floor(sx);
      const yFloor = Math.floor(sy);
      const xWeight = sx - xFloor;
      const yWeight = sy - yFloor;

      const w00 = (1.0 - xWeight) * (1.0 - yWeight);
      const w10 = xWeight * (1.0 - yWeight);
      const w01 = (1.0 - xWeight) * yWeight;
      const w11 = xWeight * yWeight;

      // Calculate source buffer coordinates for adjacent pixels
      const idx00 = (yFloor * srcW + xFloor) * 4;
      const idx10 = (yFloor * srcW + (xFloor + 1)) * 4;
      const idx01 = ((yFloor + 1) * srcW + xFloor) * 4;
      const idx11 = ((yFloor + 1) * srcW + (xFloor + 1)) * 4;

      // Interpolate Red
      destPixels[destIdx] =
        srcPixels[idx00] * w00 +
        srcPixels[idx10] * w10 +
        srcPixels[idx01] * w01 +
        srcPixels[idx11] * w11;

      // Interpolate Green
      destPixels[destIdx + 1] =
        srcPixels[idx00 + 1] * w00 +
        srcPixels[idx10 + 1] * w10 +
        srcPixels[idx01 + 1] * w01 +
        srcPixels[idx11 + 1] * w11;

      // Interpolate Blue
      destPixels[destIdx + 2] =
        srcPixels[idx00 + 2] * w00 +
        srcPixels[idx10 + 2] * w10 +
        srcPixels[idx01 + 2] * w01 +
        srcPixels[idx11 + 2] * w11;

      // Alpha (solid opacity)
      destPixels[destIdx + 3] = 255;
    }
  }

  return destData;
}

/**
 * Performs a highly optimized O(N) 1D box blur horizontally and vertically
 * on an HTML5 canvas ImageData buffer.
 *
 * @param {ImageData} imageData The pixel data to blur.
 * @param {number} radius Blur radius (higher values create a wider local reference).
 * @return {Uint8ClampedArray} Flattened array of blurred color channels.
 */
export function fastBoxBlur(imageData, radius) {
  const width = imageData.width;
  const height = imageData.height;
  const src = imageData.data;
  const size = width * height;
  
  // Allocate target buffers for channel blending
  const blurred = new Uint8ClampedArray(size * 4);

  // Copy alpha channels
  for (let i = 3; i < src.length; i += 4) {
    blurred[i] = src[i];
  }

  // Temporary buffers to hold intermediate horizontal pass outputs
  const temp = new Uint8ClampedArray(size * 3);

  // Horizontal Blur Pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    
    // Accumulators
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    // Initialize sliding window sum
    for (let x = -radius; x <= radius; x++) {
      // Clamp edge pixels
      const clampedX = Math.max(0, Math.min(width - 1, x));
      const idx = (rowOffset + clampedX) * 4;
      sumR += src[idx];
      sumG += src[idx + 1];
      sumB += src[idx + 2];
    }

    // Slide window across the row
    for (let x = 0; x < width; x++) {
      const destIdx = (rowOffset + x) * 3;
      temp[destIdx] = sumR / (2 * radius + 1);
      temp[destIdx + 1] = sumG / (2 * radius + 1);
      temp[destIdx + 2] = sumB / (2 * radius + 1);

      // Subtract pixel leaving on the left, add pixel entering on the right
      const nextRightX = Math.min(width - 1, x + radius + 1);
      const nextLeftX = Math.max(0, x - radius);
      
      const idxRight = (rowOffset + nextRightX) * 4;
      const idxLeft = (rowOffset + nextLeftX) * 4;

      sumR += src[idxRight] - src[idxLeft];
      sumG += src[idxRight + 1] - src[idxLeft + 1];
      sumB += src[idxRight + 2] - src[idxLeft + 2];
    }
  }

  // Vertical Blur Pass
  for (let x = 0; x < width; x++) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    // Initialize sliding window sum
    for (let y = -radius; y <= radius; y++) {
      const clampedY = Math.max(0, Math.min(height - 1, y));
      const idx = (clampedY * width + x) * 3;
      sumR += temp[idx];
      sumG += temp[idx + 1];
      sumB += temp[idx + 2];
    }

    // Slide window vertically across columns
    for (let y = 0; y < height; y++) {
      const destIdx = (y * width + x) * 4;
      blurred[destIdx] = sumR / (2 * radius + 1);
      blurred[destIdx + 1] = sumG / (2 * radius + 1);
      blurred[destIdx + 2] = sumB / (2 * radius + 1);

      const nextBottomY = Math.min(height - 1, y + radius + 1);
      const nextTopY = Math.max(0, y - radius);

      const idxBottom = (nextBottomY * width + x) * 3;
      const idxTop = (nextTopY * width + x) * 3;

      sumR += temp[idxBottom] - temp[idxTop];
      sumG += temp[idxBottom + 1] - temp[idxTop + 1];
      sumB += temp[idxBottom + 2] - temp[idxTop + 2];
    }
  }

  return blurred;
}

/**
 * Applies a division-normalization filter to remove shadows, crumpled spots,
 * and uneven lighting from receipt photo documents. Returns high-quality
 * scanned white-background document rendering with full vibrant ink colors preserved.
 *
 * Formula: output = (original / (blurred + 1)) * scale
 *
 * @param {ImageData} imageData Input warped image pixels.
 * @return {ImageData} Enhanced document scan pixel data.
 */
export function applyColorScanFilter(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  
  // Calculate local lighting reference via large box-blur radius (e.g. 5% of dimensions)
  const blurRadius = Math.max(15, Math.floor(Math.min(width, height) * 0.05));
  const blurredPixels = fastBoxBlur(imageData, blurRadius);

  const outputData = new ImageData(width, height);
  const src = imageData.data;
  const dest = outputData.data;

  for (let i = 0; i < src.length; i += 4) {
    // Perform division normalization on R, G, B channels
    // We multiply by 240 to keep the paper color bright, white, and clear of ambient shadows.
    const r = Math.min(255, Math.round((src[i] / (blurredPixels[i] + 1)) * 240));
    const g = Math.min(255, Math.round((src[i + 1] / (blurredPixels[i + 1] + 1)) * 240));
    const b = Math.min(255, Math.round((src[i + 2] / (blurredPixels[i + 2] + 1)) * 240));

    // Enhance contrast of ink: push darker values down to make text extremely legible
    const brightness = (r + g + b) / 3;
    let factor = 1.0;
    if (brightness < 120) {
      factor = 0.8; // Darken dark elements slightly
    } else if (brightness > 220) {
      factor = 1.05; // Brighten light backgrounds to pure white
    }

    dest[i] = Math.max(0, Math.min(255, Math.round(r * factor)));
    dest[i + 1] = Math.max(0, Math.min(255, Math.round(g * factor)));
    dest[i + 2] = Math.max(0, Math.min(255, Math.round(b * factor)));
    dest[i + 3] = 255;
  }

  return outputData;
}

/**
 * Converts image pixels into stark, ultra-crisp Black and White format.
 * Ideal for high-contrast receipt printing outputs.
 *
 * @param {ImageData} imageData Input warped image pixels.
 * @return {ImageData} Binarized high contrast document pixels.
 */
export function applyBWScanFilter(imageData) {
  // First, extract the color-scan optimized output (shadow-free)
  const colorScan = applyColorScanFilter(imageData);
  
  const dest = colorScan.data;
  const threshold = 180; // Standard midpoint binarization on pre-cleared text

  for (let i = 0; i < dest.length; i += 4) {
    // Compute luminance
    const luma = 0.299 * dest[i] + 0.587 * dest[i + 1] + 0.114 * dest[i + 2];
    
    // Assign pure white or pure black
    const finalVal = luma < threshold ? 20 : 255; // Uses slight dark gray (20) for smoother look

    dest[i] = finalVal;
    dest[i + 1] = finalVal;
    dest[i + 2] = finalVal;
    // Keep alpha at 255
  }

  return colorScan;
}

/**
 * Converts image pixels into standard smooth Grayscale format.
 *
 * @param {ImageData} imageData Input warped image pixels.
 * @return {ImageData} Grayscale pixels.
 */
export function applyGrayscaleFilter(imageData) {
  const outputData = new ImageData(imageData.width, imageData.height);
  const src = imageData.data;
  const dest = outputData.data;

  for (let i = 0; i < src.length; i += 4) {
    const luma = Math.round(0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]);
    dest[i] = luma;
    dest[i + 1] = luma;
    dest[i + 2] = luma;
    dest[i + 3] = 255;
  }

  return outputData;
}

export function autoDetectDocumentCorners(img) {
  // Use a small offscreen canvas for extremely fast pixel operations (~0.2ms)
  const w = 240;
  const h = 320;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // 1. Convert color channels to grayscaled luminance
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }

  // 2. Bradley-Roth O(N) Adaptive Thresholding (via integral image)
  // Perfectly handles variable gradients, uneven lighting, notches, and shadows.
  const S = Math.round(w / 8); // Local block window width
  const T = 0.15; // Threshold percentage
  const intImg = new Int32Array(w * h);
  
  // Compute the integral image (summed-area table)
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      sum += gray[idx];
      if (y === 0) {
        intImg[idx] = sum;
      } else {
        intImg[idx] = intImg[idx - w] + sum;
      }
    }
  }

  // Binarize the grayscale image adaptively
  const binary = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      
      const x1 = Math.max(0, x - Math.floor(S / 2));
      const x2 = Math.min(w - 1, x + Math.floor(S / 2));
      const y1 = Math.max(0, y - Math.floor(S / 2));
      const y2 = Math.min(h - 1, y + Math.floor(S / 2));
      
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      
      let sum = intImg[y2 * w + x2];
      if (x1 > 0) sum -= intImg[y2 * w + (x1 - 1)];
      if (y1 > 0) sum -= intImg[(y1 - 1) * w + x2];
      if (x1 > 0 && y1 > 0) sum += intImg[(y1 - 1) * w + (x1 - 1)];
      
      if (gray[idx] * count < sum * (1.0 - T)) {
        binary[idx] = 0; // Dark background
      } else {
        binary[idx] = 255; // Bright paper foreground
      }
    }
  }

  // 3. Connected-Component Labeler (Connected Blob Flood Fill)
  // Isolates the receipt paper itself and completely filters out ambient desk clutter or high frequency noise.
  // Masks out the outer 3% margin to ignore fingers, scanning bezels, or image border artifacts.
  const borderX = Math.round(w * 0.03);
  const borderY = Math.round(h * 0.03);
  
  const labels = new Int32Array(w * h);
  let nextLabel = 1;
  const labelSizes = {};
  
  // Flat stack to prevent JS call stack overflows during DFS/BFS operations
  const stack = new Int32Array(w * h);

  for (let y = borderY; y < h - borderY; y++) {
    for (let x = borderX; x < w - borderX; x++) {
      const startIdx = y * w + x;
      
      // If it is foreground and not yet labeled
      if (binary[startIdx] === 255 && labels[startIdx] === 0) {
        const currentLabel = nextLabel++;
        let size = 0;
        
        let stackPtr = 0;
        stack[stackPtr++] = startIdx;
        labels[startIdx] = currentLabel;
        
        while (stackPtr > 0) {
          const idx = stack[--stackPtr];
          size++;
          
          const px = idx % w;
          const py = Math.floor(idx / w);
          
          // Explore 4-connected neighbors
          const neighbors = [idx - 1, idx + 1, idx - w, idx + w];
          for (let i = 0; i < neighbors.length; i++) {
            const nIdx = neighbors[i];
            const nx = nIdx % w;
            const ny = Math.floor(nIdx / w);
            
            // Stay within border margins and valid boundaries
            if (nx >= borderX && nx < w - borderX && ny >= borderY && ny < h - borderY) {
              if (binary[nIdx] === 255 && labels[nIdx] === 0) {
                labels[nIdx] = currentLabel;
                stack[stackPtr++] = nIdx;
              }
            }
          }
        }
        
        labelSizes[currentLabel] = size;
      }
    }
  }

  // Find the largest foreground connected component label
  let largestLabel = 0;
  let maxSize = 0;
  for (const label in labelSizes) {
    if (labelSizes[label] > maxSize) {
      maxSize = labelSizes[label];
      largestLabel = parseInt(label, 10);
    }
  }

  // 4. Extract exact document quad corners based on the isolated largest component
  // TL: minimizes x + y
  // TR: maximizes x - y
  // BR: maximizes x + y
  // BL: minimizes x - y
  let minSum = Infinity, tl = { x: 0.12, y: 0.12 };
  let maxDiff = -Infinity, tr = { x: 0.88, y: 0.12 };
  let maxSum = -Infinity, br = { x: 0.88, y: 0.88 };
  let minDiff = Infinity, bl = { x: 0.12, y: 0.88 };

  const minAcceptableSize = w * h * 0.05; // Fallback if document is less than 5% of screen
  
  if (largestLabel > 0 && maxSize >= minAcceptableSize) {
    for (let y = borderY; y < h - borderY; y++) {
      for (let x = borderX; x < w - borderX; x++) {
        const idx = y * w + x;
        if (labels[idx] === largestLabel) {
          const sum = x + y;
          const diff = x - y;

          if (sum < minSum) {
            minSum = sum;
            tl = { x: x / w, y: y / h };
          }
          if (diff > maxDiff) {
            maxDiff = diff;
            tr = { x: x / w, y: y / h };
          }
          if (sum > maxSum) {
            maxSum = sum;
            br = { x: x / w, y: y / h };
          }
          if (diff < minDiff) {
            minDiff = diff;
            bl = { x: x / w, y: y / h };
          }
        }
      }
    }
  } else {
    // Return standard preset layout boundaries if no valid paper block is isolated
    const inset = 0.12;
    return [
      { x: inset, y: inset },
      { x: 1.0 - inset, y: inset },
      { x: 1.0 - inset, y: 1.0 - inset },
      { x: inset, y: 1.0 - inset }
    ];
  }

  // 5. Apply a high-end 1.5% inset polish
  // Pushing corners slightly inside the detected paper limits prevents dark desk pixels from leaking on the scan borders.
  const insetFactor = 0.015;
  const finalCorners = [
    { x: tl.x + insetFactor, y: tl.y + insetFactor },
    { x: tr.x - insetFactor, y: tr.y + insetFactor },
    { x: br.x - insetFactor, y: br.y - insetFactor },
    { x: bl.x + insetFactor, y: bl.y - insetFactor }
  ];

  return finalCorners;
}
