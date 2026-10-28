import maplibregl from "maplibre-gl";
import area from "@turf/area";

const empty = { type: "FeatureCollection", features: [] };
const format = (value) =>
  Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
const periodKey = (feature) =>
  `${feature.properties?.baseline_period || "Not provided"}|${feature.properties?.comparison_period || "Not provided"}`;
function dateLabel(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value || ""))
    return value || "Not provided";
  return new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
function comparisonGroups(features) {
  const groups = new Map();
  features.forEach((feature) => {
    const key = periodKey(feature);
    if (!groups.has(key))
      groups.set(key, {
        key,
        baseline: feature.properties.baseline_period,
        comparison: feature.properties.comparison_period,
        features: [],
        hectares: 0,
      });
    const group = groups.get(key);
    group.features.push(feature);
    group.hectares += feature.properties.area_hectares;
  });
  return [...groups.values()]
    .filter((group) =>
      [group.baseline, group.comparison].every((period) =>
        /^\d{4}-(0[1-9]|1[0-2])$/.test(period || ""),
      ),
    )
    .sort(
      (a, b) =>
        (a.comparison || "").localeCompare(b.comparison || "") ||
        (a.baseline || "").localeCompare(b.baseline || ""),
    );
}
function normalize(raw) {
  if (raw?.type !== "FeatureCollection" || !Array.isArray(raw.features))
    throw new Error("Choose a GeoJSON FeatureCollection containing polygons.");
  const numbers = new Map();
  const features = raw.features.map((feature, index) => {
    if (
      feature?.type !== "Feature" ||
      !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)
    )
      throw new Error(
        `Feature ${index + 1} must be a Polygon or MultiPolygon.`,
      );
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    if (
      !Array.isArray(polygons) ||
      !polygons.length ||
      polygons.some(
        (p) =>
          !Array.isArray(p) ||
          !p.length ||
          p.some(
            (r) =>
              !Array.isArray(r) ||
              r.length < 4 ||
              r.some(
                (c) =>
                  !Array.isArray(c) ||
                  c.length < 2 ||
                  !Number.isFinite(c[0]) ||
                  !Number.isFinite(c[1]) ||
                  Math.abs(c[0]) > 180 ||
                  Math.abs(c[1]) > 90,
              ) ||
              r[0][0] !== r.at(-1)[0] ||
              r[0][1] !== r.at(-1)[1],
          ),
      )
    )
      throw new Error(`Feature ${index + 1} has invalid polygon coordinates.`);
    const supplied = feature.properties?.area_hectares;
    const hectares =
      typeof supplied === "number" && Number.isFinite(supplied) && supplied >= 0
        ? supplied
        : area(feature) / 10000;
    const key = periodKey(feature),
      number = (numbers.get(key) || 0) + 1;
    numbers.set(key, number);
    return {
      ...feature,
      id: index,
      properties: {
        ...feature.properties,
        source_id: feature.properties?.source_id ?? feature.id ?? index,
        area_hectares: hectares,
        patch_number: number,
      },
    };
  });
  return { type: "FeatureCollection", features };
}
function bounds(features) {
  const result = new maplibregl.LngLatBounds();
  const visit = (coords) => {
    if (typeof coords[0] === "number") result.extend(coords.slice(0, 2));
    else coords.forEach(visit);
  };
  features.forEach((f) => visit(f.geometry.coordinates));
  return result;
}
function basemap(satellite) {
  const cartoKey = import.meta.env.VITE_CARTO_BASEMAP_KEY || "";
  return {
    version: 8,
    sources: {
      base: {
        type: "raster",
        tiles: [
          satellite
            ? "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            : `https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?key=${encodeURIComponent(cartoKey)}`,
        ],
        tileSize: 256,
        attribution:
          "Imagery © Esri, Maxar, Earthstar Geographics | Map © OpenStreetMap contributors © CARTO",
        // 256px tiles can request one level above the map's zoom.
        // Reuse level 17 imagery instead of requesting unavailable level 18 tiles.
        maxzoom: 17,
      },
    },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

export {
  empty,
  format,
  dateLabel,
  comparisonGroups,
  normalize,
  bounds,
  basemap,
};
