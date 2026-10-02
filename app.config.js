// Extends app.json with values that must not be committed.
// GOOGLE_MAPS_ANDROID_API_KEY comes from .env.local (gitignored), which Expo
// loads automatically. react-native-maps on Android needs it or the map crashes.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...config.android?.config,
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    },
  },
});
