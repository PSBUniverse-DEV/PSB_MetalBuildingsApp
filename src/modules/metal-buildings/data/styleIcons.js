import { getStyleProfile } from "./styleProfiles";
import iconAframe from "../Images/icon-carportview-aframe.png";
import iconBarn from "../Images/icon-carportview-barn.png";
import iconGarage from "../Images/icon-carportview-garage.png";
import iconLeanto from "../Images/icon-carportview-leanto.png";
import iconLoafingShed from "../Images/icon-carportview-loafing-shed.png";
import iconPsb from "../Images/icon-carportview-psb.png";
import iconRegular from "../Images/icon-carportview-regular.png";
import iconTruss from "../Images/icon-carportview-truss.png";

// Style icons live in the module and are bundled by Next (served from
// /_next/static), so they need no /public files and no auth-proxy exception.
// To add an icon: drop the file in ../Images, import it, and add it here.
const STYLE_ICONS = {
  "icon-carportview-aframe.png": iconAframe,
  "icon-carportview-barn.png": iconBarn,
  "icon-carportview-garage.png": iconGarage,
  "icon-carportview-leanto.png": iconLeanto,
  "icon-carportview-loafing-shed.png": iconLoafingShed,
  "icon-carportview-psb.png": iconPsb,
  "icon-carportview-regular.png": iconRegular,
  "icon-carportview-truss.png": iconTruss,
};

const FALLBACK_ICON = "icon-carportview-psb.png";

function resolveIcon(fileName) {
  return STYLE_ICONS[fileName]?.src || "";
}

export function getStyleIconPath(style) {
  // If the DB provides an icon_path, its file name picks the bundled icon.
  // A value that matches no bundled icon is returned as stored (minus any
  // accidental /public/ prefix), exactly as before.
  if (style?.icon_path) {
    const stored = String(style.icon_path).replace(/^\/public\//i, "/");
    const fileName = stored.split(/[\\/]/).pop().split("?")[0].toLowerCase();
    return resolveIcon(fileName) || stored;
  }

  // Derive a filename from the style profile/render_key.
  const renderKey = (style?.render_key || "").toLowerCase();
  const profile = getStyleProfile(renderKey);
  const label = (profile?.label || "").toLowerCase();

  const keyMap = {
    regular: "regular",
    aframe: "aframe",
    a_frame: "aframe",
    aframe_vertical: "aframe",
    vertical: "aframe",
    rib_type: "psb",
    truss: "truss",
    garage: "garage",
    barn: "barn",
    leanto: "leanto",
    lean_to: "leanto",
    loafing_shed: "loafing-shed",
  };

  let key = keyMap[renderKey];
  if (!key && label) {
    if (label.includes("a-frame")) key = "aframe";
    else if (label.includes("regular")) key = "regular";
    else if (label.includes("barn")) key = "barn";
    else if (label.includes("garage")) key = "garage";
    else if (label.includes("lean")) key = "leanto";
    else if (label.includes("loafing")) key = "loafing-shed";
    else if (label.includes("truss")) key = "truss";
    else if (label.includes("rib")) key = "psb";
  }
  if (!key) key = renderKey || "psb";

  return resolveIcon("icon-carportview-" + key + ".png") || resolveIcon(FALLBACK_ICON);
}
