// src/services/availabilityService.js

import { TOTAL_ROOMS } from '../constants'; // Import from constants.js

const CONFIRMED_BOOKINGS_STORAGE_KEY = 'hotel_confirmed_bookings_v2';
const PENCIL_BOOKINGS_STORAGE_KEY = 'hotel_pencil_bookings_v2';
// const TOTAL_ROOMS = 133; // Removed local definition

// --- Helper to parse bookings from JSON ---
const parseBookings = (bookingsJson) => {
  if (!bookingsJson) return [];
  try {
    return JSON.parse(bookingsJson).map(booking => ({
      ...booking,
      startDate: new Date(booking.startDate),
      endDate: new Date(booking.endDate)
    }));
  } catch (error) {
    console.error('Error parsing bookings from localStorage:', error);
    return [];
  }
};

// --- Getters for specific booking types ---
export const getConfirmedBookings = () => {
  return parseBookings(localStorage.getItem(CONFIRMED_BOOKINGS_STORAGE_KEY));
};

export const getPencilBookings = () => {
  return parseBookings(localStorage.getItem(PENCIL_BOOKINGS_STORAGE_KEY));
};

// --- Generic getBookings (combines for general display) ---
export const getBookings = () => { 
  const confirmed = getConfirmedBookings().map(b => ({...b, bookingStatus: 'confirmed'}));
  const pencil = getPencilBookings().map(b => ({...b, bookingStatus: 'pencil'}));
  return [...confirmed, ...pencil].sort((a,b) => new Date(a.startDate) - new Date(b.startDate));
};


// --- Internal Helper: Calculates availability against a given list ---
const calculateAvailabilityInternal = (startDateTime, endDateTime, numberOfRooms, bookingsList) => {
  const dateBookingMap = {};
  const checkInDateTime = new Date(startDateTime);
  const checkOutDateTime = new Date(endDateTime);

  const localCheckInDate = new Date(checkInDateTime.getFullYear(), checkInDateTime.getMonth(), checkInDateTime.getDate());
  const localCheckOutDate = new Date(checkOutDateTime.getFullYear(), checkOutDateTime.getMonth(), checkOutDateTime.getDate());

  let currentIterDate = new Date(localCheckInDate);
  while (currentIterDate <= localCheckOutDate) {
    const isoDateKey = `${currentIterDate.getFullYear()}-${String(currentIterDate.getMonth() + 1).padStart(2, '0')}-${String(currentIterDate.getDate()).padStart(2, '0')}`;
    dateBookingMap[isoDateKey] = 0;
    currentIterDate.setDate(currentIterDate.getDate() + 1);
  }

  bookingsList.forEach(booking => {
    const bookingStartDateTime = new Date(booking.startDate);
    const bookingEndDateTime = new Date(booking.endDate);

    if (bookingEndDateTime <= checkInDateTime || bookingStartDateTime >= checkOutDateTime) return;

    const bookingEffectStartDay = new Date(Math.max(bookingStartDateTime.getTime(), localCheckInDate.getTime()));
    bookingEffectStartDay.setHours(0,0,0,0);
    let bookingEffectEndDay = new Date(Math.min(bookingEndDateTime.getTime(), 
        new Date(localCheckOutDate.getFullYear(), localCheckOutDate.getMonth(), localCheckOutDate.getDate(), 23, 59, 59, 999).getTime()
    ));
    bookingEffectEndDay.setHours(0,0,0,0);

    let iterOverlapDate = new Date(bookingEffectStartDay);
    while (iterOverlapDate <= bookingEffectEndDay) {
      if (iterOverlapDate >= localCheckInDate && iterOverlapDate <= localCheckOutDate) {
        const isoDateKey = `${iterOverlapDate.getFullYear()}-${String(iterOverlapDate.getMonth() + 1).padStart(2, '0')}-${String(iterOverlapDate.getDate()).padStart(2, '0')}`;
        if (isoDateKey in dateBookingMap) {
          dateBookingMap[isoDateKey] += booking.numberOfRooms;
        }
      }
      iterOverlapDate.setDate(iterOverlapDate.getDate() + 1);
    }
  });

  let minAvailableRooms = TOTAL_ROOMS; // Using imported constant
  const isoDailyAvailability = {};
  Object.entries(dateBookingMap).forEach(([isoDateKey, bookedRooms]) => {
    const availableRooms = TOTAL_ROOMS - bookedRooms; // Using imported constant
    isoDailyAvailability[isoDateKey] = availableRooms;
    minAvailableRooms = Math.min(minAvailableRooms, availableRooms);
  });

  const dailyAvailabilityForDisplay = {};
  Object.keys(isoDailyAvailability).sort().forEach(isoKey => {
      const [year, month, day] = isoKey.split('-').map(Number);
      const displayDate = new Date(year, month - 1, day);
      dailyAvailabilityForDisplay[displayDate.toLocaleDateString()] = isoDailyAvailability[isoKey];
  });
  
  const checkInTimeStr = checkInDateTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  const checkOutTimeStr = checkOutDateTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

  return {
    available: minAvailableRooms >= numberOfRooms,
    availableRooms: minAvailableRooms,
    requestedRooms: numberOfRooms,
    dailyAvailability: dailyAvailabilityForDisplay,
    startDate: checkInDateTime,
    endDate: checkOutDateTime,
    checkInTime: checkInTimeStr,
    checkOutTime: checkOutTimeStr,
  };
};

export const checkRoomAvailability = (startDateTime, endDateTime, numberOfRooms, bookingTypeToMake) => {
  if (bookingTypeToMake === 'confirmed') {
    const confirmedBookings = getConfirmedBookings();
    return calculateAvailabilityInternal(startDateTime, endDateTime, numberOfRooms, confirmedBookings);
  } else { 
    const allBookings = [...getConfirmedBookings(), ...getPencilBookings()];
    return calculateAvailabilityInternal(startDateTime, endDateTime, numberOfRooms, allBookings);
  }
};

export const saveBooking = (bookingData) => {
  const newBookingId = Date.now();

  if (bookingData.bookingStatus === 'confirmed') {
    const currentConfirmedBookings = getConfirmedBookings();
    const availabilityResult = calculateAvailabilityInternal(
      bookingData.startDate,
      bookingData.endDate,
      bookingData.numberOfRooms,
      currentConfirmedBookings
    );

    if (availabilityResult.available) {
      const newConfirmedBooking = { ...bookingData, id: newBookingId };
      const updatedConfirmedBookings = [...currentConfirmedBookings, newConfirmedBooking];
      localStorage.setItem(CONFIRMED_BOOKINGS_STORAGE_KEY, JSON.stringify(updatedConfirmedBookings));

      const currentPencilBookings = getPencilBookings();
      const newConfirmedStart = new Date(newConfirmedBooking.startDate);
      const newConfirmedEnd = new Date(newConfirmedBooking.endDate);
      
      const pencilBookingsToKeep = currentPencilBookings.filter(pb => {
        const pencilStart = new Date(pb.startDate);
        const pencilEnd = new Date(pb.endDate);
        return !(newConfirmedStart < pencilEnd && newConfirmedEnd > pencilStart);
      });

      if (pencilBookingsToKeep.length < currentPencilBookings.length) {
        console.log(`Overridden ${currentPencilBookings.length - pencilBookingsToKeep.length} pencil booking(s).`);
        localStorage.setItem(PENCIL_BOOKINGS_STORAGE_KEY, JSON.stringify(pencilBookingsToKeep));
      }
      return newConfirmedBooking;
    } else {
      throw new Error(
        `Confirmed booking failed: Only ${availabilityResult.availableRooms} rooms available (considering other confirmed bookings).`
      );
    }
  } else if (bookingData.bookingStatus === 'pencil') {
    const allExistingBookings = [...getConfirmedBookings(), ...getPencilBookings()];
    const availabilityResult = calculateAvailabilityInternal(
      bookingData.startDate,
      bookingData.endDate,
      bookingData.numberOfRooms,
      allExistingBookings
    );

    if (availabilityResult.available) {
      const newPencilBooking = { ...bookingData, id: newBookingId };
      const updatedPencilBookings = [...getPencilBookings(), newPencilBooking];
      localStorage.setItem(PENCIL_BOOKINGS_STORAGE_KEY, JSON.stringify(updatedPencilBookings));
      return newPencilBooking;
    } else {
      throw new Error(
        `Pencil booking failed: Only ${availabilityResult.availableRooms} rooms available (considering all existing bookings).`
      );
    }
  } else {
    throw new Error("Invalid booking status provided.");
  }
};

export const getConsolidatedBookingsForDisplay = () => {
  const confirmedBookings = getConfirmedBookings().map(b => ({ ...b, bookingStatus: 'confirmed', type: 'Confirmed' }));
  const pencilBookings = getPencilBookings().map(b => ({ ...b, bookingStatus: 'pencil', type: 'Pencil' }));
  const allBookings = [...confirmedBookings, ...pencilBookings];

  const dailyRoomCounts = {}; 

  allBookings.forEach(booking => {
    const checkInDate = new Date(booking.startDate);
    checkInDate.setHours(0, 0, 0, 0);
    const checkOutDate = new Date(booking.endDate);
    checkOutDate.setHours(0, 0, 0, 0);

    let currentIterDate = new Date(checkInDate);
    while (currentIterDate <= checkOutDate) {
      const isoDateKey = `${currentIterDate.getFullYear()}-${String(currentIterDate.getMonth() + 1).padStart(2, '0')}-${String(currentIterDate.getDate()).padStart(2, '0')}`;
      if (!dailyRoomCounts[isoDateKey]) {
        dailyRoomCounts[isoDateKey] = { confirmed: 0, pencil: 0, total: 0 };
      }
      if (booking.bookingStatus === 'confirmed') {
        dailyRoomCounts[isoDateKey].confirmed += booking.numberOfRooms;
      } else {
        dailyRoomCounts[isoDateKey].pencil += booking.numberOfRooms;
      }
      dailyRoomCounts[isoDateKey].total += booking.numberOfRooms;
      currentIterDate.setDate(currentIterDate.getDate() + 1);
    }
  });

  const displayBookings = allBookings.filter(booking => {
    if (booking.bookingStatus === 'pencil') {
      let canShowPencil = true;
      const checkInDate = new Date(booking.startDate);
      checkInDate.setHours(0, 0, 0, 0);
      const checkOutDate = new Date(booking.endDate);
      checkOutDate.setHours(0, 0, 0, 0);
      
      let currentIterDate = new Date(checkInDate);
      while (currentIterDate <= checkOutDate) {
        const isoDateKey = `${currentIterDate.getFullYear()}-${String(currentIterDate.getMonth() + 1).padStart(2, '0')}-${String(currentIterDate.getDate()).padStart(2, '0')}`;
        if (dailyRoomCounts[isoDateKey] && dailyRoomCounts[isoDateKey].total > TOTAL_ROOMS) { // Using imported constant
          canShowPencil = false; 
          break;
        }
        currentIterDate.setDate(currentIterDate.getDate() + 1);
      }
      return canShowPencil;
    }
    return true; 
  });

  return displayBookings.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
};


export const updateBooking = (bookingId, originalBookingStatus, updatedBookingData) => {
  const newStatus = updatedBookingData.bookingStatus || originalBookingStatus;

  if (originalBookingStatus === 'confirmed') {
    const bookings = getConfirmedBookings();
    const updated = bookings.filter(b => b.id !== bookingId);
    localStorage.setItem(CONFIRMED_BOOKINGS_STORAGE_KEY, JSON.stringify(updated));
  } else if (originalBookingStatus === 'pencil') {
    const bookings = getPencilBookings();
    const updated = bookings.filter(b => b.id !== bookingId);
    localStorage.setItem(PENCIL_BOOKINGS_STORAGE_KEY, JSON.stringify(updated));
  } else {
      throw new Error("Invalid original booking status for update.");
  }

  try {
    return saveBooking({ ...updatedBookingData, id: bookingId, bookingStatus: newStatus });
  } catch (error) {
    console.error("Error saving updated booking after deleting original, data might be inconsistent:", error);
    throw error;
  }
};

export const deleteBooking = (bookingId, bookingStatus) => {
  if (bookingStatus === 'confirmed' || bookingStatus === 'Confirmed') {
    const bookings = getConfirmedBookings();
    const updatedBookings = bookings.filter(b => b.id !== bookingId);
    localStorage.setItem(CONFIRMED_BOOKINGS_STORAGE_KEY, JSON.stringify(updatedBookings));
  } else if (bookingStatus === 'pencil' || bookingStatus === 'Pencil') {
    const bookings = getPencilBookings();
    const updatedBookings = bookings.filter(b => b.id !== bookingId);
    localStorage.setItem(PENCIL_BOOKINGS_STORAGE_KEY, JSON.stringify(updatedBookings));
  } else {
     throw new Error(`Invalid booking status "${bookingStatus}" for delete operation.`);
  }
  return { success: true };
};

export const clearAllBookings = () => {
  localStorage.removeItem(CONFIRMED_BOOKINGS_STORAGE_KEY);
  localStorage.removeItem(PENCIL_BOOKINGS_STORAGE_KEY);
};

export const checkRoomAvailabilityForUpdate = (startDateTime, endDateTime, numberOfRooms, bookingIdToExclude, bookingStatusOfEditedBooking) => {
    let bookingsToCheckAgainst;
    if (bookingStatusOfEditedBooking === 'confirmed') {
        bookingsToCheckAgainst = getConfirmedBookings().filter(b => b.id !== bookingIdToExclude);
    } else { 
        const confirmed = getConfirmedBookings();
        const pencils = getPencilBookings().filter(b => b.id !== bookingIdToExclude);
        bookingsToCheckAgainst = [...confirmed, ...pencils];
    }
    return calculateAvailabilityInternal(startDateTime, endDateTime, numberOfRooms, bookingsToCheckAgainst);
};