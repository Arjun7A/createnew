// src/constants.js
export const ROOM_TYPES = [
  { value: 'MDC', label: 'MDC', totalRooms: 133 },
  { value: 'TATA_HALL', label: 'Tata Hall', totalRooms: 60 },
  { value: 'MDC_SUITES', label: 'MDC Suites', totalRooms: 14 }
];

export const TOTAL_ROOMS = 133; // Keep for backward compatibility, will be dynamic based on room type

export const getTotalRoomsForType = (roomType) => {
  const roomTypeObj = ROOM_TYPES.find(rt => rt.value === roomType);
  return roomTypeObj ? roomTypeObj.totalRooms : 133;
};

export const getTotalRoomsAllTypes = () => {
  return ROOM_TYPES.reduce((sum, rt) => sum + rt.totalRooms, 0);
};

export const PROGRAM_TYPES = [
  { value: 'OPEN_LDP', label: 'Open LDP' },
  { value: 'CUSTOM_LDP', label: 'Custom LDP' },
  { value: 'OPEN_MDP', label: 'Open MDP' },
  { value: 'CTP', label: 'CTP' },
  { value: 'INSTITUTIONAL_BOOKINGS', label: 'Institutional Bookings' },
  { value: 'OTHER_BOOKINGS', label: 'Other Bookings' }
];
