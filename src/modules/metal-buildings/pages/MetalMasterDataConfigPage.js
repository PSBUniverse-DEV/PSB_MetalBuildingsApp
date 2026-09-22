/**
 * Server Component - MetalMasterDataConfigPage.js
 *
 * Runs on the server. Loads data, then passes it to the View.
 */
import { loadAllRegions, loadAllZipCodes } from "../data/metalMasterDataConfig.actions";
import MetalMasterDataConfigView from "./MetalMasterDataConfigView";

export const dynamic = "force-dynamic";

export default async function MetalMasterDataConfigPage() {
  const [{ regions }, { zipCodes }] = await Promise.all([
    loadAllRegions(),
    loadAllZipCodes(),
  ]);
  return <MetalMasterDataConfigView regions={regions} zipCodes={zipCodes} />;
}