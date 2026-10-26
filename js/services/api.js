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
