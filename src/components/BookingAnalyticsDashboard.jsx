import React, { useState, useEffect } from 'react';
import { getBookingsInPeriod } from '../services/availabilityService';
import { TOTAL_ROOMS, PROGRAM_TYPES } from '../constants';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS_PIE = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A233FF', '#FF33A8', '#33FFA2', '#E2A0FF', '#A0E2FF', '#FFA0E2'];
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

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getDateArray(start, end) {
  const arr = [];
  let dt = new Date(start);
  dt.setHours(0,0,0,0);
  end = new Date(end);
  end.setHours(0,0,0,0);
  while (dt <= end) {
    arr.push(new Date(dt));
    dt.setDate(dt.getDate() + 1);
  }
  return arr;
}

const BookingAnalyticsDashboard = () => {
  // Filters
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

  // Data
  const [filteredBookings, setFilteredBookings] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch bookings based on filter
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      let periodStart, periodEnd;
      if (viewMode === 'day') {
        periodStart = new Date(selectedDate);
        periodEnd = new Date(selectedDate);
      } else if (viewMode === 'month') {
        periodStart = new Date(selectedYear, selectedMonth, 1);
        periodEnd = new Date(selectedYear, selectedMonth, getDaysInMonth(selectedYear, selectedMonth));
      } else if (viewMode === 'year') {
        periodStart = new Date(selectedYear, 0, 1);
        periodEnd = new Date(selectedYear, 11, 31);
      } else if (viewMode === 'dateRange') {
        periodStart = new Date(rangeStartDate);
        periodEnd = new Date(rangeEndDate);
      } else if (viewMode === 'monthRange') {
        periodStart = new Date(rangeStartYear, rangeStartMonth, 1);
        periodEnd = new Date(rangeEndYear, rangeEndMonth, getDaysInMonth(rangeEndYear, rangeEndMonth));
      }
      let bookings = await getBookingsInPeriod(periodStart, new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate() + 1));
      if (programType) {
        bookings = bookings.filter(b => b.program_type === programType);
      }
      setFilteredBookings(bookings);
      setLoading(false);
    };
    fetchData();
  }, [programType, viewMode, selectedDate, selectedMonth, selectedYear, rangeStartDate, rangeEndDate, rangeStartMonth, rangeStartYear, rangeEndMonth, rangeEndYear]);

  // --- Correct Occupancy Calculation ---
  let periodStart, periodEnd;
  if (viewMode === 'day') {
    periodStart = new Date(selectedDate);
    periodEnd = new Date(selectedDate);
  } else if (viewMode === 'month') {
    periodStart = new Date(selectedYear, selectedMonth, 1);
    periodEnd = new Date(selectedYear, selectedMonth, getDaysInMonth(selectedYear, selectedMonth));
  } else if (viewMode === 'year') {
    periodStart = new Date(selectedYear, 0, 1);
    periodEnd = new Date(selectedYear, 11, 31);
  } else if (viewMode === 'dateRange') {
    periodStart = new Date(rangeStartDate);
    periodEnd = new Date(rangeEndDate);
  } else if (viewMode === 'monthRange') {
    periodStart = new Date(rangeStartYear, rangeStartMonth, 1);
    periodEnd = new Date(rangeEndYear, rangeEndMonth, getDaysInMonth(rangeEndYear, rangeEndMonth));
  }
  const daysArray = getDateArray(periodStart, periodEnd);
  let roomDaysBooked = 0;
  daysArray.forEach(day => {
    const roomsBooked = filteredBookings.reduce((sum, b) => {
      const start = new Date(b.start_date);
      const end = new Date(b.end_date);
      if (start <= day && end > day) {
        return sum + (b.number_of_rooms || 0);
      }
      return sum;
    }, 0);
    roomDaysBooked += roomsBooked;
  });
  const totalRoomDays = daysArray.length * TOTAL_ROOMS;
  const occupancyRate = totalRoomDays > 0 ? (roomDaysBooked / totalRoomDays) * 100 : 0;

  // 1. Peak Booking Days/Months
  const bookingsByDay = {};
  const bookingsByMonth = {};
  filteredBookings.forEach(b => {
    const start = new Date(b.start_date);
    const end = new Date(b.end_date);
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      bookingsByDay[key] = (bookingsByDay[key] || 0) + (b.number_of_rooms || 0);
      const monthKey = `${d.getFullYear()}-${d.getMonth() + 1}`;
      bookingsByMonth[monthKey] = (bookingsByMonth[monthKey] || 0) + (b.number_of_rooms || 0);
    }
  });
  const peakDay = Object.entries(bookingsByDay).sort((a, b) => b[1] - a[1])[0];
  const peakMonth = Object.entries(bookingsByMonth).sort((a, b) => b[1] - a[1])[0];

  // 2. Average Booking Duration
  const avgDuration = filteredBookings.length > 0 ?
    (filteredBookings.reduce((sum, b) => sum + ((new Date(b.end_date) - new Date(b.start_date)) / (1000 * 60 * 60 * 24)), 0) / filteredBookings.length).toFixed(2) : 0;

  // 3. Repeat Bookers (by institutional_booking_details or other field if available)
  const bookerCounts = {};
  filteredBookings.forEach(b => {
    const key = b.institutional_booking_details || b.other_booking_category || 'Unknown';
    bookerCounts[key] = (bookerCounts[key] || 0) + 1;
  });
  const repeatBookers = Object.entries(bookerCounts).filter(([k, v]) => v > 1);

  // 4. Room Utilization Rate (overall)
  const utilizationRate = occupancyRate;

  // 5. Booking Status Breakdown
  const statusCounts = {};
  filteredBookings.forEach(b => {
    statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
  });
  const statusData = Object.entries(statusCounts).map(([k, v]) => ({ name: k, value: v }));

  // 6. Program Type Trends Over Time
  const programTypeTrends = {};
  filteredBookings.forEach(b => {
    const start = new Date(b.start_date);
    const monthKey = `${start.getFullYear()}-${start.getMonth() + 1}`;
    if (!programTypeTrends[monthKey]) programTypeTrends[monthKey] = {};
    programTypeTrends[monthKey][b.program_type] = (programTypeTrends[monthKey][b.program_type] || 0) + 1;
  });
  const trendData = Object.keys(programTypeTrends).sort().map(monthKey => {
    const entry = { month: monthKey };
    PROGRAM_TYPES.forEach(pt => {
      entry[pt.label] = programTypeTrends[monthKey][pt.value] || 0;
    });
    return entry;
  });

  // 7. Institutional vs. Other Bookings
  const institutionalCount = filteredBookings.filter(b => b.program_type === 'INSTITUTIONAL_BOOKINGS').length;
  const otherCount = filteredBookings.length - institutionalCount;

  // 8. Booking Distribution by Number of Rooms
  const roomsDist = {};
  filteredBookings.forEach(b => {
    roomsDist[b.number_of_rooms] = (roomsDist[b.number_of_rooms] || 0) + 1;
  });
  const roomsDistData = Object.entries(roomsDist).map(([k, v]) => ({ rooms: k, count: v }));

  // 9. Top Programs by Bookings
  const programTitleCounts = {};
  filteredBookings.forEach(b => {
    programTitleCounts[b.program_title] = (programTitleCounts[b.program_title] || 0) + 1;
  });
  const topPrograms = Object.entries(programTitleCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Program type breakdown for pie chart
  const programTypeCounts = PROGRAM_TYPES.map(pt => ({
    name: pt.label,
    value: filteredBookings.filter(b => b.program_type === pt.value).length
  })).filter(pt => pt.value > 0);

  // Rooms booked per day/month/year for bar chart
  let timeSeries = [];
  if (viewMode === 'day') {
    timeSeries = [{ name: selectedDate.toLocaleDateString(), rooms: filteredBookings.reduce((sum, b) => sum + (b.number_of_rooms || 0), 0) }];
  } else if (viewMode === 'month') {
    const days = getDaysInMonth(selectedYear, selectedMonth);
    for (let d = 1; d <= days; d++) {
      const date = new Date(selectedYear, selectedMonth, d);
      const rooms = filteredBookings.filter(b => {
        const start = new Date(b.start_date);
        const end = new Date(b.end_date);
        return start <= date && end > date;
      }).reduce((sum, b) => sum + (b.number_of_rooms || 0), 0);
      timeSeries.push({ name: d.toString(), rooms });
    }
  }

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
      {/* Summary */}
      <div className="stats-summary-text">
        <p><span className="stat-label">Total Bookings:</span> <span className="stat-value">{filteredBookings.length}</span></p>
        <p><span className="stat-label">Total Room-Days Booked:</span> <span className="stat-value">{roomDaysBooked}</span></p>
        <p><span className="stat-label">Occupancy Rate:</span> <span className="stat-value">{occupancyRate.toFixed(1)}%</span></p>
        <p><span className="stat-label">Peak Day:</span> <span className="stat-value">{peakDay ? `${peakDay[0]} (${peakDay[1]} rooms)` : 'N/A'}</span></p>
        <p><span className="stat-label">Peak Month:</span> <span className="stat-value">{peakMonth ? `${peakMonth[0]} (${peakMonth[1]} rooms)` : 'N/A'}</span></p>
        <p><span className="stat-label">Avg. Booking Duration:</span> <span className="stat-value">{avgDuration} days</span></p>
      </div>
      {/* Charts */}
      <div className="charts-container">
        <h4>Booking Status Breakdown</h4>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
              {statusData.map((entry, index) => (
                <Cell key={`cell-status-${index}`} fill={COLORS_PIE[index % COLORS_PIE.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        <h4>Program Type Breakdown</h4>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={programTypeCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
              {programTypeCounts.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS_PIE[index % COLORS_PIE.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
        <h4>Rooms Booked Over Time</h4>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={timeSeries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="rooms" fill="#8884d8" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Repeat Bookers & Top Programs */}
      <div className="analytics-tables">
        <div style={{display:'flex', gap:'2rem', flexWrap:'wrap'}}>
          
          <div>
            <h4>Top Programs</h4>
            <table className="elegant-table">
              <thead><tr><th>Program</th><th>Bookings</th></tr></thead>
              <tbody>
                {topPrograms.length === 0 && <tr><td colSpan={2}>None</td></tr>}
                {topPrograms.map(([title, count]) => (
                  <tr key={title}><td>{title}</td><td>{count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* Table of Bookings */}
      <h4>Filtered Bookings</h4>
      <div className="bookings-table-container">
        <table className="elegant-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Rooms</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredBookings.map(b => (
              <tr key={b.id}>
                <td>{b.program_title}</td>
                <td>{PROGRAM_TYPES.find(pt => pt.value === b.program_type)?.label || b.program_type}</td>
                <td>{b.number_of_rooms}</td>
                <td>{new Date(b.start_date).toLocaleDateString()}</td>
                <td>{new Date(b.end_date).toLocaleDateString()}</td>
                <td>{b.status}</td>
              </tr>
            ))}
            {filteredBookings.length === 0 && (
              <tr><td colSpan={6} style={{textAlign:'center'}}>No bookings found for selected filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BookingAnalyticsDashboard;