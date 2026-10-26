/**
 * Móka Billing ERP - Branch Selector Component
 */

class BranchSelectorComponent {
  static init(store, appController) {
    this.store = store;
    this.appController = appController;
    this.container = document.getElementById("branch-pills-container");

    // Initialize custom Add Branch modal
    this.initNewBranchModal();

    this.store.subscribe((state, changedKeys) => {
      if (changedKeys.includes("orders") || changedKeys.includes("activeBranchIndex")) {
        this.render();
      }
    });
  }

  static initNewBranchModal() {
    const form = document.getElementById("form-new-branch");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = document.getElementById("new-branch-name-input");
        const name = input ? input.value.trim() : "";
        if (!name) {
          window.ToastComponent.show("يرجى إدخال اسم الفرع أو الطلبية", "error");
          return;
        }

        const submitBtn = document.getElementById("btn-submit-new-branch");
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "جاري الإنشاء...";
        }

        try {
          await this.appController.createNewBranch(name);
          form.reset();
          window.ModalComponent.close("modal-new-branch");
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "➕ إنشاء الفرع";
          }
        }
      });
    }

    // Branch suggestion tags click
    document.querySelectorAll(".branch-suggestion-tag").forEach(tag => {
      tag.addEventListener("click", () => {
        const val = tag.getAttribute("data-name");
        const input = document.getElementById("new-branch-name-input");
        if (input && val) {
          input.value = val;
          input.focus();
        }
      });
    });
  }

  static render() {
    if (!this.container) {
      this.container = document.getElementById("branch-pills-container");
      if (!this.container) return;
    }

    const state = this.store.getState();
    const activeIdx = state.activeBranchIndex;

    let html = `
      <button class="branch-pill ${activeIdx === -1 ? 'active' : ''}" data-branch-index="-1">
        <span>🌐 مجمع كافة الفروع</span>
        <span class="branch-pill-count">${state.orders.length} طلبية</span>
      </button>
    `;

    state.orders.forEach((ord, idx) => {
      const calc = ord.calculation || { totalUnits: 0, grandTotal: 0 };
      const isActive = activeIdx === idx;
      const formattedTotal = window.Formatters
        ? window.Formatters.formatCurrency(calc.grandTotal)
        : `${calc.grandTotal} ج.م`;

      html += `
        <button class="branch-pill ${isActive ? 'active' : ''}" data-branch-index="${idx}">
          <span>📍 ${ord.name}</span>
          <span class="branch-pill-count">${calc.totalUnits} قطعة (${formattedTotal})</span>
        </button>
      `;
    });

    html += `
      <button class="btn btn-secondary btn-new-branch" onclick="openNewBranchModal()" style="padding: 0.45rem 0.9rem; font-size: 0.82rem;">
        ➕ إضافة فرع / طلبية
      </button>
    `;

    this.container.innerHTML = html;

    // Attach click events
    this.container.querySelectorAll(".branch-pill").forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-branch-index"), 10);
        this.appController.selectBranch(idx);
      });
    });

    // Render Delete Branch action button if a specific branch is selected
    const actionsContainer = document.getElementById("branch-actions-container");
    if (actionsContainer) {
      if (activeIdx >= 0 && state.orders[activeIdx]) {
        const activeOrder = state.orders[activeIdx];
        const itemCount = activeOrder.items ? activeOrder.items.length : 0;
        actionsContainer.innerHTML = `
          <button class="btn-delete-branch" id="btn-delete-active-branch" title="حذف هذا الفرع وكافة أصنافه نهائياً">
            <span>🗑️</span>
            <span>حذف فرع "${activeOrder.name}" (${itemCount} صنف)</span>
          </button>
        `;
        const delBtn = actionsContainer.querySelector("#btn-delete-active-branch");
        if (delBtn) {
          delBtn.addEventListener("click", () => this.confirmDeleteBranch(activeOrder));
        }
      } else {
        actionsContainer.innerHTML = "";
      }
    }
  }

  static async confirmDeleteBranch(order) {
    if (!order) return;
    const itemCount = order.items ? order.items.length : 0;
    const confirmed = await window.ModalComponent.confirm({
      title: "تأكيد حذف الفرع بالكامل",
      message: `هل أنت متأكد من حذف فرع "<strong>${order.name}</strong>"؟<br><br><span style="color: var(--accent-red); font-weight: 700;">⚠️ تحذير هـام جداً:</span> سيتم حذف هذا الفرع وكافة الأصناف والفواتير المسجلة بداخله (${itemCount} صنف) نهائياً من قاعدة البيانات ولا يمكن استرجاعها!`,
      confirmText: "نعم، احذف الفرع وأصنافه نهائياً",
      cancelText: "إلغاء التراجع",
      isDanger: true,
      icon: "🗑️"
    });

    if (confirmed) {
      await this.appController.deleteBranch(order.id);
    }
  }

  static openNewBranchModal() {
    const input = document.getElementById("new-branch-name-input");
    if (input) input.value = "";
    window.ModalComponent.open("modal-new-branch");
  }
}

if (typeof window !== "undefined") {
  window.BranchSelectorComponent = BranchSelectorComponent;
  window.openNewBranchModal = () => BranchSelectorComponent.openNewBranchModal();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = BranchSelectorComponent;
}
