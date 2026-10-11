// ─── MODULE IMAGE REGISTRY ────────────────────────────────
// Bundled images for the metal-buildings module. Files live in ../Images and
// are bundled by Next (served from /_next/static), so they need no /public
// files. Database image paths (e.g. metal_s_leanto_side.image_path) may point
// at these source files — e.g. "src\modules\metal-buildings\Images\icon-carportview-aframeV.png"
// — and are resolved by filename (case-insensitive). To add an image: drop
// the file in ../Images, import it, and add it here.
import iconAframe from "../Images/icon-carportview-aframe.png";
import iconAframeV from "../Images/icon-carportview-aframeV.png";
import iconBarn from "../Images/icon-carportview-barn.png";
import iconGarage from "../Images/icon-carportview-garage.png";
import iconLeanto from "../Images/icon-carportview-leanto.png";
import iconLoafingShed from "../Images/icon-carportview-loafing-shed.png";
import iconPsb from "../Images/icon-carportview-psb.png";
import iconRegular from "../Images/icon-carportview-regular.png";
import iconSupplierCommercial1 from "../Images/icon-carportview-supplier-premium-steel-buildings-commercial-1774016467403 (1).png";
import iconSupplierCommercial from "../Images/icon-carportview-supplier-premium-steel-buildings-commercial-1774016467403.png";
import iconSupplierLoafingShed from "../Images/icon-carportview-supplier-premium-steel-buildings-loafing-shed-1774016472888.png";
import iconSupplierRvCover from "../Images/icon-carportview-supplier-premium-steel-buildings-rv-cover-1774016468985.png";
import iconSupplierSingleSlope from "../Images/icon-carportview-supplier-premium-steel-buildings-single-slope-1774016472315.png";
import iconSupplierStraightBarn from "../Images/icon-carportview-supplier-premium-steel-buildings-straight-barn-1774016470652.png";
import iconSupplierTripleWide1 from "../Images/icon-carportview-supplier-premium-steel-buildings-triple-wide-1774016467055 (1).png";
import iconSupplierTripleWide from "../Images/icon-carportview-supplier-premium-steel-buildings-triple-wide-1774016467055.png";
import iconSupplierUtility from "../Images/icon-carportview-supplier-premium-steel-buildings-utility-1774016469413.png";
import iconSupplierWraparoundLeans from "../Images/icon-carportview-supplier-premium-steel-buildings-wraparound-leans-1774016471988.png";
import iconTruss from "../Images/icon-carportview-truss.png";
import mtBack from "../Images/mt-back.png";
import mtFront from "../Images/mt-front.png";
import mtLeft from "../Images/mt-left.png";
import mtRight from "../Images/mt-right.png";
import psbBarn from "../Images/psb_barn.jpg";

const MODULE_IMAGES = {
  "icon-carportview-aframe.png": iconAframe,
  "icon-carportview-aframev.png": iconAframeV,
  "icon-carportview-barn.png": iconBarn,
  "icon-carportview-garage.png": iconGarage,
  "icon-carportview-leanto.png": iconLeanto,
  "icon-carportview-loafing-shed.png": iconLoafingShed,
  "icon-carportview-psb.png": iconPsb,
  "icon-carportview-regular.png": iconRegular,
  "icon-carportview-supplier-premium-steel-buildings-commercial-1774016467403 (1).png": iconSupplierCommercial1,
  "icon-carportview-supplier-premium-steel-buildings-commercial-1774016467403.png": iconSupplierCommercial,
  "icon-carportview-supplier-premium-steel-buildings-loafing-shed-1774016472888.png": iconSupplierLoafingShed,
  "icon-carportview-supplier-premium-steel-buildings-rv-cover-1774016468985.png": iconSupplierRvCover,
  "icon-carportview-supplier-premium-steel-buildings-single-slope-1774016472315.png": iconSupplierSingleSlope,
  "icon-carportview-supplier-premium-steel-buildings-straight-barn-1774016470652.png": iconSupplierStraightBarn,
  "icon-carportview-supplier-premium-steel-buildings-triple-wide-1774016467055 (1).png": iconSupplierTripleWide1,
  "icon-carportview-supplier-premium-steel-buildings-triple-wide-1774016467055.png": iconSupplierTripleWide,
  "icon-carportview-supplier-premium-steel-buildings-utility-1774016469413.png": iconSupplierUtility,
  "icon-carportview-supplier-premium-steel-buildings-wraparound-leans-1774016471988.png": iconSupplierWraparoundLeans,
  "icon-carportview-truss.png": iconTruss,
  "mt-back.png": mtBack,
  "mt-front.png": mtFront,
  "mt-left.png": mtLeft,
  "mt-right.png": mtRight,
  "psb_barn.jpg": psbBarn,
};

function resolveModuleImage(fileName) {
  return MODULE_IMAGES[fileName]?.src || "";
}

/**
 * Resolve a database image path (e.g. metal_s_leanto_side.image_path) to a
 * bundled asset URL. The stored value may be a repo-relative source path such
 * as "src\modules\metal-buildings\Images\icon-carportview-aframeV.png"; the
 * file name picks the bundled image (case-insensitive). Full URLs return ""
 * so callers can pass them through untouched. A name matching no bundled
 * image also returns "".
 */
export function getModuleImagePath(dbPath) {
  const raw = String(dbPath ?? "").trim();
  if (!raw || /^https?:\/\//i.test(raw)) return "";
  const fileName = raw.split(/[\\/]/).pop().split("?")[0].toLowerCase();
  return resolveModuleImage(fileName);
}