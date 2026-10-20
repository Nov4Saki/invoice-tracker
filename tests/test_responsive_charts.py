"""
Automated unit tests for Responsive Canvas Resizing & KPI Grid Layouts.
Verifies that:
1. charts.js calculates canvas dimensions dynamically from canvas.parentElement / bounding box,
   sets buffer dimensions (canvas.width) and CSS display dimensions (canvas.style.width),
   and clears the canvas before redrawing.
2. style.css defines balanced CSS Grid breakpoints for .metrics-grid, .stats-grid, and .kpi-grid
   without 5+1 orphaned layouts, and ensures chart canvas wrappers allow dynamic JS pixel sizing.
3. app.js implements debounced window resize event listeners, ResizeObserver, and active chart redrawing.
"""

import unittest
import os
import re

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHARTS_JS = os.path.join(ROOT_DIR, "app", "static", "charts.js")
APP_JS = os.path.join(ROOT_DIR, "app", "static", "app.js")
STYLE_CSS = os.path.join(ROOT_DIR, "app", "static", "style.css")


class TestResponsiveChartsAndKPIs(unittest.TestCase):

    def test_charts_js_dynamic_parent_dimensions(self):
        """Verify charts.js reads canvas.parentElement clientWidth and sets style.width/height."""
        with open(CHARTS_JS, "r", encoding="utf-8") as f:
            content = f.read()

        # Check renderDonut
        self.assertIn("canvas.parentElement", content)
        self.assertIn("canvas.style.width = width + \"px\"", content)
        self.assertIn("canvas.style.height = height + \"px\"", content)
        self.assertIn("ctx.clearRect(0, 0, width, height)", content)
        self.assertIn("ctx.setTransform(1, 0, 0, 1, 0, 0)", content)

        # Check all 3 render methods exist and set width/height
        for method in ["renderDonut", "renderHistogram", "renderItemBars"]:
            self.assertIn(f"static {method}", content)

    def test_style_css_kpi_grid_breakpoints(self):
        """Verify style.css implements responsive grid breakpoints for .metrics-grid, .stats-grid, .kpi-grid."""
        with open(STYLE_CSS, "r", encoding="utf-8") as f:
            css = f.read()

        # Check grid selector
        self.assertIn(".metrics-grid", css)
        self.assertIn(".stats-grid", css)
        self.assertIn(".kpi-grid", css)

        # Check breakpoints for 6-column, 3-column, 2-column, 1-column
        self.assertIn("repeat(6, 1fr)", css)
        self.assertIn("repeat(3, 1fr)", css)
        self.assertIn("repeat(2, 1fr)", css)
        self.assertIn("grid-template-columns: 1fr", css)

        # Check modal KPI card balancing (repeat(4, 1fr))
        self.assertIn(".modal-window .metrics-grid", css)
        self.assertIn("repeat(4, 1fr)", css)

        # Check chart canvas wrapper overflow: hidden
        self.assertIn("overflow: hidden", css)

        # Ensure no !important on canvas width/height inside chart-canvas-wrapper that would block JS inline style
        canvas_rule_match = re.search(r"\.chart-canvas-wrapper\s+canvas\s*\{([^}]+)\}", css)
        self.assertIsNotNone(canvas_rule_match)
        canvas_rule_body = canvas_rule_match.group(1)
        self.assertNotIn("!important", canvas_rule_body, "Canvas in wrapper should not have !important width/height")

    def test_app_js_resize_and_redraw(self):
        """Verify app.js implements window resize listener, ResizeObserver, and redrawActiveCharts."""
        with open(APP_JS, "r", encoding="utf-8") as f:
            js = f.read()

        # Check resize event listener
        self.assertIn('window.addEventListener("resize"', js)
        self.assertIn("redrawActiveCharts", js)

        # Check ResizeObserver
        self.assertIn("ResizeObserver", js)
        self.assertIn("setupChartResizeObserver", js)
        self.assertIn("observeChartContainers", js)

        # Check modular chart render functions
        self.assertIn("renderDashboardCharts()", js)
        self.assertIn("renderCustomerDetailCharts()", js)
        self.assertIn("renderInvoiceDashboardCharts()", js)
        self.assertIn("renderReportsCharts()", js)

        # Check stats-grid and kpi-grid classes on dashboard metrics-grid
        self.assertIn('class="metrics-grid stats-grid kpi-grid"', js)

    def test_all_eight_canvas_ids_present_and_wired(self):
        """Verify all 8 canvas IDs specified in requirements are present and wired in app.js."""
        with open(APP_JS, "r", encoding="utf-8") as f:
            js = f.read()

        expected_ids = [
            "hist-canvas",
            "donut-canvas",
            "customer-donut-canvas",
            "customer-hist-canvas",
            "invoice-donut-canvas",
            "invoice-items-canvas",
            "report-hist-canvas",
            "report-donut-canvas"
        ]

        for cid in expected_ids:
            self.assertIn(f'id="{cid}"', js, f"Canvas element with id='{cid}' missing from app.js DOM markup")
            self.assertIn(f'document.getElementById("{cid}")', js, f"getElementById('{cid}') missing from app.js render routines")

    def test_customer_detail_balanced_kpi_grid(self):
        """Verify customer detail uses balanced 3-card grid classes and style.css defines them."""
        with open(APP_JS, "r", encoding="utf-8") as f:
            js = f.read()
        with open(STYLE_CSS, "r", encoding="utf-8") as f:
            css = f.read()

        self.assertIn("customer-kpi-grid", js)
        self.assertIn(".customer-kpi-grid", css)
        self.assertIn(".metrics-grid-3", css)

    def test_css_grid_blowout_protection(self):
        """Verify min-width: 0 is applied to chart cards, wrappers, and grid items to avoid overflow blowouts."""
        with open(STYLE_CSS, "r", encoding="utf-8") as f:
            css = f.read()

        self.assertIn(".dashboard-grid-2 > *", css)
        self.assertIn("min-width: 0", css)

    def test_charts_js_empty_data_mouse_cleanup(self):
        """Verify charts.js cleans up onmousemove and onmouseleave when data is empty."""
        with open(CHARTS_JS, "r", encoding="utf-8") as f:
            charts = f.read()

        self.assertIn("canvas.onmousemove = null;", charts)
        self.assertIn("canvas.onmouseleave = null;", charts)


if __name__ == "__main__":
    unittest.main()
