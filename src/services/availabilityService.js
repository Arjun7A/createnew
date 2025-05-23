// src/services/availabilityService.js
import { TOTAL_ROOMS } from '../constants';

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
    bookings.push(newBookingToStore); // newBookingToStore already has UTC Date objects
    localStorage.setItem(CONFIRMED_BOOKINGS_STORAGE_KEY, JSON.stringify(convertBookingsForStorage(bookings)));
  } else if (newBookingToStore.bookingStatus === 'pencil') {
    let bookings = getPencilBookings().filter(b => b.id !== newBookingToStore.id);
    bookings.push(newBookingToStore); // newBookingToStore already has UTC Date objects
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
  } else {
      // If original status is unknown or different, it might not exist in those lists.
      // This is okay as saveBooking will add it to the correct new list.
  }

  const bookingToSave = { ...updatedBookingData, id: bookingId }; // bookingToSave has UTC Date objects
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
