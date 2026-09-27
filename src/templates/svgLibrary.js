// Built-in medical/scientific SVG illustrations. Each entry renders a
// complete, standalone SVG string from a palette so the same drawing can be
// recolored (purple / lavender / monochrome / any custom color) without
// shipping separate files. The engine embeds these as <img> data URLs, which
// keeps them vector in the exported PDF and means an SVG can never run script.

const PALETTES = {
  purple: { primary: "#6A48B8", secondary: "#9B7FE0", tint: "#EDE7FA", ink: "#3B2A78" },
  lavender: { primary: "#A48BE0", secondary: "#CDBEF2", tint: "#F5F1FC", ink: "#7A62C4" },
  mono: { primary: "#3A3A3A", secondary: "#8A8A8A", tint: "#EFEFEF", ink: "#1F1F1F" },
};

function hexToRgb(hex) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/i.test(h)) return [106, 72, 184];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function mix(hex, withHex, amount) {
  const a = hexToRgb(hex);
  const b = hexToRgb(withHex);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * amount));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function paletteFor(name, color) {
  if (name === "custom") {
    return {
      primary: color,
      secondary: mix(color, "#FFFFFF", 0.35),
      tint: mix(color, "#FFFFFF", 0.85),
      ink: mix(color, "#000000", 0.3),
    };
  }
  return PALETTES[name] || PALETTES.purple;
}

const svg = (body, vb = "0 0 100 100") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;

const ITEMS = [
  // ---- Laboratory equipment ----
  {
    id: "microscope",
    name: "Microscope",
    category: "Microscopes",
    render: (c) =>
      svg(`
      <ellipse cx="50" cy="92" rx="34" ry="4" fill="${c.tint}"/>
      <rect x="22" y="82" width="56" height="8" rx="3" fill="${c.primary}"/>
      <path d="M62 82c8-6 12-16 10-28" fill="none" stroke="${c.ink}" stroke-width="5" stroke-linecap="round"/>
      <rect x="30" y="60" width="30" height="5" rx="2" fill="${c.secondary}"/>
      <rect x="42" y="65" width="5" height="17" fill="${c.ink}"/>
      <g transform="rotate(-28 46 34)">
        <rect x="38" y="12" width="16" height="42" rx="4" fill="${c.primary}"/>
        <rect x="40" y="6" width="12" height="8" rx="2" fill="${c.ink}"/>
        <rect x="41" y="54" width="10" height="8" rx="2" fill="${c.secondary}"/>
      </g>
      <circle cx="68" cy="54" r="7" fill="${c.secondary}"/>
      <circle cx="68" cy="54" r="3" fill="${c.tint}"/>`),
  },
  {
    id: "microscopeLine",
    name: "Microscope (outline)",
    category: "Microscopes",
    render: (c) =>
      svg(`
      <g fill="none" stroke="${c.primary}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M24 88h52"/><path d="M34 88v-8h32v8"/><path d="M60 80c10-8 12-20 8-32"/>
        <path d="M40 18l14 8-12 22-14-8z"/><path d="M44 12l8 4"/><path d="M30 60h26"/><path d="M42 48v12"/>
        <circle cx="66" cy="48" r="6"/>
      </g>`),
  },
  {
    id: "testTube",
    name: "Test tube",
    category: "Test tubes",
    render: (c) =>
      svg(`
      <rect x="36" y="6" width="28" height="7" rx="3" fill="${c.ink}"/>
      <path d="M39 13h22v62a11 11 0 0 1-22 0z" fill="${c.tint}" stroke="${c.primary}" stroke-width="3"/>
      <path d="M40.5 48h19v27a9.5 9.5 0 0 1-19 0z" fill="${c.primary}"/>
      <circle cx="47" cy="60" r="2.5" fill="${c.secondary}"/><circle cx="53" cy="70" r="1.8" fill="${c.secondary}"/>
      <path d="M45 20v22" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>`),
  },
  {
    id: "testTubeRack",
    name: "Test tube rack",
    category: "Test tubes",
    render: (c) =>
      svg(`
      ${[18, 38, 58, 78]
        .map(
          (x, i) => `
        <path d="M${x - 7} 16h14v50a7 7 0 0 1-14 0z" fill="${c.tint}" stroke="${c.primary}" stroke-width="2.5"/>
        <path d="M${x - 5.8} ${40 + i * 5}h11.6v${26 - i * 5}a5.8 5.8 0 0 1-11.6 0z" fill="${i % 2 ? c.secondary : c.primary}"/>
        <rect x="${x - 8}" y="10" width="16" height="6" rx="2" fill="${c.ink}"/>`
        )
        .join("")}
      <rect x="6" y="54" width="88" height="8" rx="2" fill="${c.primary}"/>
      <rect x="10" y="62" width="5" height="26" fill="${c.ink}"/><rect x="85" y="62" width="5" height="26" fill="${c.ink}"/>
      <rect x="6" y="86" width="88" height="5" rx="2" fill="${c.primary}"/>`),
  },
  {
    id: "flask",
    name: "Erlenmeyer flask",
    category: "Flasks",
    render: (c) =>
      svg(`
      <path d="M40 8h20M42 8v28L18 82a6 6 0 0 0 5 9h54a6 6 0 0 0 5-9L58 36V8" fill="${c.tint}" stroke="${c.primary}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M28 64h44l8 17a4 4 0 0 1-3.5 6h-53a4 4 0 0 1-3.5-6z" fill="${c.primary}"/>
      <circle cx="44" cy="74" r="3" fill="${c.secondary}"/><circle cx="56" cy="78" r="2" fill="${c.secondary}"/><circle cx="52" cy="54" r="2.5" fill="${c.secondary}"/><circle cx="46" cy="46" r="1.8" fill="${c.secondary}"/>`),
  },
  {
    id: "roundFlask",
    name: "Round-bottom flask",
    category: "Flasks",
    render: (c) =>
      svg(`
      <path d="M43 8h14v26a26 26 0 1 1-14 0z" fill="${c.tint}" stroke="${c.primary}" stroke-width="3.5"/>
      <path d="M26 60h48a24 24 0 0 1-48 0z" fill="${c.primary}"/>
      <rect x="40" y="5" width="20" height="6" rx="2" fill="${c.ink}"/>
      <circle cx="42" cy="68" r="3" fill="${c.secondary}"/><circle cx="58" cy="72" r="2" fill="${c.secondary}"/>`),
  },
  {
    id: "beaker",
    name: "Beaker",
    category: "Laboratory equipment",
    render: (c) =>
      svg(`
      <path d="M22 12h56M26 12v70a8 8 0 0 0 8 8h32a8 8 0 0 0 8-8V12" fill="${c.tint}" stroke="${c.primary}" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M27.8 50h44.4v32a6 6 0 0 1-6 6H33.8a6 6 0 0 1-6-6z" fill="${c.primary}"/>
      <path d="M62 24h10M64 34h8M62 44h10" stroke="${c.ink}" stroke-width="2.5" stroke-linecap="round"/>`),
  },
  {
    id: "pipette",
    name: "Pipette",
    category: "Laboratory equipment",
    render: (c) =>
      svg(`
      <g transform="rotate(35 50 50)">
        <rect x="44" y="4" width="12" height="18" rx="5" fill="${c.primary}"/>
        <rect x="46" y="22" width="8" height="52" rx="2" fill="${c.tint}" stroke="${c.primary}" stroke-width="2.5"/>
        <rect x="47.3" y="50" width="5.4" height="23" fill="${c.secondary}"/>
        <path d="M46 74h8l-3 16h-2z" fill="${c.primary}"/>
      </g>
      <path d="M72 84c0 4-3 7-6 7s-6-3-6-7 6-11 6-11 6 7 6 11z" fill="${c.secondary}"/>`),
  },
  {
    id: "petriDish",
    name: "Petri dish",
    category: "Laboratory equipment",
    render: (c) =>
      svg(`
      <ellipse cx="50" cy="58" rx="42" ry="20" fill="${c.tint}" stroke="${c.primary}" stroke-width="3"/>
      <ellipse cx="50" cy="52" rx="42" ry="20" fill="none" stroke="${c.secondary}" stroke-width="2.5"/>
      <circle cx="38" cy="56" r="5" fill="${c.primary}"/><circle cx="56" cy="50" r="3.5" fill="${c.secondary}"/>
      <circle cx="64" cy="62" r="4" fill="${c.primary}" opacity=".7"/><circle cx="46" cy="64" r="2.5" fill="${c.secondary}"/>`),
  },
  // ---- Molecular / DNA ----
  {
    id: "molecule",
    name: "Molecule",
    category: "Molecular structures",
    render: (c) =>
      svg(`
      <g stroke="${c.secondary}" stroke-width="3.5" stroke-linecap="round">
        <path d="M50 50L22 30M50 50L80 28M50 50L50 84M22 30L14 60M80 28L88 58"/>
      </g>
      <circle cx="50" cy="50" r="12" fill="${c.primary}"/>
      <circle cx="22" cy="30" r="8" fill="${c.secondary}"/><circle cx="80" cy="28" r="9" fill="${c.primary}" opacity=".85"/>
      <circle cx="50" cy="84" r="8" fill="${c.secondary}"/><circle cx="14" cy="60" r="6" fill="${c.primary}" opacity=".7"/>
      <circle cx="88" cy="58" r="6" fill="${c.secondary}"/>`),
  },
  {
    id: "hexNetwork",
    name: "Benzene rings",
    category: "Molecular structures",
    render: (c) => {
      const hex = (cx, cy, r) =>
        Array.from({ length: 6 }, (_, i) => {
          const a = (Math.PI / 3) * i + Math.PI / 6;
          return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
        }).join(" ");
      return svg(`
        <g fill="none" stroke="${c.primary}" stroke-width="3" stroke-linejoin="round">
          <polygon points="${hex(34, 40, 18)}"/><polygon points="${hex(65.2, 40, 18)}"/><polygon points="${hex(49.6, 67, 18)}"/>
        </g>
        <circle cx="34" cy="40" r="8" fill="none" stroke="${c.secondary}" stroke-width="2.5"/>
        <circle cx="49.6" cy="67" r="8" fill="none" stroke="${c.secondary}" stroke-width="2.5"/>
        ${[[34, 22], [80.8, 31], [49.6, 85], [18.4, 49]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="${c.primary}"/>`).join("")}`);
    },
  },
  {
    id: "atom",
    name: "Atom",
    category: "Molecular structures",
    render: (c) =>
      svg(`
      <g fill="none" stroke="${c.primary}" stroke-width="2.8">
        <ellipse cx="50" cy="50" rx="42" ry="15"/>
        <ellipse cx="50" cy="50" rx="42" ry="15" transform="rotate(60 50 50)"/>
        <ellipse cx="50" cy="50" rx="42" ry="15" transform="rotate(-60 50 50)"/>
      </g>
      <circle cx="50" cy="50" r="8" fill="${c.secondary}"/>
      <circle cx="92" cy="50" r="4" fill="${c.primary}"/><circle cx="29" cy="14" r="4" fill="${c.primary}"/><circle cx="29" cy="86" r="4" fill="${c.primary}"/>`),
  },
  {
    id: "dnaHelix",
    name: "DNA helix",
    category: "DNA patterns",
    render: (c) => {
      let rungs = "";
      let s1 = "M30 4";
      let s2 = "M70 4";
      for (let i = 0; i <= 12; i++) {
        const y = 4 + i * 7.6;
        const x1 = 50 - 20 * Math.cos((i / 12) * Math.PI * 2);
        const x2 = 50 + 20 * Math.cos((i / 12) * Math.PI * 2);
        s1 += ` L${x1.toFixed(1)} ${y.toFixed(1)}`;
        s2 += ` L${x2.toFixed(1)} ${y.toFixed(1)}`;
        if (i > 0 && i < 12)
          rungs += `<path d="M${x1.toFixed(1)} ${y.toFixed(1)}H${x2.toFixed(1)}" stroke="${i % 2 ? c.secondary : c.tint}" stroke-width="3" stroke-linecap="round"/>`;
      }
      return svg(`${rungs}
        <path d="${s1}" fill="none" stroke="${c.primary}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="${s2}" fill="none" stroke="${c.ink}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`);
    },
  },
  {
    id: "dnaBand",
    name: "DNA band (wide)",
    category: "DNA patterns",
    render: (c) => {
      let a = "";
      let b = "";
      let rungs = "";
      for (let i = 0; i <= 48; i++) {
        const x = i * (400 / 48);
        const y1 = 25 + 16 * Math.sin((i / 48) * Math.PI * 6);
        const y2 = 25 - 16 * Math.sin((i / 48) * Math.PI * 6);
        a += `${i ? "L" : "M"}${x.toFixed(1)} ${y1.toFixed(1)} `;
        b += `${i ? "L" : "M"}${x.toFixed(1)} ${y2.toFixed(1)} `;
        if (i % 2 === 0)
          rungs += `<path d="M${x.toFixed(1)} ${y1.toFixed(1)}V${y2.toFixed(1)}" stroke="${c.secondary}" stroke-width="1.6" opacity=".7"/>`;
      }
      return svg(
        `${rungs}<path d="${a}" fill="none" stroke="${c.primary}" stroke-width="2.6"/><path d="${b}" fill="none" stroke="${c.ink}" stroke-width="2.6" opacity=".8"/>`,
        "0 0 400 50"
      );
    },
  },
  // ---- Medical icons ----
  {
    id: "heartbeat",
    name: "Heartbeat",
    category: "Medical icons",
    render: (c) =>
      svg(`
      <path d="M50 88S10 64 10 36a20 20 0 0 1 40-6 20 20 0 0 1 40 6c0 28-40 52-40 52z" fill="${c.tint}" stroke="${c.primary}" stroke-width="3.5"/>
      <path d="M14 52h20l6-12 8 24 7-18 5 6h26" fill="none" stroke="${c.primary}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`),
  },
  {
    id: "medicalCross",
    name: "Medical cross",
    category: "Medical icons",
    render: (c) =>
      svg(`
      <circle cx="50" cy="50" r="44" fill="${c.tint}"/>
      <path d="M40 18h20v22h22v20H60v22H40V60H18V40h22z" fill="${c.primary}"/>
      <path d="M44 22h12v22h22v12" fill="none" stroke="${c.secondary}" stroke-width="2" opacity=".8"/>`),
  },
  {
    id: "bloodDrop",
    name: "Blood drop",
    category: "Medical icons",
    render: (c) =>
      svg(`
      <path d="M50 6S20 42 20 62a30 30 0 0 0 60 0C80 42 50 6 50 6z" fill="${c.primary}"/>
      <path d="M36 62a14 14 0 0 0 14 14" fill="none" stroke="${c.tint}" stroke-width="4" stroke-linecap="round"/>`),
  },
  {
    id: "capsule",
    name: "Capsule & pill",
    category: "Medical icons",
    render: (c) =>
      svg(`
      <g transform="rotate(-40 42 46)"><rect x="12" y="32" width="60" height="28" rx="14" fill="${c.tint}" stroke="${c.primary}" stroke-width="3"/>
      <path d="M42 32h16a14 14 0 0 1 0 28H42z" fill="${c.primary}"/></g>
      <circle cx="74" cy="74" r="16" fill="${c.secondary}"/><path d="M63 74h22" stroke="${c.tint}" stroke-width="3" stroke-linecap="round"/>`),
  },
  {
    id: "stethoscope",
    name: "Stethoscope",
    category: "Medical icons",
    render: (c) =>
      svg(`
      <g fill="none" stroke="${c.primary}" stroke-width="4" stroke-linecap="round">
        <path d="M22 10v22a18 18 0 0 0 36 0V10"/><path d="M40 50v14a18 18 0 0 0 36 0V56"/>
      </g>
      <circle cx="22" cy="10" r="4" fill="${c.ink}"/><circle cx="58" cy="10" r="4" fill="${c.ink}"/>
      <circle cx="76" cy="46" r="11" fill="${c.tint}" stroke="${c.primary}" stroke-width="4"/><circle cx="76" cy="46" r="4" fill="${c.secondary}"/>`),
  },
  // ---- Abstract decorations ----
  {
    id: "dotGrid",
    name: "Dot grid",
    category: "Abstract decorations",
    render: (c) => {
      let d = "";
      for (let r = 0; r < 8; r++)
        for (let q = 0; q < 8; q++)
          d += `<circle cx="${8 + q * 12}" cy="${8 + r * 12}" r="${2.2 - ((r + q) % 3) * 0.4}" fill="${(r + q) % 4 === 0 ? c.primary : c.secondary}" opacity="${0.35 + ((r * q) % 5) * 0.12}"/>`;
      return svg(d);
    },
  },
  {
    id: "bubbles",
    name: "Cell bubbles",
    category: "Abstract decorations",
    render: (c) =>
      svg(`
      <circle cx="30" cy="34" r="22" fill="${c.tint}" stroke="${c.secondary}" stroke-width="2"/>
      <circle cx="30" cy="34" r="8" fill="${c.primary}" opacity=".8"/>
      <circle cx="70" cy="60" r="16" fill="${c.tint}" stroke="${c.secondary}" stroke-width="2"/>
      <circle cx="72" cy="62" r="5.5" fill="${c.primary}" opacity=".8"/>
      <circle cx="40" cy="80" r="9" fill="${c.secondary}" opacity=".5"/><circle cx="82" cy="22" r="6" fill="${c.secondary}" opacity=".6"/>`),
  },
  {
    id: "waveLines",
    name: "Wave lines",
    category: "Abstract decorations",
    render: (c) =>
      svg(
        [0, 1, 2, 3]
          .map(
            (i) =>
              `<path d="M0 ${20 + i * 8} C60 ${2 + i * 8}, 120 ${38 + i * 8}, 200 ${16 + i * 8} S340 ${4 + i * 8}, 400 ${22 + i * 8}" fill="none" stroke="${i % 2 ? c.secondary : c.primary}" stroke-width="${2.2 - i * 0.35}" opacity="${1 - i * 0.18}"/>`
          )
          .join(""),
        "0 0 400 60"
      ),
  },
  {
    id: "hexPattern",
    name: "Hexagon pattern",
    category: "Abstract decorations",
    render: (c) => {
      let d = "";
      const r = 9;
      for (let row = 0; row < 6; row++)
        for (let col = 0; col < 6; col++) {
          const cx = 10 + col * r * 1.75 + (row % 2) * r * 0.875;
          const cy = 10 + row * r * 1.5;
          const pts = Array.from({ length: 6 }, (_, i) => {
            const a = (Math.PI / 3) * i + Math.PI / 6;
            return `${(cx + r * 0.85 * Math.cos(a)).toFixed(1)},${(cy + r * 0.85 * Math.sin(a)).toFixed(1)}`;
          }).join(" ");
          const filled = (row * 3 + col) % 5 === 0;
          d += `<polygon points="${pts}" fill="${filled ? c.secondary : "none"}" fill-opacity=".5" stroke="${c.primary}" stroke-width="1.2" opacity="${0.4 + ((row + col) % 3) * 0.2}"/>`;
        }
      return svg(d);
    },
  },
];

const ITEM_MAP = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

const LIBRARY_CATEGORIES = [
  "Laboratory equipment",
  "Microscopes",
  "Test tubes",
  "Flasks",
  "Molecular structures",
  "DNA patterns",
  "Medical icons",
  "Abstract decorations",
];

function renderLibrarySvg(id, palette = "purple", color) {
  const item = ITEM_MAP[id] || ITEMS[0];
  return item.render(paletteFor(palette, color || "#6A48B8"));
}

function svgToDataUrl(svgText) {
  // encodeURIComponent keeps it ASCII-safe without needing Buffer/btoa
  // (neither is guaranteed in both the renderer bundle and the print window).
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

module.exports = {
  LIBRARY_ITEMS: ITEMS.map(({ id, name, category }) => ({ id, name, category })),
  LIBRARY_CATEGORIES,
  PALETTES,
  renderLibrarySvg,
  svgToDataUrl,
  paletteFor,
  mix,
};
