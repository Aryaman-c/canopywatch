export const reviewStatuses = {
  unreviewed: "Not reviewed",
  investigation: "Needs investigation",
  supported: "Visually supported",
  uncertain: "Uncertain",
};

export const reviewStorageKey = "forestlens-reviews-v1";
const keys = new WeakMap();

// Include the geometry so a new export cannot inherit an unrelated patch's review.
export function reviewKey(feature) {
  if (keys.has(feature)) return keys.get(feature);
  const key = JSON.stringify([
    feature.properties.baseline_period,
    feature.properties.comparison_period,
    feature.geometry,
  ]);
  keys.set(feature, key);
  return key;
}

export function loadReviews() {
  try {
    const saved = JSON.parse(localStorage.getItem(reviewStorageKey) || "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([, value]) =>
      value && Object.hasOwn(reviewStatuses, value.status) &&
      typeof value.notes === "string" && typeof value.updatedAt === "string",
    ));
  } catch {
    return {};
  }
}

export function serializeReviews(reviews) {
  return JSON.stringify({
    format: "forestlens-reviews", version: 1, exportedAt: new Date().toISOString(),
    reviews: Object.entries(reviews).map(([key, review]) => ({ key, ...review })),
  }, null, 2);
}

export function parseReviewBackup(text) {
  const backup = JSON.parse(text);
  if (backup?.format !== "forestlens-reviews" || backup.version !== 1 || !Array.isArray(backup.reviews))
    throw new Error("Choose a ForestLens reviews JSON export.");
  const entries = backup.reviews.map((entry) => {
    if (!entry || typeof entry.key !== "string" || !Object.hasOwn(reviewStatuses, entry.status) ||
        typeof entry.notes !== "string" || entry.notes.length > 2000 ||
        typeof entry.updatedAt !== "string" || !Number.isFinite(Date.parse(entry.updatedAt)))
      throw new Error("The backup contains an invalid review. No reviews were imported.");
    const identity = JSON.parse(entry.key);
    if (!Array.isArray(identity) || identity.length !== 3 ||
        !identity.slice(0, 2).every((period) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period)) ||
        !["Polygon", "MultiPolygon"].includes(identity[2]?.type) ||
        !Array.isArray(identity[2]?.coordinates))
      throw new Error("The backup contains an invalid patch identity. No reviews were imported.");
    return [entry.key, { status: entry.status, notes: entry.notes, updatedAt: entry.updatedAt }];
  });
  return Object.fromEntries(entries);
}

export function mergeReviews(current, incoming) {
  const merged = { ...current };
  for (const [key, review] of Object.entries(incoming)) {
    if (!merged[key] || Date.parse(review.updatedAt) > Date.parse(merged[key].updatedAt)) merged[key] = review;
  }
  return merged;
}
