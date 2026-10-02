/**
 * orderForm.sample.js
 *
 * Static sample content for the printable Order Form document.
 *
 * ⚠️ DESIGN ONLY — the print document intentionally renders this hard-coded
 * sample (mirroring SampleOrderForm.pdf). Live quote/order data is NOT wired
 * yet. When wiring data later, replace these values with the real order /
 * estimate object (e.g. from buildEstimate()) and remove this sample.
 */

export const SAMPLE_ORDER_FORM = {
  title: "Custom Order",
  orderDate: "Oct 2, 2026",

  company: {
    name: "Premium Steel Buildings, Inc.",
    street: "1810 Troy Avenue",
    cityStateZip: "New Castle, IN 47362",
    phone: "844-387-7246",
    email: "sales@premiumsteelbuildings.com",
    viewOnlineLabel: "View Online",
    viewOnlineUrl: "#",
  },

  designLink: {
    label: "Design Link",
    url: "https://design.idearoom.com/carportview-premium-steel-buildings/?lng=en-US#dcf",
    hash: "c71c3a34285a73d809fb4bd6ad899",
  },

  shipTo: {
    name: "",
    orderNumber: "1790955695670713",
    installAddress: "",
    city: "",
    state: "IN",
    zipCode: "46001",
    email: "",
    phone: "",
    mobile: "",
  },

  buildingInfo: {
    attributes: [
      { label: "Style", value: "Standard" },
      { label: "Roof Overhang", value: '6"' },
      { label: "Roof Style", value: "A-Frame Vertical" },
      { label: "Gauge", value: "14-Gauge Framing" },
      { label: "Leg Style", value: "Standard" },
      { label: "Brace", value: "Standard Brace" },
    ],
    size: {
      width: "24'",
      frameLength: "30'",
      legHeight: "10'",
    },
    colors: [
      { label: "Roof", value: "Tan", hex: "#b89060" },
      { label: "Trim", value: "Tan", hex: "#b89060" },
    ],
    anchoring: [
      { label: "Installation Surface", value: "Concrete" },
      { label: "Engineer Certified", value: "None" },
    ],
  },

  // Line items. unitPrice/price = null renders "-" (as in the sample form).
  items: [
    { label: "Base Price", value: "24'x30'", qty: 1, unitPrice: 5813, price: 5813 },
    { label: "Installation Surface", value: "Concrete", qty: 1, unitPrice: null, price: null },
    { label: "Roof", value: "Tan", qty: 1, unitPrice: null, price: null },
    { label: "Trim Colors", value: "Tan", qty: 1, unitPrice: null, price: null },
    { label: "Roof Style", value: "A-Frame Vertical", qty: 1, unitPrice: 1092, price: 1092 },
    { label: "Roof Pitch", value: "3/12", qty: 1, unitPrice: null, price: null },
    { label: "Roof Overhang", value: '6"', qty: 1, unitPrice: null, price: null },
    { label: "Trusses", value: "Standard", qty: 1, unitPrice: null, price: null },
    { label: "Gauge", value: "14-Gauge Framing", qty: 1, unitPrice: null, price: null },
    { label: "Brace", value: "Standard Brace", qty: 1, unitPrice: null, price: null },
    { label: "Leg Height", value: "10'", qty: 1, unitPrice: 494, price: 494 },
  ],
  additionalFeeItems: [
    { label: "Labor Equipment", value: "", qty: 1, unitPrice: null, price: null },
  ],

  totals: {
    subtotal: 7399,
    taxRate: 0.07,
    taxLabel: "7.00%",
    taxAmount: 517.93,
    totalLabel: "Total Order Amount",
    total: 7916.93,
    remainingDueLabel: "Remaining Due",
    remainingDue: 7916.93,
  },

  signatures: [
    { label: "Customer Signature", dateLabel: "Date", rightLabel: "Desired Delivery Date" },
    { label: "Dealer or Manufacturer Signature", dateLabel: "Date", rightLabel: "Delivery Notes" },
  ],

  buildingImages: {
    title: "Building Images",
    // 2 × 3 grid; the sample form shows 5 rendered views, last cell empty.
    cells: [
      { caption: "Perspective View" },
      { caption: "Front" },
      { caption: "Left Side" },
      { caption: "Right Side" },
      { caption: "Back" },
      { caption: "" },
    ],
  },

  floorPlan: {
    title: "Floor Plan",
    legendTitle: "SYMBOL LEGEND",
    legendEntries: [{ symbol: "open-wall", label: "Open Wall" }],
  },
};
