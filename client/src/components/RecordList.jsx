/**
 * @fileoverview Records Log Listing Component for GloveBox.
 * Displays vehicle logs with text searching, category filtering, card expansions,
 * and an interactive full-screen receipt Lightbox with custom mouse/touch zoom and pan.
 * Follows Google Coding Standards and React best practices.
 */

import React, { useState, useEffect, useRef } from 'react';
import CategoryIcon from './CategoryIcon';

/**
 * Lists past records and displays custom receipt lightboxes.
 * @param {!Object} props React component props.
 * @param {!Array<!Object>} props.records All records.
 * @param {function(number): Promise<void>} props.onDelete Callback for deletion.
 * @param {function(!Object): void} props.onEdit Triggers edit view state.
 * @return {!React.ReactElement}
 */
export default function RecordList({ records, onDelete, onEdit }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('all');
  const [expandedRecordId, setExpandedRecordId] = useState(null);

  // Lightbox zoom and pan state
  const [lightboxImg, setLightboxImg] = useState(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Refs for high-performance touch gestures and zoom tracking
  const pinchStartDist = useRef(0);
  const pinchStartScale = useRef(1);
  const lastTapTime = useRef(0);

  // Disable body scroll when lightbox is active to keep fixed centering stable on iOS/Android
  useEffect(() => {
    if (lightboxImg) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
    return () => {
      document.body.classList.remove('no-scroll');
    };
  }, [lightboxImg]);

  /**
   * Toggles the card expanded notes drawer.
   * @param {number} id Record unique identifier.
   */
  const toggleExpandCard = (id) => {
    setExpandedRecordId(expandedRecordId === id ? null : id);
  };

  /**
   * Filters records list based on matching text search and category select.
   */
  const filteredRecords = records.filter((record) => {
    const matchesSearch =
      record.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.notes && record.notes.toLowerCase().includes(searchTerm.toLowerCase()));

    let matchesCategory = false;
    if (activeCategoryFilter === 'all') {
      matchesCategory = true;
    } else if (activeCategoryFilter === 'oil_change') {
      matchesCategory = record.category === 'oil_change';
    } else if (activeCategoryFilter === 'transmission') {
      matchesCategory = record.category === 'transmission_fluid' || record.category === 'transmission_oil';
    } else if (activeCategoryFilter === 'air_filters') {
      matchesCategory = record.category === 'cabin_air_filter' || record.category === 'engine_air_filter' || record.category === 'air_filter';
    } else if (activeCategoryFilter === 'brakes') {
      matchesCategory = record.category === 'brake_pads' || record.category === 'brake_rotor' || record.category === 'brake_fluid';
    } else if (activeCategoryFilter === 'spark_plugs') {
      matchesCategory = record.category === 'spark_plugs';
    } else if (activeCategoryFilter === 'custom_maintenance') {
      matchesCategory = record.category === 'custom_maintenance';
    } else if (activeCategoryFilter === 'modification') {
      matchesCategory = record.category === 'modification';
    }

    return matchesSearch && matchesCategory;
  });

  // ==========================================
  // Lightbox Zoom and Pan Event Handlers
  // ==========================================

  const openLightbox = (imageFilename, e) => {
    e.stopPropagation(); // Avoid triggering parent expand toggle
    setLightboxImg(`/uploads/${imageFilename}`);
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const closeLightbox = () => {
    setLightboxImg(null);
    setIsPanning(false);
  };

  const handleZoomIn = () => {
    setZoomScale((prev) => Math.min(prev + 0.5, 4));
  };

  const handleZoomOut = () => {
    setZoomScale((prev) => {
      const next = prev - 0.5;
      if (next <= 1) {
        setPanOffset({ x: 0, y: 0 }); // Re-center on reset zoom
        return 1;
      }
      return next;
    });
  };

  const handlePanStart = (clientX, clientY) => {
    if (zoomScale <= 1) return;
    setIsPanning(true);
    setPanStart({ x: clientX - panOffset.x, y: clientY - panOffset.y });
  };

  const handlePanMove = (clientX, clientY) => {
    if (!isPanning || zoomScale <= 1) return;
    setPanOffset({
      x: clientX - panStart.x,
      y: clientY - panStart.y
    });
  };

  const handlePanEnd = () => {
    setIsPanning(false);
  };

  // Advanced multi-touch pinch, drag, and double-tap zoom handlers
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      // Initialize pinch-to-zoom parameters
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartDist.current = dist;
      pinchStartScale.current = zoomScale;
      setIsPanning(false); // Lock drag panning while adjusting pinch scale
    } else if (e.touches.length === 1) {
      // Tap & Drag / Double-tap detection
      const now = Date.now();
      if (now - lastTapTime.current < 260) {
        // Double-tap zoom toggle (swaps between 1x and 2.5x)
        if (zoomScale > 1) {
          setZoomScale(1);
          setPanOffset({ x: 0, y: 0 });
        } else {
          setZoomScale(2.5);
          setPanOffset({ x: 0, y: 0 });
        }
        lastTapTime.current = 0; // Reset
      } else {
        lastTapTime.current = now;
        handlePanStart(e.touches[0].clientX, e.touches[0].clientY);
      }
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && pinchStartDist.current > 0) {
      // Pinch calculation
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const nextScale = Math.min(4, Math.max(1, pinchStartScale.current * (dist / pinchStartDist.current)));
      setZoomScale(nextScale);
      if (nextScale <= 1) {
        setPanOffset({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1) {
      handlePanMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchEnd = () => {
    pinchStartDist.current = 0;
    handlePanEnd();
  };

  return (
    <div className="records-view fade-in">
      {/* Search and Filters Tray */}
      <section className="search-filter-tray card-glass p-4 mb-6">
        <div className="search-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search maintenance logs, notes, specs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-pill-tray mt-4">
          <button
            type="button"
            className={`filter-pill ${activeCategoryFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter('all')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            All Logs
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategoryFilter === 'oil_change' ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter('oil_change')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <CategoryIcon category="oil_change" size={13} /> Oil Changes
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategoryFilter === 'transmission' ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter('transmission')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <CategoryIcon category="transmission_fluid" size={13} /> Transmission
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategoryFilter === 'air_filters' ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter('air_filters')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <CategoryIcon category="engine_air_filter" size={13} /> Filters
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategoryFilter === 'brakes' ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter('brakes')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <CategoryIcon category="brake_rotor" size={13} /> Brakes
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategoryFilter === 'spark_plugs' ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter('spark_plugs')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <CategoryIcon category="spark_plugs" size={13} /> Plugs
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategoryFilter === 'custom_maintenance' ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter('custom_maintenance')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <CategoryIcon category="custom_maintenance" size={13} /> Custom
          </button>
          <button
            type="button"
            className={`filter-pill ${activeCategoryFilter === 'modification' ? 'active' : ''}`}
            onClick={() => setActiveCategoryFilter('modification')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <CategoryIcon category="modification" size={13} /> Mods
          </button>
        </div>
      </section>

      {/* Main Records Listing */}
      <section className="records-list">
        {filteredRecords.length === 0 ? (
          <div className="empty-state card-glass p-8 text-center">
            <p className="text-secondary">No vehicle records matching search criteria.</p>
          </div>
        ) : (
          filteredRecords.map((record) => {
            const isExpanded = expandedRecordId === record.id;
            
            // Assign custom accent coloring and labels based on category
            let label = 'Custom Maintenance';
            let color = 'rgba(234, 179, 8, 0.1)';
            let textColor = '#eab308';

            if (record.category === 'oil_change') {
              label = 'Oil Change';
              color = 'rgba(0, 242, 254, 0.1)';
              textColor = 'var(--neon-teal)';
            } else if (record.category === 'transmission_fluid' || record.category === 'transmission_oil') {
              label = 'Transmission Fluid';
              color = 'rgba(99, 102, 241, 0.1)';
              textColor = '#6366f1';
            } else if (record.category === 'cabin_air_filter') {
              label = 'Cabin Air Filter';
              color = 'rgba(16, 185, 129, 0.1)';
              textColor = '#10b981';
            } else if (record.category === 'engine_air_filter' || record.category === 'air_filter') {
              label = 'Engine Air Filter';
              color = 'rgba(16, 185, 129, 0.1)';
              textColor = '#10b981';
            } else if (record.category === 'brake_pads') {
              label = 'Brake Pads';
              color = 'rgba(239, 68, 68, 0.1)';
              textColor = '#ef4444';
            } else if (record.category === 'brake_rotor') {
              label = 'Brake Rotors';
              color = 'rgba(239, 68, 68, 0.1)';
              textColor = '#ef4444';
            } else if (record.category === 'brake_fluid') {
              label = 'Brake Fluid';
              color = 'rgba(239, 68, 68, 0.1)';
              textColor = '#ef4444';
            } else if (record.category === 'spark_plugs') {
              label = 'Spark Plugs';
              color = 'rgba(168, 85, 247, 0.1)';
              textColor = '#a855f7';
            } else if (record.category === 'modification') {
              label = 'Modification';
              color = 'rgba(236, 72, 153, 0.1)';
              textColor = '#ec4899';
            }

            return (
              <div
                key={record.id}
                className={`record-card card-glass ${isExpanded ? 'expanded' : ''}`}
                onClick={() => toggleExpandCard(record.id)}
              >
                {/* Header Summary Row */}
                <div className="record-header-row">
                  <div className="record-icon-title">
                    <div
                      className="record-category-badge"
                      style={{
                        backgroundColor: color,
                        color: textColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <CategoryIcon category={record.category} size={15} />
                    </div>
                    <div className="record-main-info">
                      <h4>{record.title}</h4>
                      <span className="record-label-badge" style={{ color: textColor }}>{label}</span>
                    </div>
                  </div>

                  <div className="record-numeric-info">
                    <span className="record-kms">{record.kms.toLocaleString()} km</span>
                    <span className="record-date">{new Date(record.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                </div>

                {/* Dropdown expanded notes details */}
                {isExpanded && (
                  <div className="record-expanded-details fade-in" onClick={(e) => e.stopPropagation()}>
                    <div className="expanded-divider" />
                    
                    <div className="expanded-grid">
                      {/* Receipt Photo */}
                      {record.receipt_image && (
                        <div className="expanded-right">
                          <h5>Scanned Receipt</h5>
                          <div
                            className="receipt-thumbnail-wrapper"
                            onClick={(e) => openLightbox(record.receipt_image, e)}
                          >
                            <img
                              src={`/uploads/${record.receipt_image}`}
                              alt="Receipt Thumbnail"
                              className="receipt-thumbnail"
                            />
                            <div className="thumbnail-overlay">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                <line x1="11" y1="8" x2="11" y2="14"></line>
                                <line x1="8" y1="11" x2="14" y2="11"></line>
                              </svg>
                              <span>Tap to View Scanned Receipt</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Notes / Descriptions */}
                      <div className="expanded-left">
                        <h5>Description & Observations</h5>
                        <p className="notes-text text-sm">
                          {record.notes ? record.notes : <em className="text-secondary">No notes written.</em>}
                        </p>
                        
                        <div className="expanded-stats mt-4">
                          <div className="cost-stat">
                            <span className="stat-label">Total Expense:</span>
                            <span className="stat-val">${record.cost.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions Panel */}
                    <div className="record-actions-tray mt-6">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onEdit(record)}
                      >
                        Edit Fields
                      </button>
                      <button
                        type="button"
                        className="btn-danger-link btn-sm"
                        onClick={() => {
                          if (confirm('Are you sure you want to permanently delete this maintenance log? This will also remove the saved receipt.')) {
                            onDelete(record.id);
                          }
                        }}
                      >
                        Delete Log
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Full-Screen Receipt Interactive Lightbox Modal */}
      {lightboxImg && (
        <div className="lightbox-modal" onClick={closeLightbox}>
          {/* Close button top right */}
          <button type="button" className="lightbox-close-btn" onClick={closeLightbox}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          {/* Bottom Zoom Control Panel */}
          <div className="lightbox-controls-overlay" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn-circle" onClick={handleZoomOut} disabled={zoomScale <= 1}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <span className="zoom-indicator">{Math.round(zoomScale * 100)}%</span>
            <button type="button" className="btn-circle" onClick={handleZoomIn} disabled={zoomScale >= 4}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>

          {/* Interactive Image box */}
          <div className="lightbox-viewport">
            <div
              className="lightbox-img-wrapper"
              style={{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`,
                cursor: zoomScale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
                transition: isPanning ? 'none' : 'transform 0.15s ease-out'
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                handlePanStart(e.clientX, e.clientY);
              }}
              onMouseMove={(e) => {
                e.stopPropagation();
                handlePanMove(e.clientX, e.clientY);
              }}
              onMouseUp={(e) => {
                e.stopPropagation();
                handlePanEnd();
              }}
              onMouseLeave={handlePanEnd}
              onTouchStart={(e) => {
                e.stopPropagation();
                handleTouchStart(e);
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
                handleTouchMove(e);
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                handleTouchEnd();
              }}
            >
              <img
                src={lightboxImg}
                alt="Enlarged Scanned Invoice"
                className="lightbox-image"
                draggable={false}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
