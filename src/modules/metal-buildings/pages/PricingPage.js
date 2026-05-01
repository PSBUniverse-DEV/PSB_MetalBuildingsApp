import { connection } from "next/server";
import { loadFeatures, loadStyles, loadPricingTypes, loadCategories } from "../data/metalBuildings.actions";
import PricingView from "./PricingView";

export default async function PricingPage() {
  await connection();
  const [features, styles, pricingTypes, categories] = await Promise.all([loadFeatures(), loadStyles(), loadPricingTypes(), loadCategories()]);
  return <PricingView features={features} styles={styles} pricingTypes={pricingTypes} categories={categories} />;
}
