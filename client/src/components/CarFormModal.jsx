/**
 * @fileoverview Form Modal component for adding or editing vehicles in GloveBox.
 * Supports updating Make, Model, Year, custom Oil Change Interval (kms),
 * and custom Oil Change Expiration Time (months).
 * Follows Google Coding Standards and React best practices.
 */

import React, { useState, useEffect } from 'react';

/**
 * Renders the Add/Edit Vehicle form modal.
 * @param {!Object} props React component props.
 * @param {?Object} props.editCar Existing vehicle to edit, or null.
 * @param {function(!Object): Promise<void>} props.onSave Callback with newly registered car.
 * @param {function(): void} props.onClose Callback to dismiss modal.
 * @return {!React.ReactElement}
 */
export default function CarFormModal({ editCar, onSave, onClose }) {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [oilInterval, setOilInterval] = useState('8000');
  const [oilMonths, setOilMonths] = useState('6');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set default values or pre-load editing targets on mounting
  useEffect(() => {
    if (editCar) {
      setMake(editCar.make);
      setModel(editCar.model);
      setYear(editCar.year.toString());
      setOilInterval(editCar.oil_interval ? editCar.oil_interval.toString() : '8000');
      setOilMonths(editCar.oil_months ? editCar.oil_months.toString() : '6');
    } else {
      setYear(new Date().getFullYear().toString());
      setOilInterval('8000');
      setOilMonths('6');
    }
  }, [editCar]);

  /**
   * Form validation and server submission.
   * @param {!React.FormEvent} e Submit event.
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!make.trim()) {
      alert('Please enter a vehicle make.');
      return;
    }
    if (!model.trim()) {
      alert('Please enter a vehicle model.');
      return;
    }
    
    const parsedYear = parseInt(year, 10);
    const currentYear = new Date().getFullYear();
    if (!year || parsedYear < 1900 || parsedYear > currentYear + 2) {
      alert(`Please enter a valid vehicle model year (between 1900 and ${currentYear + 2}).`);
      return;
    }

    const parsedInterval = parseInt(oilInterval, 10);
    if (!oilInterval || isNaN(parsedInterval) || parsedInterval <= 0) {
      alert('Please enter a valid positive oil change interval (kms).');
      return;
    }

    const parsedMonths = parseInt(oilMonths, 10);
    if (!oilMonths || isNaN(parsedMonths) || parsedMonths <= 0 || parsedMonths > 120) {
      alert('Please enter a valid positive oil change limit in calendar months (between 1 and 120).');
      return;
    }

    setIsSubmitting(true);

    try {
      const method = editCar ? 'PUT' : 'POST';
      const url = editCar ? `/api/cars/${editCar.id}` : '/api/cars';

      const res = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          make: make.trim(),
          model: model.trim(),
          year: parsedYear,
          oil_interval: parsedInterval,
          oil_months: parsedMonths
        })
      });

      if (!res.ok) {
        throw new Error('Failed to register/update vehicle on server.');
      }

      const updatedCar = await res.json();
      await onSave(updatedCar);
      onClose();
    } catch (err) {
      console.error('[CarForm] Submit failed:', err);
      alert('Error saving vehicle specs. Please verify connections.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="lightbox-modal modal-overlay" onClick={onClose}>
      <div
        className="card-glass p-6 modal-box fade-in"
        onClick={(e) => e.stopPropagation()} // Prevent close on body clicks
        style={{ width: '92%', maxWidth: '480px' }}
      >
        <div className="form-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>{editCar ? '🔧 Edit Vehicle Specs' : '🚗 Add New Vehicle'}</h3>
            <p className="text-secondary text-xs">
              {editCar ? 'Modify vehicle settings and target intervals' : 'Enter your car specs to begin tracking'}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} title="Close Modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Year */}
          <div className="form-group">
            <label htmlFor="year">Year</label>
            <input
              type="number"
              id="year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="e.g. 2021"
              required
              min="1900"
              max="2050"
            />
          </div>

          {/* Make */}
          <div className="form-group">
            <label htmlFor="make">Make</label>
            <input
              type="text"
              id="make"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              placeholder="e.g. Subaru, Toyota, Honda"
              required
            />
          </div>

          {/* Model */}
          <div className="form-group">
            <label htmlFor="model">Model</label>
            <input
              type="text"
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. WRX, Tacoma, Civic"
              required
            />
          </div>

          {/* Double configuration parameters: Mileage & Time limits */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Mileage Interval */}
            <div className="form-group">
              <label htmlFor="oilInterval">Oil Limit (kms)</label>
              <input
                type="number"
                id="oilInterval"
                value={oilInterval}
                onChange={(e) => setOilInterval(e.target.value)}
                placeholder="e.g. 8000"
                required
                min="100"
                max="100000"
              />
            </div>

            {/* Time Interval */}
            <div className="form-group">
              <label htmlFor="oilMonths">Oil Limit (Months)</label>
              <input
                type="number"
                id="oilMonths"
                value={oilMonths}
                onChange={(e) => setOilMonths(e.target.value)}
                placeholder="e.g. 6"
                required
                min="1"
                max="120"
              />
            </div>
          </div>
          <p className="text-muted text-xs">
            Radial health warnings will automatically trigger based on **whichever threshold is reached first** (odometer mileage or elapsed days).
          </p>

          {/* Modal Actions */}
          <div className="form-actions mt-6" style={{ paddingTop: '1rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-glow btn-sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div className="spinner spinner-sm"></div>
                  Saving...
                </div>
              ) : (
                editCar ? 'Save Specs' : 'Add Vehicle'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
