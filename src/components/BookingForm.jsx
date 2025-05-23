// src/components/BookingForm.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { saveBooking, findAvailableSlots, checkAvailabilityForRange, getBookingsInPeriod } from '../services/availabilityService';
import { TOTAL_ROOMS, PROGRAM_TYPES, OTHER_BOOKING_CATEGORIES } from '../constants';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

const formatDateForDisplay = (utcDate, options = { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }) => {
    if (!utcDate) return 'N/A';
    return new Date(utcDate).toLocaleDateString(undefined, options);
};
const formatInclusiveLastDayForDisplay = (exclusiveCheckoutDate) => {
    if (!exclusiveCheckoutDate) return 'N/A';
    const d = new Date(exclusiveCheckoutDate);
    d.setUTCDate(d.getUTCDate() - 1); 
    return formatDateForDisplay(d);
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
    const initialSearchPeriodEndLocal = getInitialLocalDate(7); // Default latest checkout 7 days from now

    const [formData, setFormData] = useState({ programTitle: '', programType: '', otherBookingCategory: '', numberOfRooms: 1, bookingStatus: 'pencil' });
    const [searchCriteria, setSearchCriteria] = useState({ 
        searchPeriodStart: initialSearchPeriodStartLocal, 
        searchPeriodEnd: initialSearchPeriodEndLocal,     
        stayDuration: 1 // Number of Nights
    });
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

            if (calStartDateLocal && calEndDateLocal && calEndDateLocal < calStartDateLocal) {
                calEndDateLocal = new Date(calStartDateLocal);
            }
            
            let durationNights = 1;
            if (calStartDateLocal && calEndDateLocal) {
                const startUTC = convertLocalToUTCDate(calStartDateLocal);
                const endInclusiveUTC = convertLocalToUTCDate(calEndDateLocal);
                if(startUTC && endInclusiveUTC && endInclusiveUTC.getTime() >= startUTC.getTime()){
                    const diffTime = Math.abs(endInclusiveUTC.getTime() - startUTC.getTime());
                    durationNights = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1; 
                    durationNights = Math.max(1, durationNights);
                }
            }
            setSearchCriteria(prev => ({ ...prev, 
                searchPeriodStart: calStartDateLocal, 
                stayDuration: durationNights,
                // Auto-adjust latest checkout if current one is too early for new duration
                searchPeriodEnd: new Date(Math.max(
                    (prev.searchPeriodEnd || initialSearchPeriodEndLocal).getTime(), 
                    new Date(calStartDateLocal.getTime() + durationNights * 24 * 60 * 60 * 1000).getTime()
                ))
            }));
            setAvailableSlots([]); setSelectedSlot(null); setAvailabilityCheckResult(null); 
            setBookingsInSearchPeriod([]); setShowPeriodBookingsDetails(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDates]);

    const reCheckSelectedSlotAvailability = useCallback(async (slotToCheck, rooms) => {
        if (!slotToCheck || !slotToCheck.startDate || !slotToCheck.endDate || rooms < 1) { 
            setAvailabilityCheckResult(null); return; 
        }
        try {
            const result = await checkAvailabilityForRange(slotToCheck.startDate, slotToCheck.endDate, rooms);
            setAvailabilityCheckResult(result);
        } catch (error) { addToast(`Error re-checking: ${error.message}`, 'error'); setAvailabilityCheckResult(null); }
    }, [addToast]);

    const handleFormInputChange = (e) => { 
        const { name, value } = e.target; 
        const newNumberOfRooms = name === 'numberOfRooms' ? parseInt(value, 10) || 1 : formData.numberOfRooms;
        setFormData(prev => {
            const newState = { ...prev, [name]: name === 'numberOfRooms' ? newNumberOfRooms : value };
            if (name === 'programType' && value !== 'OTHER_BOOKINGS') newState.otherBookingCategory = '';
            return newState;
        });
        if (name === 'numberOfRooms' && selectedSlot) {
            reCheckSelectedSlotAvailability(selectedSlot, newNumberOfRooms);
        }
    };

    const handleSearchCriteriaChange = (name, value) => { 
        const currentSearch = {...searchCriteria};
        const newValue = (name === 'stayDuration' || name === 'numberOfRooms') ? (parseInt(value, 10) || 1) : value;
        currentSearch[name] = newValue;

        // Ensure latest checkout is always after earliest checkin + duration
        if (name === 'searchPeriodStart' || name === 'stayDuration') {
            const earliestCheckin = name === 'searchPeriodStart' ? newValue : currentSearch.searchPeriodStart;
            const duration = name === 'stayDuration' ? newValue : currentSearch.stayDuration;
            if (earliestCheckin instanceof Date && duration > 0) {
                const minCheckoutDate = new Date(earliestCheckin.getTime() + duration * 24 * 60 * 60 * 1000);
                if (currentSearch.searchPeriodEnd.getTime() < minCheckoutDate.getTime()) {
                    currentSearch.searchPeriodEnd = minCheckoutDate;
                }
            }
        }
        setSearchCriteria(currentSearch);
        setAvailableSlots([]); setSelectedSlot(null); setAvailabilityCheckResult(null); 
        setBookingsInSearchPeriod([]); setShowPeriodBookingsDetails(false);
    };

    const handleFindAvailableSlots = async () => {
        const currentRooms = parseInt(formData.numberOfRooms, 10) || 1;
        const durationNights = parseInt(searchCriteria.stayDuration, 10) || 1; 
        if (durationNights < 1) {addToast('Number of nights must be at least 1.', 'error'); return;}
        if (currentRooms < 1 || currentRooms > TOTAL_ROOMS) {addToast(`Rooms: 1-${TOTAL_ROOMS}.`, 'error'); return;}

        const earliestCheckInUTC = convertLocalToUTCDate(searchCriteria.searchPeriodStart);
        const latestCheckOutByUTC = convertLocalToUTCDate(searchCriteria.searchPeriodEnd);

        if (!earliestCheckInUTC || !latestCheckOutByUTC || earliestCheckInUTC.getTime() >= latestCheckOutByUTC.getTime()) {
            addToast('Valid search period required (Earliest Check-in < Latest Check-out By).', 'error'); return;
        }
        
        const minPossibleCheckout = new Date(earliestCheckInUTC);
        minPossibleCheckout.setUTCDate(minPossibleCheckout.getUTCDate() + durationNights);
        if (latestCheckOutByUTC.getTime() < minPossibleCheckout.getTime()){
            addToast('Latest Check-out By date is too early for the number of nights & earliest check-in.', 'error'); return;
        }
        
        setIsFindingSlots(true); setSelectedSlot(null); setAvailabilityCheckResult(null); setBookingsInSearchPeriod([]); setShowPeriodBookingsDetails(false);
        
        try {
            const slots = await findAvailableSlots(earliestCheckInUTC, latestCheckOutByUTC, durationNights, currentRooms);
            setAvailableSlots(slots); 
            if (slots.length === 0) addToast('No available slots found for criteria.', 'warning');
            else addToast(`Found ${slots.length} potential ${durationNights}-night stay(s).`, 'success');

            const displayPeriodEndForOverlap = new Date(latestCheckOutByUTC);
            displayPeriodEndForOverlap.setUTCDate(displayPeriodEndForOverlap.getUTCDate() - 1); 
            const overlappingBookings = getBookingsInPeriod(earliestCheckInUTC, displayPeriodEndForOverlap);
            setBookingsInSearchPeriod(overlappingBookings);
            if (overlappingBookings.length > 0) {
                setShowPeriodBookingsDetails(true); 
            }
        } catch (error) { addToast(`Error during search: ${error.message}`, 'error'); }
        finally { setIsFindingSlots(false); }
    };

    const handleSelectSlot = (slotWithExclusiveEndDate) => { 
        if (!slotWithExclusiveEndDate || !slotWithExclusiveEndDate.startDate || !slotWithExclusiveEndDate.endDate) {
            console.error("Invalid slot selected:", slotWithExclusiveEndDate);
            addToast("Invalid slot data. Please try again.", "error");
            return;
        }
        setSelectedSlot(slotWithExclusiveEndDate);
        reCheckSelectedSlotAvailability(slotWithExclusiveEndDate, formData.numberOfRooms);
    };

    const validateBookingForm = () => {
        if (!formData.programTitle.trim()) { addToast('Program title is required.', 'error'); return false; }
        if (!formData.programType) { addToast('Program type is required.', 'error'); return false; }
        if (formData.programType === 'OTHER_BOOKINGS' && !formData.otherBookingCategory) { addToast('Category for "Other Bookings" is required.', 'error'); return false; }
        if (!selectedSlot) { addToast('Please select an available stay period.', 'error'); return false; }
        if (!availabilityCheckResult) { addToast('Availability not confirmed. Select a slot.', 'error'); return false; }
        if (!availabilityCheckResult.isAvailable) { addToast('Selected slot is not available for the requested rooms.', 'error'); return false;}
        return true;
    };
    const handleBookRooms = async () => {
        if (!validateBookingForm()) return; setIsBooking(true);
        try {
            const bookingPayload = {
                programTitle: formData.programTitle, programType: formData.programType,
                ...(formData.programType === 'OTHER_BOOKINGS' && { otherBookingCategory: formData.otherBookingCategory }),
                numberOfRooms: parseInt(formData.numberOfRooms, 10), bookingStatus: formData.bookingStatus,
                startDate: selectedSlot.startDate, 
                endDate: selectedSlot.endDate, 
            };
            await saveBooking(bookingPayload);
            addToast('Booking successful!', 'success'); if (onBookingAdded) onBookingAdded(); resetForm();
        } catch (error) { addToast(`Booking Error: ${error.message}`, 'error'); }
        finally { setIsBooking(false); }
    };

    const resetForm = () => { 
        setFormData({ programTitle: '', programType: '', otherBookingCategory: '', numberOfRooms: 1, bookingStatus: 'pencil', });
        const initialStart = getInitialLocalDate();
        setSearchCriteria({ searchPeriodStart: initialStart, searchPeriodEnd: getInitialLocalDate(7), stayDuration: 1, });
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
                        <label className="form-label">Earliest Check-in Date</label>
                        <DatePicker selected={searchCriteria.searchPeriodStart} 
                            onChange={date => handleSearchCriteriaChange('searchPeriodStart', date)}
                            selectsStart startDate={searchCriteria.searchPeriodStart} endDate={searchCriteria.searchPeriodEnd}
                            minDate={getInitialLocalDate()} className="form-input" dateFormat="MMMM d, yyyy" popperPlacement="bottom-start" />
                        </div>
                    </div>
                    <div> 
                        <div className="form-group">
                        <label className="form-label">Latest Check-out By</label>
                        <DatePicker selected={searchCriteria.searchPeriodEnd} 
                            onChange={date => handleSearchCriteriaChange('searchPeriodEnd', date)}
                            selectsEnd startDate={searchCriteria.searchPeriodStart} endDate={searchCriteria.searchPeriodEnd}
                            minDate={searchCriteria.searchPeriodStart ? new Date(new Date(searchCriteria.searchPeriodStart).getTime() + (searchCriteria.stayDuration * 24 * 60 * 60 * 1000)) : getInitialLocalDate(1)}
                            className="form-input" dateFormat="MMMM d, yyyy" popperPlacement="bottom-start" />
                        </div>
                    </div>
                </div>
                <div className="grid grid-halves"> 
                    <div><div className="form-group"><label className="form-label">Number of Nights</label><input type="number" name="stayDuration" value={searchCriteria.stayDuration} onChange={(e) => handleSearchCriteriaChange('stayDuration', e.target.value)} min="1" className="form-input"/></div></div>
                    <div><div className="form-group"><label className="form-label">Number of Rooms</label><input type="number" name="numberOfRooms" value={formData.numberOfRooms} onChange={handleFormInputChange} min="1" max={TOTAL_ROOMS} className="form-input"/><p className="form-hint">Max {TOTAL_ROOMS} rooms.</p></div></div>
                </div>
                <button onClick={handleFindAvailableSlots} disabled={isFindingSlots || isBooking} className="btn btn-primary btn-full-width">{isFindingSlots ? <><div className="spinner"></div> Finding...</> : "Find Available Stay Periods"}</button>
            </div>

            {showPeriodBookingsDetails && bookingsInSearchPeriod.length > 0 && (
                <div className="form-step existing-bookings-in-period-section elegant-list-section">
                    <h3 className="step-title">Existing Bookings Overlapping Search Window 
                        ({formatDateForDisplay(convertLocalToUTCDate(searchCriteria.searchPeriodStart))} to {formatDateForDisplay(convertLocalToUTCDate(searchCriteria.searchPeriodEnd))})
                    </h3>
                    <div className="existing-bookings-list elegant-scrollable-list">
                        {bookingsInSearchPeriod.map(booking => (
                            <div key={booking.id} className={`period-booking-item-elegant status-${booking.bookingStatus?.toLowerCase()}`}>
                                <div className="booking-item-main-info">
                                    <span className="booking-item-title">{booking.programTitle}</span>
                                    <span className="booking-item-rooms">({booking.numberOfRooms} {booking.numberOfRooms === 1 ? 'room' : 'rooms'})</span>
                                </div>
                                <div className="booking-item-sub-info">
                                    <span>{formatDateForDisplay(booking.startDate)} to {formatInclusiveLastDayForDisplay(booking.endDate)}</span>
                                    <span className={`booking-item-status-chip status-chip-${booking.bookingStatus?.toLowerCase()}`}>{booking.bookingStatus}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {availableSlots.length > 0 && ( 
                <div className="form-step">
                    <h3 className="step-title">Step 2: Select an Available Stay Period</h3>
                    <div className="available-slots-container">
                        {availableSlots.map((slot, index) => ( 
                        <div key={slot.startDate ? slot.startDate.toISOString() : `slot-${index}`}
                            className={`slot-card ${selectedSlot && selectedSlot.startDate && slot.startDate && selectedSlot.startDate.getTime() === slot.startDate.getTime() ? 'selected' : ''}`}
                            onClick={() => handleSelectSlot(slot)} role="button" tabIndex={0} onKeyPress={(e) => e.key === 'Enter' && handleSelectSlot(slot)} >
                            <p><strong>Available Slot {index + 1}</strong></p>
                            <p>Check-in: {formatDateForDisplay(slot.startDate)}</p> 
                            <p>Check-out: {formatDateForDisplay(slot.endDate)} (Last night: {formatInclusiveLastDayForDisplay(slot.endDate)})</p> 
                            <p>{searchCriteria.stayDuration} nights</p>
                            <p>Min. rooms free: <span className="highlight">{slot.minAvailableRoomsInSlot}</span></p>
                        </div>
                        ))}
                    </div>
                </div>
            )}
            
            {selectedSlot && availabilityCheckResult && ( 
                <div className={`result-card ${availabilityCheckResult.isAvailable ? 'result-success' : 'result-error'}`}>
                    <h3 className="result-title">{ availabilityCheckResult.isAvailable ? `Slot: ${formData.numberOfRooms} Rooms Available!` : `Slot: Only ${availabilityCheckResult.minAvailableRoomsInPeriod} Rooms Available (Requested ${formData.numberOfRooms})`}</h3>
                    <p>Period: {formatDateForDisplay(selectedSlot.startDate)} to {formatInclusiveLastDayForDisplay(selectedSlot.endDate)} ({searchCriteria.stayDuration} nights)</p> 
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
                        <button onClick={handleBookRooms} disabled={isBooking || !selectedSlot || !availabilityCheckResult || !availabilityCheckResult.isAvailable} className={`btn ${isBooking ? 'btn-disabled' : 'btn-success'}`}>
                            {isBooking ? <><div className="spinner"></div> Booking...</> : "Book Now"}
                        </button>
                        <button onClick={resetForm} className="btn btn-secondary" disabled={isBooking}>Reset All</button>
                    </div>
                </div>
            )}
        </div>
    );
};
export default BookingForm;
