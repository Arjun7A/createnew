// src/components/AvailabilityCalendar.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { getConsolidatedBookingsForDisplay } from '../services/availabilityService';
import { TOTAL_ROOMS, PROGRAM_TYPES } from '../constants';

const localizer = momentLocalizer(moment); 

const PROGRAM_TYPE_BASE_COLORS = {
  OPEN_LDP: '#4A90E2', 
  CUSTOM_LDP: '#50E3C2', 
  OPEN_MDP: '#F5A623', 
  CTP: '#9013FE', 
  INSTITUTIONAL_BOOKINGS: '#3498DB',
  OTHER_BOOKINGS: '#7F8C8D', 
  DEFAULT: '#34495E'
};

const getTextColorForBackground = (hexColor) => {
    if (!hexColor || hexColor.length < 7) return '#FFFFFF';
    try {
        const r = parseInt(hexColor.slice(1,3),16), g = parseInt(hexColor.slice(3,5),16), b = parseInt(hexColor.slice(5,7),16);
        return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#2c3e50' : '#FFFFFF';
    } catch(e) { return '#FFFFFF'; }
};

const getDisplayProgramTypeForCalendar = (booking) => { 
    const mainTypeObj = PROGRAM_TYPES.find(pt => pt.value === booking.programType);
    let displayType = mainTypeObj ? mainTypeObj.label : (booking.programType || 'N/A');

    if (booking.programType === 'OTHER_BOOKINGS' && booking.otherBookingCategory) {
      displayType = `${mainTypeObj.label}: ${booking.otherBookingCategory}`;
    } else if (booking.programType === 'INSTITUTIONAL_BOOKINGS' && booking.institutionalBookingDetails) {
      displayType = `${mainTypeObj.label}: ${booking.institutionalBookingDetails}`;
    }
    return displayType;
};

const AvailabilityCalendar = ({ refreshTrigger, onDateSelect }) => {
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(Views.MONTH);
  const [currentCalDate, setCurrentCalDate] = useState(new Date()); 

  const fetchAndSetCalendarEvents = useCallback(async () => {
    setLoading(true);
    try {
      const displayBookings = await getConsolidatedBookingsForDisplay(); 
      if (Array.isArray(displayBookings)) {
        const events = displayBookings.map(booking => {
          return {
              id: booking.id,
              title: `${booking.programTitle} (${getDisplayProgramTypeForCalendar(booking)}, ${booking.numberOfRooms} rooms) - ${booking.bookingStatus}`,
              start: new Date(booking.startDate),       
              end: new Date(booking.endDate),     
              allDay: true, 
              resource: booking 
          };
        });
        setCalendarEvents(events);
      } else {
        setCalendarEvents([]);
      }
    } catch (error) { 
      console.error('Error fetching calendar bookings:', error); 
      setCalendarEvents([]);
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAndSetCalendarEvents(); }, [refreshTrigger, fetchAndSetCalendarEvents]);

  const eventStyleGetter = (event) => { 
    const programType = event.resource.programType;
    const isConfirmed = event.resource.bookingStatus === 'confirmed';
    const baseColor = PROGRAM_TYPE_BASE_COLORS[programType] || PROGRAM_TYPE_BASE_COLORS.DEFAULT;
    let backgroundColor = baseColor, textColor = getTextColorForBackground(baseColor), border = `1px solid ${baseColor}`, opacity = 0.95, boxShadow = 'var(--shadow-sm)';
    if (!isConfirmed) { 
      opacity = 0.70; border = `1px dashed ${baseColor}`; 
      if (programType === 'OPEN_MDP' || programType === 'OTHER_BOOKINGS') textColor = '#2c3e50';
    }
    return { style: { backgroundColor, borderRadius: 'var(--radius-sm)', opacity, color: textColor, border, boxShadow, padding: '3px 5px', fontSize: '0.78em', lineHeight: '1.3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }};
  };

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
    const goToBack=()=>toolbar.onNavigate('PREV'),goToNext=()=>toolbar.onNavigate('NEXT'),goToCurrent=()=>toolbar.onNavigate('TODAY',new Date());
    const label = () => {
        const date = moment(toolbar.date);
        if (toolbar.view === Views.MONTH) return date.format('MMMM YYYY');
        if (toolbar.view === Views.WEEK) {
            const firstDayOfWeek = date.clone().startOf('week');
            const lastDayOfWeek = date.clone().endOf('week');
            if (firstDayOfWeek.month() === lastDayOfWeek.month()) {
                return `${firstDayOfWeek.format('MMM D')} – ${lastDayOfWeek.format('D, YYYY')}`;
            }
            return `${firstDayOfWeek.format('MMM D')} – ${lastDayOfWeek.format('MMM D, YYYY')}`;
        }
        if (toolbar.view === Views.DAY) return date.format('dddd, MMM D, YYYY');
        if (toolbar.view === Views.AGENDA) return date.format('dddd, MMM D, YYYY') + ' (Agenda)';
        return date.format('MMMM YYYY');
    };

    // Year and Month dropdown logic
    const currentYear = moment(toolbar.date).year();
    const currentMonth = moment(toolbar.date).month();
    const years = [];
    for (let y = currentYear - 3; y <= currentYear + 3; y++) years.push(y);
    const months = moment.months();

    const handleYearChange = (e) => {
      const newYear = parseInt(e.target.value, 10);
      toolbar.onNavigate('DATE', new Date(newYear, currentMonth, 1));
    };
    const handleMonthChange = (e) => {
      const newMonth = parseInt(e.target.value, 10);
      toolbar.onNavigate('DATE', new Date(currentYear, newMonth, 1));
    };

    return (
      <div className="rbc-toolbar elegant-toolbar">
        <div className="rbc-btn-group">
          <button type="button" onClick={goToCurrent} className="btn btn-outline">Today</button>
          <button type="button" onClick={goToBack} className="btn btn-outline">‹</button>
          <button type="button" onClick={goToNext} className="btn btn-outline">›</button>
        </div>
        <span className="rbc-toolbar-label">{label()}</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5em', marginLeft: '1em' }}>
          <select value={currentYear} onChange={handleYearChange} style={{ padding: '2px 6px' }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={currentMonth} onChange={handleMonthChange} style={{ padding: '2px 6px' }}>
            {months.map((m, idx) => <option key={m} value={idx}>{m}</option>)}
          </select>
        </div>
        <div className="rbc-btn-group">
          {[{view:Views.MONTH,label:'Month'},{view:Views.WEEK,label:'Week'},{view:Views.DAY,label:'Day'},{view:Views.AGENDA,label:'Agenda'}].map(item=>(
            <button key={item.view} type="button" className={`btn btn-outline ${toolbar.view===item.view?'rbc-active':''}`} onClick={()=>toolbar.onView(item.view)}>{item.label}</button>
          ))}
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
          localizer={localizer} events={calendarEvents} startAccessor="start" endAccessor="end"    
          style={{ height: 550 }} eventPropGetter={eventStyleGetter}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          view={view} onView={handleViewChange} date={currentCalDate} onNavigate={handleNavigate} 
          selectable onSelectSlot={handleSelectSlot}
          tooltipAccessor={(event) => {
            const startDateStr=moment.utc(event.start).format('ddd, MMM DD, YYYY');
            const inclusiveEndDate = new Date(event.resource.endDate); inclusiveEndDate.setUTCDate(inclusiveEndDate.getUTCDate() - 1);
            const inclusiveEndDateStr = moment.utc(inclusiveEndDate).format('ddd, MMM DD, YYYY'); 
            return `Title: ${event.resource.programTitle}\nType: ${getDisplayProgramTypeForCalendar(event.resource)}\nRooms: ${event.resource.numberOfRooms}\nStatus: ${event.resource.bookingStatus}\nCheck-in: ${startDateStr}\nLast Night: ${inclusiveEndDateStr} (Check-out: ${moment.utc(event.resource.endDate).format('ddd, MMM DD, YYYY')})`;
          }}
          popup components={components}
          formats={{
              monthHeaderFormat: date => moment(date).format('MMMM YYYY'),
              weekdayFormat: (date, culture, local) => local.format(date, 'ddd', culture),
              dayHeaderFormat: date => moment(date).format('dddd, MMM D'),
              agendaHeaderFormat:({start,end})=>`${moment(start).format('ddd, MMM DD')} – ${moment(moment(end).toDate()).subtract(1,'day').format('ddd, MMM DD')}`,
              dayRangeHeaderFormat: ({ start, end }, culture, local) => 
                local.format(start, 'ddd, MMM D', culture) + ' – ' + local.format(end, 'ddd, MMM D', culture),
          }} 
          longPressThreshold={250} messages={{showMore:total=>`+ ${total} more bookings`}} />
      )}
    </div>
  );
};
export default AvailabilityCalendar;
