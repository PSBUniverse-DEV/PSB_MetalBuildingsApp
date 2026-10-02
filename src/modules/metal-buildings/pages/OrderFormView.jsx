"use client";

import Link from "next/link";
import { Button } from "@/shared/components/ui";
import AppIcon from "@/shared/components/ui/AppIcon";
import OrderFormDocument from "../components/OrderFormDocument";
import OrderFormPrintable, { printOrderForm } from "../components/OrderFormPrintable";

/**
 * Order Form print preview — renders the printable document on screen and
 * exposes the Print function.
 *
 * ⚠️ DESIGN ONLY — the document shows SAMPLE_ORDER_FORM placeholder content;
 * live quote/order data is intentionally not wired yet.
 */
export default function OrderFormView() {
  return (
    <div>
      <div
        className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3 pof-screen-toolbar"
        style={{ position: "sticky", top: 0, zIndex: 5, background: "var(--psb-bg, #f4f7fa)", paddingTop: "0.5rem", paddingBottom: "0.5rem" }}
      >
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Link href="/metal-buildings" className="btn btn-outline-secondary btn-sm">
            <AppIcon icon="arrow-left" className="me-1" /> Back to Configurator
          </Link>
          <span className="text-muted small">
            Order Form design preview — shows sample data. Live orders print via the
            Print Order Form button in the configurator&rsquo;s Estimate drawer.
          </span>
        </div>
        <Button onClick={printOrderForm}>
          <AppIcon icon="print" className="me-1" /> Print Order Form
        </Button>
      </div>

      <OrderFormDocument />

      {/* Print-only copy (hidden on screen) used by printOrderForm() */}
      <OrderFormPrintable />
    </div>
  );
}
