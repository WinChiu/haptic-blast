# Self-Hosted Map + Routing Server Specification

Use OpenStreetMap + OpenMapTiles + TileServer GL + GraphHopper  
Target: React Native + Expo app without external map API restrictions

## 1. System Goals
- Provide map tiles without commercial API limits.
- Self-hosted routing API.
- Integrate with React Native / Expo (react-native-maps or MapLibre).
- All data sourced from OpenStreetMap.

## 2. Architecture Overview
```
React Native App
   |
HTTP/HTTPS
   |
------------------------------
|                            |
TileServer GL                GraphHopper API
|                            |
.mbtiles                     OSM .pbf
```

## 3. Components
### 3.1 Map Tiles
- Use OpenMapTiles to generate `.mbtiles`.
- Use TileServer GL to serve raster & vector tiles.

### 3.2 Routing
- Use GraphHopper for driving/walking/cycling routing.

## 4. Installation Specification
### 4.1 Acquire OSM Data
Download region data:
https://download.geofabrik.de/europe/sweden-latest.osm.pbf

### 4.2 Generate Tiles via OpenMapTiles
```
git clone https://github.com/openmaptiles/openmaptiles
cd openmaptiles
docker compose pull
docker compose run generate-sweden
```
Output: `data/tiles.mbtiles`

### 4.3 Run TileServer GL
```
docker run -d -p 8080:80   -v /path/to/tiles.mbtiles:/data/tiles.mbtiles   maptiler/tileserver-gl
```

### 4.4 Install GraphHopper
```
wget https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/11.0/graphhopper-web-11.0.jar
wget https://raw.githubusercontent.com/graphhopper/graphhopper/11.x/config-example.yml
wget https://download.geofabrik.de/europe/sweden-latest.osm.pbf

java -D"dw.graphhopper.datareader.file=sweden-latest.osm.pbf"      -jar graphhopper-web-11.0.jar server config-example.yml
```

Routing API:
```
http://SERVER_IP:8989/route?point=lat,lon&point=lat2,lon2&profile=car
```

## 5. React Native Integration
### 5.1 react-native-maps
```tsx
<MapView style={{ flex: 1 }}>
  <UrlTile
    urlTemplate="http://SERVER_IP:8080/styles/basic/{z}/{x}/{y}.png"
    maximumZ={19}
  />
</MapView>
```

### 5.2 MapLibre
```tsx
<MapLibreGL.MapView style={{ flex: 1 }} styleURL="http://SERVER_IP:8080/styles/basic/style.json">
  <MapLibreGL.Camera zoomLevel={13} centerCoordinate={[18.06, 59.33]} />
</MapLibreGL.MapView>
```

### 5.3 Fetch Route
```ts
const res = await fetch(
  "http://SERVER_IP:8989/route?point=59.33,18.06&point=59.36,18.03&profile=car&points_encoded=false"
);
const data = await res.json();
const coords = data.paths[0].points.coordinates;
```

## 6. Performance Requirements
- Recommended: 4 vCPU, 8GB RAM, SSD.
- Optional caching proxy (Nginx + Cloudflare).

## 7. Security Requirements
- HTTPS
- Optional JWT
- Rate limiting

## 8. Deliverables AI Should Generate
- Docker Compose files
- Setup scripts
- RN example component
- Nginx reverse proxy config
- Cron-based OSM updater

## 9. Expected Outcome
- Fully self-hosted mapping + routing backend.
- Zero reliance on Apple/Google/Mapbox.
- Unlimited usage (limited only by your server resources).
