/**
 * Móka Billing ERP - Export Manager Module
 * Handles Excel / CSV exporting, Catalog downloads, and Print preparation
 */

class ExportManager {
  /**
   * Export currently viewed order / branch to Excel/CSV with Arabic UTF-8 BOM
   */
  static exportOrderToCSV(activeData) {
    const items = activeData.items;

    let csvContent = "\uFEFF"; // UTF-8 BOM for proper Arabic display in MS Excel
    csvContent += "كود الصنف,اسم الصنف عربي,اسم الصنف إنجليزي,التصنيف,الكمية,سعر الوحدة قبل الضريبة,نوع الضريبة,إجمالي الضريبة,السعر شامل الضريبة,الإجمالي النهائي\n";

    items.forEach(it => {
      const taxLabel = it.taxType === "SCHD_5"
        ? "ضريبة جدول 5%"
        : it.taxType === "VAT_14" ? "ضريبة قيمة مضافة 14%" : "معفى من الضريبة";
      csvContent += `"${it.code}","${it.nameAr}","${it.nameEn}","${it.category}",${it.quantity},${it.unitPrice},"${taxLabel}",${it.subtotalTax},${it.priceTaxInclusive},${it.subtotalTaxInclusive}\n`;
    });

    const sum = activeData.summary;
    csvContent += `\n"الإجماليات","","","",${sum.totalUnits},${sum.untaxedTotal},"الضرائب: ${sum.totalTaxes}",${sum.totalTaxes},"",${sum.grandTotal}\n`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `فاتورة_${activeData.title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  /**
   * Export Master Catalog to Excel/CSV
   */
  static exportCatalogToCSV(catalog) {
    let csv = "\uFEFF";
    csv += "الكود,اسم الصنف عربي,اسم الصنف إنجليزي,التصنيف,سعر الوحدة,نوع الضريبة,السعر شامل الضريبة,الأسماء الشائعة\n";

    catalog.forEach(it => {
      const taxLabel = it.taxType === "SCHD_5" ? "5%" : it.taxType === "VAT_14" ? "14%" : "0%";
      const taxAmount = it.unitPrice * (it.taxRate || 0);
      const withTax = it.unitPrice + taxAmount;
      const aliases = (it.aliases || []).join(" | ");
      csv += `"${it.code}","${it.nameAr}","${it.nameEn}","${it.category}",${it.unitPrice},"${taxLabel}",${withTax.toFixed(2)},"${aliases}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `شيت_اسعار_موكا_الرسمي_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ExportManager };
}
