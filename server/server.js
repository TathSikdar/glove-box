/**
 * @fileoverview Main Express API server for GloveBox.
 * Provides RESTful CRUD API endpoints for managing vehicles (cars) and their
 * respective maintenance logs, handles receipt file uploads, and serves static files.
 * Scope metrics and timeline lists explicitly per active vehicle.
 * Follows Google Coding Standards and JSDoc conventions.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { spawn } = require('child_process');
const db = require('./db');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
const port = process.env.PORT || 3000;

// Middleware configuration
app.use(cors());
app.use(express.json());

// Set up directories for local storage of uploaded files
const uploadsDir = process.env.UPLOADS_PATH || path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded receipts statically
app.use('/uploads', express.static(uploadsDir));

// Configuration for file upload handling via Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `receipt-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit size to 10MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/i;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only JPEG, JPG, PNG, and WEBP image files are allowed.'));
  }
});

// ==========================================
// REST API: OpenCV Receipt Stitching
// ==========================================

/**
 * POST /api/stitch
 * Receives multiple receipt segments and uses OpenCV in a Python child process
 * to intelligently stitch them via feature matching.
 */
app.post('/api/stitch', upload.array('segments', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No image segments provided.' });
  }

  const filePaths = req.files.map(f => f.path);
  
  if (filePaths.length === 1) {
    // If only one file, no need to stitch
    const fileUrl = `/uploads/${req.files[0].filename}`;
    return res.json({ success: true, url: fileUrl, filename: req.files[0].filename });
  }

  const outputFilename = `receipt-stitched-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
  const outputPath = path.join(uploadsDir, outputFilename);

  const pythonScript = path.join(__dirname, 'utils', 'stitch.py');
  
  // Use 'python' on Windows local dev, and 'python3' inside the Alpine Linux Docker container
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const pythonProcess = spawn(pythonCmd, [pythonScript, outputPath, ...filePaths]);

  let stdoutData = '';
  let stderrData = '';

  pythonProcess.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  pythonProcess.on('close', (code) => {
    // Cleanup temporary individual segments to save space
    filePaths.forEach(p => {
      fs.unlink(p, (err) => {
        if (err) console.error('[Stitcher] Error deleting temporary segment:', err);
      });
    });

    if (code !== 0 || stdoutData.includes('STITCH_ERROR')) {
      console.error('[Stitcher] Python process exited with code', code);
      console.error('[Stitcher] stderr:', stderrData);
      console.error('[Stitcher] stdout:', stdoutData);
      
      // Usually fails if there aren't enough overlapping features between photos
      return res.status(500).json({ error: 'Image stitching failed. Make sure the photos have enough overlapping text to align.' });
    }

    res.json({
      success: true,
      url: `/uploads/${outputFilename}`,
      filename: outputFilename
    });
  });
});

/**
 * POST /api/detect-corners
 * Uploads a single image and returns 4 normalized quad corners via OpenCV.
 */
app.post('/api/detect-corners', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided for edge detection.' });
  }

  const filePath = req.file.path;
  const scriptPath = path.join(__dirname, 'utils', 'detect_corners.py');

  const pythonProcess = spawn('python', [scriptPath, filePath]);

  let stdoutData = '';
  let stderrData = '';

  pythonProcess.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  pythonProcess.on('close', (code) => {
    // Delete the temporary image used for detection
    fs.unlink(filePath, (err) => {
      if (err) console.error('[Detector] Error deleting temp image:', err);
    });

    if (code !== 0 || stdoutData.includes('DETECT_ERROR')) {
      console.error('[Detector] Python process failed with code', code);
      console.error('[Detector] stderr:', stderrData);
      return res.status(500).json({ error: 'Failed to detect edges' });
    }

    try {
      // The Python script prints the JSON array as its last output line
      const lines = stdoutData.trim().split('\n');
      const jsonStr = lines[lines.length - 1];
      const corners = JSON.parse(jsonStr);
      res.json(corners);
    } catch (err) {
      console.error('[Detector] JSON Parse Error:', err);
      res.status(500).json({ error: 'Invalid output from edge detector' });
    }
  });
});

/**
 * POST /api/parse-receipt
 * Parses a gas station receipt using Google Gemini 1.5 Flash Vision LLM.
 * Expects a single image upload.
 */
app.post('/api/parse-receipt', upload.single('receipt'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No receipt image provided.' });
  }

  try {
    const base64Image = fs.readFileSync(req.file.path).toString("base64");
    
    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const result = await model.generateContent([
      'Extract the total cost, price per liter, and total volume (liters/gallons) from this gas station receipt. Use mathematics (price_per_liter * volume = total) to verify your findings if the receipt is hard to read. Return ONLY pure JSON with the keys: "total", "liters", "pricePerLiter". Do not include markdown code blocks, backticks, or any other text, just raw JSON.',
      {
        inlineData: {
          data: base64Image,
          mimeType: req.file.mimetype
        }
      }
    ]);

    const outputText = result.response.text().trim();
    // Clean up potential markdown formatting if the model disobeys
    const cleanJson = outputText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsed = JSON.parse(cleanJson);

    // Delete temp file
    fs.unlink(req.file.path, () => {});

    res.json({
      success: true,
      data: parsed
    });
  } catch (error) {
    console.error('[Gemini OCR] Parse failure:', error);
    fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: 'Failed to extract receipt data using Gemini.' });
  }
});

// ==========================================
// REST API: Cars/Vehicles Endpoints
// ==========================================

/**
 * GET /api/cars
 * Returns a list of all registered vehicles.
 */
app.get('/api/cars', (req, res) => {
  const query = 'SELECT * FROM cars ORDER BY year DESC, make ASC';
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('[API] Error fetching cars:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    res.json(rows);
  });
});

/**
 * POST /api/cars
 * Registers a new vehicle in the system.
 */
app.post('/api/cars', (req, res) => {
  const { make, model, year, oil_interval, oil_months } = req.body;

  if (!make || !model || !year) {
    return res.status(400).json({ error: 'Missing required fields (make, model, year)' });
  }

  const parsedYear = parseInt(year, 10);
  const parsedInterval = parseInt(oil_interval, 10) || 8000;
  const parsedMonths = parseInt(oil_months, 10) || 6;
  
  const query = 'INSERT INTO cars (make, model, year, oil_interval, oil_months) VALUES (?, ?, ?, ?, ?)';
  const params = [make.trim(), model.trim(), parsedYear, parsedInterval, parsedMonths];

  db.run(query, params, function(err) {
    if (err) {
      console.error('[API] Error adding car:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    res.status(201).json({
      id: this.lastID,
      make,
      model,
      year: parsedYear,
      oil_interval: parsedInterval,
      oil_months: parsedMonths
    });
  });
});

/**
 * PUT /api/cars/:id
 * Updates make, model, year, and oil change interval for an existing vehicle.
 */
app.put('/api/cars/:id', (req, res) => {
  const { id } = req.params;
  const { make, model, year, oil_interval, oil_months } = req.body;

  if (!make || !model || !year) {
    return res.status(400).json({ error: 'Missing required fields (make, model, year)' });
  }

  const parsedYear = parseInt(year, 10);
  const parsedInterval = parseInt(oil_interval, 10) || 8000;
  const parsedMonths = parseInt(oil_months, 10) || 6;

  const query = 'UPDATE cars SET make = ?, model = ?, year = ?, oil_interval = ?, oil_months = ? WHERE id = ?';
  const params = [make.trim(), model.trim(), parsedYear, parsedInterval, parsedMonths, id];

  db.run(query, params, function(err) {
    if (err) {
      console.error('[API] Error updating car:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Vehicle not found' });
    }
    res.json({
      id,
      make,
      model,
      year: parsedYear,
      oil_interval: parsedInterval,
      oil_months: parsedMonths
    });
  });
});

/**
 * DELETE /api/cars/:id
 * Removes a vehicle, unlinks all associated receipt images on disk,
 * and deletes all its maintenance/modification logs.
 */
app.delete('/api/cars/:id', (req, res) => {
  const { id } = req.params;

  // 1. Retrieve all receipt images for this car (both service records and fuel logs) to unlink from disk
  const selectQuery = 'SELECT receipt_image FROM records WHERE car_id = ?';
  const selectFuelQuery = 'SELECT receipt_image FROM fuel_logs WHERE car_id = ?';

  db.all(selectQuery, [id], (selectErr, recordRows) => {
    if (selectErr) {
      console.error('[API] Error retrieving car receipts:', selectErr.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    db.all(selectFuelQuery, [id], (selectFuelErr, fuelRows) => {
      if (selectFuelErr) {
        console.error('[API] Error retrieving car fuel receipts:', selectFuelErr.message);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      const allReceipts = [
        ...(recordRows || []).map(r => r.receipt_image),
        ...(fuelRows || []).map(f => f.receipt_image)
      ].filter(Boolean);

      // 2. Perform database deletes sequentially
      db.serialize(() => {
        db.run('DELETE FROM records WHERE car_id = ?', [id], (deleteRecErr) => {
          if (deleteRecErr) {
            console.error('[API] Error cascading deletes on records:', deleteRecErr.message);
          }
        });

        db.run('DELETE FROM fuel_logs WHERE car_id = ?', [id], (deleteFuelErr) => {
          if (deleteFuelErr) {
            console.error('[API] Error cascading deletes on fuel logs:', deleteFuelErr.message);
          }
        });

        db.run('DELETE FROM cars WHERE id = ?', [id], function(deleteCarErr) {
          if (deleteCarErr) {
            console.error('[API] Error deleting car:', deleteCarErr.message);
            return res.status(500).json({ error: 'Internal Server Error' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: 'Car not found' });
          }

          // 3. Clean up physical files on success
          if (allReceipts.length > 0) {
            allReceipts.forEach((receiptImage) => {
              const filePath = path.join(uploadsDir, receiptImage);
              fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr && unlinkErr.code !== 'ENOENT') {
                  console.error('[API] Error unlinking file on cascade delete:', unlinkErr.message);
                }
              });
            });
            console.log(`[API] Cascade deleted ${allReceipts.length} receipt images for car ID: ${id}`);
          }

          res.json({ message: 'Car and all associated logs deleted successfully', id });
        });
      });
    });
  });
});

// ==========================================
// REST API: Records Endpoints
// ==========================================

/**
 * GET /api/records
 * Returns maintenance logs. Filters by `carId` query parameter.
 */
app.get('/api/records', (req, res) => {
  const { carId } = req.query;

  if (!carId) {
    return res.status(400).json({ error: 'Missing carId query parameter' });
  }

  let query, params;
  if (carId === 'all') {
    query = 'SELECT * FROM records ORDER BY date DESC, kms DESC';
    params = [];
  } else {
    query = 'SELECT * FROM records WHERE car_id = ? ORDER BY kms DESC, date DESC';
    params = [carId];
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('[API] Error fetching records:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    res.json(rows);
  });
});

/**
 * POST /api/records
 * Creates a log tied to a specific `car_id`.
 */
app.post('/api/records', upload.single('receipt'), (req, res) => {
  const { category, title, kms, date, cost, notes, car_id } = req.body;

  if (!category || !title || !kms || !date || !car_id) {
    return res.status(400).json({ error: 'Missing required fields (category, title, kms, date, car_id)' });
  }

  const parsedKms = parseInt(kms, 10);
  const parsedCost = parseFloat(cost) || 0.0;
  const parsedCarId = parseInt(car_id, 10);
  const receiptImage = req.file ? req.file.filename : null;

  const query = `
    INSERT INTO records (category, title, kms, date, cost, notes, receipt_image, car_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [category, title, parsedKms, date, parsedCost, notes || '', receiptImage, parsedCarId];

  db.run(query, params, function(err) {
    if (err) {
      console.error('[API] Error saving record:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    
    res.status(201).json({
      id: this.lastID,
      category,
      title,
      kms: parsedKms,
      date,
      cost: parsedCost,
      notes,
      receipt_image: receiptImage,
      car_id: parsedCarId
    });
  });
});

/**
 * PUT /api/records/:id
 * Updates text fields on an existing log.
 */
app.put('/api/records/:id', (req, res) => {
  const { id } = req.params;
  const { category, title, kms, date, cost, notes } = req.body;

  if (!category || !title || !kms || !date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const parsedKms = parseInt(kms, 10);
  const parsedCost = parseFloat(cost) || 0.0;

  const query = `
    UPDATE records
    SET category = ?, title = ?, kms = ?, date = ?, cost = ?, notes = ?
    WHERE id = ?
  `;
  const params = [category, title, parsedKms, date, parsedCost, notes || '', id];

  db.run(query, params, function(err) {
    if (err) {
      console.error('[API] Error updating record:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json({ id, category, title, kms: parsedKms, date, cost: parsedCost, notes });
  });
});

/**
 * DELETE /api/records/:id
 * Deletes an individual record and its physical receipt image.
 */
app.delete('/api/records/:id', (req, res) => {
  const { id } = req.params;

  const selectQuery = 'SELECT receipt_image FROM records WHERE id = ?';
  db.get(selectQuery, [id], (selectErr, row) => {
    if (selectErr) {
      console.error('[API] Error searching record:', selectErr.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const deleteQuery = 'DELETE FROM records WHERE id = ?';
    db.run(deleteQuery, [id], function(deleteErr) {
      if (deleteErr) {
        console.error('[API] Error deleting record:', deleteErr.message);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      if (row.receipt_image) {
        const filePath = path.join(uploadsDir, row.receipt_image);
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr && unlinkErr.code !== 'ENOENT') {
            console.error('[API] Error deleting local file:', unlinkErr.message);
          }
        });
      }

      res.json({ message: 'Record and receipt successfully deleted', id });
    });
  });
});

// ==========================================
// REST API: Fuel Logging Endpoints
// ==========================================

/**
 * GET /api/fuel
 * Returns all fuel logs for the vehicle, ordered by mileage desc.
 */
app.get('/api/fuel', (req, res) => {
  const { carId } = req.query;

  if (!carId) {
    return res.status(400).json({ error: 'Missing carId query parameter' });
  }

  let query, params;
  if (carId === 'all') {
    query = 'SELECT * FROM fuel_logs ORDER BY date DESC, kms DESC';
    params = [];
  } else {
    query = 'SELECT * FROM fuel_logs WHERE car_id = ? ORDER BY kms DESC, date DESC';
    params = [carId];
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('[API] Error fetching fuel logs:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    res.json(rows);
  });
});

/**
 * POST /api/fuel
 * Logs a new fuel fill-up, supporting receipt image upload.
 */
app.post('/api/fuel', upload.single('receipt'), (req, res) => {
  const { car_id, date, kms, liters, price_per_liter, full_tank } = req.body;

  if (!car_id || !date || !kms || !liters || !price_per_liter) {
    return res.status(400).json({ error: 'Missing required fuel fields' });
  }

  const parsedCarId = parseInt(car_id, 10);
  const parsedKms = parseInt(kms, 10);
  const parsedLiters = parseFloat(liters);
  const parsedPrice = parseFloat(price_per_liter);
  const parsedFullTank = full_tank === undefined ? 1 : (full_tank == 'true' || full_tank == '1' || full_tank === true ? 1 : 0);
  
  // Calculate cost automatically
  const computedCost = parseFloat((parsedLiters * parsedPrice).toFixed(2));
  const receiptImage = req.file ? req.file.filename : null;

  const query = `
    INSERT INTO fuel_logs (car_id, date, kms, liters, price_per_liter, cost, full_tank, receipt_image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [parsedCarId, date, parsedKms, parsedLiters, parsedPrice, computedCost, parsedFullTank, receiptImage];

  db.run(query, params, function(err) {
    if (err) {
      console.error('[API] Error saving fuel log:', err.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    
    res.status(201).json({
      id: this.lastID,
      car_id: parsedCarId,
      date,
      kms: parsedKms,
      liters: parsedLiters,
      price_per_liter: parsedPrice,
      cost: computedCost,
      full_tank: parsedFullTank,
      receipt_image: receiptImage
    });
  });
});

/**
 * DELETE /api/fuel/:id
 * Deletes a fuel fill-up log and unlinks its physical receipt scan if present.
 */
app.delete('/api/fuel/:id', (req, res) => {
  const { id } = req.params;

  const selectQuery = 'SELECT receipt_image FROM fuel_logs WHERE id = ?';
  db.get(selectQuery, [id], (selectErr, row) => {
    if (selectErr) {
      console.error('[API] Error searching fuel log:', selectErr.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Fuel log not found' });
    }

    const deleteQuery = 'DELETE FROM fuel_logs WHERE id = ?';
    db.run(deleteQuery, [id], function(deleteErr) {
      if (deleteErr) {
        console.error('[API] Error deleting fuel log:', deleteErr.message);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      if (row.receipt_image) {
        const filePath = path.join(uploadsDir, row.receipt_image);
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr && unlinkErr.code !== 'ENOENT') {
            console.error('[API] Error deleting local file:', unlinkErr.message);
          }
        });
      }

      res.json({ message: 'Fuel log and receipt successfully deleted', id });
    });
  });
});

/**
 * GET /api/stats
 * Aggregates statistics specifically for the requested `carId`.
 */
app.get('/api/stats', (req, res) => {
  const { carId } = req.query;

  if (!carId) {
    return res.status(400).json({ error: 'Missing carId query parameter' });
  }

  // 1. Query the vehicle database first to retrieve its custom oil_interval and oil_months
  db.get('SELECT oil_interval, oil_months FROM cars WHERE id = ?', [carId], (carErr, carRow) => {
    if (carErr) {
      console.error('[API] Error retrieving vehicle for stats:', carErr.message);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    const oilInterval = carRow ? carRow.oil_interval : 8000;
    const oilMonths = carRow ? carRow.oil_months : 6;

    const stats = {
      currentKms: 0,
      totalCost: 0,
      maintenanceCost: 0,
      fuelCost: 0,
      logsCount: 0,
      lastOilChangeKms: null,
      lastOilChangeDate: null,
      oilChangeDueInKms: null,
      oilChangeDueInDays: null,
      oilInterval: oilInterval,
      oilMonths: oilMonths,
      breakdown: {
        oil_change: 0,
        transmission_fluid: 0,
        transmission_oil: 0,
        cabin_air_filter: 0,
        engine_air_filter: 0,
        air_filter: 0,
        brake_pads: 0,
        brake_rotor: 0,
        brake_fluid: 0,
        spark_plugs: 0,
        custom_maintenance: 0,
        modification: 0
      }
    };

    // 2. Query logs to calculate odometer current limits and remaining calculations
    db.all('SELECT category, kms, cost, date FROM records WHERE car_id = ?', [carId], (err, rows) => {
      if (err) {
        console.error('[API] Error calculating stats:', err.message);
        return res.status(500).json({ error: 'Internal Server Error' });
      }

      stats.logsCount = rows.length;

      let maxKms = 0;
      let maxOilKms = null;
      let maxOilDate = null; // Track date of most recent oil change

      rows.forEach((row) => {
        stats.totalCost += row.cost;
        stats.maintenanceCost += row.cost;
        if (row.kms > maxKms) {
          maxKms = row.kms;
        }
        if (row.category === 'oil_change') {
          if (maxOilKms === null || row.kms > maxOilKms) {
            maxOilKms = row.kms;
            maxOilDate = row.date;
          }
        }
        if (stats.breakdown[row.category] !== undefined) {
          stats.breakdown[row.category]++;
        }
      });

      // 3. Query fuel logs to include in total cost, maxKms, and log count
      db.all('SELECT kms, cost FROM fuel_logs WHERE car_id = ?', [carId], (fuelErr, fuelRows) => {
        if (fuelErr) {
          console.error('[API] Error calculating fuel stats:', fuelErr.message);
          return res.status(500).json({ error: 'Internal Server Error' });
        }

        stats.logsCount += fuelRows.length;

        fuelRows.forEach((row) => {
          stats.totalCost += row.cost;
          stats.fuelCost += row.cost;
          if (row.kms > maxKms) {
            maxKms = row.kms;
          }
        });

        stats.currentKms = maxKms;
        stats.lastOilChangeKms = maxOilKms;
        stats.lastOilChangeDate = maxOilDate;

        // Mileage remaining alerts
        if (maxOilKms !== null) {
          const targetOilKms = maxOilKms + oilInterval;
          stats.oilChangeDueInKms = targetOilKms - maxKms;
        }

        // Time remaining countdown (whichever comes first)
        if (maxOilDate !== null) {
          // Expiration date = maxOilDate (YYYY-MM-DD) plus oilMonths
          const targetDate = new Date(maxOilDate + 'T00:00:00');
          targetDate.setMonth(targetDate.getMonth() + oilMonths);
          
          // Today at midnight
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const diffTime = targetDate - today;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          stats.oilChangeDueInDays = diffDays;
        }

        res.json(stats);
      });
    });
  });
});

// ==========================================
// Static File Serving & Frontend Router
// ==========================================

const distDir = path.join(__dirname, '../client/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`[Server] GloveBox app backend is running on http://localhost:${port}`);
});
