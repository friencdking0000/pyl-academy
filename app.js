/* pyl Academy v2 — 教室版:每支程式一堂課(程式逐段高亮 + 字幕旁白 + 操作面板) */
(function () {
  "use strict";
  var D = window.SITE_DATA || { courses: [] };
  var main = document.getElementById("main");
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function attr(s) { return esc(s).replace(/"/g, "&quot;"); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var MATH_RE = /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?![\s$])[^$\n]+?\$/g;
  var CODE_RE = /(^|\n)(```+|~~~)[\s\S]*?\n\2[^\n]*|`[^`\n]+`/g;
  function md(t, br) {
    if (!t) return "";
    var codes = [], maths = [];
    var s = String(t).replace(CODE_RE, function (m) { codes.push(m); return "@@CODE" + (codes.length - 1) + "@@"; });
    s = s.replace(MATH_RE, function (m) { maths.push(m); return "@@MATH" + (maths.length - 1) + "@@"; });
    s = s.replace(/@@CODE(\d+)@@/g, function (_, i) { return codes[+i]; });
    var html = null;
    try { html = marked.parse(s, br ? { breaks: true } : undefined); } catch (e) {}
    if (html === null) html = "<pre>" + esc(s) + "</pre>";
    return html.replace(/@@MATH(\d+)@@/g, function (_, i) { return esc(maths[+i]); });
  }
  function inl(t) { return md(t).replace(/^<p>|<\/p>\s*$/g, ""); }
  // MathJax(670KB)只有內容裡真的有公式才下載
  var mathP = null;
  function loadMath() {
    if (mathP) return mathP;
    mathP = new Promise(function (res) {
      var sc = document.createElement("script"); sc.src = window.PYL_MATHJAX || "mathjax-tex-svg.js"; sc.async = true;
      sc.onload = function () { (window.MathJax && MathJax.startup && MathJax.startup.promise || Promise.resolve()).then(res, res); };
      sc.onerror = function () { res(); };
      document.head.appendChild(sc);
    });
    return mathP;
  }
  function typeset(el) {
    if (!el || !/\$[^$\s]|\\\(|\\\[/.test(el.textContent || "")) return Promise.resolve();
    return loadMath().then(function () { try { if (window.MathJax && MathJax.typesetPromise) return MathJax.typesetPromise([el]).catch(function () {}); } catch (e) {} });
  }

  /* ---------- 分檔載入:開站只有目錄,課程內容點進去才下載 ---------- */
  var DATA_BASE = window.PYL_DATA_BASE || "", chunkP = {};
  function idle(fn) { (window.requestIdleCallback || function (f) { return setTimeout(f, 1200); })(fn); }
  function loadChunk(id) {
    if (chunkP[id]) return chunkP[id];
    return (chunkP[id] = new Promise(function (res, rej) {
      var sc = document.createElement("script"); sc.src = DATA_BASE + encodeURIComponent(id) + ".js?v=" + (D.ver || "");
      sc.onload = function () { res(); };
      sc.onerror = function () { delete chunkP[id]; rej(new Error("載入失敗")); };
      document.head.appendChild(sc);
    }));
  }
  window.PYL_CHUNK = function (id, ch) {
    if (id === "_terms") { D.pyterms = ch.pyterms || {}; D.pykinds = ch.pykinds; KINDS = (ch.pykinds && ch.pykinds.kinds) || []; TERMS = D.pyterms; return; }
    var c = byId(id); if (!c || !c._lite) return;
    (c.notes || []).forEach(function (n, i) { n.content = ch.notes[i] || ""; });
    c.steps.forEach(function (st, si) {
      st.problems = ch.problems[si] || [];
      (st.code || []).forEach(function (f) { var b = ch.code[f.path]; if (b) for (var k in b) f[k] = b[k]; });
    });
    c._lite = false;
  };
  function ensure(cid) {
    var c = byId(cid); if (!c) return Promise.resolve();
    var ps = [];
    if (c._lite) ps.push(loadChunk(cid));
    if (hasBd(c) && !KINDS.length && D.nkinds) ps.push(loadChunk("_terms"));
    return Promise.all(ps);
  }
  function ensureAll() { return Promise.all(D.courses.map(function (c) { return ensure(c.id); })); }
  function segN(f) { return f.lesson.segments ? f.lesson.segments.length : (f.lesson.n || 0); }
  function byId(id) { for (var i = 0; i < D.courses.length; i++) if (D.courses[i].id === id) return D.courses[i]; return null; }
  function copyText(t, btn) {
    function ok() { if (btn) { var o = btn.textContent; btn.textContent = "✔ 已複製"; setTimeout(function () { btn.textContent = o; }, 1300); } }
    function fb() { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); ok(); } catch (e) {} document.body.removeChild(ta); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fb); else fb();
  }
  function dayOf(title) { var m = title.match(/^Day(\d+)/); return m ? m[1] : null; }
  function fixBadge(f) { return f.origPath ? '<span class="tag fix">✅ 修正版</span>' : (f.fixedPath ? '<span class="tag bad">⚠️ 錯誤示範</span>' : ""); }
  function fixIcon(f) { return f.origPath ? "✅" : (f.fixedPath ? "⚠️" : ""); }
  function lessonsOf(s) { return (s.code || []).filter(function (f) { return f.lesson; }); }

  /* ---------- 主題 ---------- */
  var themeBtn = $("#theme-btn");
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("pyl_theme", t); } catch (e) {}
    themeBtn.textContent = t === "dark" ? "☀️" : "🌙";
    themeBtn.title = t === "dark" ? "切換成白底淺色" : "切換成黑紅金深色";
  }
  setTheme(document.documentElement.getAttribute("data-theme") || "dark");
  themeBtn.onclick = function () { setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"); };

  /* ---------- 進度 ---------- */
  var PKEY = "pyl_prog_v1", QKEY = "pyl_prob_v1", LKEY = "pyl_lc_v1", WKEY = "pyl_lesson_v2", LASTKEY = "pyl_last_v2";
  function isDone(cid, i) { var p = lsGet(PKEY, {}); return !!(p[cid] && p[cid][i]); }
  function setDone(cid, i, v) { var p = lsGet(PKEY, {}); p[cid] = p[cid] || {}; if (v) p[cid][i] = 1; else delete p[cid][i]; lsSet(PKEY, p); }
  function courseProg(c) { var t = c.steps.length, d = 0; for (var i = 0; i < t; i++) if (isDone(c.id, i)) d++; return { done: d, total: t, pct: t ? Math.round(d / t * 100) : 0 }; }
  function lessonState(path) { return lsGet(WKEY, {})[path] || { seen: 0, done: false }; }
  function saveLesson(path, st) { var w = lsGet(WKEY, {}); w[path] = st; lsSet(WKEY, w); }
  function allProgress() { var t = 0, d = 0; D.courses.forEach(function (c) { var p = courseProg(c); t += p.total; d += p.done; }); return { t: t, d: d, pct: t ? Math.round(d / t * 100) : 0 }; }
  function updatePill() { var a = allProgress(); $("#prog-pill").textContent = "進度 " + a.d + "/" + a.t; }
  function probGot(cid, pid) { var p = lsGet(QKEY, {}); return !!(p[cid] && p[cid][pid]); }
  function setProbGot(cid, pid, v) { var p = lsGet(QKEY, {}); p[cid] = p[cid] || {}; if (v) p[cid][pid] = 1; else delete p[cid][pid]; lsSet(QKEY, p); }
  function allProblems(c) { var o = []; c.steps.forEach(function (s, si) { (s.problems || []).forEach(function (p) { o.push({ p: p, si: si }); }); }); return o; }

  /* ---------- 燈箱 / 抽屜 ---------- */
  var lb = $("#lightbox");
  lb.onclick = function () { lb.classList.add("hidden"); };
  main.addEventListener("click", function (e) {
    var im = e.target.closest(".md img"); if (!im) return;
    $("#lb-img").src = im.src; $("#lb-cap").textContent = im.alt || ""; lb.classList.remove("hidden");
  });
  var drawer = $("#drawer");
  drawer.onclick = function (e) { if (e.target === drawer) drawer.classList.add("hidden"); };
  $("#nav-btn").onclick = function () {
    if (!drawer.classList.contains("hidden")) { drawer.classList.add("hidden"); return; }
    var ol = $(".outline");
    $("#drawer-in").innerHTML = ol ? ol.innerHTML : drawerMenu();
    drawer.classList.remove("hidden");
  };
  $("#drawer-in").addEventListener("click", function (e) { if (e.target.closest("a")) drawer.classList.add("hidden"); });
  function drawerMenu() {
    return '<a class="oc" href="#/">🏠 首頁</a><a class="oc" href="#/courses">📚 全部課程</a><a class="oc" href="#/lc">🧩 LeetCode 刷題</a>' +
      D.courses.map(function (c) { return '<a class="o-item" href="#/c/' + c.id + '"><span class="ck">•</span>' + esc(c.title) + "</a>"; }).join("");
  }

  /* ---------- 路由 ---------- */
  var search = $("#search");
  function route() {
    stopSpeak();
    drawer.classList.add("hidden");
    document.body.classList.remove("in-room");
    main.classList.remove("full");
    var h = location.hash || "#/", m, r = "home";
    var need = h.match(/^#\/(?:learn|read|practice|quiz|words|c)\/([^/]+)/);
    if (need) {
      var nc = byId(decodeURIComponent(need[1]));
      if (nc && (nc._lite && !/^#\/c\//.test(h) || /^#\/words\//.test(h) && hasBd(nc) && !KINDS.length && D.nkinds)) {
        main.innerHTML = '<div class="loading-page"><div class="spin"></div>載入「' + esc(nc.title) + '」課程內容…</div>';
        ensure(nc.id).then(function () { if (location.hash === h) route(); }, function () {
          main.innerHTML = '<div class="loading-page">❌ 課程內容載入失敗,請檢查網路後<a href="javascript:location.reload()">重新整理</a></div>';
        });
        return;
      }
    }
    if ((m = h.match(/^#\/learn\/([^/]+)\/(\d+)\/(\d+)/))) { r = "courses"; renderRoom(decodeURIComponent(m[1]), +m[2], +m[3]); }
    else if ((m = h.match(/^#\/read\/([^/]+)\/(\d+)/))) { r = "courses"; renderRead(decodeURIComponent(m[1]), +m[2]); }
    else if ((m = h.match(/^#\/practice\/([^/]+)(?:\/(.+))?/))) { r = "courses"; renderPractice(decodeURIComponent(m[1]), m[2] ? decodeURIComponent(m[2]) : ""); }
    else if ((m = h.match(/^#\/quiz\/([^/]+)/))) { r = "courses"; renderQuiz(decodeURIComponent(m[1])); }
    else if ((m = h.match(/^#\/words\/([^/]+)/))) { r = "courses"; renderWords(decodeURIComponent(m[1])); }
    else if ((m = h.match(/^#\/c\/([^/]+)/))) { r = "courses"; renderCourse(decodeURIComponent(m[1])); }
    else if (/^#\/courses/.test(h)) { r = "courses"; renderCourses(); }
    else if (/^#\/lc/.test(h)) { r = "lc"; renderLC(); }
    else if (/^#\/continue/.test(h)) { r = "continue"; var last = lsGet(LASTKEY, null); location.replace(last ? last.href : "#/learn/PY-BASIC/1/0"); return; }
    else renderHome();
    $$("#topnav a, #tabbar a").forEach(function (a) { a.classList.toggle("on", a.dataset.r === r); });
    $("#nav-btn").classList.toggle("room-only", !!$(".outline"));
    updatePill();
    if (!/^#\/learn/.test(h)) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  /* ---------- 首頁 ---------- */
  var MAIN3 = ["PY-BASIC", "PY-NETWEB", "PY-CVAI"];
  var GOALS = [
    ["🌱", "完全沒寫過程式", "從 Day1 安裝開始", "#/learn/PY-BASIC/1/0"],
    ["🕹️", "想做聊天室 / 遊戲 / 網站", "socket · pygame · Flask", "#/c/PY-NETWEB"],
    ["👁️", "想學 AI 影像辨識", "OpenCV → CNN → YOLO", "#/c/PY-CVAI"],
    ["🤖", "想用 AI 工具寫程式", "Claude Code · Codex", "#/c/AI-TOOLS"],
    ["🔌", "想玩硬體", "Pico 2 W + 感測器", "#/c/PICO"],
    ["🧩", "想刷題練手感", "LeetCode 階梯", "#/lc"]
  ];
  function renderHome() {
    var T = D.totals || {}, last = lsGet(LASTKEY, null), a = allProgress();
    var nLessons = 0, nNarr = 0;
    D.courses.forEach(function (c) { c.steps.forEach(function (s) { lessonsOf(s).forEach(function (f) { nLessons++; if (!f.lesson.auto) nNarr++; }); }); });
    var h = '<section class="hero"><div><div class="kicker">2026 AI · STUST · PYTHON</div>' +
      '<h1>從 <em>print()</em> 到 <span class="r">YOLO</span><br>20 天實作課</h1>' +
      "<p>每一支課堂程式都是一堂有旁白的課:程式逐段亮起、字幕講給你聽、旁邊直接改數字按執行。課本、練習題、LeetCode 全部串在一起。</p>" +
      '<div class="ctas"><a class="btn gold" href="#/learn/PY-BASIC/1/0">▶ 開始第一堂課</a><a class="btn line" href="#/courses">看全部課程</a></div></div>' +
      '<div class="cont-card"><div class="lbl">CONTINUE</div>' +
      (last ? "<h3>" + esc(last.title) + '</h3><div class="muted" style="font-size:13px">' + esc(last.sub || "") + "</div>" : "<h3>還沒開始上課</h3><div class=\"muted\" style=\"font-size:13px\">從 Day2 的第一支程式開始</div>") +
      '<div class="cont-row"><div class="ring" style="--p:' + a.pct + '"><span>' + a.pct + "%<small>" + a.d + "/" + a.t + "</small></span></div>" +
      '<a class="btn red" href="' + (last ? last.href : "#/learn/PY-BASIC/1/0") + '">' + (last ? "⏯ 繼續上課" : "▶ 開始") + "</a></div></div></section>";
    h += '<div class="stats">' + [[D.courses.length, "門課程"], [nLessons, "堂程式課"], [nNarr, "堂有旁白講稿"], [T.probs, "題練習"], [T.tests, "題可線上提交"], [(D.leetcode || []).length, "題 LeetCode"]]
      .map(function (x) { return '<div class="stat"><b>' + (x[0] || 0) + "</b><span>" + x[1] + "</span></div>"; }).join("") + "</div>";
    h += '<div class="sec-h"><h2>20 天主線</h2><span>左右滑動 · 紅框是大考 · ✓ 已完成</span></div><div class="timeline">' + MAIN3.map(function (cid) {
      var c = byId(cid); if (!c) return "";
      return '<div class="tl-group"><h4>' + esc(c.title) + '</h4><div class="tl-nodes">' + c.steps.map(function (s, i) {
        var d = dayOf(s.title), exam = s.title.indexOf("📝") === 0;
        return '<a class="tl' + (exam ? " exam" : "") + (isDone(cid, i) ? " done" : "") + '" href="' + stepHref(c, i) + '">' +
          '<div class="d">' + (d ? "D" + d : "考") + "<small>" + (d ? "" : "大考") + "</small></div>" +
          '<div class="t">' + esc(s.title.replace(/^Day\d+\s*/, "").replace(/^📝\s*/, "")) + "</div></a>";
      }).join("") + "</div></div>";
    }).join("") + "</div>";
    h += '<div class="sec-h"><h2>你想從哪裡開始?</h2></div><div class="goal-row">' + GOALS.map(function (g) {
      return '<a class="goal" href="' + g[3] + '"><span class="gi">' + g[0] + "</span><b>" + g[1] + "</b><span>" + g[2] + "</span></a>";
    }).join("") + "</div>";
    h += '<div class="sec-h"><h2>全部課程</h2></div>' + courseGrid();
    main.innerHTML = h;
    var lm = last && /#\/\w+\/([^/]+)/.exec(last.href);
    idle(function () { ensure(lm ? decodeURIComponent(lm[1]) : "PY-BASIC").catch(function () {}); });
  }
  function courseGrid() {
    return '<div class="course-grid">' + D.courses.map(function (c, k) {
      var p = courseProg(c), nl = 0; c.steps.forEach(function (s) { nl += lessonsOf(s).length; });
      return '<a class="ccard" href="#/c/' + c.id + '"><span class="num">0' + (k + 1) + "</span><div class=\"sub\">" + esc(c.subtitle) + "</div><h3>" + esc(c.title) + "</h3><p>" + esc(c.summary) + "</p>" +
        '<div class="meta"><span class="chip">' + c.steps.length + " 章</span>" + (nl ? '<span class="chip">🎬 ' + nl + " 堂</span>" : "") +
        (allProblems(c).length ? '<span class="chip">🎯 ' + allProblems(c).length + " 題</span>" : "") + "</div>" +
        '<div class="bar"><i style="width:' + p.pct + '%"></i></div><div class="muted" style="font-size:12px">進度 ' + p.done + "/" + p.total + "</div></a>";
    }).join("") + "</div>";
  }
  function renderCourses() { main.innerHTML = '<div class="sec-h" style="margin-top:6px"><h2>全部課程</h2><span>主線三門 + 三條支線</span></div>' + courseGrid(); }
  function stepHref(c, i) { return lessonsOf(c.steps[i]).length ? "#/learn/" + c.id + "/" + i + "/0" : "#/read/" + c.id + "/" + i; }

  /* ---------- 課程頁 ---------- */
  function renderCourse(cid) {
    var c = byId(cid); if (!c) return renderHome();
    var p = courseProg(c), np = allProblems(c).length;
    var h = '<div class="course-wrap"><aside class="course-side"><div class="muted" style="font-size:12.5px"><a href="#/courses">課程</a> /</div><h1>' + esc(c.title) + "</h1>" +
      '<div style="color:var(--gold-ink);font-size:13px">' + esc(c.subtitle) + '</div><p class="muted" style="font-size:14px">' + esc(c.summary) + "</p>" +
      '<div class="bar"><i style="width:' + p.pct + '%"></i></div><div class="muted" style="font-size:12.5px;margin-top:4px">完成 ' + p.done + " / " + p.total + " 章</div>" +
      '<div class="acts"><a class="btn gold" href="' + stepHref(c, firstTodo(c)) + '">▶ ' + (p.done ? "繼續" : "開始") + "上課</a>" +
      (np ? '<a class="btn line" href="#/practice/' + c.id + '">🎯 練習題(' + np + ")</a>" : "") +
      (c.quiz ? '<a class="btn line" href="#/quiz/' + c.id + '">❓ 章末測驗</a>' : "") +
      (hasBd(c) ? '<a class="btn line" href="#/words/' + c.id + '">📖 程式詞彙</a>' : "") + "</div>" +
      (hasBd(c) ? '<a class="kinds-cta" href="#/words/' + c.id + '"><b>🧭 第一次看程式?</b><span>先認識程式裡的 ' + (D.nkinds || KINDS.length) + ' 種詞:變數、運算子、內建函式…每種都有白話、例子和提醒</span></a>' : "") +
      (c.todo ? '<p class="muted" style="font-size:12.5px;margin-top:14px">⚠️ ' + esc(c.todo) + "</p>" : "") + "</aside><div>";
    h += c.steps.map(function (s, i) {
      var L = lessonsOf(s), exam = s.title.indexOf("📝") === 0, d = dayOf(s.title);
      var cards = L.map(function (f, k) {
        var st = lessonState(f.path);
        return '<a class="lcard' + (st.done ? " done" : "") + '" href="#/learn/' + c.id + "/" + i + "/" + k + '"><span class="li">' + (st.done ? "✅" : "🎬") + "</span><div><b>" + esc(f.name) + "</b>" + fixBadge(f) + "<span>" +
          segN(f) + " 段" + (f.lesson.auto ? " · 註解導讀" : " · 旁白講解") + (f.runnable ? " · 可線上跑" : f.colab ? " · ☁️ Colab" : "") + "</span></div></a>";
      }).join("");
      if (s.noteIndex >= 0) cards += '<a class="lcard read" href="#/read/' + c.id + "/" + i + '"><span class="li">📘</span><div><b>課文</b><span>可朗讀 · 約 ' + s.minutes + " 分</span></div></a>";
      if (s.problems && s.problems.length) cards += '<a class="lcard prac" href="#/practice/' + c.id + "/step" + i + '"><span class="li">🎯</span><div><b>練習 ' + s.problems.length + " 題</b><span>提示 · 詳解 · 線上提交</span></div></a>";
      return '<section class="chapter' + (isDone(c.id, i) ? " done" : "") + (exam ? " exam" : "") + '" data-i="' + i + '"><div class="ch-head"><span class="ch-no">' + (isDone(c.id, i) ? "✓" : (d || (exam ? "考" : s.step))) + "</span>" +
        '<span class="ch-title">' + esc(s.title) + "<small>" + (L.length ? L.length + " 堂程式課 · " : "") + "約 " + s.minutes + " 分</small></span>" +
        '<label class="muted" style="font-size:13px" onclick="event.stopPropagation()"><input type="checkbox" data-done="' + i + '"' + (isDone(c.id, i) ? " checked" : "") + "> 完成</label></div>" +
        '<div class="ch-body">' + cards + "</div></section>";
    }).join("") + "</div></div>";
    main.innerHTML = h;
    idle(function () { ensure(cid).catch(function () {}); });
    main.onclick = function (e) {
      var head = e.target.closest(".ch-head"); if (head && !e.target.closest("label")) head.parentNode.classList.toggle("closed");
    };
    main.onchange = function (e) {
      var b = e.target.closest("[data-done]"); if (!b) return;
      setDone(c.id, +b.dataset.done, b.checked); renderCourse(cid);
    };
  }
  function firstTodo(c) { for (var i = 0; i < c.steps.length; i++) if (!isDone(c.id, i)) return i; return 0; }

  /* ---------- 教室 ---------- */
  var HL_LANG = { python: "python", javascript: "javascript", html: "xml", css: "css", cpp: "cpp", powershell: "powershell", plaintext: "plaintext" };
  function splitHL(html) {
    var out = [], stack = [], cur = "", re = /(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+|<)/g, m;
    function closeAll() { return stack.map(function () { return "</span>"; }).join(""); }
    while ((m = re.exec(html))) {
      if (m[1]) { stack.push(m[1]); cur += m[1]; }
      else if (m[2]) { stack.pop(); cur += m[2]; }
      else if (m[3]) { out.push(cur + closeAll()); cur = stack.join(""); }
      else cur += m[4];
    }
    out.push(cur + closeAll());
    return out;
  }
  function codeLines(f) {
    try { if (window.hljs) return splitHL(hljs.highlight(f.content, { language: HL_LANG[f.lang] || "plaintext", ignoreIllegals: true }).value); } catch (e) {}
    return f.content.split("\n").map(esc);
  }
  var R = null;   // 目前教室狀態
  var COLAB_BASE = "https://colab.research.google.com/github/friencdking0000/pyl-academy/blob/main/notebooks/";
  function buildSegs(f) {
    var L = f.lesson, segs = [];
    segs.push({ kind: "intro", title: "開場", why: L.why || "", wterms: L.wterms || [], say: L.intro || "這堂課要讀「" + f.name + "」。我們會一段一段看,每段先聽講解,再到右邊動手改改看。" });
    L.segments.forEach(function (s) { segs.push(s); });
    segs.push({ kind: "recap", title: "小結", say: L.recap || "這支程式看完了!記得在 VS Code 自己跑一次,看看終端機的結果跟你想的一不一樣。" });
    return segs;
  }
  function renderRoom(cid, si, k) {
    var c = byId(cid); if (!c || !c.steps[si]) return renderHome();
    var L = lessonsOf(c.steps[si]); if (!L.length) { location.replace("#/read/" + cid + "/" + si); return; }
    var f = L[Math.min(k, L.length - 1)];
    var st = lessonState(f.path);
    R = { c: c, si: si, k: k, f: f, L: L, segs: buildSegs(f), idx: 0, playing: false, edited: f.content, opsTab: "do" };
    lsSet(LASTKEY, { href: location.hash, title: f.name, sub: c.title + " › " + c.steps[si].title });
    main.classList.add("full"); document.body.classList.add("in-room");
    var lines = codeLines(f);
    R.hl = lines;
    main.innerHTML = '<div class="room">' + outlineHtml(c, si, k) +
      '<section class="stage"><div class="stage-head"><div><div class="crumb"><a href="#/c/' + c.id + '">' + esc(c.title) + "</a> › " + esc(c.steps[si].title) + '</div><div class="fn">' + esc(f.name) + "</div></div>" +
      '<span class="sp"></span>' + (f.lesson.auto ? '<span class="tag auto" title="還沒有逐段講稿,先用程式註解導讀">註解導讀</span>' : '<span class="tag">🎙 旁白講解</span>') +
      (f.runnable ? '<span class="tag run" id="py-tag">▶ 可線上執行</span>' : (f.colab ? '<a class="tag colab" target="_blank" rel="noopener" href="' + COLAB_BASE + f.colab + '" title="用 Google Colab 執行(有 GPU、免安裝)">☁️ 在 Colab 開啟</a>' : '<span class="tag">在 VS Code 執行</span>')) +
      pairLink(c, si, L, f) + (f.demo ? '<a class="btn gold sm" href="' + attr((window.PYL_DEMO_BASE || "demos/") + f.demo) + '?room=demo" target="_blank" rel="noopener" title="開新分頁玩真的示範;網址的 room= 可以改成你們自己的房間名">▶ 開啟示範</a>' : "") +
      (f.rel ? '<a class="btn line sm" href="' + attr(f.rel) + '" target="_blank">↗ 原檔</a>' : "") + "</div>" +
      '<div class="code focus" id="code">' + lines.map(function (t, i) { return '<div class="ln" data-l="' + (i + 1) + '"><span class="no">' + (i + 1) + '</span><span class="tx">' + (t || " ") + "</span></div>"; }).join("") + "</div>" +
      '<div class="caption"><div class="cap-top"><span class="cap-k">旁白</span><span class="cap-title" id="cap-title"></span><span class="cap-lines" id="cap-lines"></span></div>' +
      '<div class="cap-why" id="cap-why"></div><div class="cap-say" id="cap-say"></div><div class="cap-term" id="cap-term"></div>' +
      '<div class="cap-ctrl"><button class="icon-btn" id="b-prev" title="上一段 (←)">◀</button><button class="icon-btn play" id="b-play" title="自動播放並朗讀 (空白鍵)">▶</button><button class="icon-btn" id="b-next" title="下一段 (→)">▶▶</button>' +
      '<div class="dots" id="dots">' + R.segs.map(function (_, i) { return '<i data-i="' + i + '"' + (i <= st.seen ? ' class="seen"' : "") + "></i>"; }).join("") + "</div>" +
      '<select class="rate" id="rate" title="語速"><option value="0.85">慢</option><option value="1" selected>中</option><option value="1.2">快</option></select>' +
      '<button class="icon-btn" id="b-voice" title="朗讀開關">🔊</button><button class="icon-btn" id="b-vset" title="聲音設定 / 測試(沒聲音按這裡)">⚙</button><button class="icon-btn huh" id="b-huh" title="聽不懂?幫你問 ChatGPT">🤔</button><button class="icon-btn" id="b-ops" title="操作面板">🛠</button></div></div></section>' +
      '<aside class="ops" id="ops"><div class="ops-grip"><span>🛠 操作面板</span><button class="icon-btn" id="ops-close">✕</button></div>' +
      '<div class="ops-tabs"><button data-t="do" class="on">動手做</button>' + (f.bd && f.bd.length ? '<button data-t="bd">🔍 拆解</button>' : "") + '<button data-t="run">編輯執行</button><button data-t="read">課文</button><button data-t="ai">問 AI</button>' + (f.diff || f.fixedPath ? '<button data-t="diff">對照</button>' : "") + '</div><div class="ops-body" id="ops-body"></div></aside></div>';
    bindRoom();
    gotoSeg(0);
    if (f.runnable) preheat(f.content);
  }
  function pairLink(c, si, L, f) {
    var other = f.fixedPath || f.origPath; if (!other) return "";
    for (var j = 0; j < L.length; j++) if (L[j].path === other)
      return fixBadge(f) + '<a class="btn ' + (f.fixedPath ? "gold" : "line") + ' sm" href="#/learn/' + c.id + "/" + si + "/" + j + '">' + (f.fixedPath ? "看修正版 →" : "← 看原本的錯誤示範") + "</a>";
    return fixBadge(f);
  }
  function diffHtml(d) {
    return '<pre class="diffview">' + String(d || "").split("\n").map(function (l) {
      var c = /^(\+\+\+|---)/.test(l) ? "dh" : l[0] === "+" ? "da" : l[0] === "-" ? "dd" : l[0] === "@" ? "dk" : "";
      return '<span class="' + c + '">' + esc(l) + "</span>";
    }).join("\n") + "</pre>";
  }
  function outlineHtml(c, si, k) {
    return '<nav class="outline"><a class="oc" href="#/c/' + c.id + '">‹ ' + esc(c.title) + "</a>" + c.steps.map(function (s, i) {
      var L = lessonsOf(s);
      return '<div class="o-step' + (i === si ? " cur" : "") + '"><div class="os-t"><span>' + (isDone(c.id, i) ? "✅" : (dayOf(s.title) ? "D" + dayOf(s.title) : "•")) + "</span><span>" + esc(s.title.replace(/^Day\d+\s*/, "")) + "</span></div>" +
        L.map(function (f, j) {
          var st = lessonState(f.path);
          return '<a class="o-item' + (i === si && j === k ? " on" : "") + (st.done ? " done" : "") + '" href="#/learn/' + c.id + "/" + i + "/" + j + '"><span class="ck">' + (st.done ? "✓" : "○") + "</span>" + esc(f.name) + (fixIcon(f) ? " " + fixIcon(f) : "") + "</a>";
        }).join("") +
        (s.noteIndex >= 0 ? '<a class="o-item" href="#/read/' + c.id + "/" + i + '"><span class="ck">📘</span>課文</a>' : "") +
        (s.problems && s.problems.length ? '<a class="o-item" href="#/practice/' + c.id + "/step" + i + '"><span class="ck">🎯</span>練習 ' + s.problems.length + " 題</a>" : "") + "</div>";
    }).join("") + "</nav>";
  }
  var voiceOn = lsGet("pyl_voice", true);
  function bindRoom() {
    $("#b-prev").onclick = function () { gotoSeg(R.idx - 1, true); };
    $("#b-next").onclick = function () { gotoSeg(R.idx + 1, true); };
    $("#b-play").onclick = function () { R.playing ? pause() : play(); };
    $("#dots").onclick = function (e) { var d = e.target.closest("i"); if (d) gotoSeg(+d.dataset.i, true); };
    $("#b-voice").textContent = voiceOn ? "🔊" : "🔇";
    $("#b-voice").onclick = function () {
      voiceOn = !voiceOn; lsSet("pyl_voice", voiceOn); this.textContent = voiceOn ? "🔊" : "🔇";
      ttsNote(voiceOn ? "" : "🔇 已靜音:只顯示字幕。");
      stopSpeak(); if (R.playing) speakSeg();
    };
    $("#rate").value = String(lsGet("pyl_rate", 1));
    $("#rate").onchange = function () { lsSet("pyl_rate", +this.value); };
    $("#b-ops").onclick = function () { $("#ops").classList.toggle("open"); };
    $("#b-vset").onclick = function () { if (R.playing) pause(); openVoicePanel(); };
    $("#b-huh").onclick = function () { askGpt(this); };
    $(".caption").addEventListener("click", function (e) {
      var w = e.target.closest(".wt");
      if (w) {                                      // 點名詞:顯示小抄,不重播
        var box = $("#cap-term");
        box.innerHTML = "📖 <b>" + esc(w.dataset.t) + "</b>:" + esc(w.dataset.d) +
          ' <a href="https://www.google.com/search?q=' + encodeURIComponent(w.dataset.t + " 是什麼 白話") + '" target="_blank" rel="noopener">Google 一下 ↗</a>';
        box.classList.add("show");
        return;
      }
      if (e.target.closest("a")) return;
      var sn = e.target.closest(".sent, .cap-why");  // 點一句(或用意):從那裡開始念,念完照常往下
      if (!sn) return;
      var k = sn.classList.contains("cap-why") ? R.whyK : +sn.dataset.k;
      if (k < 0) return;
      R.playing = true; $("#b-play").textContent = "⏸";
      ttsNote(voiceOn ? "" : "🔇 目前是靜音模式,只會自動翻字幕。要聽旁白請按右下的 🔇 打開聲音。");
      speakSeg(k);
    });
    $("#ops-close").onclick = function () { $("#ops").classList.remove("open"); };
    $(".ops-tabs").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; R.opsTab = b.dataset.t; renderOps(); };
    $("#code").onclick = function (e) {
      var ln = e.target.closest(".ln"); if (!ln) return;
      var l = +ln.dataset.l;
      if (e.target.closest(".no") && R.f.bd && R.f.bd.length) { R.bdLine = l; R.opsTab = "bd"; $("#ops").classList.add("open"); }
      for (var i = 0; i < R.segs.length; i++) { var s = R.segs[i]; if (s.lines && l >= s.lines[0] && l <= s.lines[1]) { gotoSeg(i, true); return; } }
      if (R.bdLine) renderOps();
    };
  }
  document.addEventListener("keydown", function (e) {
    if (!R || !$("#code") || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === "ArrowRight") { gotoSeg(R.idx + 1, true); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { gotoSeg(R.idx - 1, true); e.preventDefault(); }
    else if (e.key === " ") { R.playing ? pause() : play(); e.preventDefault(); }
  });
  function gotoSeg(i, manual) {
    if (!R || i < 0 || i >= R.segs.length) return;
    if (manual) { stopSpeak(); R.ttsPos = null; }   // 手動換段:下次從頭念
    R.idx = i;
    var s = R.segs[i], code = $("#code");
    $$(".ln.on", code).forEach(function (x) { x.classList.remove("on"); });
    if (s.lines) {
      for (var l = s.lines[0]; l <= s.lines[1]; l++) { var el = code.querySelector('.ln[data-l="' + l + '"]'); if (el) el.classList.add("on"); }
      code.classList.add("focus");
      var first = code.querySelector('.ln[data-l="' + s.lines[0] + '"]');
      if (first) code.scrollTo({ top: Math.max(0, first.offsetTop - code.clientHeight * 0.28), behavior: "smooth" });
    } else code.classList.remove("focus");
    $("#cap-title").textContent = s.title || "";
    $("#cap-lines").textContent = s.lines ? "第 " + s.lines[0] + (s.lines[1] !== s.lines[0] ? "–" + s.lines[1] : "") + " 行 · " + i + "/" + (R.segs.length - 2) : (s.kind === "intro" ? "開場" : "小結");
    renderCaption(s);
    $$("#dots i").forEach(function (d, k) { d.classList.toggle("on", k === i); if (k <= i) d.classList.add("seen"); });
    var st = lessonState(R.f.path); st.seen = Math.max(st.seen || 0, i);
    if (i === R.segs.length - 1 && !st.done) { st.done = true; saveLesson(R.f.path, st); checkStepDone(); refreshOutline(); }
    else saveLesson(R.f.path, st);
    renderOps();
    if (R.playing) speakSeg();
  }
  // ---- 用意 + 名詞小抄 ----
  function termsOf(s) { return (s.wterms || []).filter(function (t) { return t && t.t && t.d; }); }
  function markTerms(html, terms, used) {
    terms.forEach(function (t) {
      if (used[t.t]) return;
      var key = esc(t.t), i = html.indexOf(key);
      if (i < 0) return;
      // 不要畫到 HTML 標籤裡面
      var lt = html.lastIndexOf("<", i), gt = html.lastIndexOf(">", i);
      if (lt > gt) return;
      used[t.t] = 1;
      html = html.slice(0, i) + '<span class="wt" tabindex="0" data-t="' + attr(t.t) + '" data-d="' + attr(t.d) + '">' + key + "</span>" + html.slice(i + key.length);
    });
    return html;
  }
  // 一段旁白要念的句子:標題 → 用意 → 旁白逐句(off 之前的在字幕上方已經顯示)
  function segChunks(s) {
    var pre = (s.title ? [s.title + "。"] : []).concat(s.why ? ["用意:" + plain(s.why).replace(/[。]?$/, "。")] : []);
    return { chunks: pre.concat(splitSay(plain(s.say))), off: pre.length, whyK: s.why ? pre.length - 1 : -1 };
  }
  function renderCaption(s) {
    var used = {}, terms = termsOf(s), sc = segChunks(s);
    R.whyK = sc.whyK;
    var cw = $("#cap-why");
    cw.innerHTML = s.why ? "💡 <b>用意</b>:" + markTerms(esc(s.why), terms, used) : "";
    cw.style.display = s.why ? "" : "none";
    cw.classList.remove("now");
    // 一進來就分好句:每一句都可以點,從那句開始念
    $("#cap-say").innerHTML = sc.chunks.slice(sc.off).map(function (c, k) {
      return '<span class="sent" data-k="' + (k + sc.off) + '" title="點一下:從這句開始念">' + markTerms(esc(c), terms, used) + "</span>";
    }).join("");
    var ct = $("#cap-term"); ct.classList.remove("show"); ct.innerHTML = "";
  }
  // ---- 聽不懂?把這段整理成新手提問,複製並打開 ChatGPT ----
  function askGpt(btn) {
    var s = R.segs[R.idx], f = R.f;
    var code = s.lines ? segCode(s) : f.content.slice(0, 1200);
    if (code.length > 1500) code = code.slice(0, 1500) + "\n…(後面省略)";
    var t = "我是完全沒學過程式的新手,正在看「" + R.c.title + " › " + R.c.steps[R.si].title + "」的 " + f.name + "。\n" +
      "請用很白話、像在教國中生的方式幫我:\n" +
      "1. 先用一句話說這段程式的「用意」(為什麼要寫它、學它能做什麼)\n" +
      "2. 再一行一行解釋;遇到專有名詞先用生活比喻解釋\n" +
      "3. 如果裡面拿某個東西當例子(例如數學公式、遊戲規則),直接告訴我「這只是例子、不懂也沒關係」,並說重點是什麼\n" +
      "4. 最後出一題很簡單的小練習給我\n\n" +
      "【這段在講】" + (s.title || "") + "\n" + (s.why ? "用意:" + plain(s.why) + "\n" : "") + plain(s.say) + "\n\n" +
      "【程式碼】\n" + code;
    copyText(t);
    var url = "https://chatgpt.com/?q=" + encodeURIComponent(t);
    window.open(url.length < 7000 ? url : "https://chatgpt.com/", "_blank", "noopener");
    ttsNote("📋 提問已複製,正在打開 ChatGPT。沒有自動帶入的話,在輸入框按「貼上」(Ctrl+V)就好。");
    var n = $("#cap-tts"); if (n) { n.classList.add("ok"); setTimeout(function () { ttsNote(""); n.classList.remove("ok"); }, 6000); }
  }
  function checkStepDone() {
    var all = R.L.every(function (f) { return lessonState(f.path).done; });
    if (all && !isDone(R.c.id, R.si)) setDone(R.c.id, R.si, true);
    updatePill();
  }
  function refreshOutline() { var ol = $(".outline"); if (ol) ol.outerHTML = outlineHtml(R.c, R.si, R.k); }

  /* ---- 旁白朗讀 ---- */
  var synth = window.speechSynthesis, zhVoice = null, timer = null;
  function pickVoice() {
    if (!synth) return null;
    var vs = synth.getVoices(), want = lsGet("pyl_voice_name", "");
    if (want) { var w = vs.filter(function (v) { return v.name === want; })[0]; if (w) return (zhVoice = w); }
    zhVoice = vs.filter(function (v) { return /zh[-_]TW/i.test(v.lang); }).sort(function (a, b) { return (/Natural|Online/.test(b.name) ? 1 : 0) - (/Natural|Online/.test(a.name) ? 1 : 0); })[0] ||
      vs.filter(function (v) { return /^zh/i.test(v.lang); })[0] || null;
    return zhVoice;
  }
  if (synth) { pickVoice(); synth.onvoiceschanged = pickVoice; }
  function plain(t) { return String(t || "").replace(/```[\s\S]*?```/g, "").replace(/[`*_#>]/g, "").replace(/\s+/g, " "); }
  // 朗讀共用(2026-10-14 修正 Android):
  // - 只在句號 / 問號 / 驚嘆號斷句(逗號不斷,減少停頓);每句結尾補句號,避免手機語音吃掉最後幾個字
  // - 不再用 pause()+resume() 保活:Android 的 pause 等於取消,會讓旁白念到一半卡住
  // - 被系統打斷(interrupted)就重念這一句;onchunk 回報念到第幾句,讓字幕跟著亮、暫停後能接著念
  var sayTok = 0;
  function splitSay(text) {
    var parts = String(text).replace(/([。！？!?\n])/g, "$1\u0000").split("\u0000").map(function (x) { return x.trim(); }).filter(Boolean);
    var chunks = [];
    parts.forEach(function (x) {
      while (x.length > 120) { var cut = x.lastIndexOf("，", 120); if (cut < 40) cut = 119; chunks.push(x.slice(0, cut + 1)); x = x.slice(cut + 1); }
      if (chunks.length && (chunks[chunks.length - 1] + x).length < 40) chunks[chunks.length - 1] += x; else if (x) chunks.push(x);
    });
    return chunks.map(function (c) { return /[。！？!?.…]$/.test(c) ? c : c + "。"; });
  }
  function say(chunks, from, onend, onfail, onchunk) {
    if (typeof chunks === "string") chunks = splitSay(chunks);
    var tok = ++sayTok, i = from || 0, tries = 0;
    function one() {
      if (tok !== sayTok) return;
      if (i >= chunks.length) { onend && onend(); return; }
      onchunk && onchunk(i);
      var u = new SpeechSynthesisUtterance(chunks[i]), started = false, dead = false;
      u.lang = "zh-TW"; if (zhVoice) u.voice = zhVoice; u.rate = +lsGet("pyl_rate", 1);
      u.onstart = function () { started = true; };
      u.onend = function () { if (dead || tok !== sayTok) return; dead = true; i++; tries = 0; setTimeout(one, 40); };
      u.onerror = function (e) {
        if (dead || tok !== sayTok) return;          // 我們自己按停止 / 換段 / 重試造成的,不用管
        dead = true;
        if ((e.error === "interrupted" || e.error === "canceled") && tries < 2) { tries++; setTimeout(one, 200); return; }
        onfail && onfail(e.error || "error");
      };
      try { synth.speak(u); } catch (e) { onfail && onfail("error"); return; }
      // 有些瀏覽器會靜默吞掉:2 秒都沒開始就重念一次,再不行就改用字幕模式
      setTimeout(function () {
        if (dead || tok !== sayTok || started || synth.speaking) return;
        dead = true;
        if (tries < 1) { tries++; try { synth.cancel(); } catch (e) {} setTimeout(one, 200); }
        else onfail && onfail("silent");
      }, 2000);
    }
    try { if (synth.paused) synth.resume(); } catch (e) {}
    one();
  }
  function voiceLabel(v) { return v.name + "(" + v.lang + (v.localService ? "" : ",線上") + ")"; }
  function openVoicePanel() {
    var old = $("#vpanel"); if (old) old.remove();
    var vs = synth ? synth.getVoices() : [], zh = vs.filter(function (v) { return /^(zh|cmn|yue)/i.test(v.lang); });
    var want = lsGet("pyl_voice_name", ""), ua = navigator.userAgent;
    var br = / Line\//i.test(ua) ? "LINE 內建瀏覽器(不支援朗讀,請改用 Chrome / Safari)" : /FBAN|FBAV|Instagram/i.test(ua) ? "App 內建瀏覽器(不支援朗讀)" : /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "其他";
    var os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "其他";
    var el = document.createElement("div"); el.id = "vpanel"; el.className = "vpanel";
    el.innerHTML = '<div class="vp-in"><div class="vp-h"><b>🔊 聲音設定與測試</b><button class="icon-btn" id="vp-x">✕</button></div>' +
      '<div class="vp-info">瀏覽器:<b>' + br + "</b> · 系統:<b>" + os + "</b> · 朗讀功能:<b>" + (synth ? "有" : "❌ 不支援") + "</b> · 中文語音:<b>" + zh.length + "</b> 個(全部 " + vs.length + " 個)</div>" +
      '<label class="vp-l">念旁白用的聲音</label><select id="vp-voice"><option value="">自動選(目前:' + esc(zhVoice ? voiceLabel(zhVoice) : "找不到中文語音") + ")</option>" +
      (zh.length ? '<optgroup label="中文">' + zh.map(function (v) { return '<option value="' + attr(v.name) + '"' + (v.name === want ? " selected" : "") + ">" + esc(voiceLabel(v)) + "</option>"; }).join("") + "</optgroup>" : "") +
      '<optgroup label="其他語言(念中文可能沒聲音)">' + vs.filter(function (v) { return zh.indexOf(v) < 0; }).map(function (v) { return '<option value="' + attr(v.name) + '"' + (v.name === want ? " selected" : "") + ">" + esc(voiceLabel(v)) + "</option>"; }).join("") + "</optgroup></select>" +
      '<div class="row"><button class="btn red sm" id="vp-test">▶ 播放測試句</button><button class="btn line sm" id="vp-copy">📋 複製檢測結果</button></div>' +
      '<pre class="vp-log" id="vp-log">按「播放測試句」,這裡會記錄發生什麼事。</pre>' +
      '<div class="vp-tips"><b>還是沒聲音?依序試試:</b><ol>' +
      "<li>電腦 / 手機音量、這個分頁有沒有被靜音(分頁上的喇叭圖示)。</li>" +
      "<li><b>iPhone:側邊靜音開關打開時,網頁朗讀會完全沒聲音</b>,請切回有聲。</li>" +
      "<li>上面換一個中文語音再測;標「線上」的要能連網,學校網路有時會擋。</li>" +
      "<li>Windows 沒有中文語音:設定 → 時間與語言 → 語音 → 新增語音 →「中文(台灣)」。</li>" +
      "<li>換 Edge 瀏覽器試試(內建最多中文語音)。</li></ol></div></div>";
    document.body.appendChild(el);
    var log = $("#vp-log", el), t0 = 0, lines = [];
    function L(m) { lines.push(((performance.now() - t0) / 1000).toFixed(1) + "s " + m); log.textContent = lines.join("\n"); }
    $("#vp-x", el).onclick = function () { el.remove(); };
    el.onclick = function (e) { if (e.target === el) el.remove(); };
    $("#vp-voice", el).onchange = function () { lsSet("pyl_voice_name", this.value); zhVoice = null; pickVoice(); };
    $("#vp-copy", el).onclick = function () { copyText($(".vp-info", el).textContent + "\n聲音:" + (zhVoice ? voiceLabel(zhVoice) : "無") + "\n" + log.textContent, this); };
    $("#vp-test", el).onclick = function () {
      lines = []; t0 = performance.now();
      if (!synth) { L("❌ 這個瀏覽器沒有朗讀功能"); return; }
      try { synth.cancel(); if (synth.paused) synth.resume(); } catch (e) {}
      var u = new SpeechSynthesisUtterance("你好,這是 pyl Academy 的旁白測試。聽得到的話,旁白就沒問題。"), started = false;
      u.lang = "zh-TW"; if (zhVoice) u.voice = zhVoice; u.rate = +lsGet("pyl_rate", 1); u.volume = 1;
      L("送出朗讀,聲音 = " + (zhVoice ? voiceLabel(zhVoice) : "未指定(讓瀏覽器自己找 zh-TW)"));
      u.onstart = function () { started = true; L("✅ 開始念了(如果這時還是聽不到 → 是音量/輸出裝置/靜音開關的問題,或換一個聲音)"); };
      u.onend = function () { L("✅ 念完"); };
      u.onerror = function (e) { L("❌ 錯誤:" + e.error + " → " + (TTS_MSG[e.error] || "換一個聲音或瀏覽器再試")); };
      synth.speak(u);
      setTimeout(function () { if (!started) L("⚠️ 3 秒了還沒開始(speaking=" + synth.speaking + ", pending=" + synth.pending + ")→ 這個聲音可能壞了或要連網,請換一個再測"); }, 3000);
    };
  }
  function ttsNote(msg) {
    var n = $("#cap-tts");
    if (!n) { var cs = $("#cap-say"); if (!cs) return; n = document.createElement("div"); n.id = "cap-tts"; n.className = "cap-tts"; cs.parentNode.insertBefore(n, cs.nextSibling); }
    n.innerHTML = msg || ""; n.style.display = msg ? "" : "none";
  }
  var TTS_MSG = {
    "not-allowed": "🔇 瀏覽器擋住了自動朗讀,請再按一次 ▶(要直接點按鈕才會出聲)",
    "silent": "🔇 這台裝置的語音沒有出聲。請確認音量、或換 Edge / Chrome;目前先只顯示字幕。",
    "synthesis-unavailable": "🔇 這台裝置沒有可用的語音引擎,先只顯示字幕。",
    "language-unavailable": "🔇 找不到中文語音,先只顯示字幕。可到系統設定加裝「中文(台灣)」語音。"
  };
  function stopSpeak() { sayTok++; clearTimeout(timer); try { synth && synth.cancel(); } catch (e) {} var cs = $("#cap-say"); if (cs) cs.classList.remove("speaking"); }
  function play() {
    R.playing = true; $("#b-play").textContent = "⏸";
    ttsNote(voiceOn ? "" : "🔇 目前是靜音模式,只會自動翻字幕。要聽旁白請按右下的 🔇 打開聲音。");
    var p = R.ttsPos;
    speakSeg(p && p.idx === R.idx ? p.k : 0);      // 暫停後再播:從剛剛那一句接著念
  }
  function pause() { R.playing = false; stopSpeak(); var b = $("#b-play"); if (b) b.textContent = "▶"; }
  function speakSeg(from) {
    stopSpeak();
    var s = R.segs[R.idx], cs = $("#cap-say");
    var sc = segChunks(s), chunks = sc.chunks, whyK = sc.whyK;   // 字幕已由 renderCaption 分好句,這裡只負責念、亮
    function mark(k) {
      R.ttsPos = { idx: R.idx, k: k };
      $$(".sent", cs).forEach(function (x) { var j = +x.dataset.k; x.classList.toggle("now", j === k); x.classList.toggle("done", j < k); });
      var cw = $("#cap-why"); if (cw) cw.classList.toggle("now", k === whyK);
    }
    function next() {
      if (!R || !R.playing) return;
      R.ttsPos = null;
      if (R.idx < R.segs.length - 1) timer = setTimeout(function () { gotoSeg(R.idx + 1); }, 600); else pause();
    }
    cs.classList.add("speaking");
    function byTimer() { var t = chunks.slice(from || 0).join(""); timer = setTimeout(function () { cs.classList.remove("speaking"); next(); }, Math.max(3500, t.length * 230 / (+lsGet("pyl_rate", 1)))); }
    if (voiceOn && synth && window.SpeechSynthesisUtterance) {
      say(chunks, from || 0, function () { cs.classList.remove("speaking"); mark(chunks.length); next(); }, function (why) {
        ttsNote(TTS_MSG[why] || "🔇 朗讀失敗(" + why + "),先只顯示字幕。");
        if (why === "not-allowed") { cs.classList.remove("speaking"); pause(); } else byTimer();
      }, mark);
    } else { mark(from || 0); byTimer(); }
  }

  /* ---- 逐句拆解 + 程式詞彙 ---- */
  var KINDS = (D.pykinds && D.pykinds.kinds) || [], TERMS = D.pyterms || {};
  function kindOf(k) { for (var i = 0; i < KINDS.length; i++) if (KINDS[i].kind === k) return KINDS[i]; return null; }
  function kindChip(k) { var K = kindOf(k); return '<span class="kchip" data-kind="' + attr(k || "") + '" title="' + attr(K ? K.def : "") + '">' + (K ? K.icon + " " : "") + esc(k || "") + "</span>"; }
  function termLabel(key) { var m = key.match(/^html:(.*)$/); return m ? "<" + m[1] + ">" : key.replace(/^(css|js|ino):/, ""); }
  function hasBd(c) { return c.steps.some(function (st) { return (st.code || []).some(function (f) { return f.hasBd || (f.bd && f.bd.length); }); }); }
  function kindsGuideHtml(open) {
    if (!KINDS.length) return "";
    return '<details class="kinds"' + (open ? " open" : "") + '><summary>🧭 先看懂:程式裡的詞分成哪幾種?</summary><p class="kinds-intro">' + esc(D.pykinds.intro || "") + '</p><div class="kgrid">' +
      KINDS.map(function (K) {
        return '<div class="kcard" id="k-' + attr(K.kind) + '"><div class="kh"><span>' + K.icon + "</span><b>" + esc(K.kind) + "</b></div><p>" + esc(K.def) + "</p>" +
          '<div class="kex"><code>' + esc(K.ex) + "</code><span>" + esc(K.exPlain || "") + "</span></div>" + (K.tip ? '<div class="ktip">💡 ' + esc(K.tip) + "</div>" : "") + "</div>";
      }).join("") + "</div></details>";
  }
  function showKind(kind, scope) {
    var card = document.getElementById("k-" + kind); if (!card) return;
    card.closest("details").open = true;
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    card.classList.add("flash"); setTimeout(function () { card.classList.remove("flash"); }, 1400);
  }
  function bdRows(e) {
    var rows = (e.terms || []).map(function (t) { return [t.s, t.kind, t.name, ""]; });
    (e.auto || []).forEach(function (k) { var T = TERMS[k]; if (T) rows.push([termLabel(k), T.kind, T.name, T.ex || ""]); });
    return rows;
  }
  function termsTable(rows) {
    return rows.length ? '<table class="bd-terms"><tbody>' + rows.map(function (r) {
      return '<tr><td class="bt-s"><code>' + esc(r[0]) + '</code></td><td class="bt-k">' + kindChip(r[1]) + '</td><td class="bt-n">' + esc(r[2]) +
        (r[3] ? '<div class="bt-ex">例:' + esc(r[3]) + "</div>" : "") + "</td></tr>";
    }).join("") + "</tbody></table>" : "";
  }
  function sentenceHtml(e) {
    var a = e.ln[0], b = e.ln[1];
    return '<div class="bd-s' + (e.bug ? " bug" : "") + '" data-a="' + a + '" data-b="' + b + '"><div class="bd-ln">第 ' + a + (b > a ? "–" + b : "") + " 行</div>" +
      '<pre class="bd-code">' + R.hl.slice(a - 1, b).join("\n") + "</pre>" +
      '<div class="bd-plain">💬 ' + inl(e.plain || "") + "</div>" + (e.bug ? '<div class="bd-bug">⚠️ ' + inl(e.bug) + "</div>" : "") + termsTable(bdRows(e)) + "</div>";
  }
  function renderWords(cid) {
    var c = byId(cid); if (!c) return renderHome();
    var map = {}, order = [];
    function add(key, s, kind, name, ex, href, fname, general) {
      var m = map[key];
      if (!m) { m = map[key] = { s: s, kind: kind, defs: [], files: [], fset: {}, general: general ? 1 : 0 }; order.push(key); }
      if (name && !m.defs.some(function (d) { return d.name === name; })) m.defs.push({ name: name, ex: ex, fname: general ? "" : fname });
      if (!m.fset[href]) { m.fset[href] = 1; m.files.push({ href: href, name: fname }); }
    }
    c.steps.forEach(function (st, si) {
      lessonsOf(st).forEach(function (f, k) {
        var href = "#/learn/" + c.id + "/" + si + "/" + k, fname = f.name.split("/").pop();
        (f.bd || []).forEach(function (e) {
          (e.terms || []).forEach(function (t) { add(t.kind + "|" + t.s, t.s, t.kind, t.name, "", href, fname, false); });
          (e.auto || []).forEach(function (key) { var T = TERMS[key]; if (T) add("@" + key, termLabel(key), T.kind, T.name, T.ex || "", href, fname, true); });
        });
      });
    });
    var ko = {}; KINDS.forEach(function (K, i) { ko[K.kind] = i; });
    order.sort(function (a, b) {
      var A = map[a], B = map[b];
      return ((ko[A.kind] || 99) - (ko[B.kind] || 99)) || (B.general - A.general) || (B.files.length - A.files.length) || (A.s < B.s ? -1 : A.s > B.s ? 1 : 0);
    });
    var cnt = {}; order.forEach(function (k) { cnt[map[k].kind] = (cnt[map[k].kind] || 0) + 1; });
    var h = '<div class="words"><div class="muted" style="font-size:12.5px"><a href="#/c/' + c.id + '">' + esc(c.title) + "</a> /</div><h1>📖 程式詞彙總表</h1>" +
      '<p class="muted">這門課的程式一共用到 ' + order.length + " 個詞。先看「詞的種類」打底,再用搜尋找你卡住的詞;點右邊的檔名會進到用到它的那堂課。</p>" +
      kindsGuideHtml(true) +
      '<div class="w-tools"><input id="w-q" type="search" placeholder="找詞或中文,例如 range、迴圈、socket、//"><div class="w-kinds"><button class="on" data-k="">全部 ' + order.length + "</button>" +
      KINDS.filter(function (K) { return cnt[K.kind]; }).map(function (K) { return '<button data-k="' + attr(K.kind) + '">' + K.icon + " " + esc(K.kind) + " " + cnt[K.kind] + "</button>"; }).join("") + "</div></div>" +
      '<table class="bd-terms w-table"><thead><tr><th>詞</th><th>種類</th><th>意思</th><th>出現在</th></tr></thead><tbody>' + order.map(function (key) {
        var m = map[key], defs = m.defs.slice(0, 3);
        return '<tr data-k="' + attr(m.kind) + '" data-q="' + attr((m.s + " " + m.defs.map(function (d) { return d.name; }).join(" ")).toLowerCase()) + '">' +
          '<td class="bt-s"><code>' + esc(m.s) + '</code></td><td class="bt-k">' + kindChip(m.kind) + '</td><td class="bt-n">' +
          defs.map(function (d) { return "<div>" + esc(d.name) + (d.fname ? ' <span class="muted">(' + esc(d.fname) + ")</span>" : "") + (d.ex ? '<div class="bt-ex">例:' + esc(d.ex) + "</div>" : "") + "</div>"; }).join("") +
          (m.defs.length > 3 ? '<div class="muted">…另有 ' + (m.defs.length - 3) + " 種用法</div>" : "") +
          '</td><td class="w-files">' + m.files.slice(0, 4).map(function (x) { return '<a href="' + x.href + '">' + esc(x.name) + "</a>"; }).join("") +
          (m.files.length > 4 ? '<span class="muted">共 ' + m.files.length + " 支</span>" : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    main.innerHTML = h;
    var q = $("#w-q"), kf = "";
    function apply() {
      var t = q.value.trim().toLowerCase();
      $$(".w-table tbody tr").forEach(function (tr) { tr.style.display = (!kf || tr.dataset.k === kf) && (!t || tr.dataset.q.indexOf(t) >= 0) ? "" : "none"; });
    }
    q.oninput = apply;
    $(".w-kinds").onclick = function (e) { var b = e.target.closest("button"); if (!b) return; kf = b.dataset.k; $$(".w-kinds button").forEach(function (x) { x.classList.toggle("on", x === b); }); apply(); };
    main.onclick = function (e) { var k = e.target.closest(".kchip"); if (k) showKind(k.dataset.kind); };
  }

  /* ---- 操作面板 ---- */
  function renderOps() {
    var body = $("#ops-body"); if (!body) return;
    $$(".ops-tabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.t === R.opsTab); });
    var s = R.segs[R.idx], f = R.f, h = "";
    if (R.opsTab === "do") {
      if (s.kind === "recap") {
        var nx = nextLesson();
        h += '<div class="op-card end-card"><div class="big">🎉</div><h4>這堂課完成了</h4><p>' + esc(f.name) + " 已記錄為完成。</p>" +
          (nx ? '<a class="btn gold" href="' + nx.href + '">下一堂:' + esc(nx.title) + " →</a>" : '<a class="btn gold" href="#/c/' + R.c.id + '">回課程</a>') + "</div>";
        if (R.c.steps[R.si].problems && R.c.steps[R.si].problems.length) h += '<div class="op-card"><h4>🎯 趁熱練習</h4><p>這一章有 ' + R.c.steps[R.si].problems.length + " 題練習(含線上提交)。</p><a class=\"btn line sm\" href=\"#/practice/" + R.c.id + "/step" + R.si + '">去練習</a></div>';
      }
      if (s.kind === "intro") h += '<div class="op-card"><h4>怎麼上這堂課</h4><p>按 ▶ 自動播放旁白(會朗讀),或用 ◀ ▶▶ 一段一段看。點左邊程式的任一行,會跳到講那一行的段落。</p><p class="muted" style="font-size:13px">' + (f.runnable ? "這支程式可以直接在瀏覽器執行 → 「編輯執行」分頁。" : f.colab ? "這支用到 OpenCV / AI 套件,瀏覽器跑不動:按上方「☁️ 在 Colab 開啟」用 Google Colab 直接執行(免安裝,有 GPU);也可以在 VS Code 執行 <code>python " + esc(f.name.split("/").pop()) + "</code>" : "這支程式要在 VS Code 執行:<code>python " + esc(f.name.split("/").pop()) + "</code>") + "</p></div>";
      if (s.try) {
        h += '<div class="op-card"><h4>🧪 試試看</h4><p>' + inl(s.try.hint || "改改看這段") + '</p><div class="diff"><del>' + esc(s.try.from) + "</del>\n<ins>" + esc(s.try.to) + "</ins></div>" +
          '<div class="row"><button class="btn gold sm" id="b-try">' + (f.runnable ? "套用並執行" : "套用修改") + '</button><button class="btn line sm" id="b-tryc">📋 複製修改後程式</button></div><pre class="console" id="try-out"></pre><div class="out-imgs" id="try-img"></div></div>';
      }
      if (s.check) h += '<div class="op-card"><h4>❓ 想一想</h4><p>' + inl(s.check.q) + '</p><button class="btn line sm" id="b-ans">看答案</button><div class="ans hidden" id="ans">' + inl(s.check.a) + "</div></div>";
      if (s.lines) h += '<div class="op-card"><h4>📋 這段程式</h4><div class="row"><button class="btn line sm" id="b-cpy">複製第 ' + s.lines[0] + "–" + s.lines[1] + ' 行</button><button class="btn line sm" id="b-askseg">🤖 問 AI 這段</button></div></div>';
      if (!s.try && !s.check && s.kind !== "intro" && s.kind !== "recap" && R.f.runnable) h += '<div class="op-card"><h4>▶ 跑跑看</h4><p>到「編輯執行」分頁改程式並執行整支。</p></div>';
    } else if (R.opsTab === "run") {
      h += '<div class="op-card"><h4>✏️ 編輯整支程式</h4><textarea class="editor" id="ed" spellcheck="false"></textarea><div class="row">' +
        (f.runnable ? '<button class="btn gold sm" id="b-run">▶ 執行 (Ctrl+Enter)</button>' : '<span class="muted" style="font-size:13px">這支要在 VS Code 執行(用到 ' + esc(blockedName(R.edited) || "檔案或視窗") + ")</span>") +
        '<button class="btn line sm" id="b-reset">↺ 還原</button><button class="btn line sm" id="b-ecpy">📋 複製</button></div><pre class="console" id="run-out"></pre><div class="out-imgs" id="run-img"></div></div>';
    } else if (R.opsTab === "read") {
      var n = R.c.notes[R.c.steps[R.si].noteIndex];
      h += n ? '<div class="op-card"><h4>📘 ' + esc(n.title.replace(/^📘\s*/, "")) + '</h4><a class="btn line sm" href="#/read/' + R.c.id + "/" + R.si + '">全頁閱讀 / 朗讀</a></div><div class="md" id="ops-md" style="font-size:14px">' + md(n.content) + "</div>" : '<p class="muted">這一章沒有課文。</p>';
    } else if (R.opsTab === "diff") {
      var fx = f.diff ? f : null;
      if (!fx) R.L.forEach(function (x) { if (x.path === f.fixedPath) fx = x; });
      h += '<div class="op-card"><h4>' + (f.diff ? "✅ 這是修正版:和原檔差在哪" : "⚠️ 這支是錯誤示範:修正版改了這些") + '</h4><p class="muted" style="font-size:13px">紅色 − 是原檔的寫法,綠色 + 是修正後的寫法。</p>' +
        (fx ? diffHtml(fx.diff) : '<p class="muted">找不到修正版。</p>') + "</div>";
    } else if (R.opsTab === "bd") {
      var seen = lsGet("pyl_kinds_seen", false);
      h += kindsGuideHtml(!seen);
      if (!seen) lsSet("pyl_kinds_seen", true);
      var list = (f.bd || []).filter(function (e) { return !s.lines || (e.ln[1] >= s.lines[0] && e.ln[0] <= s.lines[1]); });
      h += '<div class="bd-head"><span>' + (s.lines ? "第 " + s.lines[0] + "–" + s.lines[1] + " 行拆成 " + list.length + " 句" : "整支程式共 " + list.length + " 句") +
        '</span><a class="btn line sm" href="#/words/' + R.c.id + '">📖 本課詞彙總表</a></div><p class="muted bd-hint">點程式左邊的<b>行號</b>會跳到那一句;點種類標籤看它是什麼意思。</p>';
      h += list.length ? list.map(sentenceHtml).join("") : '<p class="muted">這段沒有要拆的程式(都是註解或空行)。</p>';
    } else if (R.opsTab === "ai") {
      h += '<div class="op-card"><h4>🤖 問 AI 這段</h4><p>會帶上目前段落的程式碼與講解,請 AI 用家教方式解釋(先給提示,不直接給答案)。</p><textarea class="editor" id="ai-q" style="min-height:90px" placeholder="我卡住的地方…(可留白)"></textarea>' +
        '<div class="row"><button class="btn red sm" data-ai="claude">問 Claude</button><button class="btn line sm" data-ai="chatgpt">問 ChatGPT</button><button class="btn line sm" data-ai="copy">📋 只複製提示詞</button></div></div>';
    }
    body.innerHTML = h;
    bindOps();
    if (R.opsTab === "bd" && R.bdLine) {
      var hit = null;
      $$(".bd-s", body).forEach(function (x) { if (+x.dataset.a <= R.bdLine && R.bdLine <= +x.dataset.b) hit = x; });
      // 捲動的是整個 .ops 面板(手機是底部抽屜)
      if (hit) { hit.classList.add("hit"); var sc = $("#ops"); sc.scrollTop += hit.getBoundingClientRect().top - sc.getBoundingClientRect().top - 100; }
      R.bdLine = null;
    }
  }
  function bindOps() {
    var s = R.segs[R.idx], f = R.f, b;
    $("#ops-body").onclick = function (e) { var k = e.target.closest(".kchip"); if (k) showKind(k.dataset.kind, $("#ops-body")); };
    if ((b = $("#b-try"))) b.onclick = function () {
      R.edited = R.f.content.replace(s.try.from, s.try.to);
      highlightEdit(s);
      if (f.runnable) runPython(R.edited, { out: $("#try-out"), imgs: $("#try-img") });
      else { $("#try-out").textContent = "✅ 已套用到「編輯執行」分頁的程式。這支要在 VS Code 執行:把修改後的程式貼上後按 ▶ Run。"; }
    };
    if ((b = $("#b-tryc"))) b.onclick = function () { copyText(R.f.content.replace(s.try.from, s.try.to), this); };
    if ((b = $("#b-ans"))) b.onclick = function () { $("#ans").classList.toggle("hidden"); };
    if ((b = $("#b-cpy"))) b.onclick = function () { copyText(segCode(s), this); };
    if ((b = $("#b-askseg"))) b.onclick = function () { R.opsTab = "ai"; renderOps(); };
    var ed = $("#ed");
    if (ed) {
      ed.value = R.edited; ed.rows = 18;
      ed.oninput = function () { R.edited = ed.value; };
      ed.onkeydown = function (e) {
        if (e.key === "Tab") { e.preventDefault(); var p = ed.selectionStart; ed.value = ed.value.slice(0, p) + "    " + ed.value.slice(ed.selectionEnd); ed.selectionStart = ed.selectionEnd = p + 4; R.edited = ed.value; }
        else if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && f.runnable) { e.preventDefault(); $("#b-run").click(); }
      };
      if ((b = $("#b-run"))) b.onclick = function () { runPython(ed.value, { out: $("#run-out"), imgs: $("#run-img") }); };
      $("#b-reset").onclick = function () { R.edited = f.content; ed.value = f.content; $("#run-out").textContent = ""; $("#run-img").innerHTML = ""; };
      $("#b-ecpy").onclick = function () { copyText(ed.value, this); };
    }
    $$("[data-ai]").forEach(function (x) {
      x.onclick = function () {
        var t = "我正在學「2026 AI Python 實作課」的「" + R.c.title + " › " + R.c.steps[R.si].title + "」,檔案 " + f.name + "。\n" +
          "請用繁體中文像家教一樣解釋下面這段程式:先用白話說它在做什麼,再逐行說明,最後出一個小練習給我。不要直接幫我改整支程式。\n\n" +
          "【講解】" + plain(s.say) + "\n\n【程式碼】\n" + (s.lines ? segCode(s) : f.content.slice(0, 1500)) + "\n\n【我卡住的地方】" + ($("#ai-q").value || "");
        if (x.dataset.ai === "copy") { copyText(t, x); return; }
        copyText(t);
        window.open((x.dataset.ai === "claude" ? "https://claude.ai/new?q=" : "https://chatgpt.com/?q=") + encodeURIComponent(t), "_blank", "noopener");
      };
    });
  }
  function segCode(s) { return R.f.content.split("\n").slice(s.lines[0] - 1, s.lines[1]).join("\n"); }
  function highlightEdit(s) {
    // 在程式畫面上把被改的那一行標出來(只是顯示,不改原檔)
    var code = $("#code"), before = R.f.content.slice(0, R.f.content.indexOf(s.try.from)), l = before.split("\n").length;
    var el = code.querySelector('.ln[data-l="' + l + '"] .tx'); if (!el) return;
    var lineText = R.edited.split("\n")[l - 1];
    el.innerHTML = '<span style="background:var(--ok-soft);outline:1px solid var(--ok);border-radius:4px">' + esc(lineText) + "</span>";
  }
  function nextLesson() {
    var c = R.c;
    if (R.k + 1 < R.L.length) return { href: "#/learn/" + c.id + "/" + R.si + "/" + (R.k + 1), title: R.L[R.k + 1].name };
    for (var i = R.si + 1; i < c.steps.length; i++) {
      if (lessonsOf(c.steps[i]).length) return { href: "#/learn/" + c.id + "/" + i + "/0", title: c.steps[i].title };
      if (c.steps[i].noteIndex >= 0) return { href: "#/read/" + c.id + "/" + i, title: c.steps[i].title };
    }
    return null;
  }

  /* ---- Pyodide ---- */
  var BLOCKED = /^\s*(?:import|from)\s+(tkinter|cv2|pygame|socket|threading|aiohttp|flask|psycopg2|ultralytics|tensorflow|mediapipe|discord|requests|dotenv|PIL|serial|asyncio|subprocess|paho)\b/m;
  function blockedName(code) { var m = String(code).match(BLOCKED); return m ? m[1] : ""; }
  var PY_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/", pyReady = null, pyDone = false;
  function loadPy() {
    if (pyReady) return pyReady;
    pyReady = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = PY_URL + "pyodide.js";
      s.onload = function () { window.loadPyodide({ indexURL: PY_URL }).then(function (py) { pyDone = true; res(py); }, rej); };
      s.onerror = function () { pyReady = null; rej(new Error("無法載入 Pyodide(需要連網)")); };
      document.head.appendChild(s);
    });
    return pyReady;
  }
  var PRELUDE = ["import builtins, js, sys, io, base64, warnings", "warnings.filterwarnings('ignore', message='Glyph')",
    "def _pyl_input(p=''):", "    r = js.prompt(str(p))", "    r = '' if r is None else str(r)", "    print(str(p) + r)", "    return r", "builtins.input = _pyl_input",
    "if _pyl_uses_mpl:", "    import matplotlib", "    matplotlib.use('Agg')", "    import matplotlib.pyplot as _plt",
    "    def _pyl_show(*a, **k):", "        for n in _plt.get_fignums():", "            buf = io.BytesIO(); _plt.figure(n).savefig(buf, format='png', dpi=90)",
    "            js.window.__pylImg(base64.b64encode(buf.getvalue()).decode())", "        _plt.close('all')", "    _plt.show = _pyl_show"].join("\n");
  var HARNESS = ["import json as _j", "_res = []", "for _t in _pyl_tests:", "    try:", "        _got = repr(eval(_t['call'], globals()))",
    "        _res.append({'call': _t['call'], 'expect': _t['expect'], 'got': _got, 'ok': _got == _t['expect']})",
    "    except Exception as _e:", "        _res.append({'call': _t['call'], 'expect': _t['expect'], 'got': type(_e).__name__ + ': ' + str(_e), 'ok': False})", "_j.dumps(_res)"].join("\n");
  // 預熱:進到可執行的課就在背景先把 Python(與用到的套件)載好;省流量模式 / 2G 不預熱
  function pyBadge(state) {
    var t = $("#py-tag"); if (!t) return;
    t.textContent = state === "loading" ? "⏳ 背景準備 Python…" : state === "ready" ? "▶ 可線上執行 · 已就緒" : "▶ 可線上執行";
    t.classList.toggle("ready", state === "ready");
  }
  function preheat(code) {
    var cn = navigator.connection;
    if (cn && (cn.saveData || /2g/.test(cn.effectiveType || ""))) return;
    if (pyDone) { pyBadge("ready"); return; }
    idle(function () {
      pyBadge("loading");
      loadPy().then(function (py) { return py.loadPackagesFromImports(code || ""); })
        .then(function () { pyBadge("ready"); }, function () { pyBadge(""); });
    });
  }
  function runPython(code, ui, tests) {
    var b = blockedName(code);
    ui.out.classList.remove("err");
    if (b) { ui.out.textContent = "⚠️ 這段程式用到「" + b + "」,瀏覽器無法執行(需要視窗、攝影機或網路)。請在 VS Code 終端機執行。"; return Promise.resolve(null); }
    var t0 = Date.now(), tick = null;
    if (pyDone) ui.out.textContent = "⏳ 執行中…";
    else {
      var msg = function () { return "⏳ 第一次執行要先下載 Python(約 5MB,之後會記在瀏覽器裡)… 已等 " + Math.round((Date.now() - t0) / 1000) + " 秒"; };
      ui.out.textContent = msg();
      tick = setInterval(function () { if (pyDone) { clearInterval(tick); ui.out.textContent = "⏳ 執行中…"; } else ui.out.textContent = msg(); }, 1000);
    }
    if (ui.imgs) ui.imgs.innerHTML = "";
    return loadPy().then(function (py) {
      clearInterval(tick);
      var buf = [];
      py.setStdout({ batched: function (s) { buf.push(s); } }); py.setStderr({ batched: function (s) { buf.push(s); } });
      window.__pylImg = function (b64) { if (!ui.imgs) return; var im = document.createElement("img"); im.src = "data:image/png;base64," + b64; ui.imgs.appendChild(im); };
      var ns = py.globals.get("dict")(); ns.set("_pyl_uses_mpl", /matplotlib/.test(code));
      return py.loadPackagesFromImports(code).then(function () { return py.runPythonAsync(PRELUDE, { globals: ns }); })
        .then(function () { return py.runPythonAsync(code + "\nif 'matplotlib.pyplot' in __import__('sys').modules:\n    __import__('matplotlib.pyplot').pyplot.show()\n", { globals: ns }); })
        .then(function () {
          ui.out.textContent = buf.join("\n") || "(執行完畢,沒有輸出)";
          if (!tests || !tests.length) return null;
          ns.set("_pyl_tests", py.toPy(tests));
          return py.runPythonAsync(HARNESS, { globals: ns }).then(function (r) { return JSON.parse(r); });
        }).catch(function (err) {
          var msg = String(err && err.message || err), tb = msg.split("\n"), i = tb.findIndex(function (l) { return /File "<exec>"/.test(l); });
          ui.out.textContent = (buf.length ? buf.join("\n") + "\n" : "") + "❌ " + (i >= 0 ? tb.slice(i).join("\n") : msg);
          ui.out.classList.add("err");
          return tests && tests.length ? [] : null;
        }).finally(function () { ns.destroy && ns.destroy(); });
    }, function (err) { clearInterval(tick); ui.out.textContent = "❌ " + err.message; return null; });
  }
  window.PYL = { runPython: runPython };

  /* ---------- 課文(可朗讀) ---------- */
  function renderRead(cid, si) {
    var c = byId(cid); if (!c || !c.steps[si]) return renderHome();
    var s = c.steps[si], n = c.notes[s.noteIndex];
    if (!n) { location.replace(stepHref(c, si)); return; }
    lsSet(LASTKEY, { href: location.hash, title: "課文:" + s.title, sub: c.title });
    var L = lessonsOf(s), prev = si > 0 ? stepHref(c, si - 1) : null, next = si < c.steps.length - 1 ? stepHref(c, si + 1) : null;
    main.innerHTML = '<div class="reader"><article class="paper"><div class="muted" style="font-size:12.5px;margin-bottom:10px"><a href="#/c/' + c.id + '">' + esc(c.title) + "</a> › 課文</div>" +
      '<div class="md" id="rd">' + md(n.content) + "</div>" + (n.rel ? '<p class="muted" style="font-size:12.5px;border-top:1px solid var(--line);padding-top:12px;margin-top:30px">📄 來源:<a href="' + attr(n.rel) + '" target="_blank">' + esc(n.path) + "</a></p>" : "") + "</article>" +
      '<aside class="reader-side"><div class="op-card"><h4>🔊 朗讀課文</h4><p class="muted" style="font-size:13px">一段一段唸,唸到哪一段會亮起來;可隨時暫停。</p><div class="row"><button class="btn red sm" id="rd-play">▶ 開始朗讀</button><button class="btn line sm" id="rd-stop">■ 停止</button><button class="btn line sm" id="rd-vset">⚙ 沒聲音?</button></div></div>' +
      (L.length ? '<div class="op-card"><h4>🎬 本章程式課</h4>' + L.map(function (f, k) { return '<a class="o-item" href="#/learn/' + c.id + "/" + si + "/" + k + '"><span class="ck">' + (lessonState(f.path).done ? "✓" : "○") + "</span>" + esc(f.name) + "</a>"; }).join("") + "</div>" : "") +
      (s.problems && s.problems.length ? '<a class="btn gold" href="#/practice/' + c.id + "/step" + si + '">🎯 本章練習 ' + s.problems.length + " 題</a>" : "") +
      '<label class="op-card" style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="rd-done"' + (isDone(c.id, si) ? " checked" : "") + "> 這一章我讀完了</label>" +
      '<div class="row">' + (prev ? '<a class="btn line sm" href="' + prev + '">← 上一章</a>' : "") + (next ? '<a class="btn line sm" href="' + next + '">下一章 →</a>' : "") + "</div></aside></div>";
    var rd = $("#rd");
    enhanceCode(rd);
    typeset(rd).then(function () { annotateTerms(rd, c); });
    $("#rd-done").onchange = function () { setDone(c.id, si, this.checked); updatePill(); };
    var paras = [], pi = 0, reading = false;
    function readNext() {
      $$(".reading", rd).forEach(function (x) { x.classList.remove("reading"); });
      if (!reading || pi >= paras.length) { reading = false; return; }
      var el = paras[pi++]; el.classList.add("reading"); el.scrollIntoView({ block: "center", behavior: "smooth" });
      var t = plain(el.textContent); if (!t.trim()) return readNext();
      if (!synth) return;
      say(splitSay(t), 0, function () { if (reading) readNext(); }, function (why) { reading = false; alert(TTS_MSG[why] || "朗讀失敗(" + why + ")"); });
    }
    $("#rd-play").onclick = function () {
      if (!synth) { alert("這個瀏覽器不支援朗讀"); return; }
      paras = $$("h2, h3, h4, p, li, blockquote > p", rd).filter(function (el) { return !el.closest("pre") && !el.closest("table"); });
      stopSpeak(); reading = true; readNext();
    };
    $("#rd-vset").onclick = openVoicePanel;
    $("#rd-stop").onclick = function () { reading = false; stopSpeak(); $$(".reading", rd).forEach(function (x) { x.classList.remove("reading"); }); };
  }
  function enhanceCode(root) {
    $$("pre > code", root).forEach(function (ce) {
      if (ce.dataset.enh) return; ce.dataset.enh = 1;
      var pre = ce.parentNode, isPy = /language-(python|py)\b/.test(ce.className);
      try { if (window.hljs) hljs.highlightElement(ce); } catch (e) {}
      var bar = document.createElement("div"); bar.className = "code-bar";
      bar.innerHTML = '<button class="cb" data-x="c">📋</button>' + (isPy && !blockedName(ce.textContent) ? '<button class="cb run" data-x="r">▶ 試跑</button>' : "");
      pre.appendChild(bar);
      bar.onclick = function (e) {
        var b = e.target.closest(".cb"); if (!b) return;
        if (b.dataset.x === "c") { copyText(ce.textContent, b); return; }
        var slot = pre.nextElementSibling && pre.nextElementSibling.classList.contains("pg") ? pre.nextElementSibling : null;
        if (slot) { slot.remove(); return; }
        slot = playground(ce.textContent, null); pre.parentNode.insertBefore(slot, pre.nextSibling);
      };
    });
  }
  function playground(code, opts) {
    opts = opts || {};
    var d = document.createElement("div"); d.className = "pg";
    d.innerHTML = '<textarea class="editor" spellcheck="false"></textarea><div class="row"><button class="btn gold sm" data-p="run">▶ 執行</button>' +
      (opts.tests ? '<button class="btn red sm" data-p="sub">✅ 提交(' + opts.tests.length + " 筆測資)</button>" : "") + '<button class="btn line sm" data-p="reset">↺ 重設</button></div><pre class="console"></pre><div class="out-imgs"></div><div class="res"></div>';
    var ta = $("textarea", d), ui = { out: $(".console", d), imgs: $(".out-imgs", d) };
    ta.value = code; ta.rows = Math.min(24, Math.max(6, code.split("\n").length + 1));
    ta.onkeydown = function (e) {
      if (e.key === "Tab") { e.preventDefault(); var p = ta.selectionStart; ta.value = ta.value.slice(0, p) + "    " + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = p + 4; }
      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(false); }
    };
    function go(sub) {
      runPython(ta.value, ui, sub ? opts.tests : null).then(function (res) {
        if (!sub || !res) return;
        var pass = res.filter(function (r) { return r.ok; }).length, all = opts.tests.length;
        $(".res", d).innerHTML = '<div class="verdict ' + (pass === all ? "ac" : "wa") + '">' + (pass === all ? "✅ Accepted 全部通過" : "❌ 通過 " + pass + " / " + all) + '</div><table class="tests"><tr><th>測資</th><th>預期</th><th>你的結果</th><th></th></tr>' +
          res.map(function (r) { return "<tr><td><code>" + esc(r.call) + "</code></td><td><code>" + esc(r.expect) + "</code></td><td><code>" + esc(r.got) + "</code></td><td>" + (r.ok ? "✅" : "❌") + "</td></tr>"; }).join("") + "</table>";
        if (pass === all && opts.onPass) opts.onPass();
      });
    }
    d.onclick = function (e) {
      var b = e.target.closest("[data-p]"); if (!b) return;
      if (b.dataset.p === "reset") { ta.value = code; ui.out.textContent = ""; ui.imgs.innerHTML = ""; $(".res", d).innerHTML = ""; } else go(b.dataset.p === "sub");
    };
    return d;
  }

  /* ---------- 練習題 ---------- */
  var LC_CLS = { Easy: "easy", Medium: "med", Hard: "hard" };
  function renderPractice(cid, focus) {
    var c = byId(cid); if (!c) return renderHome();
    var all = allProblems(c), stepOnly = /^step(\d+)$/.exec(focus || "");
    var h = '<div class="probs-wrap"><div class="muted" style="font-size:12.5px"><a href="#/c/' + c.id + '">' + esc(c.title) + '</a> › 練習</div><h1 style="margin:6px 0">🎯 練習題</h1>' +
      '<div class="filters"><span class="muted" id="psum"></span><select id="f-step"><option value="">全部章節</option>' + c.steps.map(function (s, i) { return s.problems && s.problems.length ? '<option value="' + i + '"' + (stepOnly && +stepOnly[1] === i ? " selected" : "") + ">" + esc(s.title) + "(" + s.problems.length + ")</option>" : ""; }).join("") + "</select>" +
      '<select id="f-lv"><option value="">全部難度</option><option>基礎</option><option>實作</option><option>挑戰</option></select><label class="muted"><input type="checkbox" id="f-test"> 只看可線上提交</label><label class="muted"><input type="checkbox" id="f-todo"> 只看還不會的</label></div>' +
      all.map(function (x) { return probCard(c, x.p, x.si); }).join("") + "</div>";
    main.innerHTML = h;
    function sum() { $("#psum").textContent = "共 " + all.length + " 題 · 會了 " + all.filter(function (x) { return probGot(c.id, x.p.id); }).length; }
    function apply() {
      var st = $("#f-step").value, lv = $("#f-lv").value, t = $("#f-test").checked, td = $("#f-todo").checked;
      all.forEach(function (x) {
        var el = document.getElementById("p-" + x.p.id), ok = (st === "" || +st === x.si) && (!lv || x.p.level === lv) && (!t || (x.p.tests && x.p.tests.length)) && (!td || !probGot(c.id, x.p.id));
        el.style.display = ok ? "" : "none";
      });
    }
    sum(); apply();
    ["#f-step", "#f-lv", "#f-test", "#f-todo"].forEach(function (s) { $(s).onchange = apply; });
    main.onchange = function (e) { var g = e.target.closest("[data-got]"); if (!g) return; markGot(c, g.closest(".prob"), g.checked); sum(); };
    main.onclick = function (e) { probClick(e, c, sum); };
    enhanceCode(main);
    if (allProblems(c).some(function (x) { return x.p.tests && x.p.tests.length; })) preheat("");
    typeset(main).then(function () { annotateTerms(main, c); if (focus && !stepOnly) { var el = document.getElementById("p-" + focus); if (el) { el.scrollIntoView({ block: "start" }); el.classList.add("flash"); } } });
  }
  function probCard(c, p, si) {
    var got = probGot(c.id, p.id), hs = p.hints || [], hasT = p.tests && p.tests.length;
    var src = p.source && p.source.label ? p.source.label : "";
    var h = '<div class="prob' + (got ? " got" : "") + '" id="p-' + attr(p.id) + '" data-pid="' + attr(p.id) + '"><div class="prob-head"><span class="lv lv-' + attr(p.level || "基礎") + '">' + esc(p.level || "基礎") + "</span>" +
      '<span class="org">' + esc(p.origin || "") + '</span><span class="prob-title"><span class="pid">' + esc(p.id) + "</span> " + esc(p.title) + "</span>" +
      (hasT ? '<span class="tag-test">💻 可線上提交</span>' : "") +
      (p.leetcode ? '<a class="lcchip" href="' + attr(p.leetcode.url) + '" target="_blank" rel="noopener">LeetCode #' + p.leetcode.no + " ↗</a>" : "") +
      (src ? '<span class="muted" style="font-size:12px">📄 ' + esc(src) + "</span>" : "") +
      '<label class="prob-got"><input type="checkbox" data-got' + (got ? " checked" : "") + "> 我會了</label></div>" +
      '<div class="md">' + md(p.q, true) + '</div><div class="prob-acts">' +
      (hasT || p.starter ? '<button class="pbtn code" data-a="code">💻 寫程式解題</button>' : "") +
      (p.plain ? '<button class="pbtn" data-a="plain">🗣 白話</button>' : "") +
      (hs.length ? '<button class="pbtn" data-a="hint">💡 提示 <span class="hc">0/' + hs.length + "</span></button>" : "") +
      '<button class="pbtn main" data-a="sol">📝 詳解</button>' + (p.srcRel ? '<a class="pbtn" href="' + attr(p.srcRel) + '" target="_blank">↗ 原始檔</a>' : "") + "</div>" +
      '<div class="pgslot"></div>' + (p.plain ? '<div class="prob-plain hidden">' + md(p.plain, true) + "</div>" : "") + '<ol class="prob-hints"></ol>' +
      '<div class="prob-sol hidden"><div class="md">' + md(p.solution, true) + "</div>" +
      (p.answer ? '<div class="prob-ans">✅ <b>答案</b> ' + inl(p.answer) + "</div>" : "") +
      (p.pitfalls && p.pitfalls.length ? '<div class="prob-pit"><b>⚠️ 常見錯誤</b><ul>' + p.pitfalls.map(function (x) { return "<li>" + inl(x) + "</li>"; }).join("") + "</ul></div>" : "") +
      (p.links && p.links.length ? '<div class="prob-links">🔗 ' + p.links.map(function (l) { return '<a href="' + attr(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + "</a>"; }).join("") + "</div>" : "") + "</div></div>";
    return h;
  }
  function markGot(c, card, v) { setProbGot(c.id, card.dataset.pid, v); card.classList.toggle("got", v); var b = $("[data-got]", card); if (b) b.checked = v; }
  function probClick(e, c, after) {
    var b = e.target.closest(".pbtn[data-a]"); if (!b) return;
    var card = b.closest(".prob"), p = null;
    allProblems(c).forEach(function (x) { if (x.p.id === card.dataset.pid) p = x.p; });
    if (!p) return;
    var a = b.dataset.a;
    function tog(sel) { var el = $(sel, card); el.classList.toggle("hidden"); b.classList.toggle("on", !el.classList.contains("hidden")); return el; }
    if (a === "plain") tog(".prob-plain");
    else if (a === "hint") { var ol = $(".prob-hints", card), n = ol.children.length; if (n < p.hints.length) { var li = document.createElement("li"); li.innerHTML = inl(p.hints[n]); ol.appendChild(li); typeset(li); n++; } $(".hc", b).textContent = n + "/" + p.hints.length; }
    else if (a === "sol") { var so = tog(".prob-sol"); if (!so._t) { so._t = 1; enhanceCode(so); typeset(so); } }
    else if (a === "code") {
      var slot = $(".pgslot", card);
      if (slot.firstChild) { slot.innerHTML = ""; b.classList.remove("on"); return; }
      slot.appendChild(playground(p.starter || "# 在這裡寫你的程式\n", { tests: p.tests, onPass: function () { markGot(c, card, true); if (after) after(); } })); b.classList.add("on");
    }
  }

  /* ---------- 測驗 ---------- */
  function renderQuiz(cid) {
    var c = byId(cid); if (!c || !c.quiz) return renderHome();
    var q = c.quiz, score = 0, done = {};
    function sh(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    main.innerHTML = '<div class="probs-wrap"><div class="muted" style="font-size:12.5px"><a href="#/c/' + c.id + '">' + esc(c.title) + '</a> › 測驗</div><h1 style="margin:6px 0 12px">❓ ' + esc(q.title) + '</h1><div class="qscore" id="qs">得分 0 / ' + q.items.length + "</div>" +
      q.items.map(function (it, i) {
        return '<div class="qcard" data-i="' + i + '"><b>Q' + (i + 1) + ". " + esc(it.q) + "</b>" + sh(it.options.map(function (o, k) { return '<button class="qopt" data-k="' + k + '">' + esc(o) + "</button>"; })).join("") + '<div class="qexp hidden"></div></div>';
      }).join("") + "</div>";
    main.onclick = function (e) {
      var o = e.target.closest(".qopt"); if (!o) return;
      var card = o.closest(".qcard"), i = +card.dataset.i, it = q.items[i], k = +o.dataset.k; if (done[i]) return; done[i] = 1;
      $$(".qopt", card).forEach(function (b) { b.classList.add("dis"); if (+b.dataset.k === it.a) b.classList.add("correct"); if (+b.dataset.k === k && k !== it.a) b.classList.add("wrong"); });
      if (k === it.a) score++;
      var ex = $(".qexp", card); ex.textContent = (k === it.a ? "✅ 正確。" : "❌ 正解:" + it.options[it.a] + "。") + (it.explain || ""); ex.classList.remove("hidden");
      $("#qs").textContent = "得分 " + score + " / " + q.items.length;
    };
  }

  /* ---------- LeetCode ---------- */
  function renderLC() {
    var L = D.leetcode || [], g = lsGet(LKEY, {});
    var h = '<div class="probs-wrap"><h1 style="margin:6px 0">🧩 LeetCode 刷題階梯</h1><p class="muted">課本每天「🧩 輔助關卡」挑的題目,依上課順序排好。全部選做,主線優先。</p>' +
      '<div class="filters"><span class="muted" id="lsum"></span><select id="l-d"><option value="">全部難度</option><option>Easy</option><option>Medium</option><option>Hard</option></select><label class="muted"><input type="checkbox" id="l-todo"> 只看還沒解的</label></div>' +
      '<div class="lc-table"><div class="lc-row"><span>解了</span><span>題目</span><span>難度</span><span>出現在</span></div>' + L.map(function (x) {
        var c = byId(x.cid);
        return '<div class="lc-row" data-no="' + x.no + '" data-d="' + attr(x.difficulty) + '"><span><input type="checkbox" data-lc="' + x.no + '"' + (g[x.no] ? " checked" : "") + '></span><span><a href="' + attr(x.url) + '" target="_blank" rel="noopener">' + x.no + ". " + esc(x.title) + " ↗</a></span>" +
          '<span class="lcd ' + (LC_CLS[x.difficulty] || "") + '">' + esc(x.difficulty || "—") + '</span><span><a href="' + (c ? stepHref(c, x.step) : "#/") + '">' + esc(x.stepTitle) + "</a><small>" + esc(c ? c.title : "") + "</small></span></div>";
      }).join("") + "</div></div>";
    main.innerHTML = h;
    function sum() { var g2 = lsGet(LKEY, {}); $("#lsum").textContent = "已解 " + L.filter(function (x) { return g2[x.no]; }).length + " / " + L.length; }
    function apply() { var d = $("#l-d").value, td = $("#l-todo").checked, g2 = lsGet(LKEY, {}); $$(".lc-row[data-no]").forEach(function (r) { r.style.display = (!d || r.dataset.d === d) && !(td && g2[r.dataset.no]) ? "" : "none"; }); }
    sum();
    $("#l-d").onchange = apply; $("#l-todo").onchange = apply;
    main.onchange = function (e) { var b = e.target.closest("[data-lc]"); if (!b) return; var g2 = lsGet(LKEY, {}); if (b.checked) g2[b.dataset.lc] = 1; else delete g2[b.dataset.lc]; lsSet(LKEY, g2); sum(); };
  }

  /* ---------- 術語註解 ---------- */
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function annotateTerms(el, c) {
    var G = c.glossary; if (!el || !G || !G.length) return;
    var map = {}, keys = [];
    G.forEach(function (g, gi) { [g.term].concat(g.alias || []).forEach(function (k) { if (!k || k.length < 2) return; var lk = k.toLowerCase(); if (!(lk in map)) { map[lk] = gi; keys.push(k); } }); });
    keys.sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp(keys.map(reEsc).join("|"), "gi"), used = {};
    var SKIP = /^(PRE|CODE|A|SCRIPT|STYLE|MJX-CONTAINER|H1|H2|BUTTON|TEXTAREA|SELECT|LABEL)$/;
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
      for (var p = n.parentNode; p && p !== el; p = p.parentNode) if (SKIP.test(p.nodeName) || (p.classList && (p.classList.contains("term") || p.classList.contains("pg") || p.classList.contains("prob-acts")))) return NodeFilter.FILTER_REJECT;
      return /\$|\\\(|@@MATH/.test(n.nodeValue) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
    var nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(function (node) {
      var t = node.nodeValue, m, last = 0, frag = null; re.lastIndex = 0;
      while ((m = re.exec(t))) {
        var gi = map[m[0].toLowerCase()]; if (gi === undefined || used[gi]) continue; used[gi] = 1;
        frag = frag || document.createDocumentFragment(); frag.appendChild(document.createTextNode(t.slice(last, m.index)));
        var g = G[gi], sp = document.createElement("span"); sp.className = "term"; sp.tabIndex = 0; sp.textContent = m[0];
        var tip = document.createElement("span"); tip.className = "tip";
        tip.innerHTML = "<b>" + esc(g.term) + "</b>" + (g.alias && g.alias.length ? " <i>" + esc(g.alias.join(" / ")) + "</i>" : "") + "<br>" + esc(g.def) + (g.url ? '<br><a href="' + attr(g.url) + '" target="_blank" rel="noopener">延伸閱讀 ↗</a>' : "");
        sp.appendChild(tip); frag.appendChild(sp); last = m.index + m[0].length;
      }
      if (frag) { frag.appendChild(document.createTextNode(t.slice(last))); node.parentNode.replaceChild(frag, node); }
    });
  }

  /* ---------- 搜尋 ---------- */
  var sidx = null;
  search.addEventListener("input", function () {
    var q = search.value.trim().toLowerCase();
    if (q.length < 2) { route(); return; }
    if (D.courses.some(function (c) { return c._lite; })) {
      main.innerHTML = '<div class="loading-page"><div class="spin"></div>第一次搜尋:載入全部課程內容…</div>';
      ensureAll().then(function () { search.dispatchEvent(new Event("input")); });
      return;
    }
    if (!sidx) {
      sidx = [];
      D.courses.forEach(function (c) {
        c.steps.forEach(function (s, i) {
          if (s.noteIndex >= 0) sidx.push({ h: "#/read/" + c.id + "/" + i, t: "📘 " + s.title, c: c.title, x: c.notes[s.noteIndex].content.toLowerCase() });
          lessonsOf(s).forEach(function (f, k) { sidx.push({ h: "#/learn/" + c.id + "/" + i + "/" + k, t: "🎬 " + f.path, c: c.title, x: (f.path + "\n" + f.content + "\n" + f.lesson.segments.map(function (g) { return g.say; }).join("\n")).toLowerCase() }); });
        });
        allProblems(c).forEach(function (x) { sidx.push({ h: "#/practice/" + c.id + "/" + encodeURIComponent(x.p.id), t: "🎯 " + x.p.id + " " + x.p.title, c: c.title, x: [x.p.title, x.p.q, x.p.solution].join("\n").toLowerCase() }); });
      });
    }
    var hits = sidx.filter(function (x) { return x.x.indexOf(q) >= 0; }).slice(0, 60);
    main.classList.remove("full"); document.body.classList.remove("in-room");
    main.innerHTML = '<div class="probs-wrap"><h1>🔍「' + esc(search.value.trim()) + '」</h1><p class="muted">' + hits.length + ' 筆</p><div class="results">' + hits.map(function (x) {
      var p = x.x.indexOf(q); return '<a href="' + x.h + '"><b>' + esc(x.c) + "</b> › " + esc(x.t) + "<small>…" + esc(x.x.slice(Math.max(0, p - 40), p + 70)) + "…</small></a>";
    }).join("") + "</div></div>";
  });
  main.addEventListener("click", function (e) { if (e.target.closest(".results a")) search.value = ""; });

  // LINE / FB / IG 的內建瀏覽器不支援朗讀:提示改用手機瀏覽器開(LINE 可用 openExternalBrowser=1 直接跳出去)
  (function () {
    var ua = navigator.userAgent, isLine = / Line\//i.test(ua), inApp = isLine || /FBAN|FBAV|Instagram|Messenger/i.test(ua);
    if (!inApp || lsGet("pyl_inapp_ok", false)) return;
    var ext = location.origin + location.pathname + "?openExternalBrowser=1" + location.hash;
    var b = document.createElement("div"); b.className = "inapp-bar";
    b.innerHTML = "<span>📢 你在 " + (isLine ? "LINE" : "App") + " 裡開啟,這裡<b>旁白不會有聲音</b>、執行程式也比較慢。</span>" +
      (isLine ? '<a class="btn gold sm" href="' + attr(ext) + '">用瀏覽器開啟</a>' : '<span class="muted">請按右上「⋯」→ 用瀏覽器開啟</span>') +
      '<button class="icon-btn" title="不再提醒">✕</button>';
    b.querySelector("button").onclick = function () { lsSet("pyl_inapp_ok", true); b.remove(); };
    document.body.insertBefore(b, document.body.firstChild);
  })();
  route();
})();
