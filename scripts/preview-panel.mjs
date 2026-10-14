// Local UI fixture using React shipped with the installed Harness. No credentials or inference.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const assets = path.resolve('.compat/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/assets');
const source = await fs.readFile(path.join(assets, 'index-5SrrfWpU.js'), 'utf8');
const cut = source.indexOf(',Ff={}', source.indexOf('const zf=_o(P4),Df='));
if (cut < 0) throw new Error('React preview fixture requires the checked Harness build.');
const runtime = source.slice(0, cut) + ';export {Ef as React,Df as ReactDOM};';
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Codex panel fixture</title>
<style>:root{--dsw-alias-label-primary:#e7e9ef;--dsw-alias-bg-base:#181a20;--dsw-alias-bg-layer-1:#252832;--dsw-alias-bg-layer-2:#343846;--dsw-alias-border-l2:#414653}body{margin:0;font-family:Segoe UI,sans-serif;background:#101217;color:#e7e9ef}#app{width:440px;height:100vh;border-right:1px solid #414653}button:disabled{opacity:.5;cursor:default!important}select option{background:#252832}textarea:focus,input:focus,select:focus{outline:2px solid #718cff}</style><div id="app"></div>
<script type="module">
import {React,ReactDOM} from '/runtime.mjs';
let plugin,Body,props;const signal=new AbortController().signal;
window.fixtureCalls=[];
window.__ModuleLoader__={load:m=>plugin=m.factory(name=>{if(name==='react')return React;throw Error(name)})};
await import('/client.js');
const fixtureJobs=[{id:'47fff61164ee',kind:'review',state:'incomplete',model:'gpt-6.1-sol',status:'incomplete',summary:'Найдена ошибка обработки генератора идентификаторов.',options:[],findings:[{severity:'medium'}],changes:[],digest:null,limited:true},{id:'abc123abc123',kind:'plan',state:'ready',model:'gpt-6.1-sol',status:'complete',summary:'Предложены два варианта архитектуры.',options:[{name:'React + TypeScript'},{name:'TypeScript без UI-фреймворка'}],findings:[],changes:[],digest:null,limited:false}];
const ctx={effect:f=>f(),sidebarRightTabs:{register:()=>()=>{}},slots:{inject:(n,f)=>f(),register:(r,b)=>{Body=b;props=r.inject('fixture');return()=>{}}},remote:{commands:{execute:async(id,line)=>{window.fixtureCalls.push(line);let text=line.endsWith('dashboard')?JSON.stringify({models:{review:'gpt-6.1-sol'},quotaPaused:false,busy:false,jobs:fixtureJobs}):line.includes('models json')?JSON.stringify({models:[{id:'gpt-6.1-sol',name:'GPT-6.1-Sol',default:true},{id:'gpt-6-luna',name:'GPT-6-Luna',default:false}]}):'Команда выполнена: '+line;return{ok:true,value:{result:{kind:'success',text}}}}}}};
plugin.apply(ctx);ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(Body,{...props,useTabInfo:()=>({tab:{signal}})}));
</script></html>`;
const server = http.createServer(async (request, response) => {
  try {
    const route = request.url;
    const vendor = /^\/vendor-[a-zA-Z0-9_-]+\.js$/.test(route);
    const contents = route === '/' ? html : route === '/runtime.mjs' ? runtime : route === '/client.js' ? await fs.readFile('src/client.js') : vendor ? await fs.readFile(path.join(assets, route.slice(1))) : null;
    if (!contents) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', route === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8'); response.end(contents);
  } catch { response.writeHead(500); response.end('Fixture error'); }
});
const port = Number(process.argv[2] || 43127);
server.listen(port, '127.0.0.1', () => console.log(`Panel UI fixture: http://127.0.0.1:${port}`));
