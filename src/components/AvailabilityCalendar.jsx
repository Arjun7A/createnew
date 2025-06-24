// src/components/AvailabilityCalendar.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { getConsolidatedBookingsForDisplay } from '../services/availabilityService';
import { TOTAL_ROOMS, PROGRAM_TYPES } from '../constants';

// Import @react-pdf/renderer components
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer';

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

// --- Helper Functions ---
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

// --- PDF Calendar Stylesheet ---
const pdfCalStyles = StyleSheet.create({
  page: { flexDirection: 'column', padding: 30, backgroundColor: '#FFFFFF', fontFamily: 'Helvetica' },
  header: { fontSize: 20, marginBottom: 15, textAlign: 'center', fontWeight: 'bold', borderBottomWidth: 2, borderBottomColor: '#333333', paddingBottom: 5 },
  subHeader: { fontSize: 16, marginTop: 10, marginBottom: 10, fontWeight: 'bold' },
  table: { display: 'table', width: 'auto', borderStyle: 'solid', borderWidth: 1, borderColor: '#bfbfbf', marginBottom: 10 },
  tableRow: { flexDirection: 'row' },
  tableColHeader: { width: '14.28%', borderStyle: 'solid', borderWidth: 1, borderColor: '#bfbfbf', backgroundColor: '#e0e0e0', padding: 5, fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
  tableCol: { width: '14.28%', borderStyle: 'solid', borderWidth: 1, borderColor: '#bfbfbf', padding: 5, fontSize: 9, minHeight: 80, alignItems: 'flex-start' },
  dayNumber: { fontSize: 11, fontWeight: 'bold', marginBottom: 5, alignSelf: 'flex-end', paddingRight: 5 },
  eventText: { fontSize: 7.5, lineHeight: 1.3, marginBottom: 2, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 2, marginVertical: 1 },
  eventConfirmed: { backgroundColor: '#cce5ff', color: '#004085' },
  eventPencil: { backgroundColor: '#fff0b3', color: '#66512c' },
  pageNumber: { position: 'absolute', fontSize: 10, bottom: 20, left: 0, right: 0, textAlign: 'center', color: 'grey' },
});

// --- PDF Calendar Document Component ---
const CalendarPdfDocument = ({ calendarEvents, currentCalDate, totalRooms }) => {
  const startOfMonth = moment(currentCalDate).startOf('month');
  const startOfWeek = moment(startOfMonth).startOf('week');
  
  const daysInMonthGrid = useMemo(() => {
    let days = [];
    let day = startOfWeek.clone();
    for(let i=0; i<42; i++) { // Always render 6 weeks for consistent layout
        days.push(day.clone());
        day.add(1, 'day');
    }
    return days;
  }, [currentCalDate]);

  const eventsGroupedByDay = useMemo(() => {
    const grouped = {};
    calendarEvents.forEach(event => {
      let currentDay = moment(event.start).startOf('day');
      const endDay = moment(event.end).startOf('day');
      while (currentDay.isBefore(endDay)) {
        const key = currentDay.format('YYYY-MM-DD');
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(event);
        currentDay.add(1, 'day');
      }
    });
    return grouped;
  }, [calendarEvents]);


  return (
    <Document>
      <Page size="A4" orientation="landscape" style={pdfCalStyles.page}>
        <Text style={pdfCalStyles.header}>Room Booking Calendar: {moment(currentCalDate).format('MMMM YYYY')}</Text>
        <Text style={pdfCalStyles.subHeader}>Total Rooms: {totalRooms}</Text>

        <View style={pdfCalStyles.table}>
          <View style={pdfCalStyles.tableRow}>
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => (
              <Text style={pdfCalStyles.tableColHeader} key={day}>{day}</Text>
            ))}
          </View>

          {daysInMonthGrid.reduce((acc, day, index) => {
            if (index % 7 === 0) acc.push([]);
            acc[acc.length - 1].push(day);
            return acc;
          }, []).map((week, weekIndex) => (
            <View style={pdfCalStyles.tableRow} key={weekIndex}>
              {week.map(day => {
                const dayKey = day.format('YYYY-MM-DD');
                const dayEvents = eventsGroupedByDay[dayKey] || [];
                const isCurrentMonth = day.isSame(currentCalDate, 'month');

                return (
                  <View style={[pdfCalStyles.tableCol, !isCurrentMonth && {backgroundColor: '#f8f8f8'}]} key={day.format('YYYY-MM-DD')} wrap={false}>
                    <Text style={pdfCalStyles.dayNumber}>{day.date()}</Text>
                    {dayEvents.map(event => (
                      <Text key={event.id} style={[ pdfCalStyles.eventText, event.resource.bookingStatus === 'confirmed' ? pdfCalStyles.eventConfirmed : pdfCalStyles.eventPencil ]}>
                        {`${event.resource.programTitle} (${event.resource.numberOfRooms}R)`}
                      </Text>
                    ))}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <Text style={pdfCalStyles.pageNumber} fixed render={({ pageNumber, totalPages }) => (`Page ${pageNumber} of ${totalPages}`)} />
      </Page>
    </Document>
  );
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
        const events = displayBookings.map(booking => ({
          id: booking.id,
          title: `${booking.programTitle} (${getDisplayProgramTypeForCalendar(booking)}, ${booking.numberOfRooms} rooms) - ${booking.bookingStatus}`,
          start: new Date(booking.startDate),       
          end: new Date(booking.endDate),     
          allDay: true, 
          resource: booking 
        }));
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
        if (toolbar.view === Views.WEEK) return `${moment(toolbar.date).startOf('week').format('MMM D')} – ${moment(toolbar.date).endOf('week').format('MMM D, YYYY')}`;
        return date.format('dddd, MMM D, YYYY');
    };

    const currentYear = moment(toolbar.date).year();
    const currentMonth = moment(toolbar.date).month();
    const years = Array.from({length: 7}, (_, i) => currentYear - 3 + i);
    const months = moment.months();

    const handleYearChange = (e) => toolbar.onNavigate('DATE', new Date(parseInt(e.target.value, 10), currentMonth, 1));
    const handleMonthChange = (e) => toolbar.onNavigate('DATE', new Date(currentYear, parseInt(e.target.value, 10), 1));
    
    const eventsForPdf = useMemo(() => {
        const startOfMonth = moment(toolbar.date).startOf('month');
        const endOfMonth = moment(toolbar.date).endOf('month');
        return calendarEvents.filter(event => moment(event.start).isSameOrBefore(endOfMonth, 'day') && moment(event.end).isSameOrAfter(startOfMonth, 'day'));
    }, [toolbar.date, calendarEvents]);

    return (
      <div className="rbc-toolbar elegant-toolbar">
        <div className="rbc-btn-group">
          <button type="button" onClick={goToCurrent} className="btn btn-outline">Today</button>
          <button type="button" onClick={goToBack} className="btn btn-outline">‹</button>
          <button type="button" onClick={goToNext} className="btn btn-outline">›</button>
        </div>
        <span className="rbc-toolbar-label">{label()}</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5em', marginLeft: '1em' }}>
          <div className="toolbar-select-wrapper">
            <select value={currentYear} onChange={handleYearChange}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
          </div>
          <div className="toolbar-select-wrapper">
            <select value={currentMonth} onChange={handleMonthChange}>{months.map((m, idx) => <option key={m} value={idx}>{m}</option>)}</select>
          </div>
        </div>
        <div className="rbc-btn-group" style={{marginLeft: 'auto', gap: '10px'}}> {/* Adjusted: Added gap for spacing */}
          <PDFDownloadLink
            document={<CalendarPdfDocument calendarEvents={eventsForPdf} currentCalDate={toolbar.date} totalRooms={TOTAL_ROOMS} />}
            fileName={`Calendar_${moment(toolbar.date).format('YYYY-MM')}.pdf`}
            className="btn-pdf-download"
          >
            {({ loading }) => (loading ? 'Generating...' : 'Download PDF')}
          </PDFDownloadLink>
          {[{view:Views.MONTH,label:'Month'},{view:Views.WEEK,label:'Week'},{view:Views.DAY,label:'Day'},{view:Views.AGENDA,label:'Agenda'}].map(item=>(
            <button key={item.view} type="button" className={`btn btn-outline ${toolbar.view===item.view?'rbc-active':''}`} onClick={()=>toolbar.onView(item.view)}>{item.label}</button>
          ))}
        </div>
      </div>
    );
  }, [calendarEvents]);

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
