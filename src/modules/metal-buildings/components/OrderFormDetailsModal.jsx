"use client";

import { useState } from "react";
import { Button, Input, Modal } from "@/shared/components/ui";
import { generateOrderNumber } from "./orderForm.utils";
import "./estimateDrawer.css";

function emptyDraft(initial = {}) {
  return {
    name: initial.name ?? "",
    installAddress: initial.installAddress ?? "",
    city: initial.city ?? "",
    state: initial.state ?? "",
    zipCode: initial.zipCode ?? "",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    mobile: initial.mobile ?? "",
    // Auto-generated placeholder (no orders table yet) — editable.
    orderNumber: initial.orderNumber || generateOrderNumber(),
    designUrl: initial.designUrl ?? "",
  };
}

/**
 * Pre-print Order Form details modal.
 *
 * Collects Ship-To / customer info + Order # + optional Design Link before the
 * order form is printed. City / State / Zip pre-fill from the configurator's
 * ZIP lookup when available (V1).
 *
 * Mount this conditionally (or with a changing `key`) so the draft re-seeds
 * each time it opens.
 *
 * @param {object} props
 * @param {boolean} props.show
 * @param {() => void} props.onHide
 * @param {(details: object) => void} props.onConfirm
 * @param {object} props.initial — pre-fill values (orderForm.shipTo etc.)
 */
export default function OrderFormDetailsModal({ show = true, onHide, onConfirm, initial = {} }) {
  const [draft, setDraft] = useState(() => emptyDraft(initial));

  const setField = (key) => (e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <Modal
      show={show}
      onHide={onHide}
      dialogClassName="order-form-details-dialog"
      title="Order Form Details"
      footer={
        <>
          <Button variant="secondary" onClick={onHide}>Cancel</Button>
          <Button onClick={() => onConfirm(draft)}>Print Order Form</Button>
        </>
      }
    >
      <p className="text-muted small">
        Confirm the customer and order details to print. Building configuration and pricing
        come from the current estimate.
      </p>
      <div className="row g-3">
        <div className="col-6">
          <Input label="Name" value={draft.name} onChange={setField("name")} placeholder="Customer name" />
        </div>
        <div className="col-6">
          <Input label="Order #" value={draft.orderNumber} onChange={setField("orderNumber")} />
        </div>
        <div className="col-12">
          <Input label="Install Address" value={draft.installAddress} onChange={setField("installAddress")} placeholder="Street address" />
        </div>
        <div className="col-6">
          <Input label="City" value={draft.city} onChange={setField("city")} />
        </div>
        <div className="col-3">
          <Input label="State" value={draft.state} onChange={setField("state")} />
        </div>
        <div className="col-3">
          <Input label="Zip Code" value={draft.zipCode} onChange={setField("zipCode")} />
        </div>
        <div className="col-6">
          <Input label="Email" type="email" value={draft.email} onChange={setField("email")} />
        </div>
        <div className="col-3">
          <Input label="Phone #" value={draft.phone} onChange={setField("phone")} />
        </div>
        <div className="col-3">
          <Input label="Mobile #" value={draft.mobile} onChange={setField("mobile")} />
        </div>
        <div className="col-12">
          <Input label="Design Link (optional)" value={draft.designUrl} onChange={setField("designUrl")} placeholder="https://design.idearoom.com/..." />
        </div>
      </div>
    </Modal>
  );
}
