/**
 * Invoice Maker, PDF Exporter, and High-Resolution Image Generator.
 * Built with zero external dependencies using pure HTML5 Canvas and native Print API.
 */

class InvoiceMaker {
  /**
   * Render HTML for the on-screen invoice preview modal.
   */
  static renderPreviewHtml(invoice, settings) {
    const isAr = currentLanguage === "ar";
    const cur = invoice.currency_symbol || invoice.currency || settings.currency_symbol || (isAr ? "ج.م" : "EGP");

    const statusBadgeClass = {
      paid: "badge-success",
      partial: "badge-warning",
      pending: "badge-danger",
      draft: "badge-secondary",
      cancelled: "badge-muted"
    }[invoice.status] || "badge-secondary";

    const statusLabel = {
      paid: t("statusPaid"),
      partial: t("statusPartial"),
      pending: t("statusPending"),
      draft: t("statusDraft"),
      cancelled: t("statusCancelled")
    }[invoice.status] || invoice.status;

    let itemsHtml = "";
    (invoice.items || []).forEach((item, idx) => {
      itemsHtml += `
        <tr>
          <td class="text-center">${idx + 1}</td>
          <td>
            <strong>${item.description}</strong>
            ${item.product_sku ? `<span class="text-muted text-xs block">SKU: ${item.product_sku}</span>` : ""}
          </td>
          <td class="text-center">${item.quantity}</td>
          <td class="text-end">${formatCurrency(item.unit_price, cur)}</td>
          ${item.discount > 0 ? `<td class="text-end text-danger">-${formatCurrency(item.discount, cur)}</td>` : `<td class="text-center">-</td>`}
          <td class="text-end font-semibold">${formatCurrency(item.total, cur)}</td>
        </tr>
      `;
    });

    return `
      <div id="invoice-printable-area" class="invoice-sheet">
        <!-- Header -->
        <div class="inv-header">
          <div class="inv-brand">
            <div class="inv-logo-box">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                <line x1="6" y1="8" x2="10" y2="8"></line>
                <line x1="6" y1="12" x2="18" y2="12"></line>
                <line x1="6" y1="16" x2="14" y2="16"></line>
              </svg>
            </div>
            <div>
              <h2 class="inv-title">${settings.business_name || "Invoice"}</h2>
              <p class="text-muted text-xs">${settings.business_address || ""}</p>
              <p class="text-muted text-xs">${settings.business_phone || ""} | ${settings.business_email || ""}</p>
              ${settings.business_tax_id ? `<p class="text-muted text-xs"><strong>${t("taxId")}:</strong> ${settings.business_tax_id}</p>` : ""}
            </div>
          </div>
          <div class="inv-meta text-end">
            <span class="badge ${statusBadgeClass} inv-status-badge">${statusLabel}</span>
            <h3 class="inv-number">${invoice.invoice_number}</h3>
            <p class="text-xs"><strong>${t("issueDate")}:</strong> ${invoice.issue_date}</p>
            <p class="text-xs"><strong>${t("dueDate")}:</strong> ${invoice.due_date}</p>
          </div>
        </div>

        <hr class="inv-divider" />

        <!-- Bill To -->
        <div class="inv-bill-to">
          <div class="bill-col">
            <span class="text-muted text-xs uppercase tracking-wide">${t("customer")}:</span>
            <h4 class="font-bold text-base mt-1"><bdi class="customer-bdi">${invoice.customer_name}</bdi></h4>
            ${invoice.customer_phone ? `<p class="text-xs text-muted">${invoice.customer_phone}</p>` : ""}
            ${invoice.customer_email ? `<p class="text-xs text-muted">${invoice.customer_email}</p>` : ""}
            ${invoice.customer_address ? `<p class="text-xs text-muted">${invoice.customer_address}</p>` : ""}
          </div>
        </div>

        <!-- Items Table -->
        <table class="inv-table">
          <thead>
            <tr>
              <th style="width: 40px;" class="text-center">#</th>
              <th>${t("itemDescription")}</th>
              <th style="width: 70px;" class="text-center">${t("quantity")}</th>
              <th style="width: 100px;" class="text-end">${t("unitPrice")}</th>
              <th style="width: 90px;" class="text-end">${t("discount")}</th>
              <th style="width: 110px;" class="text-end">${t("lineTotal")}</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <!-- Totals & Notes -->
        <div class="inv-footer-grid">
          <div class="inv-notes-box">
            ${invoice.notes ? `
              <div class="notes-card">
                <span class="text-xs font-semibold text-muted">${t("notes")}:</span>
                <p class="text-xs mt-1">${invoice.notes}</p>
              </div>
            ` : ""}
          </div>

          <div class="inv-totals-box">
            <div class="total-row">
              <span class="text-muted">${t("subtotal")}:</span>
              <span>${formatCurrency(invoice.subtotal, cur)}</span>
            </div>
            ${invoice.discount_amount > 0 ? `
              <div class="total-row text-danger">
                <span>${t("discount")}:</span>
                <span>-${formatCurrency(invoice.discount_amount, cur)}</span>
              </div>
            ` : ""}
            ${invoice.tax_amount > 0 ? `
              <div class="total-row">
                <span>${t("taxAmount")} (${invoice.tax_rate}%):</span>
                <span>+${formatCurrency(invoice.tax_amount, cur)}</span>
              </div>
            ` : ""}
            ${invoice.shipping_fee > 0 ? `
              <div class="total-row">
                <span>${t("shippingFee")}:</span>
                <span>+${formatCurrency(invoice.shipping_fee, cur)}</span>
              </div>
            ` : ""}
            <div class="total-row grand-total">
              <strong>${t("totalAmount")}:</strong>
              <strong>${formatCurrency(invoice.total_amount, cur)}</strong>
            </div>
            <div class="total-row mt-2 text-success font-semibold">
              <span>${t("paidAmount")}:</span>
              <span>${formatCurrency(invoice.paid_amount, cur)}</span>
            </div>
            <div class="total-row balance-row ${invoice.balance_due > 0 ? 'text-danger' : 'text-muted'} font-bold">
              <span>${t("balanceDue")}:</span>
              <span>${formatCurrency(invoice.balance_due, cur)}</span>
            </div>
          </div>
        </div>

        <div class="inv-bottom-sign">
          <p class="text-center text-xs text-muted">
            ${isAr ? "شكراً لتعاملكم معنا! نسعد بخدمتكم دائماً." : "Thank you for your business! We appreciate your trust."}
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Export the invoice as a crisp PNG image using pure Canvas 2D API.
   * Works offline with 0 dependencies.
   */
  /**
   * Export the invoice as a crisp PNG image using pure Canvas 2D API.
   * Supports standard full A4-style invoice and authentic thermal receipt.
   * Works offline with 0 dependencies.
   */
  static downloadInvoiceImage(invoice, settings, compact = false) {
    if (compact) {
      InvoiceMaker.downloadThermalReceiptImage(invoice, settings);
      return;
    }

    const isAr = currentLanguage === "ar";
    const cur = invoice.currency_symbol || invoice.currency || settings.currency_symbol || (isAr ? "ج.م" : "EGP");

    const scale = 2; // Retina scale
    const width = 800;
    const itemCount = (invoice.items || []).length;
    const height = 750 + itemCount * 38;

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.direction = isAr ? "rtl" : "ltr";

    const truncate = (text, maxW) => {
      if (!text) return "";
      if (ctx.measureText(text).width <= maxW) return text;
      let s = text;
      while (s.length > 0 && ctx.measureText(s + "...").width > maxW) {
        s = s.slice(0, -1);
      }
      return s + "...";
    };

    // Background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    // Outer border
    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Top Brand Header bar
    ctx.fillStyle = "#1E293B";
    ctx.fillRect(10, 10, width - 20, 8);

    const pad = 35;
    let y = 48;

    // Header: Business Name & Invoice Number
    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
    ctx.textAlign = isAr ? "right" : "left";
    const brandX = isAr ? (width - pad) : pad;
    ctx.fillText(truncate(settings.business_name || "Invoice", 420), brandX, y);

    ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = isAr ? "left" : "right";
    const invNumX = isAr ? pad : (width - pad);
    ctx.fillStyle = "#2563EB";
    ctx.fillText(invoice.invoice_number, invNumX, y);

    y += 24;
    // Sub-header details
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
    ctx.fillStyle = "#64748B";
    ctx.textAlign = isAr ? "right" : "left";
    ctx.fillText(settings.business_phone || "", brandX, y);

    ctx.textAlign = isAr ? "left" : "right";
    ctx.fillText(`${t("issueDate")}: ${invoice.issue_date}`, invNumX, y);

    y += 18;
    ctx.textAlign = isAr ? "right" : "left";
    ctx.fillText(truncate(settings.business_address || "", 420), brandX, y);

    ctx.textAlign = isAr ? "left" : "right";
    ctx.fillText(`${t("dueDate")}: ${invoice.due_date}`, invNumX, y);

    y += 25;
    // Divider
    ctx.strokeStyle = "#E2E8F0";
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();

    y += 25;
    // Customer card box
    ctx.fillStyle = "#F8FAFC";
    MiniChartEngine.roundRect(ctx, pad, y, width - pad * 2, 60, 6);
    ctx.fill();
    ctx.strokeStyle = "#E2E8F0";
    ctx.stroke();

    ctx.fillStyle = "#64748B";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
    ctx.textAlign = isAr ? "right" : "left";
    const billX = isAr ? (width - pad - 16) : (pad + 16);
    ctx.fillText(t("customer") + ":", billX, y + 20);

    ctx.fillStyle = "#0F172A";
    ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(truncate(invoice.customer_name, 350), billX, y + 42);

    if (invoice.customer_phone) {
      ctx.fillStyle = "#64748B";
      ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textAlign = isAr ? "left" : "right";
      const phoneX = isAr ? (pad + 16) : (width - pad - 16);
      ctx.fillText(invoice.customer_phone, phoneX, y + 42);
    }

    y += 80;

    // Items Table Header
    ctx.fillStyle = "#F1F5F9";
    ctx.fillRect(pad, y, width - pad * 2, 32);

    ctx.fillStyle = "#475569";
    ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";

    if (!isAr) {
      ctx.textAlign = "left";
      ctx.fillText("#", pad + 12, y + 20);
      ctx.fillText(t("itemDescription"), pad + 40, y + 20);
      ctx.textAlign = "center";
      ctx.fillText(t("quantity"), width - pad - 230, y + 20);
      ctx.textAlign = "right";
      ctx.fillText(t("unitPrice"), width - pad - 110, y + 20);
      ctx.fillText(t("lineTotal"), width - pad - 12, y + 20);
    } else {
      ctx.textAlign = "right";
      ctx.fillText("#", width - pad - 12, y + 20);
      ctx.fillText(t("itemDescription"), width - pad - 40, y + 20);
      ctx.textAlign = "center";
      ctx.fillText(t("quantity"), pad + 230, y + 20);
      ctx.textAlign = "left";
      ctx.fillText(t("unitPrice"), pad + 110, y + 20);
      ctx.fillText(t("lineTotal"), pad + 12, y + 20);
    }

    y += 32;

    // Items Rows
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
    (invoice.items || []).forEach((item, idx) => {
      ctx.fillStyle = idx % 2 === 1 ? "#FAFAFA" : "#FFFFFF";
      ctx.fillRect(pad, y, width - pad * 2, 32);

      ctx.strokeStyle = "#F1F5F9";
      ctx.beginPath();
      ctx.moveTo(pad, y + 32);
      ctx.lineTo(width - pad, y + 32);
      ctx.stroke();

      ctx.fillStyle = "#1E293B";
      if (!isAr) {
        ctx.textAlign = "left";
        ctx.fillText(String(idx + 1), pad + 12, y + 20);
        ctx.fillText(truncate(item.description, 360), pad + 40, y + 20);
        ctx.textAlign = "center";
        ctx.fillText(String(item.quantity), width - pad - 230, y + 20);
        ctx.textAlign = "right";
        ctx.fillText(formatCurrency(item.unit_price, cur), width - pad - 110, y + 20);
        ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
        ctx.fillText(formatCurrency(item.total, cur), width - pad - 12, y + 20);
        ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
      } else {
        ctx.textAlign = "right";
        ctx.fillText(String(idx + 1), width - pad - 12, y + 20);
        ctx.fillText(truncate(item.description, 360), width - pad - 40, y + 20);
        ctx.textAlign = "center";
        ctx.fillText(String(item.quantity), pad + 230, y + 20);
        ctx.textAlign = "left";
        ctx.fillText(formatCurrency(item.unit_price, cur), pad + 110, y + 20);
        ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
        ctx.fillText(formatCurrency(item.total, cur), pad + 12, y + 20);
        ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
      }
      y += 32;
    });

    y += 20;

    // Totals Section
    const totalsWidth = 260;
    const totalsX = isAr ? pad : (width - pad - totalsWidth);

    const printTotalLine = (label, val, isBold = false, isAccent = false, isDestructive = false) => {
      ctx.font = isBold ? "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" : "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = isDestructive ? "#DC2626" : (isAccent ? "#2563EB" : (isBold ? "#0F172A" : "#64748B"));

      if (isAr) {
        ctx.textAlign = "right";
        ctx.fillText(label, totalsX + totalsWidth, y);
        ctx.textAlign = "left";
        ctx.fillText(val, totalsX, y);
      } else {
        ctx.textAlign = "left";
        ctx.fillText(label, totalsX, y);
        ctx.textAlign = "right";
        ctx.fillText(val, totalsX + totalsWidth, y);
      }
      y += 22;
    };

    printTotalLine(t("subtotal"), formatCurrency(invoice.subtotal, cur));
    if (invoice.discount_amount > 0) {
      printTotalLine(t("discount"), `-${formatCurrency(invoice.discount_amount, cur)}`, false, false, true);
    }
    if (invoice.tax_amount > 0) {
      printTotalLine(`${t("taxAmount")} (${invoice.tax_rate}%)`, `+${formatCurrency(invoice.tax_amount, cur)}`);
    }
    if (invoice.shipping_fee > 0) {
      printTotalLine(t("shippingFee"), `+${formatCurrency(invoice.shipping_fee, cur)}`);
    }

    ctx.strokeStyle = "#CBD5E1";
    ctx.beginPath();
    ctx.moveTo(totalsX, y);
    ctx.lineTo(totalsX + totalsWidth, y);
    ctx.stroke();
    y += 12;

    printTotalLine(t("totalAmount"), formatCurrency(invoice.total_amount, cur), true, true);
    printTotalLine(t("paidAmount"), formatCurrency(invoice.paid_amount, cur), false);

    if (invoice.balance_due > 0) {
      printTotalLine(t("balanceDue"), formatCurrency(invoice.balance_due, cur), true, false, true);
    }

    // Bottom note
    y = height - 35;
    ctx.fillStyle = "#94A3B8";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      isAr ? "شكراً لتعاملكم معنا! نسعد بخدمتكم دائماً." : "Thank you for your business!",
      width / 2,
      y
    );

    // Trigger download
    const link = document.createElement("a");
    link.download = `Invoice-${invoice.invoice_number}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  /**
   * Export an authentic high-contrast thermal receipt image (PNG).
   */
  static downloadThermalReceiptImage(invoice, settings) {
    const isAr = currentLanguage === "ar";
    const cur = invoice.currency_symbol || invoice.currency || settings.currency_symbol || (isAr ? "ج.م" : "EGP");

    const scale = 2;
    const width = 460;
    const itemCount = (invoice.items || []).length;
    const height = 480 + itemCount * 46;

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.direction = isAr ? "rtl" : "ltr";

    // Pure White Receipt Paper Background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#CCCCCC";
    ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, width - 12, height - 12);

    let y = 30;
    const pad = 24;

    const truncate = (text, maxW) => {
      if (!text) return "";
      if (ctx.measureText(text).width <= maxW) return text;
      let s = String(text);
      while (s.length > 0 && ctx.measureText(s + "...").width > maxW) {
        s = s.slice(0, -1);
      }
      return s + "...";
    };

    const drawDashedLine = (currY) => {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#888888";
      ctx.beginPath();
      ctx.moveTo(pad, currY);
      ctx.lineTo(width - pad, currY);
      ctx.stroke();
      ctx.restore();
    };

    // Header: Business Name & Info
    ctx.fillStyle = "#000000";
    ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(settings.business_name || "RECEIPT", width / 2, y);

    y += 18;
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
    ctx.fillStyle = "#333333";
    if (settings.business_phone) {
      ctx.fillText(settings.business_phone, width / 2, y);
      y += 16;
    }
    if (settings.business_address) {
      ctx.fillText(settings.business_address, width / 2, y);
      y += 16;
    }
    if (settings.business_tax_id) {
      ctx.fillText(`${t("taxId")}: ${settings.business_tax_id}`, width / 2, y);
      y += 16;
    }

    y += 6;
    drawDashedLine(y);
    y += 18;

    // Meta details: 2-column key/value
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const drawMetaRow = (leftText, rightText) => {
      ctx.fillStyle = "#333333";
      if (!isAr) {
        ctx.textAlign = "left";
        ctx.fillText(leftText, pad, y);
        ctx.textAlign = "right";
        ctx.fillText(rightText, width - pad, y);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(leftText, width - pad, y);
        ctx.textAlign = "left";
        ctx.fillText(rightText, pad, y);
      }
      y += 16;
    };

    drawMetaRow(t("invoiceNumber") + ":", invoice.invoice_number);
    drawMetaRow(t("issueDate") + ":", invoice.issue_date);
    drawMetaRow(t("customer") + ":", truncate(invoice.customer_name, 230));
    if (invoice.customer_phone) drawMetaRow(t("phone") + ":", truncate(invoice.customer_phone, 200));

    y += 4;
    drawDashedLine(y);
    y += 18;

    // Line items
    (invoice.items || []).forEach(item => {
      ctx.fillStyle = "#000000";
      ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";

      // Item Name
      const itemTitle = truncate(item.description, 390);
      if (!isAr) {
        ctx.textAlign = "left";
        ctx.fillText(itemTitle, pad, y);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(itemTitle, width - pad, y);
      }
      y += 16;

      // Item Quantity x Price = Total
      ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = "#444444";
      const calcText = `${item.quantity} x ${formatCurrency(item.unit_price, cur)}`;
      const totalText = formatCurrency(item.total, cur);

      if (!isAr) {
        ctx.textAlign = "left";
        ctx.fillText(calcText, pad + 10, y);
        ctx.textAlign = "right";
        ctx.fillText(totalText, width - pad, y);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(calcText, width - pad - 10, y);
        ctx.textAlign = "left";
        ctx.fillText(totalText, pad, y);
      }
      y += 20;
    });

    drawDashedLine(y);
    y += 18;

    // Totals
    const drawReceiptTotal = (label, val, isBold = false) => {
      ctx.font = isBold ? "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" : "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = "#000000";
      if (!isAr) {
        ctx.textAlign = "left";
        ctx.fillText(label, pad, y);
        ctx.textAlign = "right";
        ctx.fillText(val, width - pad, y);
      } else {
        ctx.textAlign = "right";
        ctx.fillText(label, width - pad, y);
        ctx.textAlign = "left";
        ctx.fillText(val, pad, y);
      }
      y += 18;
    };

    drawReceiptTotal(t("subtotal"), formatCurrency(invoice.subtotal, cur));
    if (invoice.discount_amount > 0) drawReceiptTotal(t("discount"), `-${formatCurrency(invoice.discount_amount, cur)}`);
    if (invoice.tax_amount > 0) drawReceiptTotal(`${t("taxAmount")} (${invoice.tax_rate}%)`, `+${formatCurrency(invoice.tax_amount, cur)}`);
    if (invoice.shipping_fee > 0) drawReceiptTotal(t("shippingFee"), `+${formatCurrency(invoice.shipping_fee, cur)}`);

    y += 4;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
    y += 16;

    drawReceiptTotal(t("totalAmount"), formatCurrency(invoice.total_amount, cur), true);
    drawReceiptTotal(t("paidAmount"), formatCurrency(invoice.paid_amount, cur));
    if (invoice.balance_due > 0) {
      drawReceiptTotal(t("balanceDue"), formatCurrency(invoice.balance_due, cur), true);
    }

    y += 12;
    drawDashedLine(y);
    y += 24;

    // Thank you message
    ctx.fillStyle = "#666666";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      isAr ? "شكراً لزيارتكم! نسعد بخدمتكم دائماً" : "Thank you for shopping with us!",
      width / 2,
      y
    );

    const link = document.createElement("a");
    link.download = `Receipt-${invoice.invoice_number}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  /**
   * Print / Save to PDF using browser's clean print dialog.
   */
  static printInvoicePdf() {
    window.print();
  }
}
