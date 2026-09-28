import React, { useMemo } from "react";
import { PX_PER_MM, ensureEngineStyles } from "../../../templates/engine";

// Displays engine-rendered page HTML scaled to a target pixel width. The
// page itself is laid out in real millimetres (exactly like the PDF), then
// scaled with a transform so thumbnails and previews stay pixel-faithful.
export default function PageView({ html, widthMm, heightMm, width, shadow = true, style }) {
  ensureEngineStyles(document);
  const scale = width / (widthMm * PX_PER_MM);
  const markup = useMemo(() => ({ __html: html }), [html]);
  return (
    // Always LTR: the page is scaled from its top-left corner, and in an RTL
    // app (Arabic/Kurdish) the oversized page would otherwise overflow to the
    // left and render off-screen. The PDF is produced LTR too; Arabic text
    // inside the report sets its own direction per element.
    <div
      dir="ltr"
      className="tpl-pageview"
      style={{
        width,
        height: heightMm * PX_PER_MM * scale,
        boxShadow: shadow ? "0 1px 2px rgba(30,27,55,.08), 0 6px 18px rgba(30,27,55,.08)" : "none",
        ...style,
      }}
    >
      <div
        className="tpl-root"
        style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: `${widthMm}mm` }}
        dangerouslySetInnerHTML={markup}
      />
    </div>
  );
}
