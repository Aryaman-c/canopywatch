import maplibregl from "maplibre-gl";
import { bounds, dateLabel } from "../lib/forest.js";
import { renderPatchReview } from "./patch-review.js";
import { renderIcon } from "../lib/icons.js";

// Esri Wayback Historical Imagery Releases:
// Each release ID represents an actual distinct satellite capture from that specific date
const waybackReleases = {
  // Historical / Earlier dates (Before)
  "2020-01": "21485",
  "2022-11": "7110",
  "2024-02": "37965",
  "2024-07": "37965",
  "2024-08": "37965",
  "2024-12": "49849",
  "2025-01": "36557",
  
  // Later comparison dates (After)
  "2025-12": "13192",
  "2026-01": "22252",
  "2026-07": "63116",
  "2026-08": "63116",
  "2026-09": "63116",
};

function getTilesForPeriod(period, isAfter) {
  if (period && waybackReleases[period]) {
    return [
      `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${waybackReleases[period]}/{z}/{y}/{x}`
    ];
  }
  // Fallbacks: Earlier archive for Before, latest capture for After
  const defaultId = isAfter ? "63116" : "37965";
  return [
    `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${defaultId}/{z}/{y}/{x}`
  ];
}

export function showPatchComparison({ feature, imagery, review, onReview, storageError = "", onClose }) {
  const backdrop = document.createElement("div");
  backdrop.className = "comparison-backdrop";

  const patchNumber = String(feature.properties.patch_number).padStart(2, "0");
  const baseline = feature.properties.baseline_period;
  const comparison = feature.properties.comparison_period;

  backdrop.innerHTML = `
    <section class="image-comparison" role="dialog" aria-modal="true" aria-labelledby="image-comparison-title">
      <div class="image-comparison-heading">
        <div>
          <h2 id="image-comparison-title">Patch ${patchNumber} | Before & after</h2>
          <p>Pan or zoom either image to explore the same location.</p>
        </div>
        <button id="close-comparison" class="icon-button" aria-label="Close before and after">
          ${renderIcon("x", 20)}
        </button>
      </div>
      <div class="image-pair">
        <div>
          <div class="image-period">
            <strong>Before</strong>
            <span>${dateLabel(baseline)}</span>
          </div>
          <div class="comparison-map before-map" aria-label="Before satellite image"></div>
        </div>
        <div>
          <div class="image-period">
            <strong>After</strong>
            <span>${dateLabel(comparison)}</span>
          </div>
          <div class="comparison-map after-map" aria-label="After satellite image"></div>
        </div>
      </div>
      <p class="image-caption">
        <span></span>
        Orange outlines the detected patch.
      </p>
    </section>
  `;

  document.body.appendChild(backdrop);

  const dialog = backdrop.querySelector(".image-comparison");
  const closeBtn = backdrop.querySelector("#close-comparison");
  const beforeContainer = backdrop.querySelector(".before-map");
  const afterContainer = backdrop.querySelector(".after-map");

  // Append patch review directly to image-comparison so .image-comparison > .patch-review applies
  const reviewEl = renderPatchReview(feature, imagery, review, onReview, storageError);
  dialog.appendChild(reviewEl);

  const maps = [];
  let synchronizing = false;

  // Calculate tight bounding box centered closely on the patch polygon
  const initialBounds = bounds([feature]);
  const west = initialBounds.getWest();
  const east = initialBounds.getEast();
  const south = initialBounds.getSouth();
  const north = initialBounds.getNorth();

  const spanLng = Math.max(east - west, 0.0008);
  const spanLat = Math.max(north - south, 0.0008);
  const padLng = Math.max(spanLng * 0.9, 0.0016);
  const padLat = Math.max(spanLat * 0.9, 0.0016);

  const paddedBounds = new maplibregl.LngLatBounds(
    [west - padLng, south - padLat],
    [east + padLng, north + padLat]
  );

  const periods = [baseline, comparison];
  periods.forEach((period, index) => {
    const isAfter = index === 1;
    const container = index === 0 ? beforeContainer : afterContainer;

    // Use date-specific satellite imagery tiles:
    // Before loads the earlier historical satellite capture
    // After loads the later comparison satellite capture
    const tileUrls = getTilesForPeriod(period, isAfter);

    const sources = {
      satellite: {
        type: "raster",
        tiles: tileUrls,
        tileSize: 256,
        maxzoom: 18,
        attribution: `Imagery: ${period} | Esri World Imagery Wayback`,
      },
      patch: {
        type: "geojson",
        data: feature,
      },
    };

    const layers = [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#172321" },
      },
      {
        id: "satellite-base",
        type: "raster",
        source: "satellite",
        paint: { "raster-fade-duration": 0 },
      },
      // Orange outline around the detected patch with transparent interior (matching reference image)
      {
        id: "patch-outline",
        type: "line",
        source: "patch",
        paint: {
          "line-color": "#ffb96f",
          "line-width": 2.5,
        },
      },
    ];

    const map = new maplibregl.Map({
      container,
      bounds: paddedBounds,
      fitBoundsOptions: { padding: 45, maxZoom: 17 },
      style: {
        version: 8,
        sources,
        layers,
      },
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    maps.push(map);

    map.on("load", () => {
      map.fitBounds(paddedBounds, { padding: 45, maxZoom: 17, duration: 0 });
    });

    map.on("move", () => {
      if (synchronizing || maps.length !== 2) return;
      synchronizing = true;
      maps[1 - index].jumpTo({
        center: map.getCenter(),
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      });
      synchronizing = false;
    });
  });

  // Force map resize and tight fit once modal DOM is fully rendered in browser
  setTimeout(() => {
    maps.forEach((m) => {
      m.resize();
      m.fitBounds(paddedBounds, { padding: 45, maxZoom: 17, duration: 0 });
    });
  }, 80);

  setTimeout(() => {
    maps.forEach((m) => {
      m.resize();
      m.fitBounds(paddedBounds, { padding: 45, maxZoom: 17, duration: 0 });
    });
  }, 280);

  function close() {
    maps.forEach((m) => m.remove());
    document.removeEventListener("keydown", onKeyDown);
    backdrop.remove();
    document.body.style.overflow = "";
    if (onClose) onClose();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key === "Tab") {
      const focusable = [
        ...dialog.querySelectorAll(
          'button:not(:disabled), select, textarea, [tabindex="0"], a[href]'
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", onKeyDown);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  closeBtn.addEventListener("click", close);

  setTimeout(() => closeBtn.focus(), 60);

  return { close };
}
