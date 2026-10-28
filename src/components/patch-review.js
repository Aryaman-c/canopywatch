import { reviewStatuses } from "../lib/reviews.js";
import { exportPatchReport } from "../lib/patch-report.js";
import { renderIcon } from "../lib/icons.js";

export function renderPatchReview(feature, imagery, review, onReview, storageError = "") {
  const container = document.createElement("section");
  container.className = "patch-review";
  container.setAttribute("aria-label", "Patch review");

  const status = review?.status || "unreviewed";
  const notes = review?.notes || "";
  const randomId = Math.random().toString(36).substring(2, 9);

  container.innerHTML = `
    <label for="review-status-${randomId}">Review status</label>
    <select id="review-status-${randomId}">
      ${Object.entries(reviewStatuses).map(([val, label]) => `
        <option value="${val}" ${val === status ? "selected" : ""}>${label}</option>
      `).join("")}
    </select>

    <label for="review-notes-${randomId}">Review notes</label>
    <textarea id="review-notes-${randomId}" rows="2" maxlength="2000" placeholder="What changed? What needs checking?">${escapeHtml(notes)}</textarea>

    <p class="review-help">Visual assessment of candidate tree loss; not confirmation of deforestation.</p>
    <p class="review-save" role="status">${storageError || (review ? "Saved in this browser" : "Reviews are saved in this browser")}</p>
    <button class="export-report" type="button">
      ${renderIcon("download", 16)} <span>Export patch report</span>
    </button>
    <p class="review-message review-help" role="status" style="display: none;"></p>
  `;

  const statusSelect = container.querySelector(`#review-status-${randomId}`);
  const notesTextarea = container.querySelector(`#review-notes-${randomId}`);
  const exportBtn = container.querySelector(".export-report");
  const messageEl = container.querySelector(".review-message");

  statusSelect.addEventListener("change", () => {
    if (onReview) {
      onReview(feature, { status: statusSelect.value, notes: notesTextarea.value });
    }
  });

  notesTextarea.addEventListener("input", () => {
    if (onReview) {
      onReview(feature, { status: statusSelect.value, notes: notesTextarea.value });
    }
  });

  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    const btnSpan = exportBtn.querySelector("span");
    if (btnSpan) btnSpan.textContent = "Preparing report…";
    messageEl.style.display = "none";
    messageEl.textContent = "";

    try {
      const currentReview = { status: statusSelect.value, notes: notesTextarea.value };
      const missing = await exportPatchReport(feature, imagery, currentReview);
      messageEl.textContent = missing
        ? "Report downloaded with unavailable imagery labeled. Open it to print or save as PDF."
        : "Report downloaded. Open it to print or save as PDF.";
      messageEl.style.display = "block";
    } catch (err) {
      console.error(err);
      messageEl.textContent = "Report could not be exported. Please try again.";
      messageEl.style.display = "block";
    } finally {
      exportBtn.disabled = false;
      if (btnSpan) btnSpan.textContent = "Export patch report";
    }
  });

  return container;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
