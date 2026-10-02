/**
 * orderForm.utils.js
 *
 * Builds the printable Order Form data shape (same shape as SAMPLE_ORDER_FORM)
 * from the configurator's live estimate data.
 *
 * Pure and dependency-free on purpose: `estimateDrawer.utils.buildEstimate`
 * calls this and attaches the result as `estimate.orderForm`. Customer-specific
 * fields (name, address, contact, order #, design link) are collected at print
 * time via OrderFormDetailsModal and merged by EstimateDetailsDrawer.
 */

const ORDER_FORM_COMPANY = {
  name: "Premium Steel Buildings, Inc.",
  street: "1810 Troy Avenue",
  cityStateZip: "New Castle, IN 47362",
  phone: "844-387-7246",
  email: "sales@premiumsteelbuildings.com",
  viewOnlineLabel: "View Online",
  viewOnlineUrl: "#",
};

const SIGNATURE_ROWS = [
  { label: "Customer Signature", dateLabel: "Date", rightLabel: "Desired Delivery Date" },
  { label: "Dealer or Manufacturer Signature", dateLabel: "Date", rightLabel: "Delivery Notes" },
];

// Building Images page: 5 rendered views + 1 empty cell (matches the sample form).
const BUILDING_IMAGE_CELLS = [
  { caption: "Perspective View" },
  { caption: "Front" },
  { caption: "Left Side" },
  { caption: "Right Side" },
  { caption: "Back" },
  { caption: "" },
];

const FLOOR_PLAN = {
  title: "Floor Plan",
  legendTitle: "SYMBOL LEGEND",
  legendEntries: [{ symbol: "open-wall", label: "Open Wall" }],
};

// Estimate "Structure Details" rows → Building Info attribute rows.
// [display label, source row label] — source null = taken from elsewhere.
const ATTRIBUTE_ROWS = [
  ["Roof Overhang", "Roof Overhang"],
  ["Roof Style", "Roofing Style"],
  ["Gauge", "Gauge"],
  ["Trusses", "Trusses"],
  ["Brace", "Brace"],
  ["Roof Pitch", "Roof Pitch"],
];

// Estimate "Structure Details" rows → Anchoring & Site Preparation rows.
const ANCHORING_ROWS = ["Installation Surface", "Engineer Certified"];

// Estimate sections rendered as main line items on the order form.
const ITEM_SECTIONS = ["Structure Details", "Doors & Ramps", "Windows & Accessories", "Lean-To Openings"];
const ADDITIONAL_FEE_SECTION = "Additional Options";

function formatOrderDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Estimate row → order form line item (qty 1; "-" when no price, like the sample). */
function toOrderItem(row) {
  const price = Number(row?.price ?? 0);
  return {
    label: row?.label ?? "",
    value: row?.value ?? "",
    qty: 1,
    unitPrice: price > 0 ? price : null,
    price: price > 0 ? price : null,
  };
}

/**
 * Build the order form payload from a live estimate.
 *
 * @param {object} args
 * @param {object} args.params   — subset of buildEstimate params (style, size, zip)
 * @param {Array}  args.sections — estimate sections (from buildEstimate)
 * @param {object} args.summary  — estimate summary (from buildEstimate)
 * @param {Array}  args.colorRows— [{ label, value, hex }] for the Colors column
 */
export function buildOrderForm({ params = {}, sections = [], summary = {}, colorRows = [] }) {
  const { selectedStyle, width, length, height, zipCode, zipCity, zipStateCode } = params;

  // Index Structure Details rows by label for the Building Info columns.
  const structureRows = sections.find((s) => s.title === "Structure Details")?.items ?? [];
  const rowByLabel = new Map(structureRows.map((row) => [row.label, row]));

  const attributes = [
    { label: "Style", value: selectedStyle?.name ?? "" },
    ...ATTRIBUTE_ROWS.map(([label, source]) => ({
      label,
      value: rowByLabel.get(source)?.value ?? "",
    })),
  ].filter((row) => row.value);

  const anchoring = ANCHORING_ROWS.map((label) => ({
    label,
    value: rowByLabel.get(label)?.value ?? "",
  })).filter((row) => row.value);

  const items = sections
    .filter((section) => ITEM_SECTIONS.includes(section.title))
    .flatMap((section) => section.items ?? [])
    .filter((row) => row.label !== "Region")
    .map(toOrderItem);

  const additionalFeeItems = (sections.find((s) => s.title === ADDITIONAL_FEE_SECTION)?.items ?? []).map(toOrderItem);

  const taxRate = Number(summary.taxRate ?? 0);

  return {
    title: "Custom Order",
    orderDate: formatOrderDate(new Date()),
    company: ORDER_FORM_COMPANY,

    // Filled at print time via OrderFormDetailsModal.
    designLink: { label: "Design Link", url: "", hash: "" },

    // City/State/Zip pre-filled from the configurator's ZIP lookup (V1).
    shipTo: {
      name: "",
      orderNumber: "",
      installAddress: "",
      city: zipCity ?? "",
      state: zipStateCode ?? "",
      zipCode: zipCode ?? "",
      email: "",
      phone: "",
      mobile: "",
    },

    buildingInfo: {
      attributes,
      size: {
        width: `${width}'`,
        frameLength: `${length}'`,
        legHeight: `${height}'`,
      },
      colors: colorRows,
      anchoring,
    },

    items,
    additionalFeeItems,

    totals: {
      subtotal: Number(summary.subtotal ?? 0),
      taxRate,
      taxLabel: `${(taxRate * 100).toFixed(2)}%`,
      taxAmount: Number(summary.taxAmount ?? 0),
      totalLabel: "Total Order Amount",
      total: Number(summary.total ?? 0),
      remainingDueLabel: "Remaining Due",
      remainingDue: Number(summary.total ?? 0),
    },

    signatures: SIGNATURE_ROWS,
    buildingImages: { title: "Building Images", cells: BUILDING_IMAGE_CELLS },
    floorPlan: FLOOR_PLAN,
  };
}

/**
 * Generates a placeholder Order # (no orders table exists yet). Editable in the
 * OrderFormDetailsModal — replace with a real order number when persistence lands.
 */
export function generateOrderNumber() {
  return `${Date.now()}${Math.floor(100 + Math.random() * 900)}`;
}
