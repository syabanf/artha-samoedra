import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const twMerge = extendTailwindMerge({
  extend: { theme: { radius: ['card', 'hero', 'pill'], shadow: ['card', 'float', 'glow', 'up'] } },
})

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'
