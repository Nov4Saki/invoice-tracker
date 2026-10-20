/**
 * Bilingual Translation Dictionary and RTL/LTR Manager.
 * Supports Arabic (ar) and English (en).
 */

const translations = {
  ar: {
    // Navigation
    appName: "نظام الفواتير والمحاسبة",
    appSubtitle: "إدارة الفواتير والطلبات والتقارير المالية",
    navDashboard: "لوحة التحكم المالية",
    navInvoices: "الفواتير والطلبات",
    navCustomers: "العملاء وسجل الطلبات",
    navInventory: "المخزون والمنتجات",
    navReports: "التقارير المالية والأرباح",
    navSettings: "الإعدادات",

    // Common Buttons & Actions
    searchPlaceholder: "بحث سريع (العميل، الهاتف، البريد، الفاتورة)...",
    searchShortcut: "Ctrl + K",
    newInvoice: "فاتورة / طلب جديد",
    newCustomer: "عميل جديد",
    newProduct: "منتج جديد",
    save: "حفظ",
    cancel: "إلغاء",
    edit: "تعديل",
    delete: "حذف",
    view: "عرض",
    print: "طباعة",
    downloadPdf: "تحميل PDF",
    downloadImage: "تحميل صورة (PNG)",
    downloadReceipt: "إيصال حراري (صورة)",
    recordPayment: "تسجيل دفعة",
    restock: "إضافة كمية",
    filter: "تصفية",
    actions: "الإجراءات",
    close: "إغلاق",
    confirmDelete: "هل أنت متأكد من الحذف؟ لا يمكن التراجع عن هذا الإجراء.",

    // Dashboard & Metrics
    totalRevenue: "إجمالي الإيرادات",
    totalCost: "إجمالي التكلفة",
    netProfit: "صافي الأرباح",
    profitMargin: "هامش الربح",
    totalUnpaid: "المستحقات غير المحصلة",
    totalPaid: "المبالغ المحصلة",
    activeCustomers: "العملاء النشطون",
    totalOrders: "إجمالي الطلبات",
    averageOrder: "متوسط قيمة الطلب",
    financialPerformance: "الأداء المالي الشهري (الإيرادات والأرباح)",
    profitVsCost: "توزيع الأرباح مقابل التكاليف",
    topCustomers: "أعلى العملاء إيراداً",
    recentOrders: "أحدث الطلبات والفواتير",
    futureOrdersAlert: "طلبات مستقبلية مجدولة",

    // Invoice Statuses
    statusAll: "الكل",
    statusPaid: "مدفوعة",
    statusPending: "معلقة",
    statusPartial: "مدفوعة جزئياً",
    statusDraft: "مسودة",
    statusCancelled: "ملغاة",
    statusFuture: "مستقبلية",

    // Invoice Table & Fields
    invoiceNumber: "رقم الفاتورة",
    customer: "العميل",
    issueDate: "تاريخ الإصدار",
    dueDate: "تاريخ الاستحقاق",
    amount: "المبلغ الإجمالي",
    paidAmount: "المدفوع",
    balanceDue: "المتبقي",
    profit: "الربح",
    status: "الحالة",
    itemDescription: "وصف البند / الصنف",
    unitPrice: "سعر البيع",
    costPrice: "سعر التكلفة",
    quantity: "الكمية",
    lineDiscount: "خصم البند",
    lineTotal: "الإجمالي",
    lineProfit: "ربح الصنف",
    subtotal: "المجموع الفرعي",
    discount: "الخصم الإضافي",
    taxRate: "نسبة الضريبة (VAT %)",
    taxAmount: "مبلغ الضريبة",
    shippingFee: "الشحن / التوصيل",
    totalAmount: "المبلغ المستحق",
    notes: "ملاحظات وشروط الدفع",
    addItem: "+ إضافة بند آخر",
    removeItem: "حذف",
    selectProduct: "-- اختر من المخزون (اختياري) --",

    // Customer Detail & History
    customerDetails: "ملف العميل وسجل الطلبات",
    customerName: "اسم العميل",
    email: "البريد الإلكتروني",
    phone: "رقم الهاتف",
    address: "العنوان",
    customerNotes: "ملاحظات خاصة بالعميل",
    orderHistory: "سجل طلبات العميل",
    futureOrders: "الطلبات المستقبلية القادمة",
    lifetimeSpent: "إجمالي المشتريات",
    lifetimeProfit: "أرباحك من العميل",
    unpaidBalance: "الرصيد المستحق",
    newOrderForCustomer: "+ طلب جديد لهذا العميل",
    editCustomer: "تعديل بيانات العميل",

    // Inventory
    inventoryManagement: "إدارة المخزون والمنتجات",
    productName: "اسم المنتج",
    sku: "كود المنتج (SKU)",
    stockQuantity: "الكمية المتوفرة",
    minAlert: "حد التنبيه بنقص المخزون",
    stockValue: "قيمة المخزون الإجمالية",
    marginPerUnit: "هامش الوحدة",
    inStock: "متوفر",
    lowStock: "مخزون منخفض!",
    outOfStock: "نفذت الكمية!",
    insufficientStockWarning: "تحذير: الكمية المطلوبة غير متوفرة في المخزون!",
    availableInStock: "المتوفر بالمخزن",
    addStock: "زيادة المخزون",
    quantityToAdd: "الكمية المراد إضافتها",

    // Reports
    financialReports: "التقارير المالية التفصيلية",
    periodAll: "كامل الفترة",
    period30Days: "آخر 30 يوماً",
    period90Days: "آخر 90 يوماً",
    periodYear: "هذا العام",
    customerFinancialBreakdown: "تقرير أرباح ومبيعات العملاء",
    invoiceFinancialBreakdown: "تقرير تفاصيل الفواتير وهوامش الربح",
    profitAndLossStatement: "قائمة الدخل المبسطة (الأرباح والخسائر)",
    grossRevenue: "إجمالي المبيعات",
    discountsGiven: "الخصومات الممنوحة",
    cogs: "تكلفة البضاعة المباعة (COGS)",
    grossProfit: "إجمالي الربح التشغيلي",
    taxesCollected: "الضرائب المحصلة",

    // Settings
    settingsTitle: "إعدادات النظام والمتجر",
    businessInfo: "معلومات المنشأة / المتجر",
    businessName: "اسم المؤسسة / المتجر",
    businessEmail: "البريد الإلكتروني التجاري",
    businessPhone: "رقم الهاتف التجاري",
    businessAddress: "عنوان المتجر / المقر",
    taxId: "الرقم الضريبي",
    currencySetting: "العملة ورمزها",
    currencyCode: "رمز العملة (مثال: SAR, USD, EGP)",
    currencySymbol: "رمز العرض (مثال: ر.س, $, ج.م)",
    inventoryModeSetting: "نظام تتبع المخزون (Inventory Tracking)",
    inventoryModeDesc: "عند التفعيل، سيتم ربط الطلبات بالمخزون والتحقق من الكميات وتنبيهك عند نفاد المنتجات.",
    enableInventoryMode: "تفعيل وضع المخزون",
    disableInventoryMode: "تعطيل وضع المخزون (فواتير حرة فقط)",
    languageSetting: "لغة الواجهة",
    themeSetting: "المظهر",
    themeDark: "الوضع الداكن (Dark Mode)",
    themeLight: "الوضع الفاتح (Light Mode)",
    saveSettings: "حفظ الإعدادات",
    settingsSavedSuccess: "تم حفظ الإعدادات بنجاح!",

    // Quick Payment Modal
    paymentForInvoice: "تسجيل دفعة للفاتورة",
    amountToPay: "مبلغ الدفعة",
    paymentSuccess: "تم تسجيل الدفعة بنجاح!",

    // Placeholders & Helpers
    optional: "(اختياري)",
    futureOrderHint: "يمكنك تحديد تاريخ مستقبلي للطلب وتعديله في أي وقت لاحقاً.",
    noRecordsFound: "لا توجد سجلات مطابقة.",
    selectCustomer: "-- اختر العميل --"
  },

  en: {
    // Navigation
    appName: "Invoice Tracker & Accounting",
    appSubtitle: "Manage orders, invoices & track financial health",
    navDashboard: "Financial Dashboard",
    navInvoices: "Invoices & Orders",
    navCustomers: "Customers & History",
    navInventory: "Inventory & Products",
    navReports: "Financial Reports & P&L",
    navSettings: "Settings",

    // Common Buttons & Actions
    searchPlaceholder: "Quick search (Customer, phone, email, invoice #)...",
    searchShortcut: "Ctrl + K",
    newInvoice: "New Invoice / Order",
    newCustomer: "New Customer",
    newProduct: "New Product",
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    view: "View",
    print: "Print",
    downloadPdf: "Download PDF",
    downloadImage: "Download Image (PNG)",
    downloadReceipt: "Thermal Receipt (Image)",
    recordPayment: "Record Payment",
    restock: "Restock",
    filter: "Filter",
    actions: "Actions",
    close: "Close",
    confirmDelete: "Are you sure you want to delete this? This action cannot be undone.",

    // Dashboard & Metrics
    totalRevenue: "Total Revenue",
    totalCost: "Total Cost",
    netProfit: "Net Profit",
    profitMargin: "Profit Margin",
    totalUnpaid: "Outstanding Receivables",
    totalPaid: "Collected Payments",
    activeCustomers: "Active Customers",
    totalOrders: "Total Orders",
    averageOrder: "Avg Order Value",
    financialPerformance: "Monthly Financial Performance (Revenue & Profit)",
    profitVsCost: "Profit vs. Cost Breakdown",
    topCustomers: "Top Customers by Revenue",
    recentOrders: "Recent Orders & Invoices",
    futureOrdersAlert: "Scheduled Future Orders",

    // Invoice Statuses
    statusAll: "All",
    statusPaid: "Paid",
    statusPending: "Pending",
    statusPartial: "Partially Paid",
    statusDraft: "Draft",
    statusCancelled: "Cancelled",
    statusFuture: "Future Orders",

    // Invoice Table & Fields
    invoiceNumber: "Invoice #",
    customer: "Customer",
    issueDate: "Issue Date",
    dueDate: "Due Date",
    amount: "Total Amount",
    paidAmount: "Paid",
    balanceDue: "Balance Due",
    profit: "Profit",
    status: "Status",
    itemDescription: "Item Description",
    unitPrice: "Selling Price",
    costPrice: "Cost Price",
    quantity: "Qty",
    lineDiscount: "Item Discount",
    lineTotal: "Total",
    lineProfit: "Line Profit",
    subtotal: "Subtotal",
    discount: "Extra Discount",
    taxRate: "Tax Rate (%)",
    taxAmount: "Tax Amount",
    shippingFee: "Shipping / Delivery",
    totalAmount: "Grand Total",
    notes: "Notes & Terms",
    addItem: "+ Add Line Item",
    removeItem: "Remove",
    selectProduct: "-- Select from inventory (Optional) --",

    // Customer Detail & History
    customerDetails: "Customer Profile & Order History",
    customerName: "Customer Name",
    email: "Email",
    phone: "Phone Number",
    address: "Address",
    customerNotes: "Customer Notes",
    orderHistory: "Order History",
    futureOrders: "Future Orders",
    lifetimeSpent: "Lifetime Spend",
    lifetimeProfit: "Lifetime Profit",
    unpaidBalance: "Unpaid Balance",
    newOrderForCustomer: "+ New Order for Customer",
    editCustomer: "Edit Customer Info",

    // Inventory
    inventoryManagement: "Inventory & Products Catalog",
    productName: "Product Name",
    sku: "SKU / Code",
    stockQuantity: "Stock Quantity",
    minAlert: "Low Stock Alert Threshold",
    stockValue: "Total Stock Value",
    marginPerUnit: "Unit Margin",
    inStock: "In Stock",
    lowStock: "Low Stock!",
    outOfStock: "Out of Stock!",
    insufficientStockWarning: "Warning: Requested quantity exceeds available stock!",
    availableInStock: "Available in stock",
    addStock: "Add Stock",
    quantityToAdd: "Quantity to add",

    // Reports
    financialReports: "Detailed Financial Reports",
    periodAll: "All Time",
    period30Days: "Last 30 Days",
    period90Days: "Last 90 Days",
    periodYear: "This Year",
    customerFinancialBreakdown: "Customer Profitability & Sales Breakdown",
    invoiceFinancialBreakdown: "Invoice Profit Margins & Breakdown",
    profitAndLossStatement: "Profit & Loss (P&L) Statement",
    grossRevenue: "Gross Sales Revenue",
    discountsGiven: "Discounts Given",
    cogs: "Cost of Goods Sold (COGS)",
    grossProfit: "Gross Operating Profit",
    taxesCollected: "Taxes Collected",

    // Settings
    settingsTitle: "Store & System Settings",
    businessInfo: "Business Information",
    businessName: "Business / Store Name",
    businessEmail: "Business Email",
    businessPhone: "Business Phone",
    businessAddress: "Business Address",
    taxId: "Tax ID / VAT Number",
    currencySetting: "Currency & Symbol",
    currencyCode: "Currency Code (e.g. SAR, USD, EUR)",
    currencySymbol: "Display Symbol (e.g. ر.س, $, €)",
    inventoryModeSetting: "Inventory Tracking Mode",
    inventoryModeDesc: "When enabled, orders validate available stock, deduct inventory on confirmation, and flag shortages.",
    enableInventoryMode: "Enable Inventory Mode",
    disableInventoryMode: "Disable Inventory Mode (Free-form Invoicing)",
    languageSetting: "Language",
    themeSetting: "Theme",
    themeDark: "Dark Mode",
    themeLight: "Light Mode",
    saveSettings: "Save Settings",
    settingsSavedSuccess: "Settings saved successfully!",

    // Quick Payment Modal
    paymentForInvoice: "Record Payment for Invoice",
    amountToPay: "Payment Amount",
    paymentSuccess: "Payment recorded successfully!",

    // Placeholders & Helpers
    optional: "(Optional)",
    futureOrderHint: "You can schedule a future date for this order and edit it anytime before fulfillment.",
    noRecordsFound: "No matching records found.",
    selectCustomer: "-- Select Customer --"
  }
};

let currentLanguage = localStorage.getItem("app_language") || "ar";

function t(key) {
  const langDict = translations[currentLanguage] || translations.ar;
  return langDict[key] || key;
}

function setLanguage(lang) {
  if (lang !== "ar" && lang !== "en") lang = "ar";
  currentLanguage = lang;
  localStorage.setItem("app_language", lang);

  const html = document.documentElement;
  html.setAttribute("lang", lang);
  html.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");

  // Re-translate all elements with data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      el.textContent = t(key);
    }
  });

  // Re-translate placeholders with data-i18n-placeholder
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) {
      el.setAttribute("placeholder", t(key));
    }
  });

  // Re-render active view if app is initialized
  if (window.renderActiveView) {
    window.renderActiveView();
  }
}

// Global currency formatting helper
function formatCurrency(amount, symbol = null) {
  const sym = symbol || window.appCurrencySymbol || (currentLanguage === "ar" ? "ر.س" : "SAR");
  const num = Number(amount || 0);
  const formatted = num.toLocaleString(currentLanguage === "ar" ? "ar-SA" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return currentLanguage === "ar" ? `${formatted} ${sym}` : `${sym} ${formatted}`;
}
