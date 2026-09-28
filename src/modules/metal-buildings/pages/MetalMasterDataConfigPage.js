/**
 * Server Component - MetalMasterDataConfigPage.js
 *
 * Runs on the server. Loads data, then passes it to the View.
 */
import { loadAllRegions, loadAllZipCodes, loadAllCategories, loadAllPanelTypes } from "../data/metalMasterDataConfig.actions";
import MetalMasterDataConfigView from "./MetalMasterDataConfigView";

export const dynamic = "force-dynamic";

export default async function MetalMasterDataConfigPage() {
  const [{ regions }, { zipCodes }, { categories }, { panelTypes }] = await Promise.all([
    loadAllRegions(),
    loadAllZipCodes(),
    loadAllCategories(),
    loadAllPanelTypes(),
  ]);
  return <MetalMasterDataConfigView regions={regions} zipCodes={zipCodes} categories={categories} panelTypes={panelTypes} />;
}