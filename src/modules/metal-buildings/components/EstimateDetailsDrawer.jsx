"use client";

import { useState } from "react";
import { Offcanvas } from "react-bootstrap";
import AppIcon from "@/shared/components/ui/AppIcon";
import { formatCurrency } from "../data/metalBuildings.data";

/**
 * Reusable estimate details side drawer.
 *
 * Renders a right-side offcanvas that mirrors the estimate summary layout
 * from the design reference: building title, "Your price", collapsible details
 * grouped by section, and a final subtotal/tax/total summary.
 *
 * @param {object} props
 * @param {boolean} props.show
 * @param {() => void} props.onHide
 * @param {EstimateShape} props.estimate
 */
export default function EstimateDetailsDrawer({ show, onHide, estimate }) {
  const [detailsOpen, setDetailsOpen] = useState(true);

  if (!estimate) return null;

  const {
    title = "Estimate",
    yourPrice = 0,
    disclaimer = "Final pricing, including pricing adjustments, discounts, delivery, and taxes will be provided with final quote prior to purchase.",
    sections = [],
    summary = {},
  } = estimate;

  const safeSubtotal = summary?.subtotal ?? yourPrice ?? 0;
  const safeTotal = summary?.total ?? yourPrice ?? 0;
  const taxRate = summary?.taxRate ?? 0;
  const taxAmount = summary?.taxAmount ?? 0;

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
                        <div>{item.label}</div>
                        {item.value && (
                          <div className="estimate-details-item-value">
                            {item.value}
                          </div>
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
            {taxAmount > 0 && (
              <div className="estimate-details-item">
                <span className="estimate-details-item-label">
                  Estimated Taxes {taxRate > 0 ? `(${(taxRate * 100).toFixed(0)}%)` : ""}
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
          </div>
        </div>
      </Offcanvas.Body>
    </Offcanvas>
  );
}
