// src/App.jsx
import React, { useState, useRef } from 'react'; // Import useRef
import BookingForm from './components/BookingForm';
import AvailabilitySummary from './components/AvailabilitySummary';
import AvailabilityCalendar from './components/AvailabilityCalendar';
import AdminBookingManager from './components/AdminBookingManager';
import Toast from './components/Toast';
import './styles/main.css'; // Your main CSS file

function App() {
  const [toasts, setToasts] = useState([]);
  const toastIdCounter = useRef(0); // Initialize a ref to keep track of unique IDs for toasts
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const today = new Date();
  const initialStartDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const initialEndDate = new Date(today.getFullYear(), today.getMonth(), today.getDate()); 
  
  const [selectedDatesForForm, setSelectedDatesForForm] = useState({ 
    startDate: initialStartDate, 
    endDate: initialEndDate 
  });
  const [showAdmin, setShowAdmin] = useState(false);

  const addToast = (message, type) => {
    toastIdCounter.current += 1; // Increment the counter
    const id = toastIdCounter.current; // Use the new counter value as the unique ID
    
    setToasts(prevToasts => [...prevToasts, { id, message, type }]);
    
    // Auto remove toast after 5 seconds
    setTimeout(() => {
      setToasts(prevToasts => {
        // Ensure we filter correctly
        return prevToasts.filter(toast => toast.id !== id);
      });
    }, 5000);
  };

  // This function is called when a booking is successfully made or changed by admin
  const handleBookingChanged = () => {
    setRefreshTrigger(prev => prev + 1); // Increment to trigger useEffect in child components
  };
  
  // This function is called when a date/range is selected on the AvailabilityCalendar
  const handleDateSelectFromCalendar = (dates) => {
    const newStartDate = new Date(dates.startDate.getFullYear(), dates.startDate.getMonth(), dates.startDate.getDate());
    let newEndDate = new Date(dates.endDate.getFullYear(), dates.endDate.getMonth(), dates.endDate.getDate());

    // Adjust for single day click if react-big-calendar behaves that way for your setup
    if (dates.action === 'click' && dates.slots && dates.slots.length === 1 && newStartDate.getTime() === newEndDate.getTime()) {
      // It's a single day click, ensure start and end are the same day for the form
      // No change needed if start and end are already the same
    } else if (newEndDate < newStartDate) { // Defensive check
        newEndDate = new Date(newStartDate);
    }
    // If it's a drag selection where end is exclusive (e.g., react-big-calendar default for all-day slots)
    // and you want inclusive end date for your state.
    if (dates.action === 'select' && dates.startDate.toDateString() !== dates.endDate.toDateString() && dates.slots.length > 1) {
        // If the original end date from calendar was exclusive for multi-day selection, adjust it.
        // This depends on how react-big-calendar provides `end` on drag.
        // If it's already inclusive for your setup, this adjustment might not be needed.
        // Assuming here `dates.endDate` might be the start of the day *after* the selection.
        const tempEndDate = new Date(dates.endDate);
        tempEndDate.setDate(tempEndDate.getDate() -1); // Make it inclusive if it was exclusive
        if (tempEndDate >= newStartDate) { // only adjust if it's still valid
            newEndDate = tempEndDate;
        }
    }

    setSelectedDatesForForm({ // Update state that BookingForm uses
        startDate: newStartDate,
        endDate: newEndDate
    });
  };
  
  const toggleAdminPanel = () => {
    setShowAdmin(prev => !prev);
  };

  return (
    <div className="container">
      <header className="app-header">
        <h1 className="app-title">IIMC MDC Room Booking System</h1>
        <p className="app-subtitle">Book rooms for your programs with real-time availability checking</p>
        <button 
          onClick={toggleAdminPanel} 
          className="admin-toggle-btn"
        >
          {showAdmin ? "Hide Admin Panel" : "Show Admin Panel"}
        </button>
      </header>
      
      {showAdmin && (
        <div className="admin-section">
          <AdminBookingManager 
            addToast={addToast} 
            onBookingChanged={handleBookingChanged}
          />
        </div>
      )}
      
      <div className="grid grid-main">
        <div>
          <BookingForm 
            addToast={addToast} 
            onBookingAdded={handleBookingChanged}
            selectedDates={selectedDatesForForm} 
          />
        </div>
        
        <div>
          <AvailabilitySummary 
            refreshTrigger={refreshTrigger}
            // selectedDates prop was removed as Summary now handles its own date picking
          />
        </div>
      </div>
      
      <div className="calendar-section">
        <AvailabilityCalendar 
          refreshTrigger={refreshTrigger}
          onDateSelect={handleDateSelectFromCalendar} 
        />
      </div>
      
      <div className="toast-container">
        {/* Make sure key is a string if it's a number from counter, though numbers work fine */}
        {toasts.map(toast => (
          <Toast 
            key={toast.id.toString()} 
            message={toast.message} 
            type={toast.type} 
          />
        ))}
      </div>
    </div>
  );
}

export default App;