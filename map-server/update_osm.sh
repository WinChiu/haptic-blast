#!/bin/bash
# update_osm.sh
# Cron-friendly script to update map data

DATA_DIR="./data"
OSM_URL="https://download.geofabrik.de/europe/sweden-latest.osm.pbf"
OSM_FILE="$DATA_DIR/sweden-latest.osm.pbf"

echo "[INFO] Starting Map Data Update: $(date)"

# 1. Download new PBF
echo "[INFO] Downloading latest OSM data..."
mv "$OSM_FILE" "$OSM_FILE.bak"
if command -v wget >/dev/null 2>&1; then
    wget -O "$OSM_FILE" "$OSM_URL"
else
    curl -o "$OSM_FILE" "$OSM_URL"
fi

# 2. Re-generate Tiles
# This is too heavy for a simple cron usually, but here is the logic.
# cd openmaptiles && ./quickstart.sh sweden && cp data/tiles.mbtiles ../data/tiles.mbtiles

echo "[INFO] Note: Tile regeneration is disabled in this auto-update script due to high resource usage."
echo "[INFO] To enable, uncomment the line in the script."

# 3. Restart GraphHopper to pick up new PBF (GraphHopper rebuilds graph on restart if file changed)
echo "[INFO] Restarting GraphHopper container..."
docker restart map-router

echo "[INFO] Update completed."
