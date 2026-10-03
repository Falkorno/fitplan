import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

const roots=['src','public','integrations','scripts'],extensions=new Set(['.ts','.tsx','.css','.html','.mjs','.md','.json','.yaml','.txt']),bad=/\u00c3|\u00c2|\u00e2[\u0080-\uFFFF]|\u00f0\u0178|\u00ef\u00b8|\uFFFD/
const failures=[]
async function walk(path){for(const entry of await readdir(path,{withFileTypes:true})){const target=join(path,entry.name);if(entry.isDirectory())await walk(target);else if(extensions.has(extname(entry.name))){const lines=(await readFile(target,'utf8')).split(/\r?\n/);lines.forEach((line,index)=>{if(bad.test(line))failures.push(`${target}:${index+1}: ${line.trim()}`)})}}}
for(const root of roots)await walk(root)
for(const file of ['index.html','server.mjs']){const lines=(await readFile(file,'utf8')).split(/\r?\n/);lines.forEach((line,index)=>{if(bad.test(line))failures.push(`${file}:${index+1}: ${line.trim()}`)})}
if(failures.length){console.error(`Corrupted text detected:\n${failures.join('\n')}`);process.exit(1)}
console.log('Text encoding check passed.')

