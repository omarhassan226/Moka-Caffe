/**
 * Móka Billing ERP - Reactive Application State Store
 * Implements a Pub/Sub store pattern to cleanly decouple state updates from UI rendering.
 */

class AppStore {
  constructor() {
    this.state = {
      catalog: [],
      orders: [],
      activeCalculation: null,
      combinedCalculation: null,
      parsedSections: [],
      activeBranchIndex: -1, // -1 means "All / Combined", 0, 1, ...
      activeTab: "details",
      searchQuery: "",
      categoryFilter: "all",
      consolidateDuplicates: false,
      theme: localStorage.getItem("moka_theme") || "dark",
      isLoading: false
    };

    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(changedKeys = []) {
    for (const listener of this.listeners) {
      try {
        listener(this.state, changedKeys);
      } catch (err) {
        console.error("Store listener error:", err);
      }
    }
  }

  setState(partialState) {
    const changedKeys = Object.keys(partialState);
    this.state = { ...this.state, ...partialState };
    this.notify(changedKeys);
  }

  // Helper getters
  getActiveCalculationData() {
    if (this.state.activeBranchIndex === -1) {
      return this.state.combinedCalculation || {
        title: "إجمالي كافة الفروع والطلبيات",
        items: [],
        summary: {
          totalUnits: 0,
          untaxedTotal: 0,
          schd5Amount: 0,
          vat14Amount: 0,
          totalTaxes: 0,
          grandTotal: 0,
          missingItemsCount: 0,
          categories: []
        }
      };
    } else {
      return this.state.activeCalculation || {
        title: this.state.orders[this.state.activeBranchIndex]?.name || "",
        items: [],
        summary: {
          totalUnits: 0,
          untaxedTotal: 0,
          schd5Amount: 0,
          vat14Amount: 0,
          totalTaxes: 0,
          grandTotal: 0,
          missingItemsCount: 0,
          categories: []
        }
      };
    }
  }

  getActiveOrder() {
    if (this.state.activeBranchIndex >= 0 && this.state.orders[this.state.activeBranchIndex]) {
      return this.state.orders[this.state.activeBranchIndex];
    }
    return null;
  }

  // Actions
  setTheme(theme) {
    const validTheme = theme === "light" ? "light" : "dark";
    localStorage.setItem("moka_theme", validTheme);
    document.documentElement.setAttribute("data-theme", validTheme);
    if (document.body) {
      document.body.setAttribute("data-theme", validTheme);
    }
    this.setState({ theme: validTheme });
  }

  toggleTheme() {
    const current = this.state.theme || localStorage.getItem("moka_theme") || "dark";
    const nextTheme = current === "dark" ? "light" : "dark";
    this.setTheme(nextTheme);
  }

  setActiveTab(tabId) {
    this.setState({ activeTab: tabId });
  }

  setSearchQuery(query) {
    this.setState({ searchQuery: (query || "").trim().toLowerCase() });
  }

  setCategoryFilter(category) {
    this.setState({ categoryFilter: category || "all" });
  }

  setConsolidateDuplicates(consolidate) {
    this.setState({ consolidateDuplicates: !!consolidate });
  }

  setActiveBranchIndex(index) {
    this.setState({ activeBranchIndex: Number(index) });
  }
}

const store = new AppStore();

if (typeof window !== "undefined") {
  window.AppStore = AppStore;
  window.store = store;
  // Legacy bridge
  window.state = store.state;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { AppStore, store };
}
