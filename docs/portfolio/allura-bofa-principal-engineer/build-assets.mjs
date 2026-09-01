import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('docs/portfolio/allura-bofa-principal-engineer');
const assets = path.join(root, 'assets');
const svgDir = path.join(root, 'infographics/svg');
const pngDir = path.join(root, 'infographics/png');
const brandMark = '/home/ronin704/.codex/skills/allura-brand/assets/allura-wordmark.png';
const C = { cream:'#F7F3EE', ink:'#0F1720', blue:'#0D47A1', orange:'#FF4D1F', green:'#148A4B', rule:'#D6D1CA', muted:'#59616A', paleBlue:'#E7EEF9', paleOrange:'#FCE9E2', paleGreen:'#E5F1E9' };
await Promise.all([assets, svgDir, pngDir].map(d => fs.mkdir(d, { recursive: true })));
const wordmarkPath = path.join(assets, 'allura-wordmark.png');
const croppedPath = path.join(assets, 'allura-wordmark-cropped.png');
await fs.copyFile(brandMark, wordmarkPath);
await sharp(brandMark).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(croppedPath);
const mark = (await fs.readFile(croppedPath)).toString('base64');

const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const text = (x,y,content,size=24,fill=C.ink,weight=400,anchor='start',family='Noto Sans') => `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(content)}</text>`;
const line = (x1,y1,x2,y2,color=C.ink,width=3,dash='') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
const box = (x,y,w,h,fill=C.cream,stroke=C.ink,r=0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
const dot = (x,y,color) => `<circle cx="${x}" cy="${y}" r="8" fill="${color}"/>`;
const arrow = (x1,y1,x2,y2,color=C.ink) => `${line(x1,y1,x2,y2,color,4)}<path d="M ${x2-14} ${y2-9} L ${x2} ${y2} L ${x2-14} ${y2+9}" fill="none" stroke="${color}" stroke-width="4"/>`;
const card = (x,y,w,h,kicker,heading,body,color) => `${box(x,y,w,h,C.cream,C.ink,18)}<rect x="${x}" y="${y}" width="${w}" height="11" rx="5" fill="${color}"/><text x="${x+26}" y="${y+52}" font-family="IBM Plex Mono" font-size="15" font-weight="700" fill="${color}">${esc(kicker.toUpperCase())}</text>${text(x+26,y+91,heading,27,C.ink,700)}${text(x+26,y+127,body,17,C.muted,400)}`;
const header = (number,title,subtitle) => `<image href="data:image/png;base64,${mark}" x="70" y="48" width="145" height="58" preserveAspectRatio="xMinYMid meet"/><text x="245" y="78" font-family="IBM Plex Mono" font-size="16" font-weight="700" fill="${C.blue}">ALLURA MEMORY / PORTFOLIO EVIDENCE</text>${text(70,165,number,18,C.blue,700,'start','IBM Plex Mono')}${text(70,225,title,47,C.ink,700)}${text(70,264,subtitle,20,C.muted,400)}${line(70,292,1530,292,C.rule,2)}`;
const footer = (source) => `${line(70,800,1530,800,C.rule,2)}${text(70,838,'SOURCE',14,C.blue,700,'start','IBM Plex Mono')}${text(150,838,source,14,C.muted,400,'start','IBM Plex Mono')}${text(1530,838,'Memory is the foundation. Intelligence is the outcome.',16,C.ink,700,'end')}`;
const legend = () => `<g transform="translate(760 720)">${dot(0,0,C.blue)}${text(18,6,'Memory / intelligence',15,C.ink,600)}${dot(210,0,C.orange)}${text(228,6,'Review / control',15,C.ink,600)}${dot(390,0,C.green)}${text(408,6,'Approved / durable',15,C.ink,600)}</g>`;
const wrap = (title,desc,body,source) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc><defs><marker id="arrowInk" markerWidth="12" markerHeight="12" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${C.ink}"/></marker></defs><rect width="1600" height="900" fill="${C.cream}"/>${body}${legend()}${footer(source)}</svg>`;

const graphics = [
  {
    file:'01-framework-harness-architecture', title:'Framework and harness architecture', desc:'A flat Allura system diagram connecting interfaces, orchestration, governed memory, policy and deterministic evidence.',
    source:'FRAMEWORK.md §§ Architecture, Orchestration, Policy, Harness, Interfaces',
    body: `${header('01','Framework and harness architecture','A reusable execution path: one governed system, multiple developer entry points.')}
      ${card(95,380,255,160,'INTERFACES','SDK · API · CLI','Typed clients and replay commands.',C.blue)}
      ${card(430,380,285,160,'ORCHESTRATION','ProcessEngine','DAG execution, checkpoint and replay.',C.blue)}
      ${card(795,350,315,220,'GOVERNED MEMORY','Ledger → curator → graph','Episodic trace becomes reviewed, retrievable context.',C.green)}
      ${card(1190,380,300,160,'EVIDENCE','Receipt + evaluation','Inspectable output for a controlled release.',C.orange)}
      ${arrow(350,460,430,460,C.blue)}${arrow(715,460,795,460,C.ink)}${arrow(1110,460,1190,460,C.orange)}
      ${box(430,610,680,72,C.ink,C.ink,14)}${text(770,655,'Policy hooks enforce proof-of-intent before a mutation.',22,C.cream,700,'middle')}`
  },
  {
    file:'02-deterministic-harness', title:'Deterministic harness', desc:'A five-step Allura deterministic evaluation sequence from scenario to replayable evidence.',
    source:'FRAMEWORK.md § Simulator harness and evaluation | CI evidence run 33502490831',
    body: `${header('02','Deterministic harness','A scenario is only useful when the result can be replayed, inspected and evaluated.')}
      ${box(105,395,230,132,C.paleBlue,C.blue,18)}${text(130,438,'01',18,C.blue,700,'start','IBM Plex Mono')}${text(130,480,'Fixture scenario',26,C.ink,700)}${text(130,512,'Declared inputs',17,C.muted)}
      ${box(390,395,230,132,C.cream,C.ink,18)}${text(415,438,'02',18,C.blue,700,'start','IBM Plex Mono')}${text(415,480,'Run engine',26,C.ink,700)}${text(415,512,'Controlled tool calls',17,C.muted)}
      ${box(675,395,230,132,C.paleOrange,C.orange,18)}${text(700,438,'03',18,C.orange,700,'start','IBM Plex Mono')}${text(700,480,'Issue receipt',26,C.ink,700)}${text(700,512,'Trace + proof',17,C.muted)}
      ${box(960,395,230,132,C.paleGreen,C.green,18)}${text(985,438,'04',18,C.green,700,'start','IBM Plex Mono')}${text(985,480,'Replay',26,C.ink,700)}${text(985,512,'Same input, same path',17,C.muted)}
      ${box(1245,395,230,132,C.cream,C.ink,18)}${text(1270,438,'05',18,C.blue,700,'start','IBM Plex Mono')}${text(1270,480,'Evaluate',26,C.ink,700)}${text(1270,512,'Regression signal',17,C.muted)}
      ${arrow(335,461,390,461,C.blue)}${arrow(620,461,675,461,C.orange)}${arrow(905,461,960,461,C.green)}${arrow(1190,461,1245,461,C.ink)}
      ${text(800,640,'The demonstration uses verified CI evidence—not a fabricated outcome dashboard.',22,C.ink,700,'middle')}`
  },
  {
    file:'03-enterprise-governance', title:'Enterprise governance', desc:'An Allura governance diagram showing proof, policy, workspace isolation, audit and release evidence.',
    source:'FRAMEWORK.md §§ Policy hooks and tool calling, Governance and scale',
    body: `${header('03','Enterprise governance','Controls are part of the execution path, not a promise outside it.')}
      ${box(95,365,310,280,C.ink,C.ink,22)}${text(125,420,'REQUEST',16,C.orange,700,'start','IBM Plex Mono')}${text(125,470,'Intent + proof',36,C.cream,700)}${text(125,510,'Every mutation declares',18,C.cream)}${text(125,540,'why it should happen.',18,C.cream)}
      ${box(495,365,300,280,C.paleOrange,C.orange,22)}${text(525,420,'ENFORCEMENT',16,C.orange,700,'start','IBM Plex Mono')}${text(525,470,'Policy syscall',36,C.ink,700)}${text(525,510,'Proof-of-intent before',18,C.muted)}${text(525,540,'a governed action.',18,C.muted)}
      ${box(885,365,260,280,C.paleGreen,C.green,22)}${text(915,420,'SCOPE',16,C.green,700,'start','IBM Plex Mono')}${text(915,470,'RLS boundary',36,C.ink,700)}${text(915,510,'Workspace isolation and',18,C.muted)}${text(915,540,'least privilege.',18,C.muted)}
      ${box(1235,365,260,280,C.paleBlue,C.blue,22)}${text(1265,420,'RECEIPT',16,C.blue,700,'start','IBM Plex Mono')}${text(1265,470,'Durable audit',36,C.ink,700)}${text(1265,510,'Inspectable evidence for',18,C.muted)}${text(1265,540,'review and release.',18,C.muted)}
      ${arrow(405,505,495,505,C.orange)}${arrow(795,505,885,505,C.green)}${arrow(1145,505,1235,505,C.blue)}`
  },
  {
    file:'04-developer-interfaces', title:'Developer interfaces', desc:'A three-interface Allura diagram showing SDK, API and CLI reaching shared governed capabilities.',
    source:'FRAMEWORK.md § Developer interfaces',
    body: `${header('04','Developer interfaces','A shared governed core lets each engineering workflow use the same controls.')}
      ${card(130,380,300,170,'SDK','Typed client','Memory, harness, replay and evaluation.',C.blue)}
      ${card(650,380,300,170,'API / MCP','Authenticated gateway','Governed tool calling and streams.',C.orange)}
      ${card(1170,380,300,170,'CLI','Run and replay','Scenario command line workflow.',C.green)}
      ${line(280,550,280,655,C.blue,4)}${line(800,550,800,655,C.orange,4)}${line(1320,550,1320,655,C.green,4)}
      ${box(290,655,1020,78,C.ink,C.ink,18)}${text(800,704,'One core: orchestration, policy, memory, receipts and evaluation.',25,C.cream,700,'middle')}`
  },
  {
    file:'05-governed-memory-lifecycle', title:'Governed memory lifecycle', desc:'A lifecycle diagram of episodic capture, review, promotion, retrieval and supersession in Allura.',
    source:'FRAMEWORK.md § Memory patterns',
    body: `${header('05','Governed memory lifecycle','Memory gains value when it is scoped, reviewed and able to change without losing history.')}
      ${box(110,400,250,145,C.paleBlue,C.blue,18)}${text(135,442,'CAPTURE',15,C.blue,700,'start','IBM Plex Mono')}${text(135,485,'Episodic ledger',28,C.ink,700)}${text(135,518,'Traceable event',17,C.muted)}
      ${box(430,400,250,145,C.paleOrange,C.orange,18)}${text(455,442,'CURATE',15,C.orange,700,'start','IBM Plex Mono')}${text(455,485,'Review + promote',28,C.ink,700)}${text(455,518,'Approval boundary',17,C.muted)}
      ${box(750,400,250,145,C.paleGreen,C.green,18)}${text(775,442,'RETRIEVE',15,C.green,700,'start','IBM Plex Mono')}${text(775,485,'Semantic layer',28,C.ink,700)}${text(775,518,'Approved-only search',17,C.muted)}
      ${box(1070,400,250,145,C.cream,C.ink,18)}${text(1095,442,'EVOLVE',15,C.blue,700,'start','IBM Plex Mono')}${text(1095,485,'Supersede safely',28,C.ink,700)}${text(1095,518,'History remains visible',17,C.muted)}
      ${arrow(360,472,430,472,C.orange)}${arrow(680,472,750,472,C.green)}${arrow(1000,472,1070,472,C.ink)}${line(1195,545,1195,625,C.ink,3)}${line(1195,625,235,625,C.ink,3)}${line(235,625,235,545,C.ink,3)}<text x="715" y="668" font-family="IBM Plex Mono" font-size="16" font-weight="700" fill="${C.blue}" text-anchor="middle">TENANT-SCOPED • BRANCH-AWARE • RETRIEVAL WITH APPROVAL STATE</text>`
  },
  {
    file:'06-evidence-to-release-chain', title:'Evidence to release chain', desc:'A CI evidence chain from checks through a schema-validated manifest to an inspectable portfolio statement.',
    source:'GitHub Actions run 33502490831 | artifacts/dashboard-demo/manifest.json',
    body: `${header('06','Evidence to release chain','Claims remain useful when someone else can follow them back to the proof.')}
      ${box(85,365,290,245,C.cream,C.ink,18)}${text(115,415,'CHECKS',15,C.blue,700,'start','IBM Plex Mono')}${text(115,460,'Static · unit · build',29,C.ink,700)}${text(115,500,'Live PostgreSQL',21,C.ink,700)}${text(115,534,'Benchmark · evaluation',21,C.ink,700)}
      ${box(465,365,290,245,C.paleBlue,C.blue,18)}${text(495,415,'MANIFEST',15,C.blue,700,'start','IBM Plex Mono')}${text(495,460,'Schema-validated',29,C.ink,700)}${text(495,500,'six lanes passed',22,C.muted)}${text(495,534,'commit-tied record',22,C.muted)}
      ${box(845,365,290,245,C.paleGreen,C.green,18)}${text(875,415,'DATABASE',15,C.green,700,'start','IBM Plex Mono')}${text(875,460,'48 / 48 suites',29,C.ink,700)}${text(875,500,'136 passed',22,C.muted)}${text(875,534,'3 intentionally pending',22,C.muted)}
      ${box(1225,365,290,245,C.paleOrange,C.orange,18)}${text(1255,415,'DEMO',15,C.orange,700,'start','IBM Plex Mono')}${text(1255,460,'7 / 7 routes',29,C.ink,700)}${text(1255,500,'HTTP 200',22,C.muted)}${text(1255,534,'zero captured errors',22,C.muted)}
      ${arrow(375,487,465,487,C.blue)}${arrow(755,487,845,487,C.green)}${arrow(1135,487,1225,487,C.orange)}`
  }
];

for (const g of graphics) {
  const svg = wrap(g.title, g.desc, g.body, g.source);
  const svgPath = path.join(svgDir, `${g.file}.svg`);
  const pngPath = path.join(pngDir, `${g.file}.png`);
  await fs.writeFile(svgPath, svg);
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
}
console.log(`Generated ${graphics.length} branded SVG/PNG infographic pairs in ${root}`);
