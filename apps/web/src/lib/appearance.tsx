import type { AccentPreset } from '@artha/types'
import { useEffect } from 'react'
import { useAppState } from '../state/store'

/** Accent presets; white text on each `strong` value passes WCAG AA. */
export const ACCENTS: Record<AccentPreset, { label: string; accent: string; strong: string; dark: string; soft: string }> = {
  artha: { label: 'Artha blue', accent: '#0e9ed8', strong: '#04345c', dark: '#032845', soft: '#e6f5fc' },
  'wit-red': { label: 'WIT red', accent: '#ed1c24', strong: '#c9141b', dark: '#a80f15', soft: '#fdeced' },
  ocean: { label: 'Ocean blue', accent: '#1d6fd8', strong: '#1a5fb8', dark: '#154c94', soft: '#e8f1fc' },
  emerald: { label: 'Emerald', accent: '#0f9f6e', strong: '#0b7d57', dark: '#086446', soft: '#e6f6f0' },
  amber: { label: 'Amber', accent: '#e08a00', strong: '#a55f00', dark: '#864d00', soft: '#fdf3e2' },
  violet: { label: 'Violet', accent: '#7c3aed', strong: '#6d28d9', dark: '#5b21b6', soft: '#f1eafe' },
}

/** Writes the chosen accent over the theme tokens on :root. */
export function AppearanceSync() {
  const { state } = useAppState()
  const preset = ACCENTS[state.appearance.accent]
  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--color-accent', preset.accent)
    root.setProperty('--color-accent-strong', preset.strong)
    root.setProperty('--color-accent-dark', preset.dark)
    root.setProperty('--color-accent-soft', preset.soft)
  }, [preset])
  return null
}
