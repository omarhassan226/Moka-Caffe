/**
 * Móka Billing ERP - Financial KPI Cards Component
 */

class KpiCardsComponent {
  static init(store, appController) {
    this.store = store;
    this.appController = appController;

    this.store.subscribe((state, changedKeys) => {
      if (
        changedKeys.includes("activeCalculation") ||
        changedKeys.includes("combinedCalculation") ||
        changedKeys.includes("activeBranchIndex")
      ) {
        this.render();
      }
    });
  }

  static render() {
    const data = this.store.getActiveCalculationData();
    const sum = data.summary || {
      totalUnits: 0,
      untaxedTotal: 0,
      schd5Amount: 0,
      vat14Amount: 0,
      totalTaxes: 0,
      grandTotal: 0,
      missingItemsCount: 0
    };

    const elUnits = document.getElementById("kpi-total-units");
    const elUntaxed = document.getElementById("kpi-untaxed");
    const elSchd5 = document.getElementById("kpi-schd5");
    const elVat14 = document.getElementById("kpi-vat14");
    const elTotalTaxes = document.getElementById("kpi-total-taxes");
    const elGrandTotal = document.getElementById("kpi-grand-total");

    const format = window.Formatters ? window.Formatters.formatCurrency : (v) => `${v} ج.م`;

    if (elUnits) elUnits.textContent = sum.totalUnits.toLocaleString('ar-EG');
    if (elUntaxed) elUntaxed.textContent = format(sum.untaxedTotal);
    if (elSchd5) elSchd5.textContent = format(sum.schd5Amount);
    if (elVat14) elVat14.textContent = format(sum.vat14Amount);
    if (elTotalTaxes) elTotalTaxes.textContent = format(sum.totalTaxes);
    if (elGrandTotal) elGrandTotal.textContent = format(sum.grandTotal);

    // Missing Items Alert Bar
    const missingAlert = document.getElementById("missing-items-alert");
    if (missingAlert) {
      if (sum.missingItemsCount > 0) {
        missingAlert.style.display = "flex";
        missingAlert.innerHTML = `
          <span>⚠️ يوجد <strong>${sum.missingItemsCount}</strong> صنف جديد غير مسجل في شيت الأسعار بدون سعر.</span>
          <button class="btn btn-outline-gold" style="padding: 0.25rem 0.75rem; font-size: 0.8rem;" id="btn-fix-missing-items">
            تحديث شيت الأسعار
          </button>
        `;
        const fixBtn = document.getElementById("btn-fix-missing-items");
        if (fixBtn) {
          fixBtn.addEventListener("click", () => {
            this.appController.switchTab("catalog");
          });
        }
      } else {
        missingAlert.style.display = "none";
      }
    }
  }
}

if (typeof window !== "undefined") {
  window.KpiCardsComponent = KpiCardsComponent;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = KpiCardsComponent;
}
