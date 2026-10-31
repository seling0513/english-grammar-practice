// 轻量 DOM 桩，验证小喇叭渲染与导航无异常
const fs = require('fs');
const vm = require('vm');

function makeEl() {
  const el = {
    _html: '', _text: '',
    style: {},
    classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);}, contains(c){return this._s.has(c);} },
    setAttribute(k,v){ this['_attr_'+k]=v; },
    getAttribute(k){ return this['_attr_'+k] != null ? this['_attr_'+k] : null; },
    appendChild(){},
    addEventListener(){},
    querySelectorAll(){ return []; }
  };
  Object.defineProperty(el, 'innerHTML', { get(){return this._html;}, set(v){this._html=v;} });
  Object.defineProperty(el, 'textContent', { get(){return this._text;}, set(v){this._text=v;} });
  return el;
}

const elements = {};
['app','breadcrumb','starCount'].forEach(id => elements[id] = makeEl());

const clickHandlers = [];
const document = {
  getElementById: id => elements[id] || (elements[id] = makeEl()),
  createElement: () => makeEl(),
  addEventListener: (ev, fn) => { if (ev === 'click') clickHandlers.push(fn); },
  querySelectorAll: () => [],
  body: { appendChild(){} }
};
const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k,v) => { store[k] = String(v); }
};
const window = {
  speechSynthesis: { getVoices: () => [], speak(){}, cancel(){}, speaking:false }
};

const ctx = { document, window, localStorage, console, SpeechSynthesisUtterance: function(){}, setTimeout };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/data.js','utf8'), ctx, { filename:'data.js' });
vm.runInContext(fs.readFileSync('js/app.js','utf8'), ctx, { filename:'app.js' });

function countSpk(html){ return (html.match(/class="spk/g) || []).length; }
function fire(action, attrs){
  const fakeEl = { getAttribute: k => (k === 'data-action' ? action : (attrs && attrs[k] != null ? attrs[k] : null)) };
  const ev = { target: { closest: () => fakeEl } };
  clickHandlers.forEach(h => h(ev));
}

console.log('首页 spk 按钮数:', countSpk(elements.app.innerHTML));

// 进入第一个主题（学一学）
const firstTopic = ctx.GRAMMAR_DATA.curriculum[0].topicIds[0];
fire('go-topic', { 'data-topic': firstTopic });
console.log('主题(学) spk 按钮数:', countSpk(elements.app.innerHTML));

// 切到练一练
fire('set-tab', { 'data-tab': 'practice' });
console.log('主题(练) spk 按钮数:', countSpk(elements.app.innerHTML));

// 进入易混淆馆第一张
fire('go-confusables');
const firstCf = ctx.GRAMMAR_DATA.confusables[0].id;
fire('go-confusable', { 'data-id': firstCf });
console.log('易混淆 spk 按钮数:', countSpk(elements.app.innerHTML));

// 模拟点击一个小喇叭（应为 speak 动作且不报错）
fire('speak', { 'data-text': 'I am a cat.', 'data-lang': 'en-US' });
console.log('speak 点击无异常 ✓');

console.log('全部渲染通过 ✓');
