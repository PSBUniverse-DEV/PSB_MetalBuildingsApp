"use client";

import { useState } from "react";
import { Offcanvas } from "react-bootstrap";
import { Button } from "@/shared/components/ui";
import AppIcon from "@/shared/components/ui/AppIcon";
import { formatCurrency } from "../data/metalBuildings.data";
import OrderFormDetailsModal from "./OrderFormDetailsModal";
import OrderFormPrintable, { printOrderForm } from "./OrderFormPrintable";

/**
 * Reusable estimate details side drawer.
 *
 * Renders a right-side offcanvas that mirrors the estimate summary layout
 * from the design reference: building title, "Your price", collapsible details
 * grouped by section, and a final subtotal/tax/total summary.
 *
 * "Print Order Form" opens OrderFormDetailsModal (Ship-To / order details),
 * captures the 3D building views when `captureViews` is provided, and prints
 * the order form built from the live estimate (`estimate.orderForm`).
 *
 * @param {object} props
 * @param {boolean} props.show
 * @param {() => void} props.onHide
 * @param {EstimateShape} props.estimate
 * @param {(() => Array<{caption: string, image: string}> | null) | null} props.captureViews
 */
export default function EstimateDetailsDrawer({ show, onHide, estimate, captureViews = null }) {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [printOrder, setPrintOrder] = useState(null);

  if (!estimate) return null;

  const {
    title = "Estimate",
    yourPrice = 0,
    disclaimer = "Final pricing, including pricing adjustments, discounts, delivery, and taxes will be provided with final quote prior to purchase.",
    sections = [],
    summary = {},
  } = estimate;

  const safeSubtotal = summary?.subtotal ?? yourPrice ?? 0;
  const safeRegionAdjustment = summary?.regionAdjustment ?? 0;
  const safeTotal = summary?.total ?? yourPrice ?? 0;
  const taxRate = summary?.taxRate ?? 0;
  const taxAmount = summary?.taxAmount ?? 0;
  const deposit = summary?.deposit ?? 0;
  const discount = summary?.discount ?? 0;
  const depositDueNow = summary?.depositDueNow ?? deposit;
  const dueUponDelivery = summary?.dueUponDelivery ?? safeTotal;

  const orderForm = estimate?.orderForm ?? null;

  function handlePrintClick() {
    if (!orderForm) {
      // Fallback: sample document (buildEstimate normally returns orderForm).
      printOrderForm();
      return;
    }
    setShowDetailsModal(true);
  }

  function handleDetailsConfirm(details) {
    setShowDetailsModal(false);

    // Capture the 3D building views when the configurator provides a capture fn.
    let cells = orderForm.buildingImages?.cells ?? [];
    try {
      const captured = typeof captureViews === "function" ? captureViews() : null;
      if (Array.isArray(captured) && captured.length > 0) {
        cells = [...captured, { caption: "" }];
      }
    } catch {
      // Keep placeholder cells when capture fails.
    }

    setPrintOrder({
      ...orderForm,
      shipTo: {
        ...orderForm.shipTo,
        name: details.name,
        installAddress: details.installAddress,
        city: details.city,
        state: details.state,
        zipCode: details.zipCode,
        email: details.email,
        phone: details.phone,
        mobile: details.mobile,
        orderNumber: details.orderNumber,
      },
      designLink: { ...orderForm.designLink, url: details.designUrl, hash: "" },
      buildingImages: { ...orderForm.buildingImages, cells },
    });

    // Give React a tick to render the print portal before opening the dialog.
    window.setTimeout(() => printOrderForm(), 80);
  }

  return (
    <Offcanvas
      show={show}
      onHide={onHide}
      placement="end"
      scroll
      backdrop
      className="estimate-details-drawer"
    >
      <Offcanvas.Header className="estimate-details-header">
        <Offcanvas.Title className="fw-bold fs-6">Estimate</Offcanvas.Title>
        {/* Print Order Form — opens details modal, then prints the live order form */}
        <Button size="sm" variant="outline-secondary" onClick={handlePrintClick}>
          <AppIcon icon="print" className="me-1" /> Print Order Form
        </Button>
        <button
          type="button"
          className="btn-close"
          onClick={onHide}
          aria-label="Close"
        />
      </Offcanvas.Header>

      <Offcanvas.Body className="p-0 estimate-details-body">
        <div className="estimate-details-content">
          <p className="estimate-details-disclaimer">{disclaimer}</p>

          <div className="estimate-details-building">
            <h5 className="fw-bold mb-1">{title}</h5>
            <div className="text-muted small">Your price</div>
            <div className="estimate-details-price">{formatCurrency(yourPrice)}</div>
          </div>

          <button
            type="button"
            className="estimate-details-toggle"
            onClick={() => setDetailsOpen((open) => !open)}
          >
            <span>{detailsOpen ? "Hide Details" : "Show Details"}</span>
            <AppIcon
              icon={detailsOpen ? "chevron-up" : "chevron-down"}
              size="sm"
              className="ms-1"
            />
          </button>

          {detailsOpen && (
            <div className="estimate-details-sections">
              {sections.map((section) => (
                <div key={section.title} className="estimate-details-section">
                  <div className="estimate-details-section-title">
                    {section.title}
                  </div>
                  {section.items.map((item, idx) => (
                    <div
                      key={idx}
                      className={`estimate-details-item ${item.indent ? "ps-3" : ""}`}
                    >
                      <div className="estimate-details-item-label">
                        <span>{item.label}</span>
                        {item.value && (
                          <>
                            <span className="estimate-details-item-sep">:&nbsp;</span>
                            <span className="estimate-details-item-value">
                              {item.value}
                            </span>
                          </>
                        )}
                      </div>
                      {item.price != null && (
                        <div className="estimate-details-item-price">
                          {formatCurrency(item.price)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="estimate-details-summary">
            <div className="estimate-details-item">
              <span className="estimate-details-item-label">Subtotal</span>
              <span className="estimate-details-item-price">
                {formatCurrency(safeSubtotal)}
              </span>
            </div>
            {safeRegionAdjustment !== 0 && (
              <div className="estimate-details-item">
                <span className="estimate-details-item-label">Region Adjustment</span>
                <span className="estimate-details-item-price">
                  {formatCurrency(safeRegionAdjustment)}
                </span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="estimate-details-item">
                <span className="estimate-details-item-label">
                  Estimated Taxes {taxRate > 0 ? `(${(taxRate * 100).toFixed(2)}%)` : ""}
                </span>
                <span className="estimate-details-item-price">
                  {formatCurrency(taxAmount)}
                </span>
              </div>
            )}
            <div className="estimate-details-total">
              <span>Total Estimate</span>
              <span>{formatCurrency(safeTotal)}</span>
            </div>
            {deposit > 0 && (
              <>
                <div className="estimate-details-total">
                  <span>Due Today</span>
                  <span>{formatCurrency(deposit)}</span>
                </div>
                {discount > 0 && (
                  <div className="estimate-details-item">
                    <span className="estimate-details-item-label">Deposit Discounts</span>
                    <span className="estimate-details-item-price">
                      -{formatCurrency(discount)}
                    </span>
                  </div>
                )}
                <div className="estimate-details-total">
                  <span>Deposit Amount Due Now</span>
                  <span>{formatCurrency(depositDueNow)}</span>
                </div>
                <div className="estimate-details-total">
                  <span>Due Upon Delivery</span>
                  <span>{formatCurrency(dueUponDelivery)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </Offcanvas.Body>

      {/* Order details entry — mounted fresh each time so the draft re-seeds */}
      {showDetailsModal && orderForm && (
        <OrderFormDetailsModal
          show
          onHide={() => setShowDetailsModal(false)}
          onConfirm={handleDetailsConfirm}
          initial={orderForm.shipTo}
        />
      )}

      {/* Print-only Order Form document (hidden on screen, see printOrderForm) */}
      <OrderFormPrintable order={printOrder ?? undefined} />
    </Offcanvas>
  );
}
