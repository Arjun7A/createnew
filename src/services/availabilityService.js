// src/services/availabilityService.js
import { supabase } from '../supabaseClient';
import { TOTAL_ROOMS, PROGRAM_TYPES, getTotalRoomsForType } from '../constants';

const normalizeDate = (dateInput) => {
  if (!dateInput) return null;
  const d = new Date(dateInput); 
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const toSupabaseDate = (date) => date ? date.toISOString() : null;

// --- CORE BOOKING FUNCTIONS (SUPABASE) ---

export const getConsolidatedBookingsForDisplay = async (roomType = null) => {
    let query = supabase.from('bookings').select('*').order('start_date', { ascending: true });
    
    // Filter by room type if specified and not 'ALL'
    // For dashboard/analytics, pass null or 'ALL' to get all room types
    if (roomType && roomType !== 'ALL' && roomType !== null) {
        query = query.eq('room_type', roomType);
    }
    
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data.map(b => ({ 
        ...b, 
        startDate: normalizeDate(b.start_date), 
        endDate: normalizeDate(b.end_date), 
        bookingStatus: b.status,
        programTitle: b.program_title,
        numberOfRooms: b.number_of_rooms,
        programType: b.program_type,
        otherBookingCategory: b.other_booking_category,
        institutionalBookingDetails: b.institutional_booking_details,
        roomType: b.room_type
    }));
};

export const getAllBookings = () => getConsolidatedBookingsForDisplay();

export const saveBooking = async (bookingData) => {
    const { startDate, endDate, numberOfRooms, roomType } = bookingData;
    if (!startDate || !endDate || startDate >= endDate) throw new Error("Invalid date range.");
    if (!roomType) throw new Error("Room type is required.");

    const availability = await checkAvailabilityForRange(startDate, endDate, numberOfRooms, [], roomType);
    if (!availability.isAvailable) throw new Error(`Booking failed: Only ${availability.minAvailableRoomsInPeriod} rooms available.`);

    const payload = {
        program_title: bookingData.programTitle,
        program_type: bookingData.programType,
        other_booking_category: bookingData.otherBookingCategory || null,
        institutional_booking_details: bookingData.institutionalBookingDetails || null,
        number_of_rooms: bookingData.numberOfRooms,
        status: bookingData.bookingStatus,
        start_date: toSupabaseDate(startDate),
        end_date: toSupabaseDate(endDate),
        room_type: roomType,
    };
    const { error } = await supabase.from('bookings').insert([payload]);
    if (error) throw new Error(error.message);
};

export const updateBooking = async (bookingId, originalBookingStatus, updatedBookingData) => {
    const { startDate, endDate, numberOfRooms, roomType } = updatedBookingData;
    if (!startDate || !endDate || startDate >= endDate) throw new Error("Invalid date range for update.");
    if (!roomType) throw new Error("Room type is required.");
    
    const availability = await checkAvailabilityForRange(startDate, endDate, numberOfRooms, [{id: bookingId}], roomType);
    if (!availability.isAvailable) throw new Error(`Update failed: Only ${availability.minAvailableRoomsInPeriod} rooms available.`);

    const payload = {
        program_title: updatedBookingData.programTitle,
        program_type: updatedBookingData.programType,
        other_booking_category: updatedBookingData.otherBookingCategory || null,
        institutional_booking_details: updatedBookingData.institutionalBookingDetails || null,
        number_of_rooms: numberOfRooms,
        status: updatedBookingData.bookingStatus,
        start_date: toSupabaseDate(startDate),
        end_date: toSupabaseDate(endDate),
        room_type: roomType,
    };

    const { error } = await supabase.from('bookings').update(payload).eq('id', bookingId);
    if (error) throw new Error(error.message);
};

export const deleteBooking = async (bookingId) => {
    const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
    if (error) throw new Error(error.message);
    return { success: true };
};

// --- AVAILABILITY & ANALYTICS FUNCTIONS (SUPABASE) ---

export const checkAvailabilityForRange = async (slotStartDate, slotEndDateExclusive, numberOfRooms, bookingsToExclude = [], roomType = 'MDC') => {
    if (!slotStartDate || !slotEndDateExclusive || slotStartDate >= slotEndDateExclusive) return { isAvailable: false, minAvailableRoomsInPeriod: 0, error: "Invalid date range." };
    
    const totalRoomsForType = getTotalRoomsForType(roomType);
    
    let query = supabase.from('bookings').select('start_date, end_date, number_of_rooms, id')
        .eq('room_type', roomType)
        .lt('start_date', toSupabaseDate(slotEndDateExclusive))
        .gt('end_date', toSupabaseDate(slotStartDate));

    if (bookingsToExclude.length > 0) {
        query.not('id', 'in', `(${bookingsToExclude.map(b => b.id).join(',')})`);
    }
    const { data: overlappingBookings, error } = await query;
    if (error) throw error;

    let minAvailableOnAnyDay = totalRoomsForType;
    const dailyBreakdown = {};
    for (let d = new Date(slotStartDate); d < slotEndDateExclusive; d.setUTCDate(d.getUTCDate() + 1)) {
        const dayStart = normalizeDate(d);
        const roomsBookedOnDay = overlappingBookings.reduce((acc, b) => {
            const bookingStart = normalizeDate(b.start_date);
            const bookingEnd = normalizeDate(b.end_date);
            if (bookingStart < new Date(dayStart.getTime() + 24*60*60*1000) && bookingEnd > dayStart) {
                return acc + b.number_of_rooms;
            }
            return acc;
        }, 0);
        const availableOnDay = totalRoomsForType - roomsBookedOnDay;
        dailyBreakdown[dayStart.toISOString().split('T')[0]] = availableOnDay;
        minAvailableOnAnyDay = Math.min(minAvailableOnAnyDay, availableOnDay);
    }
    return { isAvailable: minAvailableOnAnyDay >= numberOfRooms, minAvailableRoomsInPeriod: minAvailableOnAnyDay, dailyBreakdown };
};

export const findAvailableSlots = async (earliestCheckInDayUTC, latestCheckOutDayUTC, durationNights, numberOfRooms, roomType = 'MDC') => {
    const availableSlots = [];
    let currentDay = new Date(earliestCheckInDayUTC);
    while (true) {
        const checkoutDay = new Date(currentDay);
        checkoutDay.setUTCDate(checkoutDay.getUTCDate() + durationNights);
        if (checkoutDay > latestCheckOutDayUTC) break;

        const availability = await checkAvailabilityForRange(currentDay, checkoutDay, numberOfRooms, [], roomType);
        if (availability.isAvailable) {
            availableSlots.push({ startDate: new Date(currentDay), endDate: checkoutDay, minAvailableRoomsInSlot: availability.minAvailableRoomsInPeriod });
        }
        currentDay.setUTCDate(currentDay.getUTCDate() + 1);
    }
    return availableSlots;
};

export const getBookingsInPeriod = async (periodStartUTC, periodEndUTC, roomType = null) => {
    if (!periodStartUTC || !periodEndUTC || periodStartUTC >= periodEndUTC) return [];
    
    let query = supabase.from('bookings').select('*')
        .lt('start_date', toSupabaseDate(periodEndUTC))
        .gt('end_date', toSupabaseDate(periodStartUTC));
    
    // For specific room type booking operations, filter by room type
    // For dashboard/analytics, pass null or 'ALL' to get all types
    if (roomType && roomType !== 'ALL' && roomType !== null) {
        query = query.eq('room_type', roomType);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data.map(b => ({ ...b, startDate: normalizeDate(b.start_date), endDate: normalizeDate(b.end_date) }));
};

export const getSingleDayOccupancy = async (dateUTC, roomType = 'MDC') => {
    if (!dateUTC) {
        const totalRoomsForType = getTotalRoomsForType(roomType);
        return { date: null, confirmed: 0, pencil: 0, totalBooked: 0, available: totalRoomsForType };
    }
    
    const totalRoomsForType = getTotalRoomsForType(roomType);
    const dayStart = normalizeDate(dateUTC);
    const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const { data, error } = await supabase.from('bookings').select('number_of_rooms, status')
        .eq('room_type', roomType)
        .lt('start_date', toSupabaseDate(dayEnd))
        .gt('end_date', toSupabaseDate(dayStart));
    if (error) throw error;
    
    let confirmed = 0, pencil = 0;
    data.forEach(b => {
        if (b.status === 'confirmed') confirmed += b.number_of_rooms;
        else if (b.status === 'pencil') pencil += b.number_of_rooms;
    });
    const totalBooked = confirmed + pencil;
    return { date: dayStart, confirmed, pencil, totalBooked, available: totalRoomsForType - totalBooked };
};

// --- DASHBOARD & ANALYTICS FUNCTIONS (ALL ROOM TYPES) ---

export const getAllRoomTypesOccupancy = async (dateUTC) => {
    if (!dateUTC) {
        const mdcTotal = getTotalRoomsForType('MDC');
        const tataTotal = getTotalRoomsForType('TATA_HALL');
        const suitesTotal = getTotalRoomsForType('MDC_SUITES');
        const totalAllRooms = mdcTotal + tataTotal + suitesTotal;
        return { 
            date: null, 
            confirmed: 0, 
            pencil: 0, 
            totalBooked: 0, 
            available: totalAllRooms,
            byRoomType: {
                MDC: { confirmed: 0, pencil: 0, totalBooked: 0, available: mdcTotal },
                TATA_HALL: { confirmed: 0, pencil: 0, totalBooked: 0, available: tataTotal },
                MDC_SUITES: { confirmed: 0, pencil: 0, totalBooked: 0, available: suitesTotal }
            }
        };
    }
    
    const dayStart = normalizeDate(dateUTC);
    const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // Get all bookings for this date (all room types)
    const { data, error } = await supabase.from('bookings').select('number_of_rooms, status, room_type')
        .lt('start_date', toSupabaseDate(dayEnd))
        .gt('end_date', toSupabaseDate(dayStart));
    if (error) throw error;
    
    // Initialize counters
    let totalConfirmed = 0, totalPencil = 0;
    const byRoomType = {
        MDC: { confirmed: 0, pencil: 0, totalBooked: 0, available: getTotalRoomsForType('MDC') },
        TATA_HALL: { confirmed: 0, pencil: 0, totalBooked: 0, available: getTotalRoomsForType('TATA_HALL') },
        MDC_SUITES: { confirmed: 0, pencil: 0, totalBooked: 0, available: getTotalRoomsForType('MDC_SUITES') }
    };
    
    // Process bookings
    data.forEach(b => {
        const roomType = b.room_type;
        const rooms = b.number_of_rooms;
        
        if (b.status === 'confirmed') {
            totalConfirmed += rooms;
            if (byRoomType[roomType]) byRoomType[roomType].confirmed += rooms;
        } else if (b.status === 'pencil') {
            totalPencil += rooms;
            if (byRoomType[roomType]) byRoomType[roomType].pencil += rooms;
        }
    });
    
    // Calculate totals
    Object.keys(byRoomType).forEach(type => {
        byRoomType[type].totalBooked = byRoomType[type].confirmed + byRoomType[type].pencil;
        byRoomType[type].available -= byRoomType[type].totalBooked;
    });
    
    const totalBooked = totalConfirmed + totalPencil;
    const totalAllRooms = getTotalRoomsForType('MDC') + getTotalRoomsForType('TATA_HALL') + getTotalRoomsForType('MDC_SUITES');
    
    return { 
        date: dayStart, 
        confirmed: totalConfirmed, 
        pencil: totalPencil, 
        totalBooked, 
        available: totalAllRooms - totalBooked,
        byRoomType 
    };
};

export const getAllRoomTypesBookingsInPeriod = async (periodStartUTC, periodEndUTC) => {
    if (!periodStartUTC || !periodEndUTC || periodStartUTC >= periodEndUTC) return [];
    
    // Get all bookings for the period (all room types)
    const { data, error } = await supabase.from('bookings').select('*')
        .lt('start_date', toSupabaseDate(periodEndUTC))
        .gt('end_date', toSupabaseDate(periodStartUTC));
    
    if (error) throw error;
    return data.map(b => ({ ...b, startDate: normalizeDate(b.start_date), endDate: normalizeDate(b.end_date) }));
};

export const getAllRoomTypesAnalytics = async (periodStartUTC, periodEndUTC) => {
    const allBookings = await getAllRoomTypesBookingsInPeriod(periodStartUTC, periodEndUTC);
    
    const analytics = {
        totalBookings: allBookings.length,
        totalRoomsBooked: allBookings.reduce((sum, b) => sum + b.number_of_rooms, 0),
        byRoomType: {
            MDC: { bookings: 0, rooms: 0, revenue: 0 },
            TATA_HALL: { bookings: 0, rooms: 0, revenue: 0 },
            MDC_SUITES: { bookings: 0, rooms: 0, revenue: 0 }
        },
        byStatus: {
            confirmed: { bookings: 0, rooms: 0 },
            pencil: { bookings: 0, rooms: 0 }
        },
        byProgramType: {}
    };
    
    allBookings.forEach(booking => {
        const roomType = booking.room_type;
        const status = booking.status;
        const programType = booking.program_type || 'Other';
        const rooms = booking.number_of_rooms;
        
        // By room type
        if (analytics.byRoomType[roomType]) {
            analytics.byRoomType[roomType].bookings++;
            analytics.byRoomType[roomType].rooms += rooms;
        }
        
        // By status
        if (analytics.byStatus[status]) {
            analytics.byStatus[status].bookings++;
            analytics.byStatus[status].rooms += rooms;
        }
        
        // By program type
        if (!analytics.byProgramType[programType]) {
            analytics.byProgramType[programType] = { bookings: 0, rooms: 0 };
        }
        analytics.byProgramType[programType].bookings++;
        analytics.byProgramType[programType].rooms += rooms;
    });
    
    return analytics;
};

// --- EXISTING SINGLE ROOM TYPE FUNCTIONS (KEEP FOR BOOKING FORMS) ---