/**
 * @fileoverview Fuel Logging & Economy Analytics Component for GloveBox.
 * Displays fuel metrics (total cost, volume, mileage span, and average fuel economy),
 * features a real-time cost-calculating log form, and lists past fill-ups.
 * Follows Google Coding Standards and React best practices.
 */

import React, { useState, useEffect, useRef } from 'react';
import DocumentScanner from './DocumentScanner';

import { downscaleImage, applyOcrOptimizationFilter } from '../utils/scannerUtils';
import { extractReceiptData } from '../utils/ocrUtils';

/**
 * FuelLogView component.
 * @param {!Object} props Component properties.
 * @param {number} props.activeCarId The active vehicle ID.
 * @param {!Object} props.activeCar The active vehicle details.
 * @param {!Array<!Object>} props.fuelLogs The list of fuel logs from App shell.
 * @param {function(): void} props.onRefresh Callback to trigger a data reload.
 * @return {!React.ReactElement}
 */
export default function FuelLogView({ activeCarId, activeCar, onRefresh }) {
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [kms, setKms] = useState('');
  const [liters, setLiters] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [fullTank, setFullTank] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Scanned Receipt & OCR states
  const fileInputRef = useRef(null);
  const [rawImageSrc, setRawImageSrc] = useState(null);
  const [scannedBlob, setScannedBlob] = useState(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showPreviewLightbox, setShowPreviewLightbox] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [isScanningOCR, setIsScanningOCR] = useState(false);
  const [ocrMessage, setOcrMessage] = useState(null);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (receiptPreviewUrl && receiptPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(receiptPreviewUrl);
      }
      if (rawImageSrc && rawImageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(rawImageSrc);
      }
    };
  }, [receiptPreviewUrl, rawImageSrc]);


  // Real-time Total Cost preview calculated as the user types
  const numericLiters = parseFloat(liters) || 0;
  const numericPrice = parseFloat(pricePerLiter) || 0;
  const totalCostPreview = (numericLiters * numericPrice).toFixed(2);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Downscale massive camera photos to prevent mobile OOM tab crashes
    try {
      const safeBlob = await downscaleImage(file, 1600);
      const sourceUrl = URL.createObjectURL(safeBlob);
      setRawImageSrc(sourceUrl);
      setShowScanner(true);
    } catch (err) {
      console.error('Failed to downscale image:', err);
      alert('Error loading image. Please try again.');
    }
  };

  const handleScanSave = async (blob) => {
    const previewUrl = URL.createObjectURL(blob);
    setScannedBlob(blob);
    setReceiptPreviewUrl(previewUrl);
    setShowScanner(false);

    if (rawImageSrc && rawImageSrc.startsWith('blob:')) {
      URL.revokeObjectURL(rawImageSrc);
    }
    setRawImageSrc(null);

    // Trigger on-device real OCR text extraction
    setIsScanningOCR(true);
    setOcrMessage('Waking up OCR Engine...');

    try {
      setOcrMessage('Transmitting receipt to Gemini Vision AI...');
      
      const formData = new FormData();
      formData.append('receipt', blob, 'receipt.jpg');
      
      const res = await fetch('/api/parse-receipt', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) {
        throw new Error('Backend failed to parse receipt');
      }
      
      setOcrMessage('Analyzing image and verifying math...');
      const result = await res.json();
      const parsed = result.data;

      // Populate results
      if (parsed.liters || parsed.pricePerLiter) {
        if (parsed.liters) setLiters(parsed.liters);
        if (parsed.pricePerLiter) setPricePerLiter(parsed.pricePerLiter);
        
        const L = parsed.liters || '??';
        const P = parsed.pricePerLiter || '??';
        setOcrMessage(`✨ Gemini Vision AI auto-filled Volume (${L} L) and Price ($${P}/L) from receipt!`);
      } else {
        setOcrMessage(`⚠️ Could not automatically detect volume or price from the receipt text. Please enter manually.`);
      }
    } catch (err) {
      console.error(err);
      setOcrMessage('❌ Gemini AI failed to process the image.');
    } finally {
      setIsScanningOCR(false);
    }
  };

  const handleRemoveReceipt = () => {
    setScannedBlob(null);
    setReceiptPreviewUrl(null);
    setOcrMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const closePreviewLightbox = () => {
    setShowPreviewLightbox(false);
    setZoomScale(1);
  };

  /**
   * Submits the new fuel fill-up record to the Express server.
   * @param {!React.FormEvent} e Form submission event.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!kms || !liters || !pricePerLiter || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const formData = new FormData();
      formData.append('car_id', activeCarId);
      formData.append('date', date);
      formData.append('kms', parseInt(kms, 10));
      formData.append('liters', parseFloat(liters));
      formData.append('price_per_liter', parseFloat(pricePerLiter));
      formData.append('full_tank', fullTank ? '1' : '0');

      if (scannedBlob) {
        formData.append('receipt', scannedBlob, 'receipt-scan.jpg');
      }

      const res = await fetch('/api/fuel', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error('Failed to save fuel log.');
      }

      // Reset form states
      setLiters('');
      setPricePerLiter('');
      setFullTank(true);
      setScannedBlob(null);
      setReceiptPreviewUrl(null);
      setOcrMessage(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onRefresh();
    } catch (err) {
      console.error('[FuelLogView] Form submit failure:', err);
      alert(`Error logging fill-up: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Deletes a specific fuel fill-up log.
   * @param {number} id Fuel log ID.
   */
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this fuel log entry?')) return;

    try {
      const res = await fetch(`/api/fuel/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete fuel log');
      onRefresh();
    } catch (err) {
      console.error('[FuelLogView] Deletion error:', err);
      alert(`Error deleting entry: ${err.message}`);
    }
  };

  return (
    <>
      <div className="form-container fade-in">
        
        {/* Form panel */}
        <div className="card-glass p-6" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>⛽ Log Fuel Fill-Up</h2>
            <p className="text-secondary text-sm" style={{ margin: '4px 0 0 0' }}>Record odometer mileage and fuel volumes to monitor economy trends.</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="fuel-date">Fill-Up Date</label>
                <input
                  id="fuel-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="fuel-kms">Odometer Reading (km)</label>
                <input
                  id="fuel-kms"
                  type="number"
                  placeholder="e.g. 102500"
                  value={kms}
                  onChange={(e) => setKms(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="fuel-liters">Volume Filled (Liters)</label>
                <input
                  id="fuel-liters"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 45.2"
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="fuel-price">Price per Liter ($/L)</label>
                <input
                  id="fuel-price"
                  type="number"
                  step="0.001"
                  placeholder="e.g. 1.629"
                  value={pricePerLiter}
                  onChange={(e) => setPricePerLiter(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Receipt upload - camera capture */}
            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label>Receipt Scanner (Optional)</label>
              
              {isScanningOCR ? (
                <div className="ocr-scanning-overlay card-glass" style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2rem',
                  gap: '12px',
                  background: 'rgba(0, 242, 254, 0.03)',
                  border: '1px dashed var(--neon-teal)',
                  borderRadius: 'var(--border-radius-sm)',
                  boxShadow: '0 0 20px rgba(0, 242, 254, 0.05)'
                }}>
                  <div className="spinner" style={{ borderColor: 'var(--neon-teal) transparent transparent transparent' }}></div>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--neon-teal)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    🔍 Scanning Receipt text...
                  </span>
                  <p className="text-secondary text-xs" style={{ margin: 0 }}>Reading volume filled and price per liter details locally...</p>
                </div>
              ) : receiptPreviewUrl ? (
                <div className="receipt-preview-card card-glass" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '12px 14px',
                  border: '1px solid var(--border-glass)',
                  borderRadius: 'var(--border-radius-sm)',
                  background: 'rgba(255,255,255,0.01)'
                }}>
                  <img
                    src={receiptPreviewUrl}
                    alt="Receipt preview"
                    onClick={() => setShowPreviewLightbox(true)}
                    title="Click to Zoom Receipt"
                    style={{
                      width: '64px',
                      height: '64px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      border: '1px solid var(--border-glass)',
                      cursor: 'pointer'
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <span className="scanned-badge" style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: 'var(--neon-teal)',
                      background: 'rgba(0, 242, 254, 0.06)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      width: 'fit-content'
                    }}>
                      ✓ Scanned Successfully
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveReceipt}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--error-red)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        textAlign: 'left',
                        textDecoration: 'underline'
                      }}
                    >
                      Remove receipt image
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="file-dropzone"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.25rem',
                    border: '1px dashed var(--border-glass)',
                    borderRadius: 'var(--border-radius-sm)',
                    background: 'rgba(255, 255, 255, 0.01)',
                    cursor: 'pointer',
                    transition: 'var(--transition-smooth)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(0, 242, 254, 0.25)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-glass)'}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2" style={{ color: 'var(--text-secondary)' }}>
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                  </svg>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Scan Receipt to Auto-fill Volume & Price</span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileChange}
                  />
                </div>
              )}
            </div>

            {ocrMessage && (
              <div className="ocr-success-message" style={{
                background: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 'var(--border-radius-sm)',
                padding: '10px 14px',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--success-green)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                animation: 'fadeIn 0.3s ease'
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                {ocrMessage}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={fullTank}
                  onChange={(e) => setFullTank(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    accentColor: 'var(--neon-teal)',
                    cursor: 'pointer'
                  }}
                />
                Filled to Full Tank
              </label>

              {/* Real-time calculated price tag */}
              {numericLiters > 0 && numericPrice > 0 && (
                <div className="cost-preview-pill" style={{
                  background: 'rgba(0, 242, 254, 0.08)',
                  border: '1px solid rgba(0, 242, 254, 0.25)',
                  borderRadius: '30px',
                  padding: '5px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--neon-teal)',
                  boxShadow: '0 0 15px rgba(0, 242, 254, 0.1)'
                }}>
                  Estimated Cost: <strong>${totalCostPreview}</strong>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-glow mt-2"
              disabled={isSubmitting || !kms || !liters || !pricePerLiter}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isSubmitting ? 'Logging fill-up...' : 'Log Fill-Up'}
            </button>
          </form>
        </div>
      </div>

      {/* Camera Document Scanner Modal overlay */}
      {showScanner && rawImageSrc && (
        <DocumentScanner
          imageSrc={rawImageSrc}
          onSave={handleScanSave}
          onCancel={() => {
            setShowScanner(false);
            setRawImageSrc(null);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          }}
        />
      )}

      {/* Scanned Receipt Preview Full-Screen Lightbox */}
      {showPreviewLightbox && (
        <div className="lightbox-modal" onClick={closePreviewLightbox} style={{ zIndex: 30000 }}>
          {/* Close button top right */}
          <button type="button" className="lightbox-close-btn" onClick={closePreviewLightbox}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          {/* Bottom Zoom Controls */}
          <div className="lightbox-controls-overlay" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn-circle" onClick={() => setZoomScale((z) => Math.max(z - 0.5, 1))} disabled={zoomScale <= 1}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <span className="zoom-indicator">{Math.round(zoomScale * 100)}%</span>
            <button type="button" className="btn-circle" onClick={() => setZoomScale((z) => Math.min(z + 0.5, 4))} disabled={zoomScale >= 4}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>

          {/* Interactive Image Viewport */}
          <div className="lightbox-viewport">
            <div
              className="lightbox-img-wrapper"
              style={{
                transform: `scale(${zoomScale})`,
                transition: 'transform 0.15s ease-out'
              }}
            >
              <img
                src={receiptPreviewUrl}
                alt="Enlarged Scanned Fuel Receipt Preview"
                className="lightbox-image"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
