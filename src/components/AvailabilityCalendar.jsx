// src/components/AvailabilityCalendar.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { getConsolidatedBookingsForDisplay } from '../services/availabilityService';
import { TOTAL_ROOMS, PROGRAM_TYPES, OTHER_BOOKING_CATEGORIES } from '../constants';

const localizer = momentLocalizer(moment); 

// --- UI ENHANCEMENT: Color Definitions ---
const PROGRAM_TYPE_BASE_COLORS = {
  OPEN_LDP: '#4A90E2',   // Professional Blue
  CUSTOM_LDP: '#50E3C2', // Teal / Aqua
  OPEN_MDP: '#F5A623',   // Warm Orange
  CTP: '#9013FE',        // Vibrant Purple
  OTHER_BOOKINGS: '#7F8C8D', // Neutral Grey
  DEFAULT: '#34495E'     // Dark Blue-Grey (Fallback)
};

// Helper to determine text color based on background brightness
const getTextColorForBackground = (hexColor) => {
    if (!hexColor || hexColor.length < 7) return '#FFFFFF'; // Default to white for invalid/short hex
    try {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        return luma > 150 ? '#2c3e50' : '#FFFFFF'; // Dark text on light bg, White text on dark bg
    } catch (e) {
        return '#FFFFFF'; // Fallback
    }
};
// --- END UI ENHANCEMENT: Color Definitions ---

const getDisplayProgramTypeForCalendar = (booking) => { 
    const mainTypeObj = PROGRAM_TYPES.find(pt => pt.value === booking.programType);
    let displayType = mainTypeObj ? mainTypeObj.label : (booking.programType || 'N/A');
    if (booking.programType === 'OTHER_BOOKINGS' && booking.otherBookingCategory) {
      const categoryObj = OTHER_BOOKING_CATEGORIES.find(cat => cat.value === booking.otherBookingCategory);
      if (categoryObj && categoryObj.label && categoryObj.value) { displayType = `${mainTypeObj.label}: ${categoryObj.label}`; }
      else if (booking.otherBookingCategory) { displayType = `${mainTypeObj.label}: ${booking.otherBookingCategory}`; }
    }
    return displayType;
};

const AvailabilityCalendar = ({ refreshTrigger, onDateSelect }) => {
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(Views.MONTH);
  const [currentCalDate, setCurrentCalDate] = useState(new Date()); 

  const fetchAndSetCalendarEvents = useCallback(() => {
    setLoading(true);
    try {
      const displayBookings = getConsolidatedBookingsForDisplay(); 
      const events = displayBookings.map(booking => {
        // booking.startDate and booking.endDate are UTC Date objects from service
        // booking.endDate is the INCLUSIVE last day of the event.
        
        // If you find events are one day short visually with `end: booking.endDate`, 
        // the standard RBC approach for allDay events is:
        // const exclusiveEndDate = new Date(booking.endDate);
        // exclusiveEndDate.setUTCDate(exclusiveEndDate.getUTCDate() + 1);
        // end: exclusiveEndDate,

        return {
            id: booking.id,
            title: `${booking.programTitle} (${getDisplayProgramTypeForCalendar(booking)}, ${booking.numberOfRooms} rooms) - ${booking.bookingStatus}`,
            start: booking.startDate, 
            end: booking.endDate, // Using INCLUSIVE booking.endDate as per your last provided code
            allDay: true, 
            resource: booking 
        };
      });
      setCalendarEvents(events);
    } catch (error) { console.error('Error fetching calendar bookings:', error); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAndSetCalendarEvents(); }, [refreshTrigger, fetchAndSetCalendarEvents]);

  // --- UI ENHANCEMENT: eventStyleGetter ---
  const eventStyleGetter = (event) => { 
    const programType = event.resource.programType;
    const isConfirmed = event.resource.bookingStatus === 'confirmed';
    
    const baseColor = PROGRAM_TYPE_BASE_COLORS[programType] || PROGRAM_TYPE_BASE_COLORS.DEFAULT;
    let backgroundColor = baseColor;
    let textColor = getTextColorForBackground(baseColor);
    let border = `1px solid ${baseColor}`; // Default border same as base
    let opacity = 0.95; // Slightly more opaque for confirmed
    let boxShadow = 'var(--shadow-sm)';

    if (!isConfirmed) { // Style for "Pencil" bookings
      opacity = 0.70; // More translucent for pencil
      // For pencil, you could use a lighter shade of the baseColor or a dashed border.
      // Example: Lighter border for pencil - adjust brightness/saturation carefully
      // This is a naive way to lighten, a proper color library or predefined shades would be better.
      // For simplicity, we'll use a slightly different border or just rely on opacity.
      // border = `1px dashed ${baseColor}`; 
      // Or make the border a bit more subtle for pencil
      const darkShadeForPencilBorder = moment(baseColor).isValid() ? moment(baseColor).darken(0.15).hex() : baseColor;
      border = `1px solid ${darkShadeForPencilBorder}`;

      // Ensure text color remains readable on potentially lighter/desaturated pencil backgrounds
      // If pencil background were significantly lighter, textColor might need recalculation here.
      // For now, relying on opacity primarily for pencil distinction.
      if (programType === 'OPEN_MDP' || programType === 'OTHER_BOOKINGS') { // Example: Orange and Grey might need dark text for pencil
          textColor = '#2c3e50';
      }
    }

    const style = {
      backgroundColor: backgroundColor,
      borderRadius: 'var(--radius-sm)', 
      opacity: opacity,       
      color: textColor,
      border: border, 
      boxShadow: boxShadow, 
      padding: '3px 5px',    // Fine-tuned padding
      fontSize: '0.78em',  // Slightly adjusted font size
      lineHeight: '1.3',    // Adjusted line height
      overflow: 'hidden',         // Crucial for text handling
      textOverflow: 'ellipsis',   // Shows "..." if text is too long
      whiteSpace: 'nowrap',       // Keeps event title on one line
    };
    return { style };
  };
  // --- END UI ENHANCEMENT: eventStyleGetter ---
  
  const handleNavigate = (newDate) => { setCurrentCalDate(newDate); }; 
  const handleViewChange = (newView) => { setView(newView); };
  
  const handleSelectSlot = ({ start, end, action, slots }) => { 
    if (onDateSelect) {
      let actualEndDateLocal = new Date(end);
      if ((action === 'select' || action === 'click') && slots.length >= 1) {
        if (start.getTime() !== end.getTime() || (view === Views.MONTH && action === 'click' && slots.length === 1 && moment(end).isAfter(moment(start), 'day'))) {
             actualEndDateLocal.setDate(actualEndDateLocal.getDate() - 1);
        }
      }
      if (actualEndDateLocal < start) actualEndDateLocal = new Date(start);
      const normStartLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const normEndLocal = new Date(actualEndDateLocal.getFullYear(), actualEndDateLocal.getMonth(), actualEndDateLocal.getDate());
      onDateSelect({ startDate: normStartLocal, endDate: normEndLocal, action: action });
    }
  };
  
  const CustomToolbar = useCallback((toolbar) => { 
    const goToBack = () => toolbar.onNavigate('PREV'); const goToNext = () => toolbar.onNavigate('NEXT');
    const goToCurrent = () => toolbar.onNavigate('TODAY', new Date()); const label = () => toolbar.label;
    return (
      <div className="rbc-toolbar elegant-toolbar">
        <div className="rbc-btn-group">
          <button type="button" onClick={goToCurrent} className="btn btn-outline">Today</button>
          <button type="button" onClick={goToBack} className="btn btn-outline">‹</button>
          <button type="button" onClick={goToNext} className="btn btn-outline">›</button>
        </div>
        <span className="rbc-toolbar-label">{label()}</span>
        <div className="rbc-btn-group">
          {[{ view: Views.MONTH, label: 'Month' }, { view: Views.WEEK, label: 'Week' }, { view: Views.DAY, label: 'Day' }, { view: Views.AGENDA, label: 'Agenda' }]
            .map(item => (<button key={item.view} type="button" className={`btn btn-outline ${toolbar.view === item.view ? 'rbc-active' : ''}`} onClick={() => toolbar.onView(item.view)}>{item.label}</button>))}
        </div>
      </div>
    );
  }, []); 

  const components = useMemo(() => ({ toolbar: CustomToolbar }), [CustomToolbar]);

  return (
    <div className="card calendar-card elegant-calendar-wrapper">
      <h2 className="form-section-title">Room Booking Calendar</h2>
      <p className="calendar-instructions">Displays confirmed and pencil bookings. Click/drag dates to pre-fill search. Total rooms: {TOTAL_ROOMS}.</p>
      {loading ? ( <div className="centered-spinner-container" style={{height:'400px'}}><div className="spinner-large"></div><p>Loading Calendar...</p></div> ) : (
        <Calendar
          localizer={localizer} 
          events={calendarEvents} 
          startAccessor="start" 
          endAccessor="end"    
          style={{ height: 550 }} 
          eventPropGetter={eventStyleGetter} // Applying new styles
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          view={view} onView={handleViewChange} date={currentCalDate} onNavigate={handleNavigate} 
          selectable onSelectSlot={handleSelectSlot}
          tooltipAccessor={(event) => {
            const startDateStr = moment.utc(event.start).format('MMM DD, YYYY');
            const endDateStr = moment.utc(event.resource.endDate).format('MMM DD, YYYY'); 
            return `Title: ${event.resource.programTitle}\nType: ${getDisplayProgramTypeForCalendar(event.resource)}\nRooms: ${event.resource.numberOfRooms}\nStatus: ${event.resource.bookingStatus}\nCheck-in: ${startDateStr}\nCheck-out: ${endDateStr}`;
          }}
          popup 
          components={components}
          formats={{ 
              agendaHeaderFormat: ({ start, end }) => `${moment(start).format('MMM DD')} – ${moment(end).format('MMM DD')}`,
              dayHeaderFormat: date => moment(date).format('ddd MMM DD'),
          }} 
          longPressThreshold={250}
          messages={{
            showMore: total => `+ ${total} more bookings`, // More descriptive "show more"
          }}
        />
      )}
    </div>
  );
};
export default AvailabilityCalendar;
