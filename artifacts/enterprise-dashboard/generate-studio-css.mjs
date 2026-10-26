import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'visual-fixture')
const input=path.join(root,'studio-tailwind.input.css')
const result=await postcss([tailwind({base:root})]).process(await fs.readFile(input,'utf8'),{from:input})
const ast=postcss.parse(result.css)
ast.walkRules(rule=>{
 let parent=rule.parent
 while(parent){ if(parent.type==='atrule' && /keyframes/.test(parent.name))return; parent=parent.parent }
 rule.selectors=rule.selectors.map(s=>s===':root, :host' || s===':root' || s===':host' ? '.studio-source' : `.studio-source ${s}`)
})
await fs.writeFile(path.join(root,'studio-utilities.css'),'/* Generated from pinned Studio Base UI source; scope isolates existing Allura screens. */\n'+ast.toString())
console.log('Generated scoped Studio utilities')
