"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatCurrency } from "../data/metalBuildings.data";
import { SAMPLE_ORDER_FORM } from "./orderForm.sample";
import "./orderForm.css";
import psbLogoTitle from "../../../../public/images/psb_logo_title.png";

// PSB logo with title lockup. Imported so Next bundles it (served from /_next/static).
const PSB_LOGO_SRC = psbLogoTitle.src;

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

// --- Items-table pagination ------------------------------------------------
// CSS reference pixels per inch (for converting the fixed in-based page sizes).
const PX_PER_IN = 96;
// Print page content height: Letter (11in) minus the 2 × 6mm `@page` margins.
const PRINT_PAGE_CONTENT_IN = 11 - 2 * (6 / 25.4);
// Screen preview content height: `.psb-order-form-page` min-height (11in) minus
// its vertical padding (0.45in top + 0.35in bottom).
const SCREEN_PAGE_CONTENT_IN = 11 - 0.45 - 0.35;
// `.pof-items tbody td` height — used only if a real row cannot be measured.
const ROW_FALLBACK_PX = 0.19 * PX_PER_IN;
// `.pof-main-row` bottom margin (the gap before the signature block).
const MAIN_ROW_MARGIN_PX = 8;
// Slack kept in reserve so a chunk never overflows its printed page.
const SAFETY_PX = 28;
// Slack kept on continuation pages (which contain only the table).
const CONT_SAFETY_PX = 12;

/**
 * Flattens line items + lean-to sections + additional fees into one ordered list
 * of row descriptors so the table can be sliced across printed pages. Section
 * headers become `{ kind: "section" }` rows; option/fee lines become
 * `{ kind: "item" }` rows.
 */
function buildTableRows({ items, leantoSections = [], additionalFeeItems = [] }) {
  const rows = [];
  items.forEach((item) => rows.push({ kind: "item", item }));
  leantoSections.forEach((section) => {
    rows.push({ kind: "section", title: section.title });
    section.items.forEach((item) => rows.push({ kind: "item", item }));
  });
  rows.push({ kind: "section", title: "Additional Fees" });
  additionalFeeItems.forEach((item) => rows.push({ kind: "item", item }));
  return rows;
}

/** Description / Qty / Unit Price / Price table for a single printed chunk. */
function ItemsTable({ rows, showContinued }) {
  return (
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
        {rows.map((row, idx) =>
          row.kind === "section" ? (
            <tr className="pof-items-section" key={`section-${idx}`}>
              <td colSpan={4}>{row.title}</td>
            </tr>
          ) : (
            <ItemRow key={`item-${idx}`} item={row.item} />
          )
        )}
        {showContinued ? (
          <tr className="pof-items-continued">
            <td colSpan={4}>Continued on next page…</td>
          </tr>
        ) : null}
      </tbody>
    </table>
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
    leantoSections = [],
    additionalFeeItems,
    totals,
    signatures,
    buildingImages,
    floorPlan,
  } = order;
  const size = buildingInfo.size;

  // Flat, sliceable list of the items-table rows (options + section headers + fees).
  const rows = useMemo(
    () => buildTableRows({ items, leantoSections, additionalFeeItems }),
    [items, leantoSections, additionalFeeItems]
  );

  // Measured pagination: how many rows fit on page 1 vs. each continuation page.
  const [chunkSizes, setChunkSizes] = useState(null);
  const pageRef = useRef(null);
  const mainRowRef = useRef(null);
  const sigWrapRef = useRef(null);

  useLayoutEffect(() => {
    const pageEl = pageRef.current;
    const mainEl = mainRowRef.current;
    const sigEl = sigWrapRef.current;
    // Re-run when the order rows / signatures change so the page split is
    // recomputed against the new content.
    if (!pageEl || !mainEl || !sigEl || rows.length === 0 || signatures.length === 0) return;

    // The print portal is laid out at print width; the on-screen copy uses the
    // screen sheet. Pick the page content height matching the current context.
    const isPrint = Boolean(pageEl.closest(".psb-order-form-print-portal"));
    const contentH = (isPrint ? PRINT_PAGE_CONTENT_IN : SCREEN_PAGE_CONTENT_IN) * PX_PER_IN;

    const pageTop = pageEl.getBoundingClientRect().top;
    const padTop = parseFloat(window.getComputedStyle(pageEl).paddingTop) || 0;
    const aboveH = mainEl.getBoundingClientRect().top - (pageTop + padTop);
    const sigH = sigEl.getBoundingClientRect().height;

    const tableEl = pageEl.querySelector(".pof-items");
    const rowH = tableEl?.querySelector("tbody tr")?.getBoundingClientRect().height || ROW_FALLBACK_PX;
    const theadH = tableEl?.querySelector("thead")?.getBoundingClientRect().height || ROW_FALLBACK_PX;

    // Page 1: the table shares the sheet with the blocks above and the signature
    // block below — reserve exactly that space (plus safety slack). Each chunk
    // also reserves one row for its optional "Continued on next page…" marker.
    const tableBudget = contentH - aboveH - MAIN_ROW_MARGIN_PX - sigH - SAFETY_PX;
    const firstRows = Math.max(1, Math.floor((tableBudget - theadH) / rowH) - 1);
    const contRows = Math.max(1, Math.floor((contentH - CONT_SAFETY_PX - theadH) / rowH) - 1);

    setChunkSizes((prev) =>
      prev && prev.first === firstRows && prev.cont === contRows ? prev : { first: firstRows, cont: contRows }
    );
  }, [rows, signatures]);

  // Slice the flat rows into page-sized chunks (page 1 first, then continuations).
  const chunks = useMemo(() => {
    const first = chunkSizes?.first ?? rows.length;
    const cont = chunkSizes?.cont ?? rows.length;
    const out = [rows.slice(0, first)];
    for (let i = first; i < rows.length; i += cont) out.push(rows.slice(i, i + cont));
    return out;
  }, [rows, chunkSizes]);

  return (
    <div className="psb-order-form">
      {/* ── PAGE 1 — ORDER FORM ──────────────────────────────────────── */}
      <section className="psb-order-form-page" ref={pageRef}>
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

        <div className="pof-main-row" ref={mainRowRef}>
          <div className="pof-items">
            <ItemsTable rows={chunks[0]} showContinued={chunks.length > 1} />
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

        <div className="pof-signature-block" ref={sigWrapRef}>
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
        </div>
      </section>

      {/* ── CONTINUED PAGES — items-table overflow (full-width table only) ── */}
      {chunks.slice(1).map((chunkRows, i) => (
        <section className="psb-order-form-page" key={`cont-${i}`}>
          <div className="pof-items">
            <ItemsTable rows={chunkRows} showContinued={i < chunks.length - 2} />
          </div>
        </section>
      ))}

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
