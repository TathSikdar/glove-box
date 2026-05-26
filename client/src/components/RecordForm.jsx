/**
 * @fileoverview Log Logging/Entry Form Component for GloveBox.
 * Supports adding or editing maintenance logs and custom vehicle modifications,
 * handles phone camera/file captures, and triggers the inline DocumentScanner.
 * Follows Google Coding Standards and React best practices.
 */

import React, { useState, useEffect, useRef } from 'react';
import DocumentScanner from './DocumentScanner';
import CategoryIcon from './CategoryIcon';

/**
 * Form for adding/editing records.
 * @param {!Object} props React component props.
 * @param {?Object} props.editRecord Existing record for modification, or null.
 * @param {number} props.activeCarId The currently active vehicle ID.
 * @param {function(!FormData): Promise<void>} props.onSubmit Handles saving/submitting log data.
 * @param {function(): void} props.onCancel Redirects back to dashboard/records list.
 * @return {!React.ReactElement}
 */
export default function RecordForm({ editRecord, activeCarId, onSubmit, onCancel }) {
  const fileInputRef = useRef(null);

  // Core form field states
  const [category, setCategory] = useState('oil_change');
  const [title, setTitle] = useState('');
  const [kms, setKms] = useState('');
  const [date, setDate] = useState('');
  const [cost, setCost] = useState('');
  const [notes, setNotes] = useState('');

  // Upload/Scanner states
  const [rawImageSrc, setRawImageSrc] = useState(null); // Captured raw photo source
  const [scannedBlob, setScannedBlob] = useState(null); // Output warped & filtered receipt blob
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState(null); // Preview URL of processed receipt
  const [showScanner, setShowScanner] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const categoriesList = [
    { value: 'oil_change', label: 'Oil Change' },
    { value: 'transmission_fluid', label: 'Transmission Fluid' },
    { value: 'cabin_air_filter', label: 'Cabin Air Filter' },
    { value: 'engine_air_filter', label: 'Engine Air Filter' },
    { value: 'brake_pads', label: 'Brake Pads' },
    { value: 'brake_rotor', label: 'Brake Rotors' },
    { value: 'brake_fluid', label: 'Brake Fluid' },
    { value: 'spark_plugs', label: 'Spark Plugs' },
    { value: 'custom_maintenance', label: 'Custom Maintenance' },
    { value: 'modification', label: 'Modification / Upgrade' }
  ];

  const getCategoryLabel = (val) => {
    const found = categoriesList.find((c) => c.value === val);
    return found ? found.label : val;
  };

  // Close custom dropdown on clicking outside
  useEffect(() => {
    if (!isDropdownOpen) return;
    const closeDropdown = () => setIsDropdownOpen(false);
    window.addEventListener('click', closeDropdown);
    return () => window.removeEventListener('click', closeDropdown);
  }, [isDropdownOpen]);

  // Set default values on mounting (defaults to current date)
  useEffect(() => {
    if (editRecord) {
      setCategory(editRecord.category);
      setTitle(editRecord.title);
      setKms(editRecord.kms.toString());
      setDate(editRecord.date);
      setCost(editRecord.cost.toString());
      setNotes(editRecord.notes || '');
      if (editRecord.receipt_image) {
        setReceiptPreviewUrl(`/uploads/${editRecord.receipt_image}`);
      }
    } else {
      // Default to local client timezone date (YYYY-MM-DD)
      const now = new Date();
      const localDateString = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0');
      setDate(localDateString);
      
      // Seed title based on default oil_change category
      setTitle('Oil & Filter Change');
    }
  }, [editRecord]);

  // Clean up object URLs to prevent browser memory leaks
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

  /**
   * Updates default title based on category changes (only when adding a new record).
   * @param {string} newCategory The newly selected category.
   */
  const handleCategoryChange = (newCategory) => {
    setCategory(newCategory);
    if (editRecord) return; // Do not overwrite user-saved titles on editing mode

    switch (newCategory) {
      case 'oil_change':
        setTitle('Oil & Filter Change');
        break;
      case 'transmission_fluid':
      case 'transmission_oil':
        setTitle('Transmission Fluid Service');
        break;
      case 'cabin_air_filter':
        setTitle('Cabin Air Filter Replacement');
        break;
      case 'engine_air_filter':
        setTitle('Engine Air Filter Replacement');
        break;
      case 'brake_pads':
        setTitle('Brake Pads Replacement');
        break;
      case 'brake_rotor':
        setTitle('Brake Rotors Service');
        break;
      case 'brake_fluid':
        setTitle('Brake Fluid Flush');
        break;
      case 'spark_plugs':
        setTitle('Spark Plugs Replacement');
        break;
      case 'custom_maintenance':
        setTitle('Custom Maintenance Service');
        break;
      case 'modification':
        setTitle('Aftermarket Coilovers Install');
        break;
      default:
        setTitle('');
    }
  };

  /**
   * Captures picture/upload file selection, converts to local ObjectURL,
   * and opens the DocumentScanner.
   * @param {!React.ChangeEvent<!HTMLInputElement>} e Form event.
   */
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Create a local source representation of the raw image
    const sourceUrl = URL.createObjectURL(file);
    setRawImageSrc(sourceUrl);
    setShowScanner(true);
  };

  /**
   * Callback invoked by the scanner when cropped warp processing is successful.
   * @param {!Blob} blob Output JPEG receipt file blob.
   */
  const handleScanSave = (blob) => {
    // Generate static preview from scanned blob
    const previewUrl = URL.createObjectURL(blob);
    
    setScannedBlob(blob);
    setReceiptPreviewUrl(previewUrl);
    setShowScanner(false);

    // Clean up temporary raw image source
    if (rawImageSrc && rawImageSrc.startsWith('blob:')) {
      URL.revokeObjectURL(rawImageSrc);
    }
    setRawImageSrc(null);
  };

  /**
   * Resets uploaded files back to original state.
   */
  const handleRemoveReceipt = () => {
    setScannedBlob(null);
    setReceiptPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * Form validation and server submission wrapper.
   * @param {!React.FormEvent} e Form submit event.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!title.trim()) {
      alert('Please fill out the descriptive title.');
      return;
    }
    if (!kms || parseInt(kms, 10) < 0) {
      alert('Please input a valid odometer reading (greater than or equal to 0).');
      return;
    }
    if (!date) {
      alert('Please select the date the maintenance was performed.');
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('category', category);
      formData.append('title', title.trim());
      formData.append('kms', kms);
      formData.append('date', date);
      formData.append('cost', cost || '0');
      formData.append('notes', notes.trim());
      formData.append('car_id', activeCarId);

      // Attach processed receipt scan if present
      if (scannedBlob) {
        formData.append('receipt', scannedBlob, 'receipt-scan.jpg');
      }

      await onSubmit(formData);
    } catch (err) {
      console.error('[Form] Submit failed:', err);
      alert('Error saving record. Please review inputs.');
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="form-container fade-in">
        <div className="card-glass p-6">
          <div className="form-header">
            <h2>{editRecord ? '🔧 Edit Service Log' : '➕ Add Service / Modification'}</h2>
            <p className="text-secondary text-xs">Fill out details about your car maintenance item</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6">
            <div className="form-grid">
              {/* Category */}
              <div className="form-group" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                <label>Category</label>
                {editRecord ? (
                  <div className="custom-select-btn disabled" style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--border-radius-sm)',
                    padding: '0.75rem 1rem',
                    color: 'var(--text-secondary)',
                    cursor: 'not-allowed',
                    opacity: 0.6
                  }}>
                    <CategoryIcon category={category} size={18} />
                    <span>{getCategoryLabel(category)}</span>
                  </div>
                ) : (
                  <>
                    <div
                      className="custom-select-btn"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: 'var(--border-radius-sm)',
                        padding: '0.75rem 1rem',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        transition: 'var(--transition-smooth)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(0, 242, 254, 0.3)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isDropdownOpen) {
                          e.currentTarget.style.borderColor = 'var(--border-glass)';
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CategoryIcon category={category} size={18} />
                        <span>{getCategoryLabel(category)}</span>
                      </div>
                      <svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="3"
                        style={{
                          transform: isDropdownOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.25s ease'
                        }}
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>

                    {isDropdownOpen && (
                      <div
                        className="custom-select-dropdown card-glass"
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          width: '100%',
                          marginTop: '6px',
                          zIndex: 99,
                          borderRadius: 'var(--border-radius-sm)',
                          border: '1px solid var(--border-glass)',
                          boxShadow: 'var(--shadow-card)',
                          maxHeight: '260px',
                          overflowY: 'auto',
                          padding: '4px',
                          background: '#0c1220'
                        }}
                      >
                        {categoriesList.map((cat) => (
                          <div
                            key={cat.value}
                            className={`custom-select-option ${category === cat.value ? 'active' : ''}`}
                            onClick={() => {
                              handleCategoryChange(cat.value);
                              setIsDropdownOpen(false);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 12px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: category === cat.value ? 'var(--neon-teal)' : 'var(--text-primary)',
                              background: category === cat.value ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (category !== cat.value) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (category !== cat.value) {
                                e.currentTarget.style.background = 'transparent';
                              }
                            }}
                          >
                            <CategoryIcon category={cat.value} size={18} />
                            <span>{cat.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Title */}
              <div className="form-group">
                <label htmlFor="title">Title / Item Description</label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Mobil1 5W-30 Synthetic"
                  required
                />
              </div>

              {/* Kilometers */}
              <div className="form-group">
                <label htmlFor="kms">Odometer Reading (kms)</label>
                <input
                  type="number"
                  id="kms"
                  value={kms}
                  onChange={(e) => setKms(e.target.value)}
                  placeholder="e.g. 104230"
                  required
                  min="0"
                />
              </div>

              {/* Date */}
              <div className="form-group">
                <label htmlFor="date">Service Date</label>
                <input
                  type="date"
                  id="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              {/* Cost */}
              <div className="form-group">
                <label htmlFor="cost">Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  id="cost"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0.00"
                  min="0"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="form-group mt-4">
              <label htmlFor="notes">Notes / Observations</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="List specs, oil filters used, tire positions, aftermarket parts part numbers..."
                rows="4"
              />
            </div>

            {/* Receipt upload - Camera focus */}
            {!editRecord && (
              <div className="form-group mt-6">
                <label>Receipt or Invoice Capture</label>
                
                {receiptPreviewUrl ? (
                  <div className="receipt-preview-card card-glass mt-2">
                    <img src={receiptPreviewUrl} alt="Scanned Receipt Preview" className="receipt-preview-thumbnail" />
                    <div className="receipt-preview-details">
                      <span className="scanned-badge">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Scan Successful
                      </span>
                      <p className="text-secondary text-xs">Receipt cropped, warped and filter enhanced locally.</p>
                      <button
                        type="button"
                        className="btn-danger-link mt-2"
                        onClick={handleRemoveReceipt}
                      >
                        Remove & Take New Picture
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="file-dropzone mt-2"
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                      <circle cx="12" cy="13" r="4"></circle>
                    </svg>
                    <span>Tap to Open Camera / Upload Receipt</span>
                    <p className="text-secondary text-xs mt-1">Accepts PNG, JPG. Automatically launches document scanner overlays.</p>
                    
                    {/* Native hidden camera focus file input */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden-file-input"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileChange}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="form-actions mt-8">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onCancel}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-glow"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="spinner spinner-sm"></div>
                    Saving Log...
                  </div>
                ) : (
                  editRecord ? 'Save Changes' : 'Log Maintenance'
                )}
              </button>
            </div>
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
    </>
  );
}
