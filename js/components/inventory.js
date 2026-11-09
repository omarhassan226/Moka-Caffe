/**
 * Móka Billing ERP - Advanced Warehouse & Expiry Management Component
 * Handles:
 * - Real-time stock levels & valuation
 * - Automated 3-day / 5-day / 14-day expiry countdown tracking
 * - Automatic baseline import from "جرد موكا 9-11-2026.xlsx"
 * - Automated waste deduction from "west 11.xlsx"
 * - Automated incoming goods additions
 * - Expiry detection & automated deduction to waste
 * - Full audit movements trail
 */

class InventoryComponent {
  static store = null;
  static appController = null;
  static api = null;

  static currentFilter = "all";
  static searchQuery = "";
  static currentTab = "stock"; // "stock" | "movements"
  static inventoryData = null;
  static movementsData = [];

  static init(store, appController) {
    this.store = store;
    this.appController = appController;
    this.api = window.api;

    this.bindEvents();
    console.log("Inventory & Expiry Component initialized.");
  }

  static bindEvents() {
    // Search input
    const searchInput = document.getElementById("inventory-search-input");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchQuery = e.target.value.trim();
        this.renderTable();
      });
    }

    // Filter pills
    document.querySelectorAll(".inventory-filter-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".inventory-filter-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this.currentFilter = pill.getAttribute("data-filter") || "all";
        this.renderTable();
      });
    });

    // Subtabs (Stock vs Movements)
    document.querySelectorAll(".inventory-subtab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-subtab");
        this.switchSubtab(tab);
      });
    });
  }

  static switchSubtab(tab) {
    this.currentTab = tab;
    document.querySelectorAll(".inventory-subtab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-subtab") === tab);
    });

    const stockPanel = document.getElementById("inventory-subpanel-stock");
    const movementsPanel = document.getElementById("inventory-subpanel-movements");

    if (stockPanel) stockPanel.style.display = tab === "stock" ? "block" : "none";
    if (movementsPanel) movementsPanel.style.display = tab === "movements" ? "block" : "none";

    if (tab === "movements") {
      this.loadMovements();
    }
  }

  static async loadData() {
    try {
      const res = await this.api.getInventoryOverview();
      if (res && res.data) {
        this.inventoryData = res.data;
        this.renderKPIs(res.data.kpi);
        this.renderTable();
      }
    } catch (err) {
      console.error("Failed to load inventory:", err);
      window.ToastComponent.show("تعذر تحميل بيانات المخزن: " + err.message, "error");
    }
  }

  static async loadMovements() {
    try {
      const res = await this.api.getInventoryMovements({ limit: 100 });
      if (res && res.data) {
        this.movementsData = res.data;
        this.renderMovementsTable();
      }
    } catch (err) {
      console.error("Failed to load movements:", err);
    }
  }

  static render() {
    this.loadData();
  }

  static renderKPIs(kpi) {
    if (!kpi) return;
    const elItems = document.getElementById("inv-kpi-items");
    const elUnits = document.getElementById("inv-kpi-units");
    const elVal = document.getElementById("inv-kpi-valuation");
    const elSoon = document.getElementById("inv-kpi-expiring-soon");
    const elExpired = document.getElementById("inv-kpi-expired");

    if (elItems) elItems.textContent = `${kpi.availableItemsCount} / ${kpi.totalUniqueItems} صنف`;
    if (elUnits) elUnits.textContent = `${kpi.totalStockUnits.toLocaleString()} قطعة`;
    if (elVal) elVal.textContent = `${kpi.totalStockValuation.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
    if (elSoon) elSoon.textContent = `${kpi.expiringSoonCount} صنف`;
    if (elExpired) elExpired.textContent = `${kpi.expiredCount} صنف`;

    // Highlight alert cards
    const soonCard = document.getElementById("inv-card-soon");
    if (soonCard) {
      soonCard.style.borderColor = kpi.expiringSoonCount > 0 ? "rgba(245, 158, 11, 0.6)" : "var(--border-color)";
    }
    const expiredCard = document.getElementById("inv-card-expired");
    if (expiredCard) {
      expiredCard.style.borderColor = kpi.expiredCount > 0 ? "rgba(244, 63, 94, 0.7)" : "var(--border-color)";
    }
  }

  static renderTable() {
    const tbody = document.getElementById("inventory-table-body");
    const emptyState = document.getElementById("inventory-empty-state");
    if (!tbody) return;

    if (!this.inventoryData || !this.inventoryData.items || this.inventoryData.items.length === 0) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    let items = this.inventoryData.items;

    // Filter
    if (this.currentFilter === "in_stock") {
      items = items.filter(i => i.currentStock > 0);
    } else if (this.currentFilter === "expiring_soon") {
      items = items.filter(i => i.status === "expiring_soon" || i.status === "expiring_today");
    } else if (this.currentFilter === "expired") {
      items = items.filter(i => i.status === "expired");
    } else if (this.currentFilter === "out_of_stock") {
      items = items.filter(i => i.currentStock === 0);
    }

    // Search
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      items = items.filter(i =>
        (i.nameAr && i.nameAr.toLowerCase().includes(q)) ||
        (i.nameEn && i.nameEn.toLowerCase().includes(q)) ||
        (i.category && i.category.toLowerCase().includes(q))
      );
    }

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">لا توجد أصناف مطابقة لبحثك أو التصفية الحالية.</td></tr>`;
      if (emptyState) emptyState.style.display = "none";
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    tbody.innerHTML = items.map((it, idx) => {
      // Expiry badge
      let expiryBadge = `<span class="badge" style="background: rgba(255,255,255,0.06); color: var(--text-muted);">غير محدد</span>`;
      if (it.currentStock > 0) {
        if (it.status === "expired") {
          expiryBadge = `<span class="badge" style="background: var(--color-rose-bg); color: var(--color-rose); font-weight: 700; border: 1px solid var(--color-rose);">⚠️ منتهي الصلاحية (${Math.abs(it.daysRemaining)} يوم مضت)</span>`;
        } else if (it.status === "expiring_today") {
          expiryBadge = `<span class="badge" style="background: rgba(245,158,11,0.25); color: #fbbf24; font-weight: 700; border: 1px solid #fbbf24;">⚡ ينتهي اليوم (${it.nearestExpiry})</span>`;
        } else if (it.status === "expiring_soon") {
          expiryBadge = `<span class="badge" style="background: rgba(245,158,11,0.15); color: var(--accent-gold); font-weight: 600;">⏳ باقي ${it.daysRemaining} يوم (${it.nearestExpiry})</span>`;
        } else {
          expiryBadge = `<span class="badge" style="background: var(--color-emerald-bg); color: var(--color-emerald); font-weight: 600;">🟢 صالح (${it.daysRemaining} يوم متبقية)</span>`;
        }
      } else {
        expiryBadge = `<span class="badge" style="color: var(--text-muted); background: rgba(255,255,255,0.04);">نفد الرصيد</span>`;
      }

      // Shelf life rule label
      let shelfLabel = "3 أيام (طازج)";
      if (it.shelfLifeType === "frozen_14d" || it.defaultExpiryDays >= 14) {
        shelfLabel = "❄️ 14 يوم (مجمدات)";
      } else if (it.shelfLifeType === "pastry_5d" || it.defaultExpiryDays >= 5) {
        shelfLabel = "🍪 5 أيام (مخبوزات)";
      } else {
        shelfLabel = "🥪 3 أيام (طازج/ساندوتش)";
      }

      // Stock badge
      let stockDisplay = `<strong style="font-size: 1.05rem; font-family: 'Outfit', sans-serif;">${it.currentStock}</strong> <small style="font-size: 0.72rem; color: var(--text-muted);">${it.unit}</small>`;
      if (it.currentStock === 0) {
        stockDisplay = `<span style="color: var(--text-muted); font-size: 0.82rem;">0 (غير متوفر)</span>`;
      } else if (it.currentStock <= 2) {
        stockDisplay += ` <span style="font-size: 0.65rem; background: rgba(244,63,94,0.12); color: var(--color-rose); padding: 1px 4px; border-radius: 3px;">منخفض</span>`;
      }

      return `
        <tr>
          <td style="text-align: center; color: var(--text-muted); font-size: 0.75rem;">${idx + 1}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${it.nameAr}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); font-family: 'Outfit', sans-serif;">${it.nameEn || ""}</div>
          </td>
          <td><span class="badge badge-category" style="font-size: 0.72rem;">${it.category}</span></td>
          <td style="font-size: 0.8rem; color: var(--text-secondary);">${shelfLabel}</td>
          <td style="text-align: center;">${stockDisplay}</td>
          <td>${expiryBadge}</td>
          <td style="font-family: 'Outfit', sans-serif; font-size: 0.88rem; font-weight: 600;">
            ${it.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small style="font-size: 0.68rem; color: var(--text-muted);">ج.م</small>
            <div style="font-size: 0.68rem; color: var(--text-secondary); font-weight: normal;">(سعر الوحدة: ${it.unitCost.toFixed(2)})</div>
          </td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 0.35rem; justify-content: center;">
              <button class="btn btn-secondary" onclick="window.InventoryComponent.openAdjustModal('${it.id}', '${escape(it.nameAr)}', ${it.currentStock})" title="تعديل الرصيد يدوياً" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">
                ✏️ تسوية
              </button>
              ${it.batchesCount > 0 ? `
              <button class="btn btn-secondary" onclick="window.InventoryComponent.showBatches('${it.id}')" title="عرض الباتشات والتواريخ" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; border-color: rgba(255,255,255,0.15);">
                📦 ${it.batchesCount}
              </button>` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  static renderMovementsTable() {
    const tbody = document.getElementById("inventory-movements-tbody");
    if (!tbody) return;

    if (!this.movementsData || this.movementsData.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">لا توجد حركات مسجلة حتى الآن.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.movementsData.map((m, idx) => {
      let typeBadge = "";
      if (m.type === "IN_INITIAL") {
        typeBadge = `<span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8;">📋 رصيد افتتاحي</span>`;
      } else if (m.type === "IN_PURCHASE") {
        typeBadge = `<span class="badge" style="background: var(--color-emerald-bg); color: var(--color-emerald);">📥 بضاعة واردة</span>`;
      } else if (m.type === "OUT_WASTE") {
        typeBadge = `<span class="badge" style="background: var(--color-rose-bg); color: var(--color-rose);">🗑️ خصم هالك (ويست)</span>`;
      } else if (m.type === "OUT_EXPIRED") {
        typeBadge = `<span class="badge" style="background: rgba(244, 63, 94, 0.2); color: #f43f5e; font-weight: 700;">⌛ انتهاء صلاحية</span>`;
      } else {
        typeBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: var(--accent-gold);">⚖️ تسوية جرد</span>`;
      }

      const qtyColor = m.quantity > 0 ? "var(--color-emerald)" : "var(--color-rose)";
      const qtySign = m.quantity > 0 ? "+" : "";

      const d = new Date(m.movementDate || m.createdAt);
      const dateStr = d.toISOString().split("T")[0];

      return `
        <tr>
          <td style="text-align: center; color: var(--text-muted); font-size: 0.72rem;">${idx + 1}</td>
          <td style="font-size: 0.8rem; font-family: 'Outfit', sans-serif;">${dateStr}</td>
          <td>${typeBadge}</td>
          <td style="font-weight: 600;">${m.itemName}</td>
          <td style="font-family: 'Outfit', sans-serif; font-weight: 700; color: ${qtyColor}; text-align: center;">
            ${qtySign}${m.quantity}
          </td>
          <td style="text-align: center; font-family: 'Outfit', sans-serif; font-size: 0.8rem; color: var(--text-secondary);">
            ${m.previousStock} ➔ <strong>${m.newStock}</strong>
          </td>
          <td style="font-size: 0.78rem; color: var(--text-secondary);">${m.reason || m.reference || "—"}</td>
        </tr>
      `;
    }).join("");
  }

  // ==================== Actions & One-Click Workflows ====================

  /**
   * One-Click Sync: Initializes stock from 'جرد موكا 9-11-2026.xlsx' and deducts 'west 11.xlsx'
   */
  static async syncLocalSheetsNow() {
    const btn = document.getElementById("btn-sync-local-sheets");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "⏳ جاري مزامنة الجرد وخصم الويست...";
    }

    try {
      const res = await this.api.syncLocalInventorySheets();
      if (res && res.success) {
        window.ToastComponent.show("✅ " + res.message, "success");
        await this.loadData();
      } else {
        throw new Error(res?.message || "فشلت المزامنة");
      }
    } catch (err) {
      console.error(err);
      window.ToastComponent.show("فشلت المزامنة: " + err.message, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "🔄 مزامنة الجرد والويست تلقائياً";
      }
    }
  }

  /**
   * One-Click Expiry Deduction
   */
  static async deductExpiredNow() {
    if (!confirm("هل تريد فحص وخصم كافة الأصناف المنتهية الصلاحية تلقائياً من رصيد المخزن وتسجيلها كهالك؟")) {
      return;
    }

    try {
      const res = await this.api.deductExpiredGoods({ autoDeductAll: true });
      if (res && res.success) {
        window.ToastComponent.show(res.message, res.totalExpiredUnits > 0 ? "warning" : "info");
        await this.loadData();
      }
    } catch (err) {
      window.ToastComponent.show("خطأ في فحص الصلاحيات: " + err.message, "error");
    }
  }

  // ==================== Modals ====================

  static openImportIncomingModal() {
    window.ModalComponent.open("modal-import-incoming-stock");
  }

  static openImportWasteModal() {
    window.ModalComponent.open("modal-import-waste-sheet");
  }

  static openInitialCountModal() {
    window.ModalComponent.open("modal-import-initial-count");
  }

  static openAdjustModal(id, encodedName, currentStock) {
    const name = unescape(encodedName);
    const idInput = document.getElementById("adjust-item-id");
    const nameSpan = document.getElementById("adjust-item-name");
    const currentSpan = document.getElementById("adjust-item-current");
    const newQtyInput = document.getElementById("adjust-new-qty");

    if (idInput) idInput.value = id;
    if (nameSpan) nameSpan.textContent = name;
    if (currentSpan) currentSpan.textContent = currentStock;
    if (newQtyInput) newQtyInput.value = currentStock;

    window.ModalComponent.open("modal-adjust-stock");
  }

  static async submitStockAdjustment(e) {
    if (e) e.preventDefault();
    const itemId = document.getElementById("adjust-item-id")?.value;
    const newQty = Number(document.getElementById("adjust-new-qty")?.value);
    const reason = document.getElementById("adjust-reason")?.value || "تسوية جرد يدوية";

    if (!itemId || isNaN(newQty) || newQty < 0) {
      window.ToastComponent.show("يرجى إدخال كمية صحيحة موجبة", "warning");
      return;
    }

    try {
      const res = await this.api.adjustInventoryStock({ itemId, newQuantity: newQty, reason });
      if (res && res.success) {
        window.ToastComponent.show(res.message, "success");
        window.ModalComponent.close("modal-adjust-stock");
        await this.loadData();
      }
    } catch (err) {
      window.ToastComponent.show("فشلت التسوية: " + err.message, "error");
    }
  }

  static showBatches(itemId) {
    const item = (this.inventoryData?.items || []).find(i => String(i.id) === String(itemId));
    if (!item) return;

    const modalTitle = document.getElementById("batches-modal-title");
    const batchesContainer = document.getElementById("batches-modal-list");

    if (modalTitle) modalTitle.textContent = `تفاصيل وتواريخ صلاحية: ${item.nameAr}`;

    if (batchesContainer) {
      if (!item.batches || item.batches.length === 0) {
        batchesContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.5rem;">لا توجد باتشات نشطة لهذا الصنف حالياً.</div>`;
      } else {
        batchesContainer.innerHTML = item.batches.map((b, idx) => `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.75rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 700; color: var(--text-primary); font-family: 'Outfit', sans-serif;">باتش #${idx + 1}: ${b.batchNumber}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
                تاريخ الورود: <strong>${b.arrivalDate || "—"}</strong> | تاريخ الانتهاء: <strong style="color: var(--accent-gold);">${b.expiryDate || "—"}</strong>
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">المصدر: ${b.source || "جرد"}</div>
            </div>
            <div style="text-align: left;">
              <span style="font-size: 1.15rem; font-weight: 800; font-family: 'Outfit', sans-serif; color: var(--accent-gold);">${b.quantity}</span>
              <small style="font-size: 0.7rem; color: var(--text-muted);"> قطعة</small>
            </div>
          </div>
        `).join("");
      }
    }

    window.ModalComponent.open("modal-view-batches");
  }

  /**
   * Handle incoming goods file upload
   */
  static async handleIncomingFileUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileData = e.target.result;
      const arrivalDate = document.getElementById("incoming-arrival-date")?.value || new Date().toISOString().split("T")[0];

      try {
        window.ToastComponent.show("جاري قراءة واستيراد البضاعة الواردة...", "info");
        const res = await window.api.importIncomingGoods({ fileData, arrivalDate });
        if (res && res.success) {
          window.ToastComponent.show(res.message, "success");
          window.ModalComponent.close("modal-import-incoming-stock");
          await window.InventoryComponent.loadData();
        }
      } catch (err) {
        window.ToastComponent.show("فشل استيراد البضاعة: " + err.message, "error");
      }
    };
    reader.readAsDataURL(file);
  }

  /**
   * Handle waste sheet file upload
   */
  static async handleWasteFileUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileData = e.target.result;

      try {
        window.ToastComponent.show("جاري خصم الويست وتحديث المخزن...", "info");
        const res = await window.api.importInventoryWaste({ fileData });
        if (res && res.success) {
          window.ToastComponent.show(res.message, "success");
          window.ModalComponent.close("modal-import-waste-sheet");
          await window.InventoryComponent.loadData();
        }
      } catch (err) {
        window.ToastComponent.show("فشل خصم الويست: " + err.message, "error");
      }
    };
    reader.readAsDataURL(file);
  }

  /**
   * Handle inventory baseline sheet file upload
   */
  static async handleInitialFileUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const fileData = e.target.result;
      const baselineDate = document.getElementById("initial-baseline-date")?.value || "2026-11-09";

      try {
        window.ToastComponent.show("جاري تهيئة أرصدة المخزن...", "info");
        const res = await window.api.importInventoryInitial({ fileData, baselineDate });
        if (res && res.success) {
          window.ToastComponent.show(res.message, "success");
          window.ModalComponent.close("modal-import-initial-count");
          await window.InventoryComponent.loadData();
        }
      } catch (err) {
        window.ToastComponent.show("فشل تهيئة الجرد: " + err.message, "error");
      }
    };
    reader.readAsDataURL(file);
  }
}

// Global registration
if (typeof window !== "undefined") {
  window.InventoryComponent = InventoryComponent;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = InventoryComponent;
}
