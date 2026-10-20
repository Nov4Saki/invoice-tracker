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

    // Keepalive heartbeat for desktop fallback / browser mode
    this.initHeartbeat();

    // Global expose
    window.renderActiveView = () => this.renderActiveView();
  },

  initHeartbeat() {
    const tabId = "tab_" + Math.random().toString(36).substring(2, 11);
    const ping = () => {
      fetch("/api/heartbeat?tab_id=" + encodeURIComponent(tabId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      }).catch(() => {});
    };
    ping();
    setInterval(ping, 3000);

    window.addEventListener("beforeunload", () => {
      try {
        const closeUrl = "/api/heartbeat?closing=1&tab_id=" + encodeURIComponent(tabId);
        if (navigator.sendBeacon) {
          navigator.sendBeacon(closeUrl, "{}");
        } else {
          fetch(closeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ closing: true, tab_id: tabId }),
            keepalive: true
          }).catch(() => {});
        }
      } catch (e) {}
    });
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

    // Responsive debounced window resize handler for crisp canvas rendering
    let resizeDebounceTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        this.redrawActiveCharts();
      }, 60);
    });

    // ResizeObserver on chart wrappers for container-level adaptation
    this.setupChartResizeObserver();
  },

  setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("app_theme", theme);
    this.redrawActiveCharts();
  },

  setupChartResizeObserver() {
    if (typeof ResizeObserver === "undefined") return;
    if (this._chartResizeObserver) {
      this._chartResizeObserver.disconnect();
    }
    let rAF = null;
    this._chartResizeObserver = new ResizeObserver(() => {
      if (rAF) cancelAnimationFrame(rAF);
      rAF = requestAnimationFrame(() => {
        this.redrawActiveCharts();
      });
    });
    this.observeChartContainers();
  },

  observeChartContainers() {
    if (!this._chartResizeObserver) return;
    this._chartResizeObserver.disconnect();
    document.querySelectorAll(".chart-canvas-wrapper").forEach(wrapper => {
      this._chartResizeObserver.observe(wrapper);
    });
  },

  redrawActiveCharts() {
    const tooltip = document.getElementById("chart-tooltip");
    if (tooltip) tooltip.style.display = "none";

    const invModal = document.getElementById("modal-invoice-dashboard");
    if (invModal && invModal.classList.contains("active")) {
      this.renderInvoiceDashboardCharts();
    }

    if (this.currentView === "dashboard") {
      this.renderDashboardCharts();
    } else if (this.currentView === "customer_detail") {
      this.renderCustomerDetailCharts();
    } else if (this.currentView === "reports") {
      this.renderReportsCharts();
    }
  },

  async loadSettings() {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success) {
        this.settings = data.settings || {};
        window.appCurrencySymbol = this.settings.currency_symbol || (currentLanguage === "ar" ? "ج.م" : "EGP");

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
                <span class="search-item-title"><bdi class="customer-bdi">${c.name}</bdi></span>
                <span class="search-item-meta">${c.phone || ""} ${c.email ? "• " + c.email : ""}</span>
              </div>
              <span class="badge badge-secondary">${c.preferred_currency || t("customer")}</span>
            </div>
          `;
        });
      }

      if (invoices.length > 0) {
        html += `<div class="search-category-header">${t("navInvoices")}</div>`;
        invoices.forEach(i => {
          html += `
            <div class="search-item" onclick="App.openInvoiceDashboard(${i.id})">
              <div class="search-item-info">
                <span class="search-item-title">${i.invoice_number} - <bdi class="customer-bdi">${i.customer_name}</bdi></span>
                <span class="search-item-meta">${i.issue_date} • ${formatCurrency(i.total_amount, i.currency_symbol || i.currency)}</span>
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
      this.dashboardData = data;

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
        <div class="metrics-grid stats-grid kpi-grid">
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
              <canvas id="hist-canvas" data-canvas="dashboard-histogram-canvas"></canvas>
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-card-header">
              <span class="chart-card-title">${t("profitVsCost")}</span>
            </div>
            <div class="chart-canvas-wrapper">
              <canvas id="donut-canvas" data-canvas="dashboard-donut-canvas"></canvas>
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
      this.renderDashboardCharts();
      this.observeChartContainers();

    } catch (e) {
      console.error("Dashboard render error:", e);
    }
  },

  renderDashboardCharts() {
    if (!this.dashboardData) return;
    const { summary, histogram, pie_charts } = this.dashboardData;
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const tooltip = document.getElementById("chart-tooltip");

    const histCanvas = document.getElementById("hist-canvas") || document.getElementById("dashboard-histogram-canvas");
    if (histCanvas && histogram) {
      MiniChartEngine.renderHistogram(histCanvas, histogram, {
        isDark,
        onHover: (d, x, y) => {
          if (!tooltip) return;
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
        onLeave: () => { if (tooltip) tooltip.style.display = "none"; }
      });
    }

    const donutCanvas = document.getElementById("donut-canvas") || document.getElementById("dashboard-donut-canvas");
    if (donutCanvas && pie_charts && pie_charts.profit_cost) {
      MiniChartEngine.renderDonut(donutCanvas, pie_charts.profit_cost, {
        isDark,
        isLoss: summary ? summary.is_loss : false,
        centerLabel: summary && summary.is_loss ? t("netLoss") : t("profitMargin"),
        centerValue: summary && summary.is_loss ? formatCurrency(summary.total_profit) : `${summary ? summary.margin_pct : 0}%`,
        onHover: (item, pct, x, y) => {
          if (!tooltip) return;
          tooltip.style.display = "block";
          tooltip.style.left = `${x + 12}px`;
          tooltip.style.top = `${y - 20}px`;
          tooltip.innerHTML = `
            <strong>${currentLanguage === 'ar' ? (item.label_ar || item.label) : item.label}</strong><br/>
            ${formatCurrency(item.value)} (${pct}%)
          `;
        },
        onLeave: () => { if (tooltip) tooltip.style.display = "none"; }
      });
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

      const isLoss = (i.net_profit || 0) < 0;
      const cur = i.currency_symbol || i.currency;

      return `
        <tr>
          <td class="cell-nowrap">
            <a href="#" onclick="App.openInvoiceDashboard(${i.id}); return false;" style="font-weight: 700; color: var(--primary); text-decoration: none;" title="${t('invoiceDashboard')}">
              ${i.invoice_number}
            </a>
          </td>
          <td>
            <a href="#" onclick="App.openCustomerDashboard(${i.customer_id}); return false;" style="font-weight: 600; color: var(--text-main); text-decoration: none;">
              <bdi class="customer-bdi">${i.customer_name}</bdi>
            </a>
          </td>
          <td class="text-muted cell-date">${i.issue_date}</td>
          <td class="font-bold cell-currency">${formatCurrency(i.total_amount, cur)}</td>
          <td class="${isLoss ? 'text-danger' : 'text-success'} font-semibold cell-currency">${formatCurrency(i.net_profit, cur)}</td>
          <td class="cell-nowrap"><span class="badge ${badgeClass}">${statusText}</span></td>
          <td style="text-align: end;" class="cell-nowrap">
            <div class="table-actions">
              <button class="btn-action-icon action-primary" onclick="App.openInvoiceDashboard(${i.id})" title="${t('viewDashboard')}" aria-label="${t('viewDashboard')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <line x1="18" y1="20" x2="18" y2="10"></line>
                  <line x1="12" y1="20" x2="12" y2="4"></line>
                  <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
              </button>
              <button class="btn-action-icon" onclick="App.previewInvoice(${i.id})" title="${t('view')}" aria-label="${t('view')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button class="btn-action-icon" onclick="App.openEditInvoiceModal(${i.id})" title="${t('edit')}" aria-label="${t('edit')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              ${i.status !== 'paid' && i.status !== 'cancelled' ? `
                <button class="btn-action-icon action-pay" onclick="App.openPaymentModal(${i.id}, '${i.invoice_number}', ${i.balance_due}, '${cur}')" title="${t('recordPayment')}" aria-label="${t('recordPayment')}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                    <line x1="2" y1="10" x2="22" y2="10"></line>
                  </svg>
                </button>
              ` : ""}
              <button class="btn-action-icon action-danger" onclick="App.deleteInvoice(${i.id})" title="${t('delete')}" aria-label="${t('delete')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
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

        const isLoss = (i.net_profit || 0) < 0;
        const cur = i.currency_symbol || i.currency;

        return `
          <tr>
            <td class="cell-nowrap">
              <a href="#" onclick="App.openInvoiceDashboard(${i.id}); return false;" style="font-weight: 700; color: var(--primary); text-decoration: none;" title="${t('invoiceDashboard')}">
                ${i.invoice_number}
              </a>
            </td>
            <td>
              <a href="#" onclick="App.openCustomerDashboard(${i.customer_id}); return false;" style="font-weight: 600; color: var(--text-main); text-decoration: none;">
                <bdi class="customer-bdi">${i.customer_name}</bdi>
              </a>
            </td>
            <td class="text-muted cell-date">${i.issue_date}</td>
            <td class="text-muted cell-date">${i.due_date}</td>
            <td class="font-bold cell-currency">${formatCurrency(i.total_amount, cur)}</td>
            <td class="text-success cell-currency">${formatCurrency(i.paid_amount, cur)}</td>
            <td class="${i.balance_due > 0 ? 'text-danger font-bold' : 'text-muted'} cell-currency">${formatCurrency(i.balance_due, cur)}</td>
            <td class="${isLoss ? 'text-danger' : 'text-success'} font-semibold cell-currency">${formatCurrency(i.net_profit, cur)}</td>
            <td class="cell-nowrap"><span class="badge ${badgeClass}">${statusText}</span></td>
            <td style="text-align: end;" class="cell-nowrap">
              <div class="table-actions">
                <button class="btn-action-icon action-primary" onclick="App.openInvoiceDashboard(${i.id})" title="${t('viewDashboard')}" aria-label="${t('viewDashboard')}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                </button>
                <button class="btn-action-icon" onclick="App.previewInvoice(${i.id})" title="${t('view')}" aria-label="${t('view')}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                </button>
                <button class="btn-action-icon" onclick="App.openEditInvoiceModal(${i.id})" title="${t('edit')}" aria-label="${t('edit')}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </button>
                ${i.status !== 'paid' && i.status !== 'cancelled' ? `
                  <button class="btn-action-icon action-pay" onclick="App.openPaymentModal(${i.id}, '${i.invoice_number}', ${i.balance_due}, '${cur}')" title="${t('recordPayment')}" aria-label="${t('recordPayment')}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                      <line x1="2" y1="10" x2="22" y2="10"></line>
                    </svg>
                  </button>
                ` : ""}
                <button class="btn-action-icon action-danger" onclick="App.deleteInvoice(${i.id})" title="${t('delete')}" aria-label="${t('delete')}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
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

    tbody.innerHTML = this.customers.map(c => {
      const cur = c.preferred_currency || "EGP";
      const isLoss = (c.total_profit || 0) < 0;
      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <a href="#" onclick="App.openCustomerDashboard(${c.id}); return false;" style="font-weight: 700; color: var(--primary); text-decoration: none; font-size: 13.5px;">
                <bdi class="customer-bdi">${c.name}</bdi>
              </a>
              <span class="badge badge-secondary" style="font-size: 10px; padding: 2px 6px;">${cur}</span>
            </div>
            ${c.notes ? `<span class="text-muted text-xs block">${c.notes}</span>` : ""}
          </td>
          <td class="text-muted cell-nowrap">${c.phone || "-"}</td>
          <td class="text-muted cell-nowrap">${c.email || "-"}</td>
          <td class="font-semibold cell-nowrap">${c.total_orders}</td>
          <td class="font-bold cell-nowrap cell-currency">${formatCurrency(c.total_spent, cur)}</td>
          <td class="${isLoss ? 'text-danger' : 'text-success'} font-semibold cell-nowrap cell-currency">${formatCurrency(c.total_profit, cur)}</td>
          <td class="${c.total_unpaid > 0 ? 'text-danger font-bold' : 'text-muted'} cell-nowrap cell-currency">${formatCurrency(c.total_unpaid, cur)}</td>
          <td style="text-align: end;" class="cell-nowrap">
            <div class="table-actions">
              <button class="btn-action-icon action-primary" onclick="App.openCustomerDashboard(${c.id})" title="${t('view')}" aria-label="${t('view')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              </button>
              <button class="btn-action-icon" onclick="App.openEditCustomerModal(${c.id})" title="${t('edit')}" aria-label="${t('edit')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn-action-icon action-pay" onclick="App.openInvoiceModal(${c.id})" title="${t('newInvoice')}" aria-label="${t('newInvoice')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <button class="btn-action-icon action-danger" onclick="App.deleteCustomer(${c.id})" title="${t('delete')}" aria-label="${t('delete')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
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
      const custCur = cust.preferred_currency || "EGP";
      this.currentCustomerData = { cust, stats, orders, histogram, custCur };

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
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <h2 style="font-size: 22px; font-weight: 800;"><bdi class="customer-bdi">${cust.name}</bdi></h2>
                <span class="badge badge-secondary" style="font-size: 11px;">${custCur}</span>
              </div>
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
        <div class="metrics-grid metrics-grid-3 customer-kpi-grid">
          <div class="metric-card card-accent-primary">
            <span class="metric-card-label">${t("lifetimeSpent")}</span>
            <span class="metric-card-value">${formatCurrency(stats.total_revenue, custCur)}</span>
            <span class="metric-card-sub">${stats.total_orders} ${t("totalOrders")}</span>
          </div>

          <div class="metric-card ${stats.is_loss ? 'card-accent-loss' : 'card-accent-profit'}">
            <span class="metric-card-label">${stats.is_loss ? t("netLoss") : t("lifetimeProfit")}</span>
            <span class="metric-card-value ${stats.is_loss ? 'text-danger' : 'text-success'}">${formatCurrency(stats.total_profit, custCur)}</span>
            <span class="metric-card-sub">${t("profitMargin")}: ${stats.total_revenue > 0 ? ((stats.total_profit / stats.total_revenue) * 100).toFixed(1) : 0}%</span>
          </div>

          <div class="metric-card card-accent-loss">
            <span class="metric-card-label">${t("unpaidBalance")}</span>
            <span class="metric-card-value">${formatCurrency(stats.unpaid_balance, custCur)}</span>
            <span class="metric-card-sub">${stats.unpaid_balance > 0 ? t("statusPending") : t("statusPaid")}</span>
          </div>
        </div>

        <!-- Customer Charts Grid: Donut + Histogram -->
        <div class="dashboard-grid-2">
          <div class="chart-card">
            <div class="chart-card-header">
              <span class="chart-card-title">${t("profitVsCostAndLoss")}</span>
            </div>
            <div class="chart-canvas-wrapper" style="height: 250px; position: relative;">
              <canvas id="customer-donut-canvas" style="width: 100%; height: 100%;"></canvas>
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-card-header">
              <span class="chart-card-title"><bdi class="customer-bdi">${cust.name}</bdi> - ${t("financialPerformance")}</span>
            </div>
            <div class="chart-canvas-wrapper" style="height: 250px; position: relative;">
              <canvas id="customer-hist-canvas" style="width: 100%; height: 100%;"></canvas>
            </div>
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
                  ${futureOrders.map(o => {
                    const oCur = o.currency_symbol || o.currency || custCur;
                    return `
                    <tr>
                      <td class="cell-nowrap"><a href="#" onclick="App.openInvoiceDashboard(${o.id}); return false;" style="font-weight: 700; color: var(--primary);" title="${t('invoiceDashboard')}">${o.invoice_number}</a></td>
                      <td class="text-muted cell-nowrap cell-date">${o.issue_date}</td>
                      <td class="text-muted cell-nowrap cell-date">${o.due_date}</td>
                      <td class="font-bold cell-nowrap cell-currency">${formatCurrency(o.total_amount, oCur)}</td>
                      <td class="cell-nowrap"><span class="badge badge-warning">${o.status}</span></td>
                      <td style="text-align: end;" class="cell-nowrap">
                        <div class="table-actions">
                          <button class="btn-action-icon action-primary" onclick="App.openInvoiceDashboard(${o.id})" title="${t('viewDashboard')}" aria-label="${t('viewDashboard')}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                              <line x1="18" y1="20" x2="18" y2="10"></line>
                              <line x1="12" y1="20" x2="12" y2="4"></line>
                              <line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                          </button>
                          <button class="btn-action-icon" onclick="App.previewInvoice(${o.id})" title="${t('view')}" aria-label="${t('view')}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          </button>
                          <button class="btn-action-icon" onclick="App.openEditInvoiceModal(${o.id})" title="${t('edit')}" aria-label="${t('edit')}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                          <button class="btn-action-icon action-danger" onclick="App.deleteInvoice(${o.id})" title="${t('delete')}" aria-label="${t('delete')}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    `;
                  }).join("")}
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
                  orders.map(o => {
                    const oLoss = (o.net_profit || 0) < 0;
                    const oCur = o.currency_symbol || o.currency || custCur;
                    return `
                      <tr>
                        <td class="cell-nowrap"><a href="#" onclick="App.openInvoiceDashboard(${o.id}); return false;" style="font-weight: 700; color: var(--primary);" title="${t('invoiceDashboard')}">${o.invoice_number}</a></td>
                        <td class="text-muted cell-nowrap cell-date">${o.issue_date}</td>
                        <td class="text-muted cell-nowrap cell-date">${o.due_date}</td>
                        <td class="font-bold cell-nowrap cell-currency">${formatCurrency(o.total_amount, oCur)}</td>
                        <td class="text-success cell-nowrap cell-currency">${formatCurrency(o.paid_amount, oCur)}</td>
                        <td class="${o.balance_due > 0 ? 'text-danger font-bold' : 'text-muted'} cell-nowrap cell-currency">${formatCurrency(o.balance_due, oCur)}</td>
                        <td class="${oLoss ? 'text-danger' : 'text-success'} font-semibold cell-nowrap cell-currency">${formatCurrency(o.net_profit, oCur)}</td>
                        <td class="cell-nowrap"><span class="badge badge-${o.status === 'paid' ? 'success' : (o.status === 'partial' ? 'warning' : 'danger')}">${o.status}</span></td>
                        <td style="text-align: end;" class="cell-nowrap">
                          <div class="table-actions">
                            <button class="btn-action-icon action-primary" onclick="App.openInvoiceDashboard(${o.id})" title="${t('viewDashboard')}" aria-label="${t('viewDashboard')}">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="14"></line>
                              </svg>
                            </button>
                            <button class="btn-action-icon" onclick="App.previewInvoice(${o.id})" title="${t('view')}" aria-label="${t('view')}">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                              </svg>
                            </button>
                            <button class="btn-action-icon" onclick="App.openEditInvoiceModal(${o.id})" title="${t('edit')}" aria-label="${t('edit')}">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                            ${o.status !== 'paid' && o.status !== 'cancelled' ? `
                              <button class="btn-action-icon action-pay" onclick="App.openPaymentModal(${o.id}, '${o.invoice_number}', ${o.balance_due}, '${oCur}')" title="${t('recordPayment')}" aria-label="${t('recordPayment')}">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                                  <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                                  <line x1="2" y1="10" x2="22" y2="10"></line>
                                </svg>
                              </button>
                            ` : ""}
                            <button class="btn-action-icon action-danger" onclick="App.deleteInvoice(${o.id})" title="${t('delete')}" aria-label="${t('delete')}">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Draw Charts after DOM insertion
      this.renderCustomerDetailCharts();
      this.observeChartContainers();

    } catch (e) {
      console.error("Failed to render customer detail:", e);
    }
  },

  renderCustomerDetailCharts() {
    if (!this.currentCustomerData) return;
    const { cust, stats, histogram, custCur } = this.currentCustomerData;
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const tooltip = document.getElementById("chart-tooltip");

    // Render customer donut
    const donutCanvas = document.getElementById("customer-donut-canvas");
    if (donutCanvas && cust) {
      const pieData = (cust.pie_chart || []).map(p => ({
        label: currentLanguage === "ar" && p.label_ar ? p.label_ar : p.label,
        value: p.value,
        color: p.color
      }));
      MiniChartEngine.renderDonut(donutCanvas, pieData, {
        isDark,
        isLoss: stats ? stats.is_loss : false,
        centerLabel: stats && stats.is_loss ? t("netLoss") : t("netProfit"),
        centerValue: stats ? formatCurrency(stats.total_profit, custCur) : "",
        onHover: (item, pct, x, y) => {
          if (!tooltip) return;
          tooltip.style.display = "block";
          tooltip.style.left = `${x + 12}px`;
          tooltip.style.top = `${y - 20}px`;
          tooltip.innerHTML = `<strong>${item.label}</strong><br/>${formatCurrency(item.value, custCur)} (${pct}%)`;
        },
        onLeave: () => { if (tooltip) tooltip.style.display = "none"; }
      });
    }

    // Render customer histogram
    const histCanvas = document.getElementById("customer-hist-canvas");
    if (histCanvas && histogram) {
      MiniChartEngine.renderHistogram(histCanvas, histogram, {
        isDark,
        onHover: (d, x, y) => {
          if (!tooltip) return;
          tooltip.style.display = "block";
          tooltip.style.left = `${x + 12}px`;
          tooltip.style.top = `${y - 20}px`;
          tooltip.innerHTML = `
            <strong>${d.month_label}</strong><br/>
            ${t("totalRevenue")}: ${formatCurrency(d.revenue, custCur)}<br/>
            ${d.profit < 0 ? t("netLoss") : t("netProfit")}: <span style="color: ${d.profit < 0 ? '#EF4444' : '#10B981'}">${formatCurrency(d.profit, custCur)}</span>
          `;
        },
        onLeave: () => { if (tooltip) tooltip.style.display = "none"; }
      });
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
          <td class="text-muted font-mono cell-nowrap">${p.sku || "-"}</td>
          <td class="font-bold cell-nowrap cell-currency">${formatCurrency(p.unit_price)}</td>
          <td class="text-muted cell-nowrap cell-currency">${formatCurrency(p.cost_price)}</td>
          <td class="text-success font-semibold cell-nowrap cell-currency">${formatCurrency(p.margin_per_unit)}</td>
          <td class="font-bold text-center cell-nowrap">${p.stock_quantity}</td>
          <td class="font-semibold cell-nowrap cell-currency">${formatCurrency(p.total_stock_value)}</td>
          <td class="cell-nowrap">${statusBadge}</td>
          <td style="text-align: end;" class="cell-nowrap">
            <div class="table-actions">
              <button class="btn-action-icon action-primary" onclick="App.openRestockModal(${p.id}, '${p.name.replace(/'/g, "\\'")}')" title="${t('restock')}" aria-label="${t('restock')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
              <button class="btn-action-icon" onclick="App.openEditProductModal(${p.id})" title="${t('edit')}" aria-label="${t('edit')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="btn-action-icon action-danger" onclick="App.deleteProduct(${p.id})" title="${t('delete')}" aria-label="${t('delete')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
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

      this.reportsData = data;
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
                <span class="font-bold ${summary.is_loss ? 'text-danger' : 'text-success'}">${summary.is_loss ? t("netLoss") : t("grossProfit")}</span>
                <span class="font-bold ${summary.is_loss ? 'text-danger' : 'text-success'}">${formatCurrency(summary.total_profit)}</span>
              </div>
              <div class="total-row text-muted">
                <span>${t("taxesCollected")} (VAT)</span>
                <span>+${formatCurrency(totalTaxes)}</span>
              </div>
              <div class="total-row grand-total" style="font-size: 18px;">
                <span class="font-bold ${summary.is_loss ? 'text-danger' : 'text-success'}">${summary.is_loss ? t("netLoss") : t("netProfit")}</span>
                <span class="font-bold ${summary.is_loss ? 'text-danger' : 'text-success'}">${formatCurrency(summary.total_profit)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Reports Charts Grid: Donut + Histogram -->
        <div class="dashboard-grid-2">
          <div class="chart-card">
            <div class="chart-card-header">
              <span class="chart-card-title">${t("profitVsCost")}</span>
            </div>
            <div class="chart-canvas-wrapper">
              <canvas id="report-donut-canvas"></canvas>
            </div>
          </div>

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
              <canvas id="report-hist-canvas"></canvas>
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
                ${this.customers.map(c => {
                  const cur = c.preferred_currency || "EGP";
                  return `
                  <tr>
                    <td>
                      <a href="#" onclick="App.openCustomerDashboard(${c.id}); return false;" style="font-weight: 700; color: var(--primary); text-decoration: none;">
                        <bdi class="customer-bdi">${c.name}</bdi>
                      </a>
                    </td>
                    <td>${c.total_orders}</td>
                    <td class="font-bold cell-nowrap cell-currency">${formatCurrency(c.total_spent, cur)}</td>
                    <td class="text-muted cell-nowrap cell-currency">${formatCurrency(c.total_spent - c.total_profit, cur)}</td>
                    <td class="${c.total_profit < 0 ? 'text-danger' : 'text-success'} font-bold cell-nowrap cell-currency">${formatCurrency(c.total_profit, cur)}</td>
                    <td class="cell-nowrap">${c.total_spent > 0 ? ((c.total_profit / c.total_spent) * 100).toFixed(1) : 0}%</td>
                    <td class="${c.total_unpaid > 0 ? 'text-danger font-semibold' : 'text-muted'} cell-nowrap cell-currency">${formatCurrency(c.total_unpaid, cur)}</td>
                  </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;

      this.renderReportsCharts();
      this.observeChartContainers();

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

          <div class="form-grid-3">
            <div class="form-group">
              <label class="form-label">${t("selectCurrency")}</label>
              <select id="settings-currency-preset" class="form-select" onchange="App.onSettingsCurrencyPresetChange(this)">
                ${APP_CURRENCIES.map(curr => {
                  const sym = isAr ? (curr.symbol_ar || curr.symbol) : (curr.symbol_en || curr.symbol);
                  const name = isAr ? curr.name_ar : curr.name_en;
                  return `
                    <option value="${curr.code}" data-symbol="${curr.symbol}" data-symbol-ar="${curr.symbol_ar || curr.symbol}" data-symbol-en="${curr.symbol_en || curr.symbol}" ${(s.currency || 'EGP') === curr.code ? 'selected' : ''}>
                      ${curr.code} - ${name} (${sym})
                    </option>
                  `;
                }).join("")}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">${t("currencyCode")}</label>
              <input type="text" id="settings-currency-code" name="currency" class="form-input" value="${s.currency || 'EGP'}" required />
            </div>
            <div class="form-group">
              <label class="form-label">${t("currencySymbol")}</label>
              <input type="text" id="settings-currency-symbol" name="currency_symbol" class="form-input" value="${s.currency_symbol || (isAr ? 'ج.م' : 'EGP')}" required />
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

  onSettingsCurrencyPresetChange(selectEl) {
    const opt = selectEl.options[selectEl.selectedIndex];
    if (!opt) return;
    const isAr = currentLanguage === "ar";
    const code = selectEl.value;
    const symbol = (isAr ? opt.getAttribute("data-symbol-ar") : opt.getAttribute("data-symbol-en")) || opt.getAttribute("data-symbol") || getCurrencySymbol(code, currentLanguage);
    const codeInput = document.getElementById("settings-currency-code");
    const symInput = document.getElementById("settings-currency-symbol");
    if (codeInput) codeInput.value = code;
    if (symInput) symInput.value = (symbol && symbol !== "undefined") ? symbol : code;
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

  populateCurrencySelect(selectEl, selectedCurrency = "EGP") {
    if (!selectEl) return;
    const isAr = currentLanguage === "ar";
    selectEl.innerHTML = APP_CURRENCIES.map(c => {
      const sym = isAr ? (c.symbol_ar || c.symbol) : (c.symbol_en || c.symbol);
      const name = isAr ? c.name_ar : c.name_en;
      return `
        <option value="${c.code}" data-symbol="${c.symbol}" data-symbol-ar="${c.symbol_ar || c.symbol}" data-symbol-en="${c.symbol_en || c.symbol}" ${c.code === selectedCurrency ? 'selected' : ''}>
          ${c.code} - ${name} (${sym})
        </option>
      `;
    }).join("");
  },

  onInvoiceCustomerSelect(selectEl) {
    const custId = parseInt(selectEl.value);
    if (!custId) return;
    const cust = this.customers.find(c => c.id === custId);
    if (cust && cust.preferred_currency) {
      const currSelect = document.getElementById("inv-currency-select");
      if (currSelect) {
        currSelect.value = cust.preferred_currency;
        this.recalculateInvoiceTotals();
      }
    }
  },

  onInvoiceCurrencyChange() {
    this.recalculateInvoiceTotals();
  },

  openInvoiceModal(prefillCustomerId = null) {
    document.getElementById("inv-edit-id").value = "";
    document.getElementById("invoice-modal-title").textContent = t("newInvoice");

    // Populate customer select
    const select = document.getElementById("inv-customer-select");
    select.innerHTML = `<option value="">${t("selectCustomer")}</option>` +
      this.customers.map(c => `<option value="${c.id}" ${prefillCustomerId === c.id ? 'selected' : ''}>${c.name}</option>`).join("");

    // Populate currency select with customer's preferred currency or settings default
    const prefillCustomer = prefillCustomerId ? this.customers.find(c => c.id === prefillCustomerId) : null;
    const initialCurrency = (prefillCustomer && prefillCustomer.preferred_currency) ? prefillCustomer.preferred_currency : (this.settings.currency || "EGP");
    this.populateCurrencySelect(document.getElementById("inv-currency-select"), initialCurrency);

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

      // Populate currency select with invoice's currency
      this.populateCurrencySelect(document.getElementById("inv-currency-select"), inv.currency || "EGP");

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
    if (this.products.length > 0) {
      productDropdown = `
        <select class="form-select row-product-select" onchange="App.onItemProductSelected(this)" style="font-size: 12px; height: 30px; margin-bottom: 4px;">
          <option value="">${t("selectProduct")}</option>
          ${this.products.map(p => `
            <option value="${p.id}" data-price="${p.unit_price}" data-cost="${p.cost_price}" data-stock="${p.stock_quantity}" ${itemData && itemData.product_id === p.id ? 'selected' : ''}>
              ${p.name} ${isInventoryMode ? `(${t("availableInStock")}: ${p.stock_quantity})` : `(${formatCurrency(p.unit_price)})`}
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

    const currSelect = document.getElementById("inv-currency-select");
    let activeSymbol = null;
    if (currSelect && currSelect.value) {
      const opt = currSelect.options[currSelect.selectedIndex];
      const isAr = currentLanguage === "ar";
      const symFromAttr = opt ? (isAr ? opt.getAttribute("data-symbol-ar") : opt.getAttribute("data-symbol-en")) : null;
      activeSymbol = (symFromAttr && symFromAttr !== "undefined") ? symFromAttr : getCurrencySymbol(currSelect.value, currentLanguage);
    }

    document.getElementById("calc-subtotal").textContent = formatCurrency(subtotal, activeSymbol);
    document.getElementById("calc-total").textContent = formatCurrency(total, activeSymbol);
    document.getElementById("calc-profit").textContent = formatCurrency(profit, activeSymbol);
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

    const currSelect = document.getElementById("inv-currency-select");
    const currency = currSelect && currSelect.value ? currSelect.value : (this.settings.currency || "EGP");
    const opt = currSelect && currSelect.selectedIndex >= 0 ? currSelect.options[currSelect.selectedIndex] : null;
    const isAr = currentLanguage === "ar";
    const symFromOpt = opt ? (isAr ? opt.getAttribute("data-symbol-ar") : opt.getAttribute("data-symbol-en")) : null;
    const currency_symbol = (symFromOpt && symFromOpt !== "undefined") ? symFromOpt : getCurrencySymbol(currency, currentLanguage);

    const payload = {
      customer_id: parseInt(customerId),
      currency,
      currency_symbol,
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

  async openInvoiceDashboard(invoiceId) {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      const data = await res.json();
      if (!data.success) {
        this.showToast("Invoice not found");
        return;
      }

      this.currentInvoiceDashboardData = data.invoice;
      const inv = data.invoice;
      const analytics = inv.analytics || {};
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const isLoss = analytics.is_loss || (inv.net_profit || 0) < 0;

      const cur = inv.currency_symbol || inv.currency;

      // Update modal titles
      const titleEl = document.getElementById("inv-dash-title");
      if (titleEl) {
        titleEl.textContent = `${t("invoiceDashboardTitle")} - ${inv.invoice_number}`;
      }
      const subEl = document.getElementById("inv-dash-subtitle");
      if (subEl) {
        subEl.innerHTML = `<bdi class="customer-bdi">${inv.customer_name}</bdi> • ${inv.issue_date}`;
      }

      const body = document.getElementById("invoice-dashboard-body");
      if (!body) return;

      const profitColorClass = isLoss ? "text-danger" : "text-success";
      const profitCardAccent = isLoss ? "card-accent-loss" : "card-accent-profit";
      const profitLabel = isLoss ? t("netLoss") : t("netProfit");

      body.innerHTML = `
        <!-- Top Metrics Grid -->
        <div class="metrics-grid" style="margin-bottom: 20px;">
          <div class="metric-card card-accent-primary">
            <span class="metric-card-label">${t("totalRevenue")}</span>
            <span class="metric-card-value">${formatCurrency(inv.total_amount, cur)}</span>
            <span class="metric-card-sub">${t("subtotal")}: ${formatCurrency(inv.subtotal, cur)}</span>
          </div>

          <div class="metric-card">
            <span class="metric-card-label">${t("costOfGoods")}</span>
            <span class="metric-card-value">${formatCurrency(inv.cost_total, cur)}</span>
            <span class="metric-card-sub">${(inv.items || []).length} ${t("actions")}</span>
          </div>

          <div class="metric-card ${profitCardAccent}">
            <span class="metric-card-label">${profitLabel}</span>
            <span class="metric-card-value ${profitColorClass}">${formatCurrency(inv.net_profit, cur)}</span>
            <span class="metric-card-sub">${t("profitMargin")}: ${analytics.margin_pct || 0}%</span>
          </div>

          <div class="metric-card ${inv.balance_due > 0 ? 'card-accent-loss' : 'card-accent-profit'}">
            <span class="metric-card-label">${t("balanceDue")}</span>
            <span class="metric-card-value">${formatCurrency(inv.balance_due, cur)}</span>
            <span class="metric-card-sub">${t("paidAmount")}: ${formatCurrency(inv.paid_amount, cur)}</span>
          </div>
        </div>

        <!-- Charts Grid: Donut + Item Breakdown Bars -->
        <div class="dashboard-grid-2">
          <div class="chart-card">
            <div class="chart-card-header">
              <span class="chart-card-title">${t("profitVsCostAndLoss")}</span>
            </div>
            <div class="chart-canvas-wrapper" style="height: 240px; position: relative;">
              <canvas id="invoice-donut-canvas" data-canvas="inv-dash-donut-canvas" style="width: 100%; height: 100%;"></canvas>
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-card-header">
              <span class="chart-card-title">${t("itemProfitBreakdown")}</span>
            </div>
            <div class="chart-canvas-wrapper" style="height: 240px; position: relative;">
              <canvas id="invoice-items-canvas" data-canvas="inv-dash-bars-canvas" style="width: 100%; height: 100%;"></canvas>
            </div>
          </div>
        </div>

        <!-- Line Items Financial Table -->
        <div class="table-card">
          <div class="table-toolbar">
            <h3 style="font-size: 14px; font-weight: 700;">${t("invoiceFinancialBreakdown")}</h3>
          </div>
          <div class="data-table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>${t("itemDescription")}</th>
                  <th>${t("quantity")}</th>
                  <th>${t("unitPrice")}</th>
                  <th>${t("costPrice")}</th>
                  <th>${t("lineTotal")}</th>
                  <th>${t("lineProfit")}</th>
                  <th>${t("profitMargin")}</th>
                </tr>
              </thead>
              <tbody>
                ${(inv.items || []).map(it => {
                  const itLoss = (it.profit || 0) < 0;
                  return `
                    <tr>
                      <td class="font-semibold">${it.description}</td>
                      <td>${it.quantity}</td>
                      <td class="cell-nowrap cell-currency">${formatCurrency(it.unit_price, cur)}</td>
                      <td class="text-muted cell-nowrap cell-currency">${formatCurrency(it.cost_price, cur)}</td>
                      <td class="font-bold cell-nowrap cell-currency">${formatCurrency(it.total, cur)}</td>
                      <td class="${itLoss ? 'text-danger' : 'text-success'} font-semibold cell-nowrap cell-currency">
                        ${formatCurrency(it.profit, cur)}
                      </td>
                      <td>
                        <span class="badge ${itLoss ? 'badge-danger' : 'badge-success'}">
                          ${it.margin_pct || 0}%
                        </span>
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Open Modal
      document.getElementById("modal-invoice-dashboard").classList.add("active");

      // Render Charts
      this.renderInvoiceDashboardCharts();
      this.observeChartContainers();

    } catch (err) {
      console.error("Open invoice dashboard error:", err);
    }
  },

  renderInvoiceDashboardCharts() {
    if (!this.currentInvoiceDashboardData) return;
    const inv = this.currentInvoiceDashboardData;
    const analytics = inv.analytics || {};
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const isLoss = analytics.is_loss || (inv.net_profit || 0) < 0;
    const cur = inv.currency_symbol || inv.currency;
    const tooltip = document.getElementById("chart-tooltip");

    const donutCanvas = document.getElementById("invoice-donut-canvas") || document.getElementById("inv-dash-donut-canvas");
    if (donutCanvas) {
      const pieData = (analytics.pie_chart || []).map(p => ({
        label: currentLanguage === "ar" && p.label_ar ? p.label_ar : p.label,
        value: p.value,
        color: p.color
      }));

      MiniChartEngine.renderDonut(donutCanvas, pieData, {
        isDark,
        isLoss,
        centerLabel: isLoss ? t("netLoss") : t("netProfit"),
        centerValue: formatCurrency(inv.net_profit, cur),
        onHover: (item, pct, x, y) => {
          if (!tooltip) return;
          tooltip.style.display = "block";
          tooltip.style.left = `${x + 12}px`;
          tooltip.style.top = `${y - 20}px`;
          tooltip.innerHTML = `<strong>${item.label}</strong><br/>${formatCurrency(item.value, cur)} (${pct}%)`;
        },
        onLeave: () => { if (tooltip) tooltip.style.display = "none"; }
      });
    }

    const barsCanvas = document.getElementById("invoice-items-canvas") || document.getElementById("inv-dash-bars-canvas");
    if (barsCanvas) {
      MiniChartEngine.renderItemBars(barsCanvas, analytics.item_breakdown || [], {
        isDark,
        onHover: (item, x, y) => {
          if (!tooltip) return;
          tooltip.style.display = "block";
          tooltip.style.left = `${x + 12}px`;
          tooltip.style.top = `${y - 20}px`;
          tooltip.innerHTML = `
            <strong>${item.name}</strong><br/>
            ${t("totalRevenue")}: ${formatCurrency(item.revenue, cur)}<br/>
            ${item.is_loss ? t("netLoss") : t("netProfit")}: <span style="color: ${item.is_loss ? '#EF4444' : '#10B981'}">${formatCurrency(item.profit, cur)}</span> (${item.margin_pct}%)
          `;
        },
        onLeave: () => { if (tooltip) tooltip.style.display = "none"; }
      });
    }
  },

  renderReportsCharts() {
    if (!this.reportsData) return;
    const { summary, histogram, pie_charts } = this.reportsData;
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const tooltip = document.getElementById("chart-tooltip");

    const histCanvas = document.getElementById("report-hist-canvas");
    if (histCanvas && histogram) {
      MiniChartEngine.renderHistogram(histCanvas, histogram, {
        isDark,
        onHover: (d, x, y) => {
          if (!tooltip) return;
          tooltip.style.display = "block";
          tooltip.style.left = `${x + 12}px`;
          tooltip.style.top = `${y - 20}px`;
          tooltip.innerHTML = `
            <strong>${d.month_label}</strong><br/>
            ${t("totalRevenue")}: ${formatCurrency(d.revenue)}<br/>
            ${t("netProfit")}: <span style="color: ${d.profit < 0 ? '#EF4444' : '#10B981'}">${formatCurrency(d.profit)}</span><br/>
            ${t("totalOrders")}: ${d.order_count}
          `;
        },
        onLeave: () => { if (tooltip) tooltip.style.display = "none"; }
      });
    }

    const donutCanvas = document.getElementById("report-donut-canvas");
    if (donutCanvas && pie_charts && pie_charts.profit_cost) {
      MiniChartEngine.renderDonut(donutCanvas, pie_charts.profit_cost, {
        isDark,
        isLoss: summary ? summary.is_loss : false,
        centerLabel: summary && summary.is_loss ? t("netLoss") : t("profitMargin"),
        centerValue: summary && summary.is_loss ? formatCurrency(summary.total_profit) : `${summary ? summary.margin_pct : 0}%`,
        onHover: (item, pct, x, y) => {
          if (!tooltip) return;
          tooltip.style.display = "block";
          tooltip.style.left = `${x + 12}px`;
          tooltip.style.top = `${y - 20}px`;
          tooltip.innerHTML = `
            <strong>${currentLanguage === 'ar' ? (item.label_ar || item.label) : item.label}</strong><br/>
            ${formatCurrency(item.value)} (${pct}%)
          `;
        },
        onLeave: () => { if (tooltip) tooltip.style.display = "none"; }
      });
    }
  },

  previewCurrentInvoiceFromDashboard() {
    if (!this.currentInvoiceDashboardData) return;
    const invId = this.currentInvoiceDashboardData.id;
    this.closeModals();
    this.previewInvoice(invId);
  },

  editCurrentInvoiceFromDashboard() {
    if (!this.currentInvoiceDashboardData) return;
    const invId = this.currentInvoiceDashboardData.id;
    this.closeModals();
    this.openEditInvoiceModal(invId);
  },

  openPaymentModal(invoiceId, invoiceNumber, balanceDue, currencySymbol = null) {
    document.getElementById("pay-inv-id").value = invoiceId;
    document.getElementById("pay-inv-label").textContent = `${invoiceNumber} • ${t("balanceDue")}: ${formatCurrency(balanceDue, currencySymbol)}`;
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
    this.populateCurrencySelect(document.getElementById("cust-currency-select"), this.settings.currency || "EGP");
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
      this.populateCurrencySelect(document.getElementById("cust-currency-select"), c.preferred_currency || this.settings.currency || "EGP");
      document.getElementById("modal-customer-form").classList.add("active");
    } catch (e) {
      console.error("Edit customer error:", e);
    }
  },

  async saveCustomer(e) {
    e.preventDefault();
    const editId = document.getElementById("cust-edit-id").value;
    const currSelect = document.getElementById("cust-currency-select");
    const preferred_currency = currSelect && currSelect.value ? currSelect.value : (this.settings.currency || "EGP");

    const payload = {
      name: document.getElementById("cust-name-input").value.trim(),
      phone: document.getElementById("cust-phone-input").value.trim(),
      email: document.getElementById("cust-email-input").value.trim(),
      address: document.getElementById("cust-address-input").value.trim(),
      preferred_currency,
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
