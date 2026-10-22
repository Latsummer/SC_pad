/* Cached tab navigation must not be blocked by a slow or offline network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const listeners={},store=new Map(),network=[];
const origin='http://localhost:8000',scope=origin+'/';
const key=r=>typeof r==='string'?r:r.url;
const cache={match:async r=>store.get(key(r)),put:async(r,v)=>store.set(key(r),v),addAll:async()=>{}};
let fetchMode='slow';
const ctx={URL,Response,caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},self:{location:{origin},registration:{scope},addEventListener:(name,fn)=>listeners[name]=fn},fetch:r=>{network.push(r.url);return fetchMode==='slow'?new Promise(()=>{}):fetchMode==='offline'?Promise.reject(Error('offline')):Promise.resolve(new Response('new'));}};
vm.runInNewContext(fs.readFileSync('scminer-local/dist/sw.js','utf8'),ctx);
function request(path,mode='cors'){
 let result;const jobs=[];
 listeners.fetch({request:{url:origin+path,method:'GET',mode},respondWith:p=>result=p,waitUntil:p=>jobs.push(p)});
 return result;
}
(async()=>{
 store.set(scope+'missions.html',new Response('mission shell'));
 assert.equal(await (await request('/missions.html?id=abc','navigate')).text(),'mission shell');
 store.set(scope+'index.html',new Response('home shell'));
 assert.equal(await (await request('/index.html?mode=blueprints','navigate')).text(),'home shell');
 const version='123456abcdef';store.set(scope+'missions/index.json?v='+version,new Response('data'));
 assert.equal(await (await request('/missions/index.json?v='+version)).text(),'data');
 store.set(scope+'missions/details-01-abcdef123456.json',new Response('detail'));
 assert.equal(await (await request('/missions/details-01-abcdef123456.json')).text(),'detail');
 assert.equal(network.length,0,'warm navigation and versioned data must not contact or wait for the network');
 fetchMode='online';assert.equal(await (await request('/missions/index.json?v=abcdef123456')).text(),'new','new data hash cannot hit the old cache');
 fetchMode='offline';store.set(scope+'theme.js',new Response('offline fallback'));
 assert.equal(await (await request('/theme.js')).text(),'offline fallback');
 store.delete(scope+'missions.html');assert.equal((await request('/missions.html','navigate')).type,'error','missing task shell cannot fall back to a different page');
 let intercepted=false;listeners.fetch({request:{url:'https://example.org/data',method:'GET'},respondWith(){intercepted=true;}});assert.equal(intercepted,false);
 console.log('Navigation cache passed: warm pages, query parameters, exact data versions, details, offline and external requests');
})().catch(error=>{console.error(error);process.exitCode=1;});
