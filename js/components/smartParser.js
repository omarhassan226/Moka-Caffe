/**
 * Móka Billing ERP - Smart Parser Component
 */

class SmartParserComponent {
  static init(store, appController) {
    this.store = store;
    this.appController = appController;

    // Parse button
    const btnParse = document.getElementById("btn-parse-text");
    if (btnParse) {
      btnParse.addEventListener("click", () => this.handleParseInput());
    }

    // Add parsed order button
    const btnAddParsed = document.getElementById("btn-add-parsed-order");
    if (btnAddParsed) {
      btnAddParsed.addEventListener("click", () => this.handleAddParsedToOrder());
    }

    // Sample text quick buttons
    document.querySelectorAll(".btn-sample-text").forEach(btn => {
      btn.addEventListener("click", () => {
        const sample = btn.getAttribute("data-sample");
        const textarea = document.getElementById("parser-textarea");
        if (!textarea) return;

        if (sample === "west") {
          textarea.value = `West\nبنانا بودينج 12\nملفيه سكر 3\nمولتن كيك 8\nتونه باستا 4\nبيجل سلمون 5`;
        } else if (sample === "tagamoa") {
          textarea.value = `حاجه التجمع\n2 شوكلت كوكيز\n6 كيت كات كوكيز\n8 انجلش كيك شوكلت\n3 سموكد سالمون`;
        } else if (sample === "custom") {
          textarea.value = `طلبية جديدة خاصة\nكوكيز لافا 5\nكرواسون لوز 4\nشيف سلاد 3\n10 كوكيز كيت كات\nساندوتش حلومي 6`;
        }
        this.handleParseInput();
      });
    });
  }

  static async handleParseInput() {
    const textarea = document.getElementById("parser-textarea");
    const text = textarea ? textarea.value.trim() : "";
    const previewBox = document.getElementById("parser-results-preview");
    const countBadge = document.getElementById("parsed-items-count");

    if (!text) {
      if (previewBox) {
        previewBox.innerHTML = `
          <p style="color: var(--text-muted); text-align: center;">
            قم بكتابة أو لصق الأصناف والكميات هنا للتحليل التلقائي...
          </p>
        `;
      }
      if (countBadge) countBadge.textContent = "0";
      return;
    }

    try {
      const result = await window.api.parseOrderText(text);
      this.store.setState({ parsedSections: result.sections });
      this.renderParsedSections(result.sections, previewBox, countBadge);
    } catch (error) {
      window.ToastComponent.show(error.message, "error");
    }
  }

  static renderParsedSections(sections, previewBox, countBadge) {
    if (!previewBox) return;

    let totalItemsCount = 0;
    let html = "";
    const format = window.Formatters ? window.Formatters.formatCurrency : (v) => `${v} ج.م`;

    sections.forEach(section => {
      totalItemsCount += section.items.length;
      html += `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 0.75rem;">
            <h4 style="color: var(--accent-gold); font-size: 1.05rem;">📍 ${section.name}</h4>
            <span class="badge badge-gold">${section.calculation.totalUnits} قطعة | الإجمالي: ${format(section.calculation.grandTotal)}</span>
          </div>
          <table class="data-table" style="font-size: 0.84rem;">
            <thead>
              <tr>
                <th>الصنف المدخل</th>
                <th>المطابقة في الشيت</th>
                <th>الكمية</th>
                <th>سعر القطعة</th>
                <th>الإجمالي الشامل</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
      `;

      section.items.forEach((item, index) => {
        const match = item.matchedItem;
        const calculatedItem = section.calculation.items[index] || {};
        const statusBadge = match
          ? `<span class="badge" style="background: var(--color-emerald-bg); color: var(--color-emerald);">✓ مطابق</span>`
          : `<span class="badge badge-missing">⚠️ غير مسجل</span>`;

        html += `
          <tr>
            <td style="font-weight: 600;">${item.parsedName}</td>
            <td style="color: var(--accent-gold);">${match ? match.nameAr : "---"}</td>
            <td style="font-weight: 700;">${item.quantity}</td>
            <td>${format(calculatedItem.unitPrice || 0)}</td>
            <td style="font-weight: 700;">${format(calculatedItem.subtotalTaxInclusive || 0)}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      });

      html += "</tbody></table></div>";
    });

    previewBox.innerHTML = html;
    if (countBadge) countBadge.textContent = totalItemsCount.toString();
  }

  static async handleAddParsedToOrder() {
    const textarea = document.getElementById("parser-textarea");
    const text = textarea ? textarea.value.trim() : "";
    if (!text) {
      window.ToastComponent.show("يرجى إدخال نص الطلبية أولاً", "error");
      return;
    }

    try {
      const result = await window.api.parseOrderText(text);
      const state = this.store.getState();
      let lastOrderId = null;

      for (const section of result.sections) {
        const existingOrder = state.orders.find(
          order => (order.name || order.branchName || "").toLowerCase() === section.name.toLowerCase()
        );

        const addedItems = section.items.map(item => ({
          code: item.matchedItem ? item.matchedItem.code : "NEW",
          nameAr: item.matchedItem ? item.matchedItem.nameAr : item.parsedName,
          nameEn: item.matchedItem ? item.matchedItem.nameEn : "",
          category: item.matchedItem ? item.matchedItem.category : "أصناف جديدة",
          unit: item.matchedItem ? item.matchedItem.unit : "قطعة",
          quantity: item.quantity,
          unitPrice: item.matchedItem ? item.matchedItem.unitPrice : 0,
          taxType: item.matchedItem ? item.matchedItem.taxType : "SCHD_5",
          taxRate: item.matchedItem ? item.matchedItem.taxRate : 0.05
        }));

        let savedOrder;
        if (existingOrder) {
          savedOrder = await window.api.updateOrder(existingOrder.id, {
            name: section.name,
            items: existingOrder.items.concat(addedItems)
          });
        } else {
          savedOrder = await window.api.createOrder({
            name: section.name,
            items: addedItems
          });
        }

        lastOrderId = savedOrder.id;
      }

      await this.appController.loadData(false);
      if (lastOrderId) {
        const newOrders = this.store.getState().orders;
        const targetIdx = newOrders.findIndex(o => o.id === lastOrderId);
        if (targetIdx >= 0) {
          this.store.setActiveBranchIndex(targetIdx);
          await this.appController.refreshCalculation();
        }
      }

      window.ToastComponent.show("تمت إضافة الأصناف للطلبيات بنجاح!");
      this.appController.switchTab("details");
    } catch (error) {
      window.ToastComponent.show(error.message, "error");
    }
  }
}

if (typeof window !== "undefined") {
  window.SmartParserComponent = SmartParserComponent;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = SmartParserComponent;
}
