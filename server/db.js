/**
 * @fileoverview SQLite database initialization and configuration for GloveBox.
 * Establishes the database connection and defines the multi-vehicle schema.
 * Handles schema migrations (adding cars table, updating records table,
 * and creating default fallback vehicle mappings for backwards compatibility).
 * Follows Google Coding Standards and JSDoc conventions.
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Determine database file path
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite');

console.log(`[Database] Initializing SQLite database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[Database] Failed to open SQLite database:', err.message);
    process.exit(1);
  }
  console.log('[Database] Connected successfully to the SQLite database.');
});

// Configure database operation to run sequentially during setup
db.serialize(() => {
  // 1. Create the cars table if it does not exist
  db.run(`
    CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      oil_interval INTEGER DEFAULT 8000,
      oil_months INTEGER DEFAULT 6,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('[Database] Error creating "cars" table:', err.message);
    } else {
      console.log('[Database] "cars" database table verified.');
    }
  });

  // Verify and migrate the oil_interval and oil_months columns if they are missing (backwards compatibility)
  db.all('PRAGMA table_info(cars)', [], (err, rows) => {
    if (err) {
      console.error('[Database] Error checking "cars" columns:', err.message);
      return;
    }
    
    // Check and add oil_interval if missing
    const hasOilInterval = rows.some((col) => col.name === 'oil_interval');
    if (!hasOilInterval) {
      console.log('[Database] Migrating database: adding "oil_interval" column to "cars" table...');
      db.run('ALTER TABLE cars ADD COLUMN oil_interval INTEGER DEFAULT 8000', (alterErr) => {
        if (alterErr) {
          console.error('[Database] Migration failed (adding oil_interval):', alterErr.message);
        } else {
          console.log('[Database] Migration successful: "oil_interval" column added to "cars" table.');
        }
      });
    }

    // Check and add oil_months if missing
    const hasOilMonths = rows.some((col) => col.name === 'oil_months');
    if (!hasOilMonths) {
      console.log('[Database] Migrating database: adding "oil_months" column to "cars" table...');
      db.run('ALTER TABLE cars ADD COLUMN oil_months INTEGER DEFAULT 6', (alterErr) => {
        if (alterErr) {
          console.error('[Database] Migration failed (adding oil_months):', alterErr.message);
        } else {
          console.log('[Database] Migration successful: "oil_months" column added to "cars" table.');
        }
      });
    }
  });

  // 2. Create the records table with baseline schema (if not already existing)
  db.run(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      kms INTEGER NOT NULL,
      date TEXT NOT NULL,
      cost REAL DEFAULT 0.0,
      notes TEXT,
      receipt_image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('[Database] Error verifying/creating "records" table:', err.message);
    } else {
      console.log('[Database] "records" database table verified.');
    }
  });

  // 2.5 Create the fuel_logs table if it does not exist
  db.run(`
    CREATE TABLE IF NOT EXISTS fuel_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      kms INTEGER NOT NULL,
      liters REAL NOT NULL,
      price_per_liter REAL NOT NULL,
      cost REAL NOT NULL,
      full_tank INTEGER DEFAULT 1,
      receipt_image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('[Database] Error verifying/creating "fuel_logs" table:', err.message);
    } else {
      console.log('[Database] "fuel_logs" database table verified.');
    }
  });

  // Verify and migrate the receipt_image column in fuel_logs if it is missing (backwards compatibility)
  db.all('PRAGMA table_info(fuel_logs)', [], (err, rows) => {
    if (err) {
      console.error('[Database] Error checking "fuel_logs" columns:', err.message);
      return;
    }
    
    const hasReceiptImage = rows.some((col) => col.name === 'receipt_image');
    if (!hasReceiptImage) {
      console.log('[Database] Migrating database: adding "receipt_image" column to "fuel_logs" table...');
      db.run('ALTER TABLE fuel_logs ADD COLUMN receipt_image TEXT', (alterErr) => {
        if (alterErr) {
          console.error('[Database] Migration failed (adding receipt_image to fuel_logs):', alterErr.message);
        } else {
          console.log('[Database] Migration successful: "receipt_image" column added to "fuel_logs" table.');
        }
      });
    }
  });

  // 3. Perform migration: Check if "car_id" exists in the "records" table
  db.all('PRAGMA table_info(records)', [], (err, rows) => {
    if (err) {
      console.error('[Database] Error checking "records" columns:', err.message);
      return;
    }

    const hasCarId = rows.some((col) => col.name === 'car_id');

    if (!hasCarId) {
      console.log('[Database] Migrating database: adding "car_id" column to "records" table...');
      db.run('ALTER TABLE records ADD COLUMN car_id INTEGER REFERENCES cars(id) ON DELETE CASCADE', (alterErr) => {
        if (alterErr) {
          console.error('[Database] Migration failed (adding car_id):', alterErr.message);
        } else {
          console.log('[Database] Migration successful: "car_id" column added to "records" table.');
          seedDefaultVehicleMapping();
        }
      });
    } else {
      // Columns are set, but ensure we have at least one car and maps are correct
      seedDefaultVehicleMapping();
    }
  });
});

/**
 * Seeds a default vehicle if none exist in the database,
 * and maps all orphaned records (where car_id is null) to this default car.
 * Guarantees zero data loss during migrations of historical user records.
 */
function seedDefaultVehicleMapping() {
  db.get('SELECT COUNT(*) AS count FROM cars', [], (err, row) => {
    if (err) {
      console.error('[Database] Error reading cars count:', err.message);
      return;
    }

    const carCount = row ? row.count : 0;

    if (carCount === 0) {
      console.log('[Database] No vehicles found. Seeding a default vehicle...');
      db.run("INSERT INTO cars (make, model, year) VALUES ('My', 'Vehicle', 2020)", function(insertErr) {
        if (insertErr) {
          console.error('[Database] Error seeding default vehicle:', insertErr.message);
          return;
        }

        const defaultCarId = this.lastID;
        console.log(`[Database] Default vehicle seeded successfully with ID: ${defaultCarId}`);
        
        // Associate any existing records with the seeded default vehicle
        db.run('UPDATE records SET car_id = ? WHERE car_id IS NULL', [defaultCarId], function(updateErr) {
          if (updateErr) {
            console.error('[Database] Failed to associate orphaned records:', updateErr.message);
          } else if (this.changes > 0) {
            console.log(`[Database] Migrated ${this.changes} orphaned service logs to default vehicle ID: ${defaultCarId}`);
          }
        });
      });
    } else {
      // We have vehicles, but let's map any orphaned record to the first available vehicle
      db.get('SELECT id FROM cars ORDER BY id ASC LIMIT 1', [], (selectErr, firstCar) => {
        if (selectErr || !firstCar) return;

        const firstCarId = firstCar.id;
        db.run('UPDATE records SET car_id = ? WHERE car_id IS NULL', [firstCarId], function(updateErr) {
          if (updateErr) {
            console.error('[Database] Failed to clean orphaned records:', updateErr.message);
          } else if (this.changes > 0) {
            console.log(`[Database] Cleaned and mapped ${this.changes} orphaned service logs to vehicle ID: ${firstCarId}`);
          }
        });
      });
    }
  });
}

module.exports = db;
