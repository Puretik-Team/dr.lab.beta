import drLabLogo from "../../assets/light-logo.png";
import drLabBadge from "../../assets/light-name.png";
import { readImage } from "./readImage";

// The Dr. Lab logo/wordmark ship as bundled asset URLs; templates embed
// images as data URLs (they must print without the app's asset server), so
// convert once.
async function assetToDataUrl(url, name) {
  const blob = await (await fetch(url)).blob();
  return readImage(new File([blob], name, { type: blob.type || "image/png" }));
}
export const drLabLogoDataUrl = () => assetToDataUrl(drLabLogo, "drlab.png");
// The free-plan co-brand badge uses the wordmark (name + logo side by side),
// not the square icon used when a lab picks Dr. Lab as their own logo.
export const drLabBadgeDataUrl = () => assetToDataUrl(drLabBadge, "drlab-badge.png");
