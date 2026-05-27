/* data.jsx — mock data for the Allura Memory prototype */

const ALLURA_MEMORIES = [
  { id: 'm1', status: 'active', tier: 'L4 · Episodic', content: 'Prefers written summaries over verbal walkthroughs when reviewing technical decisions or complex topics.', confidence: 87, savedAt: '2 days ago', provenance: 'from conversation', tags: ['communication', 'decisions', 'writing'], traces: 3, source: 'allura-core', subject: 'self' },
  { id: 'm2', status: 'active', tier: 'L3 · Semantic', content: 'Team standup is most productive when kept to 15 minutes with a written agenda shared the night before.', confidence: 76, savedAt: '4 days ago', provenance: 'from conversation', tags: ['meetings', 'team', 'rituals'], traces: 2, source: 'allura-core', subject: 'team' },
  { id: 'm3', status: 'proposed', tier: 'L2 · Working', content: 'Prefers dark mode interfaces across all tools. Has explicitly disabled system animations on macOS.', confidence: 61, savedAt: '1 week ago', provenance: 'added manually', tags: ['preferences', 'accessibility'], traces: 1, source: 'curator', subject: 'self' },
  { id: 'm4', status: 'low_conf', tier: 'L4 · Episodic', content: 'May prefer async communication for non-urgent matters based on response timing patterns over the last 30 days.', confidence: 43, savedAt: '10 days ago', provenance: 'from conversation', tags: ['async', 'communication'], traces: 1, source: 'allura-core', subject: 'self' },
  { id: 'm5', status: 'active', tier: 'L1 · Identity', content: 'Goes by "Alex" in informal settings. Legal name is Alexandra Chen. Pronouns: she/her.', confidence: 95, savedAt: '2 weeks ago', provenance: 'added manually', tags: ['identity'], traces: 4, source: 'curator', subject: 'self' },
  { id: 'm6', status: 'active', tier: 'L3 · Semantic', content: 'The Q3 roadmap centers on three pillars: provenance, governance, and graph-based recall.', confidence: 81, savedAt: '3 weeks ago', provenance: 'from conversation', tags: ['roadmap', 'planning'], traces: 5, source: 'allura-core', subject: 'project' },
  { id: 'm7', status: 'proposed', tier: 'L4 · Episodic', content: 'Sam Reyes (engineering lead) prefers async standups via Loom, not live meetings, when shipping a release.', confidence: 68, savedAt: '5 days ago', provenance: 'from conversation', tags: ['team', 'sam-reyes'], traces: 2, source: 'allura-core', subject: 'sam-reyes' },
  { id: 'm8', status: 'active', tier: 'L2 · Working', content: 'Coffee preference: black, no sugar. Avoids dairy after 2pm. Detail surfaced for hosting context.', confidence: 89, savedAt: '1 month ago', provenance: 'from conversation', tags: ['preferences', 'food'], traces: 6, source: 'allura-core', subject: 'self' },
];

const ALLURA_FORGOTTEN = [
  { id: 'd1', status: 'forgotten', content: 'Uses Notion for personal note-taking — superseded by Obsidian per latest update.', savedAt: 'Forgotten 3 days ago', provenance: 'from conversation', reason: 'User confirmed switch on Apr 28' },
  { id: 'd2', status: 'forgotten', content: 'Preferred morning calls before 9am — schedule changed in Q2.', savedAt: 'Forgotten 1 week ago', provenance: 'added manually', reason: 'Manual revision' },
  { id: 'd3', status: 'forgotten', content: 'Currently reading "The Phoenix Project" — completed Mar 12.', savedAt: 'Forgotten 2 weeks ago', provenance: 'from conversation', reason: 'Time decay' },
];

const ALLURA_PROPOSALS = [
  { id: 'p1', content: 'User prefers concise written summaries over verbal walkthroughs when reviewing technical decisions.', confidence: 87, traces: 3, tier: 'established', reasoning: 'Seen across 3 separate sessions where user explicitly requested written format over verbal explanation.', proposed: '2 days ago', from: 'allura-core' },
  { id: 'p2', content: 'Team meetings on Thursdays are preferred over Mondays due to focus time scheduling.', confidence: 74, traces: 2, tier: 'adoption', reasoning: 'Mentioned twice in scheduling context; correlates with calendar block patterns observed in 2 traces.', proposed: '5 hours ago', from: 'allura-core' },
  { id: 'p3', content: 'Prefers dark mode interfaces and has explicitly disabled system animations.', confidence: 61, traces: 1, tier: 'emerging', reasoning: 'Single trace from settings interaction; moderate confidence until corroborated.', proposed: '1 day ago', from: 'curator' },
  { id: 'p4', content: 'Sam Reyes runs engineering retros on the last Friday of every month.', confidence: 79, traces: 4, tier: 'established', reasoning: 'Pattern observed across the last 4 months of calendar context.', proposed: '6 hours ago', from: 'allura-core' },
  { id: 'p5', content: 'Q3 budget for memory-graph compute is capped at $42k/month.', confidence: 92, traces: 2, tier: 'established', reasoning: 'Explicit number stated in the Q3 finance review and reconfirmed in roadmap doc.', proposed: '3 hours ago', from: 'allura-core' },
];

const ALLURA_AGENTS = [
  { id: 'a1', name: 'allura-core',     role: 'Capture',     status: 'active',     calls: 12348, success: 96.6, latency: '142ms', avatar: 'AC' },
  { id: 'a2', name: 'allura-curator',  role: 'Curation',    status: 'active',     calls: 1822,  success: 98.1, latency: '89ms',  avatar: 'AU' },
  { id: 'a3', name: 'allura-graph',    role: 'Connection',  status: 'active',     calls: 904,   success: 99.4, latency: '63ms',  avatar: 'AG' },
  { id: 'a4', name: 'allura-recall',   role: 'Activation',  status: 'paused',     calls: 5621,  success: 94.0, latency: '210ms', avatar: 'AR' },
];

const ALLURA_AGENT_ACTIVITY = [
  { id: 'l1', agent: 'allura-core',    action: 'Proposed 3 memories from session sess_9k2x',     time: '2m ago' },
  { id: 'l2', agent: 'allura-curator', action: 'Approved memory mem_4f1c (87% confidence)',       time: '14m ago' },
  { id: 'l3', agent: 'allura-graph',   action: 'Linked mem_4f1c → mem_2d0a (relation: refines)',  time: '14m ago' },
  { id: 'l4', agent: 'allura-recall',  action: 'Surfaced 2 memories during conversation context', time: '1h ago' },
  { id: 'l5', agent: 'allura-core',    action: 'Detected duplicate — merged mem_8a31 ⊃ mem_8a32', time: '3h ago' },
  { id: 'l6', agent: 'allura-curator', action: 'Rejected proposal p_xy7 — insufficient evidence', time: '5h ago' },
];

const ALLURA_TRACES = [
  { id: 't1', tool: 'memory.retrieve',    agent: 'allura-core',    confidence: 0.91, ts: 'May 21, 2026 · 14:23',   payload: '{ "query": "communication preferences", "limit": 5 }' },
  { id: 't2', tool: 'conversation.parse', agent: 'allura-core',    confidence: 0.87, ts: 'May 21, 2026 · 14:22',   payload: '{ "session_id": "sess_9k2x", "extract": true }' },
  { id: 't3', tool: 'memory.store',       agent: 'allura-curator', confidence: 0.87, ts: 'May 21, 2026 · 14:21',   payload: '{ "content": "Prefers written...", "confidence": 0.87 }' },
  { id: 't4', tool: 'graph.link',         agent: 'allura-graph',   confidence: 0.92, ts: 'May 21, 2026 · 14:20',   payload: '{ "from": "mem_4f1c", "to": "mem_2d0a", "rel": "refines" }' },
  { id: 't5', tool: 'memory.recall',      agent: 'allura-recall',  confidence: 0.78, ts: 'May 20, 2026 · 09:14',   payload: '{ "context": "morning brief", "k": 3 }' },
  { id: 't6', tool: 'memory.forget',      agent: 'allura-curator', confidence: 1.00, ts: 'May 19, 2026 · 18:02',   payload: '{ "id": "mem_3z9q", "reason": "user_request" }' },
  { id: 't7', tool: 'conversation.parse', agent: 'allura-core',    confidence: 0.62, ts: 'May 19, 2026 · 11:45',   payload: '{ "session_id": "sess_8c1n", "extract": true }' },
  { id: 't8', tool: 'memory.score',       agent: 'allura-curator', confidence: 0.85, ts: 'May 19, 2026 · 11:44',   payload: '{ "id": "mem_4f1c", "decay": 0.04 }' },
];

const ALLURA_EXTRACTIONS = [
  { id: 'e1', subject: 'Alex Chen',    type: 'preference', value: 'Prefers written summaries over verbal walkthroughs',   confidence: 87, source: 'sess_9k2x', date: 'May 21, 2026' },
  { id: 'e2', subject: 'Alex Chen',    type: 'identity',   value: 'Goes by "Alex" in informal settings',                  confidence: 95, source: 'manual',    date: 'May 21, 2026' },
  { id: 'e3', subject: 'Sam Reyes',    type: 'pattern',    value: 'Runs engineering retros on the last Friday',           confidence: 79, source: 'sess_8c1n', date: 'May 20, 2026' },
  { id: 'e4', subject: 'Q3 Roadmap',   type: 'fact',       value: 'Memory-graph budget capped at $42k/month',             confidence: 92, source: 'doc_q3fin',  date: 'May 19, 2026' },
  { id: 'e5', subject: 'Team',         type: 'ritual',     value: 'Standup is 15 minutes with written agenda',            confidence: 76, source: 'sess_7m4l', date: 'May 18, 2026' },
  { id: 'e6', subject: 'Alex Chen',    type: 'preference', value: 'Black coffee, no dairy after 2pm',                     confidence: 89, source: 'sess_5h1k', date: 'May 17, 2026' },
];

// Graph nodes (memory IDs) and edges. Positions are normalized [-1, 1].
const ALLURA_GRAPH_NODES = [
  { id: 'self',       label: 'Alex Chen',         tier: 1, x:  0.00, y:  0.00, kind: 'identity' },
  { id: 'work',       label: 'Work',              tier: 2, x:  0.55, y: -0.45, kind: 'cluster'  },
  { id: 'pref',       label: 'Preferences',       tier: 2, x: -0.62, y: -0.30, kind: 'cluster'  },
  { id: 'team',       label: 'Team',              tier: 2, x:  0.10, y:  0.62, kind: 'cluster'  },
  { id: 'sam',        label: 'Sam Reyes',         tier: 3, x:  0.78, y:  0.18, kind: 'person'   },
  { id: 'roadmap',    label: 'Q3 Roadmap',        tier: 3, x:  0.84, y: -0.62, kind: 'project'  },
  { id: 'standup',    label: 'Standup ritual',    tier: 3, x: -0.20, y:  0.78, kind: 'fact'     },
  { id: 'writing',    label: 'Written summaries', tier: 3, x: -0.85, y: -0.55, kind: 'fact'     },
  { id: 'darkmode',   label: 'Dark mode',         tier: 3, x: -0.92, y:  0.05, kind: 'fact'     },
  { id: 'coffee',     label: 'Coffee black',      tier: 3, x: -0.55, y:  0.55, kind: 'fact'     },
  { id: 'budget',     label: '$42k/mo cap',       tier: 4, x:  0.95, y: -0.20, kind: 'fact'     },
  { id: 'retro',      label: 'Friday retro',      tier: 4, x:  0.45, y:  0.92, kind: 'fact'     },
];

const ALLURA_GRAPH_EDGES = [
  ['self', 'work'], ['self', 'pref'], ['self', 'team'],
  ['work', 'roadmap'], ['work', 'sam'], ['team', 'sam'], ['team', 'standup'],
  ['pref', 'writing'], ['pref', 'darkmode'], ['pref', 'coffee'],
  ['roadmap', 'budget'], ['sam', 'retro'],
];

// Sparkline data (24 points each)
const ALLURA_SPARKS = {
  capture: [12,14,16,15,17,19,18,20,22,21,24,26,25,28,27,29,31,33,30,32,34,33,36,38],
  curate:  [4, 5, 5, 6, 6, 7, 8, 7, 9, 8,10,11,10,11,12,12,13,12,14,15,14,16,15,17],
  graph:   [2, 2, 3, 3, 4, 5, 5, 6, 6, 7, 8, 8, 9,10, 9,11,12,11,13,12,14,15,14,16],
  recall:  [8, 9, 8,10,11,10,12,11,13,14,12,15,14,13,15,16,15,17,16,18,17,19,18,20],
};

Object.assign(window, {
  ALLURA_MEMORIES, ALLURA_FORGOTTEN, ALLURA_PROPOSALS, ALLURA_AGENTS,
  ALLURA_AGENT_ACTIVITY, ALLURA_TRACES, ALLURA_EXTRACTIONS,
  ALLURA_GRAPH_NODES, ALLURA_GRAPH_EDGES, ALLURA_SPARKS,
});
