import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Resolve a public asset path relative to the Vite base URL.
 * Handles both root deployments and sub-path deployments (e.g. GitHub Pages).
 *
 * @example assetUrl('logos/tennis.svg') → '/logos/tennis.svg' (local)
 * @example assetUrl('logos/tennis.svg') → '/grandslam/logos/tennis.svg' (GH Pages)
 */
export function assetUrl(path: string): string {
  // Strip a leading slash so we never get a double-slash when BASE_URL ends with '/'.
  const normalised = path.replace(/^\//, "");
  return `${import.meta.env.BASE_URL}${normalised}`;
}

/** The app's canonical dark background colour — used where CSS variables are unavailable (e.g. html2canvas). */
export const APP_BACKGROUND_COLOR = "#0d0d0d";
