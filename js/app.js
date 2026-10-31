/* ===========================================================
   英语语法学与练 —— 应用逻辑
   导航：首页(森林) › 阶段 › 主题(学/练) ；首页 › 易混淆馆 › 对比
   特色：儿童女生语音朗读（整块读）、做题自动读题、点选项发声+对错音效
   =========================================================== */
(function () {
  'use strict';

  const D = GRAMMAR_DATA;
  const $app = document.getElementById('app');
  const $bc = document.getElementById('breadcrumb');
  const $star = document.getElementById('starCount');

  /* ---------------- 进度存储 ---------------- */
  const STARS_KEY = 'grammar_stars_v1';
  const CF_KEY = 'grammar_cf_v1';
  let stars = loadJSON(STARS_KEY, {});
  let cfDone = loadJSON(CF_KEY, {});
  const exAwarded = {};

  let audioCtx = null;
  let spokenKey = '';

  function loadJSON(k, def) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }
  function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* ---------------- 应用状态 ---------------- */
  const app = {
    view: 'home', topicId: null, topicTab: 'learn',
    exIndex: 0, exState: null, confusableId: null, cfIndex: 0, cfState: null
  };

  /* ---------------- 工具函数 ---------------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function roleColor(role) { const r = ROLE_LEGEND.find(x => x.role === role); return r ? r.color : '#9aa0a6'; }
  function roleLabel(role) { const r = ROLE_LEGEND.find(x => x.role === role); return r ? r.label : '其他'; }
  function arraysEqual(a, b) { if (a.length !== b.length) return false; for (let i=0;i<a.length;i++) if (a[i]!==b[i]) return false; return true; }
  function totalStars() { return Object.values(stars).reduce((s,n)=>s+(n||0),0); }
  function topicStars(id) { return stars[id] || 0; }
  function addStar(id) { const cur = stars[id]||0; if (cur<3){ stars[id]=cur+1; saveJSON(STARS_KEY,stars);} refreshStars(); }
  function refreshStars() { if ($star) $star.textContent = totalStars(); }
  function findStageOfTopic(id) { return D.curriculum.find(s => s.topicIds.includes(id)); }

  /* ---------------- 语音朗读（本地 MP3 · 温柔女声，不用浏览器 TTS） ---------------- */
  function detectLang(text) {
    let cjk=0, latin=0;
    for (const ch of String(text)) {
      if (/[\u3400-\u9FFF\uF900-\uFAFF]/.test(ch)) cjk++;
      else if (/[a-zA-Z]/.test(ch)) latin++;
    }
    return cjk >= latin ? 'zh-CN' : 'en-US';
  }
  // 归一化：与生成脚本 tools/gen_audio.py 完全一致
  function normText(text){
    return String(text==null?'':text)
      .replace(/\s+/g,' ')
      .replace(/([，。、；：！？])\1+/g,'$1')
      .replace(/([；：])，/g,'$1')
      .replace(/，([；：])/g,'$1')
      .replace(/([！？])。/g,'$1')
      .trim();
  }
  // FNV-1a 32bit，与生成脚本一致
  function hashText(str){
    let h = 0x811c9dc5;
    if (typeof TextEncoder !== 'undefined') {
      const bytes = new TextEncoder().encode(str);
      for (let i=0;i<bytes.length;i++){ h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    } else {
      for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i) & 0xff; h = Math.imul(h, 0x01000193) >>> 0; }
    }
    return ('00000000'+h.toString(16)).slice(-8);
  }
  function audioSrc(text, lang){
    const t = normText(text); if (!t) return '';
    return 'audio/' + hashText((lang||detectLang(t)) + '|' + t) + '.mp3';
  }
  // 整块内容一个喇叭：读完整段文字
  function spkBlock(text, lang) {
    const t = normText(text);
    return `<span class="spk block-spk" data-action="speak" data-lang="${lang||''}" data-text="${esc(t)}" title="点我读出来 🔊" role="button">🔊 听一听</span>`;
  }

  let curAudio = null, wordSeq = 0;
  function stopAudio(){
    wordSeq++;
    if (curAudio){ try { curAudio.pause(); } catch(e){} curAudio = null; }
    document.querySelectorAll('.spk.speaking').forEach(b=>b.classList.remove('speaking'));
  }
  // 播放单个 MP3；失败（缺文件/被拦截）时回调 onFail
  function playFile(src, btn, onEnd, onFail){
    if (!src) { if (onFail) onFail(); return; }
    const a = new Audio(src);
    curAudio = a;
    let done = false;
    const finish = ok => {
      if (done) return; done = true;
      if (curAudio === a) curAudio = null;
      if (btn) btn.classList.remove('speaking');
      if (ok && onEnd) onEnd();
      if (!ok && onFail) onFail();
    };
    a.onended = () => finish(true);
    a.onerror = () => finish(false);
    if (btn) btn.classList.add('speaking');
    const p = a.play();
    if (p && p.catch) p.catch(() => finish(false));
  }
  function speak(text, lang, btn){
    stopAudio();
    const t = normText(text); if (!t) return;
    playFile(audioSrc(t, lang||detectLang(t)), btn, null, null);
  }
  // 拼句：整句有音频读整句，否则逐词读（跳过纯标点）
  function speakWords(words, btn, fullText){
    stopAudio();
    const seq = ++wordSeq;
    const list = words.filter(w => /[A-Za-z0-9\u3400-\u9FFF]/.test(w));
    const startWords = () => {
      if (seq !== wordSeq) return;
      let i = 0;
      const step = () => {
        if (seq !== wordSeq) return;
        if (i >= list.length){ if (btn) btn.classList.remove('speaking'); return; }
        const w = list[i++];
        const a = new Audio(audioSrc(w,'en-US'));
        curAudio = a;
        let done = false;
        const next = () => { if (done) return; done = true; step(); };
        a.onended = next; a.onerror = next;
        const p = a.play(); if (p && p.catch) p.catch(next);
      };
      step();
    };
    if (fullText) playFile(audioSrc(fullText,'en-US'), btn, null, startWords);
    else startWords();
  }
  function playTone(kind) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = 'sine'; o.frequency.value = kind === 'ok' ? 880 : 233;
      const t0 = audioCtx.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.start(t0); o.stop(t0 + 0.32);
    } catch (e) {}
  }

  /* ---------------- 庆祝动画 ---------------- */
  function celebrate() {
    let box = document.getElementById('celebrate');
    if (!box) { box = document.createElement('div'); box.id='celebrate'; document.body.appendChild(box); }
    box.innerHTML = '';
    const colors = ['#4f9dff','#ff6b9d','#34c759','#ff9f43','#9b6bff','#ffd23f'];
    for (let i=0;i<28;i++){
      const c=document.createElement('div'); c.className='confetti';
      c.style.left=Math.random()*100+'vw'; c.style.background=colors[i%colors.length];
      c.style.animationDelay=(Math.random()*0.4)+'s'; box.appendChild(c);
    }
    const badge=document.createElement('div'); badge.className='celeb-badge';
    badge.innerHTML='<div class="big">🎉</div><div class="txt">太棒啦！⭐ +1</div>';
    box.appendChild(badge); box.classList.add('show');
    setTimeout(()=>box.classList.remove('show'),1500);
  }

  /* ---------------- 导航 ---------------- */
  function scrollTop() {
    try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); }
    catch (e) { try { window.scrollTo(0, 0); } catch (e2) {} }
  }
  function goHome() { app.view='home'; app.topicId=null; app.confusableId=null; render(); }
  function goConfusables() { app.view='confusables'; app.confusableId=null; render(); }
  function goTopic(id) { app.view='topic'; app.topicId=id; app.topicTab='learn'; app.exIndex=0; app.exState=null; render(); }
  function goConfusable(id) { app.view='confusable'; app.confusableId=id; app.cfIndex=0; app.cfState=null; render(); }

  function setBreadcrumb(crumbs) {
    $bc.innerHTML = crumbs.map((c,i)=>{
      const sep = i>0?'<span class="sep">›</span>':'';
      if (c.action) return sep+`<span class="crumb" data-action="${c.action}">${esc(c.label)}</span>`;
      return sep+`<span>${esc(c.label)}</span>`;
    }).join('');
  }

  /* =========================================================
     首页（森林 + 树木）
     ========================================================= */
  function renderHome() {
    const c = D.concept, s = D.spine;
    let html='';
    html += `<section class="card hero">
      <h2>🌍 ${esc(c.title)} ${spkBlock(c.title+'。'+c.lines.join('。'), 'zh-CN')}</h2>
      <ul class="lines">${c.lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>
    </section>`;

    html += `<section class="card">
      <h2>🍞 ${esc(s.title)} ${spkBlock(s.title+'。'+s.desc+'。'+s.steps.map(x=>x.name+'：'+x.sub).join('。'), 'zh-CN')}</h2>
      <p class="spine-desc">${esc(s.desc)}</p>
      <div class="spine-steps">${s.steps.map(st=>`
        <div class="spine-step"><div class="em">${st.emoji}</div><div class="nm">${esc(st.name)}</div><div class="sb">${esc(st.sub)}</div></div>`).join('')}</div>
    </section>`;

    html += `<div class="quick-row">
      <button class="quick-btn" data-action="go-confusables">🆚 易混淆对比馆</button>
      <button class="quick-btn alt" data-action="toggle-method">📘 学习方法说明</button>
    </div>`;

    html += `<section class="card" id="methodPanel" style="display:none;">
      <h2>📘 ${esc(D.method.title)} ${spkBlock(D.method.title+'。'+D.method.points.map(p=>p.title+'：'+p.desc).join('。'), 'zh-CN')}</h2>
      <div class="method-grid">${D.method.points.map(p=>`
        <div class="method-item"><div class="mi">${p.icon}</div><div class="mt">${esc(p.title)}</div><div class="md">${esc(p.desc)}</div></div>`).join('')}</div>
    </section>`;

    D.curriculum.forEach(stage => {
      const famEmoji = stage.family.indexOf('词法')>-1?'🔤':stage.family.indexOf('时态')>-1?'⏱️':stage.family.indexOf('句法')>-1?'🏗️':'🧩';
      html += `<section class="card">
        <div class="stage-head"><span class="em">${famEmoji}</span><span class="nm">${esc(stage.name)}</span><span class="fam">${esc(stage.family)}</span></div>
        <div class="topic-grid">${stage.topicIds.map(id=>{
          const t=D.topics[id]; const st=topicStars(id);
          const starsStr = st>0?'⭐'.repeat(st)+'☆'.repeat(3-st):'☆☆☆';
          return `<div class="topic-chip" data-action="go-topic" data-topic="${id}">
            <div class="em">${t.emoji}</div><div class="tt">${esc(t.title)}</div><div class="st">${starsStr}</div></div>`;
        }).join('')}</div>
      </section>`;
    });

    $app.innerHTML = html;
    setBreadcrumb([{label:'首页'}]);
    refreshStars();
  }

  /* =========================================================
     主题页（学 / 练）
     ========================================================= */
  function renderTopic() {
    const t = D.topics[app.topicId];
    const stage = findStageOfTopic(t.id);
    if (!t) { goHome(); return; }
    let html='';
    html += `<div class="topic-head"><span class="em">${t.emoji}</span><div>
      <div class="tt">${esc(t.title)}</div><div class="meta">适合年龄：${esc(t.age)}</div></div></div>`;
    html += `<div class="position-pill">📍 语法地图：${esc(stage.name)} → ${esc(t.title)}</div>`;
    html += `<div class="tabs">
      <button class="tab ${app.topicTab==='learn'?'active':''}" data-action="set-tab" data-tab="learn">📖 学一学</button>
      <button class="tab ${app.topicTab==='practice'?'active':''}" data-action="set-tab" data-tab="practice">🎮 练一练</button>
    </div>`;
    html += app.topicTab==='learn'?renderLearn(t):renderPractice(t);
    $app.innerHTML = html;
    setBreadcrumb([{label:'首页',action:'go-home'},{label:stage.name,action:'go-home'},{label:t.title}]);
    refreshStars();
    scrollTop();   // 进入板块/切题一律置顶
  }

  function renderLearn(t) {
    const storyText = t.story.text;
    const storyHtml = t.story.text.split('\n').map(par=>{
      let p=esc(par); const plain=par;
      (t.story.marks||[]).forEach(m=>{ p=p.split(m).join(`<mark>${esc(m)}</mark>`); });
      return `<p>${p}</p>`;
    }).join('');
    const storyCard = `<section class="card story">
      ${spkBlock(t.story.title?('故事：'+t.story.title+'。'+storyText):storyText, 'zh-CN')}
      <h3>📚 故事时间</h3>${storyHtml}</section>`;

    const chantTxt = t.chant.title+'。'+t.chant.lines.join('，');
    const chantCard = `<div class="chant">
      ${spkBlock(chantTxt,'zh-CN')}
      <h3>🎵 ${esc(t.chant.title)}</h3>${t.chant.lines.map(l=>`<div class="line">${esc(l)}</div>`).join('')}</div>`;

    const cmp = t.compare||{title:'🀄 和中文比一比',text:''};
    const cmpCard = `<div class="compare">
      ${spkBlock(cmp.title+'。'+cmp.text,'zh-CN')}
      <h3>${esc(cmp.title)}</h3>${cmp.text.split('\n').map(l=>`<div class="line">${esc(l)}</div>`).join('')}</div>`;

    const legend = `<div class="legend">${ROLE_LEGEND.map(r=>`<span class="lg"><span class="sw" style="background:${r.color}"></span>${esc(r.label)}</span>`).join('')}</div>`;
    const blockLines = t.blocks.map(b=>{
      const chips=b.sentence.map(w=>`<span class="chip" style="background:${roleColor(w.role)}" title="${esc(roleLabel(w.role))}">${esc(w.t)}</span>`).join('');
      return `<div class="block-line">${chips}</div>`;
    }).join('');
    const blockSpeech = t.blocks.map(b=>b.sentence.map(w=>w.t).join(' ')).join('。 ');
    const blocksCard = `<section class="card">
      ${spkBlock(blockSpeech,'en-US')}
      <h2>🧱 彩色语法积木</h2>${legend}${blockLines}</section>`;

    const ruleCard = t.rule ? `<section class="card rule">
      ${spkBlock('规则小课堂。'+t.rule,'zh-CN')}
      <h2>📐 规则小课堂</h2><div class="rule-text">${t.rule.split('\n').map(l=>`<div class="line">${esc(l)}</div>`).join('')}</div></section>` : '';

    return storyCard + chantCard + cmpCard + blocksCard + ruleCard;
  }

  /* ---------------- 练习状态 ---------------- */
  function ensureExState(t) {
    const ex = t.exercises[app.exIndex];
    if (app.exState && app.exState.topicId===t.id && app.exState.exIndex===app.exIndex) return;
    const st = { topicId:t.id, exIndex:app.exIndex, type:ex.type, awarded:false, instruction:ex.instruction };
    if (ex.type==='drag') { st.tray=ex.tokens.map((tk,i)=>({id:i,t:tk})); st.sentence=[]; st.answer=ex.answer.slice(); }
    else if (ex.type==='fix') { st.sentence=ex.sentence.slice(); st.wrongIndex=ex.wrongIndex; st.correctWord=ex.correctWord; st.tip=ex.tip; st.solved=false; st.shownCorrect=false; }
    else if (ex.type==='choice') { st.q=ex.q; st.options=ex.options.slice(); st.answer=ex.answer; st.explain=ex.explain; st.picked=null; st.solved=false; }
    st.awarded = !!exAwarded[`${t.id}#${app.exIndex}`];
    app.exState = st;
  }

  function renderPractice(t) {
    ensureExState(t);
    const st = app.exState;
    const total = t.exercises.length;
    const dots = t.exercises.map((_,i)=>`<span class="dot ${i===app.exIndex?'cur':(i<app.exIndex?'done':'')}"></span>`).join('');
    let body='';
    if (st.type==='drag') body=renderDrag(st);
    else if (st.type==='fix') body=renderFix(st);
    else if (st.type==='choice') body=renderChoiceBlock(st.q, st.options, st.picked, st.solved, st.answer, st.explain);

    const isLast = app.exIndex===total-1;
    const nav = `<div class="btn-row">
      <button class="btn ghost" data-action="ex-prev" ${app.exIndex===0?'disabled':''}>← 上一题</button>
      ${isLast?`<button class="btn" data-action="finish-topic">🎉 完成本关</button>`:`<button class="btn" data-action="ex-next">下一题 →</button>`}
    </div>`;

    let speakTxt = (st.instruction ? st.instruction + '。' : '') + (st.q ? st.q : '');
    if (!speakTxt && st.type === 'fix') speakTxt = st.sentence.join(' ');
    const speakLang = speakTxt ? detectLang(speakTxt) : 'zh-CN';
    let html = `<section class="card">
      <div class="ex-head"><h2>🎮 练一练</h2><div class="ex-progress">第 ${app.exIndex+1} / ${total} 题 ${dots}</div></div>
      <div class="ex-speakrow">${spkBlock(speakTxt, speakLang)}</div>
      ${st.instruction?`<div class="ex-instruction">${esc(st.instruction)}</div>`:''}
      ${body}
      <div class="feedback" id="exFeedback"></div>
      ${nav}
    </section>`;

    $app.innerHTML = html;
    // 进入新题目时自动读题（本地温柔女声 MP3）
    const key = t.id+'#'+app.exIndex;
    if (key !== spokenKey) { spokenKey = key; if (speakTxt) speak(speakTxt, speakLang); }
    setBreadcrumb([{label:'首页',action:'go-home'},{label:findStageOfTopic(t.id).name,action:'go-home'},{label:t.title,action:'go-topic', action_topic:t.id}]);
    refreshStars();
    return html;
  }

  function renderDrag(st) {
    const tray = st.tray.map(o=>`<span class="chip tray" style="background:${roleColor('noun')}" data-action="drag-add" data-id="${o.id}">${esc(o.t)}</span>`).join('');
    const line = st.sentence.length ? st.sentence.map(o=>`<span class="chip" style="background:${roleColor('subject')}" data-action="drag-remove" data-id="${o.id}">${esc(o.t)}</span>`).join('') : `<span class="placeholder">↩ 点下面的词语放进句子里（再点句子里的词可拿回来）</span>`;
    return `<div class="sentence-line" id="dragLine">${line}</div>
      <div class="spk-row"><span class="spk block-spk" data-action="speak-built" title="听一听你拼的句子">🔊 听一听这句话</span></div>
      <p style="font-weight:700;margin:6px 0;">词语宝宝：</p>
      <div class="ex-tray">${tray||'<span class="placeholder">都放进去啦～</span>'}</div>
      <div class="btn-row"><button class="btn" data-action="ex-check">✓ 检查句子</button></div>`;
  }

  function renderFix(st) {
    const words = st.sentence.map((w,i)=>{
      let cls='fix-word', txt=w;
      if (st.shownCorrect && i===st.wrongIndex){ cls+=' fixed'; txt=st.correctWord; }
      return `<span class="${cls}" data-action="fix-pick" data-idx="${i}">${esc(txt)}</span>`;
    }).join('');
    return `<div class="fix-line">${words}</div>
      <div class="spk-row"><span class="spk block-spk" data-action="speak-fix" title="听一听这句话">🔊 听一听</span></div>
      <p style="font-size:14px;color:var(--ink-soft);">👆 点一点你觉得错的那一个词</p>`;
  }

  function renderChoiceBlock(q, options, picked, solved, answer, explain) {
    const opts = options.map((o,i)=>{
      let cls='option';
      if (solved){ if(i===answer) cls+=' correct'; else if(i===picked) cls+=' wrong'; cls+=' disabled'; }
      return `<button class="${cls}" data-action="choice-pick" data-i="${i}">${esc(o)}</button>`;
    }).join('');
    const exp = solved?`<div class="feedback ok show">✅ ${esc(explain)}</div>`:'';
    return `<p style="font-weight:700;font-size:17px;">${esc(q)}</p><div class="options">${opts}</div>${exp}`;
  }

  /* =========================================================
     易混淆馆
     ========================================================= */
  function renderConfusables() {
    let html = `<section class="card"><h2>🆚 易混淆对比馆</h2>
      <p>这些“长得像、容易搞混”的语法点，专门并排比一比、练一练。</p>
      <div class="conf-grid">${D.confusables.map(c=>`
        <div class="conf-card" data-action="go-confusable" data-id="${c.id}">
          <div class="em">${c.emoji}</div><div class="tt">${esc(c.title)}</div>
          ${cfDone[c.id]?'<div class="done">✅ 已通关</div>':'<div class="done" style="color:#9aa0a6">未通关</div>'}
        </div>`).join('')}</div></section>`;
    $app.innerHTML = html;
    setBreadcrumb([{label:'首页',action:'go-home'},{label:'易混淆馆'}]);
    refreshStars();
  }

  function renderConfusable() {
    const c = D.confusables.find(x=>x.id===app.confusableId);
    if (!c) { goConfusables(); return; }
    if (!app.cfState || app.cfState.id!==c.id) app.cfState={id:c.id,index:app.cfIndex,picked:null,solved:false};
    const q = c.quizzes[app.cfState.index];
    const pairs = c.pairs.map(p=>{
      const txt = p.name+'。'+p.def+'。'+p.example;
      return `<div class="pair-card">${spkBlock(txt, detectLang(txt))}
        <div class="pn">${esc(p.name)}</div><div class="pd">${esc(p.def)}</div><div class="pe">${esc(p.example)}</div></div>`;
    }).join('');
    const tipTxt = '怎么区分。'+c.tip;
    const nav = `<div class="btn-row">
      <button class="btn ghost" data-action="cf-prev" ${app.cfState.index===0?'disabled':''}>← 上一题</button>
      ${app.cfState.index===c.quizzes.length-1?`<button class="btn" data-action="cf-finish">🎉 完成</button>`:`<button class="btn" data-action="cf-next">下一题 →</button>`}
    </div>`;
    const body = renderChoiceBlock(q.q, q.options, app.cfState.picked, app.cfState.solved, q.answer, q.explain);
    let html = `<section class="card"><h2>${c.emoji} ${esc(c.title)}</h2>${pairs}
      <div class="compare">${spkBlock(tipTxt,'zh-CN')}<h3>💡 怎么区分</h3><div class="line">${esc(c.tip)}</div></div></section>
      <section class="card"><div class="ex-head"><h2>🔍 火眼金睛</h2><div class="ex-progress">第 ${app.cfState.index+1} / ${c.quizzes.length} 题</div></div>
      <div class="ex-speakrow">${spkBlock(q.q, detectLang(q.q))}</div>
      ${body}<div class="feedback" id="exFeedback"></div>${nav}</section>`;
    $app.innerHTML = html;
    setBreadcrumb([{label:'首页',action:'go-home'},{label:'易混淆馆',action:'go-confusables'},{label:c.title}]);
    refreshStars();
  }

  /* =========================================================
     事件处理（统一委托）
     ========================================================= */
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const act = el.getAttribute('data-action');
    const fb = () => document.getElementById('exFeedback');

    switch (act) {
      case 'go-home': goHome(); break;
      case 'go-confusables': goConfusables(); break;
      case 'go-topic': goTopic(el.getAttribute('data-topic')); break;
      case 'go-confusable': goConfusable(el.getAttribute('data-id')); break;

      /* ---- 小喇叭朗读（整块读 · 本地 MP3） ---- */
      case 'speak': {
        const b = el;
        if (b.classList.contains('speaking')) { stopAudio(); break; }
        speak(b.getAttribute('data-text'), b.getAttribute('data-lang')||undefined, b);
        break;
      }
      case 'speak-built': {
        const st=app.exState; const words=st.sentence.map(o=>o.t);
        if(!words.length){ showFeedback('gentle','先放几个词进去，再听一听～'); break; }
        speakWords(words, el, words.join(' ')); break;
      }
      case 'speak-fix': {
        const st=app.exState; const txt=st.sentence.map((w,i)=>(i===st.wrongIndex&&st.shownCorrect)?st.correctWord:w).join(' ');
        speak(txt,'en-US',el); break;
      }

      case 'toggle-method': { const p=document.getElementById('methodPanel'); if(p) p.style.display=p.style.display==='none'?'block':'none'; break; }
      case 'set-tab': app.topicTab=el.getAttribute('data-tab'); app.exIndex=0; app.exState=null; renderTopic(); break;

      /* ---- 拼句 ---- */
      case 'drag-add': {
        const st=app.exState; const id=Number(el.getAttribute('data-id'));
        const i=st.tray.findIndex(o=>o.id===id);
        if(i>-1){ st.sentence.push(st.tray.splice(i,1)[0]); renderPractice(D.topics[st.topicId]); }
        break;
      }
      case 'drag-remove': {
        const st=app.exState; const id=Number(el.getAttribute('data-id'));
        const i=st.sentence.findIndex(o=>o.id===id);
        if(i>-1){ st.tray.push(st.sentence.splice(i,1)[0]); renderPractice(D.topics[st.topicId]); }
        break;
      }
      case 'ex-check': {
        const st=app.exState; const got=st.sentence.map(o=>o.t);
        if(got.length===0){ showFeedback('gentle','先把词语放进去吧～'); break; }
        if(arraysEqual(got,st.answer)){
          if(!st.awarded){ st.awarded=true; exAwarded[`${st.topicId}#${app.exIndex}`]=true; addStar(st.topicId); celebrate(); playTone('ok'); }
          showFeedback('ok','🎉 完全正确！你拼好了一个完整的句子！');
        } else { showFeedback('gentle','再试试看～ 提示：按 主语 → 动词 → 宾语 的顺序排一排。'); }
        break;
      }

      /* ---- 找错 ---- */
      case 'fix-pick': {
        const st=app.exState; if(st.solved) break;
        const idx=Number(el.getAttribute('data-idx'));
        if(idx===st.wrongIndex){
          st.solved=true; st.shownCorrect=true;
          if(!st.awarded){ st.awarded=true; exAwarded[`${st.topicId}#${app.exIndex}`]=true; addStar(st.topicId); celebrate(); playTone('ok'); }
          renderPractice(D.topics[st.topicId]);
          setTimeout(()=>showFeedback('tip','💡 '+st.tip),30);
        } else { playTone('wrong'); showFeedback('gentle','这个词没问题哦，再找找别的～'); }
        break;
      }

      /* ---- 选择 ---- */
      case 'choice-pick': {
        const st=app.exState; if(st.solved) break;
        const i=Number(el.getAttribute('data-i'));
        const pickedWord = st.options[i];
        st.picked=i; st.solved=(i===st.answer);
        speak(pickedWord, detectLang(pickedWord), null); // 点选项发声
        if(st.solved){ if(!st.awarded){ st.awarded=true; exAwarded[`${st.topicId}#${app.exIndex}`]=true; addStar(st.topicId); celebrate(); } playTone('ok'); }
        else { playTone('wrong'); }
        renderPractice(D.topics[st.topicId]);
        if(!st.solved) setTimeout(()=>showFeedback('gentle','再想想～ 看看正确答案和解释。'),30);
        break;
      }

      case 'ex-prev': if(app.exIndex>0){ app.exIndex--; app.exState=null; renderTopic(); } break;
      case 'ex-next': if(app.exIndex<D.topics[app.topicId].exercises.length-1){ app.exIndex++; app.exState=null; renderTopic(); } break;
      case 'finish-topic': celebrate(); setTimeout(goHome,700); break;

      /* ---- 易混淆 ---- */
      case 'cf-prev': if(app.cfIndex>0){ app.cfIndex--; app.cfState=null; renderConfusable(); } break;
      case 'cf-next': { const c=D.confusables.find(x=>x.id===app.confusableId); if(app.cfIndex<c.quizzes.length-1){ app.cfIndex++; app.cfState=null; renderConfusable(); } break; }
      case 'cf-finish': { cfDone[app.confusableId]=true; saveJSON(CF_KEY,cfDone); celebrate(); setTimeout(goConfusables,800); break; }
      case 'cf-pick': {
        const st=app.cfState; if(st.solved) break;
        const i=Number(el.getAttribute('data-i'));
        const c=D.confusables.find(x=>x.id===app.confusableId);
        st.picked=i; st.solved=(i===c.quizzes[st.index].answer);
        speak(c.quizzes[st.index].options[i], detectLang(c.quizzes[st.index].options[i]), null);
        if(st.solved){ cfDone[app.confusableId]=true; saveJSON(CF_KEY,cfDone); celebrate(); playTone('ok'); }
        else playTone('wrong');
        renderConfusable();
        break;
      }
    }
  });

  function showFeedback(kind,msg){ const f=document.getElementById('exFeedback'); if(!f) return; f.className='feedback show '+kind; f.textContent=msg; }

  /* ---------------- 启动 ---------------- */
  function render() {
    stopAudio();
    if (app.view==='home') renderHome();
    else if (app.view==='topic') renderTopic();
    else if (app.view==='confusables') renderConfusables();
    else if (app.view==='confusable') renderConfusable();
    scrollTop();
  }

  refreshStars();
  render();
})();
