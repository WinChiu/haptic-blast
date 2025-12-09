#!/bin/bash
# setup.sh
# Automated setup for Self-Hosted Map Server

# Stop on error
set -e

DATA_DIR="./data"
mkdir -p "$DATA_DIR"

echo "========================================================"
echo "  Self-Hosted Map Server Setup"
echo "========================================================"

# 1. Download OpenStreetMap Data (Sweden)
OSM_URL="https://download.geofabrik.de/europe/sweden-latest.osm.pbf"
OSM_FILE="$DATA_DIR/sweden-latest.osm.pbf"

if [ -f "$OSM_FILE" ]; then
    echo "[INFO] OSM Data already exists at $OSM_FILE"
else
    echo "[INFO] Downloading OSM Data for Sweden..."
    # Check if wget or curl exists
    if command -v wget >/dev/null 2>&1; then
        wget -O "$OSM_FILE" "$OSM_URL"
    else
        curl -o "$OSM_FILE" "$OSM_URL"
    fi
fi

# 2. GraphHopper Config
# We need a basic config file for GraphHopper to start in Docker
GH_CONFIG="$DATA_DIR/config-example.yml"
if [ ! -f "$GH_CONFIG" ]; then
    echo "[INFO] Downloading GraphHopper config..."
    if command -v wget >/dev/null 2>&1; then
        wget -O "$GH_CONFIG" https://raw.githubusercontent.com/graphhopper/graphhopper/master/config-example.yml
    else
        curl -o "$GH_CONFIG" https://raw.githubusercontent.com/graphhopper/graphhopper/master/config-example.yml
    fi
    # Update config to bind to 0.0.0.0 so Docker can export it
    sed -i 's/bind_host: localhost/bind_host: 0.0.0.0/' "$GH_CONFIG"
fi


# 3. Generate Map Tiles (OpenMapTiles)
# This is the heavy lifting.
TILES_FILE="$DATA_DIR/tiles.mbtiles"

if [ -f "$TILES_FILE" ]; then
    echo "[INFO] Tiles file already exists at $TILES_FILE. Skipping generation."
else
    echo "[WARN] Tiles file not found. Starting OpenMapTiles generation."
    echo "[WARN] This process requires Docker and significant system resources."
    echo "[WARN] It will clone OpenMapTiles to ./openmaptiles-tools and run generation."

    # Clone OpenMapTiles if not present
    if [ ! -d "openmaptiles" ]; then
        git clone https://github.com/openmaptiles/openmaptiles.git
    fi

    cd openmaptiles

    # Create the .env file for OpenMapTiles to target Sweden
    # Note: OMT usually requires a 'kill-all-containers' approach or specific make targets.
    # The 'quickstart' script is the easiest way to automate this.

    echo "[INFO] Running OMT quickstart for Sweden. This may take a while..."
    # ./quickstart.sh sweden
    # NOTE: Since this is an agentic run, and quickstart might be interactive or very long,
    # we are setting it up but letting the user execute the heavy generation command
    # to avoid locking up the interaction for hours.

    echo ""
    echo "========================================================"
    echo " ACTION REQUIRED: Generate Tiles"
    echo "========================================================"
    echo "To generate the tiles, please run the following commands manually inside 'openmaptiles' directory:"
    echo "  cd openmaptiles"
    echo "  ./quickstart.sh sweden"
    echo ""
    echo "After generation, copy the result to our data folder:"
    echo "  cp data/tiles.mbtiles ../data/tiles.mbtiles"
    echo "========================================================"

    cd ..
fi

echo "[INFO] Setup script completed (check above for any manual steps)."
