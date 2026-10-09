#!/usr/bin/env node
// Removes build output before a release build so a file left in out/ by an earlier or debug build can never be
// packaged into app.asar. check-package.mjs verifies the result.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
fs.rmSync(path.join(desktop, 'out'), { recursive: true, force: true })
console.log('Removed desktop/out before building.')
