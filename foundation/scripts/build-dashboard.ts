import {mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
export async function buildDashboard(destination:string):Promise<void>{
 const root=fileURLToPath(new URL('..',import.meta.url)),outdir=resolve(destination);await mkdir(outdir,{recursive:true});
 const result=await Bun.build({entrypoints:[join(root,'ui/main.tsx')],outdir,target:'browser',format:'esm',minify:true,sourcemap:'none',publicPath:'/assets/',naming:{entry:'app.[ext]',asset:'[name]-[hash].[ext]'},define:{'process.env.NODE_ENV':'"production"'}});
 if(!result.success){throw new Error('dashboard_build_failed: '+result.logs.map(v=>v.message).join(';'));}
 await copyFile(join(root,'../public/brand/allura-lettermark-al-figma.png'),join(outdir,'allura-lettermark.png'));
}
if(import.meta.main){if(process.argv.length!==3){throw new Error('Explicit destination required');}await buildDashboard(process.argv[2]!);}
