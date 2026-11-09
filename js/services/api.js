/**
 * Móka Billing ERP - API Service Client
 * Handles HTTP requests, JSON parsing, and unified error handling.
 */

class ApiService {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || this.determineBaseUrl();
  }

  determineBaseUrl() {
    if (typeof window !== "undefined" && window.ENV_API_URL) {
      return window.ENV_API_URL;
    }
    if (typeof localStorage !== "undefined" && localStorage.getItem("MOKA_API_URL")) {
      return localStorage.getItem("MOKA_API_URL");
    }
    if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
      if (window.location.port && window.location.port !== "5000") {
        return "http://localhost:5000/api";
      }
    }
    return "/api";
  }

  setBaseUrl(newUrl) {
    this.baseUrl = (newUrl || "/api").trim().replace(/\/$/, "");
    if (typeof localStorage !== "undefined") {
      if (newUrl && newUrl !== "/api") {
        localStorage.setItem("MOKA_API_URL", this.baseUrl);
      } else {
        localStorage.removeItem("MOKA_API_URL");
      }
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        let errorMessage = `تعذر تنفيذ الطلب (${response.status})`;
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errorMessage = errData.error;
          }
        } catch (_) {
          // Response is not JSON
        }
        const error = new Error(errorMessage);
        error.status = response.status;
        throw error;
      }

      if (response.status === 204) {
        return null;
      }

      return await response.json();
    } catch (err) {
      console.error(`[API Error] ${options.method || 'GET'} ${url}:`, err.message);
      throw err;
    }
  }

  // Items endpoints
  getItems(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/items${query ? `?${query}` : ''}`);
  }

  getItemById(id) {
    return this.request(`/items/${id}`);
  }

  createItem(itemData) {
    return this.request("/items", {
      method: "POST",
      body: JSON.stringify(itemData)
    });
  }

  updateItem(id, itemData) {
    return this.request(`/items/${id}`, {
      method: "PUT",
      body: JSON.stringify(itemData)
    });
  }

  deleteItem(id) {
    return this.request(`/items/${id}`, {
      method: "DELETE"
    });
  }

  // Orders endpoints
  getOrders() {
    return this.request("/orders");
  }

  getOrderById(id) {
    return this.request(`/orders/${id}`);
  }

  getOrderSummary(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/orders/summary${query ? `?${query}` : ''}`);
  }

  parseOrderText(text) {
    return this.request("/orders/parse", {
      method: "POST",
      body: JSON.stringify({ text })
    });
  }

  calculateOrder(items, consolidate = false) {
    return this.request("/orders/calculate", {
      method: "POST",
      body: JSON.stringify({ items, consolidate })
    });
  }

  createOrder(orderData) {
    return this.request("/orders", {
      method: "POST",
      body: JSON.stringify(orderData)
    });
  }

  updateOrder(id, orderData) {
    return this.request(`/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(orderData)
    });
  }

  deleteOrder(id) {
    return this.request(`/orders/${id}`, {
      method: "DELETE"
    });
  }

  // Accounting & Monthly P&L
  getAccountingSummary(month) {
    const query = month ? `?month=${encodeURIComponent(month)}` : "";
    return this.request(`/accounting/summary${query}`);
  }

  getInvoices(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/accounting/invoices${query ? `?${query}` : ""}`);
  }

  createInvoice(data) {
    return this.request("/accounting/invoices", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  scanInvoice(imageInput, customApiKey, signal) {
    const key = customApiKey || (typeof localStorage !== "undefined" ? localStorage.getItem("GEMINI_API_KEY") : "");
    const headers = {};
    if (key) {
      headers["x-gemini-api-key"] = key;
    }
    const isArray = Array.isArray(imageInput);
    const bodyData = {
      apiKey: key,
      imageData: isArray ? (imageInput[0] || "") : imageInput,
      images: isArray ? imageInput : (imageInput ? [imageInput] : [])
    };
    return this.request("/accounting/invoices/scan", {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify(bodyData)
    });
  }

  updateInvoice(id, data) {
    return this.request(`/accounting/invoices/${id}`, {
      method: "PUT",
      body: JSON.stringify(data)
    });
  }

  deleteInvoice(id) {
    return this.request(`/accounting/invoices/${id}`, {
      method: "DELETE"
    });
  }

  getWasteRecords(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/accounting/waste${query ? `?${query}` : ""}`);
  }

  createWasteRecord(data) {
    return this.request("/accounting/waste", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  deleteWasteRecord(id) {
    return this.request(`/accounting/waste/${id}`, {
      method: "DELETE"
    });
  }

  getSalesRecords(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/accounting/sales${query ? `?${query}` : ""}`);
  }

  createSalesRecord(data) {
    return this.request("/accounting/sales", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }

  deleteSalesRecord(id) {
    return this.request(`/accounting/sales/${id}`, {
      method: "DELETE"
    });
  }

  // ==================== Inventory & Expiry Endpoints ====================
  getInventoryOverview(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/inventory${query ? `?${query}` : ""}`);
  }

  importInventoryInitial(payload = {}) {
    return this.request("/inventory/import-initial", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  importInventoryWaste(payload = {}) {
    return this.request("/inventory/import-waste", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  importIncomingGoods(payload = {}) {
    return this.request("/inventory/import-incoming", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  deductExpiredGoods(payload = {}) {
    return this.request("/inventory/deduct-expired", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  adjustInventoryStock(payload) {
    return this.request("/inventory/adjust", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  getInventoryMovements(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/inventory/movements${query ? `?${query}` : ""}`);
  }

  syncLocalInventorySheets() {
    return this.request("/inventory/sync-local-sheets", {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  // System
  getHealth() {
    return this.request("/health");
  }
}

// Global instance
const api = new ApiService();

if (typeof window !== "undefined") {
  window.ApiService = ApiService;
  window.api = api;
  window.apiRequest = (url, opts) => api.request(url, opts);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ApiService, api };
}
