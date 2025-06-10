// src/components/BookingAnalyticsDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { 
    getSingleDayOccupancy, getBookingsInPeriod
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

// Helper to aggregate stats from bookings
const aggregateStatsForPeriod = (bookings, startDate, endDate) => {
    let confirmedRoomDays = 0, pencilRoomDays = 0, totalRoomDaysBooked = 0;
    const programTypeStats = {};
    ProgramTypeConstantsList.forEach(pt => { programTypeStats[pt.value] = { label: pt.label, confirmed: 0, pencil: 0, totalRooms: 0 }; });

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        bookings.forEach(booking => {
            const bookingStart = new Date(booking.startDate);
            const bookingEnd = new Date(booking.endDate);
            if (bookingStart <= d && bookingEnd > d) {
                if (booking.bookingStatus === 'confirmed') confirmedRoomDays++;
                else if (booking.bookingStatus === 'pencil') pencilRoomDays++;
                totalRoomDaysBooked++;
                if (programTypeStats[booking.programType]) {
                    programTypeStats[booking.programType].totalRooms++;
                }
            }
        });
    }

    const daysInPeriod = (endDate - startDate) / (1000 * 60 * 60 * 24) + 1;
    const totalRoomDaysAvailable = TOTAL_ROOMS * daysInPeriod;
    
    return {
        confirmedRoomDays,
        pencilRoomDays,
        totalRoomDaysBooked,
        totalRoomDaysAvailable,
        occupancyRate: totalRoomDaysAvailable > 0 ? (totalRoomDaysBooked / totalRoomDaysAvailable) * 100 : 0,
        programTypeStats
    };
};

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
        try {
            if (viewMode === 'singleDay') {
                const dayUTC = convertLocalToUTCDate(selectedSingleDay);
                if (dayUTC) {
                    const stats = await getSingleDayOccupancy(dayUTC);
                    setSingleDayStats(stats);
                    const bookings = await getBookingsInPeriod(dayUTC, new Date(dayUTC.getTime() + 86400000));
                    const programStats = aggregateStatsForPeriod(bookings, dayUTC, dayUTC).programTypeStats;
                    setProgramTypeBreakdown(Object.values(programStats).filter(s => s.totalRooms > 0));
                }
            } else if (viewMode === 'specificMonth' || viewMode === 'specificYear') {
                const periodStart = new Date(Date.UTC(selectedYear, viewMode === 'specificMonth' ? selectedMonth : 0, 1));
                const periodEnd = new Date(Date.UTC(selectedYear, viewMode === 'specificMonth' ? selectedMonth + 1 : 12, 0));
                const bookings = await getBookingsInPeriod(periodStart, periodEnd);
                const stats = aggregateStatsForPeriod(bookings, periodStart, periodEnd);

                if (viewMode === 'specificMonth') {
                    setSpecificMonthStats(stats);
                } else {
                    setYearlySummaryStats(stats);
                    // Monthly breakdown logic would need more granular fetches or client-side processing
                }
                setProgramTypeBreakdown(Object.values(stats.programTypeStats).filter(s => s.totalRooms > 0));
            }
        } catch (error) { console.error("Error fetching analytics:", error); if(addToast) addToast("Error fetching analytics.", "error");}
        setLoading(false);
    }, [viewMode, selectedSingleDay, selectedMonth, selectedYear, addToast]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const renderSingleDayView = () => (
        singleDayStats && singleDayStats.date && (
            <>
                <h3 className="analytics-subtitle">Occupancy for {formatDateForDisplay(singleDayStats.date)}</h3>
                <div className="stats-summary-text">
                    <p><span className="stat-label">Confirmed:</span> <span className="stat-value">{singleDayStats.confirmed}</span></p>
                    <p><span className="stat-label">Pencil:</span> <span className="stat-value">{singleDayStats.pencil}</span></p>
                    <p><span className="stat-label">Total Booked:</span> <span className="stat-value">{singleDayStats.totalBooked}</span></p>
                    <p><span className="stat-label">Available:</span> <span className="stat-value">{singleDayStats.available}</span></p>
                    <p><span className="stat-label">Occupancy:</span> <span className="stat-value">{TOTAL_ROOMS > 0 ? ((singleDayStats.totalBooked / TOTAL_ROOMS) * 100).toFixed(1) : 0}%</span></p>
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
    
    // Simplified render functions, you can expand them as needed
    const renderSpecificMonthView = () => ( specificMonthStats && <p>Monthly stats loaded.</p> );
    const renderSpecificYearView = () => ( yearlySummaryStats && <p>Yearly stats loaded.</p> );
    
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
            </div>
        </div>
    );
};
export default BookingAnalyticsDashboard;
