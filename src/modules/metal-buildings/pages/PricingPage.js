import { connection } from "next/server";
<<<<<<< HEAD
import { loadFeatures, loadStyles, loadPricingTypes, loadCategories } from "../data/metalBuildings.actions";
=======
import { loadFeatures } from "../data/metalBuildings.actions";
>>>>>>> 376b02d (feat: add PricingPage and PricingView components for managing metal building pricing features)
import PricingView from "./PricingView";

export default async function PricingPage() {
  await connection();
<<<<<<< HEAD
  const [features, styles, pricingTypes, categories] = await Promise.all([loadFeatures(), loadStyles(), loadPricingTypes(), loadCategories()]);
  return <PricingView features={features} styles={styles} pricingTypes={pricingTypes} categories={categories} />;
=======
  const features = await loadFeatures();
  return <PricingView features={features} />;
>>>>>>> 376b02d (feat: add PricingPage and PricingView components for managing metal building pricing features)
}
