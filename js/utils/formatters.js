/**
 * Móka Billing ERP - Formatting Utilities
 */

const Formatters = {
  /**
   * Format number as Egyptian Pounds (ج.م)
   */
  formatCurrency(num) {
    const val = parseFloat(num) || 0;
    return val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " ج.م";
  },

  /**
   * Round to 2 decimal places to match financial standards
   */
  roundCurrency(num) {
    return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
  },

  /**
   * Format date to locale string
   */
  formatDate(dateInput) {
    if (!dateInput) return new Date().toLocaleDateString('en-GB');
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? new Date().toLocaleDateString('en-GB') : d.toLocaleDateString('en-GB');
  },

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
};

if (typeof window !== "undefined") {
  window.Formatters = Formatters;
  window.formatCurrency = Formatters.formatCurrency;
  window.roundCurrency = Formatters.roundCurrency;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = Formatters;
}
