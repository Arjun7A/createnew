// src/components/AdminBookingManager.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getConsolidatedBookingsForDisplay, deleteBooking, updateBooking } from '../services/availabilityService';
import { TOTAL_ROOMS, PROGRAM_TYPES, OTHER_BOOKING_CATEGORIES } from '../constants';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

const AdminBookingManager = ({ addToast, onBookingChanged }) => {
    const getInitialLocalDate = (offset = 0) => {const d=new Date(); d.setDate(d.getDate() + offset); d.setHours(0,0,0,0); return d;};
    const initialEditFormState = { id: null, originalBookingStatus: '', programTitle: '', programType: '', otherBookingCategory: '', numberOfRooms: 1, bookingStatus: 'pencil', startDate: getInitialLocalDate(), endDate: getInitialLocalDate(1) };
    const [editForm, setEditForm] = useState(initialEditFormState);
    const [bookings, setBookings] = useState([]);
    const [selectedBookingForEdit, setSelectedBookingForEdit] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const convertUTCDatetoLocalDateForPicker = (utcDate) => {
        if (!utcDate) return getInitialLocalDate();
        return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
    };
    const convertLocalPickerDateToUTCMidnight = (localDate) => {
        if (!localDate) return null;
        return new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate()));
    };
    
    const formatDateForDisplay = (utcDate, options = { timeZone: 'UTC', weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'}) => {
        if (!utcDate) return 'N/A';
        return new Date(utcDate).toLocaleDateString(undefined, options);
    };
    const formatInclusiveLastDayForDisplay = (exclusiveCheckoutDate) => {
        if (!exclusiveCheckoutDate) return 'N/A';
        const d = new Date(exclusiveCheckoutDate); d.setUTCDate(d.getUTCDate() - 1);
        return formatDateForDisplay(d);
    };
    const formatExclusiveCheckoutDateForDisplay = (exclusiveCheckoutDate) => formatDateForDisplay(exclusiveCheckoutDate);

    const fetchBookings = useCallback(() => { 
        setLoading(true);
        try { setBookings(getConsolidatedBookingsForDisplay()); } 
        catch (error) { console.error('Error fetching bookings:', error); addToast('Error loading bookings', 'error'); }
        finally { setLoading(false); }
    }, [addToast]);
    useEffect(() => { fetchBookings(); }, [fetchBookings, onBookingChanged]);

    const handleDeleteBooking = async (bookingId, bookingStatus) => { 
        if (!window.confirm(`Delete this ${bookingStatus || ''} booking? This action cannot be undone.`)) return; setLoading(true);
        try { await deleteBooking(bookingId, bookingStatus); addToast('Booking deleted!', 'success'); fetchBookings(); if (onBookingChanged) onBookingChanged(); } 
        catch (error) { console.error('Error deleting:', error); addToast(`Delete error: ${error.message}`, 'error'); }
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
            const newState = { ...prev };
            if (name === 'numberOfRooms') {
                if (value === "") newState[name] = "";
                else {
                     const numValue = parseInt(value, 10);
                     newState[name] = isNaN(numValue) ? prev.numberOfRooms : numValue;
                }
            } else {
                 newState[name] = value;
            }
            if (name === 'programType' && value !== 'OTHER_BOOKINGS') newState.otherBookingCategory = '';
            return newState;
        });
    };

     const handleNumberOfRoomsBlurEdit = (e) => {
        const { value } = e.target;
        const numValue = parseInt(value, 10);
        setEditForm(prev => ({
            ...prev,
            numberOfRooms: isNaN(numValue) || numValue < 1 ? 1 : Math.min(numValue, TOTAL_ROOMS)
        }));
    };

    const handleEditDateChange = (name, localDateFromPicker) => { 
        setEditForm(prev => {
            const newForm = { ...prev, [name]: localDateFromPicker };
            if (name === 'startDate' && newForm.endDate && newForm.startDate && newForm.endDate.getTime() <= newForm.startDate.getTime()) {
                const newEndDate = new Date(newForm.startDate);
                newEndDate.setDate(newEndDate.getDate() + 1);
                newForm.endDate = newEndDate;
            } else if (name === 'endDate' && newForm.startDate && newForm.endDate && newForm.endDate.getTime() <= newForm.startDate.getTime()) {
                // If user makes checkout same or before checkin, revert checkout to be at least one day after checkin
                const newEndDate = new Date(newForm.startDate);
                newEndDate.setDate(newEndDate.getDate() + 1);
                newForm.endDate = newEndDate;
                 if(addToast) addToast("Check-out date must be after check-in.", "warning");
            }
            return newForm;
        });
    };
    const handleCancelEdit = () => { setIsEditing(false); setSelectedBookingForEdit(null); setEditForm(initialEditFormState); };
    
    const validateEditForm = () => { 
        if (!editForm.programTitle.trim()) { addToast('Title required.', 'error'); return false; }
        if (!editForm.programType) { addToast('Program type required.', 'error'); return false; }
        if (editForm.programType === 'OTHER_BOOKINGS' && !editForm.otherBookingCategory) { addToast('Category required.', 'error'); return false;}
        
        const numRoomsFinal = parseInt(editForm.numberOfRooms.toString(), 10);
        if (isNaN(numRoomsFinal) || numRoomsFinal < 1 || numRoomsFinal > TOTAL_ROOMS) { addToast(`Rooms must be between 1 and ${TOTAL_ROOMS}.`, 'error'); return false;}

        if (!editForm.startDate || !editForm.endDate) { addToast('Dates are required.', 'error'); return false;}
        const localStart = new Date(editForm.startDate.getFullYear(), editForm.startDate.getMonth(), editForm.startDate.getDate());
        const localEndExclusive = new Date(editForm.endDate.getFullYear(), editForm.endDate.getMonth(), editForm.endDate.getDate());
        if (localStart.getTime() >= localEndExclusive.getTime()) { addToast('Check-out date must be after check-in date.', 'error'); return false; }
        return true;
    };

    const handleSaveEdit = async () => {
        if (!selectedBookingForEdit || !validateEditForm()) return; 
        const finalNumberOfRooms = parseInt(editForm.numberOfRooms.toString(), 10) || 1; 
        setLoading(true);
        try {
            const serviceStartDateUTC = convertLocalPickerDateToUTCMidnight(editForm.startDate);
            const serviceEndDateExclusiveUTC = convertLocalPickerDateToUTCMidnight(editForm.endDate); 
            const bookingPayloadForUpdate = {
                programTitle: editForm.programTitle, programType: editForm.programType,
                ...(editForm.programType === 'OTHER_BOOKINGS' && { otherBookingCategory: editForm.otherBookingCategory }),
                numberOfRooms: finalNumberOfRooms, 
                bookingStatus: editForm.bookingStatus,
                startDate: serviceStartDateUTC, endDate: serviceEndDateExclusiveUTC,    
                createdAt: selectedBookingForEdit.createdAt || new Date() 
            };
            await updateBooking(selectedBookingForEdit.id, selectedBookingForEdit.originalBookingStatus, bookingPayloadForUpdate);
            addToast('Booking updated!', 'success'); fetchBookings(); setIsEditing(false); setSelectedBookingForEdit(null);
            if (onBookingChanged) onBookingChanged();
        } catch (error) { addToast(`Update error: ${error.message}`, 'error'); }
        finally { setLoading(false); }
    };

    const getDisplayProgramType = (booking) => { 
        const mainTypeObj = PROGRAM_TYPES.find(pt => pt.value === booking.programType);
        let displayType = mainTypeObj ? mainTypeObj.label : (booking.programType || 'N/A');
        if (booking.programType === 'OTHER_BOOKINGS' && booking.otherBookingCategory) {
            const categoryObj = OTHER_BOOKING_CATEGORIES.find(cat => cat.value === booking.otherBookingCategory);
            if (categoryObj && categoryObj.label) { displayType = `${mainTypeObj.label}: ${categoryObj.label}`; }
            else if (booking.otherBookingCategory) { displayType = `${mainTypeObj.label}: ${booking.otherBookingCategory}`; }
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
                            {editForm.programType === 'OTHER_BOOKINGS' && (<div className="form-group"><label className="form-label">Category</label><select name="otherBookingCategory" value={editForm.otherBookingCategory} onChange={handleEditInputChange} className="form-select"><option value="">Select Category</option>{OTHER_BOOKING_CATEGORIES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div>)}
                            <div className="form-group"><label className="form-label">Rooms</label>
                                <input type="text" name="numberOfRooms" value={editForm.numberOfRooms} onChange={handleEditInputChange} onBlur={handleNumberOfRoomsBlurEdit} className="form-input" />
                            </div>
                        </div>
                        <div> 
                            <div className="form-group"><label className="form-label">Check-in Date</label><DatePicker selected={editForm.startDate} onChange={date => handleEditDateChange('startDate', date)} selectsStart startDate={editForm.startDate} endDate={editForm.endDate} className="form-input" dateFormat="EEE, MMM d, yyyy" popperPlacement="bottom-start"/></div>
                            <div className="form-group"><label className="form-label">Check-out Date (Day of Departure)</label><DatePicker selected={editForm.endDate} onChange={date => handleEditDateChange('endDate', date)} selectsEnd startDate={editForm.startDate} endDate={editForm.endDate} minDate={editForm.startDate ? new Date(new Date(editForm.startDate).setDate(editForm.startDate.getDate() + 1)) : null} className="form-input" dateFormat="EEE, MMM d, yyyy" popperPlacement="bottom-start"/></div>
                            <div className="form-group"><label className="form-label">Status</label><div className="radio-group">
                                <label className="radio-label"><input type="radio" name="bookingStatus" value="pencil" checked={editForm.bookingStatus === 'pencil'} onChange={handleEditInputChange}/> Pencil</label>
                                <label className="radio-label"><input type="radio" name="bookingStatus" value="confirmed" checked={editForm.bookingStatus === 'confirmed'} onChange={handleEditInputChange}/> Confirmed</label>
                            </div></div>
                        </div>
                    </div>
                    <div className="button-group admin-edit-buttons"><button onClick={handleSaveEdit} disabled={loading} className={`btn ${loading ? 'btn-disabled' : 'btn-success'}`}>{loading ? <><div className="spinner"></div> Saving...</> : "Save Changes"}</button><button onClick={handleCancelEdit} className="btn btn-secondary" disabled={loading}>Cancel</button></div>
                </div>
            ) : (
                <div className="bookings-list">
                    {loading && <div className="full-card-spinner"><div className="spinner-large"></div><p>Loading...</p></div>}
                    {!loading && bookings.length === 0 && ( <p className="no-bookings">No bookings found.</p> )}
                    {!loading && bookings.length > 0 && (
                        <div className="bookings-table-container"><table className="bookings-table elegant-table">
                            <thead><tr><th>Title</th><th>Type</th><th>Rooms</th><th>Check-in</th><th>Last Night</th><th>Check-out Day</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                            {bookings.map(booking => ( 
                                <tr key={booking.id} className={`booking-row status-${booking.bookingStatus?.toLowerCase()}`}>
                                <td data-label="Title">{booking.programTitle}</td><td data-label="Type">{getDisplayProgramType(booking)}</td>
                                <td data-label="Rooms">{booking.numberOfRooms}</td><td data-label="Check-in">{formatDateForDisplay(booking.startDate)}</td>
                                <td data-label="Last Night">{formatInclusiveLastDayForDisplay(booking.endDate)}</td>
                                <td data-label="Check-out Day">{formatExclusiveCheckoutDateForDisplay(booking.endDate)}</td>
                                <td data-label="Status"><span className={`status-badge status-${booking.bookingStatus?.toLowerCase()}`}>{booking.bookingStatus}</span></td>
                                <td data-label="Actions"><div className="action-buttons"><button onClick={() => handleEditClick(booking)} className="btn-icon btn-edit" title="Edit">✏️</button><button onClick={() => handleDeleteBooking(booking.id, booking.bookingStatus)} className="btn-icon btn-delete" title="Delete">🗑️</button></div></td>
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
