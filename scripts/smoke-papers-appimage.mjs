/** Launch the actual Linux AppImage under Xvfb, using a disposable credential-free profile. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {probeEnv} from './smoke-demo-runtime.mjs';
const root=path.resolve(import.meta.dirname,'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
const home=fs.mkdtempSync(path.join(os.tmpdir(),'lh-appimage-proof-'));
const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
const artifact=path.resolve(process.argv[2] ?? path.join(root,`dist/LearnHarness-Papers-${version}-x86_64.AppImage`));
fs.mkdirSync(path.join(root,'dist/paper-teaching-evidence'),{recursive:true});
const env=probeEnv(process.env,home); delete env.WAYLAND_DISPLAY; delete env.WAYLAND_SOCKET; env.XDG_SESSION_TYPE="x11";
const child=spawn('xvfb-run',['-a',artifact,`--remote-debugging-port=${port}`,'--disable-gpu'],{env,stdio:['ignore','pipe','pipe'],detached:true});
let log='';child.stdout.on('data',d=>log=(log+d).slice(-14000));child.stderr.on('data',d=>log=(log+d).slice(-14000));
let browser;
try{
 let version;
 for(let i=0;i<150;i++){version=await fetch(`http://127.0.0.1:${port}/json/version`).then(r=>r.json()).catch(()=>null);if(version?.webSocketDebuggerUrl)break;if(child.exitCode!==null)throw Error(`AppImage exited ${child.exitCode}: ${log}`);await delay(300);}
 assert.ok(version?.webSocketDebuggerUrl,log);
 browser=await puppeteer.connect({browserWSEndpoint:version.webSocketDebuggerUrl});
 let page;
 for(let i=0;i<150;i++){page=(await browser.pages()).find(p=>p.url().startsWith('http://127.0.0.1:'));if(page)break;await delay(300);}
 assert.ok(page,log);
 await page.waitForFunction(()=>/which paper|teach paper/i.test(document.body?.innerText ?? ''),{timeout:45000});
 const title=await page.title();assert.equal(title,'LearnHarness Papers');
 const created=await page.evaluate(async()=>{const r=await fetch('/api/chats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'AppImage paper lesson smoke'})});if(!r.ok)throw Error(await r.text());return r.json();});
 const settingsLoaded=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/chats/${created.id}/teaching`&&r.status()===200);
 await page.goto(new URL(`/chat/${created.id}`,page.url()).href,{waitUntil:'domcontentloaded'});await settingsLoaded;
 await page.waitForSelector('[data-testid="paper-lesson-bar"]');
 await page.click('[data-testid="paper-lesson-bar"] button');await page.waitForSelector('select[aria-label="Lesson checks"]');
 assert.equal(await page.$eval('select[aria-label="Lesson checks"]',e=>e.value),'6');
 await page.screenshot({path:path.join(root,'dist/paper-teaching-evidence/appimage-window.png'),fullPage:true});
 assert.ok(fs.existsSync(path.join(home,'config','LearnHarness Papers')),'Separate Papers profile created');
 assert.ok(!fs.existsSync(path.join(home,'config','LearnHarness')),'Original profile was not created or changed');
 fs.writeFileSync(path.join(root,'dist/paper-teaching-evidence/appimage-result.json'),JSON.stringify({ok:true,title,artifact:path.basename(artifact),checks:['actual AppImage mounted and launched under Xvfb','packaged Electron window served the app','desktop API session creation','paper lesson controls default to six checks','separate LearnHarness Papers profile'],profile:'temporary, removed after verification'},null,2));
 console.log('[appimage-smoke] actual AppImage launch, desktop API, paper controls and isolated identity passed');
}catch(e){console.error(log);throw e;}
finally{await browser?.disconnect();try{process.kill(-child.pid,'SIGTERM');}catch{}await Promise.race([once(child,'exit'),delay(5000)]);try{process.kill(-child.pid,'SIGKILL');}catch{}fs.rmSync(home,{recursive:true,force:true});}
