import { connection } from "next/server";
import { loadFeatures, loadStyles, loadPricingTypes, loadCategories, loadRegions, loadLegTypes } from "../data/metalBuildings.actions";
import PricingView from "./PricingView";

export default async function PricingPage() {
  await connection();
  const [features, styles, pricingTypes, categories, regions, legTypes] = await Promise.all([
    loadFeatures(),
    loadStyles(),
    loadPricingTypes(),
    loadCategories(),
    loadRegions(),
    loadLegTypes(),
  ]);
  return <PricingView features={features} styles={styles} pricingTypes={pricingTypes} categories={categories} regions={regions} legTypes={legTypes} />;
}
