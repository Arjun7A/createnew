// src/components/AdminBookingManager.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getConsolidatedBookingsForDisplay, deleteBooking, updateBooking } from '../services/availabilityService';
import { TOTAL_ROOMS, PROGRAM_TYPES, OTHER_BOOKING_CATEGORIES } from '../constants';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

const AdminBookingManager = ({ addToast, onBookingChanged }) => {
  const [bookings, setBookings] = useState([]);
  const [selectedBookingForEdit, setSelectedBookingForEdit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const getInitialLocalDate = () => {const d=new Date(); d.setHours(0,0,0,0); return d;};
  const initialEditFormState = { id: null, originalBookingStatus: '', programTitle: '', programType: '', otherBookingCategory: '', numberOfRooms: 1, bookingStatus: 'pencil', startDate: getInitialLocalDate(), endDate: getInitialLocalDate() };
  const [editForm, setEditForm] = useState(initialEditFormState);

  const convertUTCDatetoLocalDateForPicker = (utcDate) => {
    if (!utcDate) return getInitialLocalDate();
    return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
  };

  const convertLocalPickerDateToUTCMidnight = (localDate) => {
    if (!localDate) return null;
    return new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate()));
  };

  const fetchBookings = useCallback(() => { 
    setLoading(true);
    try {
      const consolidatedBookings = getConsolidatedBookingsForDisplay(); 
      setBookings(consolidatedBookings);
    } catch (error) { console.error('Error fetching bookings:', error); addToast('Error loading bookings', 'error'); }
    finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { fetchBookings(); }, [fetchBookings, onBookingChanged]);

  const handleDeleteBooking = async (bookingId, bookingStatus) => { 
    if (!window.confirm(`Delete ${bookingStatus ? bookingStatus.toLowerCase() : 'N/A'} booking? Cannot be undone.`)) return;
    setLoading(true);
    try {
      await deleteBooking(bookingId, bookingStatus);
      addToast('Booking deleted!', 'success'); fetchBookings(); if (onBookingChanged) onBookingChanged();
    } catch (error) { console.error('Error deleting booking:', error); addToast(`Delete error: ${error.message}`, 'error'); }
    finally { setLoading(false); }
  };

  const handleEditClick = (booking) => { 
    setSelectedBookingForEdit(booking);
    setEditForm({
      id: booking.id, originalBookingStatus: booking.bookingStatus,
      programTitle: booking.programTitle, programType: booking.programType || '',
      otherBookingCategory: booking.otherBookingCategory || '', numberOfRooms: booking.numberOfRooms,
      bookingStatus: booking.bookingStatus, 
      startDate: convertUTCDatetoLocalDateForPicker(booking.startDate),
      endDate: convertUTCDatetoLocalDateForPicker(booking.endDate),
    });
    setIsEditing(true);
  };

  const handleEditInputChange = (e) => { 
    const { name, value } = e.target;
    setEditForm(prev => {
      const newState = { ...prev, [name]: name === 'numberOfRooms' ? parseInt(value, 10) : value };
      if (name === 'programType' && value !== 'OTHER_BOOKINGS') newState.otherBookingCategory = '';
      return newState;
    });
  };
  const handleEditDateChange = (name, localDateFromPicker) => { 
    setEditForm(prev => ({ ...prev, [name]: localDateFromPicker }));
  };
  const handleCancelEdit = () => { setIsEditing(false); setSelectedBookingForEdit(null); setEditForm(initialEditFormState); };
  
  const validateEditForm = () => { 
    if (!editForm.programTitle.trim()) { addToast('Program title required.', 'error'); return false; }
    if (!editForm.programType) { addToast('Program type required.', 'error'); return false; }
    if (editForm.programType === 'OTHER_BOOKINGS' && !editForm.otherBookingCategory) { addToast('Category required for "Other".', 'error'); return false;}
    if (isNaN(editForm.numberOfRooms) || editForm.numberOfRooms < 1 || editForm.numberOfRooms > TOTAL_ROOMS) { addToast(`Rooms: 1-${TOTAL_ROOMS}.`, 'error'); return false;}
    
    const localStart = new Date(editForm.startDate.getFullYear(), editForm.startDate.getMonth(), editForm.startDate.getDate());
    const localEnd = new Date(editForm.endDate.getFullYear(), editForm.endDate.getMonth(), editForm.endDate.getDate());
    if (!editForm.startDate || !editForm.endDate || localStart.getTime() >= localEnd.getTime()) {
      addToast('End date must be after start date.', 'error'); return false;
    }
    return true;
  };

  const handleSaveEdit = async () => {
    if (!selectedBookingForEdit || !validateEditForm()) return; setLoading(true);
    try {
      const serviceStartDateUTC = convertLocalPickerDateToUTCMidnight(editForm.startDate);
      const serviceEndDateUTC = convertLocalPickerDateToUTCMidnight(editForm.endDate);

      const bookingPayloadForUpdate = {
        programTitle: editForm.programTitle, programType: editForm.programType,
        ...(editForm.programType === 'OTHER_BOOKINGS' && { otherBookingCategory: editForm.otherBookingCategory }),
        numberOfRooms: editForm.numberOfRooms, bookingStatus: editForm.bookingStatus,
        startDate: serviceStartDateUTC, 
        endDate: serviceEndDateUTC,     
        createdAt: selectedBookingForEdit.createdAt || new Date()
      };
      
      await updateBooking(selectedBookingForEdit.id, selectedBookingForEdit.bookingStatus, bookingPayloadForUpdate);
      addToast('Booking updated!', 'success'); fetchBookings(); setIsEditing(false); setSelectedBookingForEdit(null);
      if (onBookingChanged) onBookingChanged();
    } catch (error) { addToast(`Update error: ${error.message}`, 'error'); }
    finally { setLoading(false); }
  };

  const formatDateForDisplay = (utcDate) => { 
    if (!utcDate) return 'N/A';
    return new Date(utcDate).toLocaleDateString(undefined, { 
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' 
    });
  };
  const getDisplayProgramType = (booking) => { 
    const mainTypeObj = PROGRAM_TYPES.find(pt => pt.value === booking.programType);
    let displayType = mainTypeObj ? mainTypeObj.label : (booking.programType || 'N/A');
    if (booking.programType === 'OTHER_BOOKINGS' && booking.otherBookingCategory) {
      const categoryObj = OTHER_BOOKING_CATEGORIES.find(cat => cat.value === booking.otherBookingCategory);
      if (categoryObj && categoryObj.label && categoryObj.value) { displayType += ` (${categoryObj.label})`; }
      else if (booking.otherBookingCategory) { displayType += ` (${booking.otherBookingCategory})`;}
    }
    return displayType;
  };

  return (
    <div className="card admin-card">
      <h2 className="form-section-title">Admin Booking Management</h2>
      {isEditing && selectedBookingForEdit ? (
        <div className="edit-booking-form-admin">
          <h3 className="edit-title">Edit: <span className="highlight">{selectedBookingForEdit.programTitle}</span></h3>
          <div className="grid grid-halves">
            <div> 
              <div className="form-group"><label className="form-label">Program Title</label><input type="text" name="programTitle" value={editForm.programTitle} onChange={handleEditInputChange} className="form-input" /></div>
              <div className="form-group"><label className="form-label">Program Type</label><select name="programType" value={editForm.programType} onChange={handleEditInputChange} className="form-select"><option value="">Select Type</option>{PROGRAM_TYPES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>
              {editForm.programType === 'OTHER_BOOKINGS' && (<div className="form-group"><label className="form-label">Category</label><select name="otherBookingCategory" value={editForm.otherBookingCategory} onChange={handleEditInputChange} className="form-select">{OTHER_BOOKING_CATEGORIES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>)}
              <div className="form-group"><label className="form-label">Rooms</label><input type="number" name="numberOfRooms" value={editForm.numberOfRooms} onChange={handleEditInputChange} min="1" max={TOTAL_ROOMS} className="form-input" /></div>
            </div>
            <div> 
                <div className="form-group"><label className="form-label">Check-in</label><DatePicker selected={editForm.startDate} onChange={date => handleEditDateChange('startDate', date)} selectsStart startDate={editForm.startDate} endDate={editForm.endDate} className="form-input" dateFormat="MMMM d, yyyy" popperPlacement="bottom-start"/></div>
                <div className="form-group"><label className="form-label">Check-out</label><DatePicker selected={editForm.endDate} onChange={date => handleEditDateChange('endDate', date)} selectsEnd startDate={editForm.startDate} endDate={editForm.endDate} minDate={editForm.startDate} className="form-input" dateFormat="MMMM d, yyyy" popperPlacement="bottom-start"/></div>
                <div className="form-group"><label className="form-label">Status</label><div className="radio-group">
                    <label className="radio-label"><input type="radio" name="bookingStatus" value="pencil" checked={editForm.bookingStatus === 'pencil'} onChange={handleEditInputChange}/> Pencil</label>
                    <label className="radio-label"><input type="radio" name="bookingStatus" value="confirmed" checked={editForm.bookingStatus === 'confirmed'} onChange={handleEditInputChange}/> Confirmed</label>
                </div></div>
            </div>
          </div>
          <div className="button-group admin-edit-buttons">
            <button onClick={handleSaveEdit} disabled={loading} className={`btn ${loading ? 'btn-disabled' : 'btn-success'}`}>{loading ? <><div className="spinner"></div> Saving...</> : "Save Changes"}</button>
            <button onClick={handleCancelEdit} className="btn btn-secondary" disabled={loading}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="bookings-list"> 
          {loading && <div className="full-card-spinner"><div className="spinner-large"></div><p>Loading...</p></div>}
          {!loading && bookings.length === 0 ? ( <p className="no-bookings">No bookings found.</p> ) : 
          !loading && (
            <div className="bookings-table-container"><table className="bookings-table elegant-table">
                <thead><tr><th>Title</th><th>Type</th><th>Rooms</th><th>Check-in</th><th>Check-out</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {bookings.map(booking => ( 
                    <tr key={booking.id} className={`booking-row ${booking.bookingStatus}`}>
                      <td data-label="Title">{booking.programTitle}</td>
                      <td data-label="Type">{getDisplayProgramType(booking)}</td>
                      <td data-label="Rooms">{booking.numberOfRooms}</td>
                      <td data-label="Check-in">{formatDateForDisplay(booking.startDate)}</td>
                      <td data-label="Check-out">{formatDateForDisplay(booking.endDate)}</td>
                      <td data-label="Status"><span className={`status-badge status-${booking.bookingStatus?.toLowerCase()}`}>{booking.bookingStatus}</span></td>
                      <td data-label="Actions"><div className="action-buttons">
                          <button onClick={() => handleEditClick(booking)} className="btn-icon btn-edit" title="Edit">✏️</button>
                          <button onClick={() => handleDeleteBooking(booking.id, booking.bookingStatus)} className="btn-icon btn-delete" title="Delete">🗑️</button>
                      </div></td>
                    </tr>
                  ))}
                </tbody></table></div>
          )}
        </div>
      )}
    </div>
  );
};
export default AdminBookingManager;
