import { defineConfig, loadEnv } from 'vite'
import { createHash } from 'node:crypto'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const developmentBackup=(path?:string)=>({
  name:'development-backup',
  configureServer(server:any){
    if(!path)return
    server.middlewares.use('/__stride-development-backup',(request:any,response:any,next:any)=>{
      const address=request.socket.remoteAddress
      if(request.method!=='GET'||(address!=='127.0.0.1'&&address!=='::1'&&address!=='::ffff:127.0.0.1')){response.statusCode=403;return response.end()}
      try{response.setHeader('Content-Type','application/json');response.setHeader('Cache-Control','no-store');response.end(readFileSync(path,'utf8'))}
      catch{return next()}
    })
  },
})

const serviceWorkerAssets=()=>( {
  name:'service-worker-assets',
  writeBundle(options:any,bundle:Record<string,{fileName:string;type?:'asset'|'chunk';isEntry?:boolean}>){
    const output=typeof options.dir==='string'?options.dir:'dist'
    const path=resolve(output,'sw.js')
    const assets=Object.values(bundle).filter(item=>item.isEntry||(item.type==='asset'&&item.fileName.endsWith('.css'))).map(item=>`/${item.fileName}`)
    const generated=JSON.stringify(assets)
    const cache=`stride-shell-${createHash('sha256').update(generated).digest('hex').slice(0,12)}`
    writeFileSync(path,readFileSync(path,'utf8').replace("const CACHE='stride-shell'",`const CACHE='${cache}'`).replace('const GENERATED=[]',`const GENERATED=${generated}`))
  },
})

export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'')
 return {
  plugins: [developmentBackup(env.STRIDE_DEV_BACKUP_PATH), react(), tailwindcss(), serviceWorkerAssets()],
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
 }
})
