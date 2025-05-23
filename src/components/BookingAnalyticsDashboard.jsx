// src/components/BookingAnalyticsDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { 
    getSingleDayOccupancy, getSpecificMonthOccupancy, getMonthlyOccupancyStatsForYear,
    getYearlyOccupancyStats, getProgramTypeBreakdownForPeriod
} from '../services/availabilityService';
import { TOTAL_ROOMS, PROGRAM_TYPES as ProgramTypeConstantsList } from '../constants'; 

const convertLocalToUTCDate = (localDate) => {
    if (!localDate) return null;
    return new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate()));
};
const formatDateForDisplay = (utcDate, options = { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) => {
    if (!utcDate) return 'N/A';
    return new Date(utcDate).toLocaleDateString(undefined, options);
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);

const COLORS_PIE = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A233FF', '#FF33A8', '#33FFA2', '#E2A0FF', '#A0E2FF', '#FFA0E2'];
const COLORS_BAR = { confirmed: 'var(--success-color, #2A9D8F)', pencil: 'var(--warning-color, #E9C46A)', available: 'var(--primary-light, #AEDFF7)' };

const BookingAnalyticsDashboard = ({ addToast }) => {
    const [viewMode, setViewMode] = useState('singleDay'); 
    const [selectedSingleDay, setSelectedSingleDay] = useState(new Date()); 
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth()); 
    const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);

    const [singleDayStats, setSingleDayStats] = useState(null);
    const [specificMonthStats, setSpecificMonthStats] = useState(null);
    const [yearlySummaryStats, setYearlySummaryStats] = useState(null); 
    const [yearlyMonthlyBreakdown, setYearlyMonthlyBreakdown] = useState([]); 
    const [programTypeBreakdown, setProgramTypeBreakdown] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        let periodStartUTC, periodEndUTCForProgramBreakdown; 
        try {
            if (viewMode === 'singleDay') {
                const dayUTC = convertLocalToUTCDate(selectedSingleDay);
                if (dayUTC) { setSingleDayStats(getSingleDayOccupancy(dayUTC)); periodStartUTC = dayUTC; periodEndUTCForProgramBreakdown = dayUTC; }
            } else if (viewMode === 'specificMonth') {
                setSpecificMonthStats(getSpecificMonthOccupancy(selectedYear, selectedMonth));
                periodStartUTC = new Date(Date.UTC(selectedYear, selectedMonth, 1));
                const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getUTCDate();
                periodEndUTCForProgramBreakdown = new Date(Date.UTC(selectedYear, selectedMonth, daysInMonth));
            } else if (viewMode === 'specificYear') {
                setYearlySummaryStats(getYearlyOccupancyStats(selectedYear));
                setYearlyMonthlyBreakdown(getMonthlyOccupancyStatsForYear(selectedYear)); 
                periodStartUTC = new Date(Date.UTC(selectedYear, 0, 1));
                periodEndUTCForProgramBreakdown = new Date(Date.UTC(selectedYear, 11, 31));
            }
            if (periodStartUTC && periodEndUTCForProgramBreakdown) {
                const progStats = getProgramTypeBreakdownForPeriod(periodStartUTC, periodEndUTCForProgramBreakdown);
                const formattedProgData = Object.values(progStats)
                    .filter(s => (s.confirmed || 0) > 0 || (s.pencil || 0) > 0) 
                    .map(s => ({ name: s.label, Confirmed: s.confirmed || 0, Pencil: s.pencil || 0, Total: (s.confirmed || 0) + (s.pencil || 0) }));
                setProgramTypeBreakdown(formattedProgData);
            }
        } catch (error) { console.error("Error fetching analytics:", error); if(addToast) addToast("Error fetching analytics.", "error");}
        setLoading(false);
    }, [viewMode, selectedSingleDay, selectedMonth, selectedYear, addToast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const renderSingleDayView = () => (
        singleDayStats && singleDayStats.date && ( // Added check for singleDayStats.date
            <>
                <h3 className="analytics-subtitle">Occupancy for {formatDateForDisplay(singleDayStats.date)}</h3>
                <div className="stats-summary-text">
                    <p><span className="stat-label">Confirmed:</span> <span className="stat-value">{singleDayStats.confirmed}</span></p>
                    <p><span className="stat-label">Pencil:</span> <span className="stat-value">{singleDayStats.pencil}</span></p>
                    <p><span className="stat-label">Total Booked:</span> <span className="stat-value">{singleDayStats.totalBooked}</span></p>
                    <p><span className="stat-label">Available:</span> <span className="stat-value">{singleDayStats.available}</span></p>
                    <p><span className="stat-label">Occupancy:</span> <span className="stat-value">{TOTAL_ROOMS > 0 ? ((singleDayStats.totalBooked / TOTAL_ROOMS) * 100).toFixed(4) : 0}%</span></p>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                    <BarChart layout="vertical" data={[{ name: 'Rooms', Confirmed: singleDayStats.confirmed, Pencil: singleDayStats.pencil, Available: singleDayStats.available }]} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" domain={[0, TOTAL_ROOMS]} allowDecimals={false}/>
                        <YAxis type="category" dataKey="name" hide/>
                        <Tooltip formatter={(value) => `${value} rooms`}/>
                        <Legend />
                        <Bar dataKey="Confirmed" stackId="a" fill={COLORS_BAR.confirmed} />
                        <Bar dataKey="Pencil" stackId="a" fill={COLORS_BAR.pencil} />
                        <Bar dataKey="Available" stackId="a" fill={COLORS_BAR.available} />
                    </BarChart>
                </ResponsiveContainer>
            </>
        )
    );

    const renderSpecificMonthView = () => (
        specificMonthStats && (
            <>
                <h3 className="analytics-subtitle">Summary for {MONTH_NAMES[selectedMonth]} {selectedYear}</h3>
                 <div className="stats-summary-text">
                    <p><span className="stat-label">Confirmed Room-Days:</span> <span className="stat-value">{specificMonthStats.confirmedRoomDays}</span></p>
                    <p><span className="stat-label">Pencil Room-Days:</span> <span className="stat-value">{specificMonthStats.pencilRoomDays}</span></p>
                    <p><span className="stat-label">Total Booked Room-Days:</span> <span className="stat-value">{specificMonthStats.totalBookedRoomDays}</span></p>
                    <p><span className="stat-label">Occupancy Rate:</span> <span className="stat-value">{specificMonthStats.occupancyRate.toFixed(4)}%</span></p>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={[{ name: MONTH_NAMES[selectedMonth], 'Confirmed Room-Days': specificMonthStats.confirmedRoomDays, 'Pencil Room-Days': specificMonthStats.pencilRoomDays }]} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false}/>
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Confirmed Room-Days" fill={COLORS_BAR.confirmed} />
                        <Bar dataKey="Pencil Room-Days" fill={COLORS_BAR.pencil} />
                    </BarChart>
                </ResponsiveContainer>
            </>
        )
    );
    
    const renderSpecificYearView = () => (
        <>
            {yearlySummaryStats && (
                <><h3 className="analytics-subtitle">Overall Summary for {selectedYear}</h3>
                <div className="yearly-stats-cards">
                    <div className="stat-card"><h4>Total Confirmed Room-Days</h4><p>{yearlySummaryStats.totalConfirmedRoomDays}</p></div>
                    <div className="stat-card"><h4>Total Pencil Room-Days</h4><p>{yearlySummaryStats.totalPencilRoomDays}</p></div>
                    <div className="stat-card"><h4>Total Booked Room-Days</h4><p>{yearlySummaryStats.totalRoomDaysBooked}</p></div>
                    <div className="stat-card"><h4>Overall Occupancy Rate</h4><p>{yearlySummaryStats.overallOccupancyRate.toFixed(4)}%</p></div>
                </div></>
            )}
            <h3 className="analytics-subtitle">Monthly Breakdown for {selectedYear} (Avg Daily Rooms Booked)</h3>
            {yearlyMonthlyBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={yearlyMonthlyBreakdown.map(m => ({name: m.month.substring(5), Confirmed: parseFloat(m.avgDailyConfirmed.toFixed(4)), Pencil: parseFloat(m.avgDailyPencil.toFixed(4))}))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis label={{ value: 'Avg Daily Rooms', angle: -90, position: 'insideLeft' }} allowDecimals={true}/>
                        <Tooltip formatter={(value) => `${Number(value).toFixed(4)} rooms`}/>
                        <Legend />
                        <Line type="monotone" dataKey="Confirmed" stroke={COLORS_BAR.confirmed} strokeWidth={2} activeDot={{r:6}}/>
                        <Line type="monotone" dataKey="Pencil" stroke={COLORS_BAR.pencil} strokeWidth={2} activeDot={{r:6}}/>
                    </LineChart>
                </ResponsiveContainer>
            ) : <p className="no-data-message">No monthly data for {selectedYear}.</p>}
        </>
    );

    const renderProgramTypeDistribution = () => (
        programTypeBreakdown.length > 0 && (
            <>
                <h3 className="analytics-subtitle">Program Type Distribution ({ viewMode === 'singleDay' && selectedSingleDay ? `for ${formatDateForDisplay(convertLocalToUTCDate(selectedSingleDay))}` : viewMode === 'specificMonth' ? `for ${MONTH_NAMES[selectedMonth]} ${selectedYear}` : `for ${selectedYear}` })</h3>
                <ResponsiveContainer width="100%" height={350}>
                    <PieChart>
                        <Pie data={programTypeBreakdown} dataKey="Total" nameKey="name" cx="50%" cy="50%" outerRadius={120} 
                             label={({ name, percent, payload }) => `${name} (${(percent * 100).toFixed(1)}%) [C:${payload.Confirmed}, P:${payload.Pencil}]`} >
                            {programTypeBreakdown.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS_PIE[index % COLORS_PIE.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value, name, props) => [`Total: ${value} Rooms (C:${props.payload.payload.Confirmed}, P:${props.payload.payload.Pencil})`, name]}/>
                        <Legend wrapperStyle={{bottom: -10, left: 0}}/>
                    </PieChart>
                </ResponsiveContainer>
            </>
        )
    );

    return (
        <div className="card analytics-dashboard">
            <h2 className="form-section-title">Booking Analytics</h2>
            <div className="analytics-controls">
                <div className="control-group"><label>View:</label><select value={viewMode} onChange={(e) => setViewMode(e.target.value)} className="form-select-sm"><option value="singleDay">Single Day</option><option value="specificMonth">Month</option><option value="specificYear">Year</option></select></div>
                {viewMode === 'singleDay' && (<div className="control-group"><label>Date:</label><DatePicker selected={selectedSingleDay} onChange={date => setSelectedSingleDay(date || new Date())} className="form-input-sm" dateFormat="EEE, MMM d, yyyy"/></div>)}
                {(viewMode === 'specificMonth' || viewMode === 'specificYear') && (<div className="control-group"><label>Year:</label><select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="form-select-sm">{YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}</select></div>)}
                {viewMode === 'specificMonth' && (<div className="control-group"><label>Month:</label><select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="form-select-sm">{MONTH_NAMES.map((name, index) => <option key={index} value={index}>{name}</option>)}</select></div>)}
            </div>
            <div className="charts-container">
                {loading && <div className="centered-spinner-container" style={{minHeight: '300px'}}><div className="spinner-large"></div><p>Loading Analytics...</p></div>}
                {!loading && viewMode === 'singleDay' && renderSingleDayView()}
                {!loading && viewMode === 'specificMonth' && renderSpecificMonthView()}
                {!loading && viewMode === 'specificYear' && renderSpecificYearView()}
                {!loading && programTypeBreakdown.length > 0 && renderProgramTypeDistribution()} 
                {!loading && programTypeBreakdown.length === 0 && viewMode !== '' && <p className="no-data-message">No program type data for the selected period.</p>}
            </div>
        </div>
    );
};
export default BookingAnalyticsDashboard;
