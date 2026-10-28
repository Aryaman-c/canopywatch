import test from "node:test";
import assert from "node:assert/strict";
import { loadReviews, reviewKey, serializeReviews, parseReviewBackup, mergeReviews } from "../src/lib/reviews.js";
import { patchExtent, exportPatchReport } from "../src/lib/patch-report.js";

const feature = {
  type: "Feature", properties: { patch_number: 1, baseline_period: "2024-08", comparison_period: "2025-08", area_hectares: 2 },
  geometry: { type: "Polygon", coordinates: [[[-64, -9], [-63, -9], [-63, -8], [-64, -9]]] },
};

test("review identity survives feature reorder but separates dates and geometry", () => {
  assert.equal(reviewKey(feature), reviewKey({ ...structuredClone(feature), id: 999 }));
  assert.notEqual(reviewKey(feature), reviewKey({ ...feature, properties: { ...feature.properties, comparison_period: "2026-08" } }));
  assert.notEqual(reviewKey(feature), reviewKey({ ...feature, geometry: { type: "Polygon", coordinates: [[[-62, -9], [-61, -9], [-61, -8], [-62, -9]]] } }));
});

test("storage failures and corrupt entries do not break review loading", () => {
  globalThis.localStorage = { getItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(loadReviews(), {});
  globalThis.localStorage.getItem = () => "{";
  assert.deepEqual(loadReviews(), {});
  globalThis.localStorage.getItem = () => JSON.stringify({ good: { status: "uncertain", notes: "Check clouds", updatedAt: "2026-10-11" }, bad: { status: "confirmed" } });
  assert.deepEqual(Object.keys(loadReviews()), ["good"]);
  delete globalThis.localStorage;
});

test("extent covers all polygons in a MultiPolygon", () => {
  const multi = { ...feature, geometry: { type: "MultiPolygon", coordinates: [feature.geometry.coordinates, [[[-62, -7], [-61, -7], [-61, -6], [-62, -7]]]] } };
  assert.deepEqual(patchExtent(multi), [-64, -9, -61, -6]);
});

test("report exports without imagery, labels missing evidence, and escapes reviewer text", async () => {
  const originalCreate = URL.createObjectURL;
  let report, downloaded = false;
  URL.createObjectURL = (blob) => { report = blob; return "blob:test"; };
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ click() { downloaded = true; }, remove() {} }) };
  try {
    const missing = await exportPatchReport(feature, {}, { status: "investigation", notes: '<script>alert("test")</script>', updatedAt: "2026-10-11" });
    const html = await report.text();
    assert.equal(missing, true);
    assert.equal(downloaded, true);
    assert.equal((html.match(/Imagery unavailable for this location or date/g) || []).length, 2);
    assert.ok(html.includes("&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt;"));
    assert.ok(html.includes("<dd>Needs investigation</dd>"));
    assert.ok(html.includes("2024-08 → 2025-08"));
    assert.ok(html.includes("-8.500000 latitude, -63.500000 longitude"));
    assert.ok(!html.includes("Interpretation and sources"));
    assert.ok(!html.includes("Candidate polygon and source properties"));
    assert.ok(!html.includes("This report contains embedded evidence"));
  } finally {
    URL.createObjectURL = originalCreate;
    delete globalThis.document;
  }
});

test("backup round trip preserves notes, statuses, patch identity, and edit times", () => {
  const reviews = { [reviewKey(feature)]: { status: "supported", notes: "Line one\nLine two 🌳", updatedAt: "2026-10-11T12:00:00.000Z" } };
  assert.deepEqual(parseReviewBackup(serializeReviews(reviews)), reviews);
});

test("import merges unrelated reviews and keeps newer edits without mutating current reviews", () => {
  const old = { status: "uncertain", notes: "Old note", updatedAt: "2026-10-10T12:00:00.000Z" };
  const newer = { ...old, notes: "New note", updatedAt: "2026-10-11T12:00:00.000Z" };
  const current = { a: newer, b: old };
  assert.deepEqual(mergeReviews(current, { a: old, b: newer, c: old }), { a: newer, b: newer, c: old });
  assert.equal(current.b, old);
});

test("import rejects wrong formats and invalid records before applying any reviews", () => {
  assert.throws(() => parseReviewBackup('{}'));
  const good = { key: reviewKey(feature), status: "uncertain", notes: "", updatedAt: "2026-10-11T12:00:00.000Z" };
  const backup = (reviews) => JSON.stringify({ format: "forestlens-reviews", version: 1, reviews });
  assert.throws(() => parseReviewBackup(backup([good, { ...good, status: "confirmed" }])));
  assert.throws(() => parseReviewBackup(backup([{ ...good, key: "__proto__" }])));
  assert.throws(() => parseReviewBackup(backup([{ ...good, notes: "x".repeat(2001) }])));
});
