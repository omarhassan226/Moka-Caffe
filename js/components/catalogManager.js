/**
 * Móka Billing ERP - Catalog Manager Component
 */

class CatalogManagerComponent {
  static init(store, appController) {
    this.store = store;
    this.appController = appController;
    this.tbody = document.getElementById("catalog-table-body");
    this.searchQuery = "";

    // Initialize Pagination Component
    this.pagination = new window.PaginationComponent({
      pageSize: 10,
      containerId: "catalog-pagination-container",
      onPageChange: () => this.render()
    });

    // Search filter input
    const searchInput = document.getElementById("catalog-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        if (this.pagination) this.pagination.currentPage = 1;
        this.render();
      });
    }

    // Add item form submission
    const formAddItem = document.getElementById("form-add-catalog-item");
    if (formAddItem) {
      formAddItem.addEventListener("submit", (e) => this.handleAddCatalogItem(e));
    }

    // Export Catalog Button
    const btnExport = document.getElementById("btn-export-catalog");
    if (btnExport) {
      btnExport.addEventListener("click", () => this.exportCatalog());
    }

    this.store.subscribe((state, changedKeys) => {
      if (changedKeys.includes("catalog")) {
        if (state.activeTab === "catalog") {
          this.render();
        }
      }
    });
  }

  static render() {
    if (!this.tbody) {
      this.tbody = document.getElementById("catalog-table-body");
      if (!this.tbody) return;
    }

    const catalog = this.store.getState().catalog || [];
    let list = catalog;

    // Filter by search query if any
    if (this.searchQuery) {
      list = list.filter(item =>
        (item.nameAr && item.nameAr.toLowerCase().includes(this.searchQuery)) ||
        (item.nameEn && item.nameEn.toLowerCase().includes(this.searchQuery)) ||
        (item.code && item.code.toLowerCase().includes(this.searchQuery)) ||
        (item.category && item.category.toLowerCase().includes(this.searchQuery))
      );
    }

    if (list.length === 0) {
      this.tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
            🔍 لا توجد أصناف تطابق البحث في شيت الأسعار
          </td>
        </tr>
      `;
      if (this.pagination) {
        this.pagination.renderControls({ totalItems: 0 });
      }
      return;
    }

    // Paginate catalog items
    const meta = this.pagination
      ? this.pagination.paginate(list)
      : { paginatedItems: list, totalItems: list.length };

    const format = window.Formatters ? window.Formatters.formatCurrency : (v) => `${v} ج.م`;
    const round = window.Formatters ? window.Formatters.roundCurrency : (v) => Math.round(v * 100) / 100;

    let html = "";
    meta.paginatedItems.forEach(item => {
      const taxBadge = item.taxType === "SCHD_5"
        ? `<span class="badge badge-schd">جدول 5%</span>`
        : item.taxType === "VAT_14"
          ? `<span class="badge badge-vat">ق.م 14%</span>`
          : `<span class="badge">معفى</span>`;

      const taxAmount = round(item.unitPrice * (item.taxRate || 0));
      const priceWithTax = round(item.unitPrice + taxAmount);

      html += `
        <tr>
          <td style="font-family: monospace; color: var(--text-muted);">${item.code || '---'}</td>
          <td style="font-weight: 700;">${item.nameAr}</td>
          <td style="color: var(--text-muted); font-family: Outfit;">${item.nameEn || ''}</td>
          <td><span class="badge badge-gold">${item.category}</span></td>
          <td>
            <input type="number" step="0.5" class="form-control catalog-price-input" 
              style="width: 100px; padding: 0.3rem 0.5rem; text-align: center;" 
              value="${item.unitPrice}" data-id="${item.id}">
          </td>
          <td>${taxBadge}</td>
          <td style="font-weight: 700; color: var(--accent-gold);">${format(priceWithTax)}</td>
          <td>
            <button class="btn btn-secondary btn-edit-catalog" style="padding: 0.25rem 0.6rem; font-size: 0.8rem;" data-id="${item.id}">تعديل</button>
            <button class="btn-icon btn-delete-catalog" style="width: 32px; height: 32px;" data-id="${item.id}" title="حذف الصنف">🗑️</button>
          </td>
        </tr>
      `;
    });

    this.tbody.innerHTML = html;

    // Render pagination controls
    if (this.pagination) {
      this.pagination.renderControls(meta);
    }

    // Attach listeners
    this.tbody.querySelectorAll(".catalog-price-input").forEach(input => {
      input.addEventListener("change", (e) => {
        const id = input.getAttribute("data-id");
        this.updateCatalogPrice(id, e.target.value);
      });
    });

    this.tbody.querySelectorAll(".btn-edit-catalog").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        this.editCatalogItem(id);
      });
    });

    this.tbody.querySelectorAll(".btn-delete-catalog").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        this.deleteCatalogItem(id);
      });
    });
  }

  static async updateCatalogPrice(itemId, newPrice) {
    const price = parseFloat(newPrice);
    if (!isNaN(price) && price >= 0) {
      const item = this.store.getState().catalog.find(entry => entry.id === itemId);
      if (!item) return;
      try {
        await window.api.updateItem(itemId, { ...item, unitPrice: price });
        await this.appController.loadData(false);
        window.ToastComponent.show(`تم تحديث سعر "${item.nameAr}" إلى ${price} ج.م`);
      } catch (err) {
        window.ToastComponent.show(err.message, "error");
      }
    }
  }

  static async deleteCatalogItem(itemId) {
    const confirmed = await window.ModalComponent.confirm({
      title: "حذف صنف من شيت الأسعار",
      message: "هل تريد بالتأكيد حذف هذا الصنف نهائياً من شيت الأسعار الرئيسي؟",
      confirmText: "نعم، حذف الصنف",
      isDanger: true,
      icon: "⚠️"
    });

    if (confirmed) {
      try {
        await window.api.deleteItem(itemId);
        await this.appController.loadData(false);
        this.render();
        window.ToastComponent.show("تم حذف الصنف من الشيت بنجاح");
      } catch (error) {
        window.ToastComponent.show(error.message, "error");
      }
    }
  }

  static editCatalogItem(itemId) {
    const item = this.store.getState().catalog.find(entry => entry.id === itemId);
    if (!item) return;

    const form = document.getElementById("form-add-catalog-item");
    form.dataset.itemId = item.id;
    document.getElementById("item-code").value = item.code || "";
    document.getElementById("item-name-ar").value = item.nameAr || "";
    document.getElementById("item-name-en").value = item.nameEn || "";
    document.getElementById("item-category").value = item.category;
    document.getElementById("item-price").value = item.unitPrice;
    document.getElementById("item-tax-type").value = item.taxType;
    document.getElementById("item-aliases").value = (item.aliases || []).join(", ");
    document.getElementById("catalog-form-title").textContent = "✏️ تعديل صنف شيت الأسعار";
    document.getElementById("catalog-form-submit").textContent = "حفظ التعديلات";
    window.ModalComponent.open("modal-add-item");
  }

  static openAddModal() {
    const form = document.getElementById("form-add-catalog-item");
    if (!form) return;
    form.reset();
    delete form.dataset.itemId;
    document.getElementById("catalog-form-title").textContent = "➕ إضافة صنف جديد لشيت الأسعار";
    document.getElementById("catalog-form-submit").textContent = "حفظ في شيت الأسعار";
    window.ModalComponent.open("modal-add-item");
  }

  static async handleAddCatalogItem(e) {
    e.preventDefault();
    const code = document.getElementById("item-code").value.trim();
    const nameAr = document.getElementById("item-name-ar").value.trim();
    const nameEn = document.getElementById("item-name-en").value.trim();
    const category = document.getElementById("item-category").value;
    const unitPrice = parseFloat(document.getElementById("item-price").value) || 0;
    const taxType = document.getElementById("item-tax-type").value;
    const taxRate = taxType === "SCHD_5" ? 0.05 : taxType === "VAT_14" ? 0.14 : 0;
    const aliasesInput = document.getElementById("item-aliases").value;
    const aliases = aliasesInput ? aliasesInput.split(",").map(s => s.trim()).filter(Boolean) : [];

    const newItem = {
      code: code || `GEN-${Math.floor(1000 + Math.random() * 9000)}`,
      nameAr,
      nameEn,
      category,
      unitPrice,
      taxType,
      taxRate,
      unit: "قطعة",
      aliases: [nameAr, ...aliases]
    };

    try {
      const itemId = e.target.dataset.itemId;
      if (itemId) {
        await window.api.updateItem(itemId, newItem);
      } else {
        await window.api.createItem(newItem);
      }

      e.target.reset();
      delete e.target.dataset.itemId;
      document.getElementById("catalog-form-title").textContent = "➕ إضافة صنف جديد لشيت الأسعار";
      document.getElementById("catalog-form-submit").textContent = "حفظ في شيت الأسعار";
      window.ModalComponent.close("modal-add-item");

      await this.appController.loadData(false);
      this.render();
      window.ToastComponent.show(itemId ? `تم تحديث الصنف "${nameAr}" بنجاح!` : `تمت إضافة الصنف "${nameAr}" بنجاح!`);
    } catch (error) {
      window.ToastComponent.show(error.message, "error");
    }
  }

  static exportCatalog() {
    const catalog = this.store.getState().catalog || [];
    if (typeof ExportManager !== "undefined") {
      ExportManager.exportCatalogToCSV(catalog);
    }
    window.ToastComponent.show("تم تحميل شيت الأسعار كإكسيل بنجاح!");
  }
}

if (typeof window !== "undefined") {
  window.CatalogManagerComponent = CatalogManagerComponent;
  window.openAddCatalogItem = () => CatalogManagerComponent.openAddModal();
  window.exportCatalogToExcel = () => CatalogManagerComponent.exportCatalog();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = CatalogManagerComponent;
}
