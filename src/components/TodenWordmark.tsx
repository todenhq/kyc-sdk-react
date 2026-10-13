/**
 * The Toden logo: the split-shield T beside "toden", inlined from the brand
 * SVG so the SDK bundle needs no image asset pipeline and the mark stays crisp
 * at any size.
 *
 * The ink parts (the bar, the left half of the shield and the lettering)
 * inherit `currentColor`, so the caller sets them with an ordinary text colour
 * and one render serves both themes. The right half of the shield is the brand
 * purple, passed as `accent` because it steps lighter on a dark surface.
 * Generated from kyc-dashboard/public/assets/images/logo.svg: regenerate
 * rather than hand-editing the path data.
 */
export const TODEN_ACCENT = '#5645F5';
/** The shield's purple half on a dark surface (logo-white.svg). */
export const TODEN_ACCENT_ON_DARK = '#8F83FA';

const VIEW_WIDTH = 362.9;
const VIEW_HEIGHT = 95.4;

export function TodenWordmark({
  height = 14,
  ink = 'currentColor',
  accent = TODEN_ACCENT,
}: {
  height?: number;
  /** Fill of the ink parts. Defaults to `currentColor`: set it via the parent's text colour. */
  ink?: string;
  /** Fill of the shield's right half. */
  accent?: string;
}) {
  return (
    <svg
      viewBox={`14.8 9.4 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      height={height}
      width={height * (VIEW_WIDTH / VIEW_HEIGHT)}
      fill={ink}
      // Decorative: every caller wraps this in something that carries the real
      // label, and an aria-label here would be a redundant nested name that
      // some screen readers announce twice.
      aria-hidden
      focusable="false"
    >
      <g transform="scale(1.12)">
        <rect x="15" y="12" width="70" height="13" rx="6.5" />
        <path d="M35 35H47.5V90C39 83 30 74 30 58V40A5 5 0 0 1 35 35Z" />
        <path d="M52.5 35H65A5 5 0 0 1 70 40V58C70 74 61 83 52.5 90Z" fill={accent} />
      </g>
      <path d="M134 91.2Q125.1 91.2 120.9 86.6Q116.8 81.9 116.8 71.8V48.8H109.3L109.6 37.7H114.5Q117.7 37.6 119.3 36.5Q120.9 35.5 121.3 32.8L122.4 25.8H130.6V37.5H143.9V49.2H130.6V71.1Q130.6 74.7 132.3 76.3Q134.1 78 137.5 78Q139.4 78 141.2 77.5Q142.9 77.1 144.2 76.3V89.6Q141.1 90.6 138.6 90.9Q136 91.2 134 91.2Z M173.8 91.4Q165.9 91.4 159.9 88.2Q153.9 85.1 150.5 78.9Q147.1 72.8 147.1 63.6Q147.1 54.4 150.6 48.3Q154 42.2 160 39.1Q166 36.1 173.7 36.1Q181.6 36.1 187.6 39.2Q193.7 42.3 197.1 48.5Q200.5 54.6 200.5 63.8Q200.5 73.2 197 79.3Q193.5 85.4 187.4 88.4Q181.4 91.4 173.8 91.4ZM174.2 80.7Q178.1 80.7 180.8 78.9Q183.4 77.1 184.8 73.4Q186.1 69.8 186.1 64.6Q186.1 59.1 184.6 55.2Q183.2 51.4 180.4 49.3Q177.6 47.3 173.4 47.3Q169.6 47.3 166.9 49.1Q164.3 50.9 162.9 54.5Q161.5 58.1 161.5 63.4Q161.5 71.9 164.8 76.3Q168.2 80.7 174.2 80.7Z M225.6 91.4Q219 91.4 214.1 88.1Q209.2 84.7 206.5 78.5Q203.8 72.2 203.8 63.6Q203.8 55.6 206.2 49.4Q208.6 43.2 213.3 39.8Q218 36.3 224.9 36.3Q230 36.3 233.5 38.2Q237 40.1 239.2 43.8Q241.5 47.5 242.7 52.7H244.9Q244.3 49.5 243.8 46.4Q243.2 43.3 242.9 40.5Q242.6 37.7 242.6 35.6V18.7H257V64.7V90H245V74.7H243.1Q241.9 80.3 239.6 84Q237.3 87.7 233.8 89.6Q230.3 91.4 225.6 91.4ZM230.4 79.6Q233.6 79.6 235.9 78.2Q238.2 76.8 239.6 74.5Q241.1 72.3 241.8 69.7Q242.6 67.1 242.6 64.7V62.9Q242.6 60.9 242.1 58.8Q241.5 56.7 240.5 54.8Q239.5 52.8 238 51.2Q236.5 49.7 234.6 48.8Q232.6 47.9 230.2 47.9Q226.6 47.9 224.1 49.9Q221.6 51.9 220.2 55.5Q218.9 59 218.9 63.8Q218.9 68.5 220.3 72.1Q221.7 75.7 224.3 77.7Q226.9 79.6 230.4 79.6Z M290.3 91.4Q283.7 91.4 278.6 89.6Q273.6 87.8 270.1 84.3Q266.6 80.9 264.8 76Q263 71 263 64.7Q263 58.5 264.8 53.2Q266.5 48 269.9 44.1Q273.2 40.3 278.1 38.2Q283 36.1 289.2 36.1Q295.3 36.1 299.9 38.1Q304.6 40.1 307.8 44Q310.9 47.9 312.3 53.5Q313.8 59.1 313.3 66.4L272.3 66.7V58.8L304.8 58.5L300 62.6Q300.6 57.3 299.2 53.9Q297.9 50.5 295.2 48.9Q292.6 47.3 289.4 47.3Q285.6 47.3 282.8 49.3Q279.9 51.3 278.3 55.1Q276.7 59 276.7 64.4Q276.7 72.9 280.4 76.8Q284.1 80.8 290.2 80.8Q293 80.8 294.9 80Q296.9 79.3 298.1 78.1Q299.4 76.9 300.1 75.4Q300.9 73.9 301.3 72.3L313.8 74.9Q313.1 78.6 311.3 81.6Q309.6 84.6 306.8 86.8Q303.9 89 299.8 90.2Q295.7 91.4 290.3 91.4Z M319.6 90V58.4V37.5H331.4L331.3 53.7H333.2Q334.5 47.8 336.9 43.9Q339.2 40 342.9 38Q346.6 36.1 351.6 36.1Q360.7 36.1 365.4 42.4Q370.1 48.8 370.1 62.4V90H355.6V63.9Q355.6 55.7 353.2 51.9Q350.8 48.2 346.1 48.2Q342.1 48.2 339.4 50.6Q336.8 53.1 335.4 57.2Q334.1 61.4 334 66.6V90Z" />
    </svg>
  );
}
