# CanopyWatch — Western Ghats Deforestation Monitoring

A pure Vanilla JavaScript and MapLibre GL web application for detecting, exploring, and reviewing candidate deforestation patches in **Wayanad, Kerala (Western Ghats, India)**.

## Overview
This platform visualizes satellite-detected canopy loss across the ecologically sensitive Western Ghats. It allows environmental researchers, auditors, and citizens to inspect candidate tree loss patches, compare historical satellite passes before and after the event, record field assessments, and export verified reports.

## Features
- **Pure JavaScript Stack**: Lightweight, high-performance UI without framework bloat (React removed, pure ES modules with MapLibre GL and Vite).
- **Satellite & Street Basemaps**: Powered by Esri World Imagery and Carto basemaps.
- **Before vs After Dual Viewer**: Synchronized comparison of historical satellite imagery from distinct dates corresponding to the comparison periods.
- **Area Measurements**: Hectares calculated for each detected loss patch.
- **Interactive Auditing & Notes**: Mark patches as *Visually Supported*, *Needs Investigation*, or *Uncertain*, and save notes locally in browser `localStorage`.
- **JSON Backup Sync**: Export all reviews as JSON and import across browsers or team members with conflict resolution.
- **Standalone HTML Report Generation**: Download print-ready, auditable HTML reports with embedded coordinate bounding boxes and metadata.

## Region & Seasonality (Western Ghats, India)
- **Location**: Wayanad District, Kerala (`76.132°E, 11.685°N`), Nilgiri Biosphere / Western Ghats.
- **Projection**: UTM Zone 43N (`EPSG:32643`).
- **Cloud-Free Window**: Due to heavy Southwest Monsoon cloud cover from June to September, the monitoring pipeline analyzes post-monsoon and dry season months (November to January/February) to ensure clear optical Sentinel-2 scenes.

## Running Locally
```bash
# Install dependencies
npm install

# Start Vite dev server
npm run dev

# Run unit tests
npm test

# Build production bundle
npm run build
```

## Data Pipeline
- `forest-monitor.js`: Google Earth Engine script for querying Google Dynamic World tree probabilities (`GOOGLE/DYNAMICWORLD/V1`) and Copernicus Sentinel-2 surface reflectance (`COPERNICUS/S2_SR_HARMONIZED`).
- `scripts/prepare_imagery.py` & `scripts/optimize_imagery.py`: Image reprojection and optimization pipeline using Rasterio and Pillow.
- `scripts/generate_western_ghats_data.py`: Generator for realistic candidate patch datasets and manifest metadata for the Western Ghats.