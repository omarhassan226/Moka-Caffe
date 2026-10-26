/**
 * Móka Billing ERP - Toast Notification Component
 */

class ToastComponent {
  static container = null;

  static init() {
    this.container = document.getElementById("toast-container");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "toast-container";
      this.container.className = "toast-container";
      document.body.appendChild(this.container);
    }
  }

  static show(message, type = "success", duration = 3500) {
    if (!this.container) this.init();

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    const icon = type === "error" ? "❌ " : type === "info" ? "ℹ️ " : "✅ ";
    toast.innerHTML = icon + message;

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-100%)";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

if (typeof window !== "undefined") {
  window.ToastComponent = ToastComponent;
  window.showToast = (msg, type, dur) => ToastComponent.show(msg, type, dur);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = ToastComponent;
}
