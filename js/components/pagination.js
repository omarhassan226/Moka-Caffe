/**
 * Móka Billing ERP - Universal Pagination Component
 * Provides responsive pagination for any list or table (Items, Catalog, etc.)
 */

class PaginationComponent {
  /**
   * @param {Object} options
   * @param {number|string} options.pageSize - Default items per page (e.g. 10, 20, 50, 'all')
   * @param {Function} options.onPageChange - Callback when page or page size changes
   * @param {string} options.containerId - DOM ID where pagination controls render
   */
  constructor({ pageSize = 10, onPageChange, containerId }) {
    this.currentPage = 1;
    this.pageSize = pageSize;
    this.onPageChange = onPageChange;
    this.containerId = containerId;
  }

  setPage(page) {
    this.currentPage = Math.max(1, parseInt(page, 10) || 1);
    if (this.onPageChange) this.onPageChange(this.currentPage, this.pageSize);
  }

  setPageSize(size) {
    this.pageSize = size === "all" ? "all" : parseInt(size, 10) || 10;
    this.currentPage = 1; // Reset to page 1 on page size change
    if (this.onPageChange) this.onPageChange(this.currentPage, this.pageSize);
  }

  /**
   * Slice items array and return pagination metadata
   */
  paginate(items = []) {
    const totalItems = items.length;

    if (this.pageSize === "all" || totalItems <= this.pageSize) {
      return {
        paginatedItems: items,
        currentPage: 1,
        totalPages: 1,
        totalItems,
        startIndex: totalItems > 0 ? 1 : 0,
        endIndex: totalItems,
        isPaginated: false
      };
    }

    const size = parseInt(this.pageSize, 10);
    const totalPages = Math.ceil(totalItems / size) || 1;

    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }
    if (this.currentPage < 1) {
      this.currentPage = 1;
    }

    const startIndex = (this.currentPage - 1) * size;
    const endIndex = Math.min(startIndex + size, totalItems);
    const paginatedItems = items.slice(startIndex, endIndex);

    return {
      paginatedItems,
      currentPage: this.currentPage,
      totalPages,
      totalItems,
      startIndex: totalItems > 0 ? startIndex + 1 : 0,
      endIndex,
      isPaginated: totalPages > 1
    };
  }

  /**
   * Render pagination controls into the container
   */
  renderControls(meta) {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    if (meta.totalItems === 0) {
      container.innerHTML = "";
      return;
    }

    const { currentPage, totalPages, totalItems, startIndex, endIndex } = meta;

    // Build visible page buttons (max 5 page numbers around current)
    let pageNumbers = [];
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);

    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    for (let p = startPage; p <= endPage; p++) {
      pageNumbers.push(p);
    }

    let buttonsHtml = "";

    // Previous Button
    buttonsHtml += `
      <button class="pagination-btn ${currentPage === 1 ? 'disabled' : ''}" 
        ${currentPage === 1 ? 'disabled' : ''} 
        data-page="${currentPage - 1}" title="الصفحة السابقة">
        ‹ السابق
      </button>
    `;

    // First page jump if far
    if (startPage > 1) {
      buttonsHtml += `<button class="pagination-btn" data-page="1">1</button>`;
      if (startPage > 2) buttonsHtml += `<span class="pagination-dots">...</span>`;
    }

    // Numbered page buttons
    pageNumbers.forEach(p => {
      buttonsHtml += `
        <button class="pagination-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">
          ${p}
        </button>
      `;
    });

    // Last page jump if far
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) buttonsHtml += `<span class="pagination-dots">...</span>`;
      buttonsHtml += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    // Next Button
    buttonsHtml += `
      <button class="pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" 
        ${currentPage === totalPages ? 'disabled' : ''} 
        data-page="${currentPage + 1}" title="الصفحة التالية">
        التالي ›
      </button>
    `;

    // Page size options
    const sizeOptions = [10, 20, 50, "all"];
    const selectOptionsHtml = sizeOptions.map(sz => `
      <option value="${sz}" ${String(this.pageSize) === String(sz) ? 'selected' : ''}>
        ${sz === "all" ? 'الكل' : sz}
      </option>
    `).join("");

    container.innerHTML = `
      <div class="pagination-wrapper">
        <div class="pagination-info">
          <span>عرض <strong>${startIndex} - ${endIndex}</strong> من إجمالي <strong>${totalItems}</strong></span>
          <div class="pagination-size-selector">
            <span>لكل صفحة:</span>
            <select class="pagination-select">
              ${selectOptionsHtml}
            </select>
          </div>
        </div>
        ${totalPages > 1 ? `<div class="pagination-buttons">${buttonsHtml}</div>` : ''}
      </div>
    `;

    // Attach click events
    container.querySelectorAll(".pagination-btn:not(.disabled)").forEach(btn => {
      btn.addEventListener("click", () => {
        const page = parseInt(btn.getAttribute("data-page"), 10);
        if (page && page !== this.currentPage) {
          this.setPage(page);
        }
      });
    });

    const select = container.querySelector(".pagination-select");
    if (select) {
      select.addEventListener("change", (e) => {
        this.setPageSize(e.target.value);
      });
    }
  }
}

if (typeof window !== "undefined") {
  window.PaginationComponent = PaginationComponent;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = PaginationComponent;
}
