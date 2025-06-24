// src/App.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Login from './components/Login';
import ResetPassword from './components/ResetPassword';
import BookingForm from './components/BookingForm';
import AvailabilitySummary from './components/AvailabilitySummary';
import AvailabilityCalendar from './components/AvailabilityCalendar';
import AdminBookingManager from './components/AdminBookingManager';
import BookingAnalyticsDashboard from './components/BookingAnalyticsDashboard';
import Toast from './components/Toast';
import './styles/main.css';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [toasts, setToasts] = useState([]);
  const toastIdCounter = useRef(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [selectedDatesForForm, setSelectedDatesForForm] = useState({ startDate: null, endDate: null });
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const navigate = useNavigate();

  const ADMIN_EMAILS = ['arjun.avittathur@gmail.com', 'admin_mdp@iimcal.ac.in'];

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace('/'); // Hard reload to login page
    } catch (error) {
      console.error('Error logging out:', error.message);
    }
  };
  
  const addToast = (message, type) => {
    toastIdCounter.current += 1;
    const id = toastIdCounter.current;
    setToasts(prevToasts => [...prevToasts, { id, message, type }]);
    setTimeout(() => {
      setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
    }, 5000);
  };
  const handleBookingChanged = useCallback(() => { setRefreshTrigger(prev => prev + 1); }, []);
  const handleDateSelectFromCalendar = useCallback((selection) => { setSelectedDatesForForm({ startDate: selection.startDate, endDate: selection.endDate }); }, []);
  const toggleAdminPanel = () => { setShowAdmin(prev => !prev); if (!showAdmin && showAnalytics) setShowAnalytics(false); };
  const toggleAnalyticsDashboard = () => { setShowAnalytics(prev => !prev); if (!showAnalytics && showAdmin) setShowAdmin(false); };

  if (loading) {
      return <div style={{height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center'}}><div className="spinner-large"></div></div>;
  }

  return (
    <Routes>
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={
        !session ? (
          <Login />
        ) : !ADMIN_EMAILS.includes(session.user.email) ? (
          <div className="access-denied" style={{textAlign: 'center', padding: '50px', fontFamily: 'sans-serif'}}>
            <h2>Access Restricted</h2>
            <p>Only authorized administrators may access this system.</p>
            <button onClick={handleLogout} className="btn stylish-toggle">Logout</button>
          </div>
        ) : (
          <div className="container app-container">
            <header className="app-header elegant-header">
              <h1 className="app-title">IIMC MDC Room Booking Portal</h1>
              <p className="app-subtitle">Efficiently manage and book rooms for various programs with real-time availability.</p>
              <div className="header-buttons-group">
                <button onClick={toggleAnalyticsDashboard} className="btn admin-toggle-btn stylish-toggle stylish-toggle-alt">
                  {showAnalytics ? "Hide Analytics" : "Show Analytics"}
                </button>
                <button onClick={toggleAdminPanel} className="btn admin-toggle-btn stylish-toggle">
                  {showAdmin ? "Hide Admin Panel" : "Access Admin Dashboard"}
                </button>
                <button onClick={handleLogout} className="btn admin-toggle-btn stylish-toggle">
                  Logout
                </button>
              </div>
            </header>

            {showAdmin && (
              <section className="admin-section card-lifted">
                <AdminBookingManager addToast={addToast} onBookingChanged={handleBookingChanged} />
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
            )}
            
            <div className="toast-container">{toasts.map(toast => <Toast key={toast.id.toString()} message={toast.message} type={toast.type} />)}</div>
            <footer className="app-footer"><p>&copy; {new Date().getFullYear()} IIMC MDC Room Booking System. All rights reserved.</p></footer>
          </div>
        )
      } />
    </Routes>
  );
}

export default App;
