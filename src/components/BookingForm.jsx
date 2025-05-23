// src/components/BookingForm.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { saveBooking, findAvailableSlots, checkAvailabilityForRange, getBookingsInPeriod } from '../services/availabilityService';
import { TOTAL_ROOMS, PROGRAM_TYPES, OTHER_BOOKING_CATEGORIES } from '../constants';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
// react-big-calendar and moment are no longer needed here if the mini-calendar is removed

const formatDateForDisplay = (utcDate, options = { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) => {
    if (!utcDate) return 'N/A';
    return new Date(utcDate).toLocaleDateString(undefined, options);
};
const convertLocalToUTCDate = (localDate) => {
    if (!localDate) return null;
    return new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate()));
};

const BookingForm = ({ addToast, onBookingAdded, selectedDates }) => {
    const getInitialLocalDate = (offset = 0) => {
        const date = new Date(); date.setDate(date.getDate() + offset); date.setHours(0, 0, 0, 0); return date;
    };
    const initialSearchPeriodStartLocal = getInitialLocalDate();
    const initialSearchPeriodEndLocal = getInitialLocalDate(30);

    const [formData, setFormData] = useState({ programTitle: '', programType: '', otherBookingCategory: '', numberOfRooms: 1, bookingStatus: 'pencil' });
    const [searchCriteria, setSearchCriteria] = useState({ searchPeriodStart: initialSearchPeriodStartLocal, searchPeriodEnd: initialSearchPeriodEndLocal, stayDuration: 1 });
    const [availableSlots, setAvailableSlots] = useState([]); 
    const [selectedSlot, setSelectedSlot] = useState(null);   
    const [availabilityCheckResult, setAvailabilityCheckResult] = useState(null);
    const [isFindingSlots, setIsFindingSlots] = useState(false);
    const [isBooking, setIsBooking] = useState(false);
    const [bookingsInSearchPeriod, setBookingsInSearchPeriod] = useState([]);
    const [showPeriodBookingsDetails, setShowPeriodBookingsDetails] = useState(false);
  
    useEffect(() => {
        if (selectedDates && selectedDates.startDate) {
            const calStartDateLocal = selectedDates.startDate;
            let calEndDateLocal = selectedDates.endDate;
            if (calStartDateLocal && calEndDateLocal && calEndDateLocal < calStartDateLocal) calEndDateLocal = new Date(calStartDateLocal);
            let durationFromCalendar = searchCriteria.stayDuration;
            if (calStartDateLocal && calEndDateLocal) {
                const diffTime = Math.abs(calEndDateLocal.getTime() - calStartDateLocal.getTime());
                durationFromCalendar = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                durationFromCalendar = durationFromCalendar > 0 ? durationFromCalendar : 1;
            }
            setSearchCriteria(prev => ({ ...prev, searchPeriodStart: calStartDateLocal, searchPeriodEnd: calEndDateLocal || prev.searchPeriodEnd, stayDuration: durationFromCalendar }));
            setAvailableSlots([]); setSelectedSlot(null); setAvailabilityCheckResult(null); 
            setBookingsInSearchPeriod([]); setShowPeriodBookingsDetails(false); // Reset this section too
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDates]);

    const reCheckSelectedSlotAvailability = useCallback(async (slotToCheck, rooms) => {
        if (!slotToCheck || rooms < 1 || !slotToCheck.startDate || !slotToCheck.endDate) { setAvailabilityCheckResult(null); return; }
        try {
            const result = await checkAvailabilityForRange(slotToCheck.startDate, slotToCheck.endDate, rooms);
            setAvailabilityCheckResult(result);
        } catch (error) { addToast(`Error re-checking slot: ${error.message}`, 'error'); setAvailabilityCheckResult(null); }
    }, [addToast]);

    const handleFormInputChange = (e) => { 
        const { name, value } = e.target; const newNumberOfRooms = name === 'numberOfRooms' ? parseInt(value, 10) : formData.numberOfRooms;
        setFormData(prev => {
            const newState = { ...prev, [name]: name === 'numberOfRooms' ? parseInt(value, 10) : value };
            if (name === 'programType' && value !== 'OTHER_BOOKINGS') newState.otherBookingCategory = '';
            return newState;
        });
        if (name === 'numberOfRooms') {
            if (selectedSlot && !isNaN(newNumberOfRooms) && newNumberOfRooms >= 1) reCheckSelectedSlotAvailability(selectedSlot, newNumberOfRooms);
            else setAvailabilityCheckResult(null);
        }
    };

    const handleSearchCriteriaChange = (name, localDateValue) => { 
        setSearchCriteria(prev => ({ ...prev, [name]: localDateValue }));
        setAvailableSlots([]); setSelectedSlot(null); setAvailabilityCheckResult(null); 
        setBookingsInSearchPeriod([]); setShowPeriodBookingsDetails(false); // Reset on any search criteria change
    };

    const handleFindAvailableSlots = async () => {
        const currentRooms = parseInt(formData.numberOfRooms, 10);
        const currentDuration = parseInt(searchCriteria.stayDuration, 10);
        if (currentDuration < 1) {addToast('Duration must be >= 1 day.', 'error'); return;}
        if (currentRooms < 1 || currentRooms > TOTAL_ROOMS) {addToast(`Rooms: 1-${TOTAL_ROOMS}.`, 'error'); return;}

        const serviceSearchStartUTC = convertLocalToUTCDate(searchCriteria.searchPeriodStart);
        const serviceSearchEndUTC = convertLocalToUTCDate(searchCriteria.searchPeriodEnd);

        if (!serviceSearchStartUTC || !serviceSearchEndUTC || serviceSearchStartUTC.getTime() >= serviceSearchEndUTC.getTime()) {
            addToast('Valid search period required (start < end).', 'error'); return;
        }
        
        setIsFindingSlots(true); setSelectedSlot(null); setAvailabilityCheckResult(null); setBookingsInSearchPeriod([]); setShowPeriodBookingsDetails(false);
        try {
            const slots = await findAvailableSlots(serviceSearchStartUTC, serviceSearchEndUTC, currentDuration, currentRooms);
            setAvailableSlots(slots); 
            if (slots.length === 0) addToast('No available slots found for criteria.', 'warning');
            else addToast(`Found ${slots.length} potential stay period(s). Select one.`, 'success');

            const overlappingBookings = getBookingsInPeriod(serviceSearchStartUTC, serviceSearchEndUTC);
            setBookingsInSearchPeriod(overlappingBookings);
            if (overlappingBookings.length > 0) {
                setShowPeriodBookingsDetails(true); 
            }
        } catch (error) { addToast(`Error during search: ${error.message}`, 'error'); }
        finally { setIsFindingSlots(false); }
    };

    const handleSelectSlot = async (slotWithUTCDates) => { 
        setSelectedSlot(slotWithUTCDates);
        reCheckSelectedSlotAvailability(slotWithUTCDates, formData.numberOfRooms);
    };

    const validateBookingForm = () => { /* ... (same as before) ... */ };
    const handleBookRooms = async () => { /* ... (same as before) ... */ };
    const resetForm = () => { 
        setFormData({ programTitle: '', programType: '', otherBookingCategory: '', numberOfRooms: 1, bookingStatus: 'pencil', });
        const initialStart = getInitialLocalDate();
        setSearchCriteria({ searchPeriodStart: initialStart, searchPeriodEnd: getInitialLocalDate(30), stayDuration: 1, });
        setAvailableSlots([]); setSelectedSlot(null); setAvailabilityCheckResult(null); setIsFindingSlots(false); setIsBooking(false);
        setBookingsInSearchPeriod([]); setShowPeriodBookingsDetails(false);
    };
    
    return (
        <div className="card booking-form-card">
            <h2 className="form-section-title">Make a New Room Booking</h2>
            <div className="form-step"> 
                <h3 className="step-title">Step 1: Define Search Criteria & Room Needs</h3>
                <div className="grid grid-halves">
                    <div> 
                        <div className="form-group">
                        <label className="form-label">Search Period Start</label>
                        <DatePicker selected={searchCriteria.searchPeriodStart} 
                            onChange={date => handleSearchCriteriaChange('searchPeriodStart', date)}
                            selectsStart startDate={searchCriteria.searchPeriodStart} endDate={searchCriteria.searchPeriodEnd}
                            minDate={getInitialLocalDate()} className="form-input" dateFormat="MMMM d, yyyy" popperPlacement="bottom-start" />
                        </div>
                    </div>
                    <div> 
                        <div className="form-group">
                        <label className="form-label">Search Period End</label>
                        <DatePicker selected={searchCriteria.searchPeriodEnd} 
                            onChange={date => handleSearchCriteriaChange('searchPeriodEnd', date)}
                            selectsEnd startDate={searchCriteria.searchPeriodStart} endDate={searchCriteria.searchPeriodEnd}
                            minDate={searchCriteria.searchPeriodStart || getInitialLocalDate()} className="form-input" dateFormat="MMMM d, yyyy" popperPlacement="bottom-start" />
                        </div>
                    </div>
                </div>
                <div className="grid grid-halves"> 
                    <div><div className="form-group"><label className="form-label">Duration of Stay (days)</label><input type="number" name="stayDuration" value={searchCriteria.stayDuration} onChange={(e) => handleSearchCriteriaChange('stayDuration', parseInt(e.target.value,10)>0?parseInt(e.target.value,10):1)} min="1" className="form-input"/></div></div>
                    <div><div className="form-group"><label className="form-label">Number of Rooms</label><input type="number" name="numberOfRooms" value={formData.numberOfRooms} onChange={handleFormInputChange} min="1" max={TOTAL_ROOMS} className="form-input"/><p className="form-hint">Max {TOTAL_ROOMS} rooms.</p></div></div>
                </div>
                <button onClick={handleFindAvailableSlots} disabled={isFindingSlots || isBooking} className="btn btn-primary btn-full-width">{isFindingSlots ? <><div className="spinner"></div> Finding...</> : "Find Available Stay Periods"}</button>
            </div>

            {showPeriodBookingsDetails && bookingsInSearchPeriod.length > 0 && (
                <div className="form-step existing-bookings-in-period-section elegant-list-section">
                    <h3 className="step-title">Existing Bookings within Your Search Period 
                        ({formatDateForDisplay(convertLocalToUTCDate(searchCriteria.searchPeriodStart))} - {formatDateForDisplay(convertLocalToUTCDate(searchCriteria.searchPeriodEnd))})
                    </h3>
                    <div className="existing-bookings-list elegant-scrollable-list">
                        {/* No <h4>Booking List:</h4> needed if section title is enough */}
                        {bookingsInSearchPeriod.map(booking => (
                            <div key={booking.id} className={`period-booking-item-elegant status-${booking.bookingStatus?.toLowerCase()}`}>
                                <div className="booking-item-main-info">
                                    <span className="booking-item-title">{booking.programTitle}</span>
                                    <span className="booking-item-rooms">({booking.numberOfRooms} {booking.numberOfRooms === 1 ? 'room' : 'rooms'})</span>
                                </div>
                                <div className="booking-item-sub-info">
                                    <span>{formatDateForDisplay(booking.startDate)} - {formatDateForDisplay(booking.endDate)}</span>
                                    <span className={`booking-item-status-chip status-chip-${booking.bookingStatus?.toLowerCase()}`}>{booking.bookingStatus}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* Mini-calendar div is removed */}
                </div>
            )}

            {/* Step 2: Select Available Slot - Unchanged JSX Structure */}
            {/* Result Card - Unchanged JSX Structure */}
            {/* Step 3: Booking Details - Unchanged JSX Structure */}
            {/* (Copy these sections from your previous complete BookingForm.jsx if needed) */}

             {availableSlots.length > 0 && ( 
                <div className="form-step">
                    <h3 className="step-title">Step 2: Select an Available Stay Period</h3>
                    <div className="available-slots-container">
                        {availableSlots.map((slot, index) => ( 
                        <div key={`${slot.startDate.toISOString()}-${index}`}
                            className={`slot-card ${selectedSlot && selectedSlot.startDate.getTime() === slot.startDate.getTime() ? 'selected' : ''}`}
                            onClick={() => handleSelectSlot(slot)} role="button" tabIndex={0} onKeyPress={(e) => e.key === 'Enter' && handleSelectSlot(slot)} >
                            <p><strong>Available Slot {index + 1}</strong></p>
                            <p>Check-in: {formatDateForDisplay(slot.startDate)}</p> 
                            <p>Check-out: {formatDateForDisplay(slot.endDate)} ({searchCriteria.stayDuration} days)</p> 
                            <p>Min. rooms free: <span className="highlight">{slot.minAvailableRoomsInSlot}</span></p>
                        </div>
                        ))}
                    </div>
                </div>
            )}
            
            {selectedSlot && availabilityCheckResult && ( 
                <div className={`result-card ${availabilityCheckResult.isAvailable ? 'result-success' : 'result-error'}`}>
                    <h3 className="result-title">{ availabilityCheckResult.isAvailable ? `Slot: ${formData.numberOfRooms} Rooms Available!` : `Slot: Only ${availabilityCheckResult.minAvailableRoomsInPeriod} Rooms Available (Requested ${formData.numberOfRooms})`}</h3>
                    <p>Period: {formatDateForDisplay(selectedSlot.startDate)} to {formatDateForDisplay(selectedSlot.endDate)}</p> 
                    {availabilityCheckResult.dailyBreakdown && (
                        <div className="daily-availability-compact"><h4>Daily Available Rooms:</h4><ul>
                            {Object.entries(availabilityCheckResult.dailyBreakdown).sort(([dA], [dB]) => new Date(dA).getTime() - new Date(dB).getTime())
                            .map(([dateISO, available]) => ( 
                            <li key={dateISO}>{formatDateForDisplay(new Date(dateISO + "T00:00:00.000Z"))}: <strong className={available < formData.numberOfRooms ? 'text-error' : 'text-success'}>{available}</strong></li>
                            ))}</ul>
                        </div>
                    )}
                </div>
            )}

            {selectedSlot && availabilityCheckResult && availabilityCheckResult.isAvailable && ( 
                <div className="form-step">
                    <h3 className="step-title">Step 3: Enter Program Details & Confirm</h3>
                    <div className="form-group"><label className="form-label">Program Title</label><input type="text" name="programTitle" value={formData.programTitle} onChange={handleFormInputChange} className="form-input" placeholder="Program title"/></div>
                    <div className="grid grid-halves">
                        <div><div className="form-group"><label className="form-label">Program Type</label><select name="programType" value={formData.programType} onChange={handleFormInputChange} className="form-select"><option value="">Select Type</option>{PROGRAM_TYPES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div></div>
                        {formData.programType === 'OTHER_BOOKINGS' && (<div><div className="form-group"><label className="form-label">Category for Other</label><select name="otherBookingCategory" value={formData.otherBookingCategory} onChange={handleFormInputChange} className="form-select">{OTHER_BOOKING_CATEGORIES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div></div>)}
                    </div>
                    <div className="form-group"><label className="form-label">Booking Type</label><div className="radio-group">
                        <label className="radio-label"><input type="radio" name="bookingStatus" value="pencil" checked={formData.bookingStatus === 'pencil'} onChange={handleFormInputChange}/> Pencil</label>
                        <label className="radio-label"><input type="radio" name="bookingStatus" value="confirmed" checked={formData.bookingStatus === 'confirmed'} onChange={handleFormInputChange}/> Confirmed</label>
                    </div></div>
                    <div className="button-group">
                        <button onClick={handleBookRooms} disabled={isBooking || !availabilityCheckResult?.isAvailable} className={`btn ${isBooking ? 'btn-disabled' : 'btn-success'}`}>{isBooking ? <><div className="spinner"></div> Booking...</> : "Book Now"}</button>
                        <button onClick={resetForm} className="btn btn-secondary" disabled={isBooking}>Reset All</button>
                    </div>
                </div>
            )}
        </div>
    );
};
export default BookingForm;
