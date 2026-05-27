/**
 * @fileoverview Main Application Controller for GloveBox.
 * Synchronizes global state (registered cars list, active car, maintenance records,
 * and aggregate statistics) with the Express API server.
 * Manages header vehicle-switching dropdown controls, modal overlays,
 * and page view routes.
 * Follows Google Coding Standards and React best practices.
 */

import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import RecordForm from './components/RecordForm';
import RecordList from './components/RecordList';
import CarFormModal from './components/CarFormModal';
import CarDeleteModal from './components/CarDeleteModal';

/**
 * Main application component.
 * @return {!React.ReactElement}
 */
export default function App() {
  const [view, setView] = useState('dashboard'); // Routes: 'dashboard', 'logs', 'add', 'edit'
  const [records, setRecords] = useState([]);
  const [editRecordTarget, setEditRecordTarget] = useState(null);
  
  // Vehicles and Active Selector States
  const [cars, setCars] = useState([]);
  const [activeCarId, setActiveCarId] = useState(null);
  const [showCarDropdown, setShowCarDropdown] = useState(false);
  const [showCarModal, setShowCarModal] = useState(false);
  const [carToEdit, setCarToEdit] = useState(null);
  const [carToDelete, setCarToDelete] = useState(null);
  const [carToDeleteRecordsCount, setCarToDeleteRecordsCount] = useState(0);

  // Aggregate stats defaults
  const [stats, setStats] = useState({
    currentKms: 0,
    totalCost: 0,
    logsCount: 0,
    lastOilChangeKms: null,
    lastOilChangeDate: null,
    oilChangeDueInKms: null,
    oilChangeDueInDays: null,
    oilInterval: 8000,
    oilMonths: 6,
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
  });

  const [isLoading, setIsLoading] = useState(true);

  // Navigation layout preference state (remembers bottom vs top preference in local storage)
  const [navPosition, setNavPosition] = useState(() => {
    const saved = localStorage.getItem('glovebox_nav_position');
    if (saved) return saved;
    // Defaults to bottom navigation on phone viewports for optimal mobile clearance
    return window.innerWidth <= 768 ? 'bottom' : 'top';
  });

  useEffect(() => {
    localStorage.setItem('glovebox_nav_position', navPosition);
  }, [navPosition]);

  // 1. Initial Load: Fetch registered vehicles and determine active selection
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoading(true);
        const fetchedCars = await fetchCars();
        
        if (fetchedCars && fetchedCars.length > 0) {
          // Check for a saved active car in localStorage
          const savedCarId = localStorage.getItem('glovebox_active_car_id');
          let initialCarId = fetchedCars[0].id;
          
          if (savedCarId) {
            const parsedSavedId = parseInt(savedCarId, 10);
            if (fetchedCars.some((car) => car.id === parsedSavedId)) {
              initialCarId = parsedSavedId;
            }
          }
          
          setActiveCarId(initialCarId);
          localStorage.setItem('glovebox_active_car_id', initialCarId);
        } else {
          // If for some reason cars are empty (e.g. database reset), prompt onboarding modal
          setShowCarModal(true);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[App] Failed to load initial app data:', err);
        setIsLoading(false);
      }
    };
    loadInitialData();
  }, []);

  // 2. Reactive Data Syncer: Re-fetch records/stats whenever active vehicle switches
  useEffect(() => {
    if (activeCarId === null) return;

    const loadCarData = async () => {
      try {
        setIsLoading(true);
        await Promise.all([fetchRecords(activeCarId), fetchStats(activeCarId)]);
      } catch (err) {
        console.error('[App] Error loading active car data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadCarData();
  }, [activeCarId]);

  /**
   * Fetches all registered vehicles.
   * @return {Promise<!Array<!Object>>} Resolved array of cars.
   */
  const fetchCars = async () => {
    try {
      const res = await fetch('/api/cars');
      if (!res.ok) {
        throw new Error(`Failed to fetch vehicles: ${res.statusText}`);
      }
      const data = await res.json();
      setCars(data);
      return data;
    } catch (err) {
      console.error('[API] Error loading cars:', err);
      return [];
    }
  };

  /**
   * Fetches all records from database, ordered by mileage desc, scoped by vehicle.
   * @param {number} carId The active vehicle ID.
   */
  const fetchRecords = async (carId) => {
    try {
      const res = await fetch(`/api/records?carId=${carId}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch records: ${res.statusText}`);
      }
      const data = await res.json();
      setRecords(data);
    } catch (err) {
      console.error('[API] Error loading records:', err);
    }
  };

  /**
   * Fetches aggregated statistics scoped by vehicle.
   * @param {number} carId The active vehicle ID.
   */
  const fetchStats = async (carId) => {
    try {
      const res = await fetch(`/api/stats?carId=${carId}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch stats: ${res.statusText}`);
      }
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('[API] Error loading stats:', err);
    }
  };

  /**
   * Callback triggered when a new vehicle is saved or an existing vehicle is updated.
   * @param {!Object} updatedCar Saved/updated car details from Express server.
   */
  const handleCarSave = async (updatedCar) => {
    await fetchCars();
    if (activeCarId === updatedCar.id) {
      // Re-trigger stats and records fetch to reflect custom interval changes immediately
      setIsLoading(true);
      await Promise.all([fetchRecords(activeCarId), fetchStats(activeCarId)]);
      setIsLoading(false);
    } else {
      // If a new car was created, set it as active
      setActiveCarId(updatedCar.id);
      localStorage.setItem('glovebox_active_car_id', updatedCar.id);
    }
    setCarToEdit(null);
    setView('dashboard');
  };

  /**
   * Initiates the multi-step vehicle deletion flow by querying stats and opening warnings.
   * @param {!Object} car The vehicle target to delete.
   * @param {!React.MouseEvent} e Click event from list element.
   */
  const initiateCarDeleteFlow = async (car, e) => {
    e.stopPropagation(); // Prevent toggling selections
    try {
      // Query exact count of records for this car
      const res = await fetch(`/api/records?carId=${car.id}`);
      if (!res.ok) throw new Error('Failed to fetch record metrics.');
      const data = await res.json();
      
      setCarToDelete(car);
      setCarToDeleteRecordsCount(data.length);
    } catch (err) {
      console.error('[App] Failed to fetch deletion statistics:', err);
      // Fallback if network drops
      setCarToDelete(car);
      setCarToDeleteRecordsCount(0);
    }
  };

  /**
   * Deletes a vehicle permanently, cascades deletions on all SQLite logs,
   * unlinks receipt scans from local storage, and resets dropdown targets.
   */
  const executeCarDeletion = async () => {
    if (!carToDelete) return;
    const targetId = carToDelete.id;

    try {
      setIsLoading(true);
      const res = await fetch(`/api/cars/${targetId}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('Failed to delete vehicle.');
      }

      console.log(`[App] Cascade deleted vehicle ID: ${targetId}`);
      const updatedCars = await fetchCars();
      
      if (updatedCars.length > 0) {
        // Fallback active car to first index if active car was deleted
        if (activeCarId === targetId) {
          const nextCarId = updatedCars[0].id;
          setActiveCarId(nextCarId);
          localStorage.setItem('glovebox_active_car_id', nextCarId);
        } else {
          // Otherwise, just re-fetch currently active car data
          await Promise.all([fetchRecords(activeCarId), fetchStats(activeCarId)]);
        }
      } else {
        // Clear all states if no cars are left
        setActiveCarId(null);
        setRecords([]);
        setStats({
          currentKms: 0,
          totalCost: 0,
          logsCount: 0,
          lastOilChangeKms: null,
          lastOilChangeDate: null,
          oilChangeDueInKms: null,
          oilChangeDueInDays: null,
          oilInterval: 8000,
          oilMonths: 6,
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
        });
        setShowCarModal(true); // Open onboarding modal
      }
    } catch (err) {
      console.error('[App] Deletion of car failed:', err);
      alert(`Error deleting vehicle: ${err.message}`);
    } finally {
      setCarToDelete(null);
      setIsLoading(false);
    }
  };

  /**
   * Submits new or edited log entries to the server.
   * Handles multipart FormData or standard JSON payloads based on action.
   * @param {!FormData} formData Content payload.
   */
  const handleRecordSubmit = async (formData) => {
    try {
      if (editRecordTarget) {
        const id = editRecordTarget.id;
        const jsonBody = {};
        formData.forEach((value, key) => {
          if (key !== 'receipt') {
            jsonBody[key] = value;
          }
        });

        const res = await fetch(`/api/records/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(jsonBody)
        });

        if (!res.ok) {
          throw new Error('Failed to update service record.');
        }

        console.log(`[App] Updated record ID: ${id}`);
      } else {
        const res = await fetch('/api/records', {
          method: 'POST',
          body: formData
        });

        if (!res.ok) {
          throw new Error('Failed to save service record.');
        }

        const newRecord = await res.json();
        console.log(`[App] Logged new record ID: ${newRecord.id}`);
      }

      setEditRecordTarget(null);
      await Promise.all([fetchRecords(activeCarId), fetchStats(activeCarId)]);
      setView('logs');
    } catch (err) {
      console.error('[App] Form submit failure:', err);
      alert(`Error saving log: ${err.message}`);
    }
  };

  /**
   * Deletes a maintenance record and physical receipt image.
   * @param {number} id Record unique identifier.
   */
  const handleRecordDelete = async (id) => {
    try {
      const res = await fetch(`/api/records/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        throw new Error('Failed to delete service record.');
      }

      console.log(`[App] Deleted record ID: ${id}`);
      await Promise.all([fetchRecords(activeCarId), fetchStats(activeCarId)]);
    } catch (err) {
      console.error('[App] Deletion failure:', err);
      alert(`Error deleting record: ${err.message}`);
    }
  };

  /**
   * Triggers the editing flow of a record by pre-loading fields.
   * @param {!Object} record Content target to modify.
   */
  const triggerEditView = (record) => {
    setEditRecordTarget(record);
    setView('edit');
  };

  // Close dropdown overlay when clicking elsewhere
  useEffect(() => {
    if (!showCarDropdown) return;
    const closeDropdown = () => setShowCarDropdown(false);
    window.addEventListener('click', closeDropdown);
    return () => window.removeEventListener('click', closeDropdown);
  }, [showCarDropdown]);

  // Extract recent 3 activities for dashboard timeline display
  const recentRecords = [...records].slice(0, 3);
  const activeCar = cars.find((c) => c.id === activeCarId);

  return (
    <div className={`app-container ${navPosition === 'bottom' ? 'nav-bottom-layout' : ''}`}>
      {/* 1. Header Navigation Bar */}
      <header className="app-header header-glass">
        <div className="header-inner">
          <div className="logo-section">
            <div className="logo-title-row">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="url(#logo-grad)" strokeWidth="2.5" className="logo-svg">
                <defs>
                  <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00f2fe" />
                    <stop offset="100%" stopColor="#4facfe" />
                  </linearGradient>
                </defs>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
              <h1>GloveBox</h1>
            </div>

            {/* Custom Interactive Car Dropdown Switcher */}
            {activeCar && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
                <div className="car-switcher-wrapper">
                  <button
                    type="button"
                    className="car-switcher-btn"
                    onClick={() => setShowCarDropdown(!showCarDropdown)}
                    title="Switch Vehicle"
                  >
                    <span className="car-btn-text">🚗 {activeCar.year} {activeCar.make} {activeCar.model}</span>
                    <svg
                      width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="3"
                      style={{
                        transform: showCarDropdown ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.25s ease',
                        marginLeft: '6px'
                      }}
                    >
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>

                  {showCarDropdown && (
                    <div className="car-dropdown-list card-glass fade-in">
                      <div className="car-dropdown-scrollable">
                        {cars.map((car) => (
                          <div
                            key={car.id}
                            className={`car-dropdown-item ${car.id === activeCarId ? 'active' : ''}`}
                            onClick={() => {
                              setActiveCarId(car.id);
                              localStorage.setItem('glovebox_active_car_id', car.id);
                              setShowCarDropdown(false);
                            }}
                          >
                            <span className="car-name-text">{car.year} {car.make} {car.model}</span>
                            <div className="car-item-actions" style={{ display: 'flex', gap: '6px' }}>
                              <button
                                type="button"
                                className="car-item-edit-btn"
                                onClick={(e) => {
                                  e.stopPropagation(); // Avoid switching active car
                                  setCarToEdit(car);
                                  setShowCarModal(true);
                                }}
                                title="Edit Vehicle Specs"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M12 20h9"></path>
                                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                </svg>
                              </button>
                              {cars.length > 1 && (
                                <button
                                  type="button"
                                  className="car-item-delete-btn"
                                  onClick={(e) => initiateCarDeleteFlow(car, e)}
                                  title="Delete Vehicle"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="car-dropdown-divider" />
                      <button
                        type="button"
                        className="car-dropdown-add-btn"
                        onClick={() => {
                          setShowCarDropdown(false);
                          setShowCarModal(true);
                        }}
                      >
                        ➕ Add New Vehicle
                      </button>
                    </div>
                  )}
                </div>

                {/* Quick Toggle to Switch Navigation Bar between Top and Bottom (Mobile Clearances) */}
                <button
                  type="button"
                  className="btn-icon header-nav-toggle"
                  onClick={() => setNavPosition(navPosition === 'top' ? 'bottom' : 'top')}
                  title={navPosition === 'top' ? 'Move Navigation Menu to Bottom' : 'Move Navigation Menu to Top'}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)',
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: 'var(--shadow-button)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--neon-teal)';
                    e.currentTarget.style.borderColor = 'rgba(0, 242, 254, 0.3)';
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 242, 254, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.borderColor = 'var(--border-glass)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {navPosition === 'top' ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <polyline points="19 12 12 19 5 12"></polyline>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="19" x2="12" y2="5"></line>
                      <polyline points="5 12 12 5 19 12"></polyline>
                    </svg>
                  )}
                </button>
              </div>
            )}
          </div>

          <nav className="nav-tabs">
            <button
              type="button"
              className={`nav-tab ${view === 'dashboard' ? 'active' : ''}`}
              onClick={() => {
                setEditRecordTarget(null);
                setView('dashboard');
              }}
              disabled={activeCarId === null}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={`nav-tab ${view === 'logs' ? 'active' : ''}`}
              onClick={() => {
                setEditRecordTarget(null);
                setView('logs');
              }}
              disabled={activeCarId === null}
            >
              Logs
            </button>
            <button
              type="button"
              className={`nav-tab nav-tab-primary ${view === 'add' ? 'active' : ''}`}
              onClick={() => {
                setEditRecordTarget(null);
                setView('add');
              }}
              disabled={activeCarId === null}
            >
              Log Entry
            </button>
          </nav>
        </div>
      </header>

      {/* 2. Main Content viewport */}
      <main className="app-main">
        {isLoading ? (
          <div className="spinner-container full-height">
            <div className="spinner"></div>
            <p>Syncing vehicle database...</p>
          </div>
        ) : (
          <>
            {view === 'dashboard' && activeCarId !== null && (
              <Dashboard
                stats={stats}
                recentRecords={recentRecords}
                records={records}
                activeCar={activeCar}
                setView={setView}
                onEditCar={() => {
                  setCarToEdit(activeCar);
                  setShowCarModal(true);
                }}
              />
            )}
            
            {view === 'logs' && activeCarId !== null && (
              <RecordList
                records={records}
                onDelete={handleRecordDelete}
                onEdit={triggerEditView}
              />
            )}

            {(view === 'add' || view === 'edit') && activeCarId !== null && (
              <RecordForm
                editRecord={editRecordTarget}
                activeCarId={activeCarId}
                onSubmit={handleRecordSubmit}
                onCancel={() => {
                  setEditRecordTarget(null);
                  setView(view === 'edit' ? 'logs' : 'dashboard');
                }}
              />
            )}
            
            {activeCarId === null && !showCarModal && (
              <div className="empty-state card-glass p-8 text-center" style={{ marginTop: '4rem' }}>
                <h3>🚗 Welcome to GloveBox</h3>
                <p className="text-secondary mt-2">Get started by registering your first vehicle to begin logging maintenance!</p>
                <button
                  type="button"
                  className="btn btn-primary btn-glow mt-4"
                  onClick={() => setShowCarModal(true)}
                >
                  Register First Vehicle
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* 3. Global Car Creation Modal Overlay */}
      {showCarModal && (
        <CarFormModal
          editCar={carToEdit}
          onSave={handleCarSave}
          onClose={() => {
            setCarToEdit(null);
            if (cars.length > 0) {
              setShowCarModal(false);
            } else {
              alert('Please register at least one vehicle to use GloveBox.');
            }
          }}
        />
      )}

      {/* 4. Custom Destructive Deletion Warning Modal Overlay */}
      {carToDelete && (
        <CarDeleteModal
          car={carToDelete}
          recordsCount={carToDeleteRecordsCount}
          onConfirm={executeCarDeletion}
          onClose={() => setCarToDelete(null)}
        />
      )}

      {/* 5. Global Decorative background blur blobs */}
      <div className="blur-blob blur-blob-1"></div>
      <div className="blur-blob blur-blob-2"></div>
    </div>
  );
}
