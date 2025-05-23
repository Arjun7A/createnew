// src/services/availabilityService.js
import { TOTAL_ROOMS, PROGRAM_TYPES } from '../constants';

const CONFIRMED_BOOKINGS_STORAGE_KEY = 'hotel_confirmed_bookings_v4_1';
const PENCIL_BOOKINGS_STORAGE_KEY = 'hotel_pencil_bookings_v4_1';

const normalizeDate = (dateInput) => {
  if (!dateInput) return null;
  const d = new Date(dateInput); 
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const parseBookings = (bookingsJson) => {
  if (!bookingsJson) return [];
  try {
    return JSON.parse(bookingsJson).map(booking => ({
      ...booking,
      startDate: normalizeDate(booking.startDate), 
      endDate: normalizeDate(booking.endDate),     
    }));
  } catch (error) {
    console.error('Error parsing bookings from localStorage:', error);
    return [];
  }
};

const convertBookingsForStorage = (bookings) => {
    return bookings.map(b => ({
        ...b,
        startDate: b.startDate ? normalizeDate(b.startDate).toISOString() : null,
        endDate: b.endDate ? normalizeDate(b.endDate).toISOString() : null,
        createdAt: b.createdAt ? new Date(b.createdAt).toISOString() : new Date().toISOString()
    }));
};

export const getConfirmedBookings = () => {
  return parseBookings(localStorage.getItem(CONFIRMED_BOOKINGS_STORAGE_KEY));
};

export const getPencilBookings = () => {
  return parseBookings(localStorage.getItem(PENCIL_BOOKINGS_STORAGE_KEY));
};

export const getAllBookings = () => {
  const confirmed = getConfirmedBookings().map(b => ({ ...b, bookingStatus: 'confirmed' }));
  const pencil = getPencilBookings().map(b => ({ ...b, bookingStatus: 'pencil' }));
  return [...confirmed, ...pencil].sort((a, b) => {
    const dateA = a.startDate ? a.startDate.getTime() : 0;
    const dateB = b.startDate ? b.startDate.getTime() : 0;
    return dateA - dateB;
  });
};

const getDailyBookedCounts = (bookingsList, periodStart, periodEnd) => { 
  const dailyBooked = {};
  if (!periodStart || !periodEnd) return dailyBooked;

  let currentDate = new Date(periodStart); 
  while (currentDate.getTime() <= periodEnd.getTime()) {
    dailyBooked[currentDate.toISOString().split('T')[0]] = 0;
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  bookingsList.forEach(booking => {
    if (!booking.startDate || !booking.endDate) return;
    let iterDate = new Date(booking.startDate); 
    while (iterDate.getTime() <= booking.endDate.getTime()) {
      if (iterDate.getTime() >= periodStart.getTime() && iterDate.getTime() <= periodEnd.getTime()) {
        const isoDateKey = iterDate.toISOString().split('T')[0];
        if (dailyBooked.hasOwnProperty(isoDateKey)) {
          dailyBooked[isoDateKey] += booking.numberOfRooms;
        }
      }
      iterDate.setUTCDate(iterDate.getUTCDate() + 1);
    }
  });
  return dailyBooked;
};

export const checkAvailabilityForRange = (startDate, endDate, numberOfRooms, bookingsToExclude = []) => {
  if (!startDate || !endDate || startDate.getTime() > endDate.getTime()) {
    return { isAvailable: false, minAvailableRoomsInPeriod: 0, requestedRooms: numberOfRooms, dailyBreakdown: {}, checkedStart: startDate, checkedEnd: endDate, error: "Invalid date range" };
  }
  
  const allExistingBookings = getAllBookings().filter(b => !bookingsToExclude.some(ex => ex.id === b.id));
  const dailyBookedCounts = getDailyBookedCounts(allExistingBookings, startDate, endDate);

  let minAvailableOnAnyDay = TOTAL_ROOMS;
  const dailyAvailabilityDetails = {};
  let currentCheckDate = new Date(startDate);
  while (currentCheckDate.getTime() <= endDate.getTime()) {
    const isoDateKey = currentCheckDate.toISOString().split('T')[0];
    const bookedOnDay = dailyBookedCounts[isoDateKey] || 0;
    const availableOnDay = TOTAL_ROOMS - bookedOnDay;
    dailyAvailabilityDetails[isoDateKey] = availableOnDay;
    minAvailableOnAnyDay = Math.min(minAvailableOnAnyDay, availableOnDay);
    currentCheckDate.setUTCDate(currentCheckDate.getUTCDate() + 1);
  }

  return { isAvailable: minAvailableOnAnyDay >= numberOfRooms, minAvailableRoomsInPeriod: minAvailableOnAnyDay, requestedRooms: numberOfRooms, dailyBreakdown: dailyAvailabilityDetails, checkedStart: startDate, checkedEnd: endDate };
};

export const findAvailableSlots = (searchPeriodStart, searchPeriodEnd, durationDays, numberOfRooms) => {
  const availableSlots = [];
  if (durationDays < 1 || !searchPeriodStart || !searchPeriodEnd || searchPeriodStart.getTime() > searchPeriodEnd.getTime()) return availableSlots;

  let potentialSlotStart = new Date(searchPeriodStart);
  while (potentialSlotStart.getTime() <= searchPeriodEnd.getTime()) {
    const potentialSlotEnd = new Date(potentialSlotStart);
    potentialSlotEnd.setUTCDate(potentialSlotEnd.getUTCDate() + durationDays - 1);

    if (potentialSlotEnd.getTime() > searchPeriodEnd.getTime()) {
      break; 
    }

    const availabilityResult = checkAvailabilityForRange(potentialSlotStart, potentialSlotEnd, numberOfRooms);
    if (availabilityResult.isAvailable) {
      availableSlots.push({
        startDate: new Date(potentialSlotStart), 
        endDate: new Date(potentialSlotEnd),     
        minAvailableRoomsInSlot: availabilityResult.minAvailableRoomsInPeriod
      });
    }
    potentialSlotStart.setUTCDate(potentialSlotStart.getUTCDate() + 1);
  }
  return availableSlots;
};

export const saveBooking = (bookingData) => {
  const newBookingId = bookingData.id || Date.now(); 
  if (!bookingData.startDate || !bookingData.endDate) throw new Error("Invalid start or end date for booking.");

  const exclusion = bookingData.id ? [{id: bookingData.id}] : [];
  const availabilityResult = checkAvailabilityForRange(bookingData.startDate, bookingData.endDate, bookingData.numberOfRooms, exclusion);

  if (!availabilityResult.isAvailable) throw new Error(`Booking failed: Only ${availabilityResult.minAvailableRoomsInPeriod} rooms available during the selected period (requested ${bookingData.numberOfRooms}).`);

  const newBookingToStore = { ...bookingData, id: newBookingId, createdAt: bookingData.createdAt ? new Date(bookingData.createdAt) : new Date() };
  delete newBookingToStore.originalBookingStatus;

  if (newBookingToStore.bookingStatus === 'confirmed') {
    let bookings = getConfirmedBookings().filter(b => b.id !== newBookingToStore.id);
    bookings.push(newBookingToStore); 
    localStorage.setItem(CONFIRMED_BOOKINGS_STORAGE_KEY, JSON.stringify(convertBookingsForStorage(bookings)));
  } else if (newBookingToStore.bookingStatus === 'pencil') {
    let bookings = getPencilBookings().filter(b => b.id !== newBookingToStore.id);
    bookings.push(newBookingToStore); 
    localStorage.setItem(PENCIL_BOOKINGS_STORAGE_KEY, JSON.stringify(convertBookingsForStorage(bookings)));
  } else throw new Error("Invalid booking status.");
  
  return newBookingToStore; 
};

export const getConsolidatedBookingsForDisplay = () => {
  return getAllBookings().map(b => ({ ...b, type: b.bookingStatus ? (b.bookingStatus.charAt(0).toUpperCase() + b.bookingStatus.slice(1)) : 'Unknown' }));
};

export const updateBooking = (bookingId, originalBookingStatus, updatedBookingData) => {
  if (!updatedBookingData.startDate || !updatedBookingData.endDate) throw new Error("Invalid start or end date for update.");

  const availabilityResult = checkAvailabilityForRange(updatedBookingData.startDate, updatedBookingData.endDate, updatedBookingData.numberOfRooms, [{ id: bookingId }]);
  if (!availabilityResult.isAvailable) throw new Error(`Update failed: Only ${availabilityResult.minAvailableRoomsInPeriod} rooms available (requested ${updatedBookingData.numberOfRooms}). Consider other bookings.`);

  const statusLower = originalBookingStatus ? originalBookingStatus.toLowerCase() : '';
  if (statusLower === 'confirmed') {
    const bookings = getConfirmedBookings().filter(b => b.id !== bookingId);
    localStorage.setItem(CONFIRMED_BOOKINGS_STORAGE_KEY, JSON.stringify(convertBookingsForStorage(bookings)));
  } else if (statusLower === 'pencil') {
    const bookings = getPencilBookings().filter(b => b.id !== bookingId);
    localStorage.setItem(PENCIL_BOOKINGS_STORAGE_KEY, JSON.stringify(convertBookingsForStorage(bookings)));
  }

  const bookingToSave = { ...updatedBookingData, id: bookingId }; 
  return saveBooking(bookingToSave); 
};

export const deleteBooking = (bookingId, bookingStatus) => { 
  let bookings; let storageKey; const statusLower = bookingStatus ? bookingStatus.toLowerCase() : '';
  if (statusLower === 'confirmed') { bookings = getConfirmedBookings(); storageKey = CONFIRMED_BOOKINGS_STORAGE_KEY; }
  else if (statusLower === 'pencil') { bookings = getPencilBookings(); storageKey = PENCIL_BOOKINGS_STORAGE_KEY; }
  else throw new Error(`Invalid booking status "${bookingStatus}" for delete.`);
  const updatedBookings = bookings.filter(b => b.id !== bookingId);
  localStorage.setItem(storageKey, JSON.stringify(convertBookingsForStorage(updatedBookings)));
  return { success: true };
};

export const clearAllBookings = () => { 
  localStorage.removeItem(CONFIRMED_BOOKINGS_STORAGE_KEY); localStorage.removeItem(PENCIL_BOOKINGS_STORAGE_KEY);
};

// --- ANALYTICS & PERIOD BOOKING FUNCTIONS ---
export const getBookingsInPeriod = (periodStartUTC, periodEndUTC) => {
  if (!periodStartUTC || !periodEndUTC || periodStartUTC.getTime() > periodEndUTC.getTime()) {
    return [];
  }
  const allBookings = getAllBookings(); 
  return allBookings.filter(booking => {
    if (!booking.startDate || !booking.endDate) return false;
    return booking.startDate.getTime() <= periodEndUTC.getTime() && 
           booking.endDate.getTime() >= periodStartUTC.getTime();
  });
};

export const getSingleDayOccupancy = (dateUTC) => {
  if (!dateUTC) return { date: null, confirmed: 0, pencil: 0, totalBooked: 0, available: TOTAL_ROOMS };
  
  const dailyStats = getDailyOccupancyStatsForRange(dateUTC, dateUTC);
  const isoDateKey = dateUTC.toISOString().split('T')[0];
  
  return dailyStats[isoDateKey] || { 
    date: new Date(dateUTC), 
    confirmed: 0, 
    pencil: 0, 
    totalBooked: 0, 
    available: TOTAL_ROOMS 
  };
};

export const getSpecificMonthOccupancy = (year, month) => {
  const monthStartDateUTC = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(year, month + 1, 0).getUTCDate(); 
  const monthEndDateUTC = new Date(Date.UTC(year, month, daysInMonth));

  const dailyStatsForMonth = getDailyOccupancyStatsForRange(monthStartDateUTC, monthEndDateUTC);
  
  let confirmedRoomDays = 0;
  let pencilRoomDays = 0;
  let totalBookedRoomDays = 0;

  Object.values(dailyStatsForMonth).forEach(dayStat => {
    confirmedRoomDays += dayStat.confirmed;
    pencilRoomDays += dayStat.pencil;
    totalBookedRoomDays += dayStat.totalBooked;
  });
  
  const totalRoomDaysInMonthAvailable = TOTAL_ROOMS * daysInMonth;

  return {
    monthYear: `${year}-${String(month + 1).padStart(2, '0')}`,
    confirmedRoomDays,
    pencilRoomDays,
    totalBookedRoomDays,
    totalRoomDaysInMonthAvailable,
    occupancyRate: totalRoomDaysInMonthAvailable > 0 ? (totalBookedRoomDays / totalRoomDaysInMonthAvailable) * 100 : 0,
  };
};

export const getDailyOccupancyStatsForRange = (rangeStartDateUTC, rangeEndDateUTC) => {
  if (!rangeStartDateUTC || !rangeEndDateUTC || rangeStartDateUTC.getTime() > rangeEndDateUTC.getTime()) {
    return {};
  }
  const allBookings = getAllBookings(); 
  const dailyStats = {};

  let currentDate = new Date(rangeStartDateUTC);
  while (currentDate.getTime() <= rangeEndDateUTC.getTime()) {
    const isoDateKey = currentDate.toISOString().split('T')[0];
    dailyStats[isoDateKey] = { date: new Date(currentDate), confirmed: 0, pencil: 0, totalBooked: 0, available: TOTAL_ROOMS };
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  allBookings.forEach(booking => {
    if (!booking.startDate || !booking.endDate) return;
    let iterDate = new Date(booking.startDate);
    while (iterDate.getTime() <= booking.endDate.getTime()) {
      if (iterDate.getTime() >= rangeStartDateUTC.getTime() && iterDate.getTime() <= rangeEndDateUTC.getTime()) {
        const isoDateKey = iterDate.toISOString().split('T')[0];
        if (dailyStats[isoDateKey]) {
          if (booking.bookingStatus === 'confirmed') dailyStats[isoDateKey].confirmed += booking.numberOfRooms;
          else if (booking.bookingStatus === 'pencil') dailyStats[isoDateKey].pencil += booking.numberOfRooms;
          dailyStats[isoDateKey].totalBooked += booking.numberOfRooms;
          dailyStats[isoDateKey].available = TOTAL_ROOMS - dailyStats[isoDateKey].totalBooked;
        }
      }
      iterDate.setUTCDate(iterDate.getUTCDate() + 1);
    }
  });
  return dailyStats;
};

export const getMonthlyOccupancyStatsForYear = (year) => {
  const yearStartDateUTC = new Date(Date.UTC(year, 0, 1)); 
  const yearEndDateUTC = new Date(Date.UTC(year, 11, 31)); 

  const dailyStats = getDailyOccupancyStatsForRange(yearStartDateUTC, yearEndDateUTC);
  const monthlyAggregatesMap = {}; 

  for (let m = 0; m < 12; m++) {
      const monthKey = `${year}-${String(m + 1).padStart(2, '0')}`;
      const daysInMonth = new Date(year, m + 1, 0).getUTCDate();
      monthlyAggregatesMap[monthKey] = {
        month: monthKey, year: year, monthNum: m, 
        confirmedRoomDays: 0, pencilRoomDays: 0, totalRoomDaysBooked: 0,
        totalRoomDaysAvailable: TOTAL_ROOMS * daysInMonth, daysInMonth: daysInMonth,
      };
  }

  Object.keys(dailyStats).forEach(isoDateKey => {
    const date = new Date(isoDateKey + "T00:00:00.000Z"); 
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    if (monthlyAggregatesMap[monthKey]) { 
        monthlyAggregatesMap[monthKey].confirmedRoomDays += dailyStats[isoDateKey].confirmed;
        monthlyAggregatesMap[monthKey].pencilRoomDays += dailyStats[isoDateKey].pencil;
        monthlyAggregatesMap[monthKey].totalRoomDaysBooked += dailyStats[isoDateKey].totalBooked;
    }
  });

  return Object.values(monthlyAggregatesMap)
    .map(monthStat => ({
      ...monthStat,
      avgDailyConfirmed: monthStat.daysInMonth > 0 ? monthStat.confirmedRoomDays / monthStat.daysInMonth : 0,
      avgDailyPencil: monthStat.daysInMonth > 0 ? monthStat.pencilRoomDays / monthStat.daysInMonth : 0,
      avgDailyTotalBooked: monthStat.daysInMonth > 0 ? monthStat.totalRoomDaysBooked / monthStat.daysInMonth : 0,
      occupancyRate: monthStat.totalRoomDaysAvailable > 0 ? (monthStat.totalRoomDaysBooked / monthStat.totalRoomDaysAvailable) * 100 : 0,
    }))
    .sort((a, b) => a.monthNum - b.monthNum); 
};

export const getYearlyOccupancyStats = (year) => {
    const monthlyStats = getMonthlyOccupancyStatsForYear(year);
    let totalConfirmedRoomDays = 0, totalPencilRoomDays = 0, totalRoomDaysBooked = 0, totalRoomDaysInYearAvailable = 0;
    monthlyStats.forEach(month => {
        totalConfirmedRoomDays += month.confirmedRoomDays; totalPencilRoomDays += month.pencilRoomDays;
        totalRoomDaysBooked += month.totalRoomDaysBooked; totalRoomDaysInYearAvailable += month.totalRoomDaysAvailable;
    });
    return {
        year: year, totalConfirmedRoomDays, totalPencilRoomDays, totalRoomDaysBooked, totalRoomDaysInYearAvailable,
        overallOccupancyRate: totalRoomDaysInYearAvailable > 0 ? (totalRoomDaysBooked / totalRoomDaysInYearAvailable) * 100 : 0,
    };
};

export const getProgramTypeBreakdownForPeriod = (rangeStartDateUTC, rangeEndDateUTC) => {
    if (!rangeStartDateUTC || !rangeEndDateUTC || rangeStartDateUTC.getTime() > rangeEndDateUTC.getTime()) return {};
    const allBookings = getAllBookings();
    const programTypeStats = {};
    PROGRAM_TYPES.forEach(pt => { programTypeStats[pt.value] = { label: pt.label, confirmed: 0, pencil: 0, totalRooms: 0 }; });
    programTypeStats['UNKNOWN'] = { label: 'Unknown Type', confirmed: 0, pencil: 0, totalRooms: 0 };

    allBookings.forEach(booking => {
        if (!booking.startDate || !booking.endDate) return;
        const overlaps = booking.startDate.getTime() <= rangeEndDateUTC.getTime() && booking.endDate.getTime() >= rangeStartDateUTC.getTime();
        if (overlaps) {
            const type = booking.programType || 'UNKNOWN';
            if (!programTypeStats[type]) programTypeStats[type] = { label: type, confirmed: 0, pencil: 0, totalRooms: 0 };
            const numRooms = booking.numberOfRooms || 0;
            if (booking.bookingStatus === 'confirmed') programTypeStats[type].confirmed += numRooms;
            else if (booking.bookingStatus === 'pencil') programTypeStats[type].pencil += numRooms;
            programTypeStats[type].totalRooms += numRooms;
        }
    });
    return programTypeStats;
};
