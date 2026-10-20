/**
 * Core Application Controller for Invoice Tracker & Accounting.
 * Handles state, routing, dynamic views, forms, fast search, and API communication.
 */

const App = {
  currentView: "dashboard",
  selectedCustomerId: null,
  settings: {},
  customers: [],
  products: [],
  invoices: [],
  activeInvoiceFilter: "all",
  activeReportsPeriod: "all",

  async init() {
    // Load theme & language
    const savedTheme = localStorage.getItem("app_theme") || "dark";
    this.setTheme(savedTheme);

    const savedLang = localStorage.getItem("app_language") || "ar";
    setLanguage(savedLang);

    // Bind navigation & shortcuts
    this.bindEvents();

    // Fetch settings and initialize
    await this.loadSettings();
    await this.loadProducts();
    await this.loadCustomers();

    // Render active view
    this.navigate("dashboard");

    // Global expose
    window.renderActiveView = () => this.renderActiveView();
  },

  bindEvents() {
    // Nav links
    document.querySelectorAll(".nav-link").forEach(btn => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        if (view) this.navigate(view);
      });
    });

    // Theme toggle
    document.getElementById("theme-toggle-btn").addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      this.setTheme(current === "dark" ? "light" : "dark");
    });

    // Language toggle
    document.getElementById("lang-toggle-btn").addEventListener("click", () => {
      const nextLang = currentLanguage === "ar" ? "en" : "ar";
      setLanguage(nextLang);
      document.getElementById("lang-label").textContent = nextLang === "ar" ? "English" : "العربية";
      this.renderActiveView();
    });

    // Quick New Invoice
    document.getElementById("btn-quick-new-invoice").addEventListener("click", () => {
      this.openInvoiceModal();
    });

    // Fast Global Search
    const searchInput = document.getElementById("global-search-input");
    let searchTimeout = null;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();
      if (!query) {
        document.getElementById("search-results-dropdown").classList.remove("active");
        return;
      }
      searchTimeout = setTimeout(() => this.executeFastSearch(query), 150);
    });

    // Close search dropdown on click outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".header-search-wrapper")) {
        document.getElementById("search-results-dropdown").classList.remove("active");
      }
    });

    // Keyboard Shortcuts: Ctrl+K or / to search, Esc to close modals
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey && e.key.toLowerCase() === "k") || (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA")) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      } else if (e.key === "Escape") {
        this.closeModals();
        document.getElementById("search-results-dropdown").classList.remove("active");
      }
    });
  },

  setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("app_theme", theme);
  },

  async loadSettings() {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success) {
        this.settings = data.settings || {};
        window.appCurrencySymbol = this.settings.currency_symbol || (currentLanguage === "ar" ? "ر.س" : "SAR");

        // Show/hide inventory nav button based on setting
        const invBtn = document.getElementById("nav-inventory-btn");
        if (this.settings.inventory_mode === "true") {
          invBtn.style.display = "flex";
        } else {
          invBtn.style.display = "none";
        }
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  },

  async loadCustomers() {
    try {
      const res = await fetch("/api/customers");
      const data = await res.json();
      if (data.success) {
        this.customers = data.customers || [];
      }
    } catch (e) {
      console.error("Failed to load customers:", e);
    }
  },

  async loadProducts() {
    try {
      const res = await fetch("/api/products");
      const data = await res.json();
      if (data.success) {
        this.products = data.products || [];
      }
    } catch (e) {
      console.error("Failed to load products:", e);
    }
  },

  navigate(view, param = null) {
    this.currentView = view;
    if (param && view === "customer_detail") {
      this.selectedCustomerId = param;
    }

    // Update active nav button
    document.querySelectorAll(".nav-menu .nav-link").forEach(btn => {
      if (btn.getAttribute("data-view") === view) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    this.renderActiveView();
  },

  renderActiveView() {
    const container = document.getElementById("view-container");
    container.innerHTML = "";

    switch (this.currentView) {
      case "dashboard":
        this.renderDashboard(container);
        break;
      case "invoices":
        this.renderInvoices(container);
        break;
      case "customers":
        this.renderCustomers(container);
        break;
      case "customer_detail":
        this.renderCustomerDetail(container, this.selectedCustomerId);
        break;
      case "inventory":
        this.renderInventory(container);
        break;
      case "reports":
        this.renderReports(container);
        break;
      case "settings":
        this.renderSettings(container);
        break;
      default:
        this.renderDashboard(container);
    }
  },

  showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type === 'danger' ? 'text-danger' : 'text-success'}`;
    toast.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  },

  closeModals() {
    document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active", "print-active"));
  },

  // ========================== FAST SEARCH ==========================

  async executeFastSearch(query) {
    const dropdown = document.getElementById("search-results-dropdown");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!data.success) return;

      const { customers, invoices, products } = data;
      if (customers.length === 0 && invoices.length === 0 && products.length === 0) {
        dropdown.innerHTML = `<div class="p-3 text-muted text-xs text-center">${t("noRecordsFound")}</div>`;
        dropdown.classList.add("active");
        return;
      }

      let html = "";

      if (customers.length > 0) {
        html += `<div class="search-category-header">${t("navCustomers")}</div>`;
        customers.forEach(c => {
          html += `
            <div class="search-item" onclick="App.openCustomerDashboard(${c.id})">
              <div class="search-item-info">
                <span class="search-item-title">${c.name}</span>
                <span class="search-item-meta">${c.phone || ""} ${c.email ? "• " + c.email : ""}</span>
              </div>
              <span class="badge badge-secondary">${t("customer")}</span>
            </div>
          `;
        });
      }

      if (invoices.length > 0) {
        html += `<div class="search-category-header">${t("navInvoices")}</div>`;
        invoices.forEach(i => {
          html += `
            <div class="search-item" onclick="App.previewInvoice(${i.id})">
              <div class="search-item-info">
                <span class="search-item-title">${i.invoice_number} - ${i.customer_name}</span>
                <span class="search-item-meta">${i.issue_date} • ${formatCurrency(i.total_amount)}</span>
              </div>
              <span class="badge badge-${i.status === 'paid' ? 'success' : (i.status === 'partial' ? 'warning' : 'danger')}">${i.status}</span>
            </div>
          `;
        });
      }

      if (products.length > 0) {
        html += `<div class="search-category-header">${t("navInventory")}</div>`;
        products.forEach(p => {
          html += `
            <div class="search-item" onclick="App.openRestockModal(${p.id}, '${p.name.replace(/'/g, "\\'")}')">
              <div class="search-item-info">
                <span class="search-item-title">${p.name}</span>
                <span class="search-item-meta">SKU: ${p.sku || "-"} • ${t("stockQuantity")}: ${p.stock_quantity}</span>
              </div>
              <span class="badge badge-secondary">${formatCurrency(p.unit_price)}</span>
            </div>
          `;
        });
      }

      dropdown.innerHTML = html;
      dropdown.classList.add("active");
    } catch (e) {
      console.error("Fast search error:", e);
    }
  },

  // ========================== DASHBOARD VIEW ==========================

  async renderDashboard(container) {
    container.innerHTML = `<div class="p-4 text-center text-muted">${t("searchPlaceholder")}...</div>`;

    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (!data.success) return;

      const { summary, histogram, pie_charts } = data;

      // Update sidebar quick profit
      document.getElementById("sidebar-total-profit").textContent = formatCurrency(summary.total_profit);

      // Check future orders
      const invRes = await fetch("/api/invoices");
      const invData = await invRes.json();
      const allInvoices = invData.invoices || [];
      const todayStr = new Date().toISOString().split("T")[0];
      const futureOrders = allInvoices.filter(i => i.issue_date > todayStr || (i.due_date > todayStr && i.status !== "paid" && i.status !== "cancelled"));

      let futureAlertHtml = "";
      if (futureOrders.length > 0) {
        futureAlertHtml = `
          <div style="background: var(--primary-light); border: 1px solid var(--primary); border-radius: var(--radius-md); padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-primary">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span><strong>${t("futureOrdersAlert")}:</strong> ${futureOrders.length} ${currentLanguage === 'ar' ? 'طلبات قادمة تحتاج إلى متابعة وتجهيز' : 'scheduled future orders require preparation.'}</span>
            </div>
            <button class="btn-secondary" style="height: 30px; font-size: 12px;" onclick="App.navigate('invoices')">${t("view")}</button>
          </div>
        `;
      }

      container.innerHTML = `
        <div class="view-header">
          <div>
            <h2 data-i18n="navDashboard">${t("navDashboard")}</h2>
            <p data-i18n="appSubtitle">${t("appSubtitle")}</p>
          </div>
          <button class="btn-primary" onclick="App.openInvoiceModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span data-i18n="newInvoice">${t("newInvoice")}</span>
          </button>
        </div>

        ${futureAlertHtml}

        <!-- 6 KPI Metric Cards -->
        <div class="metrics-grid">
          <div class="metric-card card-accent-primary">
            <div class="metric-card-top">
              <span class="metric-card-label" data-i18n="totalRevenue">${t("totalRevenue")}</span>
              <div class="metric-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="1" x2="12" y2="23"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
              </div>
            </div>
            <span class="metric-card-value">${formatCurrency(summary.total_revenue)}</span>
            <span class="metric-card-sub">${summary.total_invoices} ${t("totalOrders")}</span>
          </div>

          <div class="metric-card card-accent-profit">
            <div class="metric-card-top">
              <span class="metric-card-label" data-i18n="netProfit">${t("netProfit")}</span>
              <div class="metric-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                  <polyline points="17 6 23 6 23 12"></polyline>
                </svg>
              </div>
            </div>
            <span class="metric-card-value">${formatCurrency(summary.total_profit)}</span>
            <span class="metric-card-sub">${t("profitMargin")}: <strong>${summary.margin_pct}%</strong></span>
          </div>

          <div class="metric-card">
            <div class="metric-card-top">
              <span class="metric-card-label" data-i18n="totalCost">${t("totalCost")}</span>
              <div class="metric-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                </svg>
              </div>
            </div>
            <span class="metric-card-value">${formatCurrency(summary.total_cost)}</span>
            <span class="metric-card-sub">${t("cogs")}</span>
          </div>

          <div class="metric-card card-accent-loss">
            <div class="metric-card-top">
              <span class="metric-card-label" data-i18n="totalUnpaid">${t("totalUnpaid")}</span>
              <div class="metric-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
            </div>
            <span class="metric-card-value">${formatCurrency(summary.total_unpaid)}</span>
            <span class="metric-card-sub">${t("paidAmount")}: ${formatCurrency(summary.total_paid)}</span>
          </div>

          <div class="metric-card">
            <div class="metric-card-top">
              <span class="metric-card-label" data-i18n="activeCustomers">${t("activeCustomers")}</span>
              <div class="metric-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                </svg>
              </div>
            </div>
            <span class="metric-card-value">${summary.customer_count}</span>
            <span class="metric-card-sub"><a href="#" onclick="App.navigate('customers'); return false;" style="color: var(--primary); text-decoration: none;">${t("view")}</a></span>
          </div>

          <div class="metric-card">
            <div class="metric-card-top">
              <span class="metric-card-label" data-i18n="averageOrder">${t("averageOrder")}</span>
              <div class="metric-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"></path>
                  <line x1="12" y1="6" x2="12" y2="8"></line>
                  <line x1="12" y1="16" x2="12" y2="18"></line>
                </svg>
              </div>
            </div>
            <span class="metric-card-value">${formatCurrency(summary.total_invoices > 0 ? (summary.total_revenue / summary.total_invoices) : 0)}</span>
            <span class="metric-card-sub">${summary.total_invoices} ${t("totalOrders")}</span>
          </div>
        </div>

        <!-- Charts Grid (Histogram & Donut) -->
        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-card-header">
              <span class="chart-card-title">${t("financialPerformance")}</span>
              <div style="display: flex; gap: 12px; font-size: 11px;">
                <span style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 10px; height: 10px; background: #3B82F6; border-radius: 2px;"></span>
                  ${t("totalRevenue")}
                </span>
                <span style="display: flex; align-items: center; gap: 4px;">
                  <span style="width: 10px; height: 10px; background: #10B981; border-radius: 2px;"></span>
                  ${t("netProfit")}
                </span>
              </div>
            </div>
            <div class="chart-canvas-wrapper">
              <canvas id="dashboard-histogram-canvas"></canvas>
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-card-header">
              <span class="chart-card-title">${t("profitVsCost")}</span>
            </div>
            <div class="chart-canvas-wrapper">
              <canvas id="dashboard-donut-canvas"></canvas>
            </div>
          </div>
        </div>

        <!-- Recent Invoices Table -->
        <div class="table-card">
          <div class="table-toolbar">
            <h3 style="font-size: 15px; font-weight: 700;">${t("recentOrders")}</h3>
            <button class="btn-secondary" style="height: 30px; font-size: 12px;" onclick="App.navigate('invoices')">${t("statusAll")}</button>
          </div>
          <div class="data-table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>${t("invoiceNumber")}</th>
                  <th>${t("customer")}</th>
                  <th>${t("issueDate")}</th>
                  <th>${t("totalAmount")}</th>
                  <th>${t("netProfit")}</th>
                  <th>${t("status")}</th>
                  <th style="text-align: end;">${t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                ${this.renderInvoiceRows(allInvoices.slice(0, 6))}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Draw Charts after DOM insertion
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const tooltip = document.getElementById("chart-tooltip");

      const histCanvas = document.getElementById("dashboard-histogram-canvas");
      MiniChartEngine.renderHistogram(histCanvas, histogram, {
        isDark,
        onHover: (d, x, y) => {
          tooltip.style.display = "block";
          tooltip.style.left = `${x + 12}px`;
          tooltip.style.top = `${y - 20}px`;
          tooltip.innerHTML = `
            <strong>${d.month_label}</strong><br/>
            ${t("totalRevenue")}: ${formatCurrency(d.revenue)}<br/>
            ${t("netProfit")}: <span style="color: #10B981">${formatCurrency(d.profit)}</span><br/>
            ${t("totalOrders")}: ${d.order_count}
          `;
        },
        onLeave: () => { tooltip.style.display = "none"; }
      });

      const donutCanvas = document.getElementById("dashboard-donut-canvas");
      MiniChartEngine.renderDonut(donutCanvas, pie_charts.profit_cost, {
        isDark,
        centerLabel: t("profitMargin"),
        centerValue: `${summary.margin_pct}%`,
        onHover: (item, pct, x, y) => {
          tooltip.style.display = "block";
          tooltip.style.left = `${x + 12}px`;
          tooltip.style.top = `${y - 20}px`;
          tooltip.innerHTML = `
            <strong>${currentLanguage === 'ar' ? (item.label_ar || item.label) : item.label}</strong><br/>
            ${formatCurrency(item.value)} (${pct}%)
          `;
        },
        onLeave: () => { tooltip.style.display = "none"; }
      });

    } catch (e) {
      console.error("Dashboard render error:", e);
    }
  },

  renderInvoiceRows(invoices) {
    if (!invoices || invoices.length === 0) {
      return `<tr><td colspan="7" class="text-center text-muted" style="padding: 24px;">${t("noRecordsFound")}</td></tr>`;
    }

    return invoices.map(i => {
      const badgeClass = {
        paid: "badge-success",
        partial: "badge-warning",
        pending: "badge-danger",
        draft: "badge-secondary",
        cancelled: "badge-muted"
      }[i.status] || "badge-secondary";

      const statusText = {
        paid: t("statusPaid"),
        partial: t("statusPartial"),
        pending: t("statusPending"),
        draft: t("statusDraft"),
        cancelled: t("statusCancelled")
      }[i.status] || i.status;

      return `
        <tr>
          <td>
            <a href="#" onclick="App.previewInvoice(${i.id}); return false;" style="font-weight: 700; color: var(--primary); text-decoration: none;">
              ${i.invoice_number}
            </a>
          </td>
          <td>
            <a href="#" onclick="App.openCustomerDashboard(${i.customer_id}); return false;" style="font-weight: 600; color: var(--text-main); text-decoration: none;">
              ${i.customer_name}
            </a>
          </td>
          <td class="text-muted">${i.issue_date}</td>
          <td class="font-bold">${formatCurrency(i.total_amount)}</td>
          <td class="text-success font-semibold">${formatCurrency(i.net_profit)}</td>
          <td><span class="badge ${badgeClass}">${statusText}</span></td>
          <td style="text-align: end; white-space: nowrap;">
            <button class="btn-secondary" style="height: 28px; padding: 0 8px; font-size: 11px; display: inline-flex;" onclick="App.previewInvoice(${i.id})" title="${t('view')}">
              ${t('view')}
            </button>
            <button class="btn-secondary" style="height: 28px; padding: 0 8px; font-size: 11px; display: inline-flex;" onclick="App.openEditInvoiceModal(${i.id})" title="${t('edit')}">
              ${t('edit')}
            </button>
            ${i.status !== 'paid' && i.status !== 'cancelled' ? `
              <button class="btn-primary" style="height: 28px; padding: 0 8px; font-size: 11px; display: inline-flex;" onclick="App.openPaymentModal(${i.id}, '${i.invoice_number}', ${i.balance_due})" title="${t('recordPayment')}">
                ${t('recordPayment')}
              </button>
            ` : ""}
            <button class="btn-secondary text-danger" style="height: 28px; padding: 0 6px; font-size: 11px; display: inline-flex;" onclick="App.deleteInvoice(${i.id})" title="${t('delete')}">
              ✕
            </button>
          </td>
        </tr>
      `;
    }).join("");
  },

  // ========================== INVOICES VIEW ==========================

  async renderInvoices(container) {
    container.innerHTML = `
      <div class="view-header">
        <div>
          <h2 data-i18n="navInvoices">${t("navInvoices")}</h2>
          <p>${t("orderHistory")}</p>
        </div>
        <button class="btn-primary" onclick="App.openInvoiceModal()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span data-i18n="newInvoice">${t("newInvoice")}</span>
        </button>
      </div>

      <div class="table-card">
        <div class="table-toolbar">
          <div class="filter-tabs">
            <button class="filter-tab ${this.activeInvoiceFilter === 'all' ? 'active' : ''}" onclick="App.setInvoiceFilter('all')">${t("statusAll")}</button>
            <button class="filter-tab ${this.activeInvoiceFilter === 'pending' ? 'active' : ''}" onclick="App.setInvoiceFilter('pending')">${t("statusPending")}</button>
            <button class="filter-tab ${this.activeInvoiceFilter === 'partial' ? 'active' : ''}" onclick="App.setInvoiceFilter('partial')">${t("statusPartial")}</button>
            <button class="filter-tab ${this.activeInvoiceFilter === 'paid' ? 'active' : ''}" onclick="App.setInvoiceFilter('paid')">${t("statusPaid")}</button>
            <button class="filter-tab ${this.activeInvoiceFilter === 'future' ? 'active' : ''}" onclick="App.setInvoiceFilter('future')">${t("statusFuture")}</button>
            <button class="filter-tab ${this.activeInvoiceFilter === 'draft' ? 'active' : ''}" onclick="App.setInvoiceFilter('draft')">${t("statusDraft")}</button>
          </div>
          <div style="font-size: 12px; color: var(--text-muted);" id="invoices-count-indicator"></div>
        </div>

        <div class="data-table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>${t("invoiceNumber")}</th>
                <th>${t("customer")}</th>
                <th>${t("issueDate")}</th>
                <th>${t("dueDate")}</th>
                <th>${t("totalAmount")}</th>
                <th>${t("paidAmount")}</th>
                <th>${t("balanceDue")}</th>
                <th>${t("profit")}</th>
                <th>${t("status")}</th>
                <th style="text-align: end;">${t("actions")}</th>
              </tr>
            </thead>
            <tbody id="invoices-table-body">
              <tr><td colspan="10" class="text-center text-muted">${t("noRecordsFound")}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    await this.fetchAndFilterInvoices();
  },

  async setInvoiceFilter(filter) {
    this.activeInvoiceFilter = filter;
    document.querySelectorAll(".filter-tabs .filter-tab").forEach(btn => {
      btn.classList.remove("active");
    });
    event.target.classList.add("active");
    await this.fetchAndFilterInvoices();
  },

  async fetchAndFilterInvoices() {
    let url = "/api/invoices";
    if (this.activeInvoiceFilter === "future") {
      url += "?future_only=true";
    } else if (this.activeInvoiceFilter !== "all") {
      url += `?status=${this.activeInvoiceFilter}`;
    }

    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) return;

      this.invoices = data.invoices || [];
      const tbody = document.getElementById("invoices-table-body");
      const indicator = document.getElementById("invoices-count-indicator");
      if (indicator) {
        indicator.textContent = `${this.invoices.length} ${t("totalOrders")}`;
      }

      if (this.invoices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted" style="padding: 24px;">${t("noRecordsFound")}</td></tr>`;
        return;
      }

      tbody.innerHTML = this.invoices.map(i => {
        const badgeClass = {
          paid: "badge-success",
          partial: "badge-warning",
          pending: "badge-danger",
          draft: "badge-secondary",
          cancelled: "badge-muted"
        }[i.status] || "badge-secondary";

        const statusText = {
          paid: t("statusPaid"),
          partial: t("statusPartial"),
          pending: t("statusPending"),
          draft: t("statusDraft"),
          cancelled: t("statusCancelled")
        }[i.status] || i.status;

        return `
          <tr>
            <td>
              <a href="#" onclick="App.previewInvoice(${i.id}); return false;" style="font-weight: 700; color: var(--primary); text-decoration: none;">
                ${i.invoice_number}
              </a>
            </td>
            <td>
              <a href="#" onclick="App.openCustomerDashboard(${i.customer_id}); return false;" style="font-weight: 600; color: var(--text-main); text-decoration: none;">
                ${i.customer_name}
              </a>
            </td>
            <td class="text-muted">${i.issue_date}</td>
            <td class="text-muted">${i.due_date}</td>
            <td class="font-bold">${formatCurrency(i.total_amount)}</td>
            <td class="text-success">${formatCurrency(i.paid_amount)}</td>
            <td class="${i.balance_due > 0 ? 'text-danger font-bold' : 'text-muted'}">${formatCurrency(i.balance_due)}</td>
            <td class="text-success font-semibold">${formatCurrency(i.net_profit)}</td>
            <td><span class="badge ${badgeClass}">${statusText}</span></td>
            <td style="text-align: end; white-space: nowrap;">
              <button class="btn-secondary" style="height: 28px; padding: 0 8px; font-size: 11px; display: inline-flex;" onclick="App.previewInvoice(${i.id})">
                ${t('view')}
              </button>
              <button class="btn-secondary" style="height: 28px; padding: 0 8px; font-size: 11px; display: inline-flex;" onclick="App.openEditInvoiceModal(${i.id})">
                ${t('edit')}
              </button>
              ${i.status !== 'paid' && i.status !== 'cancelled' ? `
                <button class="btn-primary" style="height: 28px; padding: 0 8px; font-size: 11px; display: inline-flex;" onclick="App.openPaymentModal(${i.id}, '${i.invoice_number}', ${i.balance_due})">
                  ${t('recordPayment')}
                </button>
              ` : ""}
              <button class="btn-secondary text-danger" style="height: 28px; padding: 0 6px; font-size: 11px; display: inline-flex;" onclick="App.deleteInvoice(${i.id})">
                ✕
              </button>
            </td>
          </tr>
        `;
      }).join("");

    } catch (e) {
      console.error("Failed to fetch invoices:", e);
    }
  },

  // ========================== CUSTOMERS VIEW ==========================

  async renderCustomers(container) {
    container.innerHTML = `
      <div class="view-header">
        <div>
          <h2 data-i18n="navCustomers">${t("navCustomers")}</h2>
          <p>${t("customerDetails")}</p>
        </div>
        <button class="btn-primary" onclick="App.openCustomerModal()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span data-i18n="newCustomer">${t("newCustomer")}</span>
        </button>
      </div>

      <div class="table-card">
        <div class="data-table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>${t("customerName")}</th>
                <th>${t("phone")}</th>
                <th>${t("email")}</th>
                <th>${t("totalOrders")}</th>
                <th>${t("lifetimeSpent")}</th>
                <th>${t("lifetimeProfit")}</th>
                <th>${t("unpaidBalance")}</th>
                <th style="text-align: end;">${t("actions")}</th>
              </tr>
            </thead>
            <tbody id="customers-table-body">
              <tr><td colspan="8" class="text-center text-muted">${t("noRecordsFound")}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    await this.loadCustomers();
    const tbody = document.getElementById("customers-table-body");

    if (this.customers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding: 24px;">${t("noRecordsFound")}</td></tr>`;
      return;
    }

    tbody.innerHTML = this.customers.map(c => `
      <tr>
        <td>
          <a href="#" onclick="App.openCustomerDashboard(${c.id}); return false;" style="font-weight: 700; color: var(--primary); text-decoration: none; font-size: 13.5px;">
            ${c.name}
          </a>
          ${c.notes ? `<span class="text-muted text-xs block">${c.notes}</span>` : ""}
        </td>
        <td class="text-muted">${c.phone || "-"}</td>
        <td class="text-muted">${c.email || "-"}</td>
        <td class="font-semibold">${c.total_orders}</td>
        <td class="font-bold">${formatCurrency(c.total_spent)}</td>
        <td class="text-success font-semibold">${formatCurrency(c.total_profit)}</td>
        <td class="${c.total_unpaid > 0 ? 'text-danger font-bold' : 'text-muted'}">${formatCurrency(c.total_unpaid)}</td>
        <td style="text-align: end; white-space: nowrap;">
          <button class="btn-secondary" style="height: 28px; padding: 0 8px; font-size: 11px; display: inline-flex;" onclick="App.openCustomerDashboard(${c.id})">
            ${t('view')}
          </button>
          <button class="btn-secondary" style="height: 28px; padding: 0 8px; font-size: 11px; display: inline-flex;" onclick="App.openEditCustomerModal(${c.id})">
            ${t('edit')}
          </button>
          <button class="btn-primary" style="height: 28px; padding: 0 8px; font-size: 11px; display: inline-flex;" onclick="App.openInvoiceModal(${c.id})">
            + ${t('newInvoice')}
          </button>
          <button class="btn-secondary text-danger" style="height: 28px; padding: 0 6px; font-size: 11px; display: inline-flex;" onclick="App.deleteCustomer(${c.id})">
            ✕
          </button>
        </td>
      </tr>
    `).join("");
  },

  // ========================== CUSTOMER DETAIL DASHBOARD ==========================

  async openCustomerDashboard(customerId) {
    this.navigate("customer_detail", customerId);
  },

  async renderCustomerDetail(container, customerId) {
    container.innerHTML = `<div class="p-4 text-center text-muted">${t("searchPlaceholder")}...</div>`;

    try {
      const res = await fetch(`/api/customers/${customerId}`);
      const data = await res.json();
      if (!data.success) {
        container.innerHTML = `<div class="text-danger p-4">Customer not found</div>`;
        return;
      }

      const cust = data.customer;
      const stats = cust.stats || {};
      const orders = cust.orders || [];
      const histogram = cust.histogram || [];

      // Separate future vs completed
      const todayStr = new Date().toISOString().split("T")[0];
      const futureOrders = orders.filter(o => o.issue_date > todayStr);

      container.innerHTML = `
        <div class="view-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button class="btn-secondary" onclick="App.navigate('customers')" style="height: 36px;">
              ← ${t("navCustomers")}
            </button>
            <div>
              <h2 style="font-size: 22px; font-weight: 800;">${cust.name}</h2>
              <p class="text-muted">${cust.phone || ""} ${cust.email ? "• " + cust.email : ""} ${cust.address ? "• " + cust.address : ""}</p>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn-secondary" onclick="App.openEditCustomerModal(${cust.id})">
              ${t("editCustomer")}
            </button>
            <button class="btn-primary" onclick="App.openInvoiceModal(${cust.id})">
              ${t("newOrderForCustomer")}
            </button>
          </div>
        </div>

        <!-- Customer Metrics -->
        <div class="metrics-grid">
          <div class="metric-card card-accent-primary">
            <span class="metric-card-label">${t("lifetimeSpent")}</span>
            <span class="metric-card-value">${formatCurrency(stats.total_revenue)}</span>
            <span class="metric-card-sub">${stats.total_orders} ${t("totalOrders")}</span>
          </div>

          <div class="metric-card card-accent-profit">
            <span class="metric-card-label">${t("lifetimeProfit")}</span>
            <span class="metric-card-value">${formatCurrency(stats.total_profit)}</span>
            <span class="metric-card-sub">${t("profitMargin")}: ${stats.total_revenue > 0 ? ((stats.total_profit / stats.total_revenue) * 100).toFixed(1) : 0}%</span>
          </div>

          <div class="metric-card card-accent-loss">
            <span class="metric-card-label">${t("unpaidBalance")}</span>
            <span class="metric-card-value">${formatCurrency(stats.unpaid_balance)}</span>
            <span class="metric-card-sub">${stats.unpaid_balance > 0 ? t("statusPending") : t("statusPaid")}</span>
          </div>
        </div>

        <!-- Customer Profit Histogram -->
        <div class="chart-card">
          <div class="chart-card-header">
            <span class="chart-card-title">${cust.name} - ${t("financialPerformance")}</span>
          </div>
          <div class="chart-canvas-wrapper">
            <canvas id="customer-hist-canvas"></canvas>
          </div>
        </div>

        <!-- Future Orders section if any -->
        ${futureOrders.length > 0 ? `
          <div class="table-card" style="border: 2px solid var(--primary);">
            <div class="table-toolbar" style="background: var(--primary-light);">
              <h3 style="font-size: 14px; font-weight: 700; color: var(--primary);">${t("futureOrders")} (${futureOrders.length})</h3>
            </div>
            <div class="data-table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>${t("invoiceNumber")}</th>
                    <th>${t("issueDate")}</th>
                    <th>${t("dueDate")}</th>
                    <th>${t("totalAmount")}</th>
                    <th>${t("status")}</th>
                    <th style="text-align: end;">${t("actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${futureOrders.map(o => `
                    <tr>
                      <td><a href="#" onclick="App.previewInvoice(${o.id}); return false;" style="font-weight: 700; color: var(--primary);">${o.invoice_number}</a></td>
                      <td>${o.issue_date}</td>
                      <td>${o.due_date}</td>
                      <td class="font-bold">${formatCurrency(o.total_amount)}</td>
                      <td><span class="badge badge-warning">${o.status}</span></td>
                      <td style="text-align: end;">
                        <button class="btn-secondary" style="height: 26px; font-size: 11px;" onclick="App.openEditInvoiceModal(${o.id})">${t("edit")}</button>
                        <button class="btn-secondary" style="height: 26px; font-size: 11px;" onclick="App.previewInvoice(${o.id})">${t("view")}</button>
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        ` : ""}

        <!-- Complete Customer Order History -->
        <div class="table-card">
          <div class="table-toolbar">
            <h3 style="font-size: 15px; font-weight: 700;">${t("orderHistory")}</h3>
          </div>
          <div class="data-table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>${t("invoiceNumber")}</th>
                  <th>${t("issueDate")}</th>
                  <th>${t("dueDate")}</th>
                  <th>${t("totalAmount")}</th>
                  <th>${t("paidAmount")}</th>
                  <th>${t("balanceDue")}</th>
                  <th>${t("profit")}</th>
                  <th>${t("status")}</th>
                  <th style="text-align: end;">${t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                ${orders.length === 0 ? `<tr><td colspan="9" class="text-center text-muted" style="padding: 20px;">${t("noRecordsFound")}</td></tr>` :
                  orders.map(o => `
                    <tr>
                      <td><a href="#" onclick="App.previewInvoice(${o.id}); return false;" style="font-weight: 700; color: var(--primary);">${o.invoice_number}</a></td>
                      <td class="text-muted">${o.issue_date}</td>
                      <td class="text-muted">${o.due_date}</td>
                      <td class="font-bold">${formatCurrency(o.total_amount)}</td>
                      <td class="text-success">${formatCurrency(o.paid_amount)}</td>
                      <td class="${o.balance_due > 0 ? 'text-danger font-bold' : 'text-muted'}">${formatCurrency(o.balance_due)}</td>
                      <td class="text-success font-semibold">${formatCurrency(o.net_profit)}</td>
                      <td><span class="badge badge-${o.status === 'paid' ? 'success' : (o.status === 'partial' ? 'warning' : 'danger')}">${o.status}</span></td>
                      <td style="text-align: end; white-space: nowrap;">
                        <button class="btn-secondary" style="height: 26px; font-size: 11px;" onclick="App.previewInvoice(${o.id})">${t("view")}</button>
                        <button class="btn-secondary" style="height: 26px; font-size: 11px;" onclick="App.openEditInvoiceModal(${o.id})">${t("edit")}</button>
                      </td>
                    </tr>
                  `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Render customer histogram
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const canvas = document.getElementById("customer-hist-canvas");
      const tooltip = document.getElementById("chart-tooltip");
      MiniChartEngine.renderHistogram(canvas, histogram, {
        isDark,
        onHover: (d, x, y) => {
          tooltip.style.display = "block";
          tooltip.style.left = `${x + 12}px`;
          tooltip.style.top = `${y - 20}px`;
          tooltip.innerHTML = `
            <strong>${d.month_label}</strong><br/>
            ${t("totalRevenue")}: ${formatCurrency(d.revenue)}<br/>
            ${t("netProfit")}: <span style="color: #10B981">${formatCurrency(d.profit)}</span>
          `;
        },
        onLeave: () => { tooltip.style.display = "none"; }
      });

    } catch (e) {
      console.error("Failed to render customer detail:", e);
    }
  },

  // ========================== INVENTORY VIEW ==========================

  async renderInventory(container) {
    container.innerHTML = `
      <div class="view-header">
        <div>
          <h2 data-i18n="navInventory">${t("navInventory")}</h2>
          <p>${t("inventoryManagement")}</p>
        </div>
        <button class="btn-primary" onclick="App.openProductModal()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span data-i18n="newProduct">${t("newProduct")}</span>
        </button>
      </div>

      <div class="table-card">
        <div class="data-table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>${t("productName")}</th>
                <th>${t("sku")}</th>
                <th>${t("unitPrice")}</th>
                <th>${t("costPrice")}</th>
                <th>${t("marginPerUnit")}</th>
                <th>${t("stockQuantity")}</th>
                <th>${t("stockValue")}</th>
                <th>${t("status")}</th>
                <th style="text-align: end;">${t("actions")}</th>
              </tr>
            </thead>
            <tbody id="inventory-table-body">
              <tr><td colspan="9" class="text-center text-muted">${t("noRecordsFound")}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    await this.loadProducts();
    const tbody = document.getElementById("inventory-table-body");

    if (this.products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding: 24px;">${t("noRecordsFound")}</td></tr>`;
      return;
    }

    tbody.innerHTML = this.products.map(p => {
      let statusBadge = `<span class="badge badge-success">${t("inStock")}</span>`;
      if (p.stock_quantity <= 0) {
        statusBadge = `<span class="badge badge-danger">${t("outOfStock")}</span>`;
      } else if (p.is_low_stock) {
        statusBadge = `<span class="badge badge-warning">${t("lowStock")} (${p.stock_quantity})</span>`;
      }

      return `
        <tr>
          <td>
            <strong>${p.name}</strong>
            ${p.description ? `<span class="text-muted text-xs block">${p.description}</span>` : ""}
          </td>
          <td class="text-muted font-mono">${p.sku || "-"}</td>
          <td class="font-bold">${formatCurrency(p.unit_price)}</td>
          <td class="text-muted">${formatCurrency(p.cost_price)}</td>
          <td class="text-success font-semibold">${formatCurrency(p.margin_per_unit)}</td>
          <td class="font-bold text-center">${p.stock_quantity}</td>
          <td class="font-semibold">${formatCurrency(p.total_stock_value)}</td>
          <td>${statusBadge}</td>
          <td style="text-align: end; white-space: nowrap;">
            <button class="btn-primary" style="height: 28px; padding: 0 8px; font-size: 11px; display: inline-flex;" onclick="App.openRestockModal(${p.id}, '${p.name.replace(/'/g, "\\'")}')">
              ${t('restock')}
            </button>
            <button class="btn-secondary" style="height: 28px; padding: 0 8px; font-size: 11px; display: inline-flex;" onclick="App.openEditProductModal(${p.id})">
              ${t('edit')}
            </button>
            <button class="btn-secondary text-danger" style="height: 28px; padding: 0 6px; font-size: 11px; display: inline-flex;" onclick="App.deleteProduct(${p.id})">
              ✕
            </button>
          </td>
        </tr>
      `;
    }).join("");
  },

  // ========================== FINANCIAL REPORTS VIEW ==========================

  async renderReports(container) {
    container.innerHTML = `
      <div class="view-header">
        <div>
          <h2 data-i18n="navReports">${t("navReports")}</h2>
          <p>${t("financialReports")}</p>
        </div>
        <div class="filter-tabs">
          <button class="filter-tab ${this.activeReportsPeriod === 'all' ? 'active' : ''}" onclick="App.setReportsPeriod('all')">${t("periodAll")}</button>
          <button class="filter-tab ${this.activeReportsPeriod === '30days' ? 'active' : ''}" onclick="App.setReportsPeriod('30days')">${t("period30Days")}</button>
          <button class="filter-tab ${this.activeReportsPeriod === '90days' ? 'active' : ''}" onclick="App.setReportsPeriod('90days')">${t("period90Days")}</button>
          <button class="filter-tab ${this.activeReportsPeriod === 'year' ? 'active' : ''}" onclick="App.setReportsPeriod('year')">${t("periodYear")}</button>
        </div>
      </div>

      <div id="reports-content-body">
        <div class="p-4 text-center text-muted">${t("searchPlaceholder")}...</div>
      </div>
    `;

    await this.fetchReportsData();
  },

  async setReportsPeriod(period) {
    this.activeReportsPeriod = period;
    document.querySelectorAll(".filter-tabs .filter-tab").forEach(btn => btn.classList.remove("active"));
    event.target.classList.add("active");
    await this.fetchReportsData();
  },

  async fetchReportsData() {
    const body = document.getElementById("reports-content-body");
    try {
      const res = await fetch(`/api/stats?period=${this.activeReportsPeriod}`);
      const data = await res.json();
      if (!data.success) return;

      const { summary, histogram } = data;
      const invRes = await fetch("/api/invoices");
      const invData = await invRes.json();
      const invoices = invData.invoices || [];

      // Calculate total discount & tax
      let totalDiscounts = 0;
      let totalTaxes = 0;
      invoices.forEach(i => {
        if (i.status !== "cancelled") {
          totalDiscounts += Number(i.discount_amount || 0);
          totalTaxes += Number(i.tax_amount || 0);
        }
      });

      body.innerHTML = `
        <!-- Simplified P&L Statement -->
        <div class="table-card" style="margin-bottom: 24px;">
          <div class="table-toolbar">
            <h3 style="font-size: 15px; font-weight: 700;">${t("profitAndLossStatement")}</h3>
          </div>
          <div style="padding: 20px;">
            <div style="display: flex; flex-direction: column; gap: 10px; max-width: 600px;">
              <div class="total-row">
                <span class="font-semibold">${t("grossRevenue")}</span>
                <span class="font-bold">${formatCurrency(summary.total_revenue + totalDiscounts)}</span>
              </div>
              <div class="total-row text-danger">
                <span>(-) ${t("discountsGiven")}</span>
                <span>-${formatCurrency(totalDiscounts)}</span>
              </div>
              <div class="total-row" style="border-top: 1px solid var(--border-subtle); padding-top: 6px;">
                <span class="font-semibold">${t("totalRevenue")} (Net Sales)</span>
                <span class="font-bold">${formatCurrency(summary.total_revenue)}</span>
              </div>
              <div class="total-row text-danger">
                <span>(-) ${t("cogs")}</span>
                <span>-${formatCurrency(summary.total_cost)}</span>
              </div>
              <div class="total-row" style="border-top: 1px solid var(--border-subtle); padding-top: 6px;">
                <span class="font-bold text-success">${t("grossProfit")}</span>
                <span class="font-bold text-success">${formatCurrency(summary.total_profit)}</span>
              </div>
              <div class="total-row text-muted">
                <span>${t("taxesCollected")} (VAT)</span>
                <span>+${formatCurrency(totalTaxes)}</span>
              </div>
              <div class="total-row grand-total" style="font-size: 18px;">
                <span class="font-bold text-success">${t("netProfit")}</span>
                <span class="font-bold text-success">${formatCurrency(summary.total_profit)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Customer Profitability Breakdown -->
        <div class="table-card" style="margin-bottom: 24px;">
          <div class="table-toolbar">
            <h3 style="font-size: 15px; font-weight: 700;">${t("customerFinancialBreakdown")}</h3>
          </div>
          <div class="data-table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>${t("customer")}</th>
                  <th>${t("totalOrders")}</th>
                  <th>${t("totalRevenue")}</th>
                  <th>${t("totalCost")}</th>
                  <th>${t("netProfit")}</th>
                  <th>${t("profitMargin")}</th>
                  <th>${t("unpaidBalance")}</th>
                </tr>
              </thead>
              <tbody>
                ${this.customers.map(c => `
                  <tr>
                    <td><strong>${c.name}</strong></td>
                    <td>${c.total_orders}</td>
                    <td class="font-bold">${formatCurrency(c.total_spent)}</td>
                    <td class="text-muted">${formatCurrency(c.total_spent - c.total_profit)}</td>
                    <td class="text-success font-bold">${formatCurrency(c.total_profit)}</td>
                    <td>${c.total_spent > 0 ? ((c.total_profit / c.total_spent) * 100).toFixed(1) : 0}%</td>
                    <td class="${c.total_unpaid > 0 ? 'text-danger font-semibold' : 'text-muted'}">${formatCurrency(c.total_unpaid)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;

    } catch (e) {
      console.error("Reports render error:", e);
    }
  },

  // ========================== SETTINGS VIEW ==========================

  renderSettings(container) {
    const isAr = currentLanguage === "ar";
    const s = this.settings;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h2 data-i18n="navSettings">${t("navSettings")}</h2>
          <p>${t("settingsTitle")}</p>
        </div>
      </div>

      <div class="table-card" style="max-width: 780px;">
        <form id="form-settings" onsubmit="App.saveSettings(event)" style="padding: 24px; display: flex; flex-direction: column; gap: 20px;">
          <h3 style="font-size: 16px; font-weight: 700; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
            ${t("businessInfo")}
          </h3>

          <div class="form-group">
            <label class="form-label">${t("businessName")}</label>
            <input type="text" name="business_name" class="form-input" value="${s.business_name || ''}" required />
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label">${t("businessPhone")}</label>
              <input type="tel" name="business_phone" class="form-input" value="${s.business_phone || ''}" />
            </div>
            <div class="form-group">
              <label class="form-label">${t("businessEmail")}</label>
              <input type="email" name="business_email" class="form-input" value="${s.business_email || ''}" />
            </div>
          </div>

          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label">${t("businessAddress")}</label>
              <input type="text" name="business_address" class="form-input" value="${s.business_address || ''}" />
            </div>
            <div class="form-group">
              <label class="form-label">${t("taxId")}</label>
              <input type="text" name="business_tax_id" class="form-input" value="${s.business_tax_id || ''}" />
            </div>
          </div>

          <h3 style="font-size: 16px; font-weight: 700; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; margin-top: 10px;">
            ${t("currencySetting")}
          </h3>

          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label">${t("currencyCode")}</label>
              <input type="text" name="currency" class="form-input" value="${s.currency || 'SAR'}" />
            </div>
            <div class="form-group">
              <label class="form-label">${t("currencySymbol")}</label>
              <input type="text" name="currency_symbol" class="form-input" value="${s.currency_symbol || 'ر.س'}" />
            </div>
          </div>

          <h3 style="font-size: 16px; font-weight: 700; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px; margin-top: 10px;">
            ${t("inventoryModeSetting")}
          </h3>

          <div style="background: var(--bg-surface-alt); padding: 16px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: space-between;">
            <div>
              <strong style="display: block; font-size: 13.5px;">${t("inventoryModeSetting")}</strong>
              <span class="text-muted text-xs">${t("inventoryModeDesc")}</span>
            </div>
            <label style="position: relative; display: inline-block; width: 50px; height: 26px; flex-shrink: 0;">
              <input type="checkbox" id="setting-inventory-mode-toggle" ${s.inventory_mode === 'true' ? 'checked' : ''} style="opacity: 0; width: 0; height: 0;" />
              <span style="position: absolute; cursor: pointer; inset: 0; background-color: ${s.inventory_mode === 'true' ? 'var(--primary)' : '#CBD5E1'}; border-radius: 34px; transition: .2s;" onclick="this.previousElementSibling.click(); this.style.backgroundColor = this.previousElementSibling.checked ? 'var(--primary)' : '#CBD5E1';"></span>
            </label>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
            <button type="submit" class="btn-primary" style="height: 42px; padding: 0 24px; font-size: 14px;">
              ${t("saveSettings")}
            </button>
          </div>
        </form>
      </div>
    `;
  },

  async saveSettings(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    const invToggle = document.getElementById("setting-inventory-mode-toggle");
    data.inventory_mode = invToggle && invToggle.checked ? "true" : "false";

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const resData = await res.json();
      if (resData.success) {
        this.showToast(t("settingsSavedSuccess"));
        await this.loadSettings();
      }
    } catch (err) {
      console.error("Save settings error:", err);
    }
  },

  // ========================== INVOICE MODALS & ACTIONS ==========================

  openInvoiceModal(prefillCustomerId = null) {
    document.getElementById("inv-edit-id").value = "";
    document.getElementById("invoice-modal-title").textContent = t("newInvoice");

    // Populate customer select
    const select = document.getElementById("inv-customer-select");
    select.innerHTML = `<option value="">${t("selectCustomer")}</option>` +
      this.customers.map(c => `<option value="${c.id}" ${prefillCustomerId === c.id ? 'selected' : ''}>${c.name}</option>`).join("");

    // Generate fresh invoice number
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    document.getElementById("inv-number-input").value = `INV-${year}-${rand}`;

    const todayStr = new Date().toISOString().split("T")[0];
    document.getElementById("inv-issue-date").value = todayStr;
    document.getElementById("inv-due-date").value = todayStr;
    document.getElementById("inv-status-select").value = "pending";
    document.getElementById("inv-discount").value = "0";
    document.getElementById("inv-tax-rate").value = "15";
    document.getElementById("inv-shipping").value = "0";
    document.getElementById("inv-paid").value = "0";
    document.getElementById("inv-notes").value = "Thank you for your business / شكراً لتعاملكم معنا";

    // Clear items and add one initial row
    document.getElementById("inv-items-body").innerHTML = "";
    this.addInvoiceItemRow();

    this.recalculateInvoiceTotals();
    document.getElementById("modal-invoice-form").classList.add("active");
  },

  async openEditInvoiceModal(invoiceId) {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      const data = await res.json();
      if (!data.success) return;

      const inv = data.invoice;
      document.getElementById("inv-edit-id").value = inv.id;
      document.getElementById("invoice-modal-title").textContent = `${t("edit")} - ${inv.invoice_number}`;

      const select = document.getElementById("inv-customer-select");
      select.innerHTML = `<option value="">${t("selectCustomer")}</option>` +
        this.customers.map(c => `<option value="${c.id}" ${inv.customer_id === c.id ? 'selected' : ''}>${c.name}</option>`).join("");

      document.getElementById("inv-number-input").value = inv.invoice_number;
      document.getElementById("inv-issue-date").value = inv.issue_date;
      document.getElementById("inv-due-date").value = inv.due_date;
      document.getElementById("inv-status-select").value = inv.status;
      document.getElementById("inv-discount").value = inv.discount_amount;
      document.getElementById("inv-tax-rate").value = inv.tax_rate;
      document.getElementById("inv-shipping").value = inv.shipping_fee;
      document.getElementById("inv-paid").value = inv.paid_amount;
      document.getElementById("inv-notes").value = inv.notes || "";

      // Populate items
      const tbody = document.getElementById("inv-items-body");
      tbody.innerHTML = "";
      (inv.items || []).forEach(item => {
        this.addInvoiceItemRow(item);
      });

      this.recalculateInvoiceTotals();
      document.getElementById("modal-invoice-form").classList.add("active");
    } catch (e) {
      console.error("Open edit invoice error:", e);
    }
  },

  addInvoiceItemRow(itemData = null) {
    const tbody = document.getElementById("inv-items-body");
    const tr = document.createElement("tr");

    const isInventoryMode = this.settings.inventory_mode === "true";

    let productDropdown = "";
    if (isInventoryMode && this.products.length > 0) {
      productDropdown = `
        <select class="form-select row-product-select" onchange="App.onItemProductSelected(this)" style="font-size: 12px; height: 30px; margin-bottom: 4px;">
          <option value="">${t("selectProduct")}</option>
          ${this.products.map(p => `
            <option value="${p.id}" data-price="${p.unit_price}" data-cost="${p.cost_price}" data-stock="${p.stock_quantity}" ${itemData && itemData.product_id === p.id ? 'selected' : ''}>
              ${p.name} (${t("availableInStock")}: ${p.stock_quantity})
            </option>
          `).join("")}
        </select>
      `;
    }

    tr.innerHTML = `
      <td>
        ${productDropdown}
        <input type="text" class="form-input row-desc" placeholder="${t('itemDescription')}" value="${itemData ? itemData.description : ''}" required style="height: 32px;" />
      </td>
      <td>
        <input type="number" step="1" min="1" class="form-input row-qty" value="${itemData ? itemData.quantity : 1}" oninput="App.recalculateInvoiceTotals()" required style="height: 32px; text-align: center;" />
      </td>
      <td>
        <input type="number" step="0.01" min="0" class="form-input row-uprice" value="${itemData ? itemData.unit_price : 0}" oninput="App.recalculateInvoiceTotals()" required style="height: 32px; text-align: end;" />
      </td>
      <td>
        <input type="number" step="0.01" min="0" class="form-input row-cprice" value="${itemData ? itemData.cost_price : 0}" oninput="App.recalculateInvoiceTotals()" required style="height: 32px; text-align: end;" />
      </td>
      <td>
        <input type="number" step="0.01" min="0" class="form-input row-disc" value="${itemData ? itemData.discount : 0}" oninput="App.recalculateInvoiceTotals()" style="height: 32px; text-align: end;" />
      </td>
      <td style="text-align: center;">
        <button type="button" class="btn-secondary text-danger" style="padding: 2px 6px; font-size: 11px;" onclick="this.closest('tr').remove(); App.recalculateInvoiceTotals();">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  },

  onItemProductSelected(selectEl) {
    const opt = selectEl.options[selectEl.selectedIndex];
    if (!opt || !opt.value) return;

    const row = selectEl.closest("tr");
    const descInput = row.querySelector(".row-desc");
    const upriceInput = row.querySelector(".row-uprice");
    const cpriceInput = row.querySelector(".row-cprice");

    // Clean product name (remove stock count from label)
    const cleanName = opt.text.split("(")[0].trim();
    if (!descInput.value || descInput.value.trim() === "Item") {
      descInput.value = cleanName;
    }
    upriceInput.value = opt.getAttribute("data-price") || 0;
    cpriceInput.value = opt.getAttribute("data-cost") || 0;

    this.recalculateInvoiceTotals();
  },

  recalculateInvoiceTotals() {
    let subtotal = 0;
    let costTotal = 0;
    let stockWarning = false;

    const isInventoryMode = this.settings.inventory_mode === "true";

    document.querySelectorAll("#inv-items-body tr").forEach(tr => {
      const qty = parseFloat(tr.querySelector(".row-qty")?.value || 1);
      const uprice = parseFloat(tr.querySelector(".row-uprice")?.value || 0);
      const cprice = parseFloat(tr.querySelector(".row-cprice")?.value || 0);
      const disc = parseFloat(tr.querySelector(".row-disc")?.value || 0);

      const prodSelect = tr.querySelector(".row-product-select");
      if (isInventoryMode && prodSelect && prodSelect.value) {
        const opt = prodSelect.options[prodSelect.selectedIndex];
        const stock = parseFloat(opt.getAttribute("data-stock") || 0);
        if (qty > stock) {
          stockWarning = true;
        }
      }

      const lineTotal = (qty * uprice) - disc;
      const lineCost = (qty * cprice);
      subtotal += lineTotal;
      costTotal += lineCost;
    });

    const warningBanner = document.getElementById("inv-stock-warning");
    if (warningBanner) {
      warningBanner.style.display = stockWarning ? "block" : "none";
    }

    const discount = parseFloat(document.getElementById("inv-discount")?.value || 0);
    const taxRate = parseFloat(document.getElementById("inv-tax-rate")?.value || 0);
    const shipping = parseFloat(document.getElementById("inv-shipping")?.value || 0);

    const taxable = Math.max(0, subtotal - discount);
    const taxAmt = taxable * (taxRate / 100.0);
    const total = taxable + taxAmt + shipping;
    const profit = taxable - costTotal;

    document.getElementById("calc-subtotal").textContent = formatCurrency(subtotal);
    document.getElementById("calc-total").textContent = formatCurrency(total);
    document.getElementById("calc-profit").textContent = formatCurrency(profit);
  },

  async saveInvoice(e) {
    e.preventDefault();
    const editId = document.getElementById("inv-edit-id").value;
    const customerId = document.getElementById("inv-customer-select").value;
    if (!customerId) {
      alert("Please select a customer");
      return;
    }

    const items = [];
    document.querySelectorAll("#inv-items-body tr").forEach(tr => {
      const prodSelect = tr.querySelector(".row-product-select");
      items.push({
        product_id: prodSelect && prodSelect.value ? parseInt(prodSelect.value) : null,
        description: tr.querySelector(".row-desc")?.value.trim() || "Item",
        quantity: parseFloat(tr.querySelector(".row-qty")?.value || 1),
        unit_price: parseFloat(tr.querySelector(".row-uprice")?.value || 0),
        cost_price: parseFloat(tr.querySelector(".row-cprice")?.value || 0),
        discount: parseFloat(tr.querySelector(".row-disc")?.value || 0),
      });
    });

    if (items.length === 0) {
      alert("Please add at least one line item");
      return;
    }

    const payload = {
      customer_id: parseInt(customerId),
      invoice_number: document.getElementById("inv-number-input").value.trim(),
      issue_date: document.getElementById("inv-issue-date").value,
      due_date: document.getElementById("inv-due-date").value,
      status: document.getElementById("inv-status-select").value,
      discount_amount: parseFloat(document.getElementById("inv-discount").value || 0),
      tax_rate: parseFloat(document.getElementById("inv-tax-rate").value || 0),
      shipping_fee: parseFloat(document.getElementById("inv-shipping").value || 0),
      paid_amount: parseFloat(document.getElementById("inv-paid").value || 0),
      notes: document.getElementById("inv-notes").value,
      items
    };

    try {
      const url = editId ? `/api/invoices/${editId}` : "/api/invoices";
      const method = editId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || "Failed to save invoice");
        return;
      }

      this.showToast(editId ? "Invoice updated successfully!" : "Invoice created successfully!");
      this.closeModals();
      await this.loadProducts(); // refresh stock counts
      this.renderActiveView();
    } catch (err) {
      console.error("Save invoice error:", err);
      alert("Error saving invoice");
    }
  },

  async previewInvoice(invoiceId) {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      const data = await res.json();
      if (!data.success) return;

      this.currentPreviewInvoice = data.invoice;
      const container = document.getElementById("invoice-preview-container");
      container.innerHTML = InvoiceMaker.renderPreviewHtml(data.invoice, this.settings);

      const modal = document.getElementById("modal-invoice-preview");
      modal.classList.add("active");
    } catch (e) {
      console.error("Preview invoice error:", e);
    }
  },

  exportInvoiceImage(compact = false) {
    if (!this.currentPreviewInvoice) return;
    InvoiceMaker.downloadInvoiceImage(this.currentPreviewInvoice, this.settings, compact);
  },

  printInvoice() {
    const modal = document.getElementById("modal-invoice-preview");
    modal.classList.add("print-active");
    InvoiceMaker.printInvoicePdf();
    setTimeout(() => modal.classList.remove("print-active"), 1000);
  },

  openPaymentModal(invoiceId, invoiceNumber, balanceDue) {
    document.getElementById("pay-inv-id").value = invoiceId;
    document.getElementById("pay-inv-label").textContent = `${invoiceNumber} • ${t("balanceDue")}: ${formatCurrency(balanceDue)}`;
    document.getElementById("pay-amount-input").value = balanceDue;
    document.getElementById("pay-amount-input").max = balanceDue;
    document.getElementById("modal-payment").classList.add("active");
  },

  async submitPayment(e) {
    e.preventDefault();
    const invId = document.getElementById("pay-inv-id").value;
    const amount = parseFloat(document.getElementById("pay-amount-input").value);

    try {
      const res = await fetch(`/api/invoices/${invId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast(t("paymentSuccess"));
        this.closeModals();
        this.renderActiveView();
      }
    } catch (err) {
      console.error("Payment error:", err);
    }
  },

  async deleteInvoice(invoiceId) {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        this.showToast("Invoice deleted");
        await this.loadProducts();
        this.renderActiveView();
      }
    } catch (e) {
      console.error("Delete invoice error:", e);
    }
  },

  // ========================== CUSTOMER MODAL ==========================

  openCustomerModal() {
    document.getElementById("cust-edit-id").value = "";
    document.getElementById("customer-modal-title").textContent = t("newCustomer");
    document.getElementById("cust-name-input").value = "";
    document.getElementById("cust-phone-input").value = "";
    document.getElementById("cust-email-input").value = "";
    document.getElementById("cust-address-input").value = "";
    document.getElementById("cust-notes-input").value = "";
    document.getElementById("modal-customer-form").classList.add("active");
  },

  async openEditCustomerModal(customerId) {
    try {
      const res = await fetch(`/api/customers/${customerId}`);
      const data = await res.json();
      if (!data.success) return;

      const c = data.customer;
      document.getElementById("cust-edit-id").value = c.id;
      document.getElementById("customer-modal-title").textContent = `${t("edit")} - ${c.name}`;
      document.getElementById("cust-name-input").value = c.name;
      document.getElementById("cust-phone-input").value = c.phone || "";
      document.getElementById("cust-email-input").value = c.email || "";
      document.getElementById("cust-address-input").value = c.address || "";
      document.getElementById("cust-notes-input").value = c.notes || "";
      document.getElementById("modal-customer-form").classList.add("active");
    } catch (e) {
      console.error("Edit customer error:", e);
    }
  },

  async saveCustomer(e) {
    e.preventDefault();
    const editId = document.getElementById("cust-edit-id").value;
    const payload = {
      name: document.getElementById("cust-name-input").value.trim(),
      phone: document.getElementById("cust-phone-input").value.trim(),
      email: document.getElementById("cust-email-input").value.trim(),
      address: document.getElementById("cust-address-input").value.trim(),
      notes: document.getElementById("cust-notes-input").value.trim()
    };

    try {
      const url = editId ? `/api/customers/${editId}` : "/api/customers";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.showToast("Customer saved successfully!");
        this.closeModals();
        await this.loadCustomers();
        this.renderActiveView();
      }
    } catch (err) {
      console.error("Save customer error:", err);
    }
  },

  async deleteCustomer(customerId) {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(`/api/customers/${customerId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        this.showToast("Customer deleted");
        await this.loadCustomers();
        this.renderActiveView();
      }
    } catch (e) {
      console.error("Delete customer error:", e);
    }
  },

  // ========================== PRODUCT MODAL ==========================

  openProductModal() {
    document.getElementById("prod-edit-id").value = "";
    document.getElementById("product-modal-title").textContent = t("newProduct");
    document.getElementById("prod-name-input").value = "";
    document.getElementById("prod-sku-input").value = "";
    document.getElementById("prod-stock-input").value = "10";
    document.getElementById("prod-unit-price").value = "";
    document.getElementById("prod-cost-price").value = "";
    document.getElementById("prod-min-alert").value = "5";
    document.getElementById("modal-product-form").classList.add("active");
  },

  async openEditProductModal(productId) {
    const p = this.products.find(item => item.id === productId);
    if (!p) return;

    document.getElementById("prod-edit-id").value = p.id;
    document.getElementById("product-modal-title").textContent = `${t("edit")} - ${p.name}`;
    document.getElementById("prod-name-input").value = p.name;
    document.getElementById("prod-sku-input").value = p.sku || "";
    document.getElementById("prod-stock-input").value = p.stock_quantity;
    document.getElementById("prod-unit-price").value = p.unit_price;
    document.getElementById("prod-cost-price").value = p.cost_price;
    document.getElementById("prod-min-alert").value = p.min_stock_alert;
    document.getElementById("modal-product-form").classList.add("active");
  },

  async saveProduct(e) {
    e.preventDefault();
    const editId = document.getElementById("prod-edit-id").value;
    const payload = {
      name: document.getElementById("prod-name-input").value.trim(),
      sku: document.getElementById("prod-sku-input").value.trim(),
      stock_quantity: parseInt(document.getElementById("prod-stock-input").value || 0),
      unit_price: parseFloat(document.getElementById("prod-unit-price").value || 0),
      cost_price: parseFloat(document.getElementById("prod-cost-price").value || 0),
      min_stock_alert: parseInt(document.getElementById("prod-min-alert").value || 5)
    };

    try {
      const url = editId ? `/api/products/${editId}` : "/api/products";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        this.showToast("Product saved successfully!");
        this.closeModals();
        await this.loadProducts();
        this.renderActiveView();
      } else {
        alert(data.error || "Failed to save product");
      }
    } catch (err) {
      console.error("Save product error:", err);
    }
  },

  openRestockModal(productId, productName) {
    document.getElementById("restock-prod-id").value = productId;
    document.getElementById("restock-prod-name").textContent = productName;
    document.getElementById("restock-qty-input").value = "10";
    document.getElementById("modal-restock").classList.add("active");
  },

  async submitRestock(e) {
    e.preventDefault();
    const prodId = document.getElementById("restock-prod-id").value;
    const qty = parseInt(document.getElementById("restock-qty-input").value);

    try {
      const res = await fetch(`/api/products/${prodId}/restock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: qty })
      });
      const data = await res.json();
      if (data.success) {
        this.showToast("Restocked successfully!");
        this.closeModals();
        await this.loadProducts();
        this.renderActiveView();
      }
    } catch (err) {
      console.error("Restock error:", err);
    }
  },

  async deleteProduct(productId) {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(`/api/products/${productId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        this.showToast("Product deleted");
        await this.loadProducts();
        this.renderActiveView();
      }
    } catch (e) {
      console.error("Delete product error:", e);
    }
  }
};

// Start application on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
