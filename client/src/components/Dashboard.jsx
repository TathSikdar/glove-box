/**
 * @fileoverview Vehicle Health Dashboard Component.
 * Displays vehicle statistics including expenses, log counts, current mileage,
 * a dynamic radial indicator gauge for oil change intervals, category breakdowns,
 * and a recent timeline widget.
 * Follows Google Coding Standards and React best practices.
 */

import React, { useState } from 'react';
import CategoryIcon from './CategoryIcon';

/**
 * Renders the dashboard landing view.
 * @param {!Object} props React component props.
 * @param {!Object} props.stats Aggregated statistics from backend.
 * @param {!Array<!Object>} props.recentRecords Small list of recent records.
 * @param {function(string): void} props.setView Setter to trigger page views.
 * @return {!React.ReactElement}
 */
export default function Dashboard({ stats, recentRecords, records = [], fuelLogs = [], activeCar = null, cars = [], setView, onEditCar }) {
  const [exportType, setExportType] = useState('both'); // 'maintenance', 'fuel', 'both'
  const [exportCarScope, setExportCarScope] = useState('active'); // 'active', 'all'
  const [exportTimeScope, setExportTimeScope] = useState('all'); // 'all', 'current_year'
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
   * containing the complete maintenance records, fuel records, or both
   * for the active vehicle.
   */
  const fetchExportData = async () => {
    let exportRecords = [];
    let exportFuelLogs = [];
    
    if (exportCarScope === 'all') {
      try {
        const [recordsRes, fuelRes] = await Promise.all([
          fetch('/api/records?carId=all'),
          fetch('/api/fuel?carId=all')
        ]);
        if (recordsRes.ok) exportRecords = await recordsRes.json();
        if (fuelRes.ok) exportFuelLogs = await fuelRes.json();
      } catch (err) {
        console.error('Failed to fetch all logs for export', err);
      }
    } else {
      exportRecords = [...records];
      exportFuelLogs = [...fuelLogs];
    }
    
    if (exportTimeScope === 'current_year') {
      const currentYear = new Date().getFullYear();
      exportRecords = exportRecords.filter(r => new Date(r.date).getFullYear() === currentYear);
      exportFuelLogs = exportFuelLogs.filter(f => new Date(f.date).getFullYear() === currentYear);
    }
    
    return { exportRecords, exportFuelLogs };
  };

  const getCarName = (carId) => {
    const car = cars.find(c => c.id === carId);
    if (car) return `${car.year} ${car.make} ${car.model}`;
    return 'Unknown Vehicle';
  };

  const downloadCSV = async () => {
    if (!activeCar) return;
    const { exportRecords, exportFuelLogs } = await fetchExportData();

    const downloadMaintenanceCSV = () => {
      if (exportRecords.length === 0) return;
      const baseHeaders = [
        'Date',
        'Category',
        'Odometer Reading (km)',
        'Cost ($)',
        'Title / Task',
        'Notes & Observations',
        'Scanned Receipt File'
      ];
      
      const headers = exportCarScope === 'all' ? ['Vehicle', ...baseHeaders] : baseHeaders;
      
      const rows = exportRecords.map((record) => {
        const dateStr = record.date;
        const categoryStr = record.category.toUpperCase().replace(/_/g, ' ');
        const kmsStr = record.kms;
        const costStr = record.cost.toFixed(2);
        const cleanTitle = `"${record.title.replace(/"/g, '""')}"`;
        const cleanNotes = `"${(record.notes || '').replace(/"/g, '""')}"`;
        const receiptStr = record.receipt_image 
          ? `"${window.location.origin}/uploads/${record.receipt_image}"` 
          : '"None"';
        
        const rowData = [dateStr, categoryStr, kmsStr, costStr, cleanTitle, cleanNotes, receiptStr];
        if (exportCarScope === 'all') {
          rowData.unshift(`"${getCarName(record.car_id)}"`);
        }
        return rowData.join(',');
      });
      
      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      const filenamePrefix = exportCarScope === 'all' ? 'glovebox_all_vehicles' : `glovebox_${activeCar.year}_${activeCar.make}_${activeCar.model}`;
      const filenameSuffix = exportTimeScope === 'current_year' ? '_current_year' : '';
      link.download = `${filenamePrefix}_service_history${filenameSuffix}.csv`.toLowerCase().replace(/\s+/g, '_');
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    const downloadFuelCSV = () => {
      if (exportFuelLogs.length === 0) return;

      const sortedLogs = [...exportFuelLogs].sort((a, b) => a.kms - b.kms);
      const calculatedEconMap = {};

      for (let i = 1; i < sortedLogs.length; i++) {
        const current = sortedLogs[i];
        const previous = sortedLogs[i - 1];

        // Ensure both logs are for the same car when exportCarScope === 'all'
        if (current.car_id !== previous.car_id) continue;

        if (current.full_tank === 1 && previous.full_tank === 1) {
          const distance = current.kms - previous.kms;
          if (distance > 0) {
            const econ = (current.liters / distance) * 100;
            calculatedEconMap[current.id] = parseFloat(econ.toFixed(2));
          }
        }
      }

      const baseHeaders = [
        'Date',
        'Odometer Reading (km)',
        'Liters',
        'Price per Liter',
        'Total Cost',
        'Full Tank',
        'Economy (L/100km)',
        'Scanned Receipt File'
      ];
      
      const headers = exportCarScope === 'all' ? ['Vehicle', ...baseHeaders] : baseHeaders;

      const sortedLogsDesc = [...exportFuelLogs].sort((a, b) => b.kms - a.kms);

      const rows = sortedLogsDesc.map((log) => {
        const dateStr = log.date;
        const kmsStr = log.kms;
        const litersStr = log.liters.toFixed(2);
        const priceStr = log.price_per_liter.toFixed(3);
        const costStr = log.cost.toFixed(2);
        const fullTankStr = log.full_tank === 1 ? 'Yes' : 'No';
        const econStr = calculatedEconMap[log.id] ? calculatedEconMap[log.id].toFixed(2) : 'N/A';
        const receiptStr = log.receipt_image 
          ? `"${window.location.origin}/uploads/${log.receipt_image}"` 
          : '"None"';

        const rowData = [dateStr, kmsStr, litersStr, priceStr, costStr, fullTankStr, econStr, receiptStr];
        if (exportCarScope === 'all') {
          rowData.unshift(`"${getCarName(log.car_id)}"`);
        }
        return rowData.join(',');
      });

      const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      const filenamePrefix = exportCarScope === 'all' ? 'glovebox_all_vehicles' : `glovebox_${activeCar.year}_${activeCar.make}_${activeCar.model}`;
      const filenameSuffix = exportTimeScope === 'current_year' ? '_current_year' : '';
      link.download = `${filenamePrefix}_fuel_history${filenameSuffix}.csv`.toLowerCase().replace(/\s+/g, '_');
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    };

    if (exportType === 'maintenance') {
      downloadMaintenanceCSV();
    } else if (exportType === 'fuel') {
      downloadFuelCSV();
    } else {
      downloadMaintenanceCSV();
      setTimeout(() => {
        downloadFuelCSV();
      }, 350);
    }
  };

  const generatePrintableReport = async () => {
    if (!activeCar) return;
    const { exportRecords, exportFuelLogs } = await fetchExportData();
    
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      alert('Pop-up blocked! Please allow pop-ups for GloveBox to open the service report.');
      return;
    }

    const sortedFuelLogs = [...exportFuelLogs].sort((a, b) => a.kms - b.kms);
    let totalLitersForEcon = 0;
    let totalDistanceForEcon = 0;
    const calculatedEconMap = {};

    for (let i = 1; i < sortedFuelLogs.length; i++) {
      const current = sortedFuelLogs[i];
      const previous = sortedFuelLogs[i - 1];

      if (current.car_id !== previous.car_id) continue;

      if (current.full_tank === 1 && previous.full_tank === 1) {
        const distance = current.kms - previous.kms;
        if (distance > 0) {
          const econ = (current.liters / distance) * 100;
          calculatedEconMap[current.id] = parseFloat(econ.toFixed(2));
          totalLitersForEcon += current.liters;
          totalDistanceForEcon += distance;
        }
      }
    }

    const avgEconomy = totalDistanceForEcon > 0
      ? parseFloat(((totalLitersForEcon / totalDistanceForEcon) * 100).toFixed(2))
      : null;

    const totalFuelCost = exportFuelLogs.reduce((acc, log) => acc + log.cost, 0);
    const totalFuelVolume = exportFuelLogs.reduce((acc, log) => acc + log.liters, 0);
    const totalMaintenanceCost = exportRecords.reduce((acc, record) => acc + record.cost, 0);
    const exportLogsCount = exportRecords.length;

    let summaryGridHTML = '';
    if (exportType === 'maintenance') {
      summaryGridHTML = `
        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Total Maintenance Cost</div>
            <div class="val">$${totalMaintenanceCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="summary-card">
            <div class="label">Logged Activities</div>
            <div class="val">${exportLogsCount} records</div>
          </div>
        </div>
      `;
    } else if (exportType === 'fuel') {
      summaryGridHTML = `
        <div class="summary-grid summary-grid-4">
          <div class="summary-card">
            <div class="label">Average Fuel Economy</div>
            <div class="val">${avgEconomy !== null ? avgEconomy + ' L/100km' : 'N/A'}</div>
          </div>
          <div class="summary-card">
            <div class="label">Total Fuel Cost</div>
            <div class="val">$${totalFuelCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="summary-card">
            <div class="label">Volume Filled</div>
            <div class="val">${totalFuelVolume.toLocaleString(undefined, { maximumFractionDigits: 1 })} L</div>
          </div>
        </div>
      `;
    } else {
      summaryGridHTML = `
        <div class="summary-grid summary-grid-4">
          <div class="summary-card">
            <div class="label">Total Maintenance Cost</div>
            <div class="val">$${totalMaintenanceCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="summary-card">
            <div class="label">Total Fuel Cost</div>
            <div class="val">$${totalFuelCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div class="summary-card">
            <div class="label">Average Fuel Economy</div>
            <div class="val">${avgEconomy !== null ? avgEconomy + ' L/100km' : 'N/A'}</div>
          </div>
        </div>
      `;
    }

    let mainContentHTML = '';

    if (exportType === 'maintenance' || exportType === 'both') {
      const recordsRows = exportRecords.map((r) => `
        <tr>
          ${exportCarScope === 'all' ? `<td>${getCarName(r.car_id)}</td>` : ''}
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

      mainContentHTML += `
        <h2 class="section-title">📋 Maintenance & Modification Logs</h2>
        ${exportRecords.length > 0 ? `
          <table>
            <thead>
              <tr>
                ${exportCarScope === 'all' ? '<th style="width: 15%">Vehicle</th>' : ''}
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
          <p style="color: var(--muted-color); font-style: italic; margin-top: 20px; margin-bottom: 40px;">No service history entries found.</p>
        `}
      `;
    }

    if (exportType === 'fuel' || exportType === 'both') {
      const fuelLogsDesc = [...exportFuelLogs].sort((a, b) => b.kms - a.kms);

      const fuelRows = fuelLogsDesc.map((log) => {
        const logEcon = calculatedEconMap[log.id];
        return `
          <tr>
            ${exportCarScope === 'all' ? `<td>${getCarName(log.car_id)}</td>` : ''}
            <td><strong>${new Date(log.date + 'T00:00:00').toLocaleDateString()}</strong></td>
            <td><strong>${log.kms.toLocaleString()} km</strong></td>
            <td>${log.liters.toFixed(2)} L</td>
            <td>$${log.price_per_liter.toFixed(3)}</td>
            <td class="text-right"><strong>$${log.cost.toFixed(2)}</strong></td>
            <td>
              ${log.full_tank === 1 ? (
                logEcon ? (
                  `<span class="badge badge-econ">🟢 ${logEcon} L/100km</span>`
                ) : (
                  `<span class="text-muted text-xs">Reference (Full)</span>`
                )
              ) : (
                `<span class="text-muted text-xs">Partial fill</span>`
              )}
            </td>
          </tr>
        `;
      }).join('');

      mainContentHTML += `
        <h2 class="section-title">⛽ Fuel Purchase & Economy Logs</h2>
        ${exportFuelLogs.length > 0 ? `
          <table>
            <thead>
              <tr>
                ${exportCarScope === 'all' ? '<th style="width: 15%">Vehicle</th>' : ''}
                <th style="width: 15%">Date</th>
                <th style="width: 15%">Odometer</th>
                <th style="width: 15%">Volume</th>
                <th style="width: 15%">Price/L</th>
                <th style="width: 15%" class="text-right">Cost</th>
                <th style="width: 25%">Efficiency</th>
              </tr>
            </thead>
            <tbody>
              ${fuelRows}
            </tbody>
          </table>
        ` : `
          <p style="color: var(--muted-color); font-style: italic; margin-top: 20px; margin-bottom: 40px;">No fuel logs found.</p>
        `}
      `;
    }

    const maintenanceReceipts = (exportType === 'maintenance' || exportType === 'both') 
      ? exportRecords.filter(r => r.receipt_image) 
      : [];
    const fuelReceipts = (exportType === 'fuel' || exportType === 'both') 
      ? exportFuelLogs.filter(f => f.receipt_image) 
      : [];

    let receiptsAnnexHTML = '';
    const totalReceiptsCount = maintenanceReceipts.length + fuelReceipts.length;

    if (totalReceiptsCount > 0) {
      let index = 1;
      const maintenanceAnnex = maintenanceReceipts.map((r) => `
        <div class="receipt-print-card">
          <div class="receipt-print-header">
            <h3>Receipt #${index++}: ${r.title} (Maintenance)</h3>
            <p>${exportCarScope === 'all' ? `Vehicle: <strong>${getCarName(r.car_id)}</strong> | ` : ''}Logged Odometer: <strong>${r.kms.toLocaleString()} km</strong> | Date: <strong>${new Date(r.date + 'T00:00:00').toLocaleDateString()}</strong> | Cost: <strong>$${r.cost.toFixed(2)}</strong></p>
          </div>
          <div class="receipt-print-image-container">
            <img src="/uploads/${r.receipt_image}" alt="Receipt crop for ${r.title}" />
          </div>
        </div>
      `).join('');

      const fuelAnnex = fuelReceipts.map((f) => `
        <div class="receipt-print-card">
          <div class="receipt-print-header">
            <h3>Receipt #${index++}: Fuel Purchase (${f.liters.toFixed(2)} L) (Fuel)</h3>
            <p>${exportCarScope === 'all' ? `Vehicle: <strong>${getCarName(f.car_id)}</strong> | ` : ''}Logged Odometer: <strong>${f.kms.toLocaleString()} km</strong> | Date: <strong>${new Date(f.date + 'T00:00:00').toLocaleDateString()}</strong> | Cost: <strong>$${f.cost.toFixed(2)}</strong></p>
          </div>
          <div class="receipt-print-image-container">
            <img src="/uploads/${f.receipt_image}" alt="Fuel Receipt crop" />
          </div>
        </div>
      `).join('');

      receiptsAnnexHTML = `
        <h2 class="section-title">📸 Scanned Receipts Annex (${totalReceiptsCount})</h2>
        <div class="receipts-print-gallery">
          ${maintenanceAnnex}
          ${fuelAnnex}
        </div>
      `;
    }
    
    const titleText = exportCarScope === 'all' ? 'All Vehicles' : `${activeCar.year} ${activeCar.make} ${activeCar.model}`;
    const timeText = exportTimeScope === 'current_year' ? ' (Current Year)' : '';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>GloveBox Service Dossier - ${titleText}</title>
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

          .summary-grid-4 {
            grid-template-columns: repeat(4, 1fr);
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
          .badge-econ { background: #e0f2fe; color: #0369a1; }
          .text-xs { font-size: 11px; }
          .text-muted { color: var(--muted-color); }
          
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
              max-height: 9.5in;
            }
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <div>
            <h1>GloveBox Service History</h1>
            <p class="vehicle-details">🚗 ${titleText}${timeText}</p>
          </div>
          <div class="report-meta">
            <p>Generated: <strong>${new Date().toLocaleDateString()}</strong></p>
          </div>
        </div>
        
        ${summaryGridHTML}
        
        ${mainContentHTML}
        
        ${receiptsAnnexHTML}
        
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
        remainingKmsDisplay = `${Math.abs(oilChangeDueInKms).toLocaleString()} km`;
        gaugeLabelDisplay = 'Overdue (Kms & Time)';
      } else if (isKmsOverdue) {
        remainingKmsDisplay = `${Math.abs(oilChangeDueInKms).toLocaleString()} km`;
        gaugeLabelDisplay = 'Overdue';
      } else {
        remainingKmsDisplay = `${Math.abs(oilChangeDueInKms).toLocaleString()} km`;
        gaugeLabelDisplay = 'Overdue (By Time)';
      }
    } else {
      // Not overdue, select the one closer to expiration (smaller percentage)
      if (pctKms <= pctDays) {
        oilChangePercentage = pctKms;
      } else {
        oilChangePercentage = pctDays;
      }
      
      remainingKmsDisplay = `${oilChangeDueInKms.toLocaleString()} km`;
      gaugeLabelDisplay = 'Left';

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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span>🚗 Odometer Status</span>
                      <span>{elapsedKms.toLocaleString()} / {OIL_CHANGE_INTERVAL.toLocaleString()} km</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', opacity: 0.7 }}>{elapsedKms.toLocaleString()} km elapsed since last service</span>
                      <strong style={{ color: oilChangeDueInKms <= 0 ? 'var(--error-red)' : 'var(--neon-teal)', fontSize: '13px' }}>
                        {oilChangeDueInKms <= 0 
                          ? `Overdue by ${Math.abs(oilChangeDueInKms).toLocaleString()} km` 
                          : `${oilChangeDueInKms.toLocaleString()} km left`}
                      </strong>
                    </div>
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
        {activeCar && (records.length > 0 || fuelLogs.length > 0) && (
          <section className="export-history-section card-glass">
            <div className="export-header-row">
              <div className="export-text">
                <h3>💾 Export & Print Service History</h3>
                <p className="text-secondary text-sm">
                  Compile your vehicle maintenance history into a structured CSV spreadsheet or generate a beautiful print-ready service dossier including scanned receipts.
                </p>
                {/* Radio selection group */}
                <div className="export-selector-group">
                  <label className={`export-radio-label ${exportType === 'maintenance' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="export-type"
                      value="maintenance"
                      checked={exportType === 'maintenance'}
                      onChange={() => setExportType('maintenance')}
                      style={{ accentColor: 'var(--neon-teal)', width: '16px', height: '16px', margin: 0, cursor: 'pointer' }}
                    />
                    Maintenance Logs Only
                  </label>
                  <label className={`export-radio-label ${exportType === 'fuel' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="export-type"
                      value="fuel"
                      checked={exportType === 'fuel'}
                      onChange={() => setExportType('fuel')}
                      style={{ accentColor: 'var(--neon-teal)', width: '16px', height: '16px', margin: 0, cursor: 'pointer' }}
                    />
                    Fuel Logs Only
                  </label>
                  <label className={`export-radio-label ${exportType === 'both' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="export-type"
                      value="both"
                      checked={exportType === 'both'}
                      onChange={() => setExportType('both')}
                      style={{ accentColor: 'var(--neon-teal)', width: '16px', height: '16px', margin: 0, cursor: 'pointer' }}
                    />
                    Both Logs
                  </label>
                </div>

                <div className="export-selector-group" style={{ marginTop: '10px' }}>
                  <label className={`export-radio-label ${exportCarScope === 'active' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="export-car-scope"
                      value="active"
                      checked={exportCarScope === 'active'}
                      onChange={() => setExportCarScope('active')}
                      style={{ accentColor: 'var(--neon-teal)', width: '16px', height: '16px', margin: 0, cursor: 'pointer' }}
                    />
                    Current Vehicle
                  </label>
                  <label className={`export-radio-label ${exportCarScope === 'all' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="export-car-scope"
                      value="all"
                      checked={exportCarScope === 'all'}
                      onChange={() => setExportCarScope('all')}
                      style={{ accentColor: 'var(--neon-teal)', width: '16px', height: '16px', margin: 0, cursor: 'pointer' }}
                    />
                    All Vehicles
                  </label>
                </div>

                <div className="export-selector-group" style={{ marginTop: '10px' }}>
                  <label className={`export-radio-label ${exportTimeScope === 'all' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="export-time-scope"
                      value="all"
                      checked={exportTimeScope === 'all'}
                      onChange={() => setExportTimeScope('all')}
                      style={{ accentColor: 'var(--neon-teal)', width: '16px', height: '16px', margin: 0, cursor: 'pointer' }}
                    />
                    All Time
                  </label>
                  <label className={`export-radio-label ${exportTimeScope === 'current_year' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="export-time-scope"
                      value="current_year"
                      checked={exportTimeScope === 'current_year'}
                      onChange={() => setExportTimeScope('current_year')}
                      style={{ accentColor: 'var(--neon-teal)', width: '16px', height: '16px', margin: 0, cursor: 'pointer' }}
                    />
                    Current Year
                  </label>
                </div>
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
