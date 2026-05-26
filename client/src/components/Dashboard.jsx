/**
 * @fileoverview Vehicle Health Dashboard Component.
 * Displays vehicle statistics including expenses, log counts, current mileage,
 * a dynamic radial indicator gauge for oil change intervals, category breakdowns,
 * and a recent timeline widget.
 * Follows Google Coding Standards and React best practices.
 */

import React from 'react';
import CategoryIcon from './CategoryIcon';

/**
 * Renders the dashboard landing view.
 * @param {!Object} props React component props.
 * @param {!Object} props.stats Aggregated statistics from backend.
 * @param {!Array<!Object>} props.recentRecords Small list of recent records.
 * @param {function(string): void} props.setView Setter to trigger page views.
 * @return {!React.ReactElement}
 */
export default function Dashboard({ stats, recentRecords, setView, onEditCar }) {
  const {
    currentKms,
    totalCost,
    logsCount,
    lastOilChangeKms,
    lastOilChangeDate,
    oilChangeDueInKms,
    oilChangeDueInDays,
    oilInterval,
    oilMonths,
    breakdown
  } = stats;

  // Configuration settings for oil change gauge (reads custom car specs)
  const OIL_CHANGE_INTERVAL = oilInterval || 8000;
  const OIL_CHANGE_MONTHS = oilMonths || 6;
  
  // Calculate radial percentage
  let oilChangePercentage = 0;
  let isOverdue = false;
  let remainingKmsDisplay = 'N/A';
  let gaugeLabelDisplay = 'Until Next Oil Change';
  let gaugeColor = 'var(--neon-teal)';

  let elapsedKms = 0;
  let elapsedDays = 0;
  let elapsedMonths = '0.0';
  let remainingMonths = '0.0';

  if (lastOilChangeKms !== null) {
    const totalDays = Math.round(OIL_CHANGE_MONTHS * 30.417);
    
    // Calculate elapsed values
    elapsedKms = Math.max(0, currentKms - lastOilChangeKms);
    if (lastOilChangeDate) {
      const lastDate = new Date(lastOilChangeDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = today - lastDate;
      elapsedDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
      elapsedMonths = (elapsedDays / 30.417).toFixed(1);
      remainingMonths = (oilChangeDueInDays / 30.417).toFixed(1);
    }

    // Calculate percentages
    const pctKms = Math.max(0, Math.min(100, (oilChangeDueInKms / OIL_CHANGE_INTERVAL) * 100));
    const pctDays = Math.max(0, Math.min(100, (oilChangeDueInDays / totalDays) * 100));
    
    // Check if overdue by either metric
    const isKmsOverdue = oilChangeDueInKms <= 0;
    const isDaysOverdue = oilChangeDueInDays <= 0;
    isOverdue = isKmsOverdue || isDaysOverdue;

    const nextChangeDueAtKms = lastOilChangeKms + OIL_CHANGE_INTERVAL;

    if (isOverdue) {
      oilChangePercentage = 0;
      gaugeColor = 'var(--error-red)';
      
      if (isKmsOverdue && isDaysOverdue) {
        remainingKmsDisplay = 'Overdue';
        gaugeLabelDisplay = 'Kms & Time Exceeded';
      } else if (isKmsOverdue) {
        remainingKmsDisplay = `${nextChangeDueAtKms.toLocaleString()} km`;
        gaugeLabelDisplay = 'Overdue (Due At)';
      } else {
        remainingKmsDisplay = `${Math.abs(oilChangeDueInDays)} days`;
        gaugeLabelDisplay = 'Overdue by Time';
      }
    } else {
      // Not overdue, select the one closer to expiration (smaller percentage)
      if (pctKms <= pctDays) {
        oilChangePercentage = pctKms;
        remainingKmsDisplay = `${nextChangeDueAtKms.toLocaleString()} km`;
        gaugeLabelDisplay = 'Due at Odometer';
      } else {
        oilChangePercentage = pctDays;
        remainingKmsDisplay = `${oilChangeDueInDays} days`;
        gaugeLabelDisplay = 'Left (Time)';
      }

      // Determine gauge color based on the selected percentage (oilChangePercentage)
      if (oilChangePercentage < 20) {
        gaugeColor = 'var(--warning-orange)';
      } else {
        gaugeColor = 'var(--neon-teal)';
      }
    }
  }

  // Calculate SVG circular parameters
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (oilChangePercentage / 100) * circumference;

  return (
    <div className="dashboard-container fade-in">
      {/* 1. Gauge Section */}
      <section className="gauge-section card-glass">
        <div className="gauge-widget">
          <div className="gauge-svg-wrapper">
            <svg className="radial-gauge" viewBox="0 0 160 160">
              {/* Background ring */}
              <circle
                className="gauge-bg"
                cx="80"
                cy="80"
                r={radius}
                strokeWidth="11"
                fill="none"
              />
              {/* Progress ring with glow */}
              <circle
                className="gauge-progress"
                cx="80"
                cy="80"
                r={radius}
                strokeWidth="11"
                fill="none"
                stroke={gaugeColor}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 80 80)"
              />
            </svg>
            <div className="gauge-center-text">
              <span className="gauge-val">{remainingKmsDisplay}</span>
              <span className="gauge-label">
                {lastOilChangeKms !== null ? gaugeLabelDisplay : 'No History'}
              </span>
            </div>
          </div>

          <div className="gauge-info">
            <h2>Vehicle Health Index</h2>
            {lastOilChangeKms !== null ? (
              <div className="text-secondary text-sm" style={{ lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p>
                  Last logged oil change: <strong>{lastOilChangeKms.toLocaleString()} km</strong>{lastOilChangeDate && <> (on <strong>{new Date(lastOilChangeDate + 'T00:00:00').toLocaleDateString()}</strong>)</>}.
                </p>

                {/* Gorgeous interval-status-box displaying both Kms and Time details */}
                <div className="interval-status-box" style={{ 
                  background: 'rgba(255, 255, 255, 0.02)', 
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  marginTop: '8px',
                  marginBottom: '8px'
                }}>
                  {/* Mileage row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>🚗 Odometer Status</span>
                    <strong style={{ color: oilChangeDueInKms <= 0 ? 'var(--error-red)' : 'var(--neon-teal)', fontSize: '13px' }}>
                      Due at {(lastOilChangeKms + OIL_CHANGE_INTERVAL).toLocaleString()} km
                      {oilChangeDueInKms <= 0 && ' (Overdue)'}
                    </strong>
                  </div>

                  <div style={{ height: '1px', background: 'rgba(255, 255, 255, 0.08)' }} />

                  {/* Time row */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span>📅 Calendar Status</span>
                      <span>{elapsedMonths} / {OIL_CHANGE_MONTHS} months</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', opacity: 0.7 }}>{elapsedDays} days elapsed since last service</span>
                      <strong style={{ color: oilChangeDueInDays <= 0 ? 'var(--error-red)' : 'var(--neon-teal)', fontSize: '13px' }}>
                        {oilChangeDueInDays <= 0 
                          ? `Overdue by ${Math.abs(oilChangeDueInDays)} days` 
                          : `${oilChangeDueInDays} days left`}
                      </strong>
                    </div>
                  </div>
                </div>

                <p style={{ marginTop: '4px' }}>
                  Target change interval: every{' '}
                  <strong
                    className="editable-interval-link"
                    onClick={onEditCar}
                    title="Click to adjust vehicle specs"
                    style={{
                      color: 'var(--neon-teal)',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {OIL_CHANGE_INTERVAL.toLocaleString()} km or {OIL_CHANGE_MONTHS} months
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ opacity: 0.85 }}>
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                  </strong>.
                </p>
              </div>
            ) : (
              <p className="text-secondary text-sm" style={{ lineHeight: '1.6' }}>
                No oil change logs registered.<br />
                Target interval is set to{' '}
                <strong
                  className="editable-interval-link"
                  onClick={onEditCar}
                  title="Click to adjust vehicle specs"
                  style={{
                    color: 'var(--neon-teal)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {OIL_CHANGE_INTERVAL.toLocaleString()} km or {OIL_CHANGE_MONTHS} months
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ opacity: 0.85 }}>
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                  </svg>
                </strong>.<br />
                Log an <strong>Oil Change</strong> entry to enable oil interval alerts!
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary btn-glow mt-4"
              onClick={() => setView('add')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '6px' }}>
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Log Service / Modification
            </button>
          </div>
        </div>
      </section>

      {/* 2. Numerical Summary Metrics Cards Grid */}
      <section className="metrics-grid">
        <div className="metric-card card-glass">
          <div className="metric-icon" style={{ backgroundColor: 'rgba(0, 242, 254, 0.1)', color: 'var(--neon-teal)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <circle cx="12" cy="12" r="6"></circle>
              <circle cx="12" cy="12" r="2"></circle>
            </svg>
          </div>
          <div className="metric-details">
            <span className="metric-label">Current Odometer</span>
            <h3 className="metric-value">{currentKms.toLocaleString()} <span className="unit">km</span></h3>
          </div>
        </div>

        <div className="metric-card card-glass">
          <div className="metric-icon" style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"></line>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
          </div>
          <div className="metric-details">
            <span className="metric-label">Total Expenses</span>
            <h3 className="metric-value">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
          </div>
        </div>

        <div className="metric-card card-glass">
          <div className="metric-icon" style={{ backgroundColor: 'rgba(234, 179, 8, 0.1)', color: '#eab308' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div className="metric-details">
            <span className="metric-label">Logged Logs</span>
            <h3 className="metric-value">{logsCount}</h3>
          </div>
        </div>
      </section>

      {/* 3. Timeline / Category Breakdowns split grid */}
      <section className="dashboard-split">
        {/* Category Service Distribution */}
        <div className="split-column card-glass">
          <h3>Log Distribution</h3>
          <p className="text-secondary text-xs mb-4">Breakdown of recorded items by category</p>
          <div className="category-bars">
            <div className="category-bar-item">
              <div className="bar-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <CategoryIcon category="oil_change" size={16} /> Oil Changes
                </span>
                <span>{breakdown.oil_change || 0}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${logsCount > 0 ? ((breakdown.oil_change || 0) / logsCount) * 100 : 0}%`,
                    backgroundColor: 'var(--neon-teal)'
                  }}
                />
              </div>
            </div>

            <div className="category-bar-item">
              <div className="bar-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <CategoryIcon category="transmission_fluid" size={16} /> Transmission Fluid
                </span>
                <span>{(breakdown.transmission_fluid || 0) + (breakdown.transmission_oil || 0)}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${logsCount > 0 ? (((breakdown.transmission_fluid || 0) + (breakdown.transmission_oil || 0)) / logsCount) * 100 : 0}%`,
                    backgroundColor: '#6366f1'
                  }}
                />
              </div>
            </div>

            <div className="category-bar-item">
              <div className="bar-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <CategoryIcon category="engine_air_filter" size={16} /> Filters (Cabin/Engine)
                </span>
                <span>{(breakdown.cabin_air_filter || 0) + (breakdown.engine_air_filter || 0) + (breakdown.air_filter || 0)}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${logsCount > 0 ? (((breakdown.cabin_air_filter || 0) + (breakdown.engine_air_filter || 0) + (breakdown.air_filter || 0)) / logsCount) * 100 : 0}%`,
                    backgroundColor: '#10b981'
                  }}
                />
              </div>
            </div>

            <div className="category-bar-item">
              <div className="bar-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <CategoryIcon category="brake_rotor" size={16} /> Brakes (Pads/Rotors/Fluid)
                </span>
                <span>{(breakdown.brake_pads || 0) + (breakdown.brake_rotor || 0) + (breakdown.brake_fluid || 0)}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${logsCount > 0 ? (((breakdown.brake_pads || 0) + (breakdown.brake_rotor || 0) + (breakdown.brake_fluid || 0)) / logsCount) * 100 : 0}%`,
                    backgroundColor: '#ef4444'
                  }}
                />
              </div>
            </div>

            <div className="category-bar-item">
              <div className="bar-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <CategoryIcon category="spark_plugs" size={16} /> Spark Plugs
                </span>
                <span>{breakdown.spark_plugs || 0}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${logsCount > 0 ? ((breakdown.spark_plugs || 0) / logsCount) * 100 : 0}%`,
                    backgroundColor: '#a855f7'
                  }}
                />
              </div>
            </div>

            <div className="category-bar-item">
              <div className="bar-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <CategoryIcon category="custom_maintenance" size={16} /> Custom Maintenance
                </span>
                <span>{breakdown.custom_maintenance || 0}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${logsCount > 0 ? ((breakdown.custom_maintenance || 0) / logsCount) * 100 : 0}%`,
                    backgroundColor: '#eab308'
                  }}
                />
              </div>
            </div>

            <div className="category-bar-item">
              <div className="bar-label">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <CategoryIcon category="modification" size={16} /> Modifications
                </span>
                <span>{breakdown.modification || 0}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{
                    width: `${logsCount > 0 ? ((breakdown.modification || 0) / logsCount) * 100 : 0}%`,
                    backgroundColor: '#ec4899'
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Timeline */}
        <div className="split-column card-glass">
          <div className="split-header">
            <h3>Recent Maintenance</h3>
            <button
              type="button"
              className="link-btn"
              onClick={() => setView('logs')}
            >
              View All
            </button>
          </div>
          <p className="text-secondary text-xs mb-4">Your most recent vehicle logs</p>

          <div className="timeline-widget">
            {recentRecords.length === 0 ? (
              <div className="empty-widget">
                <p className="text-secondary text-sm">No maintenance logged yet.</p>
              </div>
            ) : (
              recentRecords.map((record) => {
                let accent = '#eab308';
                if (record.category === 'oil_change') {
                  accent = 'var(--neon-teal)';
                } else if (record.category === 'transmission_fluid' || record.category === 'transmission_oil') {
                  accent = '#6366f1';
                } else if (record.category === 'cabin_air_filter') {
                  accent = '#10b981';
                } else if (record.category === 'engine_air_filter' || record.category === 'air_filter') {
                  accent = '#10b981';
                } else if (record.category === 'brake_pads') {
                  accent = '#ef4444';
                } else if (record.category === 'brake_rotor') {
                  accent = '#ef4444';
                } else if (record.category === 'brake_fluid') {
                  accent = '#ef4444';
                } else if (record.category === 'spark_plugs') {
                  accent = '#a855f7';
                } else if (record.category === 'modification') {
                  accent = '#ec4899';
                }

                return (
                  <div key={record.id} className="timeline-item">
                    <div
                      className="timeline-indicator"
                      style={{
                        backgroundColor: accent,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <CategoryIcon category={record.category} size={13} style={{ color: '#080c14' }} />
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-title-row">
                        <h4>{record.title}</h4>
                        <span className="timeline-cost">${record.cost.toFixed(2)}</span>
                      </div>
                      <div className="timeline-meta">
                        <span>{record.kms.toLocaleString()} km</span>
                        <span className="dot">•</span>
                        <span>{new Date(record.date + 'T00:00:00').toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
