/**
 * Móka Billing ERP - Official Printable Invoice View Component
 */

class InvoiceViewComponent {
  static init(store, appController) {
    this.store = store;
    this.appController = appController;
    this.container = document.getElementById("invoice-printable-content");

    const btnPrint = document.getElementById("btn-print-invoice");
    if (btnPrint) {
      btnPrint.addEventListener("click", () => window.print());
    }

    this.store.subscribe((state, changedKeys) => {
      if (
        changedKeys.includes("activeCalculation") ||
        changedKeys.includes("combinedCalculation") ||
        changedKeys.includes("activeBranchIndex")
      ) {
        if (state.activeTab === "invoice") {
          this.render();
        }
      }
    });
  }

  static render() {
    if (!this.container) {
      this.container = document.getElementById("invoice-printable-content");
      if (!this.container) return;
    }

    const data = this.store.getActiveCalculationData();
    const sum = data.summary || {
      untaxedTotal: 0,
      vat14Base: 0,
      vat14Amount: 0,
      schd5Base: 0,
      schd5Amount: 0,
      grandTotal: 0
    };
    const items = data.items || [];
    const orderDate = data.orderDate
      ? (window.Formatters ? window.Formatters.formatDate(data.orderDate) : new Date(data.orderDate).toLocaleDateString('en-GB'))
      : new Date().toLocaleDateString('en-GB');

    let html = `
      <div class="invoice-print-card">
        <div class="invoice-brand-header">
          <div>
            <div class="invoice-logo-title">Móka</div>
            <div style="font-size: 0.85rem; color: #6b7280; letter-spacing: 2px;">BAKERY</div>
          </div>
          <div style="text-align: left; font-size: 0.85rem; color: #374151;">
            <strong>Daily Dose, Daily Dose Zamalek</strong><br>
            Tax ID: 560483929<br>
            Salesperson: abd elrahman khaled
          </div>
        </div>

        <div class="invoice-meta-grid">
          <div>
            <strong style="color: #1f2937;">Invoicing Address:</strong><br>
            Daily Dose<br>
            <strong>Shipping Address:</strong><br>
            Daily Dose, ${data.title}
          </div>
          <div style="text-align: left;">
            <h2 style="font-size: 1.35rem; color: #b45309; margin-bottom: 0.35rem;">Order # ${data.orderNumber || "Multiple Orders"}</h2>
            <div><strong>Order Date:</strong> ${orderDate}</div>
            <div><strong>Branch:</strong> ${data.title}</div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 0.88rem; margin-top: 1.5rem;">
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb; text-align: right; color: #4b5563;">
              <th style="padding: 0.6rem 0.5rem;">Description</th>
              <th style="padding: 0.6rem 0.5rem; text-align: center;">Quantity</th>
              <th style="padding: 0.6rem 0.5rem;">Unit Price</th>
              <th style="padding: 0.6rem 0.5rem;">Taxes</th>
              <th style="padding: 0.6rem 0.5rem;">Amount</th>
              <th style="padding: 0.6rem 0.5rem; text-align: left;">Tax Incl.</th>
            </tr>
          </thead>
          <tbody>
    `;

    items.forEach(it => {
      const taxLabel = it.taxType === "SCHD_5" ? "SCHD 5%" : it.taxType === "VAT_14" ? "VAT 14%" : "NONE";
      html += `
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 0.6rem 0.5rem;">
            <strong>[${it.code || '---'}]</strong> ${it.nameAr}<br>
            <span style="font-size: 0.78rem; color: #6b7280;">${it.nameEn || ''}</span>
          </td>
          <td style="padding: 0.6rem 0.5rem; text-align: center; font-weight: 600;">${it.quantity}.000 Units</td>
          <td style="padding: 0.6rem 0.5rem;">${(it.unitPrice || 0).toFixed(2)} LE</td>
          <td style="padding: 0.6rem 0.5rem;"><span style="font-size: 0.8rem; background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${taxLabel}</span></td>
          <td style="padding: 0.6rem 0.5rem;">${(it.subtotalUntaxed || 0).toFixed(2)} LE</td>
          <td style="padding: 0.6rem 0.5rem; text-align: left; font-weight: 700;">${(it.subtotalTaxInclusive || 0).toFixed(2)} LE</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>

        <div class="invoice-summary-box">
          <table class="invoice-summary-table">
            <tr>
              <td>Untaxed Amount</td>
              <td style="text-align: left; font-weight: 600;">${(sum.untaxedTotal || 0).toFixed(2)} LE</td>
            </tr>
            <tr>
              <td>VAT 14% on ${(sum.vat14Base || 0).toFixed(2)} LE</td>
              <td style="text-align: left;">${(sum.vat14Amount || 0).toFixed(2)} LE</td>
            </tr>
            <tr>
              <td>Schedule Tax 5% on ${(sum.schd5Base || 0).toFixed(2)} LE</td>
              <td style="text-align: left;">${(sum.schd5Amount || 0).toFixed(2)} LE</td>
            </tr>
            <tr class="total-row">
              <td>Total</td>
              <td style="text-align: left;">${(sum.grandTotal || 0).toFixed(2)} LE</td>
            </tr>
          </table>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
  }
}

if (typeof window !== "undefined") {
  window.InvoiceViewComponent = InvoiceViewComponent;
  window.renderPrintableInvoice = () => InvoiceViewComponent.render();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = InvoiceViewComponent;
}
