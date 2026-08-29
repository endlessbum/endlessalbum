export type UiFont =
  | "PitagonSansMono-Thin"
  | "PitagonSansMono-ExtraLight"
  | "PitagonSansMono-Light"
  | "PitagonSansMono-Regular"
  | "PitagonSansMono-Medium"
  | "PitagonSansMono-SemiBold"
  | "PitagonSansMono-Bold"
  | "PitagonSansMono-ExtraBold";

export const DEFAULT_UI_FONT: UiFont = "PitagonSansMono-Light";

export const UI_FONT_OPTIONS: { value: UiFont; label: string }[] = [
  { value: "PitagonSansMono-Thin", label: "Pitagon Sans Mono Thin" },
  { value: "PitagonSansMono-ExtraLight", label: "Pitagon Sans Mono ExtraLight" },
  { value: "PitagonSansMono-Light", label: "Pitagon Sans Mono Light" },
  { value: "PitagonSansMono-Regular", label: "Pitagon Sans Mono Regular" },
  { value: "PitagonSansMono-Medium", label: "Pitagon Sans Mono Medium" },
  { value: "PitagonSansMono-SemiBold", label: "Pitagon Sans Mono SemiBold" },
  { value: "PitagonSansMono-Bold", label: "Pitagon Sans Mono Bold" },
  { value: "PitagonSansMono-ExtraBold", label: "Pitagon Sans Mono ExtraBold" },
];

const PITAGON_FONTS: Record<UiFont, { cssFamily: string }> = {
  "PitagonSansMono-Thin": {
    cssFamily: "'Pitagon Sans Mono Thin', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  "PitagonSansMono-ExtraLight": {
    cssFamily: "'Pitagon Sans Mono ExtraLight', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  "PitagonSansMono-Light": {
    cssFamily: "'Pitagon Sans Mono Light', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  "PitagonSansMono-Regular": {
    cssFamily: "'Pitagon Sans Mono Regular', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  "PitagonSansMono-Medium": {
    cssFamily: "'Pitagon Sans Mono Medium', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  "PitagonSansMono-SemiBold": {
    cssFamily: "'Pitagon Sans Mono SemiBold', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  "PitagonSansMono-Bold": {
    cssFamily: "'Pitagon Sans Mono Bold', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  "PitagonSansMono-ExtraBold": {
    cssFamily: "'Pitagon Sans Mono ExtraBold', ui-monospace, SFMono-Regular, Menlo, monospace",
  },
};

export function applyUiFont(font: UiFont) {
  const cfg = PITAGON_FONTS[font];
  if (!cfg) return;
  try {
    document.documentElement.style.setProperty('--font-sans', cfg.cssFamily);
  } catch {}
}

export function getStoredUiFont(): UiFont | undefined {
  try {
    const v = localStorage.getItem('ui:font') as UiFont | null;
    return v && v in PITAGON_FONTS ? v : undefined;
  } catch { return undefined; }
}
