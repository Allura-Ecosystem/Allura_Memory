import fs from 'node:fs/promises';
import path from 'node:path';
// eslint-disable-next-line import/no-unresolved -- @oai/artifact-tool is a local-only deck tool, not a runtime dependency
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const root = path.resolve('docs/portfolio/allura-agentic-framework-harness');
const out = path.join(root, 'deck');
const renderDir = path.join(out, 'rendered');
await fs.mkdir(renderDir, { recursive: true });
const C = { cream:'#F7F3EE', ink:'#0F1720', blue:'#0D47A1', orange:'#FF4D1F', green:'#148A4B', rule:'#D6D1CA', muted:'#59616A', paleBlue:'#E7EEF9', paleOrange:'#FCE9E2', paleGreen:'#E5F1E9' };
const mark = path.join(root, 'assets/allura-wordmark-cropped.png');
const info = (n) => path.join(root, 'infographics/png', `${n}.png`);
const dashboard = path.resolve('artifacts/dashboard-demo/curator.png');
const assetBytes = new Map();
assetBytes.set('mark', await fs.readFile(mark));
for (const name of ['01-framework-harness-architecture','02-deterministic-harness','03-enterprise-governance','04-developer-interfaces','05-governed-memory-lifecycle','06-evidence-to-release-chain']) assetBytes.set(name, await fs.readFile(info(name)));
assetBytes.set('dashboard', await fs.readFile(dashboard));
const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function shape(slide, geometry, position, fill, line={ style:'solid', fill:'none', width:0 }, name) {
  return slide.shapes.add({ geometry, name, position, fill, line, borderRadius: geometry === 'roundRect' ? 18 : undefined });
}
function txt(slide, text, position, fontSize=24, color=C.ink, bold=false, name='text', alignment='left') {
  const s = shape(slide, 'textbox', position, 'none', {style:'solid',fill:'none',width:0}, name);
  s.text = text;
  s.text.style = { fontSize, color, bold, fontFace:'Noto Sans', alignment, marginLeft:0, marginRight:0, marginTop:0, marginBottom:0 };
  return s;
}
function mono(slide, text, position, color=C.blue, size=13, name='mono') {
  const s = txt(slide, text, position, size, color, true, name);
  s.text.style = { fontSize:size, color, bold:true, fontFace:'IBM Plex Mono', alignment:'left', marginLeft:0, marginRight:0, marginTop:0, marginBottom:0 };
  return s;
}
function shell(number, eyebrow='ALLURA MEMORY / PORTFOLIO EVIDENCE') {
  const slide = p.slides.add();
  slide.background.fill = C.cream;
  slide.images.add({ blob:assetBytes.get('mark'), contentType:'image/png', alt:'Official Allura wordmark', fit:'contain', position:{left:54,top:28,width:112,height:44} });
  mono(slide, eyebrow, {left:182,top:40,width:470,height:22}, C.blue, 13, 'eyebrow');
  mono(slide, String(number).padStart(2,'0'), {left:1175,top:40,width:50,height:22}, C.blue, 13, 'slide-number');
  shape(slide,'line',{left:54,top:86,width:1172,height:0},'none',{style:'solid',fill:C.rule,width:1},'top-rule');
  return slide;
}
function notes(slide, sources, speaker='') { slide.speakerNotes.textFrame.setText(`[Sources]\n${sources.map(s=>`- ${s}`).join('\n')}\n\n[Presenter notes]\n${speaker}`); slide.speakerNotes.setVisible(true); }
function infographicSlide(number, asset, heading, sources) {
  const slide = p.slides.add();
  slide.background.fill = C.cream;
  slide.images.add({blob:assetBytes.get(asset),contentType:'image/png',alt:`Allura infographic: ${heading}`,fit:'contain',position:{left:42,top:0,width:1196,height:680}});
  txt(slide,`0${number}  /  ALLURA TECHNICAL CASE STUDY — ROLE-ALIGNED EVIDENCE; NO EXTERNAL AFFILIATION IMPLIED.`,{left:54,top:690,width:1110,height:16},11,C.muted,false,'boundary');
  notes(slide,sources,'Use the graphic to explain the execution boundary and then invite verification through the cited paths.');
}

// 1 — title
{
 const s=shell(1,'ALLURA / TECHNICAL PORTFOLIO');
 shape(s,'roundRect',{left:54,top:125,width:1172,height:385},C.ink,{style:'solid',fill:C.ink,width:0},'title-panel');
 mono(s,'AGENTIC AI FRAMEWORK & HARNESS',{left:94,top:170,width:560,height:24},C.orange,15,'kicker');
 txt(s,'Evidence-first\nenterprise AI systems.',{left:94,top:213,width:760,height:150},54,C.cream,true,'title');
 txt(s,'A technical case study of orchestration, governed memory, policy hooks, deterministic evaluation and developer interfaces.',{left:94,top:395,width:780,height:60},20,C.cream,false,'subtitle');
 shape(s,'roundRect',{left:925,top:180,width:205,height:205},C.blue,{style:'solid',fill:C.blue,width:0},'blue-module');
 shape(s,'ellipse',{left:1030,top:335,width:145,height:145},C.orange,{style:'solid',fill:C.orange,width:0},'orange-module');
 shape(s,'roundRect',{left:1125,top:410,width:90,height:120},C.green,{style:'solid',fill:C.green,width:0},'green-module');
 txt(s,'Role-aligned to Principal Engineer, Agentic AI Framework and Harness',{left:54,top:565,width:900,height:30},22,C.ink,true,'role');
 txt(s,'Prepared as a portfolio presentation. It does not imply the target enterprise sponsorship, employment or deployment.',{left:54,top:610,width:1040,height:28},16,C.muted,false,'disclaimer');
 notes(s,['target role posting (accessed 2026-09-01)','docs/portfolio/allura-agentic-framework-harness/SOURCES.md'],'Open with scope and boundary: this shows engineering evidence, not a client claim.');
}
// 2 — role fit
{
 const s=shell(2);
 txt(s,'What this portfolio demonstrates',{left:54,top:112,width:760,height:48},33,C.ink,true,'title');
 txt(s,'The role calls for reusable frameworks, deterministic harnesses, memory, policy hooks and developer interfaces. Each claim below has a repository or CI source.',{left:54,top:166,width:1060,height:42},18,C.muted,false,'intro');
 const items=[['FRAMEWORK','Reusable execution path','Orchestration plus shared interfaces',C.blue,C.paleBlue],['HARNESS','Deterministic evidence','Scenario, receipt, replay, evaluation',C.orange,C.paleOrange],['GOVERNANCE','Controls in the flow','Proof, policy, RLS, durable audit',C.green,C.paleGreen],['DEVELOPER EXPERIENCE','One governed core','SDK, API/MCP and CLI',C.ink,C.cream]];
 items.forEach((it,i)=>{const x=54+i*292;shape(s,'roundRect',{left:x,top:260,width:260,height:230},it[4],{style:'solid',fill:it[3],width:2},`theme-${i}`);mono(s,it[0],{left:x+24,top:292,width:210,height:20},it[3],13,`theme-kicker-${i}`);txt(s,it[1],{left:x+24,top:332,width:210,height:62},25,C.ink,true,`theme-heading-${i}`);txt(s,it[2],{left:x+24,top:418,width:210,height:38},16,C.muted,false,`theme-body-${i}`);});
 txt(s,'The focus is evidence that a hiring panel can inspect—not a collection of visual claims.',{left:54,top:570,width:900,height:28},20,C.ink,true,'close');
 notes(s,['target role posting (accessed 2026-09-01)','FRAMEWORK.md'],'Map the job’s themes directly to the following visuals.');
}
infographicSlide(3,'01-framework-harness-architecture','One governed execution path',['FRAMEWORK.md §§ Architecture, Orchestration, Policy, Harness, Interfaces']);
infographicSlide(4,'02-deterministic-harness','Determinism is an engineering property',['FRAMEWORK.md § Simulator harness and evaluation','GitHub Actions run 33502490831']);
infographicSlide(5,'05-governed-memory-lifecycle','Memory is governed across its lifecycle',['FRAMEWORK.md § Memory patterns']);
infographicSlide(6,'03-enterprise-governance','Controls belong on the critical path',['FRAMEWORK.md §§ Policy hooks and tool calling, Governance and scale']);
infographicSlide(7,'04-developer-interfaces','Developer interfaces share the same controls',['FRAMEWORK.md § Developer interfaces']);
infographicSlide(8,'06-evidence-to-release-chain','Evidence makes the release claim inspectable',['GitHub Actions run 33502490831','artifacts/dashboard-demo/manifest.json']);
// 9 — dashboard proof
{
 const s=shell(9);
 txt(s,'Dashboard proof: captured, not invented',{left:54,top:112,width:800,height:45},33,C.ink,true,'title');
 txt(s,'The Curator route is a real capture from the active local demonstration. The manifest records seven tested routes, all HTTP 200, without captured console or page errors.',{left:54,top:164,width:1120,height:42},18,C.muted,false,'intro');
 shape(s,'roundRect',{left:54,top:235,width:700,height:370},C.ink,{style:'solid',fill:C.ink,width:1},'screenshot-frame');
 s.images.add({blob:assetBytes.get('dashboard'),contentType:'image/png',alt:'Allura Curator dashboard screenshot from local route capture',fit:'contain',position:{left:66,top:247,width:676,height:346}});
 const evidence=[['7 / 7','captured routes returned HTTP 200',C.blue],['0','captured redirects',C.orange],['0','captured console or page errors',C.green]];
 evidence.forEach((e,i)=>{const y=255+i*105;mono(s,e[0],{left:825,top:y,width:120,height:28},e[2],24,`metric-${i}`);txt(s,e[1],{left:825,top:y+36,width:330,height:40},17,C.ink,true,`metric-label-${i}`);shape(s,'line',{left:825,top:y+87,width:330,height:0},'none',{style:'solid',fill:C.rule,width:1},`metric-rule-${i}`);});
 txt(s,'The screenshot is supporting evidence, not a mockup and not a substitute for the system test record.',{left:54,top:645,width:1090,height:26},16,C.ink,true,'boundary');
 notes(s,['artifacts/dashboard-demo/manifest.json','artifacts/dashboard-demo/curator.png'],'Explain the capture boundary and point to the machine-readable manifest.');
}
// 10 — verification boundaries
{
 const s=shell(10);
 txt(s,'How to verify this portfolio',{left:54,top:112,width:800,height:48},33,C.ink,true,'title');
 txt(s,'A credible portfolio lets the reviewer separate demonstrated capability from future work.',{left:54,top:166,width:1030,height:32},19,C.muted,false,'intro');
 const cols=[['VERIFY NOW',['Read FRAMEWORK.md','Inspect PR #138','Open CI evidence run','Review dashboard manifest'],C.blue,C.paleBlue],['DEMONSTRATED HERE',['Framework and harness','Governed memory','Policy and audit path','Developer interfaces'],C.green,C.paleGreen],['NOT CLAIMED',['External client deployment','the target enterprise affiliation','Production-scale adoption','Unverified performance results'],C.orange,C.paleOrange]];
 cols.forEach((c,i)=>{const x=54+i*388;shape(s,'roundRect',{left:x,top:250,width:350,height:285},c[3],{style:'solid',fill:c[2],width:2},`col-${i}`);mono(s,c[0],{left:x+26,top:282,width:290,height:20},c[2],14,`col-kicker-${i}`);c[1].forEach((v,j)=>{shape(s,'ellipse',{left:x+28,top:334+j*43,width:10,height:10},c[2],{style:'solid',fill:c[2],width:0},`dot-${i}-${j}`);txt(s,v,{left:x+52,top:324+j*43,width:260,height:28},18,C.ink,j===0,`list-${i}-${j}`);});});
 txt(s,'The final deliverable includes editable SVGs, source notes, alt text and a production release gate.',{left:54,top:605,width:1050,height:28},20,C.ink,true,'close');
 notes(s,['docs/portfolio/allura-agentic-framework-harness/SOURCES.md','docs/portfolio/allura-agentic-framework-harness/qa/BRAND-RELEASE-GATE.md'],'Close by making verification easy and stating what this case study does not claim.');
}

const write = async (file, blob) => {
  const data = typeof blob?.arrayBuffer === 'function' ? new Uint8Array(await blob.arrayBuffer()) : blob;
  return fs.writeFile(file, data);
};
for (let i=0;i<p.slides.items.length;i++) {
  const slide=p.slides.items[i];
  await write(path.join(renderDir,`slide-${String(i+1).padStart(2,'0')}.png`), await p.export({slide,format:'png',scale:1}));
  await fs.writeFile(path.join(renderDir,`slide-${String(i+1).padStart(2,'0')}.layout.json`), await (await slide.export({format:'layout'})).text());
}
await write(path.join(renderDir,'montage.webp'),await p.export({format:'webp',montage:true,scale:1}));
await fs.writeFile(path.join(renderDir,'inspection.txt'),JSON.stringify(await p.inspect({kind:'slide,textbox,shape,image,notes',maxChars:20000}),null,2));
const pptx = await PresentationFile.exportPptx(p);
await pptx.save(path.join(out,'Allura-Agentic-AI-Framework-Harness-Portfolio.pptx'));
console.log(`Wrote 10-slide portfolio deck to ${out}`);
