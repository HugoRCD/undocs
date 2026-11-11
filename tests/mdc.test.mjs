import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { createJiti } from 'jiti'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

// Resolve the parser actually used by Content, not an unrelated hoisted copy.
const require = createRequire(import.meta.url)
const contentRequire = createRequire(require.resolve('@nuxt/content'))
const mdcDist = dirname(contentRequire.resolve('@nuxtjs/mdc'))
const { parseMarkdown } = await import(pathToFileURL(join(mdcDist, 'runtime/parser/index.js')))
const rendererPath = join(mdcDist, 'runtime/components/MDCRenderer.vue')
// The shipped renderer is a script-only SFC; load it without preparing a Nuxt app.
const rendererScript = readFileSync(rendererPath, 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
const { default: MDCRenderer } = await createJiti(import.meta.url).evalModule(rendererScript, {
  filename: rendererPath,
  async: true,
})

for (const selector of ['as', 'is', 'tag']) {
  const Sample = defineComponent({
    props: [selector, 'payload'],
    setup: (props, { slots }) => () => h(props[selector] || 'div', {
      'data-label': props.payload?.label,
    }, slots.default?.()),
  })
  const render = async ({ body, data }) => {
    const app = createSSRApp(MDCRenderer, { body, data, prose: false })
    app.component('Sample', Sample)
    return renderToString(app)
  }

  test(`parser removes object-valued :${selector}`, async () => {
    const parsed = await parseMarkdown(`::sample{:${selector}='{ "template": "<p>object-marker</p>" }'}\nordinary body\n::`, { highlight: false })
    assert.equal(parsed.body.children[0].props[`:${selector}`], undefined)
    const html = await render(parsed)
    assert.ok(html.includes('ordinary body'))
    assert.ok(!html.includes('object-marker'))
  })

  test(`SSR rejects data-bound object-valued :${selector}`, async () => {
    const parsed = await parseMarkdown(`::sample{:${selector}="choice"}\nordinary body\n::`, { highlight: false })
    const html = await render({
      ...parsed,
      data: { choice: { template: '<p>object-marker</p>' } },
    })
    assert.ok(html.includes('ordinary body'))
    assert.ok(!html.includes('object-marker'))
  })

  test(`safe :${selector} and ordinary object data survive`, async () => {
    const parsed = await parseMarkdown(`::sample{:${selector}='"section"' :payload='{ "label": "ordinary-data", "count": 2 }'}\nordinary body\n::`, { highlight: false })
    assert.equal(parsed.body.children[0].props[`:${selector}`], '"section"')
    assert.deepEqual(JSON.parse(parsed.body.children[0].props[':payload']), { label: 'ordinary-data', count: 2 })
    const html = await render(parsed)
    assert.ok(html.includes('<section data-label="ordinary-data">'))
    assert.ok(html.includes('ordinary body'))
  })
}
