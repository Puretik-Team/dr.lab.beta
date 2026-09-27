import { svgToDataUrl } from "../../templates/svgLibrary";

// Image files → data URLs. Large rasters are downscaled so templates (which
// embed their images) stay small, while SVGs are kept as vectors.
export function readImage(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) return reject(new Error("Images must be under 8 MB"));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read the file"));
    if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
      reader.onload = () => {
        const txt = String(reader.result || "");
        if (!/<svg[\s>]/i.test(txt)) return reject(new Error("That file isn't a valid SVG"));
        resolve(svgToDataUrl(txt));
      };
      reader.readAsText(file);
      return;
    }
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return reject(new Error("Use a PNG, JPG, WEBP or SVG image"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1800;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        if (scale === 1 && file.size < 1.5 * 1024 * 1024) return resolve(reader.result);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(file.type === "image/jpeg" ? canvas.toDataURL("image/jpeg", 0.9) : canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("That image couldn't be opened"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
