// src/App.jsx
import React, { useState, useRef, useCallback } from 'react';
import BookingForm from './components/BookingForm';
import AvailabilitySummary from './components/AvailabilitySummary';
import AvailabilityCalendar from './components/AvailabilityCalendar';
import AdminBookingManager from './components/AdminBookingManager';
import BookingAnalyticsDashboard from './components/BookingAnalyticsDashboard';
import Toast from './components/Toast';
import './styles/main.css';

function App() {
  const [toasts, setToasts] = useState([]);
  const toastIdCounter = useRef(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [selectedDatesForForm, setSelectedDatesForForm] = useState({
    startDate: null, 
    endDate: null,
  });
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const addToast = (message, type) => {
    toastIdCounter.current += 1;
    const id = toastIdCounter.current;
    setToasts(prevToasts => [...prevToasts, { id, message, type }]);
    setTimeout(() => {
      setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    }, 5000);
  };

  const handleBookingChanged = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const handleDateSelectFromCalendar = useCallback((selection) => {
    setSelectedDatesForForm({
      startDate: selection.startDate, 
      endDate: selection.endDate,     
    });
  }, []);

  const toggleAdminPanel = () => {
    setShowAdmin(prev => !prev);
    if (!showAdmin && showAnalytics) setShowAnalytics(false); 
  };

  const toggleAnalyticsDashboard = () => {
    setShowAnalytics(prev => !prev);
    if (!showAnalytics && showAdmin) setShowAdmin(false); 
  };

  return (
    <div className="container app-container">
      <header className="app-header elegant-header">
        <h1 className="app-title">IIMC MDC Room Booking Portal</h1>
        <p className="app-subtitle">Efficiently manage and book rooms for various programs with real-time availability.</p>
        <div className="header-buttons-group">
            <button
            onClick={toggleAnalyticsDashboard}
            className="btn admin-toggle-btn stylish-toggle stylish-toggle-alt"
            >
            {showAnalytics ? "Hide Analytics" : "Show Analytics"}
            </button>
            <button 
            onClick={toggleAdminPanel} 
            className="btn admin-toggle-btn stylish-toggle"
            >
            {showAdmin ? "Hide Admin Panel" : "Access Admin Dashboard"}
            </button>
        </div>
      </header>

      {showAdmin && (
        <section className="admin-section card-lifted">
          <AdminBookingManager 
            addToast={addToast} 
            onBookingChanged={handleBookingChanged}
          />
        </section>
      )}

      {showAnalytics && ( 
        <section className="analytics-section card-lifted">
          <BookingAnalyticsDashboard addToast={addToast} />
        </section>
      )}
      
      {!showAdmin && !showAnalytics && (
        <main className="main-content">
            <div className="layout-grid">
                <section className="booking-form-section card-lifted">
                <BookingForm 
                    addToast={addToast} 
                    onBookingAdded={handleBookingChanged}
                    selectedDates={selectedDatesForForm} 
                />
                </section>
                
                <aside className="summary-section card-lifted">
                <AvailabilitySummary 
                    refreshTrigger={refreshTrigger}
                />
                </aside>
            </div>
            
            <section className="calendar-section-wrapper card-lifted">
                <AvailabilityCalendar 
                refreshTrigger={refreshTrigger}
                onDateSelect={handleDateSelectFromCalendar} 
                />
            </section>
        </main>
      )}
      
      <div className="toast-container">{toasts.map(toast => <Toast key={toast.id.toString()} message={toast.message} type={toast.type} />)}</div>
      <footer className="app-footer"><p>&copy; {new Date().getFullYear()} IIMC MDC Room Booking System. All rights reserved.</p></footer>
    </div>
  );
}
export default App;
