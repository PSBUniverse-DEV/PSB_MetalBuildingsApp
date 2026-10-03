"use client";

import { formatCurrency } from "../data/metalBuildings.data";
import { SAMPLE_ORDER_FORM } from "./orderForm.sample";
import "./orderForm.css";

// PSB logo with title lockup (served from /public/images).
const PSB_LOGO_SRC = "/images/psb_logo_title.png";

/** Formats a price or renders "-" when the sample has no amount. */
function money(value) {
  return value == null ? "-" : formatCurrency(value);
}

/** Label + underlined fill-in blank (Ship To block). */
function FillField({ label, value, className }) {
  return (
    <div className={`pof-field ${className ?? ""}`}>
      <span className="pof-field-label">{label}</span>
      <span className="pof-field-line">{value ?? ""}</span>
    </div>
  );
}

/** Label left / value right row (Building Info columns). */
function InfoRow({ label, value, chip }) {
  return (
    <div className="pof-bi-row">
      <span className="pof-bi-label">{label}</span>
      <span className="pof-bi-value">
        {value}
        {chip ? <span className="pof-color-chip" style={{ background: chip }} /> : null}
      </span>
    </div>
  );
}

/** Line item row of the Description / Qty / Unit Price / Price table. */
function ItemRow({ item }) {
  return (
    <tr>
      <td className="pof-col-desc">
        {item.label}
        {item.value ? `: ${item.value}` : ""}
      </td>
      <td className="pof-col-qty">{item.qty ?? ""}</td>
      <td className="pof-col-unit">{money(item.unitPrice)}</td>
      <td className="pof-col-price">{money(item.price)}</td>
    </tr>
  );
}

/**
 * Printable Order Form document — 3-page Letter replica of SampleOrderForm.pdf.
 *
 * ⚠️ DESIGN ONLY: renders the hard-coded SAMPLE_ORDER_FORM values. Wiring live
 * quote/order data is a follow-up task (pass the real object via the `order` prop).
 */
export default function OrderFormDocument({ order = SAMPLE_ORDER_FORM }) {
  const {
    title,
    orderDate,
    company,
    designLink,
    shipTo,
    buildingInfo,
    items,
    additionalFeeItems,
    totals,
    signatures,
    buildingImages,
    floorPlan,
  } = order;
  const size = buildingInfo.size;

  return (
    <div className="psb-order-form">
      {/* ── PAGE 1 — ORDER FORM ──────────────────────────────────────── */}
      <section className="psb-order-form-page">
        <header className="pof-header">
          <div className="pof-header-left">
            {/* Plain <img> (eager) so the print-only portal copy always has the
                logo loaded before printing (next/image lazy-loads hidden images). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={PSB_LOGO_SRC}
              alt="Premium Steel Buildings logo"
              width={459}
              height={249}
              className="pof-header-logo"
            />
            <h1 className="pof-title">
              {title} - {orderDate}
            </h1>
          </div>
          <div className="pof-header-right">
            <div className="pof-header-company">
              <div className="pof-header-company-name">{company.name}</div>
              <div>{company.street}</div>
              <div>{company.cityStateZip}</div>
              <div>{company.phone}</div>
              <div className="pof-header-email">{company.email}</div>
            </div>
            <div className="pof-qr-box">
              {/* TODO(order-form): replace with a real QR code for the design link */}
              <div className="pof-qr-code" aria-hidden="true">QR</div>
              <div className="pof-qr-caption">{company.viewOnlineLabel}</div>
            </div>
          </div>
        </header>
        <div className="pof-box">
          <div className="pof-box-header">{designLink.label}</div>
          <div className="pof-design-link-url">
            {designLink.url}
            {designLink.hash ? ` ${designLink.hash}` : ""}
          </div>
        </div>

        <div className="pof-box">
          <div className="pof-box-header">Ship To</div>
          <div className="pof-fields">
            <div className="pof-field-row">
              <FillField label="Name" value={shipTo.name} className="pof-field--grow" />
              <FillField label="Order #" value={shipTo.orderNumber} className="pof-field--grow" />
            </div>
            <div className="pof-field-row">
              <FillField label="Install Address" value={shipTo.installAddress} className="pof-field--grow" />
            </div>
            <div className="pof-field-row">
              <FillField label="City" value={shipTo.city} className="pof-field--half" />
              <FillField label="State" value={shipTo.state} className="pof-field--quarter" />
              <FillField label="Zip Code" value={shipTo.zipCode} className="pof-field--quarter" />
            </div>
            <div className="pof-field-row">
              <FillField label="Email" value={shipTo.email} className="pof-field--half" />
              <FillField label="Phone #" value={shipTo.phone} className="pof-field--quarter" />
              <FillField label="Mobile #" value={shipTo.mobile} className="pof-field--quarter" />
            </div>
          </div>
        </div>

        <div className="pof-box">
          <div className="pof-building-info">
            <div className="pof-bi-col">
              <div className="pof-box-header">Building Info</div>
              {buildingInfo.attributes.map((row) => (
                <InfoRow key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
            <div className="pof-bi-col">
              <div className="pof-box-header">Size</div>
              <div className="pof-size">
                <div className="pof-size-values">
                  <span>{size.width}</span>
                  <span className="pof-size-sep">x</span>
                  <span>{size.frameLength}</span>
                  <span className="pof-size-sep">x</span>
                  <span>{size.legHeight}</span>
                </div>
                <div className="pof-size-captions">
                  <span className="pof-size-caption">Width</span>
                  <span className="pof-size-caption">Frame Length</span>
                  <span className="pof-size-caption">Leg Height</span>
                </div>
              </div>
            </div>
            <div className="pof-bi-col">
              <div className="pof-box-header">Colors</div>
              {buildingInfo.colors.map((row) => (
                <InfoRow key={row.label} label={row.label} value={row.value} chip={row.hex} />
              ))}
            </div>
            <div className="pof-bi-col">
              <div className="pof-box-header">Anchoring &amp; Site Preparation</div>
              {buildingInfo.anchoring.map((row) => (
                <InfoRow key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          </div>
        </div>

        <div className="pof-main-row">
          <div className="pof-items">
            <table>
              <thead>
                <tr>
                  <th className="pof-col-desc">Description</th>
                  <th className="pof-col-qty">Qty</th>
                  <th className="pof-col-unit">Unit Price</th>
                  <th className="pof-col-price">Price</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <ItemRow key={`item-${idx}`} item={item} />
                ))}
                <tr className="pof-items-section">
                  <td colSpan={4}>Additional Fees</td>
                </tr>
                {additionalFeeItems.map((item, idx) => (
                  <ItemRow key={`fee-${idx}`} item={item} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="pof-totals">
            <div className="pof-box-header">Totals</div>
            <div className="pof-totals-body">
              <div className="pof-totals-row">
                <span className="pof-totals-label">Subtotal</span>
                <span className="pof-totals-value">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="pof-totals-row">
                <span className="pof-totals-label">
                  + Sales Tax
                  <span className="pof-totals-sublabel">{totals.taxLabel}</span>
                </span>
                <span className="pof-totals-value">{formatCurrency(totals.taxAmount)}</span>
              </div>
              <div className="pof-totals-row">
                <span className="pof-totals-label">{totals.totalLabel}</span>
                <span className="pof-totals-value">{formatCurrency(totals.total)}</span>
              </div>
              <div className="pof-totals-row">
                <span className="pof-totals-label">{totals.remainingDueLabel}</span>
                <span className="pof-totals-value">{formatCurrency(totals.remainingDue)}</span>
              </div>
            </div>
          </div>
        </div>

        {signatures.map((row) => (
          <div className="pof-signature-row" key={row.label}>
            <div className="pof-signature-field pof-signature-field--wide">
              <span className="pof-signature-label">{row.label}</span>
              <div className="pof-signature-box" />
            </div>
            <div className="pof-signature-field pof-signature-field--narrow">
              <span className="pof-signature-label">{row.dateLabel}</span>
              <div className="pof-signature-box" />
            </div>
            <div className="pof-signature-field pof-signature-field--narrow">
              <span className="pof-signature-label">{row.rightLabel}</span>
              <div className="pof-signature-box" />
            </div>
          </div>
        ))}
      </section>

      {/* ── PAGE 2 — BUILDING IMAGES ─────────────────────────────────── */}
      <section className="psb-order-form-page">
        <div className="pof-box-header-bar">{buildingImages.title}</div>
        <div className="pof-image-grid">
          {buildingImages.cells.map((cell, idx) => (
            <div className="pof-image-cell" key={`view-${idx}`}>
              {cell.caption ? (
                <>
                  <div className="pof-image-caption">{cell.caption}</div>
                  <div
                    className={`pof-image-placeholder ${cell.image ? "pof-image-placeholder--capture" : ""}`}
                  >
                    {cell.image ? (
                      /* Rendered building view captured from the 3D preview */
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cell.image}
                        alt={cell.caption}
                        width={400}
                        height={280}
                        className="pof-image-capture"
                      />
                    ) : (
                      "Building Image"
                    )}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* ── PAGE 3 — FLOOR PLAN ──────────────────────────────────────── */}
      <section className="psb-order-form-page">
        <div className="pof-box-header-bar">{floorPlan.title}</div>
        <div className="pof-floorplan">
          {/* TODO(order-form): render the real floor plan drawing here */}
          <div className="pof-floorplan-placeholder">Floor Plan Drawing</div>
          <div className="pof-legend">
            <div className="pof-legend-title">{floorPlan.legendTitle}</div>
            {floorPlan.legendEntries.map((entry) => (
              <div className="pof-legend-row" key={entry.label}>
                <span className={`pof-legend-swatch pof-legend-swatch--${entry.symbol}`} />
                <span>{entry.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
