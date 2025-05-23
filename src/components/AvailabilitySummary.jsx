// src/components/AvailabilitySummary.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getAllBookings } from '../services/availabilityService'; 
import { TOTAL_ROOMS } from '../constants';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

const AvailabilitySummary = ({ refreshTrigger }) => {
  const getInitialLocalDate = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
  const [selectedLocalDate, setSelectedLocalDate] = useState(getInitialLocalDate());

  const convertLocalToUTCDate = (localDate) => {
    if (!localDate) return null;
    return new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate()));
  };
  
  const formatDateForDisplay = (utcDate) => {
    if (!utcDate) return 'N/A';
    return new Date(utcDate).toLocaleDateString(undefined, { 
        year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' 
    });
  };

  const [summaryData, setSummaryData] = useState({ 
    totalRooms: TOTAL_ROOMS, bookedForDay: 0, availableForDay: TOTAL_ROOMS,
    dateChecked: formatDateForDisplay(convertLocalToUTCDate(getInitialLocalDate()))
  });
  const [loadingSummary, setLoadingSummary] = useState(false);

  const updateSummaryForDay = useCallback(() => {
    if (!selectedLocalDate) return; setLoadingSummary(true);
    const selectedUTCDay = convertLocalToUTCDate(selectedLocalDate); 
    if (!selectedUTCDay) { setLoadingSummary(false); return; } 

    const allBookings = getAllBookings(); 
    let roomsBookedOnSelectedDay = 0;
    allBookings.forEach(booking => {
      if (booking.startDate && booking.endDate && 
          selectedUTCDay.getTime() >= booking.startDate.getTime() && 
          selectedUTCDay.getTime() <= booking.endDate.getTime()) {
        roomsBookedOnSelectedDay += booking.numberOfRooms;
      }
    });
    const availableRoomsOnDay = TOTAL_ROOMS - roomsBookedOnSelectedDay;
    setSummaryData({
      totalRooms: TOTAL_ROOMS, bookedForDay: roomsBookedOnSelectedDay, availableForDay: availableRoomsOnDay,
      dateChecked: formatDateForDisplay(selectedUTCDay) 
    });
    setLoadingSummary(false);
  }, [selectedLocalDate]); 

  useEffect(() => { updateSummaryForDay(); }, [selectedLocalDate, refreshTrigger, updateSummaryForDay]);

  const handleDateChange = (localDateFromPicker) => {
    setSelectedLocalDate(localDateFromPicker ? new Date(localDateFromPicker) : getInitialLocalDate());
  };

  const availabilityPercentage = summaryData.totalRooms > 0 ? (summaryData.availableForDay / summaryData.totalRooms) * 100 : 0;

  return (
    <div className="card summary-card elegant-summary">
      <h2 className="form-section-title">Daily Room Availability Snapshot</h2>
      <div className="form-group">
        <label htmlFor="summary-date-picker" className="form-label">Select Date:</label>
        <DatePicker selected={selectedLocalDate} onChange={handleDateChange}
          className="form-input" dateFormat="MMMM d, yyyy" id="summary-date-picker" popperPlacement="bottom-start" />
      </div>
      <div className="date-range-display" style={{ marginTop: '15px', textAlign: 'center' }}>
        <p><span className="date-info-label">Showing For: </span>
           <span className="date-info-value highlight">{summaryData.dateChecked}</span>
        </p>
      </div>
      {loadingSummary ? ( <div className="centered-spinner-container"><div className="spinner-large"></div><p>Loading...</p></div> ) : (
        <>
            <div className="summary-grid modern-summary-grid">
                <div className="summary-item summary-item-blue"><p className="summary-label">Total Rooms</p><p className="summary-value">{summaryData.totalRooms}</p></div>
                <div className="summary-item summary-item-red"><p className="summary-label">Rooms Booked</p><p className="summary-value">{summaryData.bookedForDay}</p></div>
                <div className="summary-item summary-item-green"><p className="summary-label">Rooms Available</p><p className="summary-value">{summaryData.availableForDay}</p></div>
            </div>
            <div className="progress-bar-container">
                <div className="progress-bar-labels"><span>{summaryData.bookedForDay} Booked</span><span>{summaryData.availableForDay} Available</span></div>
                <div className="progress-bar modern-progress-bar">
                    <div className="progress-value" style={{ width: `${100 - availabilityPercentage}%`, backgroundColor: 'var(--error-color)' }}></div>
                    <div className="progress-value" style={{ width: `${availabilityPercentage}%`, backgroundColor: 'var(--success-color)' }}></div>
                </div>
                <p className="progress-text centered-text"><strong>{availabilityPercentage.toFixed(1)}%</strong> rooms available on {summaryData.dateChecked}</p>
            </div>
        </>
      )}
    </div>
  );
};
export default AvailabilitySummary;
