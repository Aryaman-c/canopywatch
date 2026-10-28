import { parseReviewBackup, serializeReviews } from "../lib/reviews.js";
import { renderIcon } from "../lib/icons.js";

export function createReviewTransfer(containerEl, { getReviews, onImport } = {}) {
  containerEl.className = "review-transfer";

  function render() {
    const reviews = getReviews ? getReviews() : {};
    const count = Object.keys(reviews).length;

    containerEl.innerHTML = `
      <div class="review-transfer-actions">
        <button type="button" class="btn-export-reviews" ${count === 0 ? "disabled" : ""}>
          ${renderIcon("download", 15)} Export all reviews
        </button>
        <button type="button" class="btn-import-reviews">
          ${renderIcon("upload", 15)} <span>Import reviews</span>
        </button>
        <input type="file" class="input-import-file" accept=".json,application/json" aria-label="Reviews backup file" hidden />
      </div>
      <p>Transfer notes and statuses between browsers using a JSON backup.</p>
      <p class="transfer-status" role="status" style="display: none;"></p>
    `;

    const exportBtn = containerEl.querySelector(".btn-export-reviews");
    const importBtn = containerEl.querySelector(".btn-import-reviews");
    const fileInput = containerEl.querySelector(".input-import-file");
    const statusMsg = containerEl.querySelector(".transfer-status");

    exportBtn.addEventListener("click", () => {
      const current = getReviews ? getReviews() : {};
      const totalCount = Object.keys(current).length;
      if (!totalCount) return;

      const url = URL.createObjectURL(new Blob([serializeReviews(current)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `canopywatch-reviews-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      statusMsg.textContent = `Exported ${totalCount} saved reviews, including notes and statuses.`;
      statusMsg.style.display = "block";
    });

    importBtn.addEventListener("click", () => {
      fileInput.click();
    });

    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const btnSpan = importBtn.querySelector("span");
      if (btnSpan) btnSpan.textContent = "Importing…";
      importBtn.disabled = true;

      try {
        if (file.size > 25 * 1024 * 1024) throw new Error("Choose a backup smaller than 25 MB.");
        const text = await file.text();
        const imported = parseReviewBackup(text);
        if (onImport) onImport(imported);

        statusMsg.textContent = `Imported backup with ${Object.keys(imported).length} reviews. Existing reviews are merged; the newer edit is kept for each patch.`;
        statusMsg.style.display = "block";
        render();
      } catch (err) {
        statusMsg.textContent = err instanceof SyntaxError
          ? "This file is not a valid reviews backup. No reviews were imported."
          : err.message;
        statusMsg.style.display = "block";
      } finally {
        importBtn.disabled = false;
        if (btnSpan) btnSpan.textContent = "Import reviews";
        event.target.value = "";
      }
    });
  }

  render();

  return {
    update() {
      render();
    }
  };
}
