/**
 * Móka Billing ERP - Header & Navigation Component
 */

class HeaderComponent {
  static init(store, appController) {
    this.store = store;
    this.appController = appController;

    // Initial theme button state
    this.updateThemeButton();

    // Tab Navigation Buttons
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        this.appController.switchTab(tab);
      });
    });

    // Subscribe to store updates
    this.store.subscribe((state, changedKeys) => {
      if (changedKeys.includes("theme")) {
        this.updateThemeButton();
      }
      if (changedKeys.includes("activeTab")) {
        this.updateActiveTabUI(state.activeTab);
      }
    });
  }

  static updateThemeButton() {
    const btn = document.getElementById("btn-theme-toggle");
    if (!btn) return;
    const isDark = (this.store.getState().theme === "dark");
    btn.innerHTML = isDark ? "☀️" : "🌙";
    btn.title = isDark ? "تغيير إلى الوضع المضيء" : "تغيير إلى الوضع الليلي";
    btn.setAttribute("aria-label", isDark ? "تغيير إلى الوضع المضيء" : "تغيير إلى الوضع الليلي");
  }

  static updateActiveTabUI(activeTab) {
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === activeTab);
    });

    document.querySelectorAll(".view-panel").forEach(panel => {
      panel.classList.toggle("active", panel.id === `view-${activeTab}`);
    });
  }
}

if (typeof window !== "undefined") {
  window.HeaderComponent = HeaderComponent;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = HeaderComponent;
}
