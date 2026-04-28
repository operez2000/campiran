// src/config/envparser.js
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Needed to resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function loadEnv(mode = 'development') {
  const envPath = path.resolve(__dirname, `../../.env.${mode}`)
  const parsed = dotenv.config({ path: envPath }).parsed || {}

  const stringified = {}
  for (const key in parsed) {
    stringified[key] = JSON.stringify(parsed[key])
  }

  return stringified
}
