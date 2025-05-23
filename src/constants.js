// src/constants.js
export const TOTAL_ROOMS = 133;

export const PROGRAM_TYPES = [
  { value: 'OPEN_LDP', label: 'Open LDP' },
  { value: 'CUSTOM_LDP', label: 'Custom LDP' },
  { value: 'OPEN_MDP', label: 'Open MDP' },
  { value: 'CTP', label: 'CTP' },
  { value: 'OTHER_BOOKINGS', label: 'Other Bookings' }
];

export const OTHER_BOOKING_CATEGORIES = [
  { value: '', label: 'Select Category...' },
  { value: 'DIRECTOR_DEAN_OFFICE', label: 'Director/Dean office' },
  { value: 'PROGRAMME_OFFICE', label: 'Programme office' },
  { value: 'CONFERENCE', label: 'Conference' },
  { value: 'CLIENT_BOOKINGS', label: 'Client bookings' }
];
