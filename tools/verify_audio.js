/* 核对：运行时每一个会发声的位置，是否都有对应的本地 MP3。
   复刻 js/app.js 的 normText / detectLang / hashText / audioSrc，逐条检查文件是否存在。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const AUDIO = path.join(root, 'audio');

const ctx = { window: {}, console, document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8') + '\n;globalThis.GD = GRAMMAR_DATA;', ctx);
const D = ctx.GD;

/* ---- 与 app.js 完全一致的实现 ---- */
function detectLang(text) {
  let cjk = 0, latin = 0;
  for (const ch of String(text)) {
    if (/[\u3400-\u9FFF\uF900-\uFAFF]/.test(ch)) cjk++;
    else if (/[a-zA-Z]/.test(ch)) latin++;
  }
  return cjk >= latin ? 'zh-CN' : 'en-US';
}
function normText(text) {
  return String(text == null ? '' : text)
    .replace(/\s+/g, ' ')
    .replace(/([，。、；：！？])\1+/g, '$1')
    .replace(/([；：])，/g, '$1')
    .replace(/，([；：])/g, '$1')
    .replace(/([！？])。/g, '$1')
    .trim();
}
function hashText(str) {
  let h = 0x811c9dc5;
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}
function audioSrc(text, lang) {
  const t = normText(text); if (!t) return '';
  return path.join(AUDIO, hashText((lang || detectLang(t)) + '|' + t) + '.mp3');
}

/* ---- 复刻渲染层，收集所有会发声的位置 ---- */
const need = new Map();   // src -> 第一个出现的场景
function want(text, lang, where) {
  const t = normText(text);
  if (!t) return;
  if (!/[A-Za-z0-9\u3400-\u9FFF]/.test(t)) return;
  const src = audioSrc(t, lang);
  if (!need.has(src)) need.set(src, where);
}

// 首页
const c = D.concept, s = D.spine;
want(c.title + '。' + c.lines.join('。'), 'zh-CN', 'home.concept');
want(s.title + '。' + s.desc + '。' + s.steps.map(x => x.name + '：' + x.sub).join('。'), 'zh-CN', 'home.spine');
want(D.method.title + '。' + D.method.points.map(p => p.title + '：' + p.desc).join('。'), 'zh-CN', 'home.method');

// 主题
Object.values(D.topics).forEach(t => {
  const tag = 'topic:' + t.id;
  if (t.story && t.story.text) want(t.story.title ? ('故事：' + t.story.title + '。' + t.story.text) : t.story.text, 'zh-CN', tag + '.story');
  if (t.chant) want(t.chant.title + '。' + t.chant.lines.join('，'), 'zh-CN', tag + '.chant');
  const cmp = t.compare || { title: '🀄 和中文比一比', text: '' };
  want(cmp.title + '。' + cmp.text, 'zh-CN', tag + '.compare');
  if (t.blocks) want(t.blocks.map(b => b.sentence.map(w => w.t).join(' ')).join('。 '), 'en-US', tag + '.blocks');
  if (t.rule) want('规则小课堂。' + t.rule, 'zh-CN', tag + '.rule');

  (t.exercises || []).forEach((ex, i) => {
    const at = tag + '#' + i;
    if (ex.type === 'choice') {
      // 运行时 speakTxt = instruction ? instruction+'。' : '' + q
      const speakTxt = (ex.instruction ? ex.instruction + '。' : '') + (ex.q ? ex.q : '');
      want(speakTxt, detectLang(speakTxt), at + '.auto');
      ex.options.forEach(o => want(o, detectLang(o), at + '.option'));
    } else if (ex.type === 'drag') {
      const speakTxt = (ex.instruction ? ex.instruction + '。' : '');
      want(speakTxt, detectLang(speakTxt), at + '.auto');
      want(ex.answer.join(' '), 'en-US', at + '.built');
      ex.tokens.forEach(w => want(w, 'en-US', at + '.word'));
    } else if (ex.type === 'fix') {
      const speakTxt = ex.sentence.join(' ');
      want(speakTxt, detectLang(speakTxt), at + '.auto');
      want(ex.sentence.map((w, k) => k === ex.wrongIndex ? ex.correctWord : w).join(' '), 'en-US', at + '.fixed');
    }
  });
});

// 易混淆馆
D.confusables.forEach(cf => {
  cf.pairs.forEach(p => want(p.name + '。' + p.def + '。' + p.example, detectLang(p.name + '。' + p.def + '。' + p.example), 'cf:' + cf.id + '.pair'));
  want('怎么区分。' + cf.tip, 'zh-CN', 'cf:' + cf.id + '.tip');
  cf.quizzes.forEach((q, i) => {
    want(q.q, detectLang(q.q), 'cf:' + cf.id + '.q' + i);
    q.options.forEach(o => want(o, detectLang(o), 'cf:' + cf.id + '.opt' + i));
  });
});

let missing = [];
for (const [src, where] of need) {
  if (!fs.existsSync(src)) missing.push({ src: path.basename(src), where });
}
console.log('应发声位置（去重后）:', need.size);
console.log('已存在 MP3:', need.size - missing.length, '| 缺失:', missing.length);
if (missing.length) {
  console.log('\n缺失明细（前 60 条）:');
  missing.slice(0, 60).forEach(m => console.log('  -', m.src, '@', m.where));
  const byWhere = {};
  missing.forEach(m => { const k = m.where.split('.').pop(); byWhere[k] = (byWhere[k] || 0) + 1; });
  console.log('\n按类型统计:', JSON.stringify(byWhere));
  process.exitCode = 1;
} else {
  console.log('✅ 所有发声位置都能找到本地 MP3');
}
