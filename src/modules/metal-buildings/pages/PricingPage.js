import { connection } from "next/server";
import { loadFeatures, loadStyles, loadPricingTypes, loadCategories, loadRegions, loadLegTypes, loadFramings } from "../data/metalBuildings.actions";
import PricingView from "./PricingView";

export default async function PricingPage() {
  await connection();
  const [features, styles, pricingTypes, categories, regions, legTypes, framings] = await Promise.all([
    loadFeatures(),
    loadStyles(),
    loadPricingTypes(),
    loadCategories(),
    loadRegions(),
    loadLegTypes(),
    loadFramings(),
  ]);
  return <PricingView features={features} styles={styles} pricingTypes={pricingTypes} categories={categories} regions={regions} legTypes={legTypes} framings={framings} />;
}
