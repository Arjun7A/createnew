// src/components/AvailabilitySummary.jsx
import React, { useState, useEffect } from 'react';
import { getConfirmedBookings, getPencilBookings } from '../services/availabilityService'; 
import { TOTAL_ROOMS } from '../constants'; // Import TOTAL_ROOMS

const AvailabilitySummary = ({ refreshTrigger }) => {
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [selectedDate, setSelectedDate] = useState(todayString);
  const [summaryData, setSummaryData] = useState({
    totalRooms: TOTAL_ROOMS, // Using imported constant
    bookedForDay: 0,
    availableForDay: TOTAL_ROOMS, // Using imported constant
    dateChecked: today.toLocaleDateString()
  });

  useEffect(() => {
    const updateSummaryForDay = () => {
      if (!selectedDate) return;

      const [year, month, day] = selectedDate.split('-').map(Number);
      const dateObjForCalc = new Date(year, month - 1, day);

      const dayStart = new Date(dateObjForCalc.getFullYear(), dateObjForCalc.getMonth(), dateObjForCalc.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(dateObjForCalc.getFullYear(), dateObjForCalc.getMonth(), dateObjForCalc.getDate(), 23, 59, 59, 999);

      const confirmed = getConfirmedBookings();
      const pencils = getPencilBookings();
      const allBookingsForDay = [...confirmed, ...pencils];
      
      let roomsBookedOnSelectedDay = 0;

      allBookingsForDay.forEach(booking => {
        const bookingStart = new Date(booking.startDate);
        const bookingEnd = new Date(booking.endDate);

        if (bookingEnd > dayStart && bookingStart < dayEnd) {
            const bookingStartDateOnly = new Date(bookingStart.getFullYear(), bookingStart.getMonth(), bookingStart.getDate());
            const bookingEndDateOnly = new Date(bookingEnd.getFullYear(), bookingEnd.getMonth(), bookingEnd.getDate());
            const selectedDateOnly = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate());

            if (selectedDateOnly >= bookingStartDateOnly && selectedDateOnly <= bookingEndDateOnly) {
                roomsBookedOnSelectedDay += booking.numberOfRooms;
            }
        }
      });
      
      const availableRoomsToday = TOTAL_ROOMS - roomsBookedOnSelectedDay; // Using imported constant
      
      setSummaryData({
        totalRooms: TOTAL_ROOMS, // Using imported constant
        bookedForDay: roomsBookedOnSelectedDay, 
        availableForDay: availableRoomsToday,
        dateChecked: dateObjForCalc.toLocaleDateString()
      });
    };

    updateSummaryForDay();
  }, [selectedDate, refreshTrigger]);

  const handleDateChange = (event) => {
    setSelectedDate(event.target.value);
  };

  const availabilityPercentage = summaryData.totalRooms > 0 ? (summaryData.availableForDay / summaryData.totalRooms) * 100 : 0;
  
  return (
    <div className="card summary-card">
      <h2 className="summary-title">Daily Room Availability</h2>
      
      <div className="form-group">
        <label htmlFor="summary-date-picker" className="form-label">Select Date:</label>
        <input 
          type="date" 
          id="summary-date-picker"
          className="form-input"
          value={selectedDate}
          onChange={handleDateChange}
        />
      </div>

      <div className="date-range-display" style={{ marginTop: '15px' }}>
        <p>
          <span className="date-info-label">Showing for: </span>
          <span className="date-info-value">{summaryData.dateChecked}</span>
        </p>
      </div>
      
      <div className="summary-grid">
        <div className="summary-item summary-item-blue">
          <p className="summary-label">Total Rooms</p>
          <p className="summary-value">{summaryData.totalRooms}</p>
        </div>
        <div className="summary-item summary-item-red">
          <p className="summary-label">Booked on this Day</p>
          <p className="summary-value">{summaryData.bookedForDay}</p>
        </div>
        <div className="summary-item summary-item-green">
          <p className="summary-label">Available on this Day</p>
          <p className="summary-value">{summaryData.availableForDay}</p>
        </div>
      </div>
      
      <div className="progress-bar">
        <div 
          className="progress-value"
          style={{ width: `${availabilityPercentage}%` }}
        ></div>
      </div>
      <p className="progress-text">
        {availabilityPercentage.toFixed(1)}% rooms available on {summaryData.dateChecked}
      </p>
    </div>
  );
};
export default AvailabilitySummary;