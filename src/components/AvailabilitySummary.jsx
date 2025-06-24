// src/components/AvailabilitySummary.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getAllBookings } from '../services/availabilityService'; 
import { TOTAL_ROOMS, ROOM_TYPES, getTotalRoomsForType, getTotalRoomsAllTypes } from '../constants';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

const AvailabilitySummary = ({ refreshTrigger }) => {
  const getInitialLocalDate = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
  const [selectedLocalDate, setSelectedLocalDate] = useState(getInitialLocalDate());
  const [selectedRoomType, setSelectedRoomType] = useState('ALL'); // Summary shows ALL room types by default

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
    dateChecked: formatDateForDisplay(convertLocalToUTCDate(getInitialLocalDate())),
    roomType: 'ALL'
  });
  const [loadingSummary, setLoadingSummary] = useState(false);

  const updateSummaryForDay = useCallback(async () => {
    if (!selectedLocalDate) return; 
    setLoadingSummary(true);
    const selectedUTCDay = convertLocalToUTCDate(selectedLocalDate); 
    if (!selectedUTCDay) { setLoadingSummary(false); return; } 

    try {
        const allBookings = await getAllBookings(); 
        if (Array.isArray(allBookings)) {
            // Calculate totals based on room type selection
            const totalRoomsForSelectedType = selectedRoomType === 'ALL' ? 
              ROOM_TYPES.reduce((sum, rt) => sum + rt.totalRooms, 0) : 
              getTotalRoomsForType(selectedRoomType);
            
            let roomsBookedOnSelectedDay = 0;
            allBookings.forEach(booking => {
              // Filter by room type if not 'ALL'
              if (selectedRoomType !== 'ALL' && booking.roomType !== selectedRoomType) {
                return;
              }
              
              const startDate = new Date(booking.startDate);
              const endDate = new Date(booking.endDate);
              if (startDate && endDate && 
                  selectedUTCDay.getTime() >= startDate.getTime() && 
                  selectedUTCDay.getTime() < endDate.getTime()) {
                roomsBookedOnSelectedDay += booking.numberOfRooms;
              }
            });
            
            const availableRoomsOnDay = totalRoomsForSelectedType - roomsBookedOnSelectedDay;
            setSummaryData({
              totalRooms: totalRoomsForSelectedType, 
              bookedForDay: roomsBookedOnSelectedDay, 
              availableForDay: availableRoomsOnDay,
              dateChecked: formatDateForDisplay(selectedUTCDay),
              roomType: selectedRoomType
            });
        }
    } catch(error) {
        console.error("Error updating summary:", error);
    } finally {
        setLoadingSummary(false);
    }
  }, [selectedLocalDate, selectedRoomType]); 

  useEffect(() => { updateSummaryForDay(); }, [selectedLocalDate, selectedRoomType, refreshTrigger, updateSummaryForDay]);

  const handleDateChange = (localDateFromPicker) => {
    setSelectedLocalDate(localDateFromPicker ? new Date(localDateFromPicker) : getInitialLocalDate());
  };

  const availabilityPercentage = summaryData.totalRooms > 0 ? (summaryData.availableForDay / summaryData.totalRooms) * 100 : 0;

  return (
    <div className="card summary-card elegant-summary">
      <h2 className="form-section-title">Daily Room Availability Snapshot</h2>
      <div className="grid grid-halves">
        <div className="form-group">
          <label htmlFor="summary-date-picker" className="form-label">Select Date:</label>
          <DatePicker selected={selectedLocalDate} onChange={handleDateChange}
            className="form-input" dateFormat="MMMM d, yyyy" id="summary-date-picker" popperPlacement="bottom-start" />
        </div>
        <div className="form-group">
          <label className="form-label">Room Type:</label>
          <select 
            value={selectedRoomType} 
            onChange={(e) => setSelectedRoomType(e.target.value)}
            className="form-select"
          >
            <option value="ALL">All Room Types</option>
            {ROOM_TYPES.map(rt => (
              <option key={rt.value} value={rt.value}>{rt.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="date-range-display" style={{ marginTop: '15px', textAlign: 'center' }}>
        <p><span className="date-info-label">Showing For: </span>
           <span className="date-info-value highlight">{summaryData.dateChecked}</span>
           {summaryData.roomType !== 'ALL' && (
             <span className="date-info-label"> - {ROOM_TYPES.find(rt => rt.value === summaryData.roomType)?.label}</span>
           )}
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
