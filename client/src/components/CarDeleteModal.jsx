/**
 * @fileoverview Custom Destructive Vehicle Deletion Multi-Step Warning Modal for GloveBox.
 * Requires the user to progress through 3 distinct steps:
 * 1. Warning of impact (count of records, irreversible deletion of files).
 * 2. Confirmation Checkbox ticks (sold/no longer tracked and receipt unlinks understanding).
 * 3. Text matches lock (must type the model name of the vehicle exactly to unlock deletion).
 * Follows Google Coding Standards and React best practices.
 */

import React, { useState, useEffect } from 'react';

/**
 * Renders the multi-step car deletion modal.
 * @param {!Object} props React component props.
 * @param {!Object} props.car The vehicle object to delete.
 * @param {number} props.recordsCount Count of maintenance records linked to this car.
 * @param {function(): Promise<void>} props.onConfirm Deletion execution callback.
 * @param {function(): void} props.onClose Modal cancellation callback.
 * @return {!React.ReactElement}
 */
export default function CarDeleteModal({ car, recordsCount, onConfirm, onClose }) {
  const [step, setStep] = useState(1); // Steps: 1, 2, 3

  // Step 2 checklist states
  const [checkSold, setCheckSold] = useState(false);
  const [checkReceipts, setCheckReceipts] = useState(false);

  // Step 3 text validation states
  const [typedModel, setTypedModel] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Auto-focus text input in Step 3
  const inputRef = React.useRef(null);
  useEffect(() => {
    if (step === 3 && inputRef.current) {
      inputRef.current.focus();
    }
  }, [step]);

  // Compute the expected confirmation string to type out
  const expectedName = `${car.year} ${car.make} ${car.model}`;

  /**
   * Triggers the final backend deletion callback.
   * @param {!React.FormEvent} e Submit event.
   */
  const handleDeleteExecute = async (e) => {
    e.preventDefault();
    if (step !== 3 || typedModel.trim().toLowerCase() !== expectedName.toLowerCase() || isDeleting) {
      return;
    }

    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      console.error('[CarDeleteModal] Deletion failed:', err);
      alert(`Error deleting vehicle: ${err.message}`);
      setIsDeleting(false);
    }
  };

  return (
    <div className="lightbox-modal modal-overlay" onClick={onClose}>
      <div
        className="card-glass p-6 modal-box fade-in"
        onClick={(e) => e.stopPropagation()} // Prevent close on card click
        style={{ width: '92%', maxWidth: '480px', border: '1px solid rgba(239, 68, 68, 0.25)' }}
      >
        {/* Modal Header */}
        <div className="form-header" style={{ borderBottom: '1px solid rgba(239, 68, 68, 0.15)', paddingBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <h3 style={{ color: 'var(--error-red)' }}>Destructive Action</h3>
              <p className="text-secondary text-xs">Remove vehicle: {car.year} {car.make} {car.model}</p>
            </div>
          </div>
        </div>

        {/* Step Progress Tracker bar */}
        <div className="step-progress-row mt-4" style={{ display: 'flex', gap: '6px', width: '100%' }}>
          <div style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: 'var(--error-red)' }} />
          <div style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: step >= 2 ? 'var(--error-red)' : 'rgba(255,255,255,0.06)' }} />
          <div style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: step >= 3 ? 'var(--error-red)' : 'rgba(255,255,255,0.06)' }} />
        </div>

        {/* Step Content */}
        <div className="modal-content-body mt-4">
          
          {/* ==========================================
              Step 1: Impact Assessment Warning
              ========================================== */}
          {step === 1 && (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p className="text-sm" style={{ lineHeight: '1.5' }}>
                You are preparing to delete the vehicle <strong>{car.year} {car.make} {car.model}</strong>.
              </p>
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  padding: '12px',
                  borderRadius: 'var(--border-radius-sm)',
                  fontSize: '0.85rem'
                }}
              >
                <span style={{ fontWeight: '700', color: 'var(--error-red)', display: 'block', marginBottom: '6px' }}>
                  This will permanently erase:
                </span>
                <ul style={{ paddingLeft: '18px', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <li><strong>{recordsCount}</strong> maintenance & modification logs.</li>
                  <li>All associated scanned receipt/invoice image files.</li>
                  <li>All aggregate statistics, timeline history, and oil gauges.</li>
                </ul>
              </div>
              <p className="text-secondary text-xs" style={{ lineHeight: '1.4' }}>
                This local action is absolute. Physical scan images stored in the server uploads folder will be unlinked and deleted to recover disk space.
              </p>

              <div className="form-actions mt-6" style={{ borderTop: 'none', paddingTop: 0 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-glow btn-sm"
                  style={{ background: 'var(--error-red)', color: '#ffffff' }}
                  onClick={() => setStep(2)}
                >
                  I Understand, Next Step
                </button>
              </div>
            </div>
          )}

          {/* ==========================================
              Step 2: Direct Acknowledgment Checklist
              ========================================== */}
          {step === 2 && (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p className="text-sm" style={{ lineHeight: '1.5' }}>
                Please confirm you understand the scope of this deletion by checking the conditions below:
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Condition 1 */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    background: 'rgba(255, 255, 255, 0.02)',
                    padding: '10px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--border-glass)'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checkSold}
                    onChange={(e) => setCheckSold(e.target.checked)}
                    style={{ marginTop: '3px', accentColor: 'var(--error-red)' }}
                  />
                  <span style={{ lineHeight: '1.3' }}>
                    I confirm that I no longer want to track maintenance for this vehicle.
                  </span>
                </label>

                {/* Condition 2 */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    background: 'rgba(255, 255, 255, 0.02)',
                    padding: '10px',
                    borderRadius: 'var(--border-radius-sm)',
                    border: '1px solid var(--border-glass)'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checkReceipts}
                    onChange={(e) => setCheckReceipts(e.target.checked)}
                    style={{ marginTop: '3px', accentColor: 'var(--error-red)' }}
                  />
                  <span style={{ lineHeight: '1.3' }}>
                    I understand that all physical receipt files (PDF/images) associated with this car will be deleted from server storage.
                  </span>
                </label>
              </div>

              <div className="form-actions mt-6" style={{ borderTop: 'none', paddingTop: 0 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ background: 'var(--error-red)', color: '#ffffff' }}
                  disabled={!checkSold || !checkReceipts}
                  onClick={() => setStep(3)}
                >
                  Next Step
                </button>
              </div>
            </div>
          )}

          {/* ==========================================
              Step 3: Text Matches Verification Lock
              ========================================== */}
          {step === 3 && (
            <form onSubmit={handleDeleteExecute} className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p className="text-sm" style={{ lineHeight: '1.5' }}>
                This is the final confirmation warning. To execute the deletion, please type the full vehicle name exactly as displayed in the switcher dropdown: <strong style={{ color: 'var(--error-red)' }}>"{expectedName}"</strong>
              </p>

              <div className="form-group">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={`Type "${expectedName}"`}
                  value={typedModel}
                  onChange={(e) => setTypedModel(e.target.value)}
                  style={{
                    border: typedModel.trim().toLowerCase() === expectedName.toLowerCase() ? '1px solid var(--error-red)' : '1px solid var(--border-glass)',
                    background: 'rgba(239, 68, 68, 0.02)',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    letterSpacing: '0.5px'
                  }}
                  required
                  disabled={isDeleting}
                />
              </div>

              <div className="form-actions mt-6" style={{ borderTop: 'none', paddingTop: 0 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(2)} disabled={isDeleting}>
                  Back
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-glow btn-sm"
                  style={{
                    background: 'var(--error-red)',
                    color: '#ffffff',
                    boxShadow: typedModel.trim().toLowerCase() === expectedName.toLowerCase() ? '0 0 15px rgba(239, 68, 68, 0.4)' : 'none'
                  }}
                  disabled={typedModel.trim().toLowerCase() !== expectedName.toLowerCase() || isDeleting}
                >
                  {isDeleting ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div className="spinner spinner-sm" style={{ borderLeftColor: '#ffffff' }}></div>
                      Deleting Data...
                    </div>
                  ) : (
                    'Permanently Delete Vehicle'
                  )}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
