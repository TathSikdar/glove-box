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

    const sol = solve2x2(dx1, dx2, dx, dy1, dy2, dy);
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

/**
 * Vertically merges an array of image blobs into a single tall, continuous image canvas.
 * Ideal for combining multiple segments of a long receipt.
 * @param {Array<Blob>} blobArray Array of image blobs to merge.
 * @return {Promise<Blob>} A promise that resolves to the merged JPEG blob.
 */
export async function mergeImagesVertically(blobArray) {
  if (!blobArray || blobArray.length === 0) return null;
  if (blobArray.length === 1) return blobArray[0];

  // Load all blobs into Image objects to read dimensions
  const images = await Promise.all(blobArray.map(blob => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        resolve(img);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }));

  // Calculate final canvas dimensions
  // Width will be the maximum width of all segments, height will be sum of all heights
  const finalWidth = Math.max(...images.map(img => img.width));
  const finalHeight = images.reduce((acc, img) => acc + img.height, 0);

  const canvas = document.createElement('canvas');
  canvas.width = finalWidth;
  canvas.height = finalHeight;
  const ctx = canvas.getContext('2d');

  // Fill background with white in case of width differences
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, finalWidth, finalHeight);

  // Draw images sequentially downwards
  let currentY = 0;
  for (const img of images) {
    // Center smaller images horizontally if widths differ
    const xOffset = (finalWidth - img.width) / 2;
    ctx.drawImage(img, xOffset, currentY);
    currentY += img.height;
  }

  // Export to high-quality JPEG
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg', 0.90);
  });
}

/**
 * Downscales a raw high-resolution camera photo safely.
 * Uses modern createImageBitmap for zero-RAM-spike native decoding where supported,
 * preventing mobile browser Out-Of-Memory (OOM) crashes on 24MP+ images.
 * @param {File|Blob} file The raw image file from the camera.
 * @param {number} maxDim The maximum width dimension (e.g., 1600).
 * @return {Promise<Blob>} A promise resolving to the downscaled JPEG blob.
 */
export async function downscaleImage(file, maxDim = 1200) {
  return new Promise((resolve, reject) => {
    try {
      let canvas = document.createElement('canvas');
      let ctx = canvas.getContext('2d');

      // Always use Image() fallback. createImageBitmap causes massive RAM spikes on iOS Safari 
      // when decoding 24MP+ images because WebKit decodes the entire image uncompressed into RAM.
      const img = new Image();
      const tempUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(tempUrl);
        let { width, height } = img;
        
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        } else {
          resolve(file);
          return;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          // CRITICAL: Explicitly zero canvas to instantly drop the GPU memory allocation
          canvas.width = 0;
          canvas.height = 0;
          img.src = ''; // Instantly free the Image source from RAM
          
          if (blob) resolve(blob);
          else reject(new Error('Canvas to Blob failed'));
        }, 'image/jpeg', 0.90);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(tempUrl);
        reject(new Error('Failed to load image for downscaling'));
      };
      
      img.src = tempUrl;
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Processes an image Blob to optimize it for OCR engines handling dot-matrix fonts.
 * 1. Grayscale
 * 2. Adaptive Binarization (Otsu-like localized window)
 * 3. Morphological Dilation (connecting disconnected dot-matrix ink)
 * @param {Blob} sourceBlob The input image.
 * @returns {Promise<Blob>} The highly optimized B&W image blob.
 */
export async function applyOcrOptimizationFilter(sourceBlob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(sourceBlob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let w = img.width;
      let h = img.height;
      
      // CRITICAL: Downscale massive camera photos to prevent locking up the UI thread 
      // during the 5-pass pixel math operations! 1000px is optimal for Tesseract.
      const MAX_WIDTH = 1000;
      if (w > MAX_WIDTH) {
        h = Math.round((MAX_WIDTH / w) * h);
        w = MAX_WIDTH;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      
      // Draw image to canvas, downscaling automatically if needed
      ctx.drawImage(img, 0, 0, w, h);
      
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      
      // 1. Grayscale extraction (luminance)
      const gray = new Uint8Array(w * h);
      for (let i = 0; i < data.length; i += 4) {
        gray[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      
      // 1.5 Contrast Stretching (Histogram Normalization)
      // We find the 2nd and 98th percentile to ignore extreme outliers like dust or glare
      const histogram = new Int32Array(256);
      for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;
      
      const totalPixels = w * h;
      let minGray = 0;
      let maxGray = 255;
      
      let pixelSum = 0;
      for (let i = 0; i < 256; i++) {
        pixelSum += histogram[i];
        if (pixelSum > totalPixels * 0.02) { minGray = i; break; }
      }
      
      pixelSum = 0;
      for (let i = 255; i >= 0; i--) {
        pixelSum += histogram[i];
        if (pixelSum > totalPixels * 0.02) { maxGray = i; break; }
      }
      
      const range = Math.max(1, maxGray - minGray);
      for (let i = 0; i < gray.length; i++) {
        let val = gray[i];
        if (val < minGray) val = minGray;
        if (val > maxGray) val = maxGray;
        // Stretch the faded ink to pitch black (0) and the grayish paper to pure white (255)
        gray[i] = Math.round(((val - minGray) / range) * 255);
      }
      
      // 2. Bradley-Roth Adaptive Binarization (removes shadows/gradients)
      const S = Math.round(w / 16); 
      // CRITICAL: Lower threshold to 8% to massively boost sensitivity for faint/dulled gray ink
      const T = 0.08; 
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
            binary[idx] = 0; // Black text
          } else {
            binary[idx] = 255; // White background
          }
        }
      }

      // 3. Morphological Dilation
      // For any black pixel (0), we turn its immediate surrounding neighbors black.
      // This bridges the gaps in dot-matrix letters!
      const dilated = new Uint8Array(w * h);
      // Pre-fill with white
      for (let i = 0; i < dilated.length; i++) dilated[i] = 255;
      
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          if (binary[idx] === 0) {
            // Text pixel! Dilate to the 8 neighbors
            dilated[idx] = 0;
            dilated[idx - 1] = 0; // left
            dilated[idx + 1] = 0; // right
            dilated[idx - w] = 0; // top
            dilated[idx + w] = 0; // bottom
            dilated[idx - w - 1] = 0; // top-left
            dilated[idx - w + 1] = 0; // top-right
            dilated[idx + w - 1] = 0; // bottom-left
            dilated[idx + w + 1] = 0; // bottom-right
          }
        }
      }

      // 4. Write back to Canvas
      for (let i = 0; i < dilated.length; i++) {
        const val = dilated[i];
        data[i * 4] = val;
        data[i * 4 + 1] = val;
        data[i * 4 + 2] = val;
        data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      
      canvas.toBlob((b) => {
        // Purge memory
        canvas.width = 0;
        canvas.height = 0;
        resolve(b);
      }, 'image/jpeg', 0.95);
    };
    
    img.onerror = () => reject(new Error('Failed to load image for OCR optimization'));
    
    img.src = url; // Actually trigger the load!
  });
}
