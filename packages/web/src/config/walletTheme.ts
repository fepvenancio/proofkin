import { lightTheme } from "@rainbow-me/rainbowkit";

/**
 * @notice RainbowKit in the page's own colours: ink on paper, not its default blue.
 * @dev The two hex values are the stylesheet's `--color-ink` and `--color-paper`; `design.test.ts` fails if they drift
 * apart. The modal keeps RainbowKit's light theme, which already sits on a white sheet.
 */
export const walletTheme = lightTheme({
  accentColor: "#171b2a",
  accentColorForeground: "#eceef1",
  borderRadius: "small",
  fontStack: "system",
});
