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
export default function Dashboard({ stats, recentRecords, records = [], activeCar = null, setView, onEditCar }) {
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

  /**
   * Generates and downloads a clean, sanitised CSV spreadsheet file
   * containing the complete maintenance records for the active vehicle.
   */
  const downloadCSV = () => {
    if (!activeCar || records.length === 0) return;
    
    const headers = [
      'Date',
      'Category',
      'Odometer Reading (km)',
      'Cost ($)',
      'Title / Task',
      'Notes & Observations',
      'Scanned Receipt File'
    ];
    
    // Process rows with CSV escapes for quotes and commas
    const rows = records.map((record) => {
      const dateStr = record.date;
      const categoryStr = record.category.toUpperCase().replace(/_/g, ' ');
      const kmsStr = record.kms;
      const costStr = record.cost.toFixed(2);
      
      // Escape inner quotes by doubling them, wrap values containing quotes or commas in double quotes
      const cleanTitle = `"${record.title.replace(/"/g, '""')}"`;
      const cleanNotes = `"${(record.notes || '').replace(/"/g, '""')}"`;
      const receiptStr = record.receipt_image 
        ? `"${window.location.origin}/uploads/${record.receipt_image}"` 
        : '"None"';
      
      return [dateStr, categoryStr, kmsStr, costStr, cleanTitle, cleanNotes, receiptStr].join(',');
    });
    
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n'); // Add UTF-8 BOM
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `glovebox_${activeCar.year}_${activeCar.make}_${activeCar.model}_service_history.csv`.toLowerCase().replace(/\s+/g, '_');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /**
   * Compiles and opens an immersive, print-ready HTML service history report
   * in a new browser tab, automatically prompting the browser print dial.
   */
  const generatePrintableReport = () => {
    if (!activeCar) return;
    
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      alert('Pop-up blocked! Please allow pop-ups for GloveBox to open the service report.');
      return;
    }
    
    // Generate beautiful list of records
    const recordsRows = records.map((r) => `
      <tr>
        <td><strong>${new Date(r.date + 'T00:00:00').toLocaleDateString()}</strong></td>
        <td><span class="badge badge-${r.category}">${r.category.toUpperCase().replace(/_/g, ' ')}</span></td>
        <td><strong>${r.kms.toLocaleString()} km</strong></td>
        <td class="text-right"><strong>$${r.cost.toFixed(2)}</strong></td>
        <td>
          <div class="row-title">${r.title}</div>
          ${r.notes ? `<div class="row-notes">${r.notes}</div>` : ''}
        </td>
      </tr>
    `).join('');
    
    // Generate scanned receipts annex images
    const receiptRecords = records.filter(r => r.receipt_image);
    const receiptsAnnex = receiptRecords.map((r, index) => `
      <div class="receipt-print-card">
        <div class="receipt-print-header">
          <h3>Receipt #${index + 1}: ${r.title}</h3>
          <p>Logged Odometer: <strong>${r.kms.toLocaleString()} km</strong> | Date: <strong>${new Date(r.date + 'T00:00:00').toLocaleDateString()}</strong> | Cost: <strong>$${r.cost.toFixed(2)}</strong></p>
        </div>
        <div class="receipt-print-image-container">
          <img src="/uploads/${r.receipt_image}" alt="Receipt crop for ${r.title}" />
        </div>
      </div>
    `).join('');
    
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>GloveBox Service Dossier - ${activeCar.year} ${activeCar.make} ${activeCar.model}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
          
          :root {
            --bg-color: #ffffff;
            --text-color: #0f172a;
            --border-color: #e2e8f0;
            --primary-color: #0f172a;
            --accent-color: #0d9488;
            --muted-color: #64748b;
          }
          
          body {
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            margin: 0;
            padding: 40px;
            font-size: 14px;
            line-height: 1.5;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          .report-header {
            border-bottom: 2px solid var(--primary-color);
            padding-bottom: 20px;
            margin-bottom: 30px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          
          .report-header h1 {
            font-size: 28px;
            font-weight: 800;
            margin: 0 0 5px 0;
            letter-spacing: -0.5px;
          }
          
          .report-header .vehicle-details {
            font-size: 16px;
            font-weight: 600;
            color: var(--accent-color);
            margin: 0;
          }
          
          .report-meta {
            text-align: right;
            font-size: 12px;
            color: var(--muted-color);
          }
          
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-bottom: 40px;
          }
          
          .summary-card {
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 15px 20px;
            background: #f8fafc;
          }
          
          .summary-card .label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--muted-color);
            margin-bottom: 5px;
            font-weight: 600;
          }
          
          .summary-card .val {
            font-size: 20px;
            font-weight: 700;
            margin: 0;
          }
          
          h2.section-title {
            font-size: 18px;
            font-weight: 700;
            margin-top: 40px;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 8px;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 40px;
          }
          
          th {
            text-align: left;
            padding: 12px 10px;
            border-bottom: 2px solid var(--border-color);
            font-weight: 700;
            font-size: 12px;
            color: var(--muted-color);
            text-transform: uppercase;
          }
          
          td {
            padding: 12px 10px;
            border-bottom: 1px solid var(--border-color);
            vertical-align: top;
          }
          
          .text-right {
            text-align: right;
          }
          
          .badge {
            display: inline-block;
            padding: 3px 8px;
            font-size: 10px;
            font-weight: 700;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .badge-oil_change { background: #ccfbf1; color: #115e59; }
          .badge-modification { background: #fef3c7; color: #92400e; }
          .badge-transmission_fluid, .badge-transmission_oil { background: #e0e7ff; color: #3730a3; }
          .badge-brake_pads, .badge-brake_rotor, .badge-brake_fluid { background: #fee2e2; color: #991b1b; }
          
          .row-title {
            font-weight: 600;
            margin-bottom: 4px;
          }
          
          .row-notes {
            font-size: 12px;
            color: var(--muted-color);
            white-space: pre-wrap;
          }
          
          .receipt-print-card {
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 30px;
            background: #ffffff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            page-break-inside: avoid;
          }
          
          .receipt-print-header {
            margin-bottom: 15px;
            border-bottom: 1px dashed var(--border-color);
            padding-bottom: 10px;
          }
          
          .receipt-print-header h3 {
            margin: 0 0 5px 0;
            font-size: 15px;
            font-weight: 700;
          }
          
          .receipt-print-header p {
            margin: 0;
            font-size: 12px;
            color: var(--muted-color);
          }
          
          .receipt-print-image-container {
            text-align: center;
            padding: 10px 0;
          }
          
          .receipt-print-image-container img {
            max-width: 100%;
            max-height: 800px;
            border-radius: 6px;
            border: 1px solid var(--border-color);
            object-fit: contain;
          }
          
          .print-actions {
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: #0f172a;
            color: #ffffff;
            border: none;
            padding: 12px 24px;
            font-weight: 700;
            border-radius: 30px;
            cursor: pointer;
            box-shadow: 0 10px 25px rgba(0,0,0,0.25);
            display: flex;
            align-items: center;
            gap: 8px;
            font-family: inherit;
            font-size: 14px;
            transition: all 0.2s ease;
          }
          
          .print-actions:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 30px rgba(0,0,0,0.35);
            background: #1e293b;
          }
          
          /* Print-specific layout overrides */
          @media print {
            body {
              padding: 0;
            }
            .print-actions {
              display: none !important;
            }
            .receipt-print-card {
              page-break-before: always;
              border: none;
              box-shadow: none;
              padding: 0;
            }
            .receipt-print-image-container img {
              max-height: 9.5in; /* Optimize to fit a standard letter page height perfectly */
            }
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <div>
            <h1>GloveBox Service History</h1>
            <p class="vehicle-details">🚗 ${activeCar.year} ${activeCar.make} ${activeCar.model}</p>
          </div>
          <div class="report-meta">
            <p>Generated: <strong>${new Date().toLocaleDateString()}</strong></p>
          </div>
        </div>
        
        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Current Odometer</div>
            <div class="val">${currentKms.toLocaleString()} km</div>
          </div>
          <div class="summary-card">
            <div class="label">Total Maintenance Cost</div>
            <div class="val">$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="summary-card">
            <div class="label">Logged Activities</div>
            <div class="val">${logsCount} records</div>
          </div>
        </div>
        
        <h2 class="section-title">📋 Maintenance & Modification Logs</h2>
        ${records.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th style="width: 15%">Date</th>
                <th style="width: 20%">Category</th>
                <th style="width: 15%">Odometer</th>
                <th style="width: 15%" class="text-right">Cost</th>
                <th style="width: 35%">Title & Notes</th>
              </tr>
            </thead>
            <tbody>
              ${recordsRows}
            </tbody>
          </table>
        ` : `
          <p style="color: var(--muted-color); font-style: italic; margin-top: 20px;">No service history entries registered for this vehicle.</p>
        `}
        
        ${receiptRecords.length > 0 ? `
          <h2 class="section-title">📸 Scanned Receipts Annex (${receiptRecords.length})</h2>
          <div class="receipts-print-gallery">
            ${receiptsAnnex}
          </div>
        ` : ''}
        
        <button class="print-actions" onclick="window.print()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
          Print / Save as PDF
        </button>
      </body>
      </html>
    `;
    
    reportWindow.document.open();
    reportWindow.document.write(htmlContent);
    reportWindow.document.close();
  };
  
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
        gaugeLabelDisplay = 'Left';
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
            <div class="metric-details">
              <span className="metric-label">Logged Logs</span>
              <h3 className="metric-value">{logsCount}</h3>
            </div>
          </div>
        </section>

        {/* 2.5 Export & Print Vehicle Dossier Card */}
        {activeCar && records.length > 0 && (
          <section className="export-history-section card-glass">
            <div className="export-header-row">
              <div className="export-text">
                <h3>💾 Export & Print Service History</h3>
                <p className="text-secondary text-sm">
                  Compile your vehicle maintenance history into a structured CSV spreadsheet or generate a beautiful print-ready service dossier including scanned receipts.
                </p>
              </div>
              <div className="export-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-export"
                  onClick={downloadCSV}
                  title="Download spreadsheet log format"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '6px' }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  Download CSV
                </button>
                <button
                  type="button"
                  className="btn btn-glow btn-export-primary"
                  onClick={generatePrintableReport}
                  title="Generate printable report with receipts"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '6px' }}>
                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                    <rect x="6" y="14" width="12" height="8"></rect>
                  </svg>
                  Generate Report
                </button>
              </div>
            </div>
          </section>
        )}

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
