import { connection } from "next/server";
import { loadFeatures } from "../data/metalBuildings.actions";
import PricingView from "./PricingView";

export default async function PricingPage() {
  await connection();
  const features = await loadFeatures();
  return <PricingView features={features} />;
}
