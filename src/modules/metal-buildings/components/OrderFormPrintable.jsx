"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import OrderFormDocument from "./OrderFormDocument";
import { SAMPLE_ORDER_FORM } from "./orderForm.sample";

export const ORDER_FORM_PRINT_MODE_CLASS = "order-form-print-mode";

// Client-only detection for the portal (document.body is unavailable during SSR).
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Opens the browser print dialog for the Order Form document.
 *
 * Toggles `order-form-print-mode` on <body> so orderForm.css can isolate the
 * print-only portal (everything else on screen is hidden while printing).
 */
export function printOrderForm() {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const cleanup = () => {
    document.body.classList.remove(ORDER_FORM_PRINT_MODE_CLASS);
    window.removeEventListener("afterprint", cleanup);
  };

  document.body.classList.add(ORDER_FORM_PRINT_MODE_CLASS);
  window.addEventListener("afterprint", cleanup);
  window.print();
  // Safety net for browsers that never fire `afterprint` on cancel.
  window.setTimeout(cleanup, 1000);
}

/**
 * Print-only copy of the Order Form document, portaled to <body> so print CSS
 * can hide the whole app shell and print just the document. Hidden on screen.
 *
 * ⚠️ DESIGN ONLY — renders SAMPLE_ORDER_FORM until live data is wired.
 */
export default function OrderFormPrintable({ order = SAMPLE_ORDER_FORM }) {
  const mounted = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);

  if (!mounted) return null;

  return createPortal(
    <div className="psb-order-form-print-portal">
      <OrderFormDocument order={order} />
    </div>,
    document.body
  );
}
