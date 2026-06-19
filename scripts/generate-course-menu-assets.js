const fs = require("fs");
const path = require("path");

const outDir = path.join(process.cwd(), "images", "course-menu");

const courses = [
  { id: "digital-business-foundations", accent: "#2354ff", secondary: "#19b86a", icon: "map" },
  { id: "brand-identity-systems", accent: "#ff5a5f", secondary: "#ffb000", icon: "palette" },
  { id: "canva-for-entrepreneurs", accent: "#ffb000", secondary: "#2354ff", icon: "devices" },
  { id: "ai-content-systems", accent: "#19b86a", secondary: "#7c3aed", icon: "nodes" },
  { id: "copywriting-offer-design", accent: "#ff5a5f", secondary: "#2354ff", icon: "pen" },
  { id: "social-video-content-machine", accent: "#a855f7", secondary: "#ff5a5f", icon: "video" },
  { id: "envato-creative-assets", accent: "#19b86a", secondary: "#ffb000", icon: "layers" },
  { id: "themeforest-website-blueprint", accent: "#2354ff", secondary: "#19b86a", icon: "browser" },
  { id: "seo-analytics-conversion", accent: "#0ea5e9", secondary: "#ffb000", icon: "analytics" },
  { id: "email-automation-crm", accent: "#f97316", secondary: "#2354ff", icon: "mail" },
  { id: "github-vercel-deployment", accent: "#111827", secondary: "#0ea5e9", icon: "deploy" },
  { id: "chatgpt-business-systems", accent: "#19b86a", secondary: "#111827", icon: "chat" },
  { id: "codex-web-builder", accent: "#0f172a", secondary: "#ffb000", icon: "code" },
  { id: "ai-web-apps-chatbots", accent: "#7c3aed", secondary: "#19b86a", icon: "bot" }
];

function blob(x, y, r, color, opacity) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
}

function roundedRect(x, y, width, height, rx, attrs = "") {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" ${attrs}/>`;
}

function line(x1, y1, x2, y2, attrs = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`;
}

function iconMarkup(type, viewBox, course) {
  const wide = viewBox.width > viewBox.height;
  const cx = wide ? 470 : 256;
  const cy = wide ? 230 : 270;
  const stroke = course.accent;
  const strokeAlt = course.secondary;
  const base = `fill="none" stroke="${stroke}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"`;
  const alt = `fill="none" stroke="${strokeAlt}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"`;
  const dark = `fill="none" stroke="#111827" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"`;

  const s = wide ? 1 : 0.92;
  const tx = (value) => Math.round(cx + value * s);
  const ty = (value) => Math.round(cy + value * s);

  switch (type) {
    case "map":
      return `
        ${roundedRect(tx(-120), ty(-78), 240, 156, 28, `fill="white" stroke="#111827" stroke-width="10"`)}
        ${line(tx(-70), ty(-40), tx(-10), ty(16), alt)}
        ${line(tx(-10), ty(16), tx(58), ty(-28), alt)}
        <circle cx="${tx(-70)}" cy="${ty(-40)}" r="18" fill="${course.secondary}" opacity=".9"/>
        <circle cx="${tx(-10)}" cy="${ty(16)}" r="18" fill="${course.accent}" opacity=".9"/>
        <circle cx="${tx(58)}" cy="${ty(-28)}" r="18" fill="#111827" opacity=".9"/>
      `;
    case "palette":
      return `
        <path d="M ${tx(-100)} ${ty(10)} C ${tx(-112)} ${ty(-82)}, ${tx(-28)} ${ty(-128)}, ${tx(64)} ${ty(-92)} C ${tx(148)} ${ty(-60)}, ${tx(126)} ${ty(52)}, ${tx(40)} ${ty(54)} L ${tx(18)} ${ty(54)} C ${tx(-4)} ${ty(54)}, ${tx(-10)} ${ty(88)}, ${tx(18)} ${ty(96)} C ${tx(-42)} ${ty(114)}, ${tx(-92)} ${ty(76)}, ${tx(-100)} ${ty(10)} Z" fill="white" stroke="#111827" stroke-width="10"/>
        <circle cx="${tx(-54)}" cy="${ty(-30)}" r="17" fill="${course.accent}" opacity=".85"/>
        <circle cx="${tx(8)}" cy="${ty(-56)}" r="17" fill="${course.secondary}" opacity=".85"/>
        <circle cx="${tx(62)}" cy="${ty(-14)}" r="17" fill="#2354ff" opacity=".78"/>
      `;
    case "devices":
      return `
        ${roundedRect(tx(-128), ty(-76), 210, 132, 18, `fill="white" stroke="#111827" stroke-width="10"`)}
        ${roundedRect(tx(28), ty(-24), 82, 132, 18, `fill="white" stroke="${course.accent}" stroke-width="10"`)}
        ${roundedRect(tx(-96), ty(-42), 126, 66, 12, `fill="${course.secondary}" opacity=".16"`)}
        ${line(tx(-96), ty(84), tx(4), ty(84), dark)}
      `;
    case "nodes":
      return `
        ${line(tx(-78), ty(-54), tx(18), ty(6), alt)}
        ${line(tx(18), ty(6), tx(94), ty(-66), alt)}
        ${line(tx(18), ty(6), tx(70), ty(82), alt)}
        <circle cx="${tx(-78)}" cy="${ty(-54)}" r="30" fill="white" stroke="${course.accent}" stroke-width="10"/>
        <circle cx="${tx(18)}" cy="${ty(6)}" r="34" fill="white" stroke="#111827" stroke-width="10"/>
        <circle cx="${tx(94)}" cy="${ty(-66)}" r="26" fill="${course.secondary}" opacity=".75"/>
        <circle cx="${tx(70)}" cy="${ty(82)}" r="26" fill="${course.accent}" opacity=".75"/>
      `;
    case "pen":
      return `
        <path d="M ${tx(-88)} ${ty(80)} L ${tx(-52)} ${ty(-8)} L ${tx(32)} ${ty(-92)} L ${tx(92)} ${ty(-32)} L ${tx(8)} ${ty(52)} Z" fill="white" stroke="#111827" stroke-width="10"/>
        ${line(tx(-52), ty(-8), tx(8), ty(52), alt)}
        ${line(tx(-96), ty(92), tx(-30), ty(74), base)}
      `;
    case "video":
      return `
        ${roundedRect(tx(-116), ty(-78), 232, 156, 28, `fill="white" stroke="#111827" stroke-width="10"`)}
        <path d="M ${tx(-20)} ${ty(-36)} L ${tx(54)} ${ty(0)} L ${tx(-20)} ${ty(36)} Z" fill="${course.accent}" opacity=".86"/>
        ${line(tx(-80), ty(104), tx(78), ty(104), alt)}
      `;
    case "layers":
      return `
        <path d="M ${tx(-98)} ${ty(-32)} L ${tx(0)} ${ty(-90)} L ${tx(98)} ${ty(-32)} L ${tx(0)} ${ty(26)} Z" fill="white" stroke="#111827" stroke-width="10"/>
        <path d="M ${tx(-98)} ${ty(14)} L ${tx(0)} ${ty(72)} L ${tx(98)} ${ty(14)}" ${alt}/>
        <path d="M ${tx(-98)} ${ty(58)} L ${tx(0)} ${ty(116)} L ${tx(98)} ${ty(58)}" ${base}/>
      `;
    case "browser":
      return `
        ${roundedRect(tx(-128), ty(-88), 256, 176, 22, `fill="white" stroke="#111827" stroke-width="10"`)}
        ${line(tx(-128), ty(-42), tx(128), ty(-42), dark)}
        <circle cx="${tx(-88)}" cy="${ty(-64)}" r="8" fill="${course.accent}"/>
        <circle cx="${tx(-58)}" cy="${ty(-64)}" r="8" fill="${course.secondary}"/>
        ${roundedRect(tx(-92), ty(-14), 78, 70, 12, `fill="${course.accent}" opacity=".17"`)}
        ${roundedRect(tx(10), ty(-14), 84, 24, 8, `fill="${course.secondary}" opacity=".26"`)}
        ${roundedRect(tx(10), ty(26), 84, 30, 8, `fill="#111827" opacity=".11"`)}
      `;
    case "analytics":
      return `
        ${line(tx(-108), ty(82), tx(112), ty(82), dark)}
        ${roundedRect(tx(-82), ty(10), 36, 72, 10, `fill="${course.secondary}" opacity=".7"`)}
        ${roundedRect(tx(-18), ty(-44), 36, 126, 10, `fill="${course.accent}" opacity=".65"`)}
        ${roundedRect(tx(46), ty(-10), 36, 92, 10, `fill="#111827" opacity=".16"`)}
        <circle cx="${tx(76)}" cy="${ty(-62)}" r="42" fill="white" stroke="#111827" stroke-width="10"/>
        ${line(tx(106), ty(-30), tx(140), ty(4), dark)}
      `;
    case "mail":
      return `
        ${roundedRect(tx(-126), ty(-74), 252, 148, 24, `fill="white" stroke="#111827" stroke-width="10"`)}
        <path d="M ${tx(-104)} ${ty(-48)} L ${tx(0)} ${ty(26)} L ${tx(104)} ${ty(-48)}" ${alt}/>
        <circle cx="${tx(86)}" cy="${ty(68)}" r="34" fill="${course.accent}" opacity=".78"/>
        <path d="M ${tx(72)} ${ty(68)} L ${tx(82)} ${ty(80)} L ${tx(104)} ${ty(54)}" fill="none" stroke="white" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    case "deploy":
      return `
        <path d="M ${tx(0)} ${ty(-104)} L ${tx(98)} ${ty(68)} L ${tx(-98)} ${ty(68)} Z" fill="white" stroke="#111827" stroke-width="10"/>
        <circle cx="${tx(-114)}" cy="${ty(-42)}" r="28" fill="${course.secondary}" opacity=".72"/>
        <circle cx="${tx(118)}" cy="${ty(-42)}" r="28" fill="${course.accent}" opacity=".18"/>
        ${line(tx(-84), ty(-42), tx(-24), ty(-42), alt)}
        ${line(tx(24), ty(-42), tx(84), ty(-42), alt)}
      `;
    case "chat":
      return `
        ${roundedRect(tx(-118), ty(-78), 190, 124, 26, `fill="white" stroke="#111827" stroke-width="10"`)}
        <path d="M ${tx(-44)} ${ty(46)} L ${tx(-82)} ${ty(90)} L ${tx(-70)} ${ty(40)}" fill="white" stroke="#111827" stroke-width="10" stroke-linejoin="round"/>
        ${roundedRect(tx(10), ty(-18), 112, 96, 24, `fill="${course.accent}" opacity=".16" stroke="${course.accent}" stroke-width="8"`)}
        <circle cx="${tx(-62)}" cy="${ty(-18)}" r="8" fill="${course.accent}"/>
        <circle cx="${tx(-18)}" cy="${ty(-18)}" r="8" fill="${course.secondary}"/>
        <circle cx="${tx(26)}" cy="${ty(-18)}" r="8" fill="#111827"/>
      `;
    case "code":
      return `
        ${roundedRect(tx(-126), ty(-82), 252, 164, 24, `fill="white" stroke="#111827" stroke-width="10"`)}
        <path d="M ${tx(-58)} ${ty(-22)} L ${tx(-94)} ${ty(0)} L ${tx(-58)} ${ty(22)}" ${alt}/>
        <path d="M ${tx(58)} ${ty(-22)} L ${tx(94)} ${ty(0)} L ${tx(58)} ${ty(22)}" ${alt}/>
        ${line(tx(-12), ty(42), tx(20), ty(-42), base)}
      `;
    case "bot":
      return `
        ${roundedRect(tx(-104), ty(-58), 208, 134, 30, `fill="white" stroke="#111827" stroke-width="10"`)}
        ${line(tx(0), ty(-58), tx(0), ty(-104), dark)}
        <circle cx="${tx(0)}" cy="${ty(-116)}" r="14" fill="${course.accent}"/>
        <circle cx="${tx(-44)}" cy="${ty(-6)}" r="12" fill="${course.secondary}"/>
        <circle cx="${tx(44)}" cy="${ty(-6)}" r="12" fill="${course.accent}"/>
        <path d="M ${tx(-34)} ${ty(36)} C ${tx(-12)} ${ty(54)}, ${tx(18)} ${ty(54)}, ${tx(38)} ${ty(36)}" ${alt}/>
      `;
    default:
      return `<circle cx="${cx}" cy="${cy}" r="92" fill="white" stroke="${stroke}" stroke-width="12"/>`;
  }
}

function svg(course, variant) {
  const wide = variant === "wide";
  const viewBox = wide ? { width: 960, height: 540 } : { width: 640, height: 640 };
  const blobs = wide
    ? [
        blob(120, 80, 150, course.accent, ".12"),
        blob(820, 80, 170, course.secondary, ".14"),
        blob(760, 470, 210, course.accent, ".10"),
        blob(180, 480, 190, course.secondary, ".12")
      ]
    : [
        blob(96, 100, 150, course.accent, ".12"),
        blob(540, 120, 170, course.secondary, ".14"),
        blob(520, 560, 190, course.accent, ".10"),
        blob(110, 540, 160, course.secondary, ".12")
      ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox.width} ${viewBox.height}" role="img" aria-label="">
  <rect width="${viewBox.width}" height="${viewBox.height}" fill="#ffffff"/>
  ${blobs.join("\n  ")}
  <g opacity=".55">
    <path d="M ${wide ? 42 : 34} ${wide ? 72 : 74} C ${wide ? 190 : 124} ${wide ? 22 : 20}, ${wide ? 242 : 210} ${wide ? 116 : 100}, ${wide ? 356 : 304} ${wide ? 58 : 54}" fill="none" stroke="${course.accent}" stroke-width="8" stroke-linecap="round" opacity=".26"/>
    <path d="M ${wide ? 612 : 358} ${wide ? 492 : 564} C ${wide ? 732 : 480} ${wide ? 390 : 480}, ${wide ? 824 : 560} ${wide ? 460 : 522}, ${wide ? 916 : 612} ${wide ? 348 : 426}" fill="none" stroke="${course.secondary}" stroke-width="8" stroke-linecap="round" opacity=".24"/>
  </g>
  <g>
    ${iconMarkup(course.icon, viewBox, course)}
  </g>
</svg>
`;
}

fs.mkdirSync(outDir, { recursive: true });

for (const course of courses) {
  for (const variant of ["square", "wide"]) {
    fs.writeFileSync(
      path.join(outDir, `${course.id}-${variant}.svg`),
      svg(course, variant),
      "utf8"
    );
  }
}

console.log(`Generated ${courses.length * 2} course menu assets in ${outDir}`);
