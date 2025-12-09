export const CONFIG = {
  // REPLACE with your computer's local IP address if running on a physical device.
  // Use 'http://10.0.2.2' for Android Emulator.
  // Use 'http://localhost' for iOS Simulator.
  MAP_SERVER_URL: 'http://192.168.0.191',
};

export const API_ENDPOINTS = {
  //   TILES: `${CONFIG.MAP_SERVER_URL}:8080/styles/basic/{z}/{x}/{y}.png`,
  //   ROUTING: `${CONFIG.MAP_SERVER_URL}:8989/route`,
  TILES: `${CONFIG.MAP_SERVER_URL}/styles/basic/{z}/{x}/{y}.png`,
  ROUTING: `${CONFIG.MAP_SERVER_URL}/route`,
};
