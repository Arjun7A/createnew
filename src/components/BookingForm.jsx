// src/components/BookingForm.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { saveBooking, findAvailableSlots, checkAvailabilityForRange, getBookingsInPeriod } from '../services/availabilityService';
import { TOTAL_ROOMS, PROGRAM_TYPES, OTHER_BOOKING_CATEGORIES } from '../constants';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

const formatDateForDisplay = (utcDate, options = { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) => {
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
    const initialSearchPeriodEndLocal = getInitialLocalDate(7); 

    const [formData, setFormData] = useState({ programTitle: '', programType: '', otherBookingCategory: '', numberOfRooms: 1, bookingStatus: 'pencil' });
    const [searchCriteria, setSearchCriteria] = useState({ 
        searchPeriodStart: initialSearchPeriodStartLocal, 
        searchPeriodEnd: initialSearchPeriodEndLocal,     
        stayDuration: 1 
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
            setSearchCriteria(prev => {
                const newStart = calStartDateLocal;
                const newDuration = durationNights;
                let newEnd = prev.searchPeriodEnd; 
                if (newStart instanceof Date && newDuration > 0) {
                    const minCheckoutDate = new Date(newStart.getTime() + newDuration * 24 * 60 * 60 * 1000);
                    if (!newEnd || newEnd.getTime() < minCheckoutDate.getTime()) { 
                        newEnd = minCheckoutDate;
                    }
                }
                return { ...prev, 
                    searchPeriodStart: newStart, 
                    stayDuration: newDuration,
                    searchPeriodEnd: newEnd || initialSearchPeriodEndLocal 
                };
            });
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
        setFormData(prev => {
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

        if (name === 'numberOfRooms') {
            const numValue = parseInt(value, 10);
            const roomsToRecheck = isNaN(numValue) || numValue < 1 ? formData.numberOfRooms : Math.min(numValue, TOTAL_ROOMS); 
            if (selectedSlot && roomsToRecheck >=1) { 
                 reCheckSelectedSlotAvailability(selectedSlot, roomsToRecheck);
            }
        }
    };
    
    const handleNumberOfRoomsBlur = (e) => {
        const { value } = e.target;
        const numValue = parseInt(value, 10);
        const validatedRooms = isNaN(numValue) || numValue < 1 ? 1 : Math.min(numValue, TOTAL_ROOMS);
        setFormData(prev => ({ ...prev, numberOfRooms: validatedRooms }));
        if (selectedSlot) { 
            reCheckSelectedSlotAvailability(selectedSlot, validatedRooms);
        }
    };

    const handleSearchCriteriaChange = (name, value) => { 
        setSearchCriteria(prev => {
            const currentSearch = {...prev};
            if (name === 'stayDuration') {
                if (value === "") currentSearch[name] = ""; 
                else {
                    const numValue = parseInt(value, 10);
                    currentSearch[name] = isNaN(numValue) ? prev.stayDuration : numValue;
                }
            } else { 
                currentSearch[name] = value;
            }

            if ((name === 'searchPeriodStart' || name === 'stayDuration') && currentSearch.searchPeriodStart instanceof Date) {
                const earliestCheckin = currentSearch.searchPeriodStart;
                let duration = (name === 'stayDuration' && value === "") ? prev.stayDuration : parseInt(currentSearch.stayDuration.toString(), 10);
                if (isNaN(duration)) duration = 1;


                if (earliestCheckin && typeof duration === 'number' && duration > 0) {
                    const minCheckoutDate = new Date(earliestCheckin.getTime() + duration * 24 * 60 * 60 * 1000);
                    if (!currentSearch.searchPeriodEnd || currentSearch.searchPeriodEnd.getTime() < minCheckoutDate.getTime()) {
                        currentSearch.searchPeriodEnd = minCheckoutDate;
                    }
                }
            }
            return currentSearch;
        });
        setAvailableSlots([]); setSelectedSlot(null); setAvailabilityCheckResult(null); 
        setBookingsInSearchPeriod([]); setShowPeriodBookingsDetails(false);
    };

    const handleStayDurationBlur = (e) => {
        const { value } = e.target;
        const numValue = parseInt(value, 10);
        setSearchCriteria(prev => {
            const updatedDuration = isNaN(numValue) || numValue < 1 ? 1 : numValue;
            const newCriteria = { ...prev, stayDuration: updatedDuration };
            if (newCriteria.searchPeriodStart instanceof Date && updatedDuration > 0) {
                const minCheckoutDate = new Date(newCriteria.searchPeriodStart.getTime() + updatedDuration * 24 * 60 * 60 * 1000);
                if (!newCriteria.searchPeriodEnd || newCriteria.searchPeriodEnd.getTime() < minCheckoutDate.getTime()) {
                    newCriteria.searchPeriodEnd = minCheckoutDate;
                }
            }
            return newCriteria;
        });
    };

    const handleFindAvailableSlots = async () => {
        const numRoomsFinal = parseInt(formData.numberOfRooms.toString(),10);
        if (isNaN(numRoomsFinal) || numRoomsFinal < 1 || numRoomsFinal > TOTAL_ROOMS) {
            addToast(`Please enter a valid number of rooms (1-${TOTAL_ROOMS}).`, 'error');
            setFormData(prev => ({...prev, numberOfRooms: 1})); 
            return;
        }
        const durationNightsFinal = parseInt(searchCriteria.stayDuration.toString(),10);
        if (isNaN(durationNightsFinal) || durationNightsFinal < 1) {
            addToast('Please enter a valid number of nights (at least 1).', 'error');
            setSearchCriteria(prev => ({...prev, stayDuration: 1})); 
            return;
        }

        const earliestCheckInUTC = convertLocalToUTCDate(searchCriteria.searchPeriodStart);
        const latestCheckOutByUTC = convertLocalToUTCDate(searchCriteria.searchPeriodEnd);

        if (!earliestCheckInUTC || !latestCheckOutByUTC || earliestCheckInUTC.getTime() >= latestCheckOutByUTC.getTime()) {
            addToast('Valid search period required (Earliest Check-in < Latest Check-out By).', 'error'); return;
        }
        
        const minPossibleCheckout = new Date(earliestCheckInUTC);
        minPossibleCheckout.setUTCDate(minPossibleCheckout.getUTCDate() + durationNightsFinal);
        if (latestCheckOutByUTC.getTime() < minPossibleCheckout.getTime()){
            addToast('Latest Check-out By date is too early for the number of nights & earliest check-in.', 'error'); return;
        }
        
        setIsFindingSlots(true); setSelectedSlot(null); setAvailabilityCheckResult(null); setBookingsInSearchPeriod([]); setShowPeriodBookingsDetails(false);
        
        try {
            const slots = await findAvailableSlots(earliestCheckInUTC, latestCheckOutByUTC, durationNightsFinal, numRoomsFinal);
            setAvailableSlots(slots); 
            if (slots.length === 0) addToast('No available slots found.', 'warning');
            else addToast(`Found ${slots.length} potential ${durationNightsFinal}-night stay(s).`, 'success');

            const displayPeriodEndForOverlap = new Date(latestCheckOutByUTC);
            displayPeriodEndForOverlap.setUTCDate(displayPeriodEndForOverlap.getUTCDate() - 1); 
            const overlappingBookings = getBookingsInPeriod(earliestCheckInUTC, displayPeriodEndForOverlap);
            setBookingsInSearchPeriod(overlappingBookings);
            if (overlappingBookings.length > 0) setShowPeriodBookingsDetails(true); 
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
        const numRoomsFinal = parseInt(formData.numberOfRooms.toString(),10) || 1;
        reCheckSelectedSlotAvailability(slotWithExclusiveEndDate, numRoomsFinal);
    };

    const validateBookingForm = () => {
        if (!formData.programTitle.trim()) { addToast('Program title is required.', 'error'); return false; }
        if (!formData.programType) { addToast('Program type is required.', 'error'); return false; }
        if (formData.programType === 'OTHER_BOOKINGS' && !formData.otherBookingCategory) { addToast('Category for "Other Bookings" is required.', 'error'); return false; }
        
        const numRoomsFinal = parseInt(formData.numberOfRooms.toString(),10);
        if (isNaN(numRoomsFinal) || numRoomsFinal < 1 || numRoomsFinal > TOTAL_ROOMS) {
            addToast(`Number of rooms must be between 1 and ${TOTAL_ROOMS}.`, 'error'); return false;
        }
        
        if (!selectedSlot) { addToast('Please select an available stay period.', 'error'); return false; }
        if (!availabilityCheckResult) { addToast('Availability not confirmed. Select a slot.', 'error'); return false; }
        if (!availabilityCheckResult.isAvailable) { addToast('Selected slot is not available for the requested rooms.', 'error'); return false;}
        return true;
    };
    const handleBookRooms = async () => {
        if (!validateBookingForm()) return; 
        const finalNumberOfRooms = parseInt(formData.numberOfRooms.toString(), 10) || 1;
        setIsBooking(true);
        try {
            const bookingPayload = {
                programTitle: formData.programTitle, programType: formData.programType,
                ...(formData.programType === 'OTHER_BOOKINGS' && { otherBookingCategory: formData.otherBookingCategory }),
                numberOfRooms: finalNumberOfRooms, 
                bookingStatus: formData.bookingStatus,
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
                            minDate={getInitialLocalDate()} className="form-input" 
                            dateFormat="EEE, MMM d, yyyy" 
                            popperPlacement="bottom-start" />
                        </div>
                    </div>
                    <div> 
                        <div className="form-group">
                        <label className="form-label">Latest Check-out By</label>
                        <DatePicker selected={searchCriteria.searchPeriodEnd} 
                            onChange={date => handleSearchCriteriaChange('searchPeriodEnd', date)}
                            selectsEnd startDate={searchCriteria.searchPeriodStart} endDate={searchCriteria.searchPeriodEnd}
                            minDate={searchCriteria.searchPeriodStart && typeof parseInt(searchCriteria.stayDuration.toString(),10) === 'number' && parseInt(searchCriteria.stayDuration.toString(),10) > 0 ? 
                                new Date(new Date(searchCriteria.searchPeriodStart).getTime() + (parseInt(searchCriteria.stayDuration.toString(),10) * 24 * 60 * 60 * 1000)) : 
                                getInitialLocalDate(1)}
                            className="form-input" 
                            dateFormat="EEE, MMM d, yyyy" 
                            popperPlacement="bottom-start" />
                        </div>
                    </div>
                </div>
                <div className="grid grid-halves"> 
                    <div>
                        <div className="form-group">
                            <label className="form-label">Number of Nights</label>
                            <input 
                                type="text" 
                                name="stayDuration" 
                                value={searchCriteria.stayDuration} 
                                onChange={(e) => handleSearchCriteriaChange('stayDuration', e.target.value)}
                                onBlur={handleStayDurationBlur}
                                className="form-input"
                                placeholder="e.g., 1"
                            />
                        </div>
                    </div>
                    <div>
                        <div className="form-group">
                            <label className="form-label">Number of Rooms</label>
                            <input 
                                type="text" 
                                name="numberOfRooms" 
                                value={formData.numberOfRooms} 
                                onChange={handleFormInputChange}
                                onBlur={handleNumberOfRoomsBlur}
                                className="form-input"
                                placeholder="e.g., 1"
                            />
                            <p className="form-hint">Max {TOTAL_ROOMS} rooms.</p>
                        </div>
                    </div>
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
                        <div key={slot.startDate ? slot.startDate.toISOString() + '-' + index : `slot-${index}`}
                            className={`slot-card ${selectedSlot && selectedSlot.startDate && slot.startDate && selectedSlot.startDate.getTime() === slot.startDate.getTime() ? 'selected' : ''}`}
                            onClick={() => handleSelectSlot(slot)} role="button" tabIndex={0} onKeyPress={(e) => e.key === 'Enter' && handleSelectSlot(slot)} >
                            <p><strong>Available Slot {index + 1}</strong></p>
                            <p>Check-in: {formatDateForDisplay(slot.startDate)}</p> 
                            <p>Check-out: {formatDateForDisplay(slot.endDate)} (Last night: {formatInclusiveLastDayForDisplay(slot.endDate)})</p> 
                            <p>{parseInt(searchCriteria.stayDuration.toString(),10) || 1} nights</p>
                            <p>Min. rooms free: <span className="highlight">{slot.minAvailableRoomsInSlot}</span></p>
                        </div>
                        ))}
                    </div>
                </div>
            )}
            
            {selectedSlot && availabilityCheckResult && ( 
                <div className={`result-card ${availabilityCheckResult.isAvailable ? 'result-success' : 'result-error'}`}>
                    <h3 className="result-title">{ availabilityCheckResult.isAvailable ? `Slot: ${formData.numberOfRooms} Rooms Available!` : `Slot: Only ${availabilityCheckResult.minAvailableRoomsInPeriod} Rooms Available (Requested ${formData.numberOfRooms})`}</h3>
                    <p>Period: {formatDateForDisplay(selectedSlot.startDate)} to {formatInclusiveLastDayForDisplay(selectedSlot.endDate)} ({parseInt(searchCriteria.stayDuration.toString(),10) || 1} nights)</p> 
                    {availabilityCheckResult.dailyBreakdown && (
                         <div className="daily-availability-compact"><h4>Daily Available Rooms:</h4><ul>
                            {Object.entries(availabilityCheckResult.dailyBreakdown).sort(([dA], [dB]) => new Date(dA).getTime() - new Date(dB).getTime())
                            .map(([dateISO, available]) => ( 
                            <li key={dateISO}>{formatDateForDisplay(new Date(dateISO + "T00:00:00.000Z"))}: <strong className={available < (parseInt(formData.numberOfRooms.toString(),10) || 1) ? 'text-error' : 'text-success'}>{available}</strong></li>
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
                        {formData.programType === 'OTHER_BOOKINGS' && (<div><div className="form-group"><label className="form-label">Category for Other</label><select name="otherBookingCategory" value={formData.otherBookingCategory} onChange={handleFormInputChange} className="form-select"><option value="">Select Category</option>{OTHER_BOOKING_CATEGORIES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select></div></div>)}
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
