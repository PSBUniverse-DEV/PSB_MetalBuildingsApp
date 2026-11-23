/**
 * orderForm.terms.js
 *
 * Purchaser Agreement copy for the printable Order Form document.
 *
 * Rendered as page 2 of the printed order form (after the order details and
 * any continued items-table pages). Data-only on purpose so the agreement text
 * lives in one place and is printed verbatim.
 */

export const PURCHASER_AGREEMENT = {
  title: "Purchaser Agreement",

  sections: [
    {
      heading: "I. Pricing and Payments",
      paragraphs: [
        "The total purchase price shown in the Totals section of this Order Form is the full amount due for the building, options, and installation services listed.",
        "A deposit or down payment is due when this Order Form is signed, with the remaining balance due as stated prior to delivery or installation.",
        "Deposits and down payments are non-refundable except where prohibited by law. Cancellations within seventy-two (72) hours of scheduled installation, or failure to provide a prepared and level site, will result in a restocking fee equal to 10% of the purchase price or $250, whichever is greater.",
        "Purchaser agrees to pay all amounts due before installation unless other payment terms are agreed to in writing by Seller.",
      ],
    },
    {
      heading: "II. Site Preparation",
      paragraphs: [
        "Purchaser is responsible for providing a prepared and level site, including all necessary grading, drainage, and a suitable installation surface such as concrete or compacted gravel, prior to the scheduled installation date.",
        "Purchaser must ensure clear and unobstructed access for delivery vehicles and installation equipment on the scheduled installation date.",
      ],
    },
    {
      heading: "III. Delivery and Installation",
      paragraphs: [
        "Seller will schedule delivery and installation after the site is confirmed ready and the balance due has been paid.",
        "Delivery and installation dates are estimates and may be affected by weather, permitting, or other conditions beyond Seller's control; Seller is not liable for delays caused by such conditions.",
      ],
    },
    {
      heading: "IV. Permits and Building Codes",
      paragraphs: [
        "Purchaser is responsible for obtaining and maintaining any permits, approvals, and variances required for the structure and for compliance with all applicable building codes, covenants, zoning, and deed restrictions.",
        "Purchaser is responsible for verifying that the structure satisfies any local snow load, wind load, or engineer certification requirements.",
      ],
    },
    {
      heading: "V. Warranty",
      paragraphs: [
        "Seller provides the manufacturer's standard warranty on the structure and its components as set forth in the warranty documentation delivered with the structure.",
        "The warranty does not cover damage resulting from improper site preparation, misuse, alteration, or failure to maintain the structure after installation.",
      ],
    },
    {
      heading: "VI. Cancellation and Refunds",
      paragraphs: [
        "Except as required by law, deposits and down payments are non-refundable once this Order Form is signed.",
        "Cancellations after production or materials ordering has begun may be subject to additional charges, including the restocking fee described in Section I.",
        "Any refund, if applicable, will be issued only after all applicable cancellation or restocking fees have been deducted.",
      ],
    },
    {
      heading: "VII. Entire Agreement and Acceptance",
      paragraphs: [
        "This Order Form together with this Purchaser Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, and agreements, whether written or oral.",
        "By signing this Order Form, Purchaser acknowledges that they have read, understood, and agree to be bound by the terms and conditions of this Purchaser Agreement.",
      ],
    },
  ],
};