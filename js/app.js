/**
 * Móka Billing ERP - Main Application Orchestrator & Controller
 * Connects reactive Store, ApiService, and Modular UI Components.
 */

class AppController {
  constructor() {
    this.store = window.store;
    this.api = window.api;
  }

  /**
   * Initialize Application and Component Tree
   */
  async init() {
    console.log("Initializing Móka Billing ERP Enterprise Application...");

    // 1. Initialize UI Helpers
    window.ToastComponent.init();
    window.ModalComponent.init();
    this.initApiSettingsModal();

    // 2. Initialize Theme
    const currentTheme = this.store.getState().theme || localStorage.getItem("moka_theme") || "dark";
    this.store.setTheme(currentTheme);

    // 3. Initialize Modular Components
    window.HeaderComponent.init(this.store, this);
    window.BranchSelectorComponent.init(this.store, this);
    window.KpiCardsComponent.init(this.store, this);
    window.ItemsTableComponent.init(this.store, this);
    window.CategoriesBreakdownComponent.init(this.store, this);
    window.SmartParserComponent.init(this.store, this);
    window.CatalogManagerComponent.init(this.store, this);
    window.InvoiceViewComponent.init(this.store, this);

    // 4. Load Data from Backend API
    try {
      await this.loadData(false);
    } catch (err) {
      window.ToastComponent.show("فشل الاتصال بالخادم: " + err.message, "error");
    }
  }

  /**
   * Load catalog and orders from Backend API
   */
  async loadData(notifySuccess = false) {
    const currentState = this.store.getState();
    const activeOrderId = currentState.orders[currentState.activeBranchIndex]?.id;

    const [catalog, orders] = await Promise.all([
      this.api.getItems(),
      this.api.getOrders()
    ]);

    let newActiveIndex = -1;
    if (activeOrderId) {
      const idx = orders.findIndex(o => o.id === activeOrderId);
      newActiveIndex = idx >= 0 ? idx : -1;
    } else if (currentState.activeBranchIndex < orders.length) {
      newActiveIndex = currentState.activeBranchIndex;
    }

    this.store.setState({
      catalog,
      orders,
      activeBranchIndex: newActiveIndex
    });

    await this.refreshCalculation();

    if (notifySuccess) {
      window.ToastComponent.show("تم تحديث البيانات من قاعدة البيانات بنجاح.");
    }
  }

  /**
   * Refresh calculations for active branch or combined
   */
  async refreshCalculation() {
    const state = this.store.getState();
    const params = {
      consolidate: String(state.consolidateDuplicates)
    };

    if (state.activeBranchIndex >= 0 && state.orders[state.activeBranchIndex]) {
      params.orderId = state.orders[state.activeBranchIndex].id;
    }

    try {
      const calculation = await this.api.getOrderSummary(params);
      if (state.activeBranchIndex === -1) {
        this.store.setState({ combinedCalculation: calculation });
      } else {
        this.store.setState({ activeCalculation: calculation });
      }
    } catch (err) {
      window.ToastComponent.show("خطأ في احتساب الفاتورة: " + err.message, "error");
    }
  }

  /**
   * Switch Active Branch Selection
   */
  async selectBranch(idx) {
    this.store.setActiveBranchIndex(idx);
    await this.refreshCalculation();
  }

  /**
   * Switch Active Tab View
   */
  switchTab(tabId) {
    this.store.setActiveTab(tabId);
    if (tabId === "catalog") {
      window.CatalogManagerComponent.render();
    } else if (tabId === "invoice") {
      window.InvoiceViewComponent.render();
    } else if (tabId === "categories") {
      window.CategoriesBreakdownComponent.render();
    }
  }

  /**
   * Create New Branch / Order
   */
  async createNewBranch(name) {
    try {
      const order = await this.api.createOrder({
        name,
        items: []
      });
      await this.loadData(false);
      const orders = this.store.getState().orders;
      const createdIdx = orders.findIndex(o => o.id === order.id);
      if (createdIdx >= 0) {
        this.store.setActiveBranchIndex(createdIdx);
        await this.refreshCalculation();
      }
      window.ToastComponent.show(`تم إنشاء فرع "${name}" بنجاح!`);
    } catch (err) {
      window.ToastComponent.show(err.message, "error");
    }
  }

  /**
   * Delete Branch Order and All Associated Items
   */
  async deleteBranch(orderId) {
    try {
      await this.api.deleteOrder(orderId);
      this.store.setActiveBranchIndex(-1);
      await this.loadData(false);
      window.ToastComponent.show("تم حذف الفرع وكافة أصنافه المرتبطة به بنجاح.");
    } catch (err) {
      window.ToastComponent.show("فشل حذف الفرع: " + err.message, "error");
    }
  }

  /**
   * Initialize API Settings Modal
   */
  initApiSettingsModal() {
    const form = document.getElementById("form-api-settings");
    const input = document.getElementById("api-url-input");
    const btnDefault = document.getElementById("btn-api-default");
    const btnLocalhost = document.getElementById("btn-api-localhost");

    if (input) {
      input.value = this.api.baseUrl;
    }

    if (btnDefault && input) {
      btnDefault.addEventListener("click", () => {
        input.value = "/api";
      });
    }

    if (btnLocalhost && input) {
      btnLocalhost.addEventListener("click", () => {
        input.value = "http://localhost:5000/api";
      });
    }

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const newUrl = input ? input.value.trim() : "";
        this.api.setBaseUrl(newUrl || "/api");
        window.ModalComponent.close("modal-api-settings");
        window.ToastComponent.show(`تم ضبط رابط الـ API على: ${this.api.baseUrl}`);
        try {
          await this.loadData(true);
        } catch (err) {
          window.ToastComponent.show("تعذر الاتصال بالرابط الجديد: " + err.message, "error");
        }
      });
    }
  }

  /**
   * Update Item Quantity in Active Order (+1 / -1)
   */
  async updateItemQuantity(itemId, change, sourceIds = itemId) {
    const state = this.store.getState();
    if (state.activeBranchIndex === -1) {
      window.ToastComponent.show("تعديل الكميات يتم باختيار الفرع المحدد أولاً", "info");
      return;
    }

    const order = state.orders[state.activeBranchIndex];
    if (!order) return;

    const ids = sourceIds.split(",");
    const matchingItems = order.items.filter(entry => ids.includes(entry.id));
    if (!matchingItems.length) return;

    const newQty = matchingItems.reduce((total, item) => total + item.quantity, 0) + change;
    let items;
    if (newQty <= 0) {
      const confirmed = await window.ModalComponent.confirm({
        title: "حذف الصنف من الطلبية",
        message: "أصبحت الكمية صفر، هل تريد حذف هذا الصنف نهائياً من الطلبية؟",
        confirmText: "نعم، حذف الصنف",
        isDanger: true,
        icon: "🗑️"
      });
      if (confirmed) {
        items = order.items.filter(entry => !ids.includes(entry.id));
      } else {
        return;
      }
    } else {
      let kept = false;
      items = order.items.flatMap(entry => {
        if (!ids.includes(entry.id)) return [entry];
        if (kept) return [];
        kept = true;
        return [{ ...entry, quantity: newQty }];
      });
    }

    await this.persistOrderItems(order, items);
  }

  /**
   * Set specific Item Quantity
   */
  async setItemQuantity(itemId, val, sourceIds = itemId) {
    const state = this.store.getState();
    if (state.activeBranchIndex === -1) {
      window.ToastComponent.show("يرجى اختيار الفرع المحدد لتعديل الكمية", "info");
      return;
    }

    const order = state.orders[state.activeBranchIndex];
    if (!order) return;

    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      const ids = sourceIds.split(",");
      let kept = false;
      const items = order.items.flatMap(entry => {
        if (!ids.includes(entry.id)) return [entry];
        if (kept) return [];
        kept = true;
        return [{ ...entry, quantity: num }];
      });
      await this.persistOrderItems(order, items);
    }
  }

  /**
   * Delete Item Row from Active Order
   */
  async deleteItemRow(itemId, sourceIds = itemId) {
    const state = this.store.getState();
    if (state.activeBranchIndex === -1) {
      window.ToastComponent.show("يرجى اختيار الفرع لحذف الصنف منه", "info");
      return;
    }

    const order = state.orders[state.activeBranchIndex];
    if (!order) return;

    const confirmed = await window.ModalComponent.confirm({
      title: "تأكيد حذف الصنف",
      message: "هل أنت متأكد من حذف هذا الصنف من طلبية الفرع المحدد؟",
      confirmText: "نعم، حذف الصنف",
      isDanger: true,
      icon: "🗑️"
    });
    if (!confirmed) return;

    const ids = sourceIds.split(",");
    const items = order.items.filter(entry => !ids.includes(entry.id));
    await this.persistOrderItems(order, items);
    window.ToastComponent.show("تم حذف الصنف من الطلبية بنجاح");
  }

  /**
   * Persist Order Items to Database
   */
  async persistOrderItems(order, items) {
    try {
      await this.api.updateOrder(order.id, { items });
      await this.loadData(false);
    } catch (err) {
      window.ToastComponent.show(err.message, "error");
    }
  }

  /**
   * Export Current Order / Branch to Excel / CSV
   */
  exportCurrentOrder() {
    const data = this.store.getActiveCalculationData();
    if (typeof ExportManager !== "undefined") {
      ExportManager.exportOrderToCSV(data);
    } else {
      window.ToastComponent.show("أداة التصدير غير متوفرة", "error");
      return;
    }
    window.ToastComponent.show("تم تصدير ملف الإكسيل بنجاح!");
  }
}

// Global App instance
const appController = new AppController();

// Legacy Global API Bridge for inline onclicks
window.appController = appController;
window.selectBranch = (idx) => appController.selectBranch(idx);
window.switchTab = (tab) => appController.switchTab(tab);
window.toggleTheme = () => appController.store.toggleTheme();
window.resetFactoryData = () => appController.loadData(true);
window.exportToExcel = () => appController.exportCurrentOrder();
window.updateItemQuantity = (id, change, sources) => appController.updateItemQuantity(id, change, sources);
window.setItemQuantity = (id, val, sources) => appController.setItemQuantity(id, val, sources);
window.deleteItemRow = (id, sources) => appController.deleteItemRow(id, sources);
window.openNewBranchModal = () => window.BranchSelectorComponent.openNewBranchModal();
window.openApiSettingsModal = () => {
  const input = document.getElementById("api-url-input");
  if (input) input.value = window.api.baseUrl;
  window.ModalComponent.open("modal-api-settings");
};

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  appController.init();
});
