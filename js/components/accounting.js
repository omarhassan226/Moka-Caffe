/**
 * Móka Billing ERP - Monthly Accounting, Invoices, Waste & Sales Component
 * Supports:
 * - Image uploads with client-side thumbnail & full-screen preview
 * - Monthly aggregation & P&L calculation: (Sales - Invoices - Waste)
 * - Waste ratio percentage & breakdown
 * - Invoices, Waste, and Sales management (CRUD)
 * - Dual-mode persistence: MongoDB API with automatic offline LocalStorage fallback
 */

class AccountingComponent {
  static init(store, appController) {
    this.store = store;
    this.appController = appController;
    this.api = window.api;

    // Active month (defaults to current month: YYYY-MM)
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    this.currentMonth = `${yyyy}-${mm}`;

    // Active sub-tab inside accounting view: 'invoices' | 'waste' | 'sales' | 'analytics'
    this.activeSubTab = "invoices";

    // In-memory data cache
    this.invoices = [];
    this.wasteList = [];
    this.salesList = [];
    this.summary = null;

    // Temporary storage for image being uploaded in modal
    this.pendingImageData = "";

    // Bind event listeners
    this.initEventListeners();
    this.initModals();

    // Subscribe to store tab changes
    this.store.subscribe((state, changedKeys) => {
      if (changedKeys.includes("activeTab") && state.activeTab === "accounting") {
        this.loadData();
      }
    });
  }

  /**
   * Set up main page event listeners
   */
  static initEventListeners() {
    // Month selector change
    const monthPicker = document.getElementById("accounting-month-picker");
    const btnToggleAll = document.getElementById("btn-toggle-all-months");

    if (monthPicker) {
      monthPicker.value = this.currentMonth;
      monthPicker.addEventListener("change", (e) => {
        if (e.target.value) {
          this.currentMonth = e.target.value;
          if (btnToggleAll) {
            btnToggleAll.innerHTML = "<span>🌐 عرض كافة الفواتير</span>";
            btnToggleAll.classList.remove("active");
          }
          this.loadData();
        }
      });
    }

    if (btnToggleAll) {
      btnToggleAll.addEventListener("click", () => {
        if (this.currentMonth === "all") {
          const now = new Date();
          const yyyy = now.getFullYear();
          const mm = String(now.getMonth() + 1).padStart(2, "0");
          this.currentMonth = `${yyyy}-${mm}`;
          if (monthPicker) monthPicker.value = this.currentMonth;
          btnToggleAll.innerHTML = "<span>🌐 عرض كافة الفواتير</span>";
          btnToggleAll.classList.remove("active");
        } else {
          this.currentMonth = "all";
          btnToggleAll.innerHTML = "<span>📅 التبديل لشهر محدد</span>";
          btnToggleAll.classList.add("active");
        }
        this.loadData();
      });
    }

    // Refresh button
    const btnRefresh = document.getElementById("btn-accounting-refresh");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", () => this.loadData(true));
    }

    // Sub-tab navigation buttons
    document.querySelectorAll(".accounting-subtab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const subtab = btn.getAttribute("data-subtab");
        if (subtab) {
          this.switchSubTab(subtab);
        }
      });
    });

    // Quick Action buttons to open modals
    const btnOpenAddInvoice = document.getElementById("btn-open-add-invoice");
    if (btnOpenAddInvoice) {
      btnOpenAddInvoice.addEventListener("click", () => this.openAddInvoiceModal());
    }

    const btnOpenAddWaste = document.getElementById("btn-open-add-waste");
    if (btnOpenAddWaste) {
      btnOpenAddWaste.addEventListener("click", () => this.openAddWasteModal());
    }

    const btnOpenAddSales = document.getElementById("btn-open-add-sales");
    if (btnOpenAddSales) {
      btnOpenAddSales.addEventListener("click", () => this.openAddSalesModal());
    }

    const btnPrintReport = document.getElementById("btn-print-accounting-report");
    if (btnPrintReport) {
      btnPrintReport.addEventListener("click", () => window.print());
    }
  }

  /**
   * Switch between Invoices, Waste, Sales, and Analytics tables
   */
  static switchSubTab(subTabId) {
    this.activeSubTab = subTabId;
    document.querySelectorAll(".accounting-subtab-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-subtab") === subTabId);
    });

    document.querySelectorAll(".accounting-subpanel").forEach(panel => {
      panel.classList.toggle("active", panel.id === `accounting-subpanel-${subTabId}`);
    });
  }

  /**
   * Initialize Modal forms, drag-and-drop, and file pickers
   */
  static initModals() {
    // 1. Invoice Upload Form & File Drop
    const formInvoice = document.getElementById("form-add-invoice");
    const fileInput = document.getElementById("invoice-image-file");
    const dropZone = document.getElementById("invoice-drop-zone");
    const previewContainer = document.getElementById("invoice-preview-container");
    const previewImage = document.getElementById("invoice-preview-image");
    const btnRemoveImage = document.getElementById("btn-remove-invoice-image");

    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) this.handleImageFile(file);
      });
    }

    if (dropZone) {
      dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
      });
      dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
      });
      dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) this.handleImageFile(file);
      });
      dropZone.addEventListener("click", () => {
        if (fileInput) fileInput.click();
      });
    }

    // Support pasting image from clipboard anywhere when invoice modal is open
    window.addEventListener("paste", (e) => {
      const modal = document.getElementById("modal-add-invoice");
      if (modal && modal.classList.contains("active")) {
        const items = e.clipboardData && e.clipboardData.items;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
              const file = items[i].getAsFile();
              if (file) this.handleImageFile(file);
              break;
            }
          }
        }
      }
    });

    if (btnRemoveImage) {
      btnRemoveImage.addEventListener("click", (e) => {
        e.stopPropagation();
        this.clearImagePreview();
      });
    }

    if (formInvoice) {
      formInvoice.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.submitAddInvoice();
      });
    }

    // 2. Waste Form
    const formWaste = document.getElementById("form-add-waste");
    if (formWaste) {
      formWaste.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.submitAddWaste();
      });
    }

    // 3. Sales Form & Auto calculation
    const formSales = document.getElementById("form-add-sales");
    const cashInput = document.getElementById("sales-cash-input");
    const visaInput = document.getElementById("sales-visa-input");
    const onlineInput = document.getElementById("sales-online-input");
    const totalInput = document.getElementById("sales-total-input");

    const updateSalesTotal = () => {
      const c = parseFloat(cashInput?.value) || 0;
      const v = parseFloat(visaInput?.value) || 0;
      const o = parseFloat(onlineInput?.value) || 0;
      if (totalInput) {
        totalInput.value = (c + v + o).toFixed(2);
      }
    };

    [cashInput, visaInput, onlineInput].forEach(inp => {
      if (inp) inp.addEventListener("input", updateSalesTotal);
    });

    if (formSales) {
      formSales.addEventListener("submit", async (e) => {
        e.preventDefault();
        await this.submitAddSales();
      });
    }

    // 4. AI Scan Invoice Button
    const btnAiScan = document.getElementById("btn-ai-scan-invoice");
    if (btnAiScan) {
      btnAiScan.addEventListener("click", () => this.triggerAiInvoiceScan());
    }
  }

  /**
   * Direct Gemini Client-Side Scan Fallback
   */
  static async scanWithGeminiDirect(imageData, apiKey, signal) {
    let mimeType = "image/jpeg";
    let base64Data = imageData;
    const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }

    const systemPrompt = `أنت خبير محاسبي متخصص في قراءة وتحليل فواتير وإيصالات الكافيهات والمطاعم في مصر.
حلل صورة هذه الفاتورة بدقة، واستخرج البيانات التالية بصيغة JSON حصراً بدون أي نصوص إضافية:
{
  "supplier": "اسم المورد أو المحل أو الشركة",
  "amount": 0.00,
  "invoiceDate": "YYYY-MM-DD",
  "invoiceNumber": "",
  "category": "خامات وبن",
  "items": [{ "name": "اسم الصنف", "quantity": 1, "price": 0, "total": 0 }],
  "notes": "ملخص الفاتورة"
}
اختر category من: ["خامات وبن", "ألبان وسيرب", "حلويات ومخبوزات", "تعبئة وتغليف", "نظافة ومستهلكات", "صيانة وتشغيل", "أخرى"]
تأكد من أن amount هو الإجمالي الصافي النهائي كقيمة رقمية Number فقط.`;

    const requestPayload = {
      contents: [{
        parts: [
          { text: systemPrompt },
          { inlineData: { mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    const models = [
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
      "gemini-3.7-flash",
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest"
    ];
    let lastErr = null;

    for (const model of models) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify(requestPayload)
        });

        if (!res.ok) {
          const t = await res.text();
          throw new Error(`[${res.status}] ${t}`);
        }

        const json = await res.json();
        const candidate = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!candidate) throw new Error("لا توجد استجابة من نموذج الذكاء الاصطناعي");

        let cleanJson = candidate.trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");
        const parsed = JSON.parse(cleanJson);
        return { success: true, data: parsed };
      } catch (err) {
        if (err.name === "AbortError") throw err;
        lastErr = err;
        console.warn(`Direct model ${model} attempt failed:`, err.message);
      }
    }

    throw lastErr || new Error("تعذر فحص الفاتورة عبر نماذج الذكاء الاصطناعي");
  }

  /**
   * Cancel ongoing AI scan
   */
  static cancelAiScan() {
    if (this.activeScanAbortController) {
      try {
        this.activeScanAbortController.abort();
      } catch (_) {}
      this.activeScanAbortController = null;
    }

    const scanningOverlay = document.getElementById("ai-scanning-overlay");
    const btn = document.getElementById("btn-ai-scan-invoice");
    const btnText = document.getElementById("btn-ai-scan-text");
    const btnCancel = document.getElementById("btn-cancel-ai-scan");
    const statusMsg = document.getElementById("ai-scan-status-message");

    if (scanningOverlay) scanningOverlay.style.display = "none";
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = "✨ استخراج بيانات الفاتورة بالذكاء الاصطناعي (AI OCR)";
    if (btnCancel) btnCancel.style.display = "none";
    if (statusMsg) {
      statusMsg.style.display = "block";
      statusMsg.style.color = "var(--text-secondary)";
      statusMsg.textContent = "🛑 تم إيقاف الفحص. يمكنك كتابة وحفظ بيانات الفاتورة يدوياً.";
    }
  }

  /**
   * Scan invoice photo using AI Vision
   */
  static async triggerAiInvoiceScan() {
    if (!this.pendingImageData) {
      window.ToastComponent.show("يرجى اختيار أو رفع صورة الفاتورة أولاً", "error");
      return;
    }

    // Cancel any previous scan
    if (this.activeScanAbortController) {
      this.cancelAiScan();
    }
    this.activeScanAbortController = new AbortController();
    const signal = this.activeScanAbortController.signal;

    const btn = document.getElementById("btn-ai-scan-invoice");
    const btnText = document.getElementById("btn-ai-scan-text");
    const btnCancel = document.getElementById("btn-cancel-ai-scan");
    const scanningOverlay = document.getElementById("ai-scanning-overlay");
    const statusMsg = document.getElementById("ai-scan-status-message");

    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = "⏳ جاري قراءة الفاتورة بالذكاء الاصطناعي...";
    if (btnCancel) btnCancel.style.display = "inline-flex";
    if (scanningOverlay) scanningOverlay.style.display = "flex";
    if (statusMsg) {
      statusMsg.style.display = "block";
      statusMsg.style.color = "var(--accent-gold)";
      statusMsg.textContent = "🔍 جاري فحص النصوص، التواريخ، الأصناف، والمبلغ الإجمالي...";
    }

    try {
      const apiKey = (typeof localStorage !== "undefined" ? localStorage.getItem("GEMINI_API_KEY") : "") || "";
      let res = null;

      // 1. Try server backend endpoint first
      try {
        res = await this.api.scanInvoice(this.pendingImageData, apiKey, signal);
      } catch (serverErr) {
        if (serverErr.name === "AbortError") throw serverErr;
        console.warn("Backend OCR request failed, trying direct Gemini API fallback:", serverErr.message);
        if (apiKey) {
          res = await this.scanWithGeminiDirect(this.pendingImageData, apiKey, signal);
        } else {
          throw serverErr;
        }
      }

      if (res && res.requiresKey) {
        if (statusMsg) {
          statusMsg.innerHTML = `⚠️ ${res.message} <a href="javascript:void(0)" onclick="openApiSettingsModal()" style="color: var(--accent-gold); text-decoration: underline; font-weight: bold; margin-right: 4px;">اضغط هنا لضبط المفتاح</a>`;
          statusMsg.style.color = "var(--color-rose)";
        }
        window.ToastComponent.show("مفتاح Gemini API مطلوب لتشغيل الفحص الذكي", "warning");
        return;
      }

      if (res && res.success && res.data) {
        const d = res.data;
        const supplierInput = document.getElementById("invoice-supplier-input");
        const amountInput = document.getElementById("invoice-amount-input");
        const categoryInput = document.getElementById("invoice-category-input");
        const numberInput = document.getElementById("invoice-number-input");
        const dateInput = document.getElementById("invoice-date-input");
        const notesInput = document.getElementById("invoice-notes-input");

        if (supplierInput && d.supplier) supplierInput.value = d.supplier;
        if (amountInput && d.amount !== undefined && d.amount !== null) amountInput.value = d.amount;
        if (numberInput && d.invoiceNumber) numberInput.value = d.invoiceNumber;
        if (dateInput && d.invoiceDate) dateInput.value = d.invoiceDate;
        if (categoryInput && d.category) {
          categoryInput.value = d.category;
        }

        let summaryNotes = d.notes || "";
        if (d.items && d.items.length > 0) {
          const itemsStr = d.items.map(it => `${it.name} (${it.quantity})`).join("، ");
          summaryNotes = summaryNotes ? `${summaryNotes} | الأصناف: ${itemsStr}` : `الأصناف: ${itemsStr}`;
        }
        if (notesInput && summaryNotes) notesInput.value = summaryNotes;

        if (statusMsg) {
          statusMsg.style.color = "var(--color-emerald)";
          statusMsg.innerHTML = `✅ تم استخراج البيانات بنجاح: مورد "<strong>${d.supplier}</strong>" بمبلغ <strong>${d.amount} ج.م</strong>.`;
        }

        window.ToastComponent.show(`✨ تم استخراج بيانات الفاتورة بنجاح: ${d.amount} ج.م`, "success");
      }
    } catch (err) {
      if (err.name === "AbortError") {
        if (statusMsg) {
          statusMsg.style.color = "var(--text-secondary)";
          statusMsg.textContent = "🛑 تم إيقاف الفحص. يمكنك إدخال بيانات الفاتورة يدوياً.";
        }
        return;
      }
      if (statusMsg) {
        statusMsg.style.color = "var(--color-rose)";
        statusMsg.textContent = `❌ فشل فحص الفاتورة: ${err.message}`;
      }
      window.ToastComponent.show("تعذر قراءة الفاتورة: " + err.message, "error");
    } finally {
      this.activeScanAbortController = null;
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = "✨ استخراج بيانات الفاتورة بالذكاء الاصطناعي (AI OCR)";
      if (btnCancel) btnCancel.style.display = "none";
      if (scanningOverlay) scanningOverlay.style.display = "none";
    }
  }

  /**
   * Handle image file reading and client-side compression
   */
  static handleImageFile(file) {
    if (!file.type.startsWith("image/")) {
      window.ToastComponent.show("يرجى اختيار ملف صورة صالح (JPG, PNG, WebP)", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Compress image if larger than 1200px to maintain fast performance and low storage
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;
        const maxDim = 1200;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        this.pendingImageData = dataUrl;

        const previewContainer = document.getElementById("invoice-preview-container");
        const previewImage = document.getElementById("invoice-preview-image");
        const dropZone = document.getElementById("invoice-drop-zone");

        if (previewImage) previewImage.src = dataUrl;
        if (previewContainer) previewContainer.style.display = "block";
        if (dropZone) dropZone.style.display = "none";

        // Show AI scan action bar
        const aiBar = document.getElementById("ai-scan-actions-bar");
        if (aiBar) aiBar.style.display = "block";
        const statusMsg = document.getElementById("ai-scan-status-message");
        if (statusMsg) statusMsg.style.display = "none";
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  static clearImagePreview() {
    if (this.activeScanAbortController) {
      this.cancelAiScan();
    }
    this.pendingImageData = "";
    const previewContainer = document.getElementById("invoice-preview-container");
    const previewImage = document.getElementById("invoice-preview-image");
    const dropZone = document.getElementById("invoice-drop-zone");
    const fileInput = document.getElementById("invoice-image-file");

    if (previewImage) previewImage.src = "";
    if (previewContainer) previewContainer.style.display = "none";
    if (dropZone) dropZone.style.display = "flex";
    if (fileInput) fileInput.value = "";

    const aiBar = document.getElementById("ai-scan-actions-bar");
    if (aiBar) aiBar.style.display = "none";
    const statusMsg = document.getElementById("ai-scan-status-message");
    if (statusMsg) statusMsg.style.display = "none";
    const scanningOverlay = document.getElementById("ai-scanning-overlay");
    if (scanningOverlay) scanningOverlay.style.display = "none";
  }

  // ================= Open Modal Helpers =================
  static openAddInvoiceModal() {
    this.clearImagePreview();
    const form = document.getElementById("form-add-invoice");
    if (form) form.reset();

    const dateInput = document.getElementById("invoice-date-input");
    if (dateInput) {
      dateInput.value = new Date().toISOString().split("T")[0];
    }
    window.ModalComponent.open("modal-add-invoice");
  }

  static openAddWasteModal() {
    const form = document.getElementById("form-add-waste");
    if (form) form.reset();

    const dateInput = document.getElementById("waste-date-input");
    if (dateInput) {
      dateInput.value = new Date().toISOString().split("T")[0];
    }
    window.ModalComponent.open("modal-add-waste");
  }

  static openAddSalesModal() {
    const form = document.getElementById("form-add-sales");
    if (form) form.reset();

    const dateInput = document.getElementById("sales-date-input");
    if (dateInput) {
      dateInput.value = new Date().toISOString().split("T")[0];
    }
    window.ModalComponent.open("modal-add-sales");
  }

  static viewInvoiceFullImage(imageUrl, title = "صورة الفاتورة") {
    const modalImage = document.getElementById("full-invoice-modal-image");
    const modalTitle = document.getElementById("full-invoice-modal-title");
    const downloadBtn = document.getElementById("btn-download-full-invoice");

    if (modalImage) modalImage.src = imageUrl;
    if (modalTitle) modalTitle.textContent = title;
    if (downloadBtn) {
      downloadBtn.href = imageUrl;
      downloadBtn.download = `فاتورة-${title}.jpg`;
    }

    window.ModalComponent.open("modal-full-invoice-image");
  }

  // ================= Data Loading & Synchronization =================
  static async loadData(notifySuccess = false) {
    const month = this.currentMonth;

    try {
      // 1. Try fetching from Backend API
      const [summary, invoices, waste, sales] = await Promise.all([
        this.api.getAccountingSummary(month),
        this.api.getInvoices({ month }),
        this.api.getWasteRecords({ month }),
        this.api.getSalesRecords({ month })
      ]);

      this.summary = summary;
      this.invoices = invoices || [];
      this.wasteList = waste || [];
      this.salesList = sales || [];

      // Update LocalStorage cache for seamless offline backup
      this.saveLocalBackup(month, { summary, invoices, waste, sales });

      this.render();
      if (notifySuccess) {
        window.ToastComponent.show(`تم تحديث حسابات شهر ${month} بنجاح.`);
      }
    } catch (err) {
      console.warn("API request failed, loading local cached accounting data:", err.message);
      // Fallback to local storage
      const cached = this.loadLocalBackup(month);
      this.summary = cached.summary || this.calculateLocalSummary(cached.invoices, cached.waste, cached.sales);
      this.invoices = cached.invoices || [];
      this.wasteList = cached.waste || [];
      this.salesList = cached.sales || [];

      this.render();
      if (notifySuccess) {
        window.ToastComponent.show(`تم التحميل من الذاكرة المحلية (وضع عدم الاتصال).`, "info");
      }
    }
  }

  // Local storage offline support
  static saveLocalBackup(month, data) {
    try {
      localStorage.setItem(`moka_acc_${month}`, JSON.stringify(data));
    } catch (e) {
      console.error("Local storage quota exceeded:", e);
    }
  }

  static loadLocalBackup(month) {
    try {
      const data = localStorage.getItem(`moka_acc_${month}`);
      return data ? JSON.parse(data) : { invoices: [], waste: [], sales: [] };
    } catch (e) {
      return { invoices: [], waste: [], sales: [] };
    }
  }

  static calculateLocalSummary(invoices = [], wasteList = [], salesList = []) {
    let totalInvoices = 0;
    const catMap = {};
    for (const inv of invoices) {
      const amt = Number(inv.amount) || 0;
      totalInvoices += amt;
      catMap[inv.category || "أخرى"] = (catMap[inv.category || "أخرى"] || 0) + amt;
    }

    let totalWaste = 0;
    const wasteReasonMap = {};
    for (const wst of wasteList) {
      const loss = Number(wst.lossValue) || 0;
      totalWaste += loss;
      wasteReasonMap[wst.reason || "تلف"] = (wasteReasonMap[wst.reason || "تلف"] || 0) + loss;
    }

    let totalSales = 0;
    let cash = 0, visa = 0, online = 0, ordersCount = 0;
    for (const s of salesList) {
      totalSales += Number(s.totalAmount) || 0;
      cash += Number(s.cashAmount) || 0;
      visa += Number(s.visaAmount) || 0;
      online += Number(s.onlineAmount) || 0;
      ordersCount += Number(s.ordersCount) || 0;
    }

    const netProfit = totalSales - (totalInvoices + totalWaste);
    const wasteRatio = totalInvoices > 0 ? (totalWaste / totalInvoices) * 100 : 0;

    return {
      month: this.currentMonth,
      metrics: {
        totalInvoices,
        invoicesCount: invoices.length,
        totalWaste,
        wasteCount: wasteList.length,
        totalSales,
        salesRecordsCount: salesList.length,
        netProfit,
        wasteRatio,
        totalOrdersCount: ordersCount
      },
      salesBreakdown: { cash, visa, online },
      invoicesByCategory: Object.entries(catMap).map(([category, amount]) => ({
        category,
        amount,
        percentage: totalInvoices > 0 ? (amount / totalInvoices) * 100 : 0
      })),
      wasteByReason: Object.entries(wasteReasonMap).map(([reason, amount]) => ({
        reason,
        amount,
        percentage: totalWaste > 0 ? (amount / totalWaste) * 100 : 0
      }))
    };
  }

  // ================= Form Submissions =================
  static async submitAddInvoice() {
    const supplierInput = document.getElementById("invoice-supplier-input");
    const amountInput = document.getElementById("invoice-amount-input");
    const numberInput = document.getElementById("invoice-number-input");
    const categoryInput = document.getElementById("invoice-category-input");
    const dateInput = document.getElementById("invoice-date-input");
    const notesInput = document.getElementById("invoice-notes-input");

    const supplier = supplierInput?.value.trim();
    const amount = parseFloat(amountInput?.value);

    if (!supplier || isNaN(amount) || amount < 0) {
      window.ToastComponent.show("يرجى إدخال اسم المورد ومبلغ الفاتورة بشكل صحيح", "error");
      return;
    }

    const invoiceData = {
      supplier,
      amount,
      invoiceNumber: numberInput?.value.trim() || "",
      category: categoryInput?.value || "خامات وبن",
      invoiceDate: dateInput?.value || new Date().toISOString(),
      imageData: this.pendingImageData || "",
      notes: notesInput?.value.trim() || ""
    };

    const submitBtn = document.getElementById("btn-submit-invoice");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "جاري الحفظ...";
    }

    try {
      try {
        await this.api.createInvoice(invoiceData);
      } catch (apiErr) {
        // Fallback local save
        invoiceData._id = "local-" + Date.now();
        invoiceData.month = this.currentMonth;
        const backup = this.loadLocalBackup(this.currentMonth);
        backup.invoices.push(invoiceData);
        this.saveLocalBackup(this.currentMonth, backup);
      }

      window.ModalComponent.close("modal-add-invoice");
      window.ToastComponent.show(`تمت إضافة فاتورة "${supplier}" بمبلغ ${window.formatCurrency ? window.formatCurrency(amount) : amount} ج.م بنجاح!`);

      // Keep UI month in sync with the saved invoice
      if (invoiceData.invoiceDate) {
        const invDate = new Date(invoiceData.invoiceDate);
        if (!isNaN(invDate.getTime())) {
          const invMonth = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`;
          if (this.currentMonth !== "all" && this.currentMonth !== invMonth) {
            this.currentMonth = invMonth;
            const monthPicker = document.getElementById("accounting-month-picker");
            if (monthPicker) monthPicker.value = invMonth;
          }
        }
      }

      await this.loadData();
    } catch (err) {
      window.ToastComponent.show("حدث خطأ أثناء حفظ الفاتورة: " + err.message, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "💾 حفظ الفاتورة";
      }
    }
  }

  static async submitAddWaste() {
    const itemInput = document.getElementById("waste-item-input");
    const qtyInput = document.getElementById("waste-quantity-input");
    const unitInput = document.getElementById("waste-unit-input");
    const lossInput = document.getElementById("waste-loss-input");
    const reasonInput = document.getElementById("waste-reason-input");
    const dateInput = document.getElementById("waste-date-input");
    const respInput = document.getElementById("waste-responsible-input");
    const notesInput = document.getElementById("waste-notes-input");

    const itemName = itemInput?.value.trim();
    const lossValue = parseFloat(lossInput?.value);

    if (!itemName || isNaN(lossValue) || lossValue < 0) {
      window.ToastComponent.show("يرجى إدخال اسم الصنف وقيمة الهالك التقديرية", "error");
      return;
    }

    const wasteData = {
      itemName,
      quantity: parseFloat(qtyInput?.value) || 1,
      unit: unitInput?.value || "قطعة",
      lossValue,
      reason: reasonInput?.value || "تلف / سوء تخزين",
      wasteDate: dateInput?.value || new Date().toISOString(),
      responsible: respInput?.value.trim() || "الشيفت",
      notes: notesInput?.value.trim() || ""
    };

    const submitBtn = document.getElementById("btn-submit-waste");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "جاري الحفظ...";
    }

    try {
      try {
        await this.api.createWasteRecord(wasteData);
      } catch (apiErr) {
        wasteData._id = "local-" + Date.now();
        wasteData.month = this.currentMonth;
        const backup = this.loadLocalBackup(this.currentMonth);
        backup.waste.push(wasteData);
        this.saveLocalBackup(this.currentMonth, backup);
      }

      window.ModalComponent.close("modal-add-waste");
      window.ToastComponent.show(`تم تسجيل هالك "${itemName}" بقيمة ${window.formatCurrency ? window.formatCurrency(lossValue) : lossValue} ج.م`);
      await this.loadData();
    } catch (err) {
      window.ToastComponent.show("حدث خطأ أثناء حفظ الهالك: " + err.message, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "🗑️ حفظ الهالك";
      }
    }
  }

  static async submitAddSales() {
    const dateInput = document.getElementById("sales-date-input");
    const branchInput = document.getElementById("sales-branch-input");
    const cashInput = document.getElementById("sales-cash-input");
    const visaInput = document.getElementById("sales-visa-input");
    const onlineInput = document.getElementById("sales-online-input");
    const totalInput = document.getElementById("sales-total-input");
    const ordersInput = document.getElementById("sales-orders-input");
    const notesInput = document.getElementById("sales-notes-input");

    const cash = parseFloat(cashInput?.value) || 0;
    const visa = parseFloat(visaInput?.value) || 0;
    const online = parseFloat(onlineInput?.value) || 0;
    const total = parseFloat(totalInput?.value) || (cash + visa + online);

    if (isNaN(total) || total <= 0) {
      window.ToastComponent.show("يرجى إدخال مبلغ مبيعات صحيح", "error");
      return;
    }

    const salesData = {
      recordDate: dateInput?.value || new Date().toISOString(),
      branchName: branchInput?.value.trim() || "الفرع الرئيسي",
      cashAmount: cash,
      visaAmount: visa,
      onlineAmount: online,
      totalAmount: total,
      ordersCount: parseInt(ordersInput?.value) || 0,
      notes: notesInput?.value.trim() || ""
    };

    const submitBtn = document.getElementById("btn-submit-sales");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "جاري الحفظ...";
    }

    try {
      try {
        await this.api.createSalesRecord(salesData);
      } catch (apiErr) {
        salesData._id = "local-" + Date.now();
        salesData.month = this.currentMonth;
        const backup = this.loadLocalBackup(this.currentMonth);
        backup.sales.push(salesData);
        this.saveLocalBackup(this.currentMonth, backup);
      }

      window.ModalComponent.close("modal-add-sales");
      window.ToastComponent.show(`تم تسجيل مبيعات بمبلغ ${window.formatCurrency ? window.formatCurrency(total) : total} ج.م بنجاح!`);
      await this.loadData();
    } catch (err) {
      window.ToastComponent.show("حدث خطأ أثناء حفظ المبيعات: " + err.message, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "💰 حفظ المبيعات";
      }
    }
  }

  // ================= Deletion Handlers =================
  static async deleteInvoice(id, supplierName) {
    const confirmed = await window.ModalComponent.confirm({
      title: "حذف الفاتورة",
      message: `هل أنت متأكد من حذف فاتورة "${supplierName}" نهائياً من السيستم؟`,
      confirmText: "نعم، حذف الفاتورة",
      cancelText: "إلغاء",
      isDanger: true,
      icon: "🗑️"
    });

    if (!confirmed) return;

    try {
      try {
        await this.api.deleteInvoice(id);
      } catch (e) {
        const backup = this.loadLocalBackup(this.currentMonth);
        backup.invoices = (backup.invoices || []).filter(x => (x._id !== id && x.id !== id));
        this.saveLocalBackup(this.currentMonth, backup);
      }
      window.ToastComponent.show("تم حذف الفاتورة بنجاح.", "success");
      await this.loadData();
    } catch (err) {
      window.ToastComponent.show("تعذر حذف الفاتورة: " + err.message, "error");
    }
  }

  static async deleteWaste(id, itemName) {
    const confirmed = await window.ModalComponent.confirm({
      title: "حذف سجل الهالك",
      message: `هل أنت متأكد من حذف سجل الهالك الخاص بـ "${itemName}"؟`,
      confirmText: "نعم، حذف",
      cancelText: "إلغاء",
      isDanger: true,
      icon: "🗑️"
    });

    if (!confirmed) return;

    try {
      try {
        await this.api.deleteWasteRecord(id);
      } catch (e) {
        const backup = this.loadLocalBackup(this.currentMonth);
        backup.waste = (backup.waste || []).filter(x => (x._id !== id && x.id !== id));
        this.saveLocalBackup(this.currentMonth, backup);
      }
      window.ToastComponent.show("تم حذف سجل الهالك بنجاح.", "success");
      await this.loadData();
    } catch (err) {
      window.ToastComponent.show("تعذر حذف الهالك: " + err.message, "error");
    }
  }

  static async deleteSales(id) {
    const confirmed = await window.ModalComponent.confirm({
      title: "حذف سجل المبيعات",
      message: "هل أنت متأكد من حذف هذا السجل للمبيعات؟",
      confirmText: "نعم، حذف",
      cancelText: "إلغاء",
      isDanger: true,
      icon: "🗑️"
    });

    if (!confirmed) return;

    try {
      try {
        await this.api.deleteSalesRecord(id);
      } catch (e) {
        const backup = this.loadLocalBackup(this.currentMonth);
        backup.sales = (backup.sales || []).filter(x => (x._id !== id && x.id !== id));
        this.saveLocalBackup(this.currentMonth, backup);
      }
      window.ToastComponent.show("تم حذف سجل المبيعات بنجاح.", "success");
      await this.loadData();
    } catch (err) {
      window.ToastComponent.show("تعذر حذف سجل المبيعات: " + err.message, "error");
    }
  }

  // ================= UI Rendering =================
  static render() {
    this.renderKPIs();
    this.renderInvoicesTable();
    this.renderWasteTable();
    this.renderSalesTable();
    this.renderAnalyticsBreakdown();
  }

  static renderKPIs() {
    const summary = this.summary || this.calculateLocalSummary(this.invoices, this.wasteList, this.salesList);
    const m = summary.metrics || {};

    const formatNum = (num) => window.formatCurrency ? window.formatCurrency(num || 0) : Number(num || 0).toFixed(2);

    // 1. Invoices KPI
    const kpiInvoices = document.getElementById("acc-kpi-invoices");
    const kpiInvoicesCount = document.getElementById("acc-kpi-invoices-count");
    if (kpiInvoices) kpiInvoices.textContent = formatNum(m.totalInvoices);
    if (kpiInvoicesCount) kpiInvoicesCount.textContent = `${m.invoicesCount || 0} فاتورة مرفوعة`;

    // 2. Waste KPI
    const kpiWaste = document.getElementById("acc-kpi-waste");
    const kpiWasteRatio = document.getElementById("acc-kpi-waste-ratio");
    if (kpiWaste) kpiWaste.textContent = formatNum(m.totalWaste);
    if (kpiWasteRatio) kpiWasteRatio.textContent = `نسبة الهالك: ${(m.wasteRatio || 0).toFixed(1)}% من المشتريات`;

    // 3. Sales KPI
    const kpiSales = document.getElementById("acc-kpi-sales");
    const kpiSalesSub = document.getElementById("acc-kpi-sales-sub");
    if (kpiSales) kpiSales.textContent = formatNum(m.totalSales);
    if (kpiSalesSub) kpiSalesSub.textContent = `${m.salesRecordsCount || 0} تسجيل مبيعات`;

    // 4. Net Profit KPI
    const kpiNet = document.getElementById("acc-kpi-net");
    const kpiNetSub = document.getElementById("acc-kpi-net-sub");
    const netVal = Number(m.netProfit) || 0;
    if (kpiNet) {
      kpiNet.textContent = `${netVal >= 0 ? "+" : ""}${formatNum(netVal)}`;
      kpiNet.style.color = netVal >= 0 ? "var(--color-emerald)" : "var(--color-rose)";
    }
    if (kpiNetSub) {
      kpiNetSub.textContent = netVal >= 0 ? "صافي أرباح تشغيلية إيجابية" : "عجز / مصاريف وهالك أعلى من المبيعات";
      kpiNetSub.style.color = netVal >= 0 ? "var(--color-emerald)" : "var(--color-rose)";
    }
  }

  static renderInvoicesTable() {
    const tbody = document.getElementById("invoices-table-body");
    const emptyState = document.getElementById("invoices-empty-state");
    if (!tbody) return;

    if (!this.invoices || this.invoices.length === 0) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    if (emptyState) emptyState.style.display = "none";
    const formatNum = (num) => window.formatCurrency ? window.formatCurrency(num || 0) : Number(num || 0).toFixed(2);

    tbody.innerHTML = this.invoices.map((inv, idx) => {
      const id = inv._id || inv.id;
      const dateStr = inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString("ar-EG") : "-";
      const hasImg = !!inv.imageData;

      return `
        <tr>
          <td style="font-weight: 600; color: var(--text-muted); text-align: center;">${idx + 1}</td>
          <td>
            ${hasImg ? `
              <div class="invoice-thumb-preview" onclick="window.AccountingComponent.viewInvoiceFullImage('${inv.imageData}', '${inv.supplier || "فاتورة"}')" title="اضغط لتكبير الصورة">
                <img src="${inv.imageData}" alt="صورة الفاتورة" />
                <span class="thumb-zoom-icon">🔍</span>
              </div>
            ` : `
              <span class="no-image-badge" title="لا توجد صورة">بدون صورة</span>
            `}
          </td>
          <td style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">
            ${inv.supplier}
            ${inv.invoiceNumber ? `<div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">رقم: #${inv.invoiceNumber}</div>` : ""}
          </td>
          <td>
            <span class="badge" style="background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--accent-gold);">
              ${inv.category || "خامات وبن"}
            </span>
          </td>
          <td style="font-weight: 800; color: var(--accent-gold); font-size: 1.05rem;">
            ${formatNum(inv.amount)} <span style="font-size: 0.75rem; color: var(--text-muted);">ج.م</span>
          </td>
          <td style="color: var(--text-secondary); font-size: 0.85rem; font-family: monospace;">
            ${dateStr}
          </td>
          <td style="color: var(--text-muted); font-size: 0.82rem; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${inv.notes || "-"}
          </td>
          <td style="text-align: center;">
            <button class="btn-icon-danger" onclick="window.AccountingComponent.deleteInvoice('${id}', '${inv.supplier}')" title="حذف الفاتورة">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  static renderWasteTable() {
    const tbody = document.getElementById("waste-table-body");
    const emptyState = document.getElementById("waste-empty-state");
    if (!tbody) return;

    if (!this.wasteList || this.wasteList.length === 0) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    if (emptyState) emptyState.style.display = "none";
    const formatNum = (num) => window.formatCurrency ? window.formatCurrency(num || 0) : Number(num || 0).toFixed(2);

    tbody.innerHTML = this.wasteList.map((wst, idx) => {
      const id = wst._id || wst.id;
      const dateStr = wst.wasteDate ? new Date(wst.wasteDate).toLocaleDateString("ar-EG") : "-";

      return `
        <tr>
          <td style="font-weight: 600; color: var(--text-muted); text-align: center;">${idx + 1}</td>
          <td style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">
            ${wst.itemName}
          </td>
          <td>
            <span class="badge" style="background: var(--color-purple-bg); color: var(--color-purple);">
              ${wst.quantity} ${wst.unit || "قطعة"}
            </span>
          </td>
          <td style="font-weight: 800; color: var(--color-rose); font-size: 1.05rem;">
            -${formatNum(wst.lossValue)} <span style="font-size: 0.75rem; color: var(--text-muted);">ج.م</span>
          </td>
          <td>
            <span class="badge" style="background: var(--color-rose-bg); color: var(--color-rose); border: 1px solid rgba(244, 63, 94, 0.2);">
              ${wst.reason || "تلف"}
            </span>
          </td>
          <td style="color: var(--text-secondary); font-size: 0.85rem;">
            ${wst.responsible || "الشيفت"}
          </td>
          <td style="color: var(--text-secondary); font-size: 0.85rem; font-family: monospace;">
            ${dateStr}
          </td>
          <td style="color: var(--text-muted); font-size: 0.82rem;">
            ${wst.notes || "-"}
          </td>
          <td style="text-align: center;">
            <button class="btn-icon-danger" onclick="window.AccountingComponent.deleteWaste('${id}', '${wst.itemName}')" title="حذف الهالك">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  static renderSalesTable() {
    const tbody = document.getElementById("sales-table-body");
    const emptyState = document.getElementById("sales-empty-state");
    if (!tbody) return;

    if (!this.salesList || this.salesList.length === 0) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.style.display = "block";
      return;
    }

    if (emptyState) emptyState.style.display = "none";
    const formatNum = (num) => window.formatCurrency ? window.formatCurrency(num || 0) : Number(num || 0).toFixed(2);

    tbody.innerHTML = this.salesList.map((s, idx) => {
      const id = s._id || s.id;
      const dateStr = s.recordDate ? new Date(s.recordDate).toLocaleDateString("ar-EG") : "-";

      return `
        <tr>
          <td style="font-weight: 600; color: var(--text-muted); text-align: center;">${idx + 1}</td>
          <td style="color: var(--text-secondary); font-size: 0.85rem; font-family: monospace;">
            ${dateStr}
          </td>
          <td style="font-weight: 600; color: var(--text-primary);">
            ${s.branchName || "الفرع الرئيسي"}
          </td>
          <td style="color: var(--text-secondary);">
            ${formatNum(s.cashAmount)} ج.م
          </td>
          <td style="color: var(--text-secondary);">
            ${formatNum(s.visaAmount)} ج.م
          </td>
          <td style="color: var(--text-secondary);">
            ${formatNum(s.onlineAmount)} ج.م
          </td>
          <td style="font-weight: 800; color: var(--color-emerald); font-size: 1.05rem;">
            +${formatNum(s.totalAmount)} <span style="font-size: 0.75rem; color: var(--text-muted);">ج.م</span>
          </td>
          <td style="color: var(--text-muted); text-align: center;">
            ${s.ordersCount || "-"}
          </td>
          <td style="text-align: center;">
            <button class="btn-icon-danger" onclick="window.AccountingComponent.deleteSales('${id}')" title="حذف سجل المبيعات">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  static renderAnalyticsBreakdown() {
    const container = document.getElementById("analytics-breakdown-container");
    if (!container) return;

    const summary = this.summary || this.calculateLocalSummary(this.invoices, this.wasteList, this.salesList);
    const catList = summary.invoicesByCategory || [];
    const reasonList = summary.wasteByReason || [];
    const formatNum = (num) => window.formatCurrency ? window.formatCurrency(num || 0) : Number(num || 0).toFixed(2);

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
        <!-- Invoices by Category -->
        <div class="panel-card" style="margin-bottom: 0;">
          <div class="panel-header">
            <div class="panel-title">
              <span>📦 توزيع فواتير المشتريات حسب الصنف</span>
            </div>
            <span class="badge" style="background: var(--accent-glow); color: var(--accent-gold);">
              ${catList.length} تصنيفات
            </span>
          </div>
          <div style="padding: 1rem 0;">
            ${catList.length === 0 ? `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">لا توجد فواتير مسجلة في هذا الشهر</div>` : `
              <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${catList.map(c => `
                  <div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 0.35rem;">
                      <span style="font-weight: 600; color: var(--text-primary);">${c.category}</span>
                      <span style="font-weight: 700; color: var(--accent-gold);">${formatNum(c.amount)} ج.م (${c.percentage}%)</span>
                    </div>
                    <div style="height: 8px; border-radius: var(--radius-full); background: var(--bg-secondary); overflow: hidden;">
                      <div style="width: ${c.percentage}%; height: 100%; background: linear-gradient(90deg, var(--accent-gold), var(--accent-gold-dark)); border-radius: var(--radius-full);"></div>
                    </div>
                  </div>
                `).join("")}
              </div>
            `}
          </div>
        </div>

        <!-- Waste by Reason -->
        <div class="panel-card" style="margin-bottom: 0;">
          <div class="panel-header">
            <div class="panel-title">
              <span>🗑️ أسباب الهالك والضايع (الويست)</span>
            </div>
            <span class="badge" style="background: var(--color-rose-bg); color: var(--color-rose);">
              ${reasonList.length} أسباب
            </span>
          </div>
          <div style="padding: 1rem 0;">
            ${reasonList.length === 0 ? `<div style="text-align: center; color: var(--text-muted); padding: 2rem;">لا يوجد هالك مسجل في هذا الشهر (ممتاز! 🎉)</div>` : `
              <div style="display: flex; flex-direction: column; gap: 1rem;">
                ${reasonList.map(r => `
                  <div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.88rem; margin-bottom: 0.35rem;">
                      <span style="font-weight: 600; color: var(--text-primary);">${r.reason}</span>
                      <span style="font-weight: 700; color: var(--color-rose);">${formatNum(r.amount)} ج.م (${r.percentage}%)</span>
                    </div>
                    <div style="height: 8px; border-radius: var(--radius-full); background: var(--bg-secondary); overflow: hidden;">
                      <div style="width: ${r.percentage}%; height: 100%; background: linear-gradient(90deg, #f43f5e, #e11d48); border-radius: var(--radius-full);"></div>
                    </div>
                  </div>
                `).join("")}
              </div>
            `}
          </div>
        </div>
      </div>
    `;
  }
}

if (typeof window !== "undefined") {
  window.AccountingComponent = AccountingComponent;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = AccountingComponent;
}

