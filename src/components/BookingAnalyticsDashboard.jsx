import React, { useState, useEffect, useMemo } from 'react';
import { getBookingsInPeriod } from '../services/availabilityService'; // Assuming this service exists
import { TOTAL_ROOMS, PROGRAM_TYPES } from '../constants'; // Assuming these constants are defined
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// --- Constants ---
const COLORS_PIE = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A233FF', '#FF33A8'];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);

const VIEW_MODES = [
  { value: 'day', label: 'Day' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'dateRange', label: 'Date Range' },
  { value: 'monthRange', label: 'Month Range' },
];

// --- Helper Functions ---

// Timezone-safe date parser for "YYYY-MM-DD" strings
function parseDateString(dateString) {
  if (!dateString) return null;
  const parts = dateString.split('-');
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  // Creates a date at midnight in the browser's local timezone
  return new Date(year, month - 1, day);
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getDateArray(start, end) {
  const arr = [];
  if (!start || !end || start > end) return arr;
  let dt = new Date(start);
  dt.setHours(0, 0, 0, 0);
  const finalDay = new Date(end);
  finalDay.setHours(0, 0, 0, 0);

  while (dt <= finalDay) {
    arr.push(new Date(dt));
    dt.setDate(dt.getDate() + 1);
  }
  return arr;
}

// Centralized function to determine the start and end dates based on view mode
const getPeriodDates = (viewMode, dateParams) => {
  const { selectedDate, selectedYear, selectedMonth, rangeStartDate, rangeEndDate, rangeStartYear, rangeStartMonth, rangeEndYear, rangeEndMonth } = dateParams;
  let periodStart, periodEnd;
  switch (viewMode) {
    case 'day':
      periodStart = new Date(selectedDate);
      periodEnd = new Date(selectedDate);
      break;
    case 'month':
      periodStart = new Date(selectedYear, selectedMonth, 1);
      periodEnd = new Date(selectedYear, selectedMonth, getDaysInMonth(selectedYear, selectedMonth));
      break;
    case 'year':
      periodStart = new Date(selectedYear, 0, 1);
      periodEnd = new Date(selectedYear, 11, 31);
      break;
    case 'dateRange':
      periodStart = new Date(rangeStartDate);
      periodEnd = new Date(rangeEndDate);
      break;
    case 'monthRange':
      periodStart = new Date(rangeStartYear, rangeStartMonth, 1);
      periodEnd = new Date(rangeEndYear, rangeEndMonth, getDaysInMonth(rangeEndYear, rangeEndMonth));
      break;
    default:
      periodStart = new Date();
      periodEnd = new Date();
  }
  return { periodStart, periodEnd };
};


const BookingAnalyticsDashboard = () => {
  // --- State Management ---
  const [programType, setProgramType] = useState('');
  const [viewMode, setViewMode] = useState('day');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [rangeStartDate, setRangeStartDate] = useState(new Date());
  const [rangeEndDate, setRangeEndDate] = useState(new Date());
  const [rangeStartMonth, setRangeStartMonth] = useState(new Date().getMonth());
  const [rangeStartYear, setRangeStartYear] = useState(CURRENT_YEAR);
  const [rangeEndMonth, setRangeEndMonth] = useState(new Date().getMonth());
  const [rangeEndYear, setRangeEndYear] = useState(CURRENT_YEAR);

  const [filteredBookings, setFilteredBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Data Fetching Effect ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const dateParams = { selectedDate, selectedMonth, selectedYear, rangeStartDate, rangeEndDate, rangeStartMonth, rangeStartYear, rangeEndMonth, rangeEndYear };
      const { periodStart, periodEnd } = getPeriodDates(viewMode, dateParams);
      
      const queryEndDate = new Date(periodEnd);
      queryEndDate.setDate(queryEndDate.getDate() + 1);

      // Gracefully handle invalid date ranges
      if (periodStart > periodEnd) {
          setFilteredBookings([]);
          setLoading(false);
          return;
      }
      
      let bookings = await getBookingsInPeriod(periodStart, queryEndDate);
      
      if (programType) {
        bookings = bookings.filter(b => b.program_type === programType);
      }
      setFilteredBookings(bookings);
      setLoading(false);
    };
    fetchData();
  }, [programType, viewMode, selectedDate, selectedMonth, selectedYear, rangeStartDate, rangeEndDate, rangeStartMonth, rangeStartYear, rangeEndMonth, rangeEndYear]);

  // --- Memoized Analytics Calculations ---
  const analyticsData = useMemo(() => {
    const dateParams = { selectedDate, selectedMonth, selectedYear, rangeStartDate, rangeEndDate, rangeStartMonth, rangeStartYear, rangeEndMonth, rangeEndYear };
    const { periodStart, periodEnd } = getPeriodDates(viewMode, dateParams);
    const daysInPeriod = getDateArray(periodStart, periodEnd);

    if (daysInPeriod.length === 0 || filteredBookings.length === 0) {
      return { isEmpty: true, totalBookings: filteredBookings.length };
    }
    
    // --- Daily Room Count Calculation (The Core Logic) ---
    const bookingsByDay = {};
    let roomDaysBooked = 0;
    daysInPeriod.forEach(day => {
      const dayKey = day.toISOString().slice(0, 10);
      let roomsBookedOnDay = 0;
      filteredBookings.forEach(b => {
        const start = parseDateString(b.start_date);
        const end = parseDateString(b.end_date);
        // Correct logic: check-in is inclusive, check-out is exclusive
        if (start && end && day >= start && day < end) {
          roomsBookedOnDay += (b.number_of_rooms || 0);
        }
      });
      bookingsByDay[dayKey] = roomsBookedOnDay;
      roomDaysBooked += roomsBookedOnDay;
    });

    // --- All Other Metrics ---
    const totalRoomDays = daysInPeriod.length * TOTAL_ROOMS;
    const occupancyRate = totalRoomDays > 0 ? (roomDaysBooked / totalRoomDays) * 100 : 0;
    
    const bookingsByMonth = {};
    Object.entries(bookingsByDay).forEach(([dayString, roomCount]) => {
      const date = parseDateString(dayString);
      if(date) {
        const monthKey = `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
        bookingsByMonth[monthKey] = (bookingsByMonth[monthKey] || 0) + roomCount;
      }
    });

    const peakDay = Object.entries(bookingsByDay).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1])[0];
    const peakMonth = Object.entries(bookingsByMonth).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1])[0];
    
    const avgDuration = filteredBookings.length > 0 ? 
      (filteredBookings.reduce((sum, b) => {
        const start = parseDateString(b.start_date);
        const end = parseDateString(b.end_date);
        return start && end ? sum + (end - start) / (1000 * 60 * 60 * 24) : sum;
      }, 0) / filteredBookings.length).toFixed(2) : 0;

    const bookerCounts = {};
    filteredBookings.forEach(b => {
      const key = b.institutional_booking_details?.name || b.program_title || 'Unknown Booker';
      bookerCounts[key] = (bookerCounts[key] || 0) + 1;
    });
    const repeatBookers = Object.entries(bookerCounts).filter(([_, v]) => v > 1).sort((a, b) => b[1] - a[1]);

    const statusCounts = filteredBookings.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
    const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
    
    const programTypeCounts = PROGRAM_TYPES.map(pt => ({
        name: pt.label,
        value: filteredBookings.filter(b => b.program_type === pt.value).length
    })).filter(pt => pt.value > 0);
    
    const programTitleCounts = filteredBookings.reduce((acc, b) => { acc[b.program_title] = (acc[b.program_title] || 0) + 1; return acc; }, {});
    const topPrograms = Object.entries(programTitleCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

    // --- Time Series Data for Bar Chart ---
    let timeSeries = [];
    if (viewMode === 'day') {
      timeSeries = [{ name: periodStart.toLocaleDateString(), rooms: bookingsByDay[periodStart.toISOString().slice(0,10)] || 0 }];
    } else if (viewMode === 'month') {
        timeSeries = daysInPeriod.map(day => ({ name: day.getDate().toString(), rooms: bookingsByDay[day.toISOString().slice(0,10)] || 0 }));
    } else if (viewMode === 'year') {
        timeSeries = MONTH_NAMES.map((monthName, index) => {
            const key = `${monthName} ${selectedYear}`;
            return { name: monthName.slice(0,3), rooms: bookingsByMonth[key] || 0 };
        });
    } else { // For date ranges
      timeSeries = daysInPeriod.map(day => ({ name: day.toLocaleDateString('en-CA'), rooms: bookingsByDay[day.toISOString().slice(0,10)] || 0 }));
    }

    return { 
      isEmpty: false, totalBookings: filteredBookings.length, occupancyRate, roomDaysBooked, peakDay, peakMonth, avgDuration, repeatBookers, statusData, programTypeCounts, topPrograms, timeSeries 
    };
  }, [filteredBookings, viewMode, selectedDate, selectedMonth, selectedYear, rangeStartDate, rangeEndDate, rangeStartMonth, rangeStartYear, rangeEndMonth, rangeEndYear]);


  // --- Render Logic ---
  return (
    <div className="card analytics-dashboard">
      <h2 className="form-section-title">Booking Analytics</h2>
      
      {/* Filters */}
      <div className="analytics-controls">
        <div className="control-group">
          <label>Program Type:</label>
          <select value={programType} onChange={e => setProgramType(e.target.value)} className="form-select-sm">
            <option value="">All</option>
            {PROGRAM_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
          </select>
        </div>
        <div className="control-group">
          <label>View:</label>
          <select value={viewMode} onChange={e => setViewMode(e.target.value)} className="form-select-sm">
            {VIEW_MODES.map(vm => <option key={vm.value} value={vm.value}>{vm.label}</option>)}
          </select>
        </div>
        {viewMode === 'day' && (
          <div className="control-group">
            <label>Date:</label>
            <input type="date" value={selectedDate.toISOString().slice(0, 10)} onChange={e => setSelectedDate(new Date(e.target.value))} className="form-input-sm" />
          </div>
        )}
        {viewMode === 'month' && (
          <>
            <div className="control-group">
              <label>Year:</label>
              <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} className="form-select-sm">
                {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="control-group">
              <label>Month:</label>
              <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))} className="form-select-sm">
                {MONTH_NAMES.map((name, index) => <option key={index} value={index}>{name}</option>)}
              </select>
            </div>
          </>
        )}
        {viewMode === 'year' && (
          <div className="control-group">
            <label>Year:</label>
            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))} className="form-select-sm">
              {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        {viewMode === 'dateRange' && (
          <>
            <div className="control-group">
              <label>Start Date:</label>
              <input type="date" value={rangeStartDate.toISOString().slice(0, 10)} onChange={e => setRangeStartDate(new Date(e.target.value))} className="form-input-sm" />
            </div>
            <div className="control-group">
              <label>End Date:</label>
              <input type="date" value={rangeEndDate.toISOString().slice(0, 10)} onChange={e => setRangeEndDate(new Date(e.target.value))} className="form-input-sm" />
            </div>
          </>
        )}
        {viewMode === 'monthRange' && (
          <>
            <div className="control-group">
              <label>Start Month:</label>
              <select value={rangeStartYear} onChange={e => setRangeStartYear(parseInt(e.target.value))} className="form-select-sm">
                {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={rangeStartMonth} onChange={e => setRangeStartMonth(parseInt(e.target.value))} className="form-select-sm">
                {MONTH_NAMES.map((name, index) => <option key={index} value={index}>{name}</option>)}
              </select>
            </div>
            <div className="control-group">
              <label>End Month:</label>
              <select value={rangeEndYear} onChange={e => setRangeEndYear(parseInt(e.target.value))} className="form-select-sm">
                {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={rangeEndMonth} onChange={e => setRangeEndMonth(parseInt(e.target.value))} className="form-select-sm">
                {MONTH_NAMES.map((name, index) => <option key={index} value={index}>{name}</option>)}
              </select>
            </div>
          </>
        )}
      </div>

      {loading ? (
        <div className="loading-container" style={{ padding: '40px', textAlign: 'center' }}><p>Loading analytics...</p></div>
      ) : (
        <>
          {/* Summary */}
          <div className="stats-summary-text">
            <p><span className="stat-label">Total Bookings:</span> <span className="stat-value">{analyticsData.totalBookings}</span></p>
            <p><span className="stat-label">Total Room-Days Booked:</span> <span className="stat-value">{analyticsData.roomDaysBooked ?? 0}</span></p>
            <p><span className="stat-label">Occupancy Rate:</span> <span className="stat-value">{analyticsData.occupancyRate?.toFixed(1) ?? '0.0'}%</span></p>
            <p><span className="stat-label">Avg. Booking Duration:</span> <span className="stat-value">{analyticsData.avgDuration ?? 0} days</span></p>
            <p><span className="stat-label">Peak Day:</span> <span className="stat-value">{analyticsData.peakDay ? `${analyticsData.peakDay[0]} (${analyticsData.peakDay[1]} rooms)` : 'N/A'}</span></p>
            <p><span className="stat-label">Peak Month:</span> <span className="stat-value">{analyticsData.peakMonth ? `${analyticsData.peakMonth[0]} (${analyticsData.peakMonth[1]} rooms)` : 'N/A'}</span></p>
          </div>

          {/* Charts */}
          <div className="charts-container">
            {analyticsData.statusData?.length > 0 && (
              <div>
                <h4>Booking Status</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart><Pie data={analyticsData.statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>{analyticsData.statusData.map((entry, index) => <Cell key={`cell-status-${index}`} fill={COLORS_PIE[index % COLORS_PIE.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {analyticsData.programTypeCounts?.length > 0 && (
              <div>
                <h4>Program Type Breakdown</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart><Pie data={analyticsData.programTypeCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>{analyticsData.programTypeCounts.map((entry, index) => <Cell key={`cell-type-${index}`} fill={COLORS_PIE[index % COLORS_PIE.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {analyticsData.timeSeries?.length > 0 && (
              <div>
                <h4>Rooms Booked Over Time</h4>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={analyticsData.timeSeries} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="rooms" fill="#8884d8" /></BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          
          {/* Data Tables */}
          <div className="analytics-tables">
            <div>
              <h4>Top 10 Programs by Bookings</h4>
              <table className="elegant-table">
                <thead><tr><th>Program</th><th>Bookings</th></tr></thead>
                <tbody>{analyticsData.topPrograms?.length > 0 ? analyticsData.topPrograms.map(([title, count]) => (<tr key={title}><td>{title}</td><td>{count}</td></tr>)) : <tr><td colSpan={2}>No data available</td></tr>}</tbody>
              </table>
            </div>
            <div>
              <h4>Repeat Bookers</h4>
              <table className="elegant-table">
                <thead><tr><th>Booker</th><th>Bookings</th></tr></thead>
                <tbody>{analyticsData.repeatBookers?.length > 0 ? analyticsData.repeatBookers.map(([name, count]) => (<tr key={name}><td>{name}</td><td>{count}</td></tr>)) : <tr><td colSpan={2}>No repeat bookers in this period</td></tr>}</tbody>
              </table>
            </div>
          </div>

          {/* Filtered Bookings Table */}
          <h4>Filtered Booking Details</h4>
          <div className="bookings-table-container">
            <table className="elegant-table">
              <thead><tr><th>Title</th><th>Type</th><th>Rooms</th><th>Check-in</th><th>Check-out</th><th>Status</th></tr></thead>
              <tbody>
                {filteredBookings.length > 0 ? filteredBookings.map(b => (
                  <tr key={b.id}>
                    <td>{b.program_title}</td>
                    <td>{PROGRAM_TYPES.find(pt => pt.value === b.program_type)?.label || b.program_type}</td>
                    <td>{b.number_of_rooms}</td>
                    <td>{parseDateString(b.start_date)?.toLocaleDateString() ?? 'N/A'}</td>
                    <td>{parseDateString(b.end_date)?.toLocaleDateString() ?? 'N/A'}</td>
                    <td>{b.status}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} style={{textAlign:'center'}}>No bookings found for selected filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default BookingAnalyticsDashboard;
