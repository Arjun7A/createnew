// src/services/availabilityService.js
import { TOTAL_ROOMS, PROGRAM_TYPES } from '../constants';

const CONFIRMED_BOOKINGS_STORAGE_KEY = 'hotel_confirmed_bookings_v6_LCO';
const PENCIL_BOOKINGS_STORAGE_KEY = 'hotel_pencil_bookings_v6_LCO';

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
      endDate: normalizeDate(booking.endDate), // endDate is exclusive check-out   
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
        createdAt: b.createdAt ? (b.createdAt instanceof Date ? b.createdAt.toISOString() : new Date(b.createdAt).toISOString()) : new Date().toISOString()
    }));
};

export const getConfirmedBookings = () => parseBookings(localStorage.getItem(CONFIRMED_BOOKINGS_STORAGE_KEY));
export const getPencilBookings = () => parseBookings(localStorage.getItem(PENCIL_BOOKINGS_STORAGE_KEY));

export const getAllBookings = () => {
  const confirmed = getConfirmedBookings().map(b => ({ ...b, bookingStatus: 'confirmed' }));
  const pencil = getPencilBookings().map(b => ({ ...b, bookingStatus: 'pencil' }));
  return [...confirmed, ...pencil].sort((a, b) => {
    const dateA = a.startDate ? a.startDate.getTime() : 0;
    const dateB = b.startDate ? b.startDate.getTime() : 0;
    if (dateA === dateB) { // Optional: further sort by creation or title if start dates are same
        return (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime());
    }
    return dateA - dateB;
  });
};

// Internal helper for checkAvailabilityForRange
const getDailyBookedCountsForOccupiedPeriod = (bookingsList, periodStartInclusive, periodEndInclusive) => { 
  const dailyBooked = {};
  if (!periodStartInclusive || !periodEndInclusive || periodStartInclusive.getTime() > periodEndInclusive.getTime()) return dailyBooked;

  let currentDateInQuery = new Date(periodStartInclusive); 
  while (currentDateInQuery.getTime() <= periodEndInclusive.getTime()) {
    dailyBooked[currentDateInQuery.toISOString().split('T')[0]] = 0;
    currentDateInQuery.setUTCDate(currentDateInQuery.getUTCDate() + 1);
  }

  bookingsList.forEach(booking => {
    if (!booking.startDate || !booking.endDate) return; 
    let iterOccupiedDate = new Date(booking.startDate); 
    while (iterOccupiedDate.getTime() < booking.endDate.getTime()) { 
      if (iterOccupiedDate.getTime() >= periodStartInclusive.getTime() && iterOccupiedDate.getTime() <= periodEndInclusive.getTime()) {
        const isoDateKey = iterOccupiedDate.toISOString().split('T')[0];
        if (dailyBooked.hasOwnProperty(isoDateKey)) {
          dailyBooked[isoDateKey] += booking.numberOfRooms;
        }
      }
      iterOccupiedDate.setUTCDate(iterOccupiedDate.getUTCDate() + 1);
    }
  });
  return dailyBooked;
};

export const checkAvailabilityForRange = (slotStartDate, slotEndDateExclusive, numberOfRooms, bookingsToExclude = []) => {
  if (!slotStartDate || !slotEndDateExclusive || slotStartDate.getTime() >= slotEndDateExclusive.getTime()) {
    return { isAvailable: false, minAvailableRoomsInPeriod: 0, requestedRooms: numberOfRooms, dailyBreakdown: {}, checkedStart: slotStartDate, checkedEnd: slotEndDateExclusive, error: "Invalid date range (start >= end_exclusive)" };
  }
  
  const allExistingBookings = getAllBookings().filter(b => !bookingsToExclude.some(ex => ex.id === b.id));
  const lastDayOfStayInclusive = new Date(slotEndDateExclusive);
  lastDayOfStayInclusive.setUTCDate(lastDayOfStayInclusive.getUTCDate() - 1);

  if (slotStartDate.getTime() > lastDayOfStayInclusive.getTime()) { 
      return { isAvailable: false, minAvailableRoomsInPeriod: 0, requestedRooms: numberOfRooms, dailyBreakdown: {}, checkedStart: slotStartDate, checkedEnd: slotEndDateExclusive, error: "Invalid slot: start date after last occupied date."};
  }

  const dailyBookedCounts = getDailyBookedCountsForOccupiedPeriod(allExistingBookings, slotStartDate, lastDayOfStayInclusive);
  let minAvailableOnAnyDay = TOTAL_ROOMS;
  const dailyAvailabilityDetails = {};
  let currentOccupiedDate = new Date(slotStartDate);
  while (currentOccupiedDate.getTime() < slotEndDateExclusive.getTime()) { 
    const isoDateKey = currentOccupiedDate.toISOString().split('T')[0];
    const bookedOnDay = dailyBookedCounts[isoDateKey] || 0;
    const availableOnDay = TOTAL_ROOMS - bookedOnDay;
    dailyAvailabilityDetails[isoDateKey] = availableOnDay;
    minAvailableOnAnyDay = Math.min(minAvailableOnAnyDay, availableOnDay);
    currentOccupiedDate.setUTCDate(currentOccupiedDate.getUTCDate() + 1);
  }
  return { 
    isAvailable: minAvailableOnAnyDay >= numberOfRooms, minAvailableRoomsInPeriod: minAvailableOnAnyDay, 
    requestedRooms: numberOfRooms, dailyBreakdown: dailyAvailabilityDetails, 
    checkedStart: slotStartDate, checkedEnd: lastDayOfStayInclusive 
  };
};

export const findAvailableSlots = (earliestCheckInDayUTC, latestCheckOutDayUTC, durationNights, numberOfRooms) => {
  const availableSlots = [];
  if (durationNights < 1 || !earliestCheckInDayUTC || !latestCheckOutDayUTC || earliestCheckInDayUTC.getTime() >= latestCheckOutDayUTC.getTime()) {
    return availableSlots;
  }
  let potentialCheckInDay = new Date(earliestCheckInDayUTC);
  while (true) {
    const potentialCheckOutDay = new Date(potentialCheckInDay);
    potentialCheckOutDay.setUTCDate(potentialCheckInDay.getUTCDate() + durationNights);
    if (potentialCheckOutDay.getTime() > latestCheckOutDayUTC.getTime()) break; 
    
    const availabilityResult = checkAvailabilityForRange(potentialCheckInDay, potentialCheckOutDay, numberOfRooms);
    if (availabilityResult.isAvailable) {
      availableSlots.push({
        startDate: new Date(potentialCheckInDay),      
        endDate: new Date(potentialCheckOutDay),       
        minAvailableRoomsInSlot: availabilityResult.minAvailableRoomsInPeriod
      });
    }
    potentialCheckInDay.setUTCDate(potentialCheckInDay.getUTCDate() + 1);
  }
  return availableSlots;
};

export const saveBooking = (bookingData) => {
  const newBookingId = bookingData.id || Date.now(); 
  if (!bookingData.startDate || !bookingData.endDate || bookingData.startDate.getTime() >= bookingData.endDate.getTime()) {
    throw new Error("Invalid start or end date for booking (start must be before exclusive end).");
  }
  const exclusion = bookingData.id ? [{id: bookingData.id}] : [];
  const availabilityResult = checkAvailabilityForRange(bookingData.startDate, bookingData.endDate, bookingData.numberOfRooms, exclusion);
  if (!availabilityResult.isAvailable) throw new Error(`Booking failed: Only ${availabilityResult.minAvailableRoomsInPeriod} rooms available for the period.`);
  
  const newBookingToStore = { 
      ...bookingData, 
      id: newBookingId, 
      // Ensure createdAt is a Date object before conversion for storage, or use existing if it's already ISO
      createdAt: bookingData.createdAt instanceof Date ? bookingData.createdAt : (bookingData.createdAt ? new Date(bookingData.createdAt) : new Date())
  };
  delete newBookingToStore.originalBookingStatus; // Remove if it exists

  // Convert Date objects to ISO strings for storage immediately before stringifying
  const bookingForStorage = {
      ...newBookingToStore,
      startDate: newBookingToStore.startDate.toISOString(),
      endDate: newBookingToStore.endDate.toISOString(),
      createdAt: newBookingToStore.createdAt.toISOString()
  };

  if (newBookingToStore.bookingStatus === 'confirmed') {
    let bookings = getConfirmedBookings(); // Already parsed with Date objects
    const index = bookings.findIndex(b => b.id === newBookingToStore.id);
    if (index > -1) bookings.splice(index, 1); // Remove old if updating
    bookings.push(newBookingToStore); // Add new/updated with Date objects
    localStorage.setItem(CONFIRMED_BOOKINGS_STORAGE_KEY, JSON.stringify(convertBookingsForStorage(bookings)));
  } else if (newBookingToStore.bookingStatus === 'pencil') {
    let bookings = getPencilBookings();
    const index = bookings.findIndex(b => b.id === newBookingToStore.id);
    if (index > -1) bookings.splice(index, 1);
    bookings.push(newBookingToStore);
    localStorage.setItem(PENCIL_BOOKINGS_STORAGE_KEY, JSON.stringify(convertBookingsForStorage(bookings)));
  } else throw new Error("Invalid booking status.");
  return newBookingToStore; // Return with Date objects for immediate use
};

export const getConsolidatedBookingsForDisplay = () => getAllBookings();

export const updateBooking = (bookingId, originalBookingStatus, updatedBookingData) => {
  if (!updatedBookingData.startDate || !updatedBookingData.endDate || updatedBookingData.startDate.getTime() >= updatedBookingData.endDate.getTime()) {
    throw new Error("Invalid start or end date for update.");
  }
  const availabilityResult = checkAvailabilityForRange(updatedBookingData.startDate, updatedBookingData.endDate, updatedBookingData.numberOfRooms, [{ id: bookingId }]);
  if (!availabilityResult.isAvailable) throw new Error(`Update failed: Only ${availabilityResult.minAvailableRoomsInPeriod} rooms available.`);
  
  const statusLower = originalBookingStatus ? originalBookingStatus.toLowerCase() : '';
  if (statusLower === 'confirmed') {
    const bookings = getConfirmedBookings().filter(b => b.id !== bookingId);
    localStorage.setItem(CONFIRMED_BOOKINGS_STORAGE_KEY, JSON.stringify(convertBookingsForStorage(bookings)));
  } else if (statusLower === 'pencil') {
    const bookings = getPencilBookings().filter(b => b.id !== bookingId);
    localStorage.setItem(PENCIL_BOOKINGS_STORAGE_KEY, JSON.stringify(convertBookingsForStorage(bookings)));
  }
  // Ensure createdAt from original booking is preserved if not explicitly changed
  const bookingToSave = { ...updatedBookingData, id: bookingId, createdAt: updatedBookingData.createdAt || (getAllBookings().find(b=>b.id===bookingId)?.createdAt) || new Date() }; 
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

// --- ANALYTICS FUNCTIONS ---
export const getBookingsInPeriod = (periodStartUTC, periodEndUTC) => {
  if (!periodStartUTC || !periodEndUTC || periodStartUTC.getTime() > periodEndUTC.getTime()) return [];
  const allBookings = getAllBookings(); 
  return allBookings.filter(booking => {
    if (!booking.startDate || !booking.endDate) return false;
    return booking.startDate.getTime() <= periodEndUTC.getTime() && booking.endDate.getTime() > periodStartUTC.getTime();
  });
};

export const getSingleDayOccupancy = (dateUTC) => {
  if (!dateUTC) return { date: null, confirmed: 0, pencil: 0, totalBooked: 0, available: TOTAL_ROOMS };
  const dayStats = { date: new Date(dateUTC), confirmed: 0, pencil: 0, totalBooked: 0, available: TOTAL_ROOMS };
  const allBookings = getAllBookings();
  allBookings.forEach(booking => {
      if(booking.startDate && booking.endDate && 
         booking.startDate.getTime() <= dateUTC.getTime() && 
         booking.endDate.getTime() > dateUTC.getTime()){    
          if (booking.bookingStatus === 'confirmed') dayStats.confirmed += booking.numberOfRooms;
          else if (booking.bookingStatus === 'pencil') dayStats.pencil += booking.numberOfRooms;
          dayStats.totalBooked += booking.numberOfRooms;
      }
  });
  dayStats.available = TOTAL_ROOMS - dayStats.totalBooked;
  return dayStats;
};

export const getDailyOccupancyStatsForRange = (rangeStartDateUTC, rangeEndDateUTC) => {
  if (!rangeStartDateUTC || !rangeEndDateUTC || rangeStartDateUTC.getTime() > rangeEndDateUTC.getTime()) return {};
  const dailyResults = {};
  let currentDate = new Date(rangeStartDateUTC);
  while(currentDate.getTime() <= rangeEndDateUTC.getTime()){
      const isoDateKey = currentDate.toISOString().split('T')[0];
      dailyResults[isoDateKey] = getSingleDayOccupancy(new Date(currentDate));
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  return dailyResults;
};

export const getSpecificMonthOccupancy = (year, month) => {
  const monthStartDateUTC = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(year, month + 1, 0).getUTCDate(); 
  const monthEndDateUTC = new Date(Date.UTC(year, month, daysInMonth));
  const dailyStatsForMonth = getDailyOccupancyStatsForRange(monthStartDateUTC, monthEndDateUTC);
  let confirmedRoomDays = 0, pencilRoomDays = 0, totalBookedRoomDays = 0;
  Object.values(dailyStatsForMonth).forEach(dayStat => {
    confirmedRoomDays += dayStat.confirmed; pencilRoomDays += dayStat.pencil; totalBookedRoomDays += dayStat.totalBooked;
  });
  const totalRoomDaysInMonthAvailable = TOTAL_ROOMS * daysInMonth;
  return {
    monthYear: `${year}-${String(month + 1).padStart(2, '0')}`, confirmedRoomDays, pencilRoomDays, totalBookedRoomDays,
    totalRoomDaysInMonthAvailable, occupancyRate: totalRoomDaysInMonthAvailable > 0 ? (totalBookedRoomDays / totalRoomDaysInMonthAvailable) * 100 : 0,
  };
};

export const getMonthlyOccupancyStatsForYear = (year) => {
  const monthlyAggregatesMap = {}; 
  for (let m = 0; m < 12; m++) { 
      const monthKey = `${year}-${String(m + 1).padStart(2, '0')}`;
      const monthStartDateUTC = new Date(Date.UTC(year, m, 1));
      const daysInMonth = new Date(year, m + 1, 0).getUTCDate();
      const monthEndDateUTC = new Date(Date.UTC(year, m, daysInMonth));
      const dailyStats = getDailyOccupancyStatsForRange(monthStartDateUTC, monthEndDateUTC); 
      monthlyAggregatesMap[monthKey] = {
        month: monthKey, year: year, monthNum: m, 
        confirmedRoomDays: 0, pencilRoomDays: 0, totalRoomDaysBooked: 0,
        totalRoomDaysAvailable: TOTAL_ROOMS * daysInMonth, daysInMonth: daysInMonth,
      };
      Object.values(dailyStats).forEach(dayStat => {
          monthlyAggregatesMap[monthKey].confirmedRoomDays += dayStat.confirmed;
          monthlyAggregatesMap[monthKey].pencilRoomDays += dayStat.pencil;
          monthlyAggregatesMap[monthKey].totalRoomDaysBooked += dayStat.totalBooked;
      });
  }
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
    const relevantBookings = getBookingsInPeriod(rangeStartDateUTC, rangeEndDateUTC);
    const programTypeStats = {};
    (PROGRAM_TYPES || []).forEach(pt => { programTypeStats[pt.value] = { label: pt.label, confirmed: 0, pencil: 0, totalRooms: 0 }; });
    programTypeStats['UNKNOWN'] = { label: 'Unknown Type', confirmed: 0, pencil: 0, totalRooms: 0 };

    relevantBookings.forEach(booking => {
        const type = booking.programType || 'UNKNOWN';
        if (!programTypeStats[type]) programTypeStats[type] = { label: type, confirmed: 0, pencil: 0, totalRooms: 0 };
        const numRooms = booking.numberOfRooms || 0;
        if (booking.bookingStatus === 'confirmed') programTypeStats[type].confirmed += numRooms;
        else if (booking.bookingStatus === 'pencil') programTypeStats[type].pencil += numRooms;
        programTypeStats[type].totalRooms += numRooms;
    });
    return programTypeStats;
};
