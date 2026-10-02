import OrderFormView from "./OrderFormView";

/**
 * Order Form print preview page (design-only, sample data).
 * No server data loading — the document renders SAMPLE_ORDER_FORM until live
 * quote/order data is wired in a follow-up task.
 */
export default function OrderFormPage() {
  return <OrderFormView />;
}
