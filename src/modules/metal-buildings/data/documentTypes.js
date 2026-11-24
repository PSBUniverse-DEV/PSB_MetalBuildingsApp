/**
 * Document types stored in metal_s_document (column document_type).
 *
 * Add a new document = add ONE entry below:
 *   - Master Data Config shows an upload card for it automatically;
 *   - with `print.withOrderForm: true` its active (newest) PDF is printed with
 *     the Order Form at `print.position`:
 *       "after-order"  — right after the order page(s)
 *       "after-images" — between Building Images and Floor Plan
 *       "end"          — after the Floor Plan
 *     `print.order` sorts documents sharing a position (low first);
 *     `print.required` shows a warning when nothing is uploaded.
 * Client-safe (no server imports).
 */
export const DOCUMENT_TYPES = {
  PURCHASER_AGREEMENT: "purchaser_agreement",
};

export const PRINT_POSITIONS = ["after-order", "after-images", "end"];

export const DOCUMENT_TYPE_LIST = [
  {
    type: DOCUMENT_TYPES.PURCHASER_AGREEMENT,
    label: "Purchaser Agreement",
    description: "Printed right after the order page(s). The newest PDF is used.",
    accept: "application/pdf",
    print: { withOrderForm: true, position: "after-order", order: 1, required: true },
  },
];

/** Types printed with the Order Form, in print order (position, then order). */
export const PRINTED_DOCUMENT_TYPES = DOCUMENT_TYPE_LIST
  .filter((d) => d.print?.withOrderForm && PRINT_POSITIONS.includes(d.print.position))
  .sort((a, b) =>
    PRINT_POSITIONS.indexOf(a.print.position) - PRINT_POSITIONS.indexOf(b.print.position)
    || (a.print.order ?? 0) - (b.print.order ?? 0));