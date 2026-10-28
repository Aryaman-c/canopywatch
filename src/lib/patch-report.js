import { reviewStatuses } from "./reviews.js";

const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g,
  (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const mercatorY = (latitude) => Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * 180 / Math.PI;

export function patchExtent(feature) {
  const extent = [Infinity, Infinity, -Infinity, -Infinity];
  function visit(coordinates) {
    if (typeof coordinates[0] === "number") {
      extent[0] = Math.min(extent[0], coordinates[0]);
      extent[1] = Math.min(extent[1], coordinates[1]);
      extent[2] = Math.max(extent[2], coordinates[0]);
      extent[3] = Math.max(extent[3], coordinates[1]);
    } else coordinates.forEach(visit);
  }
  visit(feature.geometry.coordinates);
  return extent;
}

// Render both dates in the same Web Mercator window as the interactive viewer.
async function evidenceImage(feature, raster) {
  if (!raster) return null;
  const image = new Image();
  image.src = raster.url;
  await image.decode();
  const [west, south, east, north] = patchExtent(feature);
  const centerX = (west + east) / 2;
  const centerY = (mercatorY(south) + mercatorY(north)) / 2;
  const halfHeight = Math.max((mercatorY(north) - mercatorY(south)) * 0.7, (east - west) * 0.7 / 1.5, 0.002);
  const halfWidth = halfHeight * 1.5;
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 600;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  const x = (longitude) => (longitude - centerX + halfWidth) / (2 * halfWidth) * canvas.width;
  const y = (latitude) => (centerY + halfHeight - mercatorY(latitude)) / (2 * halfHeight) * canvas.height;
  context.fillStyle = "#e5e7eb";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const [topLeft, topRight, , bottomLeft] = raster.coordinates;
  if (east < topLeft[0] || west > topRight[0] || north < bottomLeft[1] || south > topLeft[1]) return null;
  context.drawImage(image, x(topLeft[0]), y(topLeft[1]), x(topRight[0]) - x(topLeft[0]), y(bottomLeft[1]) - y(topLeft[1]));
  context.strokeStyle = "#ffb96f";
  context.lineWidth = 3;
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  polygons.forEach((polygon) => polygon.forEach((ring) => {
    context.beginPath();
    ring.forEach(([longitude, latitude], index) => {
      if (index === 0) context.moveTo(x(longitude), y(latitude));
      else context.lineTo(x(longitude), y(latitude));
    });
    context.closePath();
    context.stroke();
  }));
  return canvas.toDataURL("image/png");
}

export async function exportPatchReport(feature, imagery, review) {
  const properties = feature.properties;
  const dates = [properties.baseline_period, properties.comparison_period];
  const images = await Promise.allSettled(dates.map((date) => evidenceImage(feature, imagery?.[date])));
  const missing = images.some((result) => result.status !== "fulfilled" || !result.value);
  const extent = patchExtent(feature);
  const longitude = (extent[0] + extent[2]) / 2;
  const latitude = (extent[1] + extent[3]) / 2;
  const patch = String(properties.patch_number).padStart(2, "0");
  const status = reviewStatuses[review?.status] || reviewStatuses.unreviewed;
  const timestamp = new Date().toISOString();
  const figure = (result, index) => `<figure><figcaption>${index ? "After" : "Before"} ${escapeHTML(dates[index])}</figcaption>${result.status === "fulfilled" && result.value
    ? `<img src="${result.value}" alt="${index ? "After" : "Before"} satellite composite with orange candidate patch outline">`
    : '<div class="unavailable">Imagery unavailable for this location or date.</div>'}</figure>`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CanopyWatch Patch ${escapeHTML(patch)} review</title>
<style>
body{font:15px/1.6 system-ui,sans-serif;color:#172321;max-width:1050px;margin:40px auto;padding:0 24px}h1{margin-bottom:4px}h2{font-size:18px;margin:24px 0 8px}.subtle{color:#52635c}dl{display:grid;grid-template-columns:190px 1fr;gap:8px 16px}dt{color:#52635c}dd{margin:0;overflow-wrap:anywhere}.evidence{display:grid;grid-template-columns:1fr 1fr;gap:20px}figure{margin:0}figcaption{font-weight:600;margin-bottom:8px}img{width:100%;border-radius:4px}.unavailable{background:#e5e7eb;padding:70px 20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}.notes{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f7f5;padding:16px;border-radius:4px}.print-help{background:#f4f7f5;padding:12px}@media(max-width:650px){.evidence{grid-template-columns:1fr}dl{grid-template-columns:1fr}}@media print{body{margin:0;padding:0;font-size:11px}.print-help,details{display:none}.evidence,dl{break-inside:avoid}h2{break-after:avoid}img{max-height:280px;object-fit:contain}@page{margin:15mm}}
</style></head><body>
<h1>CanopyWatch Patch ${escapeHTML(patch)}</h1><p class="subtle">Detected deforestation review Wayanad, Western Ghats, India</p>
<dl><dt>Review status</dt><dd>${escapeHTML(status)}</dd>
<dt>Comparison</dt><dd>${escapeHTML(dates[0])} → ${escapeHTML(dates[1])}</dd>
<dt>Candidate area</dt><dd>${escapeHTML(properties.area_hectares.toLocaleString("en-US", {maximumFractionDigits: 4}))} hectares</dd>
<dt>Location (WGS84)</dt><dd>${latitude.toFixed(6)} latitude, ${longitude.toFixed(6)} longitude (bounding box center)</dd>
<dt>Bounds (WGS84)</dt><dd>West ${extent[0].toFixed(6)}, south ${extent[1].toFixed(6)}, east ${extent[2].toFixed(6)}, north ${extent[3].toFixed(6)}</dd>
<dt>Last review edit</dt><dd>${escapeHTML(review?.updatedAt || "Not reviewed")}</dd>
<dt>Report generated</dt><dd>${timestamp} (UTC)</dd></dl>
<h2>Reviewer notes</h2><div class="notes">${escapeHTML(review?.notes || "No notes supplied.")}</div>
<h2>Satellite evidence</h2><div class="evidence">${images.map(figure).join("")}</div>
<p class="subtle">Orange outlines the detected patch. Both images show the same area. Gray areas have no valid imagery.</p>
</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `canopywatch-patch-${patch}-${dates.join("-to-")}.html`.replace(/[^a-zA-Z0-9._-]/g, "_");
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return missing;
}
