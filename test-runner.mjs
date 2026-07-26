import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const match = html.match(/<script id="room-core">([\s\S]*?)<\/script>/);
assert.ok(match, 'index.html exposes the production core in #room-core');
const context = { window: {}, Intl, Date, Math, crypto: globalThis.crypto };
vm.createContext(context);
vm.runInContext(match[1], context);
const A = context.window.RoomToBeginTestAPI;
const T = context.window.TimerCore;
assert.ok(A, 'RoomToBeginTestAPI is exported');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const room = { id: 'kitchen', label: 'Kitchen' };
const now = Date.parse('2026-07-25T12:00:00.000Z');

test('default and v1 migration produce one v2 active-session slot', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(A.createDefaultRoot())), { version: 2, route: 'home', activeSession: null, history: [], customRooms: [], lastCompletion: null });
  assert.equal(A.migrateV1State({ screen: 'welcome' }).activeSession, null);
  const migrated = A.migrateV1State({ screen: 'task', room: 'kitchen', minutes: '20', energy: 'steady', stepIndex: 2, completed: ['trash'], loops: 1, startedAt: '2026-01-01T00:00:00Z', safeStop: false });
  assert.equal(migrated.activeSession.room.label, 'Kitchen');
  assert.equal(migrated.activeSession.stepIndex, 2);
  assert.equal(Object.keys(migrated).filter(k => k === 'activeSession').length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(A.parseRoot('{bad'))), JSON.parse(JSON.stringify(A.createDefaultRoot())));
});

test('session creation supports fast, skipped, tailored, and safe custom rooms', () => {
  const fast = A.createSession({ source: 'start-now', room, now });
  assert.equal(fast.minutes, null); assert.equal(fast.energy, null); assert.equal(fast.screen, 'task');
  assert.equal(A.createSession({ source: 'start-now', room: null, now }).room, null);
  const tailored = A.createSession({ source: 'tailored', room, minutes: '30', energy: 'good', now });
  assert.equal(tailored.minutes, '30'); assert.equal(tailored.energy, 'good');
  assert.equal(A.spaceLabel(null), 'this space');
  assert.equal(A.normalizeRoomLabel('  <b>Very   long room name that keeps going forever</b>  ').length <= 40, true);
  assert.equal(A.escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
});

test('tailored 10/20/30 drive optional timer deadlines and open has no forced timer', () => {
  for (const minutes of ['10', '20', '30']) {
    const session = A.createSession({ source: 'tailored', room, minutes, energy: 'low', now });
    assert.equal(A.sessionTimerSeconds(session), Number(minutes) * 60);
    const timer = T.startTimer(T.createTimer(A.sessionTimerSeconds(session)), now);
    assert.equal(timer.endsAt, now + Number(minutes) * 60000);
    assert.match(A.timerInstruction(session), new RegExp(`${minutes}-minute timer`));
  }
  const open = A.createSession({ source: 'tailored', room, minutes: 'open', energy: 'good', now });
  assert.equal(A.sessionTimerSeconds(open), null);
  assert.equal(A.timerInstruction(open), '');
  assert.equal(A.sessionTimerSeconds(A.createSession({ source: 'start-now', room, now })), 600);
});

test('custom room ids are stable opaque identifiers independent of normalized labels', () => {
  const unicodeA = A.createCustomRoom(' 客厅 ', now, 'uuid-a');
  const unicodeB = A.createCustomRoom('卧室', now, 'uuid-b');
  const punctuationA = A.createCustomRoom('A/B', now, 'uuid-c');
  const punctuationB = A.createCustomRoom('A B', now, 'uuid-d');
  assert.equal(unicodeA.label, '客厅');
  assert.notEqual(unicodeA.id, unicodeB.id);
  assert.notEqual(punctuationA.id, punctuationB.id);
  assert.equal(A.createCustomRoom('<b>' + 'x'.repeat(50), now, 'uuid-e').label.length, 40);
});

test('home model is resume-first and session navigation is hidden during work', () => {
  assert.equal(A.getHomeModel(A.createDefaultRoot()).primary, 'Start now');
  const root = A.createDefaultRoot(); root.activeSession = A.createSession({ source: 'start-now', room, now });
  assert.equal(A.getHomeModel(root).primary, 'Resume session');
  assert.equal(A.getHomeModel(root).canStart, false);
  assert.equal(A.showBottomNav(root, 'task'), false);
  assert.equal(A.showBottomNav(root, 'home'), true);
});

test('active time accumulates, pauses, resumes, freezes, and clamps', () => {
  let s = A.createSession({ source: 'start-now', room, now });
  s = A.startActiveClock(s, now);
  assert.equal(A.getActiveMs(s, now + 5000), 5000);
  s = A.pauseActiveClock(s, now + 5000);
  assert.equal(A.getActiveMs(s, now + 9000), 5000);
  s = A.resumeActiveClock(s, now + 9000);
  assert.equal(A.finalizeActiveClock(s, now + 12000).activeMs, 8000);
  assert.equal(A.getActiveMs({ activeMs: -4, activeSince: now + 500 }, now), 0);
});

test('support is active and its elapsed time reaches history exactly once', () => {
  let s = A.startActiveClock(A.createSession({ source: 'start-now', room, now }), now);
  s = A.transition(s, { type: 'support', supportType: null }, now + 1000);
  assert.equal(s.timer, null);
  assert.equal(A.isActiveScreen(s.screen), true);
  s = A.pauseActiveClock(s, now + 6000);
  s = A.resumeActiveClock(s, now + 9000);
  s = A.transition(s, { type: 'support-return' }, now + 10000);
  const root = A.createDefaultRoot();
  root.activeSession = s;
  const closed = A.closeSession(root, now + 12000);
  assert.equal(closed.history[0].activeMs, 9000);
  assert.equal(A.closeSession(closed, now + 15000).history[0].activeMs, 9000);
});

test('persisted v2 state is structurally normalized before rendering', () => {
  const corrupt = {
    version: 2, route: 'wat', customRooms: [{ id: 4, label: '<x>' }, null],
    activeSession: {
      id: 's', source: 'tailored', room: { id: 'k', label: 'Kitchen' }, minutes: '999',
      energy: 'bogus', stepIndex: 999, completedStepIds: ['trash', 2], loops: 99,
      startedAt: '2026-01-01T00:00:00.000Z', activeMs: -4, activeSince: Infinity,
      safeStop: false, screen: 'wat', supportType: {}, timer: { duration: -1, remaining: NaN, status: 'wat', endsAt: 'soon' }
    },
    history: [
      { id:'ok', startedAt:'2026-01-01T00:00:00.000Z', endedAt:'2026-01-01T00:01:00.000Z', activeMs:60000, room:null, source:'start-now', completedStepIds:['trash'], ending:'completed' },
      { id:'bad', endedAt:'never' }
    ],
    lastCompletion: { id:'bad', endedAt:'never' }
  };
  const root = A.parseRoot(corrupt);
  assert.equal(root.route, 'home');
  assert.equal(root.activeSession, null);
  assert.equal(root.customRooms.length, 0);
  assert.equal(root.history.length, 1);
  assert.equal(root.lastCompletion, null);

  const bounded = A.parseRoot({ ...A.createDefaultRoot(), route:'session', activeSession:{
    ...A.createSession({ source:'start-now', room, now }), stepIndex:999, loops:99,
    completedStepIds:['trash', 2], activeMs:'bad', activeSince:-4
  }});
  assert.equal(bounded.activeSession.stepIndex, 7);
  assert.equal(bounded.activeSession.loops, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(bounded.activeSession.completedStepIds)), ['trash']);
  assert.equal(bounded.activeSession.activeMs, 0);
  assert.equal(bounded.activeSession.activeSince, null);
  const paused = A.parseRoot({ ...A.createDefaultRoot(), route:'session', activeSession:{
    ...A.createSession({ source:'start-now', room, now }), activeSince:null
  }});
  assert.equal(paused.activeSession.activeSince, null);
});

test('invalid v2 falls back to valid v1 without overwriting either raw recovery source', () => {
  const v1 = JSON.stringify({ screen:'task', room:'kitchen', minutes:'20', energy:'steady', stepIndex:2, completed:[], loops:0, startedAt:'2026-01-01T00:00:00.000Z', safeStop:false });
  for (const invalidV2 of ['{bad', JSON.stringify({ version: 99 })]) {
    const selected = A.selectRecovery(invalidV2, v1);
    assert.equal(selected.source, 'v1');
    assert.equal(selected.root.activeSession.stepIndex, 2);
    assert.equal(selected.shouldWriteV2, true);
    assert.equal(selected.rawV2, invalidV2);
    assert.equal(selected.rawV1, v1);
  }
  assert.equal(A.selectRecovery(null, null).source, 'default');
  assert.equal(A.selectRecovery(JSON.stringify(A.createDefaultRoot()), v1).source, 'v2');
});

test('storage adapter survives denied reads and quota failures', () => {
  const warnings = [];
  const denied = A.createStorageAdapter({ getItem(){ throw new Error('denied'); }, setItem(){ throw new Error('quota'); } }, warnings.push.bind(warnings));
  assert.equal(denied.get('x'), null);
  assert.equal(denied.set('x', '{}'), false);
  assert.equal(warnings.length, 2);
  const memory = new Map();
  const working = A.createStorageAdapter({ getItem:k=>memory.get(k) ?? null, setItem:(k,v)=>memory.set(k,v) }, () => {});
  assert.equal(working.set('x', 'ok'), true);
  assert.equal(working.get('x'), 'ok');
});

test('history totals, room sorting, calendar and filters are deterministic', () => {
  const history = [
    { id:'a', startedAt:'2026-07-02T10:00:00', endedAt:'2026-07-02T10:10:00', activeMs:600000, room, completedStepIds:['trash'], ending:'completed' },
    { id:'b', startedAt:'2026-07-02T12:00:00', endedAt:'2026-07-02T12:05:00', activeMs:300000, room:{id:'bathroom',label:'Bathroom'}, completedStepIds:[], ending:'safe-stop' },
    { id:'c', startedAt:'2026-06-01T12:00:00', endedAt:'2026-06-01T12:05:00', activeMs:300000, room:null, completedStepIds:[], ending:'completed' }
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(A.historyTotals(history))), { sessions:3, activeMs:1200000 });
  assert.deepEqual(JSON.parse(JSON.stringify(A.groupHistoryByRoom(history).map(x => x.label))), ['Kitchen','Bathroom']);
  assert.equal(A.groupHistoryByDay(history, 2026, 6)['2026-07-02'], 2);
  assert.equal(A.filterHistory(history, { roomId:'kitchen' }).length, 1);
  assert.equal(A.filterHistory(history, { date:'2026-07-02' }).length, 2);
});

test('timer extension and acknowledgement never advance workflow', () => {
  const finished = { ...T.createTimer(60), status:'finished', remaining:0, alarmAcknowledged:false };
  const acknowledged = T.acknowledgeTimer(finished);
  assert.equal(acknowledged.status, 'finished'); assert.equal(acknowledged.alarmAcknowledged, true);
  const extended = T.extendTimer(finished, now);
  assert.equal(extended.remaining, 120); assert.equal(extended.endsAt, now + 120000); assert.equal(extended.status, 'running');
  const session = A.createSession({ source:'start-now', room, now });
  assert.equal(A.applyTimerAction(session, 'acknowledge', now).stepIndex, session.stepIndex);
  assert.equal(A.reconcileRestoredTimer({ ...finished, alarmAcknowledged:false }, now).alarmAcknowledged, true);
});

test('workflow transitions preserve tasks, bound loops, and close once', () => {
  let s = A.createSession({ source:'start-now', room, now });
  s.timer = T.startTimer(T.createTimer(60), now);
  const helped = A.transition(s, { type:'support', supportType:'too-much' }, now + 1000);
  assert.equal(helped.timer.status, 'paused'); assert.equal(helped.stepIndex, 0);
  assert.equal(A.transition(helped, { type:'support-return' }, now + 2000).stepIndex, 0);
  const stopped = A.transition(s, { type:'safe-stop' }, now);
  assert.equal(stopped.safeStop, true); assert.equal(stopped.stepIndex, 7);
  let basket = { ...s, stepIndex:5, screen:'basket', loops:2 };
  assert.equal(A.transition(basket, { type:'basket-more' }, now).stepIndex, 6);
  const root = A.createDefaultRoot(); root.activeSession = stopped;
  const closed = A.closeSession(root, now + 10000);
  assert.equal(closed.history.length, 1); assert.equal(A.closeSession(closed, now + 20000).history.length, 1);
});

test('PWA app-shell metadata is complete and local-only', () => {
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /apple-mobile-web-app-capable/);
  const manifest = JSON.parse(fs.readFileSync(new URL('./manifest.webmanifest', import.meta.url)));
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.start_url, './');
  const sw = fs.readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
  for (const asset of ['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png']) assert.ok(sw.includes(asset));
  for (const icon of manifest.icons) assert.ok(fs.statSync(new URL(icon.src, import.meta.url)).size > 100, `${icon.src} exists`);
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+stylesheet|https?:\/\/[^"']+\.(?:js|css)/);
});

test('service worker uses refreshable navigation with query-safe shell fallback and scoped cleanup', async () => {
  const sw = fs.readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
  assert.match(sw, /request\.mode\s*===\s*['"]navigate['"]/);
  assert.match(sw, /fetch\(event\.request\)/);
  assert.match(sw, /caches\.match\(['"]\.\/index\.html['"]\)|caches\.match\(['"]\.\/['"]\)/);
  assert.match(sw, /startsWith\(CACHE_PREFIX\)/);
  assert.doesNotMatch(sw, /caches\.keys\(\)[\s\S]*filter\(key\s*=>\s*key\s*!==\s*CACHE_NAME\)/);

  const handlers = {};
  const deleted = [];
  const shell = { source:'cached-shell' };
  const swContext = {
    URL, Promise,
    self: {
      location:{ origin:'https://example.test' },
      clients:{ claim:()=>Promise.resolve() },
      addEventListener:(type, handler)=>{ handlers[type]=handler; }
    },
    caches: {
      open:()=>Promise.resolve({ addAll:()=>Promise.resolve(), put:()=>Promise.resolve() }),
      match:key=>Promise.resolve(key === './index.html' ? shell : null),
      keys:()=>Promise.resolve(['room-to-begin-v2-1', 'unrelated-cache']),
      delete:key=>{ deleted.push(key); return Promise.resolve(true); }
    },
    fetch:()=>Promise.reject(new Error('offline'))
  };
  vm.createContext(swContext);
  vm.runInContext(sw, swContext);
  let navigationResponse;
  handlers.fetch({
    request:{ method:'GET', mode:'navigate', url:'https://example.test/?utm=test' },
    respondWith:promise=>{ navigationResponse=promise; }
  });
  assert.equal(await navigationResponse, shell);
  let activation;
  handlers.activate({ waitUntil:promise=>{ activation=promise; } });
  await activation;
  assert.deepEqual(deleted, ['room-to-begin-v2-1']);
});

test('critical browser wiring preserves dialogs, focus, active-work navigation, and hidden form', () => {
  assert.match(html, /\.custom-room\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(html, />Where are you\?</);
  assert.doesNotMatch(html, />Where are you beginning\?</);
  assert.match(html, /supportDialog\.addEventListener\(['"]cancel['"]/);
  assert.match(html, /alarmDialog\.addEventListener\(['"]cancel['"]/);
  assert.match(html, /alarmDialog\.showModal\(\)[\s\S]{0,300}(?:tone|vibrate)/);
  assert.match(html, /clearInterval\(alarmInterval\)[\s\S]{0,160}alarmInterval=setInterval/);
  assert.match(html, /focusRouteHeading|restoreTimerFocus/);
  assert.match(html, /homeButton\.disabled\s*=/);
  assert.match(html, /\.meta-pills span\s*\{[^}]*overflow-wrap:\s*anywhere/);
  assert.match(html, /bindNav\(\);focusRouteHeading\(\);\s*\n\s*\}/);
  const browserHarness = fs.readFileSync(new URL('./tests.html', import.meta.url), 'utf8');
  assert.ok(browserHarness.indexOf("addEventListener('load'") < browserHarness.indexOf('frame.src ='));
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}\n${error.stack}`); }
}
console.log(`${tests.length - failed}/${tests.length} tests passed`);
process.exitCode = failed ? 1 : 0;
