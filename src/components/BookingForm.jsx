// src/components/BookingForm.jsx
import React, { useState, useEffect } from 'react';
import { DateRangePicker } from 'react-date-range';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { checkRoomAvailability, saveBooking } from '../services/availabilityService';
import { TOTAL_ROOMS, PROGRAM_TYPES } from '../constants'; // Import constants

const BookingForm = ({ addToast, onBookingAdded, selectedDates }) => {
  const [formData, setFormData] = useState({
    programTitle: '',
    programType: '', // Will store 'CTP', 'LDP', 'MDP', or 'OTHERS'
    otherProgramTypeDescription: '', // For "OTHERS" description
    numberOfRooms: 1,
    bookingStatus: 'pencil', 
    checkInTime: '14:00',
    checkOutTime: '11:00',
  });

  const [dateRange, setDateRange] = useState({
    startDate: new Date(),
    endDate: new Date(new Date().setDate(new Date().getDate() + 1)),
    key: 'selection',
  });

  // Using PROGRAM_TYPES from constants.js
  // const programTypes = PROGRAM_TYPES; // Already imported

  const timeOptions = generateTimeOptions();
  const [availabilityResult, setAvailabilityResult] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isBooking, setIsBooking] = useState(false);

  useEffect(() => {
    if (selectedDates && selectedDates.startDate && selectedDates.endDate) {
      setDateRange({
        startDate: selectedDates.startDate,
        endDate: selectedDates.endDate,
        key: 'selection'
      });
      checkAvailabilityForDates(
        selectedDates.startDate, selectedDates.endDate, 
        formData.numberOfRooms, formData.checkInTime, formData.checkOutTime, 
        formData.bookingStatus 
      );
    }
  }, [selectedDates]); 

  function generateTimeOptions() {
    const options = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute of ['00', '30']) {
        options.push(`${String(hour).padStart(2, '0')}:${minute}`);
      }
    }
    return options;
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const newState = { ...prev, [name]: name === 'numberOfRooms' ? parseInt(value) : value };
      // If programType is not 'OTHERS', clear the description
      if (name === 'programType' && value !== 'OTHERS') {
        newState.otherProgramTypeDescription = '';
      }
      return newState;
    });
  };

  const handleDateRangeChange = (ranges) => { setDateRange(ranges.selection); };

  const calculateDuration = () => {
    if (!dateRange.startDate || !dateRange.endDate) return 0;
    const diffTime = Math.abs(new Date(dateRange.endDate).getTime() - new Date(dateRange.startDate).getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0 && dateRange.startDate.toDateString() === dateRange.endDate.toDateString()) {
        return 1; 
    }
    return diffDays > 0 ? diffDays : 1; 
  };

  const combineDateAndTime = (date, timeString) => {
    const result = new Date(date); 
    const [hours, minutes] = timeString.split(':').map(Number);
    result.setHours(hours, minutes, 0, 0);
    return result;
  };

  const checkAvailabilityForDates = async (startDate, endDate, rooms, checkInTime, checkOutTime, bookingTypeToMake) => {
    setIsChecking(true);
    setAvailabilityResult(null);
    try {
      const checkInDateTime = combineDateAndTime(startDate, checkInTime);
      const checkOutDateTime = combineDateAndTime(endDate, checkOutTime);
      
      const result = await checkRoomAvailability(checkInDateTime, checkOutDateTime, rooms, bookingTypeToMake);

      setAvailabilityResult(result); 
      if (result.available) {
        addToast(`Rooms are available for your ${bookingTypeToMake} booking!`, 'success');
      } else {
        addToast(`Sorry, only ${result.availableRooms} rooms available for your ${bookingTypeToMake} request.`, 'error');
      }
    } catch (error) {
      addToast(`Error checking availability: ${error.message}`, 'error');
      console.error('Error checking availability:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const handleCheckAvailability = async () => {
    if (!validateForm()) return;
    checkAvailabilityForDates(
        dateRange.startDate, dateRange.endDate, 
        formData.numberOfRooms, formData.checkInTime, formData.checkOutTime,
        formData.bookingStatus 
    );
  };

  const handleBookRooms = async () => {
    if (!validateForm()) return; 

    setIsBooking(true);
    try {
        const checkInDateTime = combineDateAndTime(dateRange.startDate, formData.checkInTime);
        const checkOutDateTime = combineDateAndTime(dateRange.endDate, formData.checkOutTime);

        const finalCheckResult = await checkRoomAvailability(
            checkInDateTime, checkOutDateTime, formData.numberOfRooms, formData.bookingStatus
        );

        if (!finalCheckResult.available) {
            addToast(`Booking failed: Rooms became unavailable. Only ${finalCheckResult.availableRooms} left. Please check again.`, 'error');
            setAvailabilityResult(finalCheckResult); 
            setIsBooking(false);
            return;
        }
      
      // Prepare booking data, ensuring otherProgramTypeDescription is included
      const bookingPayload = {
        programTitle: formData.programTitle,
        programType: formData.programType,
        // Conditionally include otherProgramTypeDescription
        ...(formData.programType === 'OTHERS' && { otherProgramTypeDescription: formData.otherProgramTypeDescription }),
        numberOfRooms: formData.numberOfRooms,
        bookingStatus: formData.bookingStatus,
        startDate: checkInDateTime,
        endDate: checkOutDateTime,
        createdAt: new Date()
      };
      
      const booking = await saveBooking(bookingPayload);

      addToast('Booking successful!', 'success');
      if (onBookingAdded) onBookingAdded(booking); 
      resetForm();
    } catch (error) {
      addToast(`Error making booking: ${error.message}`, 'error');
      console.error('Error making booking:', error);
    } finally {
      setIsBooking(false);
    }
  };

  const validateForm = () => {
    if (!formData.programTitle.trim()) { addToast('Program title is required', 'error'); return false; }
    if (!formData.programType) { addToast('Please select a program type', 'error'); return false; }
    // If OTHERS is selected, description must not be empty
    if (formData.programType === 'OTHERS' && !formData.otherProgramTypeDescription.trim()) {
        addToast('Please enter a description for "OTHERS" program type.', 'error'); return false;
    }
    if (formData.numberOfRooms < 1) { addToast('Number of rooms must be at least 1', 'error'); return false; }
    if (formData.numberOfRooms > TOTAL_ROOMS) { addToast(`Number of rooms cannot exceed ${TOTAL_ROOMS}`, 'error'); return false; } 
    
    if (!dateRange.startDate || !dateRange.endDate) {
        addToast('Please select a valid date range.', 'error');
        return false;
    }

    const checkInDateTime = combineDateAndTime(dateRange.startDate, formData.checkInTime);
    const checkOutDateTime = combineDateAndTime(dateRange.endDate, formData.checkOutTime);
    if (checkInDateTime >= checkOutDateTime) { 
        addToast('Check-out date/time must be after check-in date/time', 'error'); return false; 
    }
    return true;
  };

  const resetForm = () => {
    setFormData({
      programTitle: '', programType: '', otherProgramTypeDescription: '', 
      numberOfRooms: 1, bookingStatus: 'pencil', 
      checkInTime: '14:00', checkOutTime: '11:00',
    });
    setDateRange({
      startDate: new Date(),
      endDate: new Date(new Date().setDate(new Date().getDate() + 1)),
      key: 'selection',
    });
    setAvailabilityResult(null);
  };

  return (
    <div className="card">
      <h2 className="summary-title">IIMC MDC Room Booking</h2>
      <div className="two-column">
        <div> {/* Left Column */}
          <div className="form-group">
            <label className="form-label">Program Title</label>
            <input type="text" name="programTitle" value={formData.programTitle} onChange={handleInputChange} className="form-input" placeholder="Enter program title" />
          </div>
          <div className="form-group">
            <label className="form-label">Program Type</label>
            <select name="programType" value={formData.programType} onChange={handleInputChange} className="form-select">
              <option value="">Select Program Type</option>
              {PROGRAM_TYPES.map((typeOpt) => (
                <option key={typeOpt.value} value={typeOpt.value}>{typeOpt.label}</option>
              ))}
            </select>
          </div>
          {/* Conditional input for OTHERS description */}
          {formData.programType === 'OTHERS' && (
            <div className="form-group">
              <label className="form-label">Specify Other Program Type</label>
              <input 
                type="text" 
                name="otherProgramTypeDescription" 
                value={formData.otherProgramTypeDescription} 
                onChange={handleInputChange} 
                className="form-input"
                placeholder="Enter description for OTHERS"
              />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Number of Rooms</label>
            <input type="number" name="numberOfRooms" value={formData.numberOfRooms} onChange={handleInputChange} min="1" max={TOTAL_ROOMS} className="form-input" />
            <p className="form-hint">Total available: {TOTAL_ROOMS} rooms</p>
          </div>
          <div className="form-group">
            <label className="form-label">Booking Type</label>
            <div className="radio-group">
              <label className="radio-label">
                <input type="radio" name="bookingStatus" value="pencil" checked={formData.bookingStatus === 'pencil'} onChange={handleInputChange} className="radio-input" />
                <span>Pencil</span>
              </label>
              <label className="radio-label">
                <input type="radio" name="bookingStatus" value="confirmed" checked={formData.bookingStatus === 'confirmed'} onChange={handleInputChange} className="radio-input" />
                <span>Confirmed</span>
              </label>
            </div>
          </div>
        </div>
        <div> {/* Right Column */}
          <label className="form-label">Select Date Range</label>
          <div className="date-range-wrapper">
            <DateRangePicker ranges={[dateRange]} onChange={handleDateRangeChange} minDate={new Date()} rangeColors={["#4a6fa5"]} />
          </div>
          <div className="time-selection">
            <div className="form-group">
              <label className="form-label">Check-in Time</label>
              <select name="checkInTime" value={formData.checkInTime} onChange={handleInputChange} className="form-select">
                {timeOptions.map(time => <option key={`checkin-${time}`} value={time}>{time}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Check-out Time</label>
              <select name="checkOutTime" value={formData.checkOutTime} onChange={handleInputChange} className="form-select">
                {timeOptions.map(time => <option key={`checkout-${time}`} value={time}>{time}</option>)}
              </select>
            </div>
          </div>
          <div className="date-info">
            {dateRange.startDate && dateRange.endDate && (
                <>
                    <p><span className="date-info-label">Check-in:</span> {new Date(dateRange.startDate).toLocaleDateString()} at {formData.checkInTime}</p>
                    <p><span className="date-info-label">Check-out:</span> {new Date(dateRange.endDate).toLocaleDateString()} at {formData.checkOutTime}</p>
                    <p><span className="date-info-label">Duration:</span> {calculateDuration()} days</p>
                </>
            )}
          </div>
        </div>
      </div>
      <div className="button-group">
        <button onClick={handleCheckAvailability} disabled={isChecking} className={`btn ${isChecking ? 'btn-disabled' : 'btn-primary'}`}>
          {isChecking ? <><div className="spinner"></div> Checking...</> : "Check Availability"}
        </button>
        <button onClick={handleBookRooms} disabled={isChecking || isBooking} className={`btn ${isBooking ? 'btn-disabled' : 'btn-success'}`}>
          {isBooking ? <><div className="spinner"></div> Booking...</> : "Book Now"}
        </button>
        <button onClick={resetForm} className="btn btn-secondary">Reset</button>
      </div>
      {availabilityResult && (
        <div className={`result-card ${availabilityResult.available ? 'result-success' : 'result-error'}`}>
          <h3 className="result-title">{availabilityResult.available ? 'Rooms Available!' : 'Insufficient Rooms'}</h3>
          <p>
            {availabilityResult.available 
              ? `${availabilityResult.requestedRooms} rooms are available for your selected period.` 
              : `Only ${availabilityResult.availableRooms} rooms available out of ${availabilityResult.requestedRooms} requested.`}
          </p>
          <p><span className="date-info-label">Check-in:</span> {new Date(availabilityResult.startDate).toLocaleDateString()} at {availabilityResult.checkInTime}</p>
          <p><span className="date-info-label">Check-out:</span> {new Date(availabilityResult.endDate).toLocaleDateString()} at {availabilityResult.checkOutTime}</p>
          {availabilityResult.dailyAvailability && (
            <div className="daily-availability">
              <h4 className="daily-title">Daily Availability During This Period:</h4>
              <div className="daily-grid">
                {Object.entries(availabilityResult.dailyAvailability).map(([date, available]) => (
                  <div key={date} className="daily-item">
                    <span className="daily-date">{date}</span>
                    <span className="daily-rooms">{available} rooms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BookingForm;