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

    // Temporary storage for images being uploaded in modal
    this.pendingImages = [];
    this.pendingImageData = "";
    this.activePreviewIndex = 0;

    // Full screen viewer gallery state
    this.viewerImages = [];
    this.viewerCurrentIndex = 0;
    this.viewerTitle = "";

    // Zoom & Pan interactive state
    this.zoomScale = 1;
    this.panX = 0;
    this.panY = 0;
    this.rotation = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    // Track active invoice being edited (null when creating new)
    this.editingInvoiceId = null;

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
        if (e.target.files && e.target.files.length > 0) {
          this.handleImageFiles(e.target.files);
        }
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
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleImageFiles(e.dataTransfer.files);
        }
      });
      dropZone.addEventListener("click", () => {
        if (fileInput) fileInput.click();
      });
    }

    // Support pasting image(s) from clipboard anywhere when invoice modal is open
    window.addEventListener("paste", (e) => {
      const modal = document.getElementById("modal-add-invoice");
      if (modal && modal.classList.contains("active")) {
        const items = e.clipboardData && e.clipboardData.items;
        if (items) {
          const pastedFiles = [];
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
              const file = items[i].getAsFile();
              if (file) pastedFiles.push(file);
            }
          }
          if (pastedFiles.length > 0) {
            this.handleImageFiles(pastedFiles);
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

    // AI Scan Button
    const btnAiScan = document.getElementById("btn-ai-scan-invoice");
    if (btnAiScan) {
      btnAiScan.addEventListener("click", () => this.triggerAiInvoiceScan());
    }

    // Initialize Interactive Zoom & Pan Viewport handlers
    this.initZoomAndPanEvents();
  }

  /**
   * Set up event listeners for Zoom & Pan on invoice viewer modal
   */
  static initZoomAndPanEvents() {
    const viewport = document.getElementById("invoice-zoom-viewport");
    if (!viewport || this._zoomEventsInitialized) return;
    this._zoomEventsInitialized = true;

    // 1. Mouse wheel zoom centered at cursor position
    viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.25 : 0.8;
      const newScale = Math.max(0.5, Math.min(10, this.zoomScale * zoomFactor));

      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      this.panX -= (mouseX - this.panX) * (zoomFactor - 1);
      this.panY -= (mouseY - this.panY) * (zoomFactor - 1);
      this.zoomScale = newScale;

      if (this.zoomScale <= 1) {
        this.panX = 0;
        this.panY = 0;
      }
      this.applyZoomTransform();
    }, { passive: false });

    // 2. Drag & Pan (Mouse)
    viewport.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      this.isDragging = true;
      this.dragStartX = e.clientX - this.panX;
      this.dragStartY = e.clientY - this.panY;
      viewport.classList.add("is-dragging");
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.isDragging) return;
      this.panX = e.clientX - this.dragStartX;
      this.panY = e.clientY - this.dragStartY;
      this.applyZoomTransform();
    });

    window.addEventListener("mouseup", () => {
      if (this.isDragging) {
        this.isDragging = false;
        viewport.classList.remove("is-dragging");
      }
    });

    // 3. Double click to quick zoom 3x
    viewport.addEventListener("dblclick", (e) => {
      if (this.zoomScale > 1.2) {
        this.resetZoom();
      } else {
        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;
        this.panX = -mouseX * 2;
        this.panY = -mouseY * 2;
        this.setZoomLevel(3);
      }
    });

    // 4. Mobile Touch drag & pan
    viewport.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        this.isDragging = true;
        this.dragStartX = e.touches[0].clientX - this.panX;
        this.dragStartY = e.touches[0].clientY - this.panY;
      }
    }, { passive: true });

    viewport.addEventListener("touchmove", (e) => {
      if (this.isDragging && e.touches.length === 1) {
        this.panX = e.touches[0].clientX - this.dragStartX;
        this.panY = e.touches[0].clientY - this.dragStartY;
        this.applyZoomTransform();
      }
    }, { passive: true });

    viewport.addEventListener("touchend", () => {
      this.isDragging = false;
    });
  }

  /**
   * Scan invoice with Gemini Direct (client-side fallback)
   * Supports multi-image invoices (up to 10+ pages)
   */
  static async scanWithGeminiDirect(imagesInput, apiKey, signal) {
    const imagesList = Array.isArray(imagesInput) && imagesInput.length > 0
      ? imagesInput
      : (imagesInput ? [imagesInput] : []);

    if (imagesList.length === 0) {
      throw new Error("لم يتم إرفاق أي صورة للفاتورة");
    }

    const imageParts = imagesList.map((imgStr) => {
      let mimeType = "image/jpeg";
      let base64Data = imgStr;
      const match = imgStr.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
      return { inlineData: { mimeType, data: base64Data } };
    });

    const pageCount = imagesList.length;
    const multiPageInstruction = pageCount > 1
      ? `\nتنبيه فائق الأهمية: هذه الفاتورة تتكون من (${pageCount}) صفحات مرفقة بالترتيب كصور متعددة لفاتورة واحدة.
1. راجع جميع الصفحات (${pageCount} صفحات) بالكامل من أول صفحة حتى آخر صفحة.
2. لكل صنف في الفاتورة: حدد رقم الصفحة التي ورد فيها بدقة (page: 1, 2, 3...) واسمه والكمية وسعر الوحدة والضريبة والإجمالي.
3. في أسفل الفاتورة بالصفحة الأخيرة يوجد ملخص الضرائب الرسمي المطبوع (Taxes Summary): اقرأ منه الضرائب المطبوعة فقط بدقة تامة وبدون أي افتراضات مسبقة!`
      : `\nتنبيه: اقرأ تفاصيل الأصناف وملخص الضرائب المطبوع في أسفل الفاتورة بدقة تامة ومن الورقة حصراً.`;

    const systemPrompt = `أنت مدقق حسابات وخبير ضرائب مصري عالي الدقة في قراءة وتحليل فواتير وإيصالات الكافيهات والمطاعم في مصر.
مهمتك استخراج وتدقيق البيانات بدقة حسابية متناهية (100% Accurate OCR):${multiPageInstruction}

قواعد التدقيق الحسابي الإلزامية:
1. دقة الأرقام والكسور العشرية: انتبه بدقة شديدة لكل الأرقام والكسور العشرية (مثال: 55.75، 62.35، 8364.75، 9034.09). لا تقرب أو تحذف القروش نهائياً!
2. استخراج قائمة الأصناف (items):
   - لكل صنف استخرج بدقة من أعمدة الفاتورة:
     * "page": رقم الصفحة المأخوذ منها الصنف (1، 2، 3...)
     * "name": اسم الصنف كما هو مكتوب
     * "quantity": الكمية كرقم دقيق
     * "unitPrice": سعر الوحدة الصافي بالكسور العشرية كرقم
     * "taxType": نوع ونسبة الضريبة المطبوعة في عمود Taxes نصاً كما هي (مثال: "SCHD 5%" أو "VAT 14%" أو "0%"). إذا لم توجد ضريبة اكتب "".
     * "totalPrice": إجمالي الصنف قبل الضريبة المطبوع في عمود Amount (أو حاصل ضرب الكمية في سعر الوحدة).
     * "taxIncluded": إجمالي الصنف شامل الضريبة المطبوع في عمود Tax Incl. (المبلغ بعد إضافة الضريبة).
3. استخراج الضرائب المطبوعة في ذيل الفاتورة (Taxes Breakdown) من الورقة حصراً - ممنوع الديفولت:
   - اقرأ بدقة جدول الضرائب المطبوع في أسفل الفاتورة بالصفحة الأخيرة:
     * ضريبة القيمة المضافة 14% (vat14): استخرج القيمة المطبوعة صراحة فقط لـ VAT 14% (مثال: VAT 14% on 3,183.00 LE: 445.62 LE -> 445.62). إذا لم تكن هناك ضريبة 14% مطبوعة على الفاتورة، ضع vat14: 0.00 فوراً (إياك وافتراض أو تخمين أي ضريبة 14% لم تُطبع في الفاتورة).
     * ضريبة الجدول 5% (schedule5): استخرج القيمة المطبوعة صراحة فقط لـ Schedule Tax 5% (مثال: Schedule Tax 5% on 5,813.16 LE: 290.66 LE -> 290.66). إذا لم تُطبع، ضع schedule5: 0.00 فوراً.
     * untaxedSubtotal: المجموع الصافي المطبوع في Untaxed Amount قبل الضرائب.
     * grandTotal: الإجمالي النهائي الشامل المطبوع في Total المطلوب سداده.
     * taxesSummary: قائمة بجميع الضرائب المطبوعة فعلياً على الفاتورة فقط: [{"name": "ضريبة ق.م 14%", "rate": 14, "amount": 0.00}]. إذا لم تكن هناك ضريبة اترك القائمة فارغة [].
4. تاريخ الفاتورة ورقمها واسم المورد والتصنيف.

أجب بصيغة JSON حصراً بدون أي نصوص أو markdown codeblocks إضافية:
{
  "supplier": "اسم المورد أو الشركة",
  "untaxedSubtotal": 0.00,
  "vat14": 0.00,
  "schedule5": 0.00,
  "hasVat14": false,
  "hasSchedule5": false,
  "taxesSummary": [],
  "grandTotal": 0.00,
  "invoiceDate": "YYYY-MM-DD",
  "invoiceNumber": "",
  "category": "خامات وبن",
  "items": [
    { "page": 1, "name": "اسم الصنف", "quantity": 1, "unitPrice": 0.00, "taxType": "SCHD 5%", "totalPrice": 0.00, "taxIncluded": 0.00 }
  ],
  "notes": "ملخص الفاتورة والضرائب"
}`;

    const requestPayload = {
      contents: [{
        parts: [
          { text: systemPrompt },
          ...imageParts
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 16384,
        responseMimeType: "application/json"
      }
    };

    const models = [
      "gemini-2.5-flash",
      "gemini-flash-latest",
      "gemini-flash-lite-latest",
      "gemini-2.5-flash-lite",
      "gemini-3.1-flash-lite"
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

        let cleanJson = candidate.trim().replace(/^\`\`\`json\s*/, "").replace(/\s*\`\`\`$/, "");
        const parsed = JSON.parse(cleanJson);

        // Mathematical Float Post-processing with Tax Incl. Support
        const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
        const items = rawItems.map((it, i) => {
          const qty = Number(it.quantity) || 1;
          const unit = Number(it.unitPrice || it.price) || 0;
          const taxType = String(it.taxType || it.taxes || "").trim();
          const tot = Number(it.totalPrice || it.amount || it.total) || (qty * unit);

          // Calculate exact tax rate per item - Never default to 14% or 5% if not indicated
          let rate = 0;
          const upperTax = taxType.toUpperCase();
          const pctMatch = upperTax.match(/(\d+(?:\.\d+)?)\s*%/);
          if (pctMatch) {
            rate = parseFloat(pctMatch[1]) / 100;
          } else if (upperTax.includes("VAT") || upperTax.includes("قيمة مضافة")) {
            rate = 0.14;
          } else if (upperTax.includes("SCHD") || upperTax.includes("جدول")) {
            rate = 0.05;
          }

          let taxIncl = Number(it.taxIncluded || it.taxIncl);
          if (!taxIncl || isNaN(taxIncl) || (rate > 0 && Math.abs(taxIncl - tot) < 0.01)) {
            taxIncl = tot * (1 + rate);
          }

          return {
            page: Number(it.page) || 1,
            name: String(it.name || `صنف ${i + 1}`).trim(),
            quantity: qty,
            unitPrice: parseFloat(unit.toFixed(2)),
            taxType: taxType || (rate === 0.14 ? "VAT 14%" : (rate === 0.05 ? "SCHD 5%" : "0%")),
            totalPrice: parseFloat(tot.toFixed(2)),
            taxIncluded: parseFloat(taxIncl.toFixed(2))
          };
        });

        const itemsSubtotal = items.reduce((s, it) => s + it.totalPrice, 0);
        const itemsTaxInclSum = items.reduce((s, it) => s + it.taxIncluded, 0);

        // Ground truth: The printed footer grand total and untaxed subtotal from the supplier's receipt
        // are the legal, official financial amounts. Line items are audited against them.
        const parsedSubtotal = Number(parsed.untaxedSubtotal || parsed.subtotal) || 0;
        const parsedGrandTotal = Number(parsed.grandTotal || parsed.amount) || 0;

        const untaxedSubtotal = parsedSubtotal > 0
          ? parsedSubtotal
          : (items.length > 0 ? parseFloat(itemsSubtotal.toFixed(2)) : 0);

        const grandTotal = parsedGrandTotal > 0
          ? parsedGrandTotal
          : (items.length > 0 ? parseFloat(itemsTaxInclSum.toFixed(2)) : 0);

        // Strict dynamic taxes from invoice
        const rawVat14 = Number(parsed.vat14) || 0;
        const rawSchedule5 = Number(parsed.schedule5) || 0;
        const hasVat14 = Boolean(parsed.hasVat14 || rawVat14 > 0);
        const hasSchedule5 = Boolean(parsed.hasSchedule5 || rawSchedule5 > 0);
        let vat14 = hasVat14 ? parseFloat(rawVat14.toFixed(2)) : 0;
        let schedule5 = hasSchedule5 ? parseFloat(rawSchedule5.toFixed(2)) : 0;
        const taxAmount = parseFloat((grandTotal - untaxedSubtotal).toFixed(2));

        // If items-level taxes exist and differ from partial footer, align tax breakdown with items
        if (items.length > 0 && Math.abs((vat14 + schedule5) - taxAmount) > 0.05) {
          let v14 = 0;
          let s5 = 0;
          items.forEach(it => {
            const itemTax = it.taxIncluded - it.totalPrice;
            if (itemTax > 0) {
              const t = String(it.taxType || "").toUpperCase();
              if (t.includes("14") || t.includes("VAT")) v14 += itemTax;
              else if (t.includes("5") || t.includes("SCHD")) s5 += itemTax;
            }
          });
          if (v14 > 0 || s5 > 0) {
            vat14 = parseFloat(v14.toFixed(2));
            schedule5 = parseFloat(s5.toFixed(2));
          }
        }

        const pageGroups = {};
        items.forEach(it => {
          const p = it.page || 1;
          if (!pageGroups[p]) pageGroups[p] = { page: p, subtotal: 0, taxIncluded: 0, itemsCount: 0 };
          pageGroups[p].subtotal += it.totalPrice;
          pageGroups[p].taxIncluded += it.taxIncluded;
          pageGroups[p].itemsCount += 1;
        });

        const pageBreakdown = Object.values(pageGroups).map(g => ({
          page: g.page,
          subtotal: parseFloat(g.subtotal.toFixed(2)),
          taxIncluded: parseFloat(g.taxIncluded.toFixed(2)),
          total: parseFloat(g.taxIncluded.toFixed(2)),
          itemsCount: g.itemsCount,
          note: `صفحة ${g.page}: ${g.itemsCount} صنف (صافي ${g.subtotal.toFixed(2)} | شامل ${g.taxIncluded.toFixed(2)} ج.م)`
        })).sort((a, b) => a.page - b.page);

        return {
          success: true,
          modelUsed: model,
          pageCount: pageCount,
          data: {
            supplier: parsed.supplier || "Moka",
            subtotal: parseFloat(untaxedSubtotal.toFixed(2)),
            taxAmount: parseFloat(taxAmount.toFixed(2)),
            taxDetails: {
              vat14: vat14,
              schedule5: schedule5,
              hasVat14: hasVat14 && vat14 > 0,
              hasSchedule5: hasSchedule5 && schedule5 > 0,
              taxesSummary: Array.isArray(parsed.taxesSummary) ? parsed.taxesSummary : []
            },
            amount: parseFloat(grandTotal.toFixed(2)),
            invoiceDate: parsed.invoiceDate || parsed.date || new Date().toISOString().split("T")[0],
            invoiceNumber: parsed.invoiceNumber || "",
            category: parsed.category || "خامات وبن",
            items: items,
            pageBreakdown: pageBreakdown,
            notes: parsed.notes || `فاتورة من ${pageCount} صفحة (${items.length} صنف)`
          }
        };
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
      } catch (_) { }
      this.activeScanAbortController = null;
    }

    const scanningOverlay = document.getElementById("ai-scanning-overlay");
    const btn = document.getElementById("btn-ai-scan-invoice");
    const btnText = document.getElementById("btn-ai-scan-text");
    const btnCancel = document.getElementById("btn-cancel-ai-scan");
    const statusMsg = document.getElementById("ai-scan-status-message");

    if (scanningOverlay) scanningOverlay.style.display = "none";
    if (btn) btn.disabled = false;
    this.updateScanButtonText();
    if (btnCancel) btnCancel.style.display = "none";
    if (statusMsg) {
      statusMsg.style.display = "block";
      statusMsg.style.color = "var(--text-secondary)";
      statusMsg.textContent = "🛑 تم إيقاف الفحص. يمكنك كتابة وحفظ بيانات الفاتورة يدوياً.";
    }
  }

  /**
   * Scan invoice photo(s) using AI Vision (Supports multi-page invoices up to 10+ pages)
   */
  static async triggerAiInvoiceScan() {
    if (!this.pendingImages || this.pendingImages.length === 0) {
      window.ToastComponent.show("يرجى اختيار أو رفع صورة الفاتورة أولاً", "error");
      return;
    }

    const pageCount = this.pendingImages.length;

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
    const scanBadgeText = document.getElementById("ai-scan-badge-text");
    const statusMsg = document.getElementById("ai-scan-status-message");

    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = pageCount > 1
      ? `⏳ جاري قراءة (${pageCount}) صفحات بالـ AI...`
      : "⏳ جاري قراءة الفاتورة بالذكاء الاصطناعي...";
    if (btnCancel) btnCancel.style.display = "inline-flex";
    if (scanningOverlay) scanningOverlay.style.display = "flex";
    if (scanBadgeText) {
      scanBadgeText.textContent = pageCount > 1
        ? `⚡ جاري تحليل (${pageCount}) صفحات للفاتورة وحساب الإجمالي...`
        : "⚡ جاري تحليل الفاتورة واستخراج البيانات...";
    }
    if (statusMsg) {
      statusMsg.style.display = "block";
      statusMsg.style.color = "var(--accent-gold)";
      statusMsg.textContent = pageCount > 1
        ? `🔍 جاري فحص كافة الصفحات (${pageCount})، تجميع الأصناف، واحتساب الإجمالي الشامل...`
        : "🔍 جاري فحص النصوص، التواريخ، الأصناف، والمبلغ الإجمالي...";
    }

    try {
      const apiKey = (typeof localStorage !== "undefined" ? localStorage.getItem("GEMINI_API_KEY") : "") || "";
      let res = null;

      // 1. Try server backend endpoint first
      try {
        res = await this.api.scanInvoice(this.pendingImages, apiKey, signal);
      } catch (serverErr) {
        if (serverErr.name === "AbortError") throw serverErr;
        console.warn("Backend OCR request failed, trying direct Gemini API fallback:", serverErr.message);
        if (apiKey) {
          res = await this.scanWithGeminiDirect(this.pendingImages, apiKey, signal);
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

        // Render AI Financial Audit Breakdown Panel
        this.renderAiAuditPanel(d);

        if (supplierInput && d.supplier) supplierInput.value = d.supplier;
        if (amountInput && d.amount !== undefined && d.amount !== null) amountInput.value = d.amount;
        if (numberInput && d.invoiceNumber) numberInput.value = d.invoiceNumber;
        if (dateInput && d.invoiceDate) dateInput.value = d.invoiceDate;
        if (categoryInput && d.category) {
          categoryInput.value = d.category;
        }

        let summaryNotes = d.notes || "";
        if (pageCount > 1 && !summaryNotes.includes("صفحات")) {
          summaryNotes = `[فاتورة مجمعة من ${pageCount} صفحات] ${summaryNotes}`;
        }
        if (d.items && d.items.length > 0) {
          const itemsStr = d.items.map(it => `${it.name} (${it.quantity})`).join("، ");
          summaryNotes = summaryNotes ? `${summaryNotes} | الأصناف: ${itemsStr}` : `الأصناف: ${itemsStr}`;
        }
        if (notesInput && summaryNotes) notesInput.value = summaryNotes;

        if (statusMsg) {
          statusMsg.style.color = "var(--color-emerald)";
          const pageInfo = pageCount > 1 ? ` (${pageCount} صفحات)` : "";
          statusMsg.innerHTML = `✅ تم استخراج وحساب الفاتورة${pageInfo} بنجاح: مورد "<strong>${d.supplier}</strong>" بإجمالي شامل <strong>${Number(d.amount).toFixed(2)} ج.م</strong>.`;
        }

        window.ToastComponent.show(`✨ تم استخراج وحساب الفاتورة بنجاح: ${d.amount} ج.م`, "success");
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
      this.updateScanButtonText();
      if (btnCancel) btnCancel.style.display = "none";
      if (scanningOverlay) scanningOverlay.style.display = "none";
    }
  }

  /**
   * Helper to process image file with Ultra-Clarity (3x detail scaling & contrast enhancement for accurate OCR)
   */
  static compressImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        return reject(new Error("الملف ليس صورة"));
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let origW = img.width;
          let origH = img.height;
          let targetW = origW;
          let targetH = origH;

          // 1. If image is narrow or small (common in phone thermal receipt photos), upscale by up to 2x-3x so tiny digits are crystal clear
          if (origW < 1400 && origH < 2800) {
            const scaleUp = Math.min(3, 2600 / Math.max(origW, origH));
            if (scaleUp > 1.15) {
              targetW = Math.round(origW * scaleUp);
              targetH = Math.round(origH * scaleUp);
            }
          }

          // 2. Cap maximum dimension at 3000px (instead of old 1200px) so no line item or decimal point is lost
          const maxDim = 3000;
          if (targetW > maxDim || targetH > maxDim) {
            if (targetW > targetH) {
              targetH = Math.round((targetH * maxDim) / targetW);
              targetW = maxDim;
            } else {
              targetW = Math.round((targetW * maxDim) / targetH);
              targetH = maxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");

          // High quality bicubic interpolation
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";

          // Contrast & clarity filter for thermal receipts: makes faded gray ink pitch-black
          ctx.filter = "contrast(1.16) brightness(1.02)";

          ctx.drawImage(img, 0, 0, targetW, targetH);

          // Save at 0.94 quality to eliminate JPEG artifacts around tiny numbers and decimals
          const dataUrl = canvas.toDataURL("image/jpeg", 0.94);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error("فشل قراءة بيانات الصورة"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("فشل تحميل الملف"));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Handle multiple image files upload (up to 10+ pages)
   */
  static async handleImageFiles(filesInput) {
    const files = Array.from(filesInput).filter(f => f.type && f.type.startsWith("image/"));
    if (files.length === 0) {
      window.ToastComponent.show("يرجى اختيار ملفات صور صالحة (JPG, PNG, WebP)", "error");
      return;
    }

    const maxAllowed = 15;
    if (this.pendingImages.length + files.length > maxAllowed) {
      window.ToastComponent.show(`الحد الأقصى لصفحات الفاتورة الواحدة هو ${maxAllowed} صفحة`, "warning");
    }

    const availableSlots = Math.max(0, maxAllowed - this.pendingImages.length);
    const filesToProcess = files.slice(0, availableSlots);

    if (filesToProcess.length > 1) {
      window.ToastComponent.show(`جاري معالجة وتجهيز (${filesToProcess.length}) صور...`, "info");
    }

    const prevCount = this.pendingImages.length;
    // Process all images in parallel for ultra-fast loading
    const compressedResults = await Promise.all(
      filesToProcess.map(f => this.compressImageFile(f).catch(err => {
        console.warn("Failed to process invoice image page:", err.message);
        return null;
      }))
    );

    for (const compressed of compressedResults) {
      if (compressed) {
        this.pendingImages.push(compressed);
      }
    }

    if (this.pendingImages.length > prevCount) {
      this.pendingImageData = this.pendingImages[0] || "";
      this.activePreviewIndex = 0;
      this.renderInvoicePagesPreview();

      const addedCount = this.pendingImages.length - prevCount;
      window.ToastComponent.show(`تمت إضافة (${addedCount}) صور بنجاح! إجمالي الصفحات: ${this.pendingImages.length}`, "success");
    }

    // Reset file input so user can choose more if needed
    const fileInput = document.getElementById("invoice-image-file");
    if (fileInput) fileInput.value = "";
  }

  /**
   * Backward-compatible single file handler
   */
  static handleImageFile(file) {
    this.handleImageFiles([file]);
  }

  /**
   * Render Multi-Page Preview Strip & Main Preview Image
   */
  static renderInvoicePagesPreview() {
    const previewContainer = document.getElementById("invoice-preview-container");
    const previewImage = document.getElementById("invoice-preview-image");
    const dropZone = document.getElementById("invoice-drop-zone");
    const pagesStrip = document.getElementById("invoice-pages-strip");
    const summaryBar = document.getElementById("invoice-pages-summary-bar");
    const summaryText = document.getElementById("invoice-pages-summary-text");
    const pageBadge = document.getElementById("invoice-current-page-badge");
    const countBadge = document.getElementById("invoice-pages-count-badge");
    const aiBar = document.getElementById("ai-scan-actions-bar");

    const totalPages = this.pendingImages.length;

    if (totalPages === 0) {
      if (previewContainer) previewContainer.style.display = "none";
      if (dropZone) dropZone.style.display = "flex";
      if (pagesStrip) pagesStrip.style.display = "none";
      if (summaryBar) summaryBar.style.display = "none";
      if (countBadge) countBadge.style.display = "none";
      if (aiBar) aiBar.style.display = "none";
      if (previewImage) previewImage.src = "";
      return;
    }

    if (this.activePreviewIndex >= totalPages) {
      this.activePreviewIndex = totalPages - 1;
    }
    if (this.activePreviewIndex < 0) {
      this.activePreviewIndex = 0;
    }

    if (dropZone) dropZone.style.display = "none";
    if (previewContainer) previewContainer.style.display = "block";
    if (previewImage) previewImage.src = this.pendingImages[this.activePreviewIndex];

    if (pageBadge) {
      pageBadge.textContent = totalPages > 1
        ? `صفحة ${this.activePreviewIndex + 1} من ${totalPages}`
        : "صفحة 1";
    }

    if (countBadge) {
      countBadge.style.display = "inline-block";
      countBadge.textContent = `${totalPages} ${totalPages === 1 ? 'صفحة' : 'صفحات'}`;
    }

    if (summaryBar) summaryBar.style.display = "flex";
    if (summaryText) {
      summaryText.innerHTML = totalPages > 1
        ? `📄 تم إرفاق <strong>${totalPages} صفحات</strong> للفاتورة (معاينة صفحة ${this.activePreviewIndex + 1})`
        : "📄 تم إرفاق صفحة واحدة للفاتورة";
    }

    if (aiBar) aiBar.style.display = "block";
    this.updateScanButtonText();

    // Render pages strip
    if (pagesStrip) {
      pagesStrip.style.display = "flex";
      let stripHtml = this.pendingImages.map((imgUrl, idx) => `
        <div class="invoice-page-chip ${idx === this.activePreviewIndex ? 'active' : ''}"
             onclick="window.AccountingComponent.selectPreviewPage(${idx})"
             onmouseenter="window.AccountingComponent.showHoverPreview('${imgUrl}', 'صفحة ${idx + 1}', event)"
             onmouseleave="window.AccountingComponent.hideHoverPreview()"
             title="عرض صفحة ${idx + 1}">
          <img src="${imgUrl}" alt="صفحة ${idx + 1}" />
          <span class="invoice-page-badge">ص ${idx + 1}</span>
          <button type="button" class="btn-remove-page-chip" onclick="event.stopPropagation(); window.AccountingComponent.removePreviewPage(${idx})" title="حذف هذه الصفحة">✕</button>
        </div>
      `).join("");

      stripHtml += `
        <div class="invoice-page-add-chip" onclick="document.getElementById('invoice-image-file').click()" title="إضافة صفحة أخرى للفاتورة">
          <span style="font-size: 1.25rem; line-height: 1;">➕</span>
          <span>صفحة</span>
        </div>
      `;

      pagesStrip.innerHTML = stripHtml;
    }
  }

  static updateScanButtonText() {
    const btnText = document.getElementById("btn-ai-scan-text");
    if (!btnText) return;
    const count = this.pendingImages.length;
    if (count > 1) {
      btnText.textContent = `✨ فحص واستخراج إجمالي الفاتورة (${count} صفحات بالـ AI)`;
    } else {
      btnText.textContent = "✨ استخراج بيانات الفاتورة بالذكاء الاصطناعي (AI OCR)";
    }
  }

  /**
   * Select a specific page to view in the main modal preview
   */
  static selectPreviewPage(idx) {
    if (idx >= 0 && idx < this.pendingImages.length) {
      this.activePreviewIndex = idx;
      this.renderInvoicePagesPreview();
    }
  }

  /**
   * Remove a single page from multi-page invoice
   */
  static removePreviewPage(idx) {
    if (idx >= 0 && idx < this.pendingImages.length) {
      this.pendingImages.splice(idx, 1);
      this.pendingImageData = this.pendingImages[0] || "";
      if (this.pendingImages.length === 0) {
        this.clearImagePreview();
      } else {
        if (this.activePreviewIndex >= this.pendingImages.length) {
          this.activePreviewIndex = this.pendingImages.length - 1;
        }
        this.renderInvoicePagesPreview();
      }
    }
  }

  /**
   * Clear all uploaded invoice images
   */
  static clearImagePreview() {
    if (this.activeScanAbortController) {
      this.cancelAiScan();
    }
    this.pendingImages = [];
    this.pendingImageData = "";
    this.activePreviewIndex = 0;

    const fileInput = document.getElementById("invoice-image-file");
    if (fileInput) fileInput.value = "";

    this.renderInvoicePagesPreview();

    const statusMsg = document.getElementById("ai-scan-status-message");
    if (statusMsg) statusMsg.style.display = "none";
    const auditPanel = document.getElementById("ai-audit-panel");
    if (auditPanel) {
      auditPanel.innerHTML = "";
      auditPanel.style.display = "none";
    }
    const scanningOverlay = document.getElementById("ai-scanning-overlay");
    if (scanningOverlay) scanningOverlay.style.display = "none";
  }


  /**
   * Render AI Financial Audit Breakdown Panel in the Invoice Modal
   */
  static renderAiAuditPanel(d) {
    const container = document.getElementById("ai-audit-panel");
    if (!container) return;

    this.scannedAuditData = d;
    const items = Array.isArray(d.items) ? d.items : [];
    const itemsSubtotal = items.reduce((s, it) => s + Number(it.totalPrice || (it.quantity * it.unitPrice) || 0), 0);
    const itemsTaxInclSum = items.reduce((s, it) => {
      const explicit = Number(it.taxIncluded);
      if (explicit && !isNaN(explicit)) return s + explicit;
      const base = Number(it.totalPrice || (it.quantity * it.unitPrice) || 0);
      let rate = 0;
      if (it.taxType) {
        const m = String(it.taxType).match(/(\d+(?:\.\d+)?)\s*%/);
        if (m) rate = parseFloat(m[1]) / 100;
        else if (it.taxType.includes("VAT")) rate = 0.14;
        else if (it.taxType.includes("SCHD")) rate = 0.05;
      }
      return s + (base * (1 + rate));
    }, 0);

    // Printed official financial amounts take precedence over partial item sums
    const printedSubtotal = Number(d.subtotal || d.untaxedSubtotal || 0);
    const printedAmount = Number(d.amount || d.grandTotal || 0);

    const subtotal = printedSubtotal > 0 ? printedSubtotal : (items.length > 0 ? parseFloat(itemsSubtotal.toFixed(2)) : 0);
    const amount = printedAmount > 0 ? printedAmount : (items.length > 0 ? parseFloat(itemsTaxInclSum.toFixed(2)) : 0);
    const taxAmount = parseFloat((amount - subtotal).toFixed(2));

    d.subtotal = subtotal;
    d.amount = amount;
    d.taxAmount = taxAmount;

    let vat14 = Number(d.taxDetails?.vat14 || 0);
    let schedule5 = Number(d.taxDetails?.schedule5 || 0);

    if (items.length > 0 && Math.abs((vat14 + schedule5) - taxAmount) > 0.05) {
      let v14 = 0;
      let s5 = 0;
      items.forEach(it => {
        const base = Number(it.totalPrice || (it.quantity * it.unitPrice) || 0);
        const explicit = Number(it.taxIncluded);
        const incl = (explicit && !isNaN(explicit)) ? explicit : base;
        const itemTax = incl - base;
        if (itemTax > 0) {
          const t = String(it.taxType || "").toUpperCase();
          if (t.includes("14") || t.includes("VAT")) v14 += itemTax;
          else if (t.includes("5") || t.includes("SCHD")) s5 += itemTax;
        }
      });
      if (v14 > 0 || s5 > 0) {
        vat14 = parseFloat(v14.toFixed(2));
        schedule5 = parseFloat(s5.toFixed(2));
      }
    }

    const pagesHtml = Array.isArray(d.pageBreakdown) && d.pageBreakdown.length > 1
      ? `<div class="ai-pages-breakdown-row">
          <span style="font-size: 0.72rem; color: var(--text-muted);">📄 تفصيل الصفحات:</span>
          ${d.pageBreakdown.map(p => `
            <span class="ai-page-pill">صفحة ${p.page}: <strong>${Number(p.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</strong></span>
          `).join("")}
        </div>`
      : "";

    const itemsHtml = Array.isArray(d.items) && d.items.length > 0
      ? `<div class="ai-items-collapsible">
          <button type="button" class="ai-items-toggle" onclick="window.AccountingComponent.toggleAiItemsTable()">
            <span>📦 استعراض الأصناف المستخرجة بالتفصيل (${d.items.length} صنف مع الأسعار والكسور)</span>
            <span id="ai-items-toggle-icon">▼</span>
          </button>
          <div id="ai-items-table-wrapper" style="display: none; max-height: 220px; overflow-y: auto; margin-top: 0.5rem;">
            <table class="ai-items-table">
              <thead>
                <tr>
                  <th style="width: 25px; text-align: center;">ص</th>
                  <th>اسم الصنف</th>
                  <th style="width: 40px; text-align: center;">الكمية</th>
                  <th style="width: 65px; text-align: center;">سعر الوحدة</th>
                  <th style="width: 60px; text-align: center;">الضريبة</th>
                  <th style="width: 70px; text-align: center;">قبل الضريبة</th>
                  <th style="width: 80px; text-align: left;">شامل الضريبة</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(it => {
                  const baseTot = Number(it.totalPrice || it.total || (it.quantity * it.unitPrice) || 0);
                  const explicit = Number(it.taxIncluded);
                  let rate = 0;
                  if (it.taxType) {
                    const m = String(it.taxType).match(/(\d+(?:\.\d+)?)\s*%/);
                    if (m) rate = parseFloat(m[1]) / 100;
                    else if (it.taxType.includes("VAT")) rate = 0.14;
                    else if (it.taxType.includes("SCHD")) rate = 0.05;
                  }
                  const incl = (explicit && !isNaN(explicit) && (!rate || Math.abs(explicit - baseTot) >= 0.01))
                    ? explicit
                    : (baseTot * (1 + rate));

                  return `
                    <tr>
                      <td style="color: var(--text-muted); font-size: 0.68rem; text-align: center;">${it.page || 1}</td>
                      <td style="font-weight: 600;">${it.name || "صنف"}</td>
                      <td style="font-family: 'Outfit', sans-serif; text-align: center;">${it.quantity || 1}</td>
                      <td style="font-family: 'Outfit', sans-serif; text-align: center;">${Number(it.unitPrice || it.price || 0).toFixed(2)}</td>
                      <td style="text-align: center;"><span style="font-size: 0.65rem; background: rgba(245,158,11,0.12); color: var(--accent-gold); padding: 1px 4px; border-radius: 3px;">${it.taxType || "—"}</span></td>
                      <td style="font-family: 'Outfit', sans-serif; text-align: center; color: var(--text-secondary);">${baseTot.toFixed(2)}</td>
                      <td style="font-weight: 800; color: var(--accent-gold); font-family: 'Outfit', sans-serif; text-align: left;">${incl.toFixed(2)}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
              <tfoot>
                <tr style="background: rgba(255,255,255,0.06); font-weight: 800;">
                  <td colspan="5" style="text-align: right; color: var(--accent-gold); padding: 0.35rem 0.5rem;">إجمالي الأصناف المكتشفة:</td>
                  <td style="font-family: 'Outfit', sans-serif; text-align: center; color: var(--text-primary);">${subtotal.toFixed(2)}</td>
                  <td style="font-family: 'Outfit', sans-serif; text-align: left; color: var(--accent-gold);">${amount.toFixed(2)} ج.م</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>`
      : "";

    container.innerHTML = `
      <div class="ai-audit-header">
        <div class="ai-audit-title">
          <span>✨</span>
          <span>نتائج التدقيق المحاسبي الدقيق (AI Financial Audit)</span>
        </div>
        <span class="ai-audit-badge">دقة حسابية 100%</span>
      </div>

      <div class="ai-audit-cards">
        <div class="ai-audit-card">
          <div class="ai-audit-label">المبلغ قبل الضريبة (Untaxed Subtotal)</div>
          <div class="ai-audit-value">${subtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small style="font-size: 0.65rem;">ج.م</small></div>
          <button type="button" class="btn-use-amount" id="btn-use-subtotal" onclick="window.AccountingComponent.setScannedAmount('subtotal', ${subtotal})">
            اعتماد قبل الضريبة
          </button>
        </div>

        <div class="ai-audit-card featured">
          <div class="ai-audit-label">الإجمالي النهائي الشامل للضرائب (Grand Total)</div>
          <div class="ai-audit-value">${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small style="font-size: 0.65rem;">ج.م</small></div>
          <button type="button" class="btn-use-amount active" id="btn-use-amount" onclick="window.AccountingComponent.setScannedAmount('amount', ${amount})">
            ✓ اعتماد الإجمالي الشامل (الموصى به)
          </button>
        </div>
      </div>

      ${(vat14 > 0 || schedule5 > 0 || taxAmount > 0) ? `
      <div style="font-size: 0.73rem; color: var(--text-secondary); margin-bottom: 0.55rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 0.4rem 0.6rem; display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;">
        <span>🧾 <strong>الضرائب المستخرجة من الفاتورة:</strong></span>
        ${vat14 > 0 ? `<span>ضريبة ق.م (14% VAT): <strong style="color: var(--color-rose);">${vat14.toFixed(2)} ج.م</strong></span>` : ''}
        ${schedule5 > 0 ? `<span>ضريبة جدول (5% Schd): <strong style="color: var(--color-rose);">${schedule5.toFixed(2)} ج.م</strong></span>` : ''}
        <span>إجمالي الضرائب: <strong style="color: var(--color-rose);">${taxAmount.toFixed(2)} ج.م</strong></span>
      </div>` : ''}

      ${pagesHtml}
      ${itemsHtml}
    `;

    container.style.display = "block";

    // Auto-select Grand Total into invoice amount input
    const amountInput = document.getElementById("invoice-amount-input");
    if (amountInput && amount > 0) {
      amountInput.value = amount.toFixed(2);
    }
  }

  static setScannedAmount(type, value) {
    const input = document.getElementById("invoice-amount-input");
    if (input) {
      input.value = Number(value).toFixed(2);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const btnSub = document.getElementById("btn-use-subtotal");
    const btnAmt = document.getElementById("btn-use-amount");
    if (btnSub && btnAmt) {
      if (type === "subtotal") {
        btnSub.classList.add("active");
        btnSub.textContent = "✓ تم اختيار قبل الضريبة";
        btnAmt.classList.remove("active");
        btnAmt.textContent = "اعتماد الإجمالي الشامل";
      } else {
        btnAmt.classList.add("active");
        btnAmt.textContent = "✓ تم اختيار الإجمالي الشامل";
        btnSub.classList.remove("active");
        btnSub.textContent = "اعتماد قبل الضريبة";
      }
    }
    window.ToastComponent.show(`تم تعيين المبلغ: ${Number(value).toFixed(2)} ج.م`, "info");
  }

  static toggleAiItemsTable() {
    const wrap = document.getElementById("ai-items-table-wrapper");
    const icon = document.getElementById("ai-items-toggle-icon");
    if (wrap) {
      const isHidden = wrap.style.display === "none";
      wrap.style.display = isHidden ? "block" : "none";
      if (icon) icon.textContent = isHidden ? "▲" : "▼";
    }
  }

  // ================= Open Modal Helpers =================
  static openAddInvoiceModal() {
    this.editingInvoiceId = null;
    const titleText = document.getElementById("invoice-modal-title-text");
    if (titleText) titleText.textContent = "رفع وحفظ فاتورة مشتريات جديدة";
    const submitBtnText = document.getElementById("btn-submit-invoice-text");
    if (submitBtnText) submitBtnText.textContent = "💾 حفظ الفاتورة";

    this.clearImagePreview();
    const form = document.getElementById("form-add-invoice");
    if (form) form.reset();

    const dateInput = document.getElementById("invoice-date-input");
    if (dateInput) {
      dateInput.value = new Date().toISOString().split("T")[0];
    }
    window.ModalComponent.open("modal-add-invoice");
  }

  /**
   * Open invoice modal in Edit Mode with existing data pre-filled
   */
  static openEditInvoiceModal(id) {
    const inv = this.invoices.find(item => (item._id || item.id) === id);
    if (!inv) {
      window.ToastComponent.show("لم يتم العثور على بيانات الفاتورة المراد تعديلها", "error");
      return;
    }

    this.editingInvoiceId = id;

    const titleText = document.getElementById("invoice-modal-title-text");
    if (titleText) titleText.textContent = `✏️ تعديل فاتورة: ${inv.supplier || "فاتورة"}`;
    const submitBtnText = document.getElementById("btn-submit-invoice-text");
    if (submitBtnText) submitBtnText.textContent = "💾 حفظ التعديلات";

    const supplierInput = document.getElementById("invoice-supplier-input");
    const amountInput = document.getElementById("invoice-amount-input");
    const numberInput = document.getElementById("invoice-number-input");
    const categoryInput = document.getElementById("invoice-category-input");
    const dateInput = document.getElementById("invoice-date-input");
    const notesInput = document.getElementById("invoice-notes-input");

    if (supplierInput) supplierInput.value = inv.supplier || "";
    if (amountInput) amountInput.value = inv.amount !== undefined ? inv.amount : "";
    if (numberInput) numberInput.value = inv.invoiceNumber || "";
    if (categoryInput) categoryInput.value = inv.category || "خامات وبن";
    if (dateInput) {
      dateInput.value = inv.invoiceDate ? new Date(inv.invoiceDate).toISOString().split("T")[0] : "";
    }
    if (notesInput) notesInput.value = inv.notes || "";

    // Load existing invoice images into the multi-page preview
    this.pendingImages = (inv.images && inv.images.length > 0)
      ? [...inv.images]
      : (inv.imageData ? [inv.imageData] : []);
    this.pendingImageData = this.pendingImages[0] || "";
    this.activePreviewIndex = 0;
    this.renderInvoicePagesPreview();

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

  /**
   * View invoice by index in this.invoices
   */
  static viewInvoiceByData(idx) {
    const inv = this.invoices[idx];
    if (!inv) return;
    this.viewInvoiceFullImage(inv, inv.supplier || "فاتورة");
  }

  /**
   * Full screen invoice image gallery viewer (Supports single & multi-page invoices)
   */
  static viewInvoiceFullImage(imagesInput, title = "صورة الفاتورة") {
    let images = [];
    let invoiceObj = null;

    if (Array.isArray(imagesInput)) {
      images = imagesInput;
    } else if (typeof imagesInput === "object" && imagesInput !== null) {
      invoiceObj = imagesInput;
      images = (imagesInput.images && imagesInput.images.length > 0)
        ? imagesInput.images
        : (imagesInput.imageData ? [imagesInput.imageData] : []);
      title = imagesInput.supplier || title;
    } else if (typeof imagesInput === "string" && imagesInput) {
      images = [imagesInput];
    }

    if (images.length === 0) {
      window.ToastComponent.show("لا توجد صورة مسجلة لهذه الفاتورة", "info");
      return;
    }

    this.viewerInvoice = invoiceObj;
    this.viewerImages = images;
    this.viewerCurrentIndex = 0;
    this.viewerTitle = title;
    this.viewerActiveTab = window.innerWidth <= 960 ? "image" : "split";
    this.viewerItemsFilterPage = "all";

    this.renderViewerModal();
    this.resetZoom();
    window.ModalComponent.open("modal-full-invoice-image");
  }

  static renderViewerModal() {
    const modalImage = document.getElementById("full-invoice-modal-image");
    const modalTitleText = document.getElementById("full-invoice-modal-title-text");
    const downloadBtn = document.getElementById("btn-download-full-invoice");
    const galleryNav = document.getElementById("full-invoice-gallery-nav");
    const galleryCounter = document.getElementById("full-invoice-gallery-counter");
    const btnPrev = document.getElementById("btn-gallery-prev");
    const btnNext = document.getElementById("btn-gallery-next");
    const thumbnailsStrip = document.getElementById("full-invoice-thumbnails-strip");
    const itemsCountBadge = document.getElementById("viewer-items-count-badge");

    const total = this.viewerImages.length;
    const currentImg = this.viewerImages[this.viewerCurrentIndex] || "";
    const items = this.viewerInvoice?.items || [];

    if (itemsCountBadge) {
      itemsCountBadge.textContent = `${items.length} صنف`;
    }

    if (modalImage) modalImage.src = currentImg;
    if (modalTitleText) {
      modalTitleText.textContent = total > 1
        ? `${this.viewerTitle} (صفحة ${this.viewerCurrentIndex + 1} من ${total})`
        : this.viewerTitle;
    }

    if (downloadBtn) {
      downloadBtn.href = currentImg;
      downloadBtn.download = `فاتورة-${this.viewerTitle}-صفحة-${this.viewerCurrentIndex + 1}.jpg`;
    }

    if (total > 1) {
      if (galleryNav) galleryNav.style.display = "flex";
      if (galleryCounter) galleryCounter.textContent = `صفحة ${this.viewerCurrentIndex + 1} من ${total}`;
      if (btnPrev) btnPrev.disabled = this.viewerCurrentIndex === 0;
      if (btnNext) btnNext.disabled = this.viewerCurrentIndex === total - 1;

      if (thumbnailsStrip) {
        thumbnailsStrip.style.display = "flex";
        thumbnailsStrip.innerHTML = this.viewerImages.map((img, idx) => `
          <div class="invoice-page-chip ${idx === this.viewerCurrentIndex ? 'active' : ''}"
               onclick="window.AccountingComponent.selectViewerPage(${idx})"
               onmouseenter="window.AccountingComponent.showHoverPreview('${img}', 'صفحة ${idx + 1}', event)"
               onmouseleave="window.AccountingComponent.hideHoverPreview()"
               title="صفحة ${idx + 1}">
            <img src="${img}" alt="صفحة ${idx + 1}" />
            <span class="invoice-page-badge">ص ${idx + 1}</span>
          </div>
        `).join("");
      }
    } else {
      if (galleryNav) galleryNav.style.display = "none";
      if (thumbnailsStrip) thumbnailsStrip.style.display = "none";
    }

    this.updateViewerTabDisplay();
    this.renderViewerItemsTable();
    this.resetZoom();
  }

  static switchViewerTab(tab) {
    this.viewerActiveTab = tab;
    this.updateViewerTabDisplay();
  }

  static updateViewerTabDisplay() {
    const tab = this.viewerActiveTab;
    const mainContainer = document.getElementById("viewer-main-container");
    const imagePane = document.getElementById("viewer-image-pane");
    const itemsPane = document.getElementById("viewer-items-pane");

    const btnSplit = document.getElementById("btn-viewer-tab-split");
    const btnImage = document.getElementById("btn-viewer-tab-image");
    const btnItems = document.getElementById("btn-viewer-tab-items");

    [btnSplit, btnImage, btnItems].forEach(b => b && b.classList.remove("active"));

    if (tab === "split") {
      if (btnSplit) btnSplit.classList.add("active");
      if (mainContainer) {
        mainContainer.classList.add("split-mode");
        mainContainer.style.display = "grid";
      }
      if (imagePane) imagePane.style.display = "flex";
      if (itemsPane) itemsPane.style.display = "flex";
    } else if (tab === "image") {
      if (btnImage) btnImage.classList.add("active");
      if (mainContainer) {
        mainContainer.classList.remove("split-mode");
        mainContainer.style.display = "flex";
      }
      if (imagePane) imagePane.style.display = "flex";
      if (itemsPane) itemsPane.style.display = "none";
    } else if (tab === "items") {
      if (btnItems) btnItems.classList.add("active");
      if (mainContainer) {
        mainContainer.classList.remove("split-mode");
        mainContainer.style.display = "flex";
      }
      if (imagePane) imagePane.style.display = "none";
      if (itemsPane) itemsPane.style.display = "flex";
    }
  }

  static setViewerItemsPageFilter(page) {
    this.viewerItemsFilterPage = page;
    this.renderViewerItemsTable();
  }

  static renderViewerItemsTable() {
    const container = document.getElementById("viewer-items-pane");
    if (!container) return;

    const inv = this.viewerInvoice;
    const totalPages = this.viewerImages?.length || 1;

    if (!inv || (!inv.items || inv.items.length === 0) && !inv.amount) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-secondary); margin: auto;">
          <div style="font-size: 2.8rem; margin-bottom: 0.75rem;">🤖</div>
          <h4 style="color: var(--accent-gold); margin-bottom: 0.5rem; font-size: 1.1rem;">لم يتم فحص أصناف هذه الفاتورة بالذكاء الاصطناعي</h4>
          <p style="font-size: 0.85rem; line-height: 1.6; max-width: 420px; margin: 0 auto 1.25rem;">
            يمكنك فحص وقراءة كل الأصناف والكميات والأسعار الفردية والضرائب وعمود Tax Incl. تلقائياً من الصورة بدقة متناهية.
          </p>
          <button type="button" class="btn btn-primary" id="btn-viewer-scan-retroactive" onclick="window.AccountingComponent.scanCurrentViewerInvoice()" style="font-size: 0.88rem; padding: 0.6rem 1.25rem;">
            ✨ فحص واستخراج الأصناف بالـ AI الآن
          </button>
        </div>
      `;
      return;
    }

    const allItems = Array.isArray(inv.items) ? inv.items : [];
    const filter = this.viewerItemsFilterPage;

    const filteredItems = filter === "all"
      ? allItems
      : allItems.filter(it => (it.page || 1) === Number(filter));

    const allItemsSubtotal = allItems.reduce((s, it) => s + Number(it.totalPrice || (it.quantity * it.unitPrice) || 0), 0);
    const allItemsTaxInclSum = allItems.reduce((s, it) => {
      const explicit = Number(it.taxIncluded);
      if (explicit && !isNaN(explicit)) return s + explicit;
      const base = Number(it.totalPrice || (it.quantity * it.unitPrice) || 0);
      let rate = 0;
      if (it.taxType) {
        const m = String(it.taxType).match(/(\d+(?:\.\d+)?)\s*%/);
        if (m) rate = parseFloat(m[1]) / 100;
        else if (it.taxType.includes("VAT")) rate = 0.14;
        else if (it.taxType.includes("SCHD")) rate = 0.05;
      }
      return s + (base * (1 + rate));
    }, 0);

    const printedSubtotal = Number(inv.subtotal || 0);
    const printedAmount = Number(inv.amount || 0);

    const subtotal = printedSubtotal > 0 ? printedSubtotal : (allItems.length > 0 ? parseFloat(allItemsSubtotal.toFixed(2)) : 0);
    const amount = printedAmount > 0 ? printedAmount : (allItems.length > 0 ? parseFloat(allItemsTaxInclSum.toFixed(2)) : 0);
    const taxAmount = parseFloat((amount - subtotal).toFixed(2));

    let vat14 = Number(inv.taxDetails?.vat14 || 0);
    let schedule5 = Number(inv.taxDetails?.schedule5 || 0);

    if (allItems.length > 0 && Math.abs((vat14 + schedule5) - taxAmount) > 0.05) {
      let v14 = 0;
      let s5 = 0;
      allItems.forEach(it => {
        const base = Number(it.totalPrice || (it.quantity * it.unitPrice) || 0);
        const explicit = Number(it.taxIncluded);
        const incl = (explicit && !isNaN(explicit)) ? explicit : base;
        const itemTax = incl - base;
        if (itemTax > 0) {
          const t = String(it.taxType || "").toUpperCase();
          if (t.includes("14") || t.includes("VAT")) v14 += itemTax;
          else if (t.includes("5") || t.includes("SCHD")) s5 += itemTax;
        }
      });
      if (v14 > 0 || s5 > 0) {
        vat14 = parseFloat(v14.toFixed(2));
        schedule5 = parseFloat(s5.toFixed(2));
      }
    }

    const filteredSubtotal = filteredItems.reduce((s, it) => s + Number(it.totalPrice || (it.quantity * it.unitPrice) || 0), 0);
    const filteredTaxIncl = filteredItems.reduce((s, it) => {
      const explicit = Number(it.taxIncluded);
      if (explicit && !isNaN(explicit)) return s + explicit;
      let rate = 0;
      if (it.taxType) {
        const m = String(it.taxType).match(/(\d+(?:\.\d+)?)\s*%/);
        if (m) rate = parseFloat(m[1]) / 100;
        else if (it.taxType.includes("VAT")) rate = 0.14;
        else if (it.taxType.includes("SCHD")) rate = 0.05;
      }
      const base = Number(it.totalPrice || (it.quantity * it.unitPrice) || 0);
      return s + (base * (1 + rate));
    }, 0);

    // Page filter tabs
    let pageTabsHtml = "";
    if (totalPages > 1 || allItems.some(it => it.page > 1)) {
      const pageCounts = {};
      allItems.forEach(it => {
        const p = it.page || 1;
        pageCounts[p] = (pageCounts[p] || 0) + 1;
      });

      pageTabsHtml = `
        <div class="viewer-page-filter-bar">
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">📑 تصفية حسب الصفحة:</span>
          <button type="button" class="viewer-page-filter-btn ${filter === 'all' ? 'active' : ''}" onclick="window.AccountingComponent.setViewerItemsPageFilter('all')">
            كافة الصفحات (${allItems.length})
          </button>
          ${Array.from({ length: totalPages }, (_, i) => i + 1).map(p => `
            <button type="button" class="viewer-page-filter-btn ${filter === p ? 'active' : ''}" onclick="window.AccountingComponent.setViewerItemsPageFilter(${p})">
              ص ${p} (${pageCounts[p] || 0})
            </button>
          `).join("")}
        </div>
      `;
    }

    container.innerHTML = `
      <!-- Financial Totals Strip (Dynamic based on printed taxes) -->
      <div class="viewer-financial-strip">
        <div class="viewer-stat-box">
          <div class="viewer-stat-box-title">قبل الضريبة (Subtotal)</div>
          <div class="viewer-stat-box-val">${subtotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small style="font-size: 0.65rem;">ج.م</small></div>
        </div>
        ${vat14 > 0 ? `
        <div class="viewer-stat-box">
          <div class="viewer-stat-box-title">ضريبة ق.م 14% (VAT)</div>
          <div class="viewer-stat-box-val" style="color: var(--color-rose);">${vat14.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small style="font-size: 0.65rem;">ج.م</small></div>
        </div>` : ''}
        ${schedule5 > 0 ? `
        <div class="viewer-stat-box">
          <div class="viewer-stat-box-title">ضريبة جدول 5% (Schd)</div>
          <div class="viewer-stat-box-val" style="color: var(--color-rose);">${schedule5.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small style="font-size: 0.65rem;">ج.م</small></div>
        </div>` : ''}
        ${(vat14 === 0 && schedule5 === 0 && taxAmount > 0) ? `
        <div class="viewer-stat-box">
          <div class="viewer-stat-box-title">إجمالي الضريبة</div>
          <div class="viewer-stat-box-val" style="color: var(--color-rose);">${taxAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small style="font-size: 0.65rem;">ج.م</small></div>
        </div>` : ''}
        <div class="viewer-stat-box featured">
          <div class="viewer-stat-box-title" style="color: var(--accent-gold);">الإجمالي الشامل (Tax Incl.)</div>
          <div class="viewer-stat-box-val">${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small style="font-size: 0.65rem;">ج.م</small></div>
        </div>
      </div>

      ${pageTabsHtml}

      <!-- Items Table Wrapper with Tax Incl. Column -->
      <div class="viewer-table-wrapper">
        <table class="viewer-items-table">
          <thead>
            <tr>
              <th style="width: 28px; text-align: center;">#</th>
              ${totalPages > 1 ? '<th style="width: 38px; text-align: center;">ص</th>' : ''}
              <th>اسم الصنف</th>
              <th style="width: 48px; text-align: center;">الكمية</th>
              <th style="width: 75px; text-align: center;">سعر الوحدة</th>
              <th style="width: 70px; text-align: center;">الضريبة</th>
              <th style="width: 85px; text-align: center;">قبل الضريبة</th>
              <th style="width: 95px; text-align: left; color: var(--accent-gold);">شامل الضريبة (Tax Incl.)</th>
            </tr>
          </thead>
          <tbody>
            ${filteredItems.length > 0 ? filteredItems.map((it, idx) => {
      const baseTot = Number(it.totalPrice || it.total || (it.quantity * it.unitPrice) || 0);
      let rate = 0;
      if (it.taxType) {
        const m = String(it.taxType).match(/(\d+(?:\.\d+)?)\s*%/);
        if (m) rate = parseFloat(m[1]) / 100;
        else if (it.taxType.includes("VAT")) rate = 0.14;
        else if (it.taxType.includes("SCHD")) rate = 0.05;
      }
      const incl = Number(it.taxIncluded) && !isNaN(Number(it.taxIncluded))
        ? Number(it.taxIncluded)
        : (baseTot * (1 + rate));

      return `
                <tr>
                  <td style="text-align: center; color: var(--text-muted); font-size: 0.72rem;">${idx + 1}</td>
                  ${totalPages > 1 ? `<td style="text-align: center; font-size: 0.72rem; color: var(--accent-gold);">ص ${it.page || 1}</td>` : ''}
                  <td style="font-weight: 600; color: var(--text-primary);">${it.name || "صنف"}</td>
                  <td class="num" style="text-align: center;">${it.quantity || 1}</td>
                  <td class="num" style="text-align: center;">${Number(it.unitPrice || it.price || 0).toFixed(2)}</td>
                  <td style="text-align: center;">
                    <span style="font-size: 0.68rem; background: rgba(245,158,11,0.12); color: var(--accent-gold); padding: 1px 5px; border-radius: 3px; border: 1px solid rgba(245,158,11,0.25);">
                      ${it.taxType || "SCHD 5%"}
                    </span>
                  </td>
                  <td class="num" style="text-align: center; color: var(--text-secondary);">${baseTot.toFixed(2)}</td>
                  <td class="total" style="text-align: left;">${incl.toFixed(2)} <small style="font-size: 0.65rem; color: var(--text-muted);">ج.م</small></td>
                </tr>
              `;
    }).join("") : `
              <tr>
                <td colspan="${totalPages > 1 ? 8 : 7}" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">
                  لا توجد أصناف في الصفحة المحددة.
                </td>
              </tr>
            `}
          </tbody>
          <tfoot>
            <tr style="background: rgba(255,255,255,0.06); font-weight: 800;">
              <td colspan="${totalPages > 1 ? 3 : 2}" style="padding: 0.5rem 0.6rem; color: var(--accent-gold);">
                مجموع الأصناف (${filteredItems.length} صنف):
              </td>
              <td class="num" style="text-align: center; color: var(--text-primary);">
                ${filteredItems.reduce((q, it) => q + (Number(it.quantity) || 1), 0)}
              </td>
              <td></td>
              <td></td>
              <td class="num" style="text-align: center; color: var(--text-primary); font-size: 0.88rem;">
                ${filteredSubtotal.toFixed(2)}
              </td>
              <td class="total" style="text-align: left; font-size: 0.98rem;">
                ${filteredTaxIncl.toFixed(2)} <small style="font-size: 0.7rem;">ج.م</small>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  static async scanCurrentViewerInvoice() {
    const inv = this.viewerInvoice;
    if (!inv) return;
    const images = (inv.images && inv.images.length > 0) ? inv.images : (inv.imageData ? [inv.imageData] : []);
    if (images.length === 0) {
      window.ToastComponent.show("لا توجد صورة لفحصها", "warning");
      return;
    }

    const btn = document.getElementById("btn-viewer-scan-retroactive");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "⚡ جاري الفحص واستخراج الأصناف بالـ AI...";
    }

    const apiKey = (typeof localStorage !== "undefined" ? (localStorage.getItem("GEMINI_API_KEY") || localStorage.getItem("moka_gemini_api_key")) : "") || "";

    try {
      let res;
      try {
        res = await this.api.scanInvoice(images, apiKey);
      } catch (e) {
        if (apiKey) {
          res = await this.scanWithGeminiDirect(images, apiKey);
        } else {
          throw e;
        }
      }

      if (res && res.success && res.data) {
        const d = res.data;
        inv.items = d.items || [];
        inv.subtotal = d.subtotal || 0;
        inv.taxAmount = d.taxAmount || 0;
        inv.taxDetails = d.taxDetails || { vat14: 0, schedule5: 0 };
        inv.amount = d.amount || inv.amount;
        inv.pageBreakdown = d.pageBreakdown || [];

        // Save update to server and local backup
        const id = inv._id || inv.id;
        if (id && !String(id).startsWith("local-")) {
          await this.api.updateInvoice(id, {
            items: inv.items,
            subtotal: inv.subtotal,
            taxAmount: inv.taxAmount,
            taxDetails: inv.taxDetails,
            amount: inv.amount,
            pageBreakdown: inv.pageBreakdown
          });
        }

        const backup = this.loadLocalBackup(this.currentMonth);
        const idx = backup.invoices.findIndex(item => (item._id || item.id) === id);
        if (idx !== -1) {
          backup.invoices[idx] = { ...backup.invoices[idx], ...inv };
          this.saveLocalBackup(this.currentMonth, backup);
        }

        this.renderViewerItemsTable();
        this.render();
        window.ToastComponent.show(`✨ تم استخراج ${inv.items.length} صنف وحساب الضرائب بنجاح!`, "success");
      }
    } catch (err) {
      window.ToastComponent.show("فشل الفحص: " + err.message, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  static galleryNext() {
    if (this.viewerCurrentIndex < this.viewerImages.length - 1) {
      this.viewerCurrentIndex++;
      this.viewerItemsFilterPage = this.viewerCurrentIndex + 1;
      this.renderViewerModal();
    }
  }

  static galleryPrev() {
    if (this.viewerCurrentIndex > 0) {
      this.viewerCurrentIndex--;
      this.viewerItemsFilterPage = this.viewerCurrentIndex + 1;
      this.renderViewerModal();
    }
  }

  static selectViewerPage(idx) {
    if (idx >= 0 && idx < this.viewerImages.length) {
      this.viewerCurrentIndex = idx;
      this.viewerItemsFilterPage = idx + 1;
      this.renderViewerModal();
    }
  }

  // ================= Zoom & Pan Controls =================
  static applyZoomTransform(animate = false) {
    const content = document.getElementById("invoice-zoom-content");
    const badge = document.getElementById("zoom-level-badge");
    const viewport = document.getElementById("invoice-zoom-viewport");

    if (content) {
      content.style.transition = animate ? "transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
      content.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomScale}) rotate(${this.rotation}deg)`;
    }

    if (badge) {
      badge.textContent = Math.round(this.zoomScale * 100) + "%";
    }

    if (viewport) {
      viewport.style.cursor = this.zoomScale > 1 ? (this.isDragging ? "grabbing" : "grab") : "zoom-in";
    }
  }

  static zoomIn() {
    this.setZoomLevel(Math.min(10, this.zoomScale * 1.35));
  }

  static zoomOut() {
    this.setZoomLevel(Math.max(0.5, this.zoomScale / 1.35));
  }

  static setZoomLevel(level) {
    this.zoomScale = Math.max(0.5, Math.min(10, level));
    if (this.zoomScale <= 1) {
      this.panX = 0;
      this.panY = 0;
    }
    this.applyZoomTransform(true);
  }

  static resetZoom() {
    this.zoomScale = 1;
    this.panX = 0;
    this.panY = 0;
    this.rotation = 0;
    this.applyZoomTransform(true);
  }

  static rotateImage() {
    this.rotation = (this.rotation + 90) % 360;
    this.applyZoomTransform(true);
  }

  // ================= Hover Zoom Preview Popup =================
  static showHoverPreview(imgUrl, caption, event) {
    if (!imgUrl) return;
    const card = document.getElementById("invoice-hover-preview-card");
    const img = document.getElementById("invoice-hover-preview-img");
    const cap = document.getElementById("invoice-hover-preview-caption");
    if (!card || !img) return;

    img.src = imgUrl;
    if (cap) cap.textContent = caption || "معاينة الفاتورة";

    const targetRect = event.currentTarget.getBoundingClientRect();
    let left = targetRect.left + targetRect.width / 2;
    let top = targetRect.top - 8;

    // Boundary check so tooltip does not overflow viewport edges
    if (top < 380) {
      top = targetRect.bottom + 16;
      card.style.transform = "translate(-50%, 0)";
    } else {
      card.style.transform = "translate(-50%, -100%)";
    }

    if (left < 150) left = 150;
    if (left > window.innerWidth - 150) left = window.innerWidth - 150;

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.display = "block";
  }

  static hideHoverPreview() {
    const card = document.getElementById("invoice-hover-preview-card");
    if (card) card.style.display = "none";
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

    // Ensure we collect ALL uploaded images for multi-page invoices
    const imagesToSave = (this.pendingImages && this.pendingImages.length > 0)
      ? [...this.pendingImages]
      : (this.pendingImageData ? [this.pendingImageData] : []);

    const existingInv = this.editingInvoiceId ? this.invoices.find(item => (item._id || item.id) === this.editingInvoiceId) : null;
    const auditData = this.scannedAuditData || {};

    const invoiceData = {
      supplier,
      amount,
      subtotal: auditData.subtotal !== undefined ? auditData.subtotal : (existingInv?.subtotal || 0),
      taxAmount: auditData.taxAmount !== undefined ? auditData.taxAmount : (existingInv?.taxAmount || 0),
      taxDetails: auditData.taxDetails || existingInv?.taxDetails || { vat14: 0, schedule5: 0 },
      items: Array.isArray(auditData.items) && auditData.items.length > 0 ? auditData.items : (existingInv?.items || []),
      pageBreakdown: Array.isArray(auditData.pageBreakdown) && auditData.pageBreakdown.length > 0 ? auditData.pageBreakdown : (existingInv?.pageBreakdown || []),
      invoiceNumber: numberInput?.value.trim() || "",
      category: categoryInput?.value || "خامات وبن",
      invoiceDate: dateInput?.value || new Date().toISOString(),
      imageData: imagesToSave[0] || "",
      images: imagesToSave,
      pageCount: imagesToSave.length || 1,
      notes: notesInput?.value.trim() || ""
    };

    const submitBtn = document.getElementById("btn-submit-invoice");
    const submitBtnText = document.getElementById("btn-submit-invoice-text");
    if (submitBtn) {
      submitBtn.disabled = true;
      if (submitBtnText) submitBtnText.textContent = "جاري الحفظ...";
      else submitBtn.textContent = "جاري الحفظ...";
    }

    try {
      if (this.editingInvoiceId) {
        // Edit mode
        try {
          await this.api.updateInvoice(this.editingInvoiceId, invoiceData);
        } catch (apiErr) {
          // Local fallback
          const backup = this.loadLocalBackup(this.currentMonth);
          const idx = backup.invoices.findIndex(item => (item._id || item.id) === this.editingInvoiceId);
          if (idx !== -1) {
            backup.invoices[idx] = { ...backup.invoices[idx], ...invoiceData };
            this.saveLocalBackup(this.currentMonth, backup);
          }
        }
        window.ModalComponent.close("modal-add-invoice");
        window.ToastComponent.show(`تم حفظ تعديلات فاتورة "${supplier}" بنجاح!`, "success");
      } else {
        // Add mode
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
        const countTxt = imagesToSave.length > 1 ? ` (${imagesToSave.length} صفحات)` : "";
        window.ToastComponent.show(`تمت إضافة فاتورة "${supplier}" بمبلغ ${window.formatCurrency ? window.formatCurrency(amount) : amount} ج.م بنجاح!${countTxt}`, "success");
      }

      this.editingInvoiceId = null;

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
        if (submitBtnText) {
          submitBtnText.textContent = this.editingInvoiceId ? "💾 حفظ التعديلات" : "💾 حفظ الفاتورة";
        } else {
          submitBtn.textContent = this.editingInvoiceId ? "💾 حفظ التعديلات" : "💾 حفظ الفاتورة";
        }
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
      const hasImg = !!inv.imageData || (inv.images && inv.images.length > 0);
      const pageCount = (inv.images && inv.images.length) || inv.pageCount || 1;
      const displayImg = (inv.images && inv.images[0]) || inv.imageData;

      return `
        <tr>
          <td style="font-weight: 600; color: var(--text-muted); text-align: center;">${idx + 1}</td>
          <td>
            ${hasImg ? `
              <div class="invoice-thumb-preview"
                   onclick="window.AccountingComponent.viewInvoiceByData(${idx})"
                   onmouseenter="window.AccountingComponent.showHoverPreview('${displayImg}', '${(inv.supplier || "فاتورة").replace(/'/g, "\\'")}', event)"
                   onmouseleave="window.AccountingComponent.hideHoverPreview()"
                   title="اضغط للتكبير وعمل زوم للفاتورة">
                <img src="${displayImg}" alt="صورة الفاتورة" />
                <span class="thumb-zoom-icon">🔍</span>
                ${pageCount > 1 ? `<span class="invoice-pages-pill">${pageCount} ص</span>` : ''}
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
          <td style="text-align: center; white-space: nowrap;">
            <button class="btn-icon" onclick="window.AccountingComponent.viewInvoiceByData(${idx})" title="استعراض الفاتورة والأصناف المستخرجة بالذكاء الاصطناعي" style="border: none; color: var(--color-sky); font-size: 1.05rem; margin-left: 0.25rem; background: transparent; cursor: pointer; padding: 0.35rem 0.45rem; border-radius: var(--radius-sm); transition: var(--transition);">
              👁️
            </button>
            <button class="btn-icon" onclick="window.AccountingComponent.openEditInvoiceModal('${id}')" title="تعديل بيانات الفاتورة" style="border: none; color: var(--accent-gold); font-size: 1rem; margin-left: 0.25rem; background: transparent; cursor: pointer; padding: 0.35rem 0.45rem; border-radius: var(--radius-sm); transition: var(--transition);">
              ✏️
            </button>
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

