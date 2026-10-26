/**
 * Móka Billing ERP - Custom Modal Dialog Component
 * Replaces native alert(), prompt(), and confirm() with modern, responsive, animated modals.
 */

class ModalComponent {
  static confirmResolver = null;

  static init() {
    // Global ESC key listener to close active modals
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeAll();
        if (this.confirmResolver) {
          this.confirmResolver(false);
          this.confirmResolver = null;
        }
      }
    });

    // Close when clicking modal backdrop
    document.querySelectorAll(".modal-overlay").forEach(overlay => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          overlay.classList.remove("active");
          if (overlay.id === "modal-confirm" && this.confirmResolver) {
            this.confirmResolver(false);
            this.confirmResolver = null;
          }
        }
      });
    });

    // Confirm Modal Button Listeners
    const cancelBtn = document.getElementById("modal-confirm-cancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        this.close("modal-confirm");
        if (this.confirmResolver) {
          this.confirmResolver(false);
          this.confirmResolver = null;
        }
      });
    }

    const submitBtn = document.getElementById("modal-confirm-submit");
    if (submitBtn) {
      submitBtn.addEventListener("click", () => {
        this.close("modal-confirm");
        if (this.confirmResolver) {
          this.confirmResolver(true);
          this.confirmResolver = null;
        }
      });
    }
  }

  static open(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
      el.classList.add("active");
      // Focus first input if any
      const input = el.querySelector("input:not([type=hidden]), select, textarea");
      if (input) {
        setTimeout(() => input.focus(), 100);
      }
    }
  }

  static close(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
      el.classList.remove("active");
    }
  }

  static closeAll() {
    document.querySelectorAll(".modal-overlay.active").forEach(el => {
      el.classList.remove("active");
    });
  }

  /**
   * Promise-based custom confirmation modal (replaces native confirm())
   */
  static confirm({
    title = "تأكيد الإجراء",
    message = "هل أنت متأكد من المتابعة؟",
    confirmText = "تأكيد",
    cancelText = "إلغاء",
    isDanger = false,
    icon = "⚠️"
  } = {}) {
    return new Promise((resolve) => {
      this.confirmResolver = resolve;

      const titleEl = document.getElementById("modal-confirm-title");
      const msgEl = document.getElementById("modal-confirm-message");
      const iconEl = document.getElementById("modal-confirm-icon");
      const submitBtn = document.getElementById("modal-confirm-submit");
      const cancelBtn = document.getElementById("modal-confirm-cancel");

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.innerHTML = message;
      if (iconEl) iconEl.textContent = icon;
      if (cancelBtn) cancelBtn.textContent = cancelText;

      if (submitBtn) {
        submitBtn.textContent = confirmText;
        if (isDanger) {
          submitBtn.className = "btn btn-danger";
        } else {
          submitBtn.className = "btn btn-primary";
        }
      }

      this.open("modal-confirm");
    });
  }
}

if (typeof window !== "undefined") {
  window.ModalComponent = ModalComponent;
  window.openModal = (id) => ModalComponent.open(id);
  window.closeModal = (id) => ModalComponent.close(id);
  window.customConfirm = (opts) => ModalComponent.confirm(opts);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = ModalComponent;
}
