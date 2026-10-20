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
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 320;
    const height = rect.height || 260;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const total = data.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
    const centerX = width / 2;
    const centerY = height / 2;
    const outerRadius = Math.min(centerX, centerY) * 0.78;
    const innerRadius = outerRadius * 0.58;

    ctx.clearRect(0, 0, width, height);

    if (total <= 0) {
      ctx.fillStyle = "#94A3B8";
      ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t("noRecordsFound") || "No Data", centerX, centerY);
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
      ctx.strokeStyle = options.isDark ? "#131D31" : "#FFFFFF";
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

    ctx.fillStyle = options.isDark ? "#94A3B8" : "#64748B";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(options.centerLabel || (t("totalAmount") || "Total"), centerX, centerY - 10);

    ctx.fillStyle = options.isDark ? "#F8FAFC" : "#0F172A";
    ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
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
   * Render an interactive Multi-Series Financial Histogram (Revenue & Net Profit).
   */
  static renderHistogram(canvas, seriesData, options = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 600;
    const height = rect.height || 260;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (!seriesData || seriesData.length === 0) {
      ctx.fillStyle = "#94A3B8";
      ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(t("noRecordsFound") || "No Data", width / 2, height / 2);
      return;
    }

    const padding = { top: 25, right: 25, bottom: 40, left: 65 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Find max value
    const maxVal = Math.max(
      ...seriesData.map(d => Math.max(Number(d.revenue || 0), Number(d.profit || 0), 100))
    );
    // Round max to neat ceiling
    const roundedMax = Math.ceil(maxVal * 1.15);

    // Draw horizontal grid lines
    const gridLines = 4;
    ctx.lineWidth = 1;
    ctx.strokeStyle = options.isDark ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.06)";
    ctx.fillStyle = options.isDark ? "#64748B" : "#94A3B8";
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
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
      const profVal = Math.max(0, Number(d.profit || 0));

      const revHeight = (revVal / roundedMax) * chartHeight;
      const profHeight = (profVal / roundedMax) * chartHeight;

      const revX = groupCenterX - barWidth - gap / 2;
      const revY = padding.top + chartHeight - revHeight;

      const profX = groupCenterX + gap / 2;
      const profY = padding.top + chartHeight - profHeight;

      // Draw Revenue Bar (Blue gradient or solid)
      ctx.fillStyle = "#3B82F6";
      MiniChartEngine.roundRect(ctx, revX, revY, barWidth, revHeight, 3);
      ctx.fill();

      // Draw Profit Bar (Emerald Green)
      ctx.fillStyle = "#10B981";
      MiniChartEngine.roundRect(ctx, profX, profY, barWidth, profHeight, 3);
      ctx.fill();

      // X-Axis Month Label
      ctx.fillStyle = options.isDark ? "#94A3B8" : "#475569";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(d.month_label || "", groupCenterX, padding.top + chartHeight + 8);

      hitBoxes.push({
        data: d,
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
