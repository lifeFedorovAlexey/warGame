// npm install --prefix campaign/previews/recast-evaluation --no-save --no-package-lock recast-navigation@0.44.0 esbuild@0.25.12
import {copyFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const source=new URL('../../campaign/recast/',import.meta.url);
const vendor=new URL('vendor/',source);
const dependencies=new URL('../../campaign/previews/recast-evaluation/node_modules/',import.meta.url);
const require=createRequire(new URL('../package.json',dependencies));
const {build}=require('esbuild');
await mkdir(vendor,{recursive:true});
await build({
  entryPoints:['route-advisor.mjs','mesh-worker.mjs'].map(name=>fileURLToPath(new URL(name,source))),
  outdir:fileURLToPath(vendor),bundle:true,platform:'browser',format:'esm',splitting:true,
  minify:true,legalComments:'eof',nodePaths:[fileURLToPath(dependencies)],
});
for(const name of ['recast-navigation','@recast-navigation/core','@recast-navigation/generators','@recast-navigation/wasm']){
  await copyFile(new URL(`${name}/LICENSE`,dependencies),new URL(`${name.split('/').at(-1)}-LICENSE.txt`,vendor));
}
