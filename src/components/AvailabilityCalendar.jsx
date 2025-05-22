// src/components/AvailabilityCalendar.jsx
import React, { useState, useEffect } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { getConsolidatedBookingsForDisplay } from '../services/availabilityService';
import { TOTAL_ROOMS } from '../constants'; // Import TOTAL_ROOMS

const localizer = momentLocalizer(moment);

const AvailabilityCalendar = ({ refreshTrigger, onDateSelect }) => {
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(Views.MONTH);
  const [date, setDate] = useState(new Date());

  useEffect(() => {
    fetchAndSetCalendarEvents();
  }, [refreshTrigger]);

  const fetchAndSetCalendarEvents = () => {
    setLoading(true);
    try {
      const displayBookings = getConsolidatedBookingsForDisplay();
      const events = displayBookings.map(booking => ({
        id: booking.id,
        title: `${booking.programTitle} (${booking.numberOfRooms} rooms) - ${booking.bookingStatus}`,
        start: new Date(booking.startDate),
        end: new Date(booking.endDate),
        allDay: false, 
        resource: booking 
      }));
      setCalendarEvents(events);
    } catch (error) {
      console.error('Error fetching consolidated bookings for calendar:', error);
    } finally {
      setLoading(false);
    }
  };

  const eventStyleGetter = (event) => {
    const isConfirmed = event.resource.bookingStatus === 'confirmed'; 
    return {
      style: {
        backgroundColor: isConfirmed ? '#4a6fa5' : '#ffc43d', 
        borderRadius: '4px',
        opacity: 0.9,
        color: isConfirmed ? 'white' : 'black',
        border: '0',
        display: 'block',
        padding: '2px 4px',
        fontSize: '0.8em'
      }
    };
  };
  
  const handleNavigate = (newDate) => { setDate(newDate); };
  const handleViewChange = (newView) => { setView(newView); };
  
  const handleSelectSlot = ({ start, end, action }) => {
    if (onDateSelect) {
      let adjustedEnd = new Date(end);
      if (action === 'select' && start.toDateString() !== end.toDateString()) {
        adjustedEnd.setDate(adjustedEnd.getDate() -1); 
      }
       if (adjustedEnd < start) adjustedEnd = new Date(start); 

      onDateSelect({ startDate: start, endDate: adjustedEnd, action: action });
    }
  };

  return (
    <div className="card calendar-card">
      <h2 className="summary-title">Room Availability Calendar</h2>
      <p className="calendar-instructions">
        Displays confirmed bookings. Pencil bookings are shown if total daily occupancy doesn't exceed {TOTAL_ROOMS}. {/* Use imported constant */}
      </p>
      
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '500px' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '4px', borderTopColor: '#4a6fa5' }}></div>
        </div>
      ) : (
        <Calendar
          localizer={localizer}
          events={calendarEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 500 }}
          eventPropGetter={eventStyleGetter}
          views={[Views.MONTH, Views.WEEK, Views.DAY]}
          view={view}
          onView={handleViewChange}
          date={date}
          onNavigate={handleNavigate}
          selectable
          onSelectSlot={handleSelectSlot}
          tooltipAccessor={(event) => 
            `${event.title}\nCheck-in: ${moment(event.start).format('MMM DD, YYYY hh:mm A')}\nCheck-out: ${moment(event.end).format('MMM DD, YYYY hh:mm A')}`
          }
          popup
        />
      )}
    </div>
  );
};

export default AvailabilityCalendar;