/**
 * Móka Billing ERP - Categories Breakdown View Component
 */

class CategoriesBreakdownComponent {
  static init(store, appController) {
    this.store = store;
    this.appController = appController;
    this.container = document.getElementById("categories-grid");

    this.store.subscribe((state, changedKeys) => {
      if (
        changedKeys.includes("activeCalculation") ||
        changedKeys.includes("combinedCalculation") ||
        changedKeys.includes("activeBranchIndex")
      ) {
        if (state.activeTab === "categories") {
          this.render();
        }
      }
    });
  }

  static render() {
    if (!this.container) {
      this.container = document.getElementById("categories-grid");
      if (!this.container) return;
    }

    const data = this.store.getActiveCalculationData();
    const categories = data.summary?.categories || [];

    if (categories.length === 0) {
      this.container.innerHTML = `
        <p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">
          لا توجد أصناف حالياً لعرض التصنيفات.
        </p>
      `;
      return;
    }

    const format = window.Formatters ? window.Formatters.formatCurrency : (v) => `${v} ج.م`;

    let html = "";
    categories.forEach(cat => {
      const topItems = cat.items ? cat.items.slice(0, 4) : [];
      const remainingCount = (cat.items?.length || 0) - topItems.length;

      html += `
        <div class="category-group-card">
          <div class="category-group-header">
            <span class="category-group-title">🍰 ${cat.categoryName}</span>
            <span class="badge badge-gold">${cat.totalUnits} قطعة</span>
          </div>
          <div class="category-stat-row">
            <span>المبلغ قبل الضريبة:</span>
            <span>${format(cat.untaxedTotal)}</span>
          </div>
          <div class="category-stat-row">
            <span>إجمالي الضرائب:</span>
            <span>${format(cat.taxTotal)}</span>
          </div>
          <div class="category-stat-row bold">
            <span>الإجمالي شامل الضريبة:</span>
            <span style="color: var(--accent-gold);">${format(cat.totalWithTax)}</span>
          </div>
          <div style="margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color); font-size: 0.82rem; color: var(--text-secondary);">
            <strong>أهم الأصناف:</strong>
            <ul style="margin-right: 1.25rem; margin-top: 0.35rem; line-height: 1.6;">
              ${topItems.map(i => `<li>${i.nameAr} (${i.quantity} ${i.unit || 'قطعة'})</li>`).join('')}
              ${remainingCount > 0 ? `<li>... و ${remainingCount} صنف آخر</li>` : ''}
            </ul>
          </div>
        </div>
      `;
    });

    this.container.innerHTML = html;
  }
}

if (typeof window !== "undefined") {
  window.CategoriesBreakdownComponent = CategoriesBreakdownComponent;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = CategoriesBreakdownComponent;
}
