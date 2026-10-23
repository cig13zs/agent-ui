// Validates registry.json and public/r/*.json two ways: against the JSON
// Schemas published by shadcn (copied into scripts/schema from
// github.com/shadcn-ui/ui, apps/v4/public/schema, MIT) and against the zod
// schemas the shadcn CLI itself parses with. Also checks that every built
// file matches its source and every registry dependency URL resolves.
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import Ajv from "ajv"
import { registryItemSchema, registrySchema } from "shadcn/schema"

const root = new URL("..", import.meta.url).pathname
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"))
const BASE = "https://cig13zs.github.io/agent-ui/r/"

const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false })
const itemJsonSchema = read("scripts/schema/registry-item.json")
ajv.addSchema({ ...itemJsonSchema, $id: "https://ui.shadcn.com/schema/registry-item.json" })
const validateItem = ajv.getSchema("https://ui.shadcn.com/schema/registry-item.json")
const validateRegistry = ajv.compile(read("scripts/schema/registry.json"))

let failures = 0
const fail = (msg) => {
  failures++
  console.error(`x ${msg}`)
}

const registry = read("registry.json")
if (!validateRegistry(registry)) fail(`registry.json (JSON Schema): ${ajv.errorsText(validateRegistry.errors)}`)
const zr = registrySchema.safeParse(registry)
if (!zr.success) fail(`registry.json (shadcn zod): ${zr.error.message}`)

const built = readdirSync(join(root, "public/r")).filter((f) => f.endsWith(".json") && f !== "registry.json")
const names = new Set(registry.items.map((i) => i.name))
for (const name of names) if (!built.includes(`${name}.json`)) fail(`missing public/r/${name}.json`)

for (const file of built) {
  const item = read(`public/r/${file}`)
  if (!validateItem(item)) fail(`${file} (JSON Schema): ${ajv.errorsText(validateItem.errors)}`)
  const zi = registryItemSchema.safeParse(item)
  if (!zi.success) fail(`${file} (shadcn zod): ${zi.error.message}`)
  for (const f of item.files ?? []) {
    if (typeof f.content !== "string" || f.content.length === 0) fail(`${file}: ${f.path} has no content`)
    else if (f.content !== readFileSync(join(root, f.path), "utf8")) fail(`${file}: ${f.path} is stale, run npm run registry:build`)
  }
  for (const dep of item.registryDependencies ?? []) {
    if (!dep.startsWith(BASE)) continue
    const target = dep.slice(BASE.length).replace(/\.json$/, "")
    if (!names.has(target)) fail(`${file}: dependency ${dep} is not in the registry`)
  }
}

if (failures) {
  console.error(`\n${failures} registry problem(s)`)
  process.exit(1)
}
console.log(`registry ok: ${built.length} items valid against the shadcn JSON Schema and CLI schema`)
