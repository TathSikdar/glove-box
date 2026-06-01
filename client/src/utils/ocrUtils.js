import Tesseract from 'tesseract.js';

/**
 * Initializes Tesseract, processes the image, and gracefully terminates the worker.
 * @param {Blob} imageBlob The scanned image blob to read.
 * @param {function(number, string): void} onProgress Callback for tracking OCR phase and progress percentage.
 * @returns {Promise<Object>} The parsed fuel data object.
 */
export async function extractReceiptData(imageBlob, onProgress) {
  try {
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        // Tesseract emits multiple statuses: 'loading tesseract core', 'initializing api', 'recognizing text'
        if (onProgress) {
          let progressValue = m.progress || 0;
          let message = 'Preparing OCR Engine...';
          
          if (m.status === 'recognizing text') {
            message = 'Extracting Text...';
          } else if (m.status.includes('loading')) {
            message = 'Loading Neural Model...';
          }
          
          onProgress(progressValue, message);
        }
      }
    });

    // Configure Tesseract to treat the receipt as a single column of text of variable sizes
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM ? Tesseract.PSM.SINGLE_COLUMN : '4',
    });

    const { data: { text } } = await worker.recognize(imageBlob);
    await worker.terminate();

    return parseFuelReceiptText(text);
  } catch (err) {
    console.error('OCR Engine Failure:', err);
    throw new Error('Failed to extract text from receipt');
  }
}

/**
 * Uses fuzzy heuristics and standard receipt patterns to extract Volume and Price per Liter.
 * @param {string} rawText The raw text block from Tesseract.
 * @returns {Object} Extracted data: { liters, pricePerLiter }
 */
export function parseFuelReceiptText(rawText) {
  // Normalize OCR output (O -> 0 is common, but risky. We'll leave it out for now to prevent false positives)
  const lines = rawText.split('\n').map(l => l.trim().toUpperCase());
  
  let liters = null;
  let price = null;
  let total = null;

  // 1. MATHEMATICS COMBINATORICS SOLVER
  // Extract EVERY decimal number from the text
  const floats = [];
  // Matches things like 1.459, 50.123, 73.13. Supports commas as decimals due to OCR artifacts.
  const floatRegex = /\b(\d+)[.,](\d{2,3})\b/g;
  let match;
  while ((match = floatRegex.exec(rawText)) !== null) {
    const val = parseFloat(`${match[1]}.${match[2]}`);
    if (!isNaN(val) && val > 0 && !floats.includes(val)) {
      floats.push(val);
    }
  }

  // Cross-multiply every single triplet to find the universal truth: Volume * Price = Total
  let mathMatchFound = false;
  for (let i = 0; i < floats.length; i++) {
    for (let j = 0; j < floats.length; j++) {
      if (i === j) continue;
      
      const A = floats[i];
      const B = floats[j];
      const product = A * B;
      
      // Look for a C that matches the product
      for (let k = 0; k < floats.length; k++) {
        if (k === i || k === j) continue;
        const C = floats[k];
        
        // Check if A * B ≈ C (allow 0.05 margin of error for rounding differences like 1.459 * 50.123)
        if (Math.abs(product - C) < 0.05) {
          // Assign A and B based on realistic physical bounds
          let candidatePrice = null;
          let candidateVol = null;
          
          // Prices rarely exceed $8/L, and fillups are rarely < 2 Liters
          if (A < 8.0 && B > 2.0) {
            candidatePrice = A;
            candidateVol = B;
          } else if (B < 8.0 && A > 2.0) {
            candidatePrice = B;
            candidateVol = A;
          }
          
          if (candidatePrice && candidateVol && C > 5.0) {
            price = candidatePrice;
            liters = candidateVol;
            total = C;
            mathMatchFound = true;
            break;
          }
        }
      }
      if (mathMatchFound) break;
    }
    if (mathMatchFound) break;
  }

  // 2. REGEX FALLBACK (If OCR missed one of the 3 core numbers)
  if (!mathMatchFound) {
    // Matches: 50.123 L, 50.123 LITERS
    const volRegex = /((?:\d{1,3}[, ])*\d{1,3}\.\d{1,3})\s*(?:L|LITERS|LITRES|GAL|G|GALLONS)\b/;
    const explicitPriceRegex = /(?:@|PRICE|PUMP|CENTS|\$)\D*([0-9]\.\d{2,3})\b/;
    const totalRegex = /TOTAL\s*(?:\$)?\s*(\d+\.\d{2})/;

  // First pass: Explicitly labeled data
  for (const line of lines) {
    if (!total && line.includes('TOTAL')) {
      const match = line.match(totalRegex) || line.match(/(?:\$)\s*(\d+\.\d{2})/);
      if (match) total = parseFloat(match[1]);
    }
    
    if (!liters) {
      const match = line.match(volRegex);
      if (match) {
        // Sanitize OCR commas or accidental spaces in numbers
        const val = match[1].replace(/[, ]/g, '');
        const floatVal = parseFloat(val);
        // Reality check: Passenger vehicles rarely hold < 2 or > 300 liters
        if (floatVal > 2 && floatVal < 300) {
          liters = floatVal;
        }
      }
    }

    if (!price && (line.includes('PRICE') || line.includes('$/L') || line.includes('@'))) {
      const match = line.match(/\b([0-9]\.\d{2,3})\b/);
      if (match) {
        const p = parseFloat(match[1]);
        if (p > 0.3 && p < 8.0) price = p; // Fuel prices rarely exceed $8/L globally right now
      }
    }
  }

  // Second pass: Implicit data (fallback)
  if (!price) {
    for (const line of lines) {
      // Just look for the first highly plausible gas price number (e.g. 1.459)
      const match = line.match(/\b([0-9]\.\d{2,3})\b/);
      if (match) {
        const p = parseFloat(match[1]);
        // To prevent false positives from volume, price must be < 4.0
        if (p > 0.5 && p < 4.0) {
          price = p;
          break;
        }
      }
    }
  }

  // Final fallback: Mathematical deduction
  // If OCR read the Volume and the Total Cost perfectly, but missed the tiny Price/L text:
  if (!price && total && liters) {
    price = total / liters;
  }
  
  } // End of !mathMatchFound fallback

  return {
    liters: liters ? liters.toFixed(2) : null,
    pricePerLiter: price ? price.toFixed(3) : null,
    rawText
  };
}
