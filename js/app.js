/* ============================================================
 * 动物塑性格测评 - 应用逻辑
 * 纯前端本地运算：计分 → MBTI → D反差 → 32动物 → 匹配度
 * 一人一码：本地生成，本地校验，链接永不带结果参数
 * ============================================================ */

(function () {
  "use strict";

  const { QUESTIONS, ANIMALS, MATCH_LEVELS, DISCLAIMER } = window.ANIMAL_DATA;
  const TOTAL = QUESTIONS.length;

  // 后端 API 地址：可在 index.html 设置 window.API_BASE，否则用相对路径（同域部署）
  const API_BASE = (typeof window !== "undefined" && window.API_BASE) || "";
  const VERIFY_URL = API_BASE + "/api/verify";

  /* ---------- 状态（仅存内存，刷新即清空作答记录）---------- */
  let answers = new Array(TOTAL).fill(null); // 每题选中的选项索引
  let currentIdx = 0;

  /* ---------- DOM ---------- */
  const $ = (s) => document.querySelector(s);
  const pages = {
    home: $("#page-home"),
    quiz: $("#page-quiz"),
    loading: $("#page-loading"),
    result: $("#page-result"),
  };

  function showPage(name) {
    Object.values(pages).forEach((p) => p && p.classList.remove("active"));
    if (pages[name]) pages[name].classList.add("active");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  /* ============================================================
   * 计分系统
   * ============================================================ */

  // 累计8维原始分 + S/N、J/P 维度
  function calcRawScores() {
    const raw = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0, DEF: 0, TOL: 0, EXT: 0, HID: 0 };
    answers.forEach((optIdx, qIdx) => {
      if (optIdx === null) return;
      const score = QUESTIONS[qIdx].options[optIdx].score;
      Object.keys(score).forEach((k) => {
        raw[k] = (raw[k] || 0) + score[k];
      });
    });
    return raw;
  }

  // MBTI 四维二分
  function calcMBTI(raw) {
    const ei = raw.E >= raw.I ? "E" : "I";
    const sn = raw.S >= raw.N ? "S" : "N";
    const tf = raw.T >= raw.F ? "T" : "F";
    const jp = raw.J >= raw.P ? "J" : "P";
    return ei + sn + tf + jp;
  }

  // D 反差维度：HID+DEF 越高于 EXT+TOL，反差越大
  function calcD(raw) {
    const contrast = (raw.HID + raw.DEF) - (raw.EXT + raw.TOL);
    return contrast > 0 ? 2 : 1; // D2 高反差 / D1 表里同质
  }

  // 匹配度 70-99%：四维越极端越高
  function calcMatch(raw) {
    const pairs = [
      [raw.E, raw.I],
      [raw.S, raw.N],
      [raw.T, raw.F],
      [raw.J, raw.P],
    ];
    let sum = 0;
    pairs.forEach(([a, b]) => {
      const total = a + b;
      if (total === 0) { sum += 0; return; }
      sum += Math.abs(a - b) / total; // 0~1
    });
    const avg = sum / pairs.length; // 0~1
    let match = 70 + Math.round(avg * 29);
    if (match < 70) match = 70;
    if (match > 99) match = 99;
    return match;
  }

  function matchLevel(match) {
    if (match >= 90) return { key: "high", label: "高度契合" };
    if (match >= 80) return { key: "mid", label: "中度契合" };
    return { key: "low", label: "轻度契合" };
  }

  // 主计算：返回完整结果对象
  function computeResult() {
    const raw = calcRawScores();
    const mbti = calcMBTI(raw);
    const d = calcD(raw);
    const match = calcMatch(raw);
    const animal = ANIMALS[`${mbti}_D${d}`];
    return { raw, mbti, d, match, animal };
  }

  /* ============================================================
   * 一人一码机制
   * 结果+码 存 localStorage（可无限次本人重看）；作答记录仅存内存
   * ============================================================ */

  const CODE_PREFIX = "AS"; // AnimalShaping
  const STORE_KEY = "animal_shaping_codes"; // { code: resultData }
  const AUTH_KEY = "animal_shaping_auth"; // 本设备入场授权码（有码才能玩）

  /* ---------- 入场授权（一人一码一设备 · 跨设备防复用）---------- */
  function getAuth() {
    try { return localStorage.getItem(AUTH_KEY); } catch (e) { return null; }
  }
  function setAuth(code) {
    try { localStorage.setItem(AUTH_KEY, code); } catch (e) { /* 忽略 */ }
  }

  // 设备ID：localStorage 持久 UUID + 浏览器指纹兜底
  // 同一设备（未清缓存）永远是同一ID → 本人可无限次用码
  // 换设备/清缓存 → 不同ID → 别人的码会被后端拒绝
  const DEVICE_KEY = "animal_shaping_device_id";
  function getDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (id) return id;
      id = generateDeviceId();
      localStorage.setItem(DEVICE_KEY, id);
      return id;
    } catch (e) {
      return generateDeviceId();
    }
  }

  // 指纹兜底：即使 localStorage 被清，也尽量用浏览器特征生成稳定ID
  function generateDeviceId() {
    const fp = [
      navigator.userAgent || "",
      navigator.language || "",
      (screen.width || 0) + "x" + (screen.height || 0) + "x" + (screen.colorDepth || 0),
      new Date().getTimezoneOffset(),
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      canvasFingerprint(),
    ].join("|");
    return "dev_" + hashStr(fp);
  }

  function canvasFingerprint() {
    try {
      const c = document.createElement("canvas");
      c.width = 200; c.height = 50;
      const ctx = c.getContext("2d");
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(10, 5, 60, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("animal-shaping-🌸", 2, 2);
      return c.toDataURL().length.toString(36);
    } catch (e) {
      return "nocanvas";
    }
  }

  // 简易字符串hash → 32位hex
  function hashStr(s) {
    let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // 生成 6-8 位唯一随机码
  function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去除易混字符
    const len = 6 + Math.floor(Math.random() * 3); // 6~8
    let code = CODE_PREFIX;
    for (let i = 0; i < len; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  function loadStore() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }

  function saveStore(store) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) {
      /* 容量不足等忽略 */
    }
  }

  // 保存结果，返回唯一码
  function saveResult(result) {
    const store = loadStore();
    let code;
    do {
      code = generateCode();
    } while (store[code]); // 保证唯一
    store[code] = {
      animal: result.animal,
      mbti: result.mbti,
      d: result.d,
      match: result.match,
      ts: Date.now(),
    };
    saveStore(store);
    return code;
  }

  // 校验码 → 返回结果或 null
  function verifyCode(code) {
    const store = loadStore();
    const data = store[code];
    if (!data) return null;
    return data;
  }

  /* ============================================================
   * 首页
   * ============================================================ */
  function initHome() {
    $("#btn-start").addEventListener("click", checkAuthAndStart);
  }

  // 入场授权门：本设备已授权则直接开始，否则弹窗要码
  function checkAuthAndStart() {
    if (getAuth()) {
      startQuiz();
    } else {
      openCodeModal();
    }
  }

  /* ============================================================
   * 授权码弹窗
   * ============================================================ */
  function openCodeModal(prefillError) {
    const modal = $("#code-modal");
    const input = $("#code-input");
    const err = $("#code-error");
    input.value = "";
    err.textContent = prefillError || "";
    err.style.display = prefillError ? "block" : "none";
    modal.classList.add("active");
    setTimeout(() => input.focus(), 100);
  }

  function closeCodeModal() {
    $("#code-modal").classList.remove("active");
  }

  async function submitCode() {
    const code = $("#code-input").value.trim().toUpperCase();
    const err = $("#code-error");
    const btn = $("#code-submit");
    if (!code) {
      err.textContent = "请输入你的专属授权码";
      err.style.display = "block";
      return;
    }
    // 调用后端校验码-设备绑定
    btn.disabled = true;
    err.style.display = "none";
    btn.textContent = "校验中…";
    try {
      const res = await fetch(VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, deviceId: getDeviceId() }),
      });
      const data = await res.json();
      btn.disabled = false;
      btn.textContent = "开始测试";
      if (!data.ok) {
        err.textContent = data.msg || "授权失败";
        err.style.display = "block";
        return;
      }
      setAuth(code);
      closeCodeModal();
      toast(data.first ? "授权成功，开始测试吧" : "欢迎回来，开始测试");
      startQuiz();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "开始测试";
      err.textContent = "网络异常，请检查网络后重试";
      err.style.display = "block";
    }
  }

  function initCodeModal() {
    $("#code-close").addEventListener("click", closeCodeModal);
    $("#code-submit").addEventListener("click", submitCode);
    $("#code-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitCode();
    });
    $("#code-modal .modal-mask").addEventListener("click", closeCodeModal);
  }

  /* ============================================================
   * 答题页
   * ============================================================ */
  function startQuiz() {
    answers = new Array(TOTAL).fill(null);
    currentIdx = 0;
    renderQuiz();
    showPage("quiz");
  }

  function renderQuiz() {
    const q = QUESTIONS[currentIdx];
    $("#quiz-title").textContent = `第 ${currentIdx + 1} / ${TOTAL} 题`;
    $("#quiz-question").textContent = q.q;

    // 进度条
    const answered = answers.filter((a) => a !== null).length;
    const pct = Math.round((answered / TOTAL) * 100);
    $("#progress-bar").style.width = pct + "%";
    $("#progress-text").textContent = `${answered} / ${TOTAL}`;

    // 选项
    const list = $("#quiz-options");
    list.innerHTML = "";
    q.options.forEach((opt, i) => {
      const li = document.createElement("li");
      li.className = "option" + (answers[currentIdx] === i ? " selected" : "");
      li.innerHTML = `<span class="opt-letter">${String.fromCharCode(65 + i)}</span><span class="opt-text">${opt.text}</span>`;
      li.addEventListener("click", () => selectOption(i));
      list.appendChild(li);
    });

    // 按钮状态
    $("#btn-prev").disabled = currentIdx === 0;
    $("#btn-next").disabled = true;
    $("#btn-submit").style.display = "none";

    if (answers[currentIdx] !== null) {
      if (currentIdx < TOTAL - 1) {
        $("#btn-next").disabled = false;
      } else {
        // 最后一题，检查是否全部答完
        if (answers.every((a) => a !== null)) {
          $("#btn-submit").style.display = "inline-flex";
          $("#btn-next").style.display = "none";
        }
      }
    }

    // 最后一题隐藏 next，显示 submit（仅在全部答完时）
    if (currentIdx === TOTAL - 1) {
      $("#btn-next").style.display = answers.every((a) => a !== null) ? "none" : "inline-flex";
      if (answers.every((a) => a !== null)) {
        $("#btn-submit").style.display = "inline-flex";
      }
    } else {
      $("#btn-next").style.display = "inline-flex";
      $("#btn-submit").style.display = "none";
    }
  }

  function selectOption(i) {
    answers[currentIdx] = i;
    // 自动跳下一题（最后一题不跳）
    if (currentIdx < TOTAL - 1) {
      // 短暂延迟让选中动画播放
      setTimeout(() => {
        currentIdx++;
        renderQuiz();
      }, 220);
    } else {
      renderQuiz();
    }
  }

  function initQuiz() {
    $("#btn-prev").addEventListener("click", () => {
      if (currentIdx > 0) {
        currentIdx--;
        renderQuiz();
      }
    });
    $("#btn-next").addEventListener("click", () => {
      if (currentIdx < TOTAL - 1 && answers[currentIdx] !== null) {
        currentIdx++;
        renderQuiz();
      }
    });
    $("#btn-submit").addEventListener("click", submitQuiz);
  }

  function submitQuiz() {
    if (!answers.every((a) => a !== null)) return;
    // 加载动画 1.5-2s
    showPage("loading");
    const delay = 1500 + Math.random() * 500; // 1.5~2s
    setTimeout(() => {
      const result = computeResult();
      const code = saveResult(result);
      renderResult(result.animal, result.match, code, result.mbti, result.d);
      showPage("result");
    }, delay);
  }

  /* ============================================================
   * 结果页
   * ============================================================ */
  function renderResult(animal, match, code, mbti, d) {
    const lv = matchLevel(match);
    $("#res-emoji").textContent = animal.emoji;
    $("#res-name").textContent = animal.name;
    $("#res-type").textContent = `${animal.type} · ${d === 2 ? "高反差" : "表里同质"}`;
    $("#res-match-num").textContent = match;
    $("#res-match-label").textContent = lv.label;
    $("#res-match-desc").textContent = MATCH_LEVELS[lv.key];

    // 标签
    const tagBox = $("#res-tags");
    tagBox.innerHTML = "";
    animal.tags.forEach((t) => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = t;
      tagBox.appendChild(span);
    });

    $("#res-external").textContent = animal.external;
    $("#res-internal").textContent = animal.internal;
    $("#res-meme").textContent = animal.meme;
    $("#res-code").textContent = code;
    $("#disclaimer").textContent = DISCLAIMER;

    // 准备海报数据
    posterData = { animal, match, code, mbti, d, lvLabel: lv.label, lvDesc: MATCH_LEVELS[lv.key] };
  }

  let posterData = null;

  function initResult() {
    $("#btn-retry").addEventListener("click", () => {
      showPage("home");
    });
    $("#btn-poster").addEventListener("click", savePoster);
    $("#btn-copy-code").addEventListener("click", copyCode);
  }

  function copyCode() {
    const code = $("#res-code").textContent;
    navigator.clipboard?.writeText(code).then(
      () => toast("授权码已复制"),
      () => toast("复制失败，请手动记录")
    );
  }

  /* ============================================================
   * 海报生成（干净图，无溯源链接）
   * ============================================================ */
  function buildPosterHTML() {
    const d = posterData;
    const tagsHTML = d.animal.tags.map((t) => `<span class="p-tag">${t}</span>`).join("");
    return `
      <div class="poster-card">
        <div class="p-top">动物塑性格测评</div>
        <div class="p-emoji">${d.animal.emoji}</div>
        <div class="p-name">${d.animal.name}</div>
        <div class="p-type">${d.animal.type} · ${d.d === 2 ? "高反差" : "表里同质"}</div>
        <div class="p-match">
          <span class="p-match-num">${d.match}</span><span class="p-match-pct">%</span>
          <span class="p-match-lv">${d.lvLabel}</span>
        </div>
        <div class="p-tags">${tagsHTML}</div>
        <div class="p-section">
          <div class="p-sec-title">别人眼中的你</div>
          <div class="p-sec-text">${d.animal.external}</div>
        </div>
        <div class="p-section">
          <div class="p-sec-title">真实内核反差</div>
          <div class="p-sec-text">${d.animal.internal}</div>
        </div>
        <div class="p-section">
          <div class="p-sec-title">趣味小梗</div>
          <div class="p-sec-text">${d.animal.meme}</div>
        </div>
        <div class="p-code">专属授权码：${d.code}</div>
        <div class="p-foot">${DISCLAIMER}</div>
      </div>
    `;
  }

  function savePoster() {
    if (!posterData) return;
    const wrap = $("#poster-render");
    wrap.innerHTML = buildPosterHTML();
    const node = wrap.querySelector(".poster-card");
    if (typeof html2canvas === "undefined") {
      toast("海报组件加载失败，请刷新重试");
      return;
    }
    toast("海报生成中…");
    html2canvas(node, {
      scale: 2,
      backgroundColor: "#fff7f0",
      useCORS: true,
      logging: false,
    }).then((canvas) => {
      const link = document.createElement("a");
      link.download = `动物塑-${posterData.animal.name}-${posterData.code}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      wrap.innerHTML = "";
      toast("海报已保存");
    }).catch(() => {
      toast("海报生成失败，请重试");
      wrap.innerHTML = "";
    });
  }

  /* ============================================================
   * 轻提示
   * ============================================================ */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  /* ============================================================
   * 初始化
   * ============================================================ */
  function init() {
    initHome();
    initCodeModal();
    initQuiz();
    initResult();
    showPage("home");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
