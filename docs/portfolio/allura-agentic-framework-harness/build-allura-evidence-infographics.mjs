import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('docs/portfolio/allura-agentic-framework-harness/evidence-infographics');
const svgDir = path.join(root, 'svg');
const pngDir = path.join(root, 'png');
const assets = path.join(root, 'assets');
const wordmarkSource = '/home/ronin704/.codex/skills/allura-brand/assets/allura-wordmark.png';
const W = 1600;
const H = 989; // 1.618:1 master artboard.
const C = { blue:'#0D47A1', orange:'#FF4D1F', green:'#148A4B', ink:'#0F1720', cream:'#F7F3EE', rule:'#D6D1CA', muted:'#59616A', paleBlue:'#E7EEF9', paleOrange:'#FCE9E2', paleGreen:'#E5F1E9' };

await Promise.all([svgDir, pngDir, assets].map((dir) => fs.mkdir(dir, { recursive: true })));
const wordmark = path.join(assets, 'allura-wordmark.png');
const wordmarkCrop = path.join(assets, 'allura-wordmark-cropped.png');
await fs.copyFile(wordmarkSource, wordmark);
await sharp(wordmarkSource).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(wordmarkCrop);
const mark64 = (await fs.readFile(wordmarkCrop)).toString('base64');
const headerMark = await sharp(wordmarkCrop).resize({ width: 154, height: 58, fit: 'inside' }).png().toBuffer();

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const t = (x,y,v,size=24,fill=C.ink,weight=400,anchor='start') => `<text x="${x}" y="${y}" font-family="Aeonik, Noto Sans, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(v)}</text>`;
const mono = (x,y,v,fill=C.blue,size=15) => `<text x="${x}" y="${y}" font-family="IBM Plex Mono, ui-monospace, monospace" font-size="${size}" font-weight="700" fill="${fill}">${esc(v)}</text>`;
const rect = (x,y,w,h,fill='none',stroke=C.ink,r=20) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
const line = (x1,y1,x2,y2,stroke=C.ink,width=3,dash='') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
const arrow = (x1,y1,x2,y2,stroke=C.ink) => `${line(x1,y1,x2,y2,stroke,3)}<path d="M${x2-14} ${y2-9} L${x2} ${y2} L${x2-14} ${y2+9}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
const node = (cx,cy,r,fill,overline,heading,detail,textFill=C.ink) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>${mono(cx,cy-28,overline,textFill,13).replace(`x="${cx}"`, `x="${cx}" text-anchor="middle"`)}${t(cx,cy+6,heading,22,textFill,700,'middle')}${t(cx,cy+33,detail,15,textFill,400,'middle')}`;
const smallPanel = (x,y,w,h,accent,kicker,heading,detail) => `${rect(x,y,w,h,C.cream,C.rule,18)}<rect x="${x}" y="${y}" width="${w}" height="10" rx="5" fill="${accent}"/>${mono(x+26,y+48,kicker,accent,13)}${t(x+26,y+89,heading,22,C.ink,700)}${t(x+26,y+118,detail,15,C.muted,400)}`;
const header = (title,sub) => `<image href="data:image/png;base64,${mark64}" x="70" y="45" width="154" height="58" preserveAspectRatio="xMinYMid meet"/>${t(70,182,title,50,C.ink,700)}${t(70,222,sub,20,C.muted,400)}${line(70,258,1530,258,C.rule,2)}`;
const footer = (source) => `${line(70,888,1530,888,C.rule,2)}${mono(70,930,'SOURCE',C.blue,14)}${t(150,930,source,14,C.muted,400)}${t(1530,930,'Memory is the foundation. Intelligence is the outcome.',16,C.ink,700,'end')}`;
const legend = () => `<g transform="translate(770 825)"><circle cx="0" cy="0" r="8" fill="${C.blue}"/>${t(18,6,'Memory / intelligence',15,C.ink,600)}<circle cx="224" cy="0" r="8" fill="${C.orange}"/>${t(242,6,'Review / decision',15,C.ink,600)}<circle cx="420" cy="0" r="8" fill="${C.green}"/>${t(438,6,'Approved / connection',15,C.ink,600)}</g>`;
const frame = (title,desc,body,source) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc><rect width="${W}" height="${H}" fill="${C.cream}"/>${body}${legend()}${footer(source)}</svg>`;

const pages = [
  {
    file:'01-every-action-leaves-proof',
    title:'Every action leaves proof',
    desc:'A connected Allura graph shows an action, an explicit review, and a durable evidence record.',
    source:'README.md — append-only evidence, governed actions, record history',
    body:`${header('Every action leaves proof','A clear record follows important work.')}
      <path d="M330 650 C520 385 690 355 800 455 S1080 680 1265 650" fill="none" stroke="${C.blue}" stroke-width="3" stroke-dasharray="10 10"/>
      ${node(330,650,112,C.paleBlue,'ACTION','Make a request','State what should happen.',C.ink)}
      ${node(800,455,126,C.paleOrange,'REVIEW','Check the request','Decide if it is allowed.',C.ink)}
      ${node(1265,650,112,C.paleGreen,'RECORD','Keep the proof','Save source and result.',C.ink)}
      ${arrow(446,605,650,500,C.ink)}${arrow(930,500,1145,605,C.ink)}
      ${rect(510,690,580,74,C.ink,C.ink,18)}${t(800,736,'Source + decision + result stay linked.',23,C.cream,700,'middle')}`
  },
  {
    file:'02-access-has-boundaries',
    title:'Access has boundaries',
    desc:'Two Allura modular forms show separated workspaces governed by a labeled policy boundary.',
    source:'README.md — tenant isolation and governed access through MCP/API',
    body:`${header('Access has boundaries','Private work stays in the right workspace.')}
      <path d="M220 700 V455 Q220 355 320 355 H545 V700" fill="${C.paleBlue}" stroke="${C.blue}" stroke-width="3"/>
      <path d="M1055 700 V455 Q1055 355 1155 355 H1380 V700" fill="${C.paleGreen}" stroke="${C.green}" stroke-width="3"/>
      ${t(382,500,'Team A',30,C.ink,700,'middle')}${t(382,535,'Owns its records.',18,C.muted,400,'middle')}
      ${t(1217,500,'Team B',30,C.ink,700,'middle')}${t(1217,535,'Owns its records.',18,C.muted,400,'middle')}
      <circle cx="800" cy="555" r="125" fill="${C.ink}"/><path d="M765 548 V522 Q765 490 800 490 Q835 490 835 522 V548" fill="none" stroke="${C.cream}" stroke-width="9" stroke-linecap="round"/><rect x="750" y="544" width="100" height="82" rx="14" fill="${C.cream}"/><circle cx="800" cy="583" r="9" fill="${C.ink}"/>
      ${t(800,690,'Policy boundary',22,C.ink,700,'middle')}${t(800,720,'A check protects each workspace.',17,C.muted,400,'middle')}
      ${line(545,555,665,555,C.blue,4,'10 10')}${line(935,555,1055,555,C.green,4,'10 10')}`
  },
  {
    file:'03-people-review-important-changes',
    title:'People review important changes',
    desc:'A central human review module connects proposed changes, policy, a decision, and a recorded reason.',
    source:'README.md — governed promotion, curator review, durable decision context',
    body:`${header('People review important changes','Software helps. People make accountable decisions.')}
      ${node(800,555,145,C.paleOrange,'REVIEW','A person decides','Approve or reject.',C.ink)}
      ${smallPanel(225,415,270,150,C.blue,'PROPOSE','Ask for change','State the reason.')}
      ${smallPanel(1105,415,270,150,C.green,'RECORD','Keep the decision','Save who decided.')}
      ${rect(650,725,300,70,C.paleBlue,C.blue,18)}${mono(690,755,'POLICY CHECK',C.blue,13)}${t(690,782,'Rules guide the review.',18,C.ink,700)}
      ${arrow(495,490,650,525,C.orange)}${arrow(950,525,1105,490,C.green)}${line(800,700,800,725,C.blue,3)}
      <path d="M570 650 C640 710 715 730 800 730 C885 730 960 710 1030 650" fill="none" stroke="${C.orange}" stroke-width="3" stroke-dasharray="9 9"/>`
  },
  {
    file:'04-memory-keeps-its-history',
    title:'Memory keeps its history',
    desc:'A blue evidence path moves through review to approved knowledge while a curved line retains past versions.',
    source:'README.md — append-only evidence, versioned knowledge, supersession lineage',
    body:`${header('Memory keeps its history','New context can improve without erasing the past.')}
      <path d="M300 555 C500 330 710 330 900 555 S1240 780 1420 555" fill="none" stroke="${C.blue}" stroke-width="4"/>
      <path d="M390 710 C650 835 1050 835 1320 710" fill="none" stroke="${C.ink}" stroke-width="3" stroke-dasharray="10 10"/>
      ${node(315,555,98,C.paleBlue,'EVIDENCE','Save context','Keep the original.',C.ink)}
      ${node(800,440,108,C.paleOrange,'REVIEW','Review it','Check before reuse.',C.ink)}
      ${node(1285,555,98,C.paleGreen,'KNOWLEDGE','Use approved memory','Keep its source.',C.ink)}
      ${arrow(415,495,670,455,C.ink)}${arrow(930,455,1185,495,C.ink)}
      ${rect(570,690,460,80,C.ink,C.ink,18)}${t(800,739,'Older records stay connected.',22,C.cream,700,'middle')}`
  },
  {
    file:'05-test-before-release',
    title:'Test before release',
    desc:'An Allura evidence loop connects a scenario, a repeated run, an evaluation, and an evidence record.',
    source:'README.md — evaluation, tests, health checks, evidence manifest expectations',
    body:`${header('Test before release','Repeat the work. Check the result. Keep the evidence.')}
      <path d="M455 455 C610 315 990 315 1145 455 C1300 595 1145 745 800 745 C455 745 300 595 455 455" fill="${C.paleBlue}" stroke="${C.blue}" stroke-width="3"/>
      ${node(495,510,92,C.blue,'SCENARIO','Set up','Use the same case.',C.cream)}
      ${node(800,410,92,C.orange,'RUN','Run it','Check the result.',C.cream)}
      ${node(1105,510,92,C.green,'EVALUATE','Review results','Spot a problem.',C.cream)}
      ${node(800,680,92,C.ink,'EVIDENCE','Save proof','Keep the result.',C.cream)}
      ${arrow(590,470,700,425,C.ink)}${arrow(900,425,1010,470,C.ink)}${arrow(1100,605,860,660,C.ink)}${arrow(740,660,525,605,C.ink)}
      ${t(800,798,'Repeat when the system changes.',22,C.ink,700,'middle')}`
  },
  {
    file:'06-an-answer-can-show-its-work',
    title:'An answer can show its work',
    desc:'A central Allura answer module connects factual source, review decision, and approved context.',
    source:'README.md — provenance, scoped retrieval, source preservation',
    body:`${header('An answer can show its work','A good answer can point back to its support.')}
      <rect x="625" y="415" width="350" height="265" rx="64" fill="${C.ink}"/>
      ${t(800,500,'ANSWER',14,C.cream,700,'middle')}${t(800,548,'Show the proof',32,C.cream,700,'middle')}${t(800,584,'Link source and decision.',17,C.cream,400,'middle')}
      ${node(330,470,98,C.paleBlue,'SOURCE','Use facts','Keep context.',C.ink)}
      ${node(1270,470,98,C.paleOrange,'DECISION','Show review','Keep who decided.',C.ink)}
      ${node(800,760,98,C.paleGreen,'MEMORY','Use approved context','Keep the lineage.',C.ink)}
      ${arrow(430,470,620,510,C.blue)}${arrow(1170,470,980,510,C.orange)}${arrow(800,662,800,700,C.green)}
      <path d="M430 600 C560 760 1040 760 1170 600" fill="none" stroke="${C.green}" stroke-width="3" stroke-dasharray="9 9"/>`
  }
];

for (const page of pages) {
  const svg = frame(page.title, page.desc, page.body, page.source);
  await fs.writeFile(path.join(svgDir, `${page.file}.svg`), svg);
  const raster = await sharp(Buffer.from(svg)).png().toBuffer();
  await sharp(raster).composite([{ input: headerMark, left:70, top:45 }]).png().toFile(path.join(pngDir, `${page.file}.png`));
}

console.log(`Rebuilt ${pages.length} Allura evidence infographics in ${root}`);
