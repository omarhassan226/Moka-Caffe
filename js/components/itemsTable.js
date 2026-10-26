/**
 * Móka Billing ERP - Items Table Component
 */

class ItemsTableComponent {
  static init(store, appController) {
    this.store = store;
    this.appController = appController;
    this.tbody = document.getElementById("items-table-body");

    // Initialize Pagination Component
    this.pagination = new window.PaginationComponent({
      pageSize: 10,
      containerId: "items-pagination-container",
      onPageChange: () => this.render()
    });

    // Search filter input
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.store.setSearchQuery(e.target.value);
        if (this.pagination) this.pagination.currentPage = 1;
        this.render();
      });
    }

    // Category filter dropdown
    const catFilter = document.getElementById("category-filter");
    if (catFilter) {
      catFilter.addEventListener("change", (e) => {
        this.store.setCategoryFilter(e.target.value);
        if (this.pagination) this.pagination.currentPage = 1;
        this.render();
      });
    }

    // Consolidate duplicates toggle checkbox
    const consToggle = document.getElementById("toggle-consolidate");
    if (consToggle) {
      consToggle.addEventListener("change", (e) => {
        this.store.setConsolidateDuplicates(e.target.checked);
        this.appController.refreshCalculation();
      });
    }

    this.store.subscribe((state, changedKeys) => {
      if (
        changedKeys.includes("activeCalculation") ||
        changedKeys.includes("combinedCalculation") ||
        changedKeys.includes("activeBranchIndex") ||
        changedKeys.includes("categoryFilter") ||
        changedKeys.includes("searchQuery")
      ) {
        if (changedKeys.includes("activeBranchIndex")) {
          if (this.pagination) this.pagination.currentPage = 1;
        }
        this.render();
      }
      if (changedKeys.includes("catalog")) {
        this.updateCategoryOptions();
      }
    });
  }

  static render() {
    if (!this.tbody) {
      this.tbody = document.getElementById("items-table-body");
      if (!this.tbody) return;
    }

    const state = this.store.getState();
    const data = this.store.getActiveCalculationData();
    let items = data.items || [];

    // Filter by Category
    if (state.categoryFilter !== "all") {
      items = items.filter(it => it.category === state.categoryFilter);
    }

    // Filter by Search Query
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      items = items.filter(it =>
        (it.nameAr && it.nameAr.toLowerCase().includes(q)) ||
        (it.nameEn && it.nameEn.toLowerCase().includes(q)) ||
        (it.code && it.code.toLowerCase().includes(q))
      );
    }

    if (items.length === 0) {
      this.tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
            🔍 لا توجد أصناف تطابق البحث أو التصنيف المحدد
          </td>
        </tr>
      `;
      if (this.pagination) {
        this.pagination.renderControls({ totalItems: 0 });
      }
      return;
    }

    // Slice using pagination
    const meta = this.pagination
      ? this.pagination.paginate(items)
      : { paginatedItems: items, totalItems: items.length };

    const format = window.Formatters ? window.Formatters.formatCurrency : (v) => `${v} ج.م`;

    let html = "";
    meta.paginatedItems.forEach(it => {
      const sourceItemIds = (it.sourceItemIds || [it.itemId]).join(",");
      const taxBadge = it.taxType === "SCHD_5"
        ? `<span class="badge badge-schd">جدول 5%</span>`
        : it.taxType === "VAT_14"
          ? `<span class="badge badge-vat">ق.م 14%</span>`
          : `<span class="badge">معفى</span>`;

      const missingBadge = it.isMissing
        ? `<span class="badge badge-missing">جديد (حدد السعر)</span>`
        : "";

      html += `
        <tr>
          <td style="font-family: monospace; color: var(--text-muted); font-size: 0.82rem;">${it.code || '---'}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-primary);">${it.nameAr} ${missingBadge}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted); font-family: Outfit;">${it.nameEn || ''}</div>
          </td>
          <td><span class="badge badge-gold">${it.category}</span></td>
          <td>
            <div class="qty-control">
              <button class="qty-btn btn-qty-minus" data-id="${it.itemId}" data-sources="${sourceItemIds}">-</button>
              <input type="number" class="qty-input" value="${it.quantity}" min="0.1" step="any" data-id="${it.itemId}" data-sources="${sourceItemIds}">
              <button class="qty-btn btn-qty-plus" data-id="${it.itemId}" data-sources="${sourceItemIds}">+</button>
            </div>
          </td>
          <td style="font-weight: 600;">${format(it.unitPrice)}</td>
          <td>${taxBadge}</td>
          <td style="color: var(--text-secondary);">${format(it.taxAmountPerUnit * it.quantity)}</td>
          <td style="font-weight: 600; color: var(--accent-gold);">${format(it.priceTaxInclusive)}</td>
          <td style="font-weight: 800; font-size: 1rem; color: var(--text-primary);">${format(it.subtotalTaxInclusive)}</td>
          <td>
            <button class="btn-icon btn-delete-row" data-id="${it.itemId}" data-sources="${sourceItemIds}" title="حذف الصنف">🗑️</button>
          </td>
        </tr>
      `;
    });

    this.tbody.innerHTML = html;

    // Render pagination controls
    if (this.pagination) {
      this.pagination.renderControls(meta);
    }

    // Attach event listeners to quantity controls and delete buttons
    this.tbody.querySelectorAll(".btn-qty-minus").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const sources = btn.getAttribute("data-sources");
        this.appController.updateItemQuantity(id, -1, sources);
      });
    });

    this.tbody.querySelectorAll(".btn-qty-plus").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const sources = btn.getAttribute("data-sources");
        this.appController.updateItemQuantity(id, 1, sources);
      });
    });

    this.tbody.querySelectorAll(".qty-input").forEach(input => {
      input.addEventListener("change", () => {
        const id = input.getAttribute("data-id");
        const sources = input.getAttribute("data-sources");
        this.appController.setItemQuantity(id, input.value, sources);
      });
    });

    this.tbody.querySelectorAll(".btn-delete-row").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const sources = btn.getAttribute("data-sources");
        this.appController.deleteItemRow(id, sources);
      });
    });
  }

  static updateCategoryOptions() {
    const select = document.getElementById("category-filter");
    const modalSelect = document.getElementById("item-category");
    if (!select) return;

    const catalog = this.store.getState().catalog || [];
    const categories = Array.from(new Set(catalog.map(i => i.category).filter(Boolean)));

    let html = `<option value="all">كافة التصنيفات (الكل)</option>`;
    categories.forEach(c => {
      html += `<option value="${c}">${c}</option>`;
    });
    select.innerHTML = html;

    if (modalSelect) {
      modalSelect.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
    }
  }
}

if (typeof window !== "undefined") {
  window.ItemsTableComponent = ItemsTableComponent;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = ItemsTableComponent;
}
