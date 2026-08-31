import { connection } from "next/server";
import { loadFeatures, loadStyles, loadPricingTypes, loadCategories, loadRegions } from "../data/metalBuildings.actions";
import PricingView from "./PricingView";

export default async function PricingPage() {
  await connection();
  const [features, styles, pricingTypes, categories, regions] = await Promise.all([
    loadFeatures(),
    loadStyles(),
    loadPricingTypes(),
    loadCategories(),
    loadRegions(),
  ]);
  return <PricingView features={features} styles={styles} pricingTypes={pricingTypes} categories={categories} regions={regions} />;
}
