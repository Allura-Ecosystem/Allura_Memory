import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Editable educational diagrams. No generated logo, fake interface, or live-state badge.
const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '../../..');
const official = path.join(repo, 'public/readme/allura-wordmark.png');
const original = await fs.readFile(official);
await fs.mkdir(path.join(root, 'assets'), { recursive: true });
await fs.writeFile(path.join(root, 'assets/allura-wordmark-original.png'), original);
// Remove transparent padding only; retain every visible official mark pixel.
const trimmed = await sharp(original).trim().png().toBuffer();
const mark = trimmed.toString('base64');
const C = { cream:'#F7F3EE', ink:'#0F1720', blue:'#0D47A1', orange:'#FF4D1F', green:'#148A4B' };
const esc = (v) => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const text = (x,y,lines,size=28,color=C.ink,weight=400,lineHeight=1.35) => `<text x="${x}" y="${y}" fill="${color}" font-family="Noto Sans,Arial,sans-serif" font-size="${size}" font-weight="${weight}">${(Array.isArray(lines)?lines:[lines]).map((v,i)=>`<tspan x="${x}" dy="${i?size*lineHeight:0}">${esc(v)}</tspan>`).join('')}</text>`;
const box = (x,y,w,h,color=C.ink) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${C.cream}" stroke="${color}" stroke-width="2"/>`;
const arrow = (x,y,label,mobile=false) => mobile
  ? `<path d="M${x},${y}v46m-10,-10l10,10l10,-10" fill="none" stroke="${C.ink}" stroke-width="3"/>${text(x+25,y+29,label,32)}`
  : `<path d="M${x},${y}h44m-10,-10l10,10l-10,10" fill="none" stroke="${C.ink}" stroke-width="3"/>`;
const pages = [
  {
    id:'01-remember-a-decision', title:['A decision your next','session can find.'], desktopTitle:'A decision your next session can find.',
    intro:['An illustrative workflow for connected agents.'],
    cards:[
      {n:'1',title:'Save the decision',body:['“We chose PostgreSQL”','with its reason.'],color:C.blue},
      {n:'2',title:'Search next session',body:['A connected agent asks','for that project decision.'],color:C.blue},
      {n:'3',title:'Inspect the result',body:['Check the source and','available review state.'],color:C.orange}
    ],
    takeaway:['Saved context gives an agent something to check.'],
    caution:['Integration must call save and search.','A result does not guarantee a correct answer.'],
    mobileTakeaway:['Give the next agent','context to check.'],
    alt:'A decision your next session can find. Numbered flow, read left to right on desktop and top to bottom on phone: a connected agent saves the PostgreSQL decision with its reason; another session searches; a person or agent inspects the returned source and available review state. This is an illustrative workflow, not a verified live run or a guarantee of correct recall.'
  },
  {
    id:'02-who-does-what',title:['Who does what?'],desktopTitle:'Who does what?',
    intro:['Saving, running the service, and approving have different owners.'],
    cards:[
      {n:'1',title:'Agent / integration',body:['Calls save and search.','Chooses context to submit.'],color:C.blue},
      {n:'2',title:'Allura service',body:['Stores submitted context.','Searches authorized scope.'],color:C.blue},
      {n:'3',title:'Operator',body:['Sets up hosting and access.','Maintains the service.'],color:C.ink},
      {n:'4',title:'Human reviewer',body:['Decides on eligible','promotion proposals.'],color:C.orange}
    ],
    takeaway:['A connected agent calls memory; a human approves knowledge.'],
    caution:['Installation does not capture every conversation.','Human approval is a separate decision.'],
    mobileTakeaway:['Memory calls and human','approval have different jobs.'],
    alt:'Who does what? Four responsibility cards, read in numerical order. The agent or integration calls save and search and chooses context. Allura stores submitted context and searches within authorized scope. The operator configures hosting and access and maintains the service. An independent human reviewer decides on eligible promotion proposals. Installation does not automatically capture every conversation.'
  },
  {
    id:'03-saved-versus-approved',title:['Saved does not','mean approved.'],desktopTitle:'Saved does not mean approved.',
    intro:['The intended review boundary; implementation checks remain open.'],
    cards:[
      {n:'1',title:'Saved evidence',body:['A retained record.','Not human approval.'],color:C.blue},
      {n:'2',title:'Eligible proposal',body:['A candidate is queued','for a human decision.'],color:C.orange},
      {n:'3',title:'Approved knowledge',body:['Human approval and','canonical materialization.'],color:C.green}
    ],
    takeaway:['A confidence score cannot stand in for a human decision.'],
    caution:['If rejected: retain evidence; do not label it approved.','Not every save becomes a proposal.'],
    mobileTakeaway:['A score is not approval.','Inspect the review state.'],
    alt:'Saved does not mean approved. The intended flow reads from saved evidence to an eligible proposal to human approval and canonical materialization. Not every save becomes a proposal. Rejection retains evidence without labeling it approved knowledge. A confidence score does not replace a human decision. This explains intended policy, not proof that every current implementation path meets it.'
  }
];
function frame(p,mobile){
 const w=mobile?780:1440;
 const rows=p.cards.length;
 const h=mobile?(rows===4?1830:1640):900;
 const margin=mobile?48:64;
 let out=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(p.desktopTitle)}</title><desc id="desc">${esc(p.alt)}</desc><rect width="${w}" height="${h}" fill="${C.cream}"/><image href="data:image/png;base64,${mark}" x="${margin}" y="40" width="180" height="60" preserveAspectRatio="xMinYMid meet"/>`;
 out+=text(margin,mobile?160:150,mobile?p.title:p.desktopTitle,mobile?58:52,C.ink,700,1.14);
 const titleLines=mobile?p.title.length:1;
 const introY=mobile?160+(titleLines-1)*67+60:204;
 const intro=mobile?(p.id.startsWith('02')?['Saving, running the service,','and approving have different owners.']:p.id.startsWith('03')?['The intended review boundary.','Implementation checks remain open.']:p.intro):p.intro;
 out+=text(margin,introY,intro,mobile?32:26);
 const startY=mobile?introY+(intro.length-1)*43+48:278;
 if(mobile){
  p.cards.forEach((c,i)=>{
   const y=startY+i*244;
   out+=box(margin,y,w-2*margin,188,c.color)+text(margin+28,y+50,`${c.n} / ${c.title}`,36,C.ink,700)+text(margin+28,y+105,c.body,32);
   if(i<rows-1&&!p.id.startsWith('02'))out+=arrow(margin+36,y+190,i===0&&p.id.startsWith('01')?'later session':p.id.startsWith('03')?(i===0?'if eligible':'human decision'):'',true);
  });
  const bottom=startY+rows*244+5;
  out+=`<line x1="${margin}" y1="${bottom}" x2="${w-margin}" y2="${bottom}" stroke="${C.ink}" stroke-width="1"/>`;
  out+=text(margin,bottom+60,p.mobileTakeaway,36,C.ink,700);
  const cautions=p.id.startsWith('02')?['Installation does not capture','every conversation.','Human approval is a separate decision.']:p.id.startsWith('03')?['Rejected? Keep evidence;','do not label it approved.','Not every save becomes a proposal.']:['Integration must call save and search.','A result is not a guaranteed answer.'];
  out+=text(margin,bottom+170,cautions,32);
  out+=text(margin,h-130,['Sources: Blueprint + Data Dictionary.','Illustrative. Live proof and','human testing remain pending.'],32);
 }else{
  const gap=44,cw=(w-2*margin-gap*(rows-1))/rows,ch=250;
  p.cards.forEach((c,i)=>{
   const x=margin+i*(cw+gap);
   out+=box(x,startY,cw,ch,c.color)+text(x+24,startY+48,c.n,24,C.ink,700);
   out+=text(x+24,startY+100,c.title,rows===4?24:29,C.ink,700);
   const desktopBody=rows===4?[['Calls save/search.','Chooses submitted','context.'],['Stores context.','Searches authorized','scope.'],['Sets up hosting','and access.','Maintains service.'],['Decides on eligible','promotion proposals.']][i]:c.body;
   out+=text(x+24,startY+155,desktopBody,rows===4?23:26);
   if(i<rows-1&&!p.id.startsWith('02'))out+=arrow(x+cw,startY+ch/2,'');
  });
  out+=`<line x1="${margin}" y1="590" x2="${w-margin}" y2="590" stroke="${C.ink}" stroke-width="1"/>`;
  out+=text(margin,650,p.takeaway,32,C.ink,700)+text(margin,705,p.caution,25);
  out+=text(margin,838,'Sources: Blueprint + Data Dictionary.  Illustrative; live proof and human tests pending.',23);
 }
 return out+'</svg>';
}
await Promise.all(['svg','png'].map(d=>fs.mkdir(path.join(root,d),{recursive:true})));
const outputs=[];
for(const p of pages){
 for(const mobile of [false,true]){
  const stem=p.id+(mobile?'-mobile':'');
  const svg=frame(p,mobile);
  await fs.writeFile(path.join(root,'svg',stem+'.svg'),svg);
  const target=path.join(root,'png',stem+'.png');
  await sharp(Buffer.from(svg)).png().toFile(target);
  const info=await sharp(target).metadata();
  outputs.push({file:'png/'+stem+'.png',width:info.width,height:info.height,min_body_at_390:mobile?16:null});
  if(mobile)await sharp(target).resize({width:390}).png().toFile(path.join(root,'png',stem+'-390.png'));
 }
}
await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify({status:'educational draft; independent QA and live verification pending',official_wordmark_sha256:crypto.createHash('sha256').update(original).digest('hex'),font:'Noto Sans fallback (Aeonik unavailable); no generated lettering',outputs},null,2)+'\n');
const articles=pages.map(p=>`<article id="${p.id}"><h2>${esc(p.desktopTitle)}</h2><picture><source media="(max-width: 1199px)" srcset="png/${p.id}-mobile.png"><img src="png/${p.id}.png" alt="${esc(p.alt)}" width="1440" height="900"></picture><details><summary>Text explanation and sources</summary><p>${esc(p.alt)}</p><p>Source-inspected explanation: <a href="../../allura/BLUEPRINT.md">Blueprint</a>, <a href="../../allura/DATA-DICTIONARY.md">Data Dictionary</a>, <a href="../../allura/DESIGN-ALLURA.md">Design</a>. <a href="../../reference/reddit-remediation/strategy-receipt.md">Scope and authority receipt</a>. No live journey or human-study pass is claimed.</p></details><p class="downloads"><a href="svg/${p.id}.svg">Desktop SVG</a> · <a href="svg/${p.id}-mobile.svg">Phone SVG</a> · <a href="png/${p.id}.png">Desktop PNG</a> · <a href="png/${p.id}-mobile.png">Phone PNG</a></p></article>`).join('\n');
await fs.writeFile(path.join(root,'preview.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Allura Memory — three first-use explanations</title><style>body{margin:0;background:#F7F3EE;color:#0F1720;font:18px/1.55 "Noto Sans",Arial,sans-serif}main{max-width:1440px;margin:auto;padding:24px}h1{font-size:clamp(28px,4vw,48px);line-height:1.12}h2{font-size:28px}article{margin:64px 0}img{display:block;max-width:100%;height:auto}a{color:#0D47A1}details{padding:20px 0}summary{cursor:pointer;font-weight:bold}.downloads{font-size:16px}@media(max-width:600px){main{padding:0}header,article>h2,details,.downloads{margin-left:16px;margin-right:16px}article{margin:32px 0}img{width:100%}}</style><main><header><h1>Three questions about project memory</h1><p>Educational drafts for the existing memory journey. These diagrams are illustrative: the live first-use demonstration, independent QA and human usability study remain open.</p><nav><a href="#01-remember-a-decision">Remember a decision</a> · <a href="#02-who-does-what">Who acts?</a> · <a href="#03-saved-versus-approved">Saved or approved?</a></nav></header>${articles}</main></html>`);
console.log(JSON.stringify({rendered:outputs.length,phone_inspection_renders:3,outputs},null,2));
