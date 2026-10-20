/**
 * Pure Zero-Dependency Canvas/SVG Financial Chart Engine.
 * Supports:
 * 1. Donut / Pie Chart with hover highlights, tooltips, legend, and center summary.
 * 2. Multi-series Financial Histogram (Revenue & Net Profit) with gridlines and tooltips.
 * High-DPI (Retina) crisp rendering and RTL/LTR friendly.
 */

class MiniChartEngine {
  /**
   * Render an interactive Donut / Pie Chart on a canvas element.
   */
  static renderDonut(canvas, data, options = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    // Resize canvas to match display dimensions crisply
    const parent = canvas.parentElement;
    const parentWidth = parent ? parent.clientWidth : 0;
    const parentHeight = parent ? parent.clientHeight : 0;
    const rect = canvas.getBoundingClientRect();
    const width = parentWidth > 0 ? parentWidth : (rect.width > 0 ? rect.width : 320);
    const height = parentHeight > 0 ? parentHeight : (rect.height > 0 ? rect.height : 260);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = Math.min(centerX, centerY) * 0.78;
    const innerRadius = outerRadius * 0.58;

    if (total <= 0) {
      ctx.fillStyle = "#94A3B8";
      ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t("noRecordsFound") || "No Data", centerX, centerY);
      canvas.onmousemove = null;
      canvas.onmouseleave = null;
      return;
    }

    let startAngle = -Math.PI / 2;
    const slices = [];

    // Draw slices
    data.forEach((item, idx) => {
      const sliceAngle = (item.value / total) * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
      ctx.closePath();

      ctx.fillStyle = item.color || MiniChartEngine.getColor(idx);
      ctx.fill();

      // Border between segments
      ctx.lineWidth = 2;
      ctx.strokeStyle = options.isDark ? "#131316" : "#FFFFFF";
      ctx.stroke();

      slices.push({
        item,
        startAngle,
        endAngle,
        pct: ((item.value / total) * 100).toFixed(1)
      });

      startAngle = endAngle;
    });

    // Center Text
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = options.isDark ? "#A1A1AA" : "#64748B";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
    ctx.fillText(options.centerLabel || (t("totalAmount") || "Total"), centerX, centerY - 10);

    ctx.fillStyle = options.isLoss ? "#EF4444" : (options.isDark ? "#F4F4F5" : "#0F172A");
    ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
    const centerVal = options.centerValue !== undefined ? options.centerValue : formatCurrency(total);
    ctx.fillText(centerVal, centerX, centerY + 12);

    // Interactive hover handling
    canvas.onmousemove = (e) => {
      const cRect = canvas.getBoundingClientRect();
      const mx = e.clientX - cRect.left;
      const my = e.clientY - cRect.top;
      const dx = mx - centerX;
      const dy = my - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist >= innerRadius && dist <= outerRadius) {
        let angle = Math.atan2(dy, dx);
        if (angle < -Math.PI / 2) angle += 2 * Math.PI;

        const hit = slices.find(s => {
          let a = angle;
          let sa = s.startAngle;
          let ea = s.endAngle;
          while (a < sa) a += 2 * Math.PI;
          return a >= sa && a <= ea;
        });

        if (hit && options.onHover) {
          options.onHover(hit.item, hit.pct, e.clientX, e.clientY);
        }
      } else {
        if (options.onLeave) options.onLeave();
      }
    };

    canvas.onmouseleave = () => {
      if (options.onLeave) options.onLeave();
    };
  }

  /**
   * Render an interactive Multi-Series Financial Histogram (Revenue & Net Profit / Loss).
   * Accurately distinguishes profits (Emerald #10B981) from losses (Crimson #EF4444).
   */
  static renderHistogram(canvas, seriesData, options = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    const parent = canvas.parentElement;
    const parentWidth = parent ? parent.clientWidth : 0;
    const parentHeight = parent ? parent.clientHeight : 0;
    const rect = canvas.getBoundingClientRect();
    const width = parentWidth > 0 ? parentWidth : (rect.width > 0 ? rect.width : 600);
    const height = parentHeight > 0 ? parentHeight : (rect.height > 0 ? rect.height : 260);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!seriesData || seriesData.length === 0) {
      ctx.fillStyle = "#94A3B8";
      ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t("noRecordsFound") || "No Data", width / 2, height / 2);
      canvas.onmousemove = null;
      canvas.onmouseleave = null;
      return;
    }

    const padding = { top: 25, right: 25, bottom: 40, left: 65 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find max value
    const maxVal = Math.max(
      ...seriesData.map(d => Math.max(Number(d.revenue || 0), Math.abs(Number(d.profit || 0)), 100))
    );
    // Round max to neat ceiling
    const roundedMax = Math.ceil(maxVal * 1.15);

    // Draw horizontal grid lines
    const gridLines = 4;
    ctx.lineWidth = 1;
    ctx.strokeStyle = options.isDark ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.06)";
    ctx.fillStyle = options.isDark ? "#71717A" : "#94A3B8";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";

    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight / gridLines) * i;
      const val = roundedMax * (1 - i / gridLines);

      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      const valLabel = val >= 1000 ? (val / 1000).toFixed(1) + "k" : Math.round(val);
      ctx.fillText(valLabel, padding.left - 8, y);
    }

    // Bar dimensions
    const groupCount = seriesData.length;
    const groupWidth = chartWidth / groupCount;
    const barWidth = Math.min(22, (groupWidth * 0.35));
    const gap = 3;

    const hitBoxes = [];

    seriesData.forEach((d, i) => {
      const groupCenterX = padding.left + i * groupWidth + groupWidth / 2;

      const revVal = Math.max(0, Number(d.revenue || 0));
      const rawProfit = Number(d.profit || 0);
      const isLoss = rawProfit < 0;
      const profMagnitude = Math.abs(rawProfit);

      const revHeight = (revVal / roundedMax) * chartHeight;
      const profHeight = (profMagnitude / roundedMax) * chartHeight;

      const revX = groupCenterX - barWidth - gap / 2;
      const revY = padding.top + chartHeight - revHeight;

      const profX = groupCenterX + gap / 2;
      const profY = padding.top + chartHeight - profHeight;

      // Draw Revenue Bar (Blue)
      ctx.fillStyle = "#3B82F6";
      MiniChartEngine.roundRect(ctx, revX, revY, barWidth, revHeight, 3);
      ctx.fill();

      // Draw Profit or Loss Bar (Emerald #10B981 if profit, Crimson #EF4444 if loss)
      ctx.fillStyle = isLoss ? "#EF4444" : "#10B981";
      MiniChartEngine.roundRect(ctx, profX, profY, barWidth, profHeight, 3);
      ctx.fill();

      // X-Axis Month Label
      ctx.fillStyle = options.isDark ? "#A1A1AA" : "#475569";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
      ctx.fillText(d.month_label || "", groupCenterX, padding.top + chartHeight + 8);

      hitBoxes.push({
        data: d,
        isLoss,
        x: padding.left + i * groupWidth,
        width: groupWidth,
        y: padding.top,
        height: chartHeight
      });
    });

    // Hover tooltip interaction
    canvas.onmousemove = (e) => {
      const cRect = canvas.getBoundingClientRect();
      const mx = e.clientX - cRect.left;
      const my = e.clientY - cRect.top;

      const hit = hitBoxes.find(h => mx >= h.x && mx <= (h.x + h.width) && my >= h.y && my <= (h.y + h.height));
      if (hit && options.onHover) {
        options.onHover(hit.data, e.clientX, e.clientY);
      } else {
        if (options.onLeave) options.onLeave();
      }
    };

    canvas.onmouseleave = () => {
      if (options.onLeave) options.onLeave();
    };
  }

  /**
   * Render an interactive Item-Level Profit/Loss Bar Chart for Invoices or Orders.
   */
  static renderItemBars(canvas, itemsData, options = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    const parent = canvas.parentElement;
    const parentWidth = parent ? parent.clientWidth : 0;
    const parentHeight = parent ? parent.clientHeight : 0;
    const rect = canvas.getBoundingClientRect();
    const width = parentWidth > 0 ? parentWidth : (rect.width > 0 ? rect.width : 540);
    const height = parentHeight > 0 ? parentHeight : (rect.height > 0 ? rect.height : 220);

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!itemsData || itemsData.length === 0) {
      ctx.fillStyle = "#94A3B8";
      ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t("noRecordsFound") || "No Items", width / 2, height / 2);
      canvas.onmousemove = null;
      canvas.onmouseleave = null;
      return;
    }

    const padding = { top: 20, right: 20, bottom: 35, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxVal = Math.max(
      ...itemsData.map(it => Math.max(Number(it.revenue || 0), Math.abs(Number(it.profit || 0)), 50))
    );
    const roundedMax = Math.ceil(maxVal * 1.15);

    const count = itemsData.length;
    const groupWidth = chartWidth / count;
    const barWidth = Math.min(20, (groupWidth * 0.35));
    const gap = 3;

    const hitBoxes = [];

    itemsData.forEach((it, i) => {
      const groupCenterX = padding.left + i * groupWidth + groupWidth / 2;

      const revVal = Math.max(0, Number(it.revenue || 0));
      const rawProfit = Number(it.profit || 0);
      const isLoss = rawProfit < 0;
      const profMagnitude = Math.abs(rawProfit);

      const revHeight = Math.max(2, (revVal / roundedMax) * chartHeight);
      const profHeight = Math.max(2, (profMagnitude / roundedMax) * chartHeight);

      const revX = groupCenterX - barWidth - gap / 2;
      const revY = padding.top + chartHeight - revHeight;

      const profX = groupCenterX + gap / 2;
      const profY = padding.top + chartHeight - profHeight;

      // Revenue bar
      ctx.fillStyle = "#3B82F6";
      MiniChartEngine.roundRect(ctx, revX, revY, barWidth, revHeight, 3);
      ctx.fill();

      // Profit / Loss bar
      ctx.fillStyle = isLoss ? "#EF4444" : "#10B981";
      MiniChartEngine.roundRect(ctx, profX, profY, barWidth, profHeight, 3);
      ctx.fill();

      // Label below (truncate name)
      ctx.fillStyle = options.isDark ? "#A1A1AA" : "#475569";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif";
      let label = it.name || "Item";
      if (label.length > 10) label = label.substring(0, 9) + "...";
      ctx.fillText(label, groupCenterX, padding.top + chartHeight + 6);

      hitBoxes.push({
        data: it,
        isLoss,
        x: padding.left + i * groupWidth,
        width: groupWidth,
        y: padding.top,
        height: chartHeight
      });
    });

    canvas.onmousemove = (e) => {
      const cRect = canvas.getBoundingClientRect();
      const mx = e.clientX - cRect.left;
      const my = e.clientY - cRect.top;
      const hit = hitBoxes.find(h => mx >= h.x && mx <= (h.x + h.width) && my >= h.y && my <= (h.y + h.height));
      if (hit && options.onHover) {
        options.onHover(hit.data, e.clientX, e.clientY);
      } else {
        if (options.onLeave) options.onLeave();
      }
    };

    canvas.onmouseleave = () => {
      if (options.onLeave) options.onLeave();
    };
  }

  static roundRect(ctx, x, y, width, height, radius) {
    if (height < 2) height = 2; // Keep minimal visual height
    radius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  static getColor(index) {
    const palette = [
      "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6",
      "#EC4899", "#06B6D4", "#F97316", "#64748B"
    ];
    return palette[index % palette.length];
  }
}
