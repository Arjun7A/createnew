// src/components/AdminBookingManager.jsx
import React, { useState, useEffect } from 'react';
import { 
  getConsolidatedBookingsForDisplay, 
  deleteBooking, 
  updateBooking, 
  checkRoomAvailabilityForUpdate 
} from '../services/availabilityService';
import { DateRangePicker } from 'react-date-range';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { TOTAL_ROOMS, PROGRAM_TYPES } from '../constants'; // Import constants

const AdminBookingManager = ({ addToast, onBookingChanged }) => {
  const [bookings, setBookings] = useState([]);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const [editForm, setEditForm] = useState({
    programTitle: '',
    programType: '',
    otherProgramTypeDescription: '', // Added for OTHERS
    numberOfRooms: 1,
    bookingStatus: 'pencil',
    checkInTime: '14:00',
    checkOutTime: '11:00',
  });
  
  const [dateRange, setDateRange] = useState({
    startDate: new Date(),
    endDate: new Date(),
    key: 'selection',
  });
  
  // Using PROGRAM_TYPES from constants.js
  // const programTypes = PROGRAM_TYPES; // Already imported

  const timeOptions = generateTimeOptions();
  
  useEffect(() => {
    fetchBookings();
  }, [onBookingChanged]); 
  
  function generateTimeOptions() {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute of ['00', '30']) {
        options.push(`${String(hour).padStart(2, '0')}:${minute}`);
      }
    }
    return options;
  }
  
  const fetchBookings = () => {
    try {
      const consolidatedBookings = getConsolidatedBookingsForDisplay();
      setBookings(consolidatedBookings);
    } catch (error) {
      console.error('Error fetching consolidated bookings:', error);
      addToast('Error loading bookings', 'error');
    }
  };
  
  const handleDeleteBooking = async (bookingId, bookingStatus) => {
    if (!window.confirm(`Are you sure you want to delete this ${bookingStatus.toLowerCase()} booking?`)) {
      return;
    }
    setLoading(true);
    try {
      await deleteBooking(bookingId, bookingStatus); 
      addToast('Booking deleted successfully', 'success');
      fetchBookings(); 
      if (onBookingChanged) onBookingChanged();
    } catch (error) {
      console.error('Error deleting booking:', error);
      addToast(`Error deleting booking: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleEditClick = (booking) => { 
    const startDate = new Date(booking.startDate);
    const endDate = new Date(booking.endDate);
    
    setSelectedBooking(booking); 
    setEditForm({
      programTitle: booking.programTitle,
      programType: booking.programType,
      otherProgramTypeDescription: booking.otherProgramTypeDescription || '', // Handle if undefined
      numberOfRooms: booking.numberOfRooms,
      bookingStatus: booking.bookingStatus, 
      checkInTime: `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`,
      checkOutTime: `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`,
    });
    setDateRange({
      startDate: new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()),
      endDate: new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()),
      key: 'selection',
    });
    setIsEditing(true);
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => {
        const newState = { ...prev, [name]: name === 'numberOfRooms' ? parseInt(value) : value };
        if (name === 'programType' && value !== 'OTHERS') {
            newState.otherProgramTypeDescription = '';
        }
        return newState;
    });
  };
  
  const handleDateRangeChange = (ranges) => { setDateRange(ranges.selection); };
  const handleCancelEdit = () => { setIsEditing(false); setSelectedBooking(null); };
  
  const validateForm = () => {
    if (!editForm.programTitle.trim()) { addToast('Program title is required', 'error'); return false; }
    if (!editForm.programType) { addToast('Please select a program type', 'error'); return false; }
    if (editForm.programType === 'OTHERS' && !editForm.otherProgramTypeDescription.trim()) {
        addToast('Please enter a description for "OTHERS" program type.', 'error'); return false;
    }
    if (editForm.numberOfRooms < 1) { addToast('Number of rooms must be at least 1', 'error'); return false; }
    if (editForm.numberOfRooms > TOTAL_ROOMS) { addToast(`Number of rooms cannot exceed ${TOTAL_ROOMS}`, 'error'); return false; } 
    const checkInDateTime = combineDateAndTime(dateRange.startDate, editForm.checkInTime);
    const checkOutDateTime = combineDateAndTime(dateRange.endDate, editForm.checkOutTime);
    if (checkInDateTime >= checkOutDateTime) { addToast('Check-out date/time must be after check-in date/time', 'error'); return false;}
    return true;
  };
  
  const combineDateAndTime = (date, timeString) => {
    const result = new Date(date);
    const [hours, minutes] = timeString.split(':').map(Number);
    result.setHours(hours, minutes, 0, 0);
    return result;
  };
  
  const handleSaveEdit = async () => {
    if (!selectedBooking || !validateForm()) return;
    
    setLoading(true);
    try {
      const checkInDateTime = combineDateAndTime(dateRange.startDate, editForm.checkInTime);
      const checkOutDateTime = combineDateAndTime(dateRange.endDate, editForm.checkOutTime);
      
      const availabilityResult = checkRoomAvailabilityForUpdate(
        checkInDateTime,
        checkOutDateTime,
        editForm.numberOfRooms,
        selectedBooking.id, 
        selectedBooking.bookingStatus 
      );
      
      if (!availabilityResult.available) {
        addToast(`Only ${availabilityResult.availableRooms} rooms available for the selected dates and times`, 'error');
        setLoading(false);
        return;
      }
      
      const bookingPayloadForUpdate = {
          programTitle: editForm.programTitle,
          programType: editForm.programType,
          ...(editForm.programType === 'OTHERS' && { otherProgramTypeDescription: editForm.otherProgramTypeDescription }),
          numberOfRooms: editForm.numberOfRooms,
          bookingStatus: editForm.bookingStatus, // The new status from the form
          startDate: checkInDateTime,
          endDate: checkOutDateTime,
      };

      await updateBooking(selectedBooking.id, selectedBooking.bookingStatus, bookingPayloadForUpdate);
      
      addToast('Booking updated successfully', 'success');
      fetchBookings();
      setIsEditing(false);
      setSelectedBooking(null);
      if (onBookingChanged) onBookingChanged();
    } catch (error) {
      console.error('Error updating booking:', error);
      addToast(`Error updating booking: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const formatDateTime = (dateTime) => {
    const date = new Date(dateTime);
    return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  };
  
  // Helper to display program type, including description for OTHERS
  const getDisplayProgramType = (booking) => {
    if (booking.programType === 'OTHERS' && booking.otherProgramTypeDescription) {
      return `OTHERS (${booking.otherProgramTypeDescription})`;
    }
    // Find label from PROGRAM_TYPES if available
    const typeObj = PROGRAM_TYPES.find(pt => pt.value === booking.programType);
    return typeObj ? typeObj.label : booking.programType;
  };

  return (
    <div className="card admin-card">
      <h2 className="summary-title">Admin Booking Manager - All Bookings</h2>
      {isEditing && selectedBooking ? (
        <div className="edit-booking-form">
          <h3 className="edit-title">Edit Booking: {selectedBooking.programTitle} ({selectedBooking.bookingStatus})</h3>
          <div className="two-column">
            <div>
              <div className="form-group">
                <label className="form-label">Program Title</label>
                <input type="text" name="programTitle" value={editForm.programTitle} onChange={handleInputChange} className="form-input"/>
              </div>
              <div className="form-group">
                <label className="form-label">Program Type</label>
                <select name="programType" value={editForm.programType} onChange={handleInputChange} className="form-select">
                  <option value="">Select Program Type</option>
                  {PROGRAM_TYPES.map((typeOpt) => <option key={typeOpt.value} value={typeOpt.value}>{typeOpt.label}</option>)}
                </select>
              </div>
              {editForm.programType === 'OTHERS' && (
                <div className="form-group">
                  <label className="form-label">Specify Other Program Type</label>
                  <input type="text" name="otherProgramTypeDescription" value={editForm.otherProgramTypeDescription} onChange={handleInputChange} className="form-input" placeholder="Enter description"/>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Number of Rooms</label>
                <input type="number" name="numberOfRooms" value={editForm.numberOfRooms} onChange={handleInputChange} min="1" max={TOTAL_ROOMS} className="form-input"/>
              </div>
              <div className="form-group">
                <label className="form-label">Booking Status (to save as)</label>
                <div className="radio-group">
                  <label className="radio-label">
                    <input type="radio" name="bookingStatus" value="pencil" checked={editForm.bookingStatus === 'pencil'} onChange={handleInputChange} className="radio-input"/>
                    <span>Pencil</span>
                  </label>
                  <label className="radio-label">
                    <input type="radio" name="bookingStatus" value="confirmed" checked={editForm.bookingStatus === 'confirmed'} onChange={handleInputChange} className="radio-input"/>
                    <span>Confirmed</span>
                  </label>
                </div>
              </div>
              <div className="time-selection">
                <div className="form-group">
                  <label className="form-label">Check-in Time</label>
                  <select name="checkInTime" value={editForm.checkInTime} onChange={handleInputChange} className="form-select">
                    {timeOptions.map(time => <option key={`edit-checkin-${time}`} value={time}>{time}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Check-out Time</label>
                  <select name="checkOutTime" value={editForm.checkOutTime} onChange={handleInputChange} className="form-select">
                    {timeOptions.map(time => <option key={`edit-checkout-${time}`} value={time}>{time}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div>
              <label className="form-label">Select Date Range</label>
              <div className="date-range-wrapper">
                <DateRangePicker ranges={[dateRange]} onChange={handleDateRangeChange} minDate={new Date()} rangeColors={["#4a6fa5"]}/>
              </div>
              <div className="date-info" style={{marginTop: '10px'}}>
                <p><span className="date-info-label">Selected Check-in:</span> {dateRange.startDate.toLocaleDateString()} at {editForm.checkInTime}</p>
                <p><span className="date-info-label">Selected Check-out:</span> {dateRange.endDate.toLocaleDateString()} at {editForm.checkOutTime}</p>
              </div>
            </div>
          </div>
          <div className="button-group" style={{marginTop: '20px'}}>
            <button onClick={handleSaveEdit} disabled={loading} className={`btn ${loading ? 'btn-disabled' : 'btn-success'}`}>
              {loading ? <><div className="spinner"></div> Saving...</> : "Save Changes"}
            </button>
            <button onClick={handleCancelEdit} className="btn btn-secondary" disabled={loading}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="bookings-list">
          {bookings.length === 0 ? (
            <p className="no-bookings">No bookings found.</p>
          ) : (
            <div className="bookings-table-container">
              <table className="bookings-table">
                <thead>
                  <tr>
                    <th>Program</th>
                    <th>Program Type Detail</th> {/* Changed Header */}
                    <th>Rooms</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(booking => (
                    <tr key={booking.id} className={booking.bookingStatus === 'confirmed' ? 'confirmed-row' : 'pencil-row'}>
                      <td>{booking.programTitle}</td>
                      <td>{getDisplayProgramType(booking)}</td> {/* Use helper for display */}
                      <td>{booking.numberOfRooms}</td>
                      <td>{formatDateTime(booking.startDate)}</td>
                      <td>{formatDateTime(booking.endDate)}</td>
                      <td><span className={`status-badge ${booking.bookingStatus.toLowerCase()}`}>{booking.bookingStatus}</span></td>
                      <td>
                        <div className="action-buttons">
                          <button onClick={() => handleEditClick(booking)} className="btn-icon edit" title="Edit">✏️</button>
                          <button onClick={() => handleDeleteBooking(booking.id, booking.bookingStatus)} className="btn-icon delete" title="Delete">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default AdminBookingManager;