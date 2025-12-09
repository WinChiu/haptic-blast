# Haptic Navigator

Haptic Navigator is a mobile-friendly React Native application that provides map-based navigation with optional haptic guidance.
Users can search for locations, plot routes, and enter a navigation mode with clear distance and time indicators.

This project includes:

- A custom mobile map using `react-native-maps` with self-hosted tiles
- Coordinate-based destination entry
- Walking-route generation via self-hosted GraphHopper
- Navigation mode with Haptic and Audio feedback
- Directional guidance overlay with compass synchronization
- Debug mode for simulating location updates

---

## Running the Self-Hosted Map Server

This project uses a self-hosted map server (TileServer GL + GraphHopper) via Docker.

### Prerequisites

- Docker and Docker Compose installed.
- Map data files placed in `map-server/data/`:
  - `tiles.mbtiles` (for TileServer)
  - `stockholm.osm.pbf` (for GraphHopper)

### Start Server

1. Navigate to the server directory:
   ```bash
   cd map-server
   ```
2. Start the services:
   ```bash
   docker-compose up -d
   ```
3. The server will be available at `http://localhost:80`.
   - Tiles: `http://localhost:80/styles/basic-preview/`
   - Routing: GraphHopper API exposed via Nginx proxy.
