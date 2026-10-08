/**
 * Files the tower serves straight out of installed packages, found by Node's resolver from this checkout: a worktree
 * with its own `node_modules` reads its own, one without reads the nearest above it.
 */
import { findPackageJSON } from 'node:module'
import path from 'node:path'
import type { fonts } from './shared/design.ts'

/** A package's root directory, whatever files its `exports` hide. */
export const packageDir = (name: string) => path.dirname(findPackageJSON(name, import.meta.url)!)

export const fontFile = (font: (typeof fonts)[number]) => path.join(packageDir(`@fontsource/${font.pkg}`), 'files', font.file)
