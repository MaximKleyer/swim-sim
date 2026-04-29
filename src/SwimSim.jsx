import React, { useState, useMemo } from 'react';

// ============================================================
// EVENT DATABASE — Short Course Yards (HS & NCAA dual meets)
// wr = approximate world-class baseline (rating 99)
// secPerPoint = seconds added per rating point below 99
// ============================================================
const EVENTS = {
  '50_free':           { name: '50 Free',           dist: 50,   stroke: 'free',    wr: 17.63, spp: 0.18 },
  '100_free':          { name: '100 Free',          dist: 100,  stroke: 'free',    wr: 39.90, spp: 0.40 },
  '200_free':          { name: '200 Free',          dist: 200,  stroke: 'free',    wr: 88.81, spp: 0.95 },
  '500_free':          { name: '500 Free',          dist: 500,  stroke: 'free',    wr: 244.10, spp: 2.6 },
  '1000_free':         { name: '1000 Free',         dist: 1000, stroke: 'free',    wr: 510.00, spp: 5.5 },
  '1650_free':         { name: '1650 Free',         dist: 1650, stroke: 'free',    wr: 852.00, spp: 9.5 },
  '100_back':          { name: '100 Back',          dist: 100,  stroke: 'back',    wr: 43.35, spp: 0.45 },
  '200_back':          { name: '200 Back',          dist: 200,  stroke: 'back',    wr: 94.25, spp: 1.05 },
  '100_breast':        { name: '100 Breast',        dist: 100,  stroke: 'breast',  wr: 49.53, spp: 0.55 },
  '200_breast':        { name: '200 Breast',        dist: 200,  stroke: 'breast',  wr: 108.37, spp: 1.25 },
  '100_fly':           { name: '100 Fly',           dist: 100,  stroke: 'fly',     wr: 42.80, spp: 0.45 },
  '200_fly':           { name: '200 Fly',           dist: 200,  stroke: 'fly',     wr: 96.15, spp: 1.10 },
  '200_im':            { name: '200 IM',            dist: 200,  stroke: 'im',      wr: 96.55, spp: 1.10 },
  '400_im':            { name: '400 IM',            dist: 400,  stroke: 'im',      wr: 211.10, spp: 2.4 },
  '200_medley_relay':  { name: '200 Medley Relay',  dist: 50,   stroke: 'mr',      wr: 80.50,  spp: 0.95, type: 'relay' },
  '400_medley_relay':  { name: '400 Medley Relay',  dist: 100,  stroke: 'mr',      wr: 175.00, spp: 2.00, type: 'relay' },
  '200_free_relay':    { name: '200 Free Relay',    dist: 50,   stroke: 'fr',      wr: 73.00,  spp: 0.85, type: 'relay' },
  '400_free_relay':    { name: '400 Free Relay',    dist: 100,  stroke: 'fr',      wr: 163.00, spp: 1.85, type: 'relay' },
};

// Dual meet event order
const HS_FORMAT = [
  '200_medley_relay', '200_free', '200_im', '50_free', '100_fly',
  '100_free', '500_free', '200_free_relay', '100_back', '100_breast', '400_free_relay'
];
const NCAA_FORMAT = [
  '400_medley_relay', '1000_free', '200_free', '100_back', '100_breast',
  '200_fly', '50_free', '100_free', '200_back', '200_breast',
  '500_free', '200_im', '400_free_relay'
];

const HS_INDIV   = [6, 4, 3, 2, 1];
const HS_RELAY   = [8, 4, 2];
const NCAA_INDIV = [9, 4, 3, 2, 1];
const NCAA_RELAY = [11, 4, 2];

// ============================================================
// CORE MATH — event ratings, time generation, relay logic
// ============================================================

// Compute a single-leg sprint/100 rating for a given stroke & distance.
function legRating(stats, stroke, dist) {
  const s = stats[stroke];
  if (dist === 50) {
    return 0.40 * s + 0.30 * stats.sprint + 0.15 * stats.underwater + 0.15 * stats.turns;
  }
  return 0.45 * s + 0.20 * stats.sprint + 0.10 * stats.endurance + 0.15 * stats.underwater + 0.10 * stats.turns;
}

// Event rating from underlying stats
function eventRating(swimmer, eventKey) {
  const ev = EVENTS[eventKey];
  if (ev.type === 'relay') return 0; // relays are computed across 4 swimmers
  const s = swimmer.stats;
  const stroke = ev.stroke;

  if (stroke === 'im') {
    const all = (s.free + s.back + s.breast + s.fly) / 4;
    if (ev.dist === 200) {
      return 0.50 * all + 0.20 * s.endurance + 0.15 * s.turns + 0.15 * s.underwater;
    }
    return 0.45 * all + 0.30 * s.endurance + 0.10 * s.turns + 0.15 * s.raceIQ;
  }

  const ss = s[stroke];
  if (ev.dist === 50) {
    return 0.40 * ss + 0.30 * s.sprint + 0.15 * s.underwater + 0.15 * s.turns;
  }
  if (ev.dist === 100) {
    return 0.45 * ss + 0.20 * s.sprint + 0.10 * s.endurance + 0.15 * s.underwater + 0.10 * s.turns;
  }
  if (ev.dist === 200) {
    return 0.40 * ss + 0.10 * s.sprint + 0.25 * s.endurance + 0.10 * s.underwater + 0.10 * s.turns + 0.05 * s.raceIQ;
  }
  // 500/1000/1650
  return 0.30 * ss + 0.50 * s.endurance + 0.05 * s.underwater + 0.05 * s.turns + 0.10 * s.raceIQ;
}

// Approximate normal noise via three-sample average → close enough for this sim
function gaussian(sigma) {
  return ((Math.random() + Math.random() + Math.random()) - 1.5) * 2 * sigma;
}

function ratingToTime(rating, eventKey, raceIQ = 75) {
  const ev = EVENTS[eventKey];
  const base = ev.wr + Math.max(0, 99 - rating) * ev.spp;
  // higher raceIQ → tighter sigma; lower → bigger swings
  const sigma = base * 0.006 * Math.max(0.4, (110 - raceIQ) / 50);
  return Math.max(ev.wr * 0.97, base + gaussian(sigma));
}

function formatTime(sec) {
  if (sec < 60) return sec.toFixed(2);
  const m = Math.floor(sec / 60);
  const s = (sec - m * 60).toFixed(2);
  return `${m}:${s.padStart(5, '0')}`;
}

// Pick best lineup for a relay (no swimmer used twice)
function pickMedleyRelay(team) {
  if (team.length < 4) return null;
  const strokes = ['back', 'breast', 'fly', 'free'];
  const used = new Set();
  const legs = [];
  for (const st of strokes) {
    const pool = team.filter(sw => !used.has(sw.id));
    pool.sort((a, b) => b.stats[st] - a.stats[st]);
    if (!pool[0]) return null;
    legs.push({ swimmer: pool[0], stroke: st });
    used.add(pool[0].id);
  }
  return legs;
}

function pickFreeRelay(team) {
  if (team.length < 4) return null;
  return [...team]
    .sort((a, b) => b.stats.free - a.stats.free)
    .slice(0, 4)
    .map(sw => ({ swimmer: sw, stroke: 'free' }));
}

function relayRating(legs, eventKey) {
  const dist = EVENTS[eventKey].dist;
  const ratings = legs.map(({ swimmer, stroke }) =>
    legRating(swimmer.stats, stroke, dist)
  );
  return ratings.reduce((a, b) => a + b, 0) / 4;
}

function relayRaceIQ(legs) {
  return legs.reduce((a, l) => a + l.swimmer.stats.raceIQ, 0) / 4;
}

// ============================================================
// SAMPLE ROSTERS — fictional swimmers, names not real people
// ============================================================
const HOME_TEAM = [
  { name: 'Cade Brennan',     yr: 'SR', stats: { free: 92, back: 70, breast: 60, fly: 88, sprint: 95, endurance: 80, underwater: 90, turns: 88, raceIQ: 88 } },
  { name: 'Reed Whitaker',    yr: 'JR', stats: { free: 80, back: 92, breast: 65, fly: 75, sprint: 78, endurance: 90, underwater: 92, turns: 90, raceIQ: 88 } },
  { name: 'Marcus Holt',      yr: 'SO', stats: { free: 70, back: 65, breast: 92, fly: 70, sprint: 80, endurance: 75, underwater: 75, turns: 82, raceIQ: 80 } },
  { name: 'Theo Kasprzak',    yr: 'JR', stats: { free: 88, back: 75, breast: 70, fly: 92, sprint: 88, endurance: 82, underwater: 88, turns: 85, raceIQ: 85 } },
  { name: 'Jonas Kim',        yr: 'SR', stats: { free: 78, back: 72, breast: 78, fly: 78, sprint: 75, endurance: 92, underwater: 70, turns: 78, raceIQ: 84 } },
  { name: 'Will Oduya',       yr: 'FR', stats: { free: 82, back: 80, breast: 70, fly: 78, sprint: 82, endurance: 78, underwater: 80, turns: 78, raceIQ: 75 } },
];

const AWAY_TEAM = [
  { name: 'Daniil Voronov',   yr: 'SR', stats: { free: 90, back: 72, breast: 65, fly: 80, sprint: 92, endurance: 78, underwater: 88, turns: 86, raceIQ: 85 } },
  { name: 'Leo Marchetti',    yr: 'JR', stats: { free: 88, back: 75, breast: 65, fly: 75, sprint: 80, endurance: 92, underwater: 82, turns: 84, raceIQ: 87 } },
  { name: 'Henrik Solberg',   yr: 'SO', stats: { free: 72, back: 68, breast: 88, fly: 72, sprint: 78, endurance: 80, underwater: 75, turns: 80, raceIQ: 82 } },
  { name: 'Andre Fontaine',   yr: 'JR', stats: { free: 80, back: 78, breast: 65, fly: 90, sprint: 85, endurance: 80, underwater: 86, turns: 85, raceIQ: 85 } },
  { name: 'Kasper Lindqvist', yr: 'SR', stats: { free: 76, back: 88, breast: 68, fly: 78, sprint: 76, endurance: 84, underwater: 88, turns: 86, raceIQ: 84 } },
  { name: 'Ravi Anand',       yr: 'SO', stats: { free: 80, back: 70, breast: 76, fly: 72, sprint: 78, endurance: 82, underwater: 76, turns: 80, raceIQ: 78 } },
];

function buildRoster() {
  const id = (i) => `sw_${i}_${Math.random().toString(36).slice(2, 7)}`;
  let i = 0;
  return [
    ...HOME_TEAM.map(sw => ({ id: id(i++), team: 'home', gender: 'M', ...sw })),
    ...AWAY_TEAM.map(sw => ({ id: id(i++), team: 'away', gender: 'M', ...sw })),
  ];
}

// ============================================================
// UI HELPERS
// ============================================================
const STAT_KEYS = [
  ['free',       'Freestyle'],
  ['back',       'Backstroke'],
  ['breast',     'Breaststroke'],
  ['fly',        'Butterfly'],
  ['sprint',     'Sprint Power'],
  ['endurance',  'Endurance'],
  ['underwater', 'Underwaters'],
  ['turns',      'Turns'],
  ['raceIQ',     'Race IQ'],
];

function ratingTier(r) {
  if (r >= 90) return 'text-amber-300';
  if (r >= 80) return 'text-emerald-300';
  if (r >= 70) return 'text-cyan-300';
  if (r >= 60) return 'text-slate-300';
  return 'text-slate-500';
}

function teamColor(team) {
  return team === 'home' ? 'text-cyan-300' : 'text-orange-300';
}
function teamBg(team) {
  return team === 'home' ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-orange-500/10 border-orange-500/30';
}

// ============================================================
// COMPONENTS
// ============================================================
export default function App() {
  const [swimmers, setSwimmers] = useState(buildRoster);
  const [tab, setTab] = useState('roster');
  const [homeName, setHomeName] = useState('Hudson Tide');
  const [awayName, setAwayName] = useState('Coastal Waves');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100" style={{ fontFamily: 'ui-sans-serif, system-ui' }}>
      {/* font import */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Bebas+Neue&display=swap');
        .font-display { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.04em; }
        .font-body { font-family: 'IBM Plex Sans', sans-serif; }
        .font-mono-num { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
      `}</style>

      <div className="font-body max-w-6xl mx-auto px-4 py-6">
        <Header />
        <TeamHeader
          homeName={homeName} setHomeName={setHomeName}
          awayName={awayName} setAwayName={setAwayName}
          swimmers={swimmers}
        />
        <TabNav tab={tab} setTab={setTab} />
        <div className="mt-4">
          {tab === 'roster' && <RosterTab swimmers={swimmers} setSwimmers={setSwimmers} />}
          {tab === 'race'   && <RaceTab swimmers={swimmers} />}
          {tab === 'meet'   && <MeetTab swimmers={swimmers} homeName={homeName} awayName={awayName} />}
        </div>
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-6 border-b border-slate-800 pb-4">
      <div className="flex items-baseline gap-3">
        <h1 className="font-display text-5xl text-cyan-300">SWIM SIM</h1>
        <span className="text-xs uppercase tracking-widest text-slate-500">v0.1 · prototype</span>
      </div>
      <p className="text-sm text-slate-400 mt-1">
        Build swimmers, race them head-to-head, run dual meets · SCY format
      </p>
    </div>
  );
}

function TeamHeader({ homeName, setHomeName, awayName, setAwayName, swimmers }) {
  const homeCount = swimmers.filter(s => s.team === 'home').length;
  const awayCount = swimmers.filter(s => s.team === 'away').length;
  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div className="border border-cyan-500/30 bg-cyan-500/5 rounded px-3 py-2">
        <div className="text-[10px] uppercase tracking-widest text-cyan-400">Home</div>
        <div className="flex items-center justify-between">
          <input
            value={homeName}
            onChange={e => setHomeName(e.target.value)}
            className="bg-transparent font-display text-2xl text-cyan-100 outline-none flex-1"
          />
          <span className="font-mono-num text-xs text-slate-400">{homeCount} swimmers</span>
        </div>
      </div>
      <div className="border border-orange-500/30 bg-orange-500/5 rounded px-3 py-2">
        <div className="text-[10px] uppercase tracking-widest text-orange-400">Away</div>
        <div className="flex items-center justify-between">
          <input
            value={awayName}
            onChange={e => setAwayName(e.target.value)}
            className="bg-transparent font-display text-2xl text-orange-100 outline-none flex-1"
          />
          <span className="font-mono-num text-xs text-slate-400">{awayCount} swimmers</span>
        </div>
      </div>
    </div>
  );
}

function TabNav({ tab, setTab }) {
  const tabs = [
    ['roster', 'Roster'],
    ['race',   'Single Race'],
    ['meet',   'Dual Meet'],
  ];
  return (
    <div className="flex gap-1 border-b border-slate-800">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === key
              ? 'text-cyan-300 border-cyan-400'
              : 'text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ----- ROSTER TAB ------------------------------------------------
function RosterTab({ swimmers, setSwimmers }) {
  const [editingId, setEditingId] = useState(null);

  function addSwimmer(team) {
    const id = `sw_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const newSw = {
      id, team, name: 'New Swimmer', yr: 'FR', gender: 'M',
      stats: { free: 70, back: 65, breast: 60, fly: 65, sprint: 70, endurance: 70, underwater: 65, turns: 70, raceIQ: 70 },
    };
    setSwimmers([...swimmers, newSw]);
    setEditingId(id);
  }

  function updateSwimmer(id, patch) {
    setSwimmers(swimmers.map(s => s.id === id ? { ...s, ...patch } : s));
  }
  function updateStat(id, key, val) {
    setSwimmers(swimmers.map(s =>
      s.id === id ? { ...s, stats: { ...s.stats, [key]: val } } : s
    ));
  }
  function removeSwimmer(id) {
    setSwimmers(swimmers.filter(s => s.id !== id));
    if (editingId === id) setEditingId(null);
  }
  function moveSwimmer(id) {
    const sw = swimmers.find(s => s.id === id);
    updateSwimmer(id, { team: sw.team === 'home' ? 'away' : 'home' });
  }

  const home = swimmers.filter(s => s.team === 'home');
  const away = swimmers.filter(s => s.team === 'away');

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {[['home', home], ['away', away]].map(([team, list]) => (
        <div key={team} className={`border rounded ${teamBg(team)} p-3`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs uppercase tracking-widest ${teamColor(team)}`}>{team}</span>
            <button
              onClick={() => addSwimmer(team)}
              className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded"
            >
              + add swimmer
            </button>
          </div>
          <div className="space-y-1">
            {list.map(sw => (
              <SwimmerRow
                key={sw.id}
                sw={sw}
                expanded={editingId === sw.id}
                onClick={() => setEditingId(editingId === sw.id ? null : sw.id)}
                onUpdate={(patch) => updateSwimmer(sw.id, patch)}
                onUpdateStat={(k, v) => updateStat(sw.id, k, v)}
                onMove={() => moveSwimmer(sw.id)}
                onRemove={() => removeSwimmer(sw.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SwimmerRow({ sw, expanded, onClick, onUpdate, onUpdateStat, onMove, onRemove }) {
  // Headline: averages of stroke + a sample event rating (100 free)
  const strokeAvg = (sw.stats.free + sw.stats.back + sw.stats.breast + sw.stats.fly) / 4;
  const overall = (
    strokeAvg * 0.45 +
    sw.stats.sprint * 0.12 + sw.stats.endurance * 0.12 +
    sw.stats.underwater * 0.10 + sw.stats.turns * 0.10 + sw.stats.raceIQ * 0.11
  );
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-900"
        onClick={onClick}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono-num text-xs text-slate-500 w-7">{sw.yr}</span>
          <span className="text-sm truncate">{sw.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`font-mono-num text-sm ${ratingTier(overall)}`}>{overall.toFixed(0)}</span>
          <span className="text-slate-600 text-xs">{expanded ? '▴' : '▾'}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-slate-800">
          <div className="grid grid-cols-3 gap-2 my-2">
            <input
              value={sw.name} onChange={e => onUpdate({ name: e.target.value })}
              className="col-span-2 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm"
            />
            <select
              value={sw.yr} onChange={e => onUpdate({ yr: e.target.value })}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-sm"
            >
              {['FR','SO','JR','SR','GR'].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {STAT_KEYS.map(([key, label]) => (
              <StatSlider
                key={key}
                label={label}
                value={sw.stats[key]}
                onChange={v => onUpdateStat(key, v)}
              />
            ))}
          </div>
          <EventPreview sw={sw} />
          <div className="flex gap-2 mt-2">
            <button onClick={onMove} className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded">
              swap team
            </button>
            <button onClick={onRemove} className="text-xs px-2 py-1 bg-red-900/40 hover:bg-red-900/70 rounded text-red-200">
              remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatSlider({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-28 shrink-0">{label}</span>
      <input
        type="range" min="20" max="99" value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="flex-1 accent-cyan-500"
      />
      <span className={`font-mono-num text-xs w-7 text-right ${ratingTier(value)}`}>{value}</span>
    </div>
  );
}

function EventPreview({ sw }) {
  const previews = ['50_free', '100_free', '200_free', '500_free', '100_back', '100_breast', '100_fly', '200_im'];
  return (
    <div className="mt-3 pt-2 border-t border-slate-800">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Event ratings → expected time</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {previews.map(ek => {
          const r = eventRating(sw, ek);
          // Median time (no noise)
          const t = EVENTS[ek].wr + Math.max(0, 99 - r) * EVENTS[ek].spp;
          return (
            <div key={ek} className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{EVENTS[ek].name}</span>
              <span className="flex items-center gap-2">
                <span className={`font-mono-num ${ratingTier(r)}`}>{r.toFixed(0)}</span>
                <span className="font-mono-num text-slate-300">{formatTime(t)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----- SINGLE RACE TAB -------------------------------------------
function RaceTab({ swimmers }) {
  const [eventKey, setEventKey] = useState('100_free');
  const [picked, setPicked] = useState([]);
  const [results, setResults] = useState(null);

  const ev = EVENTS[eventKey];
  const isRelay = ev.type === 'relay';

  function toggle(id) {
    setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    setResults(null);
  }

  function runRace() {
    if (isRelay) return; // single-race tab is individual only
    const racers = swimmers.filter(s => picked.includes(s.id));
    if (racers.length < 2) return;
    const rows = racers.map(sw => {
      const r = eventRating(sw, eventKey);
      const t = ratingToTime(r, eventKey, sw.stats.raceIQ);
      return { sw, rating: r, time: t };
    }).sort((a, b) => a.time - b.time);
    setResults(rows);
  }

  const indivEvents = Object.entries(EVENTS).filter(([_, e]) => !e.type);

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-1 space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-slate-400 block mb-1">Event</label>
          <select
            value={eventKey}
            onChange={e => { setEventKey(e.target.value); setResults(null); }}
            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-sm"
          >
            {indivEvents.map(([k, e]) => <option key={k} value={k}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Pick swimmers</div>
          <div className="space-y-1 max-h-96 overflow-auto pr-1">
            {swimmers.map(sw => {
              const r = eventRating(sw, eventKey);
              const isPicked = picked.includes(sw.id);
              return (
                <button
                  key={sw.id}
                  onClick={() => toggle(sw.id)}
                  className={`w-full text-left px-2 py-1.5 rounded border text-xs flex items-center justify-between ${
                    isPicked
                      ? 'bg-cyan-500/10 border-cyan-500/40 text-slate-100'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`w-1 h-3 rounded ${sw.team === 'home' ? 'bg-cyan-400' : 'bg-orange-400'}`} />
                    <span className="truncate">{sw.name}</span>
                  </span>
                  <span className={`font-mono-num ${ratingTier(r)}`}>{r.toFixed(0)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button
          onClick={runRace}
          disabled={picked.length < 2}
          className="w-full py-2 bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 hover:bg-cyan-400 text-slate-950 font-semibold rounded text-sm"
        >
          Run Race ({picked.length})
        </button>
      </div>
      <div className="md:col-span-2">
        <div className="border border-slate-800 rounded p-4 bg-slate-900/50">
          <div className="font-display text-2xl text-slate-100">{ev.name}</div>
          <div className="text-xs text-slate-500">
            World-class baseline: <span className="font-mono-num">{formatTime(ev.wr)}</span> · {ev.spp.toFixed(2)}s per rating point
          </div>
          <div className="mt-4">
            {!results && <div className="text-sm text-slate-500">Pick at least 2 swimmers and run the race.</div>}
            {results && (
              <div>
                <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-slate-500 px-2 py-1 border-b border-slate-800">
                  <span className="col-span-1">#</span>
                  <span className="col-span-6">Swimmer</span>
                  <span className="col-span-2 text-right">Rating</span>
                  <span className="col-span-3 text-right">Time</span>
                </div>
                {results.map((r, i) => (
                  <div key={r.sw.id} className="grid grid-cols-12 items-center px-2 py-2 border-b border-slate-800/50 text-sm">
                    <span className="col-span-1 font-mono-num text-slate-500">{i + 1}</span>
                    <span className="col-span-6 flex items-center gap-2">
                      <span className={`w-1.5 h-3 rounded ${r.sw.team === 'home' ? 'bg-cyan-400' : 'bg-orange-400'}`} />
                      {r.sw.name}
                    </span>
                    <span className={`col-span-2 text-right font-mono-num ${ratingTier(r.rating)}`}>{r.rating.toFixed(0)}</span>
                    <span className="col-span-3 text-right font-mono-num text-slate-100">{formatTime(r.time)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----- DUAL MEET TAB ---------------------------------------------
function MeetTab({ swimmers, homeName, awayName }) {
  const [format, setFormat] = useState('hs');
  const [meetResult, setMeetResult] = useState(null);

  const events = format === 'hs' ? HS_FORMAT : NCAA_FORMAT;
  const indivPts = format === 'hs' ? HS_INDIV : NCAA_INDIV;
  const relayPts = format === 'hs' ? HS_RELAY : NCAA_RELAY;

  const homeRoster = swimmers.filter(s => s.team === 'home');
  const awayRoster = swimmers.filter(s => s.team === 'away');

  function simulateMeet() {
    const eventResults = [];
    let homeTotal = 0;
    let awayTotal = 0;

    for (const evKey of events) {
      const ev = EVENTS[evKey];
      const isRelay = ev.type === 'relay';
      const lanes = [];

      if (isRelay) {
        // Each team enters one A-relay (could extend to A+B later)
        const homeLegs = evKey.includes('medley') ? pickMedleyRelay(homeRoster) : pickFreeRelay(homeRoster);
        const awayLegs = evKey.includes('medley') ? pickMedleyRelay(awayRoster) : pickFreeRelay(awayRoster);
        if (homeLegs) {
          const r = relayRating(homeLegs, evKey);
          // total relay time ≈ ratingToTime called once on combined
          const t = ratingToTime(r, evKey, relayRaceIQ(homeLegs));
          lanes.push({ team: 'home', label: `${homeName} A`, legs: homeLegs, rating: r, time: t });
        }
        if (awayLegs) {
          const r = relayRating(awayLegs, evKey);
          const t = ratingToTime(r, evKey, relayRaceIQ(awayLegs));
          lanes.push({ team: 'away', label: `${awayName} A`, legs: awayLegs, rating: r, time: t });
        }
      } else {
        // Each team enters its top 3 by event rating; only top 2 score (dual meet convention)
        const rateAll = (roster) => roster
          .map(sw => ({ sw, rating: eventRating(sw, evKey) }))
          .sort((a, b) => b.rating - a.rating)
          .slice(0, 3);
        const homeEntries = rateAll(homeRoster);
        const awayEntries = rateAll(awayRoster);
        [...homeEntries, ...awayEntries].forEach(({ sw, rating }) => {
          const t = ratingToTime(rating, evKey, sw.stats.raceIQ);
          lanes.push({ team: sw.team, label: sw.name, sw, rating, time: t });
        });
      }

      lanes.sort((a, b) => a.time - b.time);

      // Award points (limit per team in non-relay: top 2 scoring per team for HS/NCAA dual)
      const ptsTable = isRelay ? relayPts : indivPts;
      const teamScored = { home: 0, away: 0 };
      const placeLimit = isRelay ? 999 : 2; // dual meet: top 2 per team score
      let placeIdx = 0;
      const placed = [];
      for (const lane of lanes) {
        if (placeIdx >= ptsTable.length) {
          placed.push({ ...lane, place: placeIdx + 1, points: 0 });
          placeIdx++;
          continue;
        }
        if (teamScored[lane.team] < placeLimit) {
          const pts = ptsTable[placeIdx];
          placed.push({ ...lane, place: placeIdx + 1, points: pts });
          if (lane.team === 'home') homeTotal += pts; else awayTotal += pts;
          teamScored[lane.team]++;
          placeIdx++;
        } else {
          placed.push({ ...lane, place: null, points: 0, exhibition: true });
        }
      }
      eventResults.push({ event: ev, key: evKey, lanes: placed, isRelay });
    }
    setMeetResult({ events: eventResults, homeTotal, awayTotal });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex bg-slate-900 border border-slate-800 rounded p-0.5">
          {['hs', 'ncaa'].map(f => (
            <button
              key={f}
              onClick={() => { setFormat(f); setMeetResult(null); }}
              className={`px-3 py-1 text-xs rounded ${
                format === f ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400'
              }`}
            >
              {f === 'hs' ? 'High School' : 'NCAA'}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500">
          {events.length} events · {format === 'hs' ? '6-4-3-2-1 / 8-4-2' : '9-4-3-2-1 / 11-4-2'} · top 2 score per team
        </div>
        <button
          onClick={simulateMeet}
          disabled={homeRoster.length < 4 || awayRoster.length < 4}
          className="ml-auto px-4 py-1.5 bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 hover:bg-cyan-400 text-slate-950 font-semibold rounded text-sm"
        >
          Simulate Meet
        </button>
      </div>

      {meetResult && (
        <div>
          {/* Score banner */}
          <div className="grid grid-cols-3 items-center mb-4 border border-slate-800 rounded bg-slate-900/50 px-4 py-3">
            <div className="text-cyan-300">
              <div className="text-[10px] uppercase tracking-widest text-cyan-400">Home</div>
              <div className="font-display text-2xl">{homeName}</div>
            </div>
            <div className="text-center font-mono-num text-3xl">
              <span className={meetResult.homeTotal > meetResult.awayTotal ? 'text-cyan-300' : 'text-slate-300'}>
                {meetResult.homeTotal}
              </span>
              <span className="text-slate-600 mx-2">·</span>
              <span className={meetResult.awayTotal > meetResult.homeTotal ? 'text-orange-300' : 'text-slate-300'}>
                {meetResult.awayTotal}
              </span>
            </div>
            <div className="text-orange-300 text-right">
              <div className="text-[10px] uppercase tracking-widest text-orange-400">Away</div>
              <div className="font-display text-2xl">{awayName}</div>
            </div>
          </div>

          {/* Per-event breakdown */}
          <div className="space-y-2">
            {meetResult.events.map(er => (
              <div key={er.key} className="border border-slate-800 rounded bg-slate-900/30">
                <div className="px-3 py-1.5 border-b border-slate-800 flex items-center justify-between">
                  <span className="font-display text-lg">{er.event.name}</span>
                  <span className="text-[10px] uppercase tracking-widest text-slate-500">
                    {er.isRelay ? 'relay' : 'individual'}
                  </span>
                </div>
                <div>
                  {er.lanes.map((lane, i) => (
                    <div key={i} className={`grid grid-cols-12 items-center px-3 py-1 text-xs border-b border-slate-800/40 ${lane.exhibition ? 'opacity-40' : ''}`}>
                      <span className="col-span-1 font-mono-num text-slate-500">
                        {lane.place ?? 'EX'}
                      </span>
                      <span className="col-span-7 flex items-center gap-2 truncate">
                        <span className={`w-1.5 h-3 rounded ${lane.team === 'home' ? 'bg-cyan-400' : 'bg-orange-400'}`} />
                        <span className="truncate">{lane.label}</span>
                        {er.isRelay && lane.legs && (
                          <span className="text-slate-500 text-[10px] truncate">
                            ({lane.legs.map(l => l.swimmer.name.split(' ').pop()).join(', ')})
                          </span>
                        )}
                      </span>
                      <span className={`col-span-2 text-right font-mono-num ${ratingTier(lane.rating)}`}>
                        {lane.rating.toFixed(0)}
                      </span>
                      <span className="col-span-1 text-right font-mono-num text-slate-200">
                        {formatTime(lane.time)}
                      </span>
                      <span className={`col-span-1 text-right font-mono-num ${lane.points > 0 ? 'text-amber-300' : 'text-slate-700'}`}>
                        {lane.points || ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!meetResult && (
        <div className="border border-dashed border-slate-800 rounded p-6 text-center text-slate-500 text-sm">
          {homeRoster.length < 4 || awayRoster.length < 4
            ? 'Each team needs at least 4 swimmers for relays. Add swimmers in the Roster tab.'
            : 'Click Simulate Meet to run the dual meet.'}
        </div>
      )}
    </div>
  );
}
