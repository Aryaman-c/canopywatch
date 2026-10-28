import { createForestMap } from "./components/forest-map.js";
import { renderPatchReview } from "./components/patch-review.js";
import { createReviewTransfer } from "./components/review-transfer.js";
import { showPatchComparison } from "./components/patch-comparison.js";
import {
  empty,
  format,
  dateLabel,
  comparisonGroups,
  normalize,
} from "./lib/forest.js";
import {
  loadReviews,
  mergeReviews,
  reviewKey,
  reviewStatuses,
  reviewStorageKey,
} from "./lib/reviews.js";
import { renderIcon } from "./lib/icons.js";

export function initApp(rootEl) {
  let data = empty;
  let imagery = null;
  let period = "";
  let loading = true;
  let error = "";
  let selected = null;
  let minimum = "0";
  let query = "";
  let sort = "largest";
  let satellite = true;
  let showPatches = true;
  let reviews = loadReviews();
  let storageError = "";
  let reviewFilter = "all";

  let forestMap = null;
  let reviewTransferComp = null;

  function persistReviews() {
    try {
      localStorage.setItem(reviewStorageKey, JSON.stringify(reviews));
      storageError = "";
    } catch {
      storageError = "Browser storage unavailable. Export your review to keep a copy.";
    }
  }

  function updateReview(feature, value) {
    reviews = {
      ...reviews,
      [reviewKey(feature)]: {
        ...value,
        updatedAt: new Date().toISOString(),
      },
    };
    persistReviews();
    renderReviewStats();
    renderPatchList();
    renderPatchDetails();
  }

  function changePeriod(key) {
    period = key;
    selected = null;
    query = "";
    reviewFilter = "all";

    renderComparisonCards();
    renderStats();
    renderReviewStats();
    renderFilterInputs();
    renderPatchList();
    renderPatchDetails();

    if (forestMap) {
      forestMap.updateFeatures(getVisibleFeatures());
      forestMap.setSelected(null);
      forestMap.fitAll();
    }
  }

  function getActiveGroup() {
    const groups = comparisonGroups(data.features);
    return groups.find((g) => g.key === period) || null;
  }

  function getAllFeatures() {
    return getActiveGroup()?.features || [];
  }

  function getVisibleFeatures() {
    const all = getAllFeatures();
    return all
      .filter((f) => {
        const areaMatch = f.properties.area_hectares >= Number(minimum);
        const revStatus = reviews[reviewKey(f)]?.status || "unreviewed";
        const statusMatch = reviewFilter === "all" || revStatus === reviewFilter;
        const patchName = `patch ${String(f.properties.patch_number).padStart(2, "0")}`;
        const searchMatch = patchName.includes(query.toLowerCase());
        return areaMatch && statusMatch && searchMatch;
      })
      .sort((a, b) =>
        sort === "largest"
          ? b.properties.area_hectares - a.properties.area_hectares
          : a.properties.area_hectares - b.properties.area_hectares
      );
  }

  // Initial structure render (NO GitHub button)
  rootEl.innerHTML = `
    <div class="app">
      <header>
        <a class="brand" href="/" aria-label="CanopyWatch home">
          <span class="brand-icon">
            ${renderIcon("leaf", 21)}
          </span>
          CanopyWatch
        </a>
      </header>

      <main>
        <div class="page-heading">
          <div>
            <h1>Western Ghats forest loss</h1>
            <p>Compare detected loss patches and monthly satellite imagery.</p>
          </div>
          <div class="location">
            ${renderIcon("mapPin", 17)}
            <div>
              <strong>Wayanad, Western Ghats</strong>
              <span>Kerala | Western Ghats, India</span>
            </div>
          </div>
        </div>

        <div class="error-container"></div>

        <section class="comparisons" aria-label="Time comparisons">
          <div class="comparison-heading">
            <div>
              <h2>Time comparisons</h2>
            </div>
          </div>
          <div class="comparison-cards"></div>
        </section>

        <section class="stats" aria-label="Dataset summary">
          <div class="stat">
            <div>
              <span class="stat-label">Detected tree loss</span>
              <strong class="stat-loss-total">—</strong>
            </div>
          </div>
          <div class="stat">
            <div>
              <span class="stat-label">Loss patches</span>
              <strong class="stat-patches-total">—</strong>
            </div>
          </div>
        </section>

        <div class="review-workflow">
          <strong>Manually inspect detected loss</strong>
          <p>Pick a patch, add your own thoughts, and export your assessment to share with others.</p>
          <span class="review-progress-text">0 of 0 assessed in this comparison</span>
          <div class="review-transfer-slot"></div>
          <p class="storage-error-alert" role="alert" style="display: none;"></p>
        </div>

        <section class="explorer" aria-label="Forest loss explorer">
          <aside class="sidebar">
            <div class="sidebar-title">
              <h2>Detected patches</h2>
              <span class="count-badge">0</span>
            </div>

            <label class="search">
              ${renderIcon("search", 16)}
              <input
                class="search-input"
                aria-label="Search patches"
                placeholder="Search patches…"
                value=""
              />
            </label>

            <div class="filters">
              <label>
                Minimum area
                <select class="minimum-filter-select">
                  <option value="0">All sizes</option>
                  <option value="0.1">0.1 ha</option>
                  <option value="0.5">0.5 ha</option>
                  <option value="1">1 ha</option>
                </select>
              </label>

              <label>
                Sort by
                <select class="sort-select">
                  <option value="largest">Largest first</option>
                  <option value="smallest">Smallest first</option>
                </select>
              </label>
            </div>

            <label class="review-filter">
              Review status
              <select class="review-filter-select">
                <option value="all">All statuses</option>
                ${Object.entries(reviewStatuses).map(([val, lbl]) => `
                  <option value="${val}">${lbl}</option>
                `).join("")}
              </select>
            </label>

            <div class="list-caption">
              PATCH <span>AREA (HA)</span>
            </div>

            <div class="patch-list">
              <div class="empty-state">Loading your forest data…</div>
            </div>
          </aside>

          <div class="map-panel">
            <div class="map-canvas" aria-label="Interactive forest loss map"></div>

            <div class="map-top">
              <button
                type="button"
                class="icon-button btn-fit-patches"
                title="Fit all visible patches"
                aria-label="Fit all visible patches"
              >
                ${renderIcon("locateFixed", 19)}
              </button>
            </div>

            <div class="map-bottom">
              <div class="layer-controls">
                <button type="button" class="btn-toggle-satellite chosen">Satellite</button>
                <button type="button" class="btn-toggle-map">Map</button>
              </div>
              <button type="button" class="legend" aria-pressed="true">
                <span></span> Hide patches
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  `;

  // Select DOM elements
  const errorContainer = rootEl.querySelector(".error-container");
  const comparisonCardsEl = rootEl.querySelector(".comparison-cards");
  const statLossTotalEl = rootEl.querySelector(".stat-loss-total");
  const statPatchesTotalEl = rootEl.querySelector(".stat-patches-total");
  const reviewProgressTextEl = rootEl.querySelector(".review-progress-text");
  const reviewTransferSlot = rootEl.querySelector(".review-transfer-slot");
  const storageErrorEl = rootEl.querySelector(".storage-error-alert");
  const countBadgeEl = rootEl.querySelector(".count-badge");
  const searchInput = rootEl.querySelector(".search-input");
  const minimumFilterSelect = rootEl.querySelector(".minimum-filter-select");
  const sortSelect = rootEl.querySelector(".sort-select");
  const reviewFilterSelect = rootEl.querySelector(".review-filter-select");
  const patchListEl = rootEl.querySelector(".patch-list");
  const mapCanvasEl = rootEl.querySelector(".map-canvas");
  const mapPanelEl = rootEl.querySelector(".map-panel");
  const btnFitPatches = rootEl.querySelector(".btn-fit-patches");
  const btnToggleSatellite = rootEl.querySelector(".btn-toggle-satellite");
  const btnToggleMap = rootEl.querySelector(".btn-toggle-map");
  const btnLegend = rootEl.querySelector(".legend");

  // Init Review Transfer Component
  reviewTransferComp = createReviewTransfer(reviewTransferSlot, {
    getReviews: () => reviews,
    onImport: (incoming) => {
      reviews = mergeReviews(reviews, incoming);
      persistReviews();
      renderReviewStats();
      renderPatchList();
      renderPatchDetails();
    },
  });

  // Init Map
  forestMap = createForestMap(mapCanvasEl, {
    initialCenter: [76.132, 11.685],
    onSelect: (feature) => {
      selected = feature;
      renderPatchListSelection();
      renderPatchDetails();
      if (forestMap) forestMap.setSelected(selected);
    },
  });

  // DOM Event Listeners
  searchInput.addEventListener("input", (e) => {
    query = e.target.value;
    selected = null;
    if (forestMap) forestMap.setSelected(null);
    renderPatchList();
    renderPatchDetails();
  });

  minimumFilterSelect.addEventListener("change", (e) => {
    minimum = e.target.value;
    selected = null;
    if (forestMap) {
      forestMap.setSelected(null);
      forestMap.updateFeatures(getVisibleFeatures());
    }
    renderPatchList();
    renderPatchDetails();
  });

  sortSelect.addEventListener("change", (e) => {
    sort = e.target.value;
    renderPatchList();
  });

  reviewFilterSelect.addEventListener("change", (e) => {
    reviewFilter = e.target.value;
    selected = null;
    if (forestMap) {
      forestMap.setSelected(null);
      forestMap.updateFeatures(getVisibleFeatures());
    }
    renderPatchList();
    renderPatchDetails();
  });

  btnFitPatches.addEventListener("click", () => {
    if (forestMap) forestMap.fitAll();
  });

  btnToggleSatellite.addEventListener("click", () => {
    satellite = true;
    btnToggleSatellite.classList.add("chosen");
    btnToggleMap.classList.remove("chosen");
    if (forestMap) forestMap.setSatellite(true);
  });

  btnToggleMap.addEventListener("click", () => {
    satellite = false;
    btnToggleMap.classList.add("chosen");
    btnToggleSatellite.classList.remove("chosen");
    if (forestMap) forestMap.setSatellite(false);
  });

  btnLegend.addEventListener("click", () => {
    showPatches = !showPatches;
    btnLegend.setAttribute("aria-pressed", String(showPatches));
    btnLegend.innerHTML = `<span></span> ${showPatches ? "Hide patches" : "Show patches"}`;
    if (forestMap) forestMap.setShowPatches(showPatches);
  });

  function renderError() {
    if (!error) {
      errorContainer.innerHTML = "";
      return;
    }
    errorContainer.innerHTML = `
      <div class="error" role="alert">
        ${error}
        <button type="button" aria-label="Dismiss error" class="btn-dismiss-error">
          ${renderIcon("x", 16)}
        </button>
      </div>
    `;
    const dismissBtn = errorContainer.querySelector(".btn-dismiss-error");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => {
        error = "";
        renderError();
      });
    }
  }

  function renderComparisonCards() {
    const groups = comparisonGroups(data.features);
    if (!groups.length) {
      comparisonCardsEl.innerHTML = "";
      return;
    }
    comparisonCardsEl.innerHTML = groups.map((g) => `
      <button
        type="button"
        aria-pressed="${period === g.key}"
        class="comparison-card ${period === g.key ? "selected" : ""}"
        data-group-key="${g.key}"
      >
        <span>${dateLabel(g.baseline)} → ${dateLabel(g.comparison)}</span>
        <strong>${format(g.hectares)} <small>ha</small></strong>
        <span class="comparison-count">
          ${g.features.length} patches
          ${renderIcon("chevronRight", 14)}
        </span>
      </button>
    `).join("");

    comparisonCardsEl.querySelectorAll(".comparison-card").forEach((card) => {
      card.addEventListener("click", () => {
        const key = card.getAttribute("data-group-key");
        changePeriod(key);
      });
    });
  }

  function renderStats() {
    const all = getAllFeatures();
    const total = all.reduce((sum, f) => sum + f.properties.area_hectares, 0);
    statLossTotalEl.innerHTML = loading ? "—" : `${format(total)} <small>hectares</small>`;
    statPatchesTotalEl.innerHTML = loading ? "—" : `${all.length} <small>patches</small>`;
  }

  function renderReviewStats() {
    const all = getAllFeatures();
    const assessedCount = all.filter((f) => {
      const st = reviews[reviewKey(f)]?.status;
      return st && st !== "unreviewed";
    }).length;
    reviewProgressTextEl.textContent = `${assessedCount} of ${all.length} assessed in this comparison`;

    if (storageError) {
      storageErrorEl.textContent = storageError;
      storageErrorEl.style.display = "block";
    } else {
      storageErrorEl.style.display = "none";
    }

    if (reviewTransferComp) reviewTransferComp.update();
  }

  function renderFilterInputs() {
    searchInput.value = query;
    minimumFilterSelect.value = minimum;
    reviewFilterSelect.value = reviewFilter;
    sortSelect.value = sort;
  }

  function renderPatchList() {
    const visible = getVisibleFeatures();
    const all = getAllFeatures();
    countBadgeEl.textContent = String(visible.length);

    if (loading) {
      patchListEl.innerHTML = `<div class="empty-state">Loading your forest data…</div>`;
      return;
    }

    if (!visible.length) {
      patchListEl.innerHTML = `
        <div class="empty-state">
          ${renderIcon("trees", 29)}
          <strong>${all.length ? "No matching patches" : "No patches in this export"}</strong>
          <p>${all.length ? "Try a smaller minimum area, another review status, or clear your search." : "No detections are available for this comparison."}</p>
          ${all.length > 0 ? `<button type="button" class="btn-reset-filters">Reset filters</button>` : ""}
        </div>
      `;
      const resetBtn = patchListEl.querySelector(".btn-reset-filters");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          minimum = "0";
          query = "";
          reviewFilter = "all";
          renderFilterInputs();
          selected = null;
          if (forestMap) {
            forestMap.setSelected(null);
            forestMap.updateFeatures(getVisibleFeatures());
          }
          renderPatchList();
          renderPatchDetails();
        });
      }
      return;
    }

    patchListEl.innerHTML = visible.map((f) => {
      const isActive = selected?.id === f.id;
      const patchNum = String(f.properties.patch_number).padStart(2, "0");
      const rev = reviews[reviewKey(f)];
      const statusLabel = reviewStatuses[rev?.status || "unreviewed"];
      return `
        <button
          type="button"
          class="patch-row ${isActive ? "active" : ""}"
          data-patch-id="${f.id}"
        >
          <span class="patch-name">
            <strong>Patch ${patchNum}</strong>
            <span>${statusLabel}</span>
          </span>
          <span class="patch-area">
            ${format(f.properties.area_hectares)}
            ${renderIcon("chevronRight", 15)}
          </span>
        </button>
      `;
    }).join("");

    patchListEl.querySelectorAll(".patch-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.getAttribute("data-patch-id"));
        const found = visible.find((f) => f.id === id) || null;
        selected = found;
        renderPatchListSelection();
        renderPatchDetails();
        if (forestMap) forestMap.setSelected(selected);
      });
    });
  }

  function renderPatchListSelection() {
    patchListEl.querySelectorAll(".patch-row").forEach((btn) => {
      const id = Number(btn.getAttribute("data-patch-id"));
      if (selected && selected.id === id) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  function renderPatchDetails() {
    const existing = mapPanelEl.querySelector(".details");
    if (existing) existing.remove();

    if (!selected) {
      return;
    }

    const patchNum = String(selected.properties.patch_number).padStart(2, "0");

    const detailsEl = document.createElement("div");
    detailsEl.className = "details";
    detailsEl.innerHTML = `
      <div class="details-top">
        <span class="eyebrow">PATCH DETAILS</span>
        <button type="button" class="btn-close-details" aria-label="Close patch details">
          ${renderIcon("x", 18)}
        </button>
      </div>
      <h2>Patch ${patchNum}</h2>
      <div class="detail-area">
        ${format(selected.properties.area_hectares)} <span>hectares</span>
      </div>
      <button type="button" class="view-comparison">
        ${renderIcon("layers", 17)} View before &amp; after
      </button>
      <div class="details-review-slot"></div>
    `;

    const closeBtn = detailsEl.querySelector(".btn-close-details");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        selected = null;
        renderPatchListSelection();
        renderPatchDetails();
        if (forestMap) forestMap.setSelected(null);
      });
    }

    const viewCompBtn = detailsEl.querySelector(".view-comparison");
    if (viewCompBtn) {
      viewCompBtn.addEventListener("click", () => {
        showPatchComparison({
          feature: selected,
          imagery,
          review: reviews[reviewKey(selected)],
          onReview: updateReview,
          storageError,
          onClose: () => {
            renderReviewStats();
            renderPatchList();
            renderPatchDetails();
          },
        });
      });
    }

    const reviewSlot = detailsEl.querySelector(".details-review-slot");
    if (reviewSlot) {
      const reviewEl = renderPatchReview(
        selected,
        imagery,
        reviews[reviewKey(selected)],
        updateReview,
        storageError
      );
      reviewSlot.appendChild(reviewEl);
    }

    mapPanelEl.appendChild(detailsEl);
  }

  // Fetch imagery manifest
  fetch("/imagery/manifest.json")
    .then((r) => {
      if (!r.ok) throw new Error("Imagery unavailable");
      return r.json();
    })
    .then((val) => {
      imagery = val;
    })
    .catch(() => {});

  // Fetch GeoJSON data
  fetch("/forest-loss.geojson")
    .then((r) => {
      if (!r.ok) throw new Error("Could not load the bundled GeoJSON. Please reload the page.");
      return r.json();
    })
    .then(normalize)
    .then((normalized) => {
      data = normalized;
      const groups = comparisonGroups(normalized.features);
      period = groups.at(-1)?.key || "";
      loading = false;

      renderComparisonCards();
      renderStats();
      renderReviewStats();
      renderPatchList();

      if (forestMap) {
        forestMap.updateFeatures(getVisibleFeatures());
        forestMap.fitAll();
      }
    })
    .catch((err) => {
      error = err.message;
      loading = false;
      renderError();
      renderStats();
      renderPatchList();
    });
}
