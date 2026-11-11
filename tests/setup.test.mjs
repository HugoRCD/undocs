import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadNuxt } from 'nuxt/kit'
import { setupDocs } from '../cli/setup.mjs'

for (const existingBuildDir of [false, true]) {
  test(`docs build directory stays stable (${existingBuildDir ? 'existing' : 'fresh'} build)`, async () => {
    const docsDir = await mkdtemp(join(tmpdir(), 'undocs-setup-'))
    const buildDir = join(docsDir, '.docs/.nuxt')
    let nuxt
    try {
      if (existingBuildDir) {
        await mkdir(buildDir, { recursive: true })
      }
      const { appDir, nuxtConfig } = await setupDocs(docsDir, {
        defaults: { url: 'https://example.com' },
      })
      // Match the CLI's Nuxi load options without starting the build or its modules.
      nuxt = await loadNuxt({ cwd: appDir, overrides: { ...nuxtConfig, dev: false }, ready: false })
      assert.equal(nuxt.options.rootDir, join(docsDir, '.docs'))
      assert.equal(nuxt.options.srcDir, join(docsDir, '.docs'))
      assert.equal(nuxt.options.buildDir, buildDir)
    } finally {
      await nuxt?.close()
      await rm(docsDir, { recursive: true, force: true })
    }
  })
}
