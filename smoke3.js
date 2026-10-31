// 真·交互测试桩 v3：用“题目是否被标记为已答对（渲染出的成功标记）”作为是否做对的判据。
// 说明：app.js 对每关星星有 3 颗封顶（addStar 中 cur<3），旧桩用“星星增加”判断会误判；
// 这里改为检查渲染 HTML 中是否出现成功标记（option correct / feedback show ok / fix-word fixed）。
const fs = require('fs');
const vm = require('vm');

function makeEl() {
  const el = {
    _html: '', _text: '',
    style: {},
    classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);} },
    _attrs: {},
    setAttribute(k,v){ this._attrs[k]=v; },
    getAttribute(k){ return (k in this._attrs) ? this._attrs[k] : null; },
    appendChild(){}, addEventListener(){}, querySelectorAll(){ return []; }
  };
  Object.defineProperty(el, 'innerHTML', { get(){return this._html;}, set(v){this._html=v;} });
  Object.defineProperty(el, 'textContent', { get(){return this._text;}, set(v){this._text=v;} });
  return el;
}
const elements = {};
['app','breadcrumb','starCount'].forEach(id => elements[id] = makeEl());
let clickHandlers = [];
const document = {
  getElementById: id => (elements[id] || (elements[id] = makeEl())),
  createElement: () => makeEl(),
  addEventListener: (ev, fn) => { if (ev === 'click') clickHandlers.push(fn); },
  querySelectorAll: () => [],
  body: { appendChild(){} }
};
const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k,v) => { store[k] = String(v); } };
const window = { speechSynthesis: { getVoices: () => [], speak(){}, cancel(){}, speaking:false } };
// 本地 MP3 播放桩（app.js 已改用 new Audio 播放预生成音频）
function AudioStub(src){
  this.src = src; this.onended = null; this.onerror = null; this._t = 0;
  Object.defineProperty(this, 'currentTime', {
    get(){ return this._t; }, set(v){ this._t = v; }
  });
}
AudioStub.prototype.play = function(){ return Promise.resolve(); };
AudioStub.prototype.pause = function(){};

const combined = fs.readFileSync('js/data.js','utf8') + '\n' + fs.readFileSync('js/app.js','utf8')
  + '\n;globalThis.GD = GRAMMAR_DATA;';
const ctx = { document, window, localStorage, console, Audio: AudioStub, SpeechSynthesisUtterance: function(){}, setTimeout, clearTimeout };
vm.createContext(ctx);
vm.runInContext(combined, ctx, { filename:'combined.js' });
const GD = ctx.GD;

function fire(action, attrs){
  const fakeEl = { getAttribute: k => (k === 'data-action' ? action : (attrs && k in attrs ? attrs[k] : null)) };
  clickHandlers.forEach(h => h({ target: { closest: () => fakeEl } }));
}
function starsOf(tid){
  const s = store['grammar_stars_v1'];
  return s ? (JSON.parse(s)[tid] || 0) : 0;
}
// 成功标记：题目被判定为答对的渲染特征
// 选择/找错成功会写进 app._html（option correct / fix-word fixed）；
// 拼句（drag）成功只写进 exFeedback 元素的 className（feedback show ok），不在 app._html 里。
function solvedNow(){
  const h = elements['app']._html || '';
  const fb = elements['exFeedback'];
  const fbCls = (fb && fb.className) ? fb.className : '';
  return h.includes('option correct') || h.includes('fix-word fixed') || fbCls.includes('show ok');
}

let pass=0, fail=0; const fails=[];
for (const stage of GD.curriculum) {
  for (const tid of stage.topicIds) {
    const topic = GD.topics[tid];
    if (!topic) { fail++; fails.push('缺失主题 '+tid); continue; }
    fire('go-topic', { 'data-topic': tid });
    fire('set-tab', { 'data-tab': 'practice' });
    const exs = topic.exercises || [];
    for (let i=0; i<exs.length; i++) {
      const ex = exs[i];
    if (elements['exFeedback']) elements['exFeedback'].className = ''; // 清空上一题的成功标记，避免误判
      if (ex.type === 'drag') {
        const used = new Array(ex.tokens.length).fill(false);
        let found=-1, missing=false;
        for (const w of ex.answer) {
          found=-1;
          for (let k=0;k<ex.tokens.length;k++){ if(!used[k] && ex.tokens[k]===w){found=k;break;} }
          if (found<0){ fail++; fails.push(`无解 ${tid}#${i} 词语缺失 ${w}`); missing=true; break; }
          used[found]=true; fire('drag-add', { 'data-id': String(found) });
        }
        if (missing) continue;
        fire('ex-check');
      } else if (ex.type === 'fix') {
        fire('fix-pick', { 'data-idx': String(ex.wrongIndex) });
      } else if (ex.type === 'choice') {
        fire('choice-pick', { 'data-i': String(ex.answer) });
      }
      if (solvedNow()) { pass++; }
      else { fail++; fails.push(`不可做 ${tid}#${i} (${ex.type})`); }
      if (i < exs.length-1) fire('ex-next');
    }
  }
}
console.log(`\n✔ 可做(已答对并标记)题目: ${pass}  ✘ 不可做: ${fail}`);
if (fails.length) { console.log('\n不可做列表(前40):'); fails.slice(0,40).forEach(f=>console.log('  - '+f)); }
else console.log('全部题目均可正常完成并标记答对 ✓');
