/** Writes the demo store to api/seed/seed.json for the Go backend: `pnpm --filter @artha/fixtures export:seed`. */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { seedState } from './src/store'

const out = resolve(import.meta.dirname, '../../api/seed/seed.json')
writeFileSync(out, JSON.stringify(seedState(), null, 1))
console.log(`wrote ${out}`)
