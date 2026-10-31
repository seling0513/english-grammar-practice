/* 收集全站需要朗读的文本，输出 tools/audio_texts.json
   归一化/语言判定规则必须与 js/app.js 一致。 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const ctx = { window: {}, console, document: { getElementById: () => null }, localStorage: { getItem: () => null, setItem: () => {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8') + '\n;globalThis.GD = GRAMMAR_DATA;', ctx);
const D = ctx.GD;

function normText(t) {
  return String(t == null ? '' : t)
    .replace(/\s+/g, ' ')
    .replace(/([，。、；：！？])\1+/g, '$1')
    .replace(/([；：])，/g, '$1')
    .replace(/，([；：])/g, '$1')
    .replace(/([！？])。/g, '$1')
    .trim();
}
function detectLang(text) {
  let cjk = 0, latin = 0;
  for (const ch of String(text)) {
    if (/[\u3400-\u9FFF\uF900-\uFAFF]/.test(ch)) cjk++;
    else if (/[a-zA-Z]/.test(ch)) latin++;
  }
  return cjk >= latin ? 'zh-CN' : 'en-US';
}

const map = new Map();
function add(text, lang) {
  const t = normText(text);
  if (!t) return;
  if (!/[A-Za-z0-9\u3400-\u9FFF]/.test(t)) return;   // 纯标点/emoji 不生成
  const lg = lang || detectLang(t);
  map.set(lg + '|' + t, { lang: lg, text: t });
}

/* 首页 */
const c = D.concept, s = D.spine;
add(c.title + '。' + c.lines.join('。'), 'zh-CN');
add(s.title + '。' + s.desc + '。' + s.steps.map(x => x.name + '：' + x.sub).join('。'), 'zh-CN');
add(D.method.title + '。' + D.method.points.map(p => p.title + '：' + p.desc).join('。'), 'zh-CN');

/* 主题：学一学 + 练一练 */
Object.values(D.topics).forEach(t => {
  if (t.story && t.story.text) add(t.story.title ? ('故事：' + t.story.title + '。' + t.story.text) : t.story.text, 'zh-CN');
  if (t.chant) add(t.chant.title + '。' + t.chant.lines.join('，'), 'zh-CN');
  const cmp = t.compare || { title: '🀄 和中文比一比', text: '' };
  add(cmp.title + '。' + cmp.text, 'zh-CN');
  if (t.blocks) add(t.blocks.map(b => b.sentence.map(w => w.t).join(' ')).join('。 '), 'en-US');
  if (t.rule) add('规则小课堂。' + t.rule, 'zh-CN');

  (t.exercises || []).forEach(ex => {
    if (ex.type === 'choice') {
      add(ex.q);
      (ex.options || []).forEach(o => add(o));
    } else if (ex.type === 'drag') {
      add(ex.instruction, 'zh-CN');
      add(ex.answer.join(' '), 'en-US');
      (ex.tokens || []).forEach(w => add(w, 'en-US'));
    } else if (ex.type === 'fix') {
      add(ex.sentence.join(' '), 'en-US');
      add(ex.sentence.map((w, i) => i === ex.wrongIndex ? ex.correctWord : w).join(' '), 'en-US');
      ex.sentence.forEach(w => add(w, 'en-US'));
    }
  });
});

/* 易混淆馆 */
(D.confusables || []).forEach(cf => {
  cf.pairs.forEach(p => add(p.name + '。' + p.def + '。' + p.example));
  add('怎么区分。' + cf.tip, 'zh-CN');
  cf.quizzes.forEach(q => {
    add(q.q);
    (q.options || []).forEach(o => add(o));
  });
});

const list = Array.from(map.values());
const outPath = path.join(__dirname, 'audio_texts.json');
fs.writeFileSync(outPath, JSON.stringify(list, null, 0), 'utf8');

const zh = list.filter(x => x.lang === 'zh-CN').length;
const en = list.filter(x => x.lang === 'en-US').length;
console.log('唯一朗读文本:', list.length, '| 中文:', zh, '| 英文:', en);
console.log('输出:', outPath);
console.log('样例:');
list.slice(0, 6).forEach(x => console.log(' ', x.lang, '|', x.text.slice(0, 60)));
