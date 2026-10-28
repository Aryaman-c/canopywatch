import maplibregl from "maplibre-gl";
import { empty, bounds, basemap } from "../lib/forest.js";

export function createForestMap(containerEl, { onSelect, initialCenter = [76.132, 11.685] } = {}) {
  let ready = false;
  let currentFeatures = [];
  let currentSelected = null;
  let isSatellite = true;
  let isShowPatches = true;
  let map = null;

  try {
    map = new maplibregl.Map({
      container: containerEl,
      style: basemap(isSatellite),
      center: initialCenter,
      zoom: 11,
      maxZoom: 17,
      attributionControl: true,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right"
    );

    map.on("load", () => {
      map.addSource("patches", { type: "geojson", data: empty });
      map.addLayer({
        id: "patch-fill",
        type: "fill",
        source: "patches",
        paint: { "fill-color": "#f59b42", "fill-opacity": 0.45 },
      });
      map.addLayer({
        id: "patch-line",
        type: "line",
        source: "patches",
        paint: { "line-color": "#ffb96f", "line-width": 1.6 },
      });
      map.addLayer({
        id: "selected",
        type: "line",
        source: "patches",
        filter: ["==", ["id"], -1],
        paint: { "line-color": "#fff2a8", "line-width": 3 },
      });

      map.on("click", "patch-fill", (event) => {
        const id = event.features?.[0]?.id;
        const found = currentFeatures.find((f) => f.id === id) ?? null;
        if (onSelect) onSelect(found);
      });

      map.on("mouseenter", "patch-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "patch-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      ready = true;
      if (currentFeatures.length) {
        updateFeatures(currentFeatures);
        fitAll();
      }
      if (currentSelected) {
        setSelected(currentSelected);
      }
    });
  } catch (err) {
    console.error("MapLibre WebGL error:", err);
  }

  function updateFeatures(features) {
    currentFeatures = features;
    if (!ready || !map) return;
    const source = map.getSource("patches");
    if (source) {
      source.setData({ type: "FeatureCollection", features });
    }
  }

  function setSelected(selected) {
    currentSelected = selected;
    if (!ready || !map) return;
    map.setFilter("selected", ["==", ["id"], selected?.id ?? -1]);
    if (selected) {
      map.fitBounds(bounds([selected]), {
        padding: 100,
        maxZoom: 17,
        duration: 700,
      });
    }
  }

  function setSatellite(satellite) {
    isSatellite = satellite;
    if (!ready || !map) return;
    const baseSource = map.getSource("base");
    if (baseSource) {
      baseSource.setTiles(basemap(satellite).sources.base.tiles);
    }
  }

  function setShowPatches(show) {
    isShowPatches = show;
    if (!ready || !map) return;
    ["patch-fill", "patch-line", "selected"].forEach((id) => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", show ? "visible" : "none");
      }
    });
  }

  function fitAll() {
    if (!ready || !map || !currentFeatures.length) return;
    map.fitBounds(bounds(currentFeatures), {
      padding: 65,
      maxZoom: 15,
      duration: 800,
    });
  }

  function resize() {
    if (map) map.resize();
  }

  function destroy() {
    ready = false;
    if (map) {
      map.remove();
      map = null;
    }
  }

  return {
    updateFeatures,
    setSelected,
    setSatellite,
    setShowPatches,
    fitAll,
    resize,
    destroy,
  };
}
