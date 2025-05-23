// src/App.jsx
import React, { useState, useRef, useCallback } from 'react';
import BookingForm from './components/BookingForm';
import AvailabilitySummary from './components/AvailabilitySummary';
import AvailabilityCalendar from './components/AvailabilityCalendar';
import AdminBookingManager from './components/AdminBookingManager';
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

  // selection.startDate & selection.endDate from AvailabilityCalendar are local Date objects
  const handleDateSelectFromCalendar = useCallback((selection) => {
    setSelectedDatesForForm({
      startDate: selection.startDate, 
      endDate: selection.endDate,     
    });
  }, []);

  const toggleAdminPanel = () => { setShowAdmin(prev => !prev); };

  return (
    <div className="container app-container">
      <header className="app-header elegant-header">
        <h1 className="app-title">IIMC MDC Room Booking Portal</h1>
        <p className="app-subtitle">Efficiently manage and book rooms for various programs with real-time availability.</p>
        <button onClick={toggleAdminPanel} className="btn admin-toggle-btn stylish-toggle">
          {showAdmin ? "Hide Admin Panel" : "Access Admin Dashboard"}
        </button>
      </header>

      {showAdmin && ( <section className="admin-section card-lifted"><AdminBookingManager addToast={addToast} onBookingChanged={handleBookingChanged}/></section> )}
      <main className="main-content">
        <div className="layout-grid">
          <section className="booking-form-section card-lifted">
            <BookingForm addToast={addToast} onBookingAdded={handleBookingChanged} selectedDates={selectedDatesForForm} />
          </section>
          <aside className="summary-section card-lifted">
            <AvailabilitySummary refreshTrigger={refreshTrigger} />
          </aside>
        </div>
        <section className="calendar-section-wrapper card-lifted">
          <AvailabilityCalendar refreshTrigger={refreshTrigger} onDateSelect={handleDateSelectFromCalendar} />
        </section>
      </main>
      <div className="toast-container">{toasts.map(toast => <Toast key={toast.id.toString()} message={toast.message} type={toast.type} />)}</div>
      <footer className="app-footer"><p>&copy; {new Date().getFullYear()} IIMC MDC Room Booking System. All rights reserved.</p></footer>
    </div>
  );
}
export default App;
