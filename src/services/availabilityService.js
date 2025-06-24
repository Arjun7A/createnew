// src/services/availabilityService.js
import { supabase } from '../supabaseClient';
import { TOTAL_ROOMS, PROGRAM_TYPES } from '../constants';

const normalizeDate = (dateInput) => {
  if (!dateInput) return null;
  const d = new Date(dateInput); 
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const toSupabaseDate = (date) => date ? date.toISOString() : null;

// --- CORE BOOKING FUNCTIONS (SUPABASE) ---

export const getConsolidatedBookingsForDisplay = async () => {
    const { data, error } = await supabase.from('bookings').select('*').order('start_date', { ascending: true });
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
        institutionalBookingDetails: b.institutional_booking_details
    }));
};

export const getAllBookings = getConsolidatedBookingsForDisplay;

export const saveBooking = async (bookingData) => {
    const { startDate, endDate, numberOfRooms } = bookingData;
    if (!startDate || !endDate || startDate >= endDate) throw new Error("Invalid date range.");

    const availability = await checkAvailabilityForRange(startDate, endDate, numberOfRooms);
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
    };
    const { error } = await supabase.from('bookings').insert([payload]);
    if (error) throw new Error(error.message);
};

export const updateBooking = async (bookingId, originalBookingStatus, updatedBookingData) => {
    const { startDate, endDate, numberOfRooms } = updatedBookingData;
    if (!startDate || !endDate || startDate >= endDate) throw new Error("Invalid date range for update.");
    
    const availability = await checkAvailabilityForRange(startDate, endDate, numberOfRooms, [{id: bookingId}]);
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

export const checkAvailabilityForRange = async (slotStartDate, slotEndDateExclusive, numberOfRooms, bookingsToExclude = []) => {
    if (!slotStartDate || !slotEndDateExclusive || slotStartDate >= slotEndDateExclusive) return { isAvailable: false, minAvailableRoomsInPeriod: 0, error: "Invalid date range." };
    
    const query = supabase.from('bookings').select('start_date, end_date, number_of_rooms, id')
        .lt('start_date', toSupabaseDate(slotEndDateExclusive))
        .gt('end_date', toSupabaseDate(slotStartDate));

    if (bookingsToExclude.length > 0) {
        query.not('id', 'in', `(${bookingsToExclude.map(b => b.id).join(',')})`);
    }
    const { data: overlappingBookings, error } = await query;
    if (error) throw error;

    let minAvailableOnAnyDay = TOTAL_ROOMS;
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
        const availableOnDay = TOTAL_ROOMS - roomsBookedOnDay;
        dailyBreakdown[dayStart.toISOString().split('T')[0]] = availableOnDay;
        minAvailableOnAnyDay = Math.min(minAvailableOnAnyDay, availableOnDay);
    }
    return { isAvailable: minAvailableOnAnyDay >= numberOfRooms, minAvailableRoomsInPeriod: minAvailableOnAnyDay, dailyBreakdown };
};

export const findAvailableSlots = async (earliestCheckInDayUTC, latestCheckOutDayUTC, durationNights, numberOfRooms) => {
    const availableSlots = [];
    let currentDay = new Date(earliestCheckInDayUTC);
    while (true) {
        const checkoutDay = new Date(currentDay);
        checkoutDay.setUTCDate(checkoutDay.getUTCDate() + durationNights);
        if (checkoutDay > latestCheckOutDayUTC) break;

        const availability = await checkAvailabilityForRange(currentDay, checkoutDay, numberOfRooms);
        if (availability.isAvailable) {
            availableSlots.push({ startDate: new Date(currentDay), endDate: checkoutDay, minAvailableRoomsInSlot: availability.minAvailableRoomsInPeriod });
        }
        currentDay.setUTCDate(currentDay.getUTCDate() + 1);
    }
    return availableSlots;
};

export const getBookingsInPeriod = async (periodStartUTC, periodEndUTC) => {
    if (!periodStartUTC || !periodEndUTC || periodStartUTC >= periodEndUTC) return [];
    const { data, error } = await supabase.from('bookings').select('*')
        .lt('start_date', toSupabaseDate(periodEndUTC))
        .gt('end_date', toSupabaseDate(periodStartUTC));
    if (error) throw error;
    return data.map(b => ({ ...b, startDate: normalizeDate(b.start_date), endDate: normalizeDate(b.end_date) }));
};

export const getSingleDayOccupancy = async (dateUTC) => {
    if (!dateUTC) return { date: null, confirmed: 0, pencil: 0, totalBooked: 0, available: TOTAL_ROOMS };
    const dayStart = normalizeDate(dateUTC);
    const dayEnd = new Date(dayStart); dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const { data, error } = await supabase.from('bookings').select('number_of_rooms, status')
        .lt('start_date', toSupabaseDate(dayEnd))
        .gt('end_date', toSupabaseDate(dayStart));
    if (error) throw error;
    
    let confirmed = 0, pencil = 0;
    data.forEach(b => {
        if (b.status === 'confirmed') confirmed += b.number_of_rooms;
        else if (b.status === 'pencil') pencil += b.number_of_rooms;
    });
    const totalBooked = confirmed + pencil;
    return { date: dayStart, confirmed, pencil, totalBooked, available: TOTAL_ROOMS - totalBooked };
};
