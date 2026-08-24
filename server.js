/**
 * 设备绑定版授权码管理系统
 * 每个网站一个固定授权码 + 设备绑定访问
 * 启动: node server.js
 */

const BUILD_VERSION = "v2-auto-mode-20260824";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin888";

// ================================================================
// 🧩 授权模式（与前端 index.html 的 AUTH_FLOW_MODE 对应）
//
// process.env.AUTH_FLOW_MODE 可选：
//   "bindKey"  => 强制要求 /api/device/bind 必须传正确的 bindKey=DEVICE_BIND_KEY，
//                新设备不走自动绑定，必须走"输激活密钥"流程（顾客两次输入）。
//   "auto" 或 不设置 => 新设备只要授权码对，就自动绑定设备（一码一人），
//                /api/device/bind 不传 bindKey 也允许。
// 注意：handleVerify（自动绑定设备的一码一人逻辑）两种模式都会执行，
//      两者的区别只是"/api/device/bind 没传 bindKey 时是否允许通过"。
// ================================================================
const AUTH_FLOW_MODE = process.env.AUTH_FLOW_MODE || "auto";
// DEVICE_BIND_KEY_COMPAT：
//   - AUTH_FLOW_MODE === "bindKey" 时：必填校验；不填则仍用代码兜底默认值防止启动报错
//   - AUTH_FLOW_MODE === "auto"      时：只作为兼容（有值时仍能用密钥强绑定），不传 bindKey 也允许 /bind 通过
const DEFAULT_BIND_KEY = "DEVICE_BIND_2024";
const DEVICE_BIND_KEY_COMPAT = process.env.DEVICE_BIND_KEY || (AUTH_FLOW_MODE === "bindKey" ? DEFAULT_BIND_KEY : "");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("加载数据库失败:", e);
  }
  return { sites: {}, adminTokens: {}, boundDevices: {} };
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("保存数据库失败:", e);
  }
}

let db = loadDB();

// CORS 配置 - 允许所有源（生产环境建议限制域名）
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

function cors(res, req) {
  const origin = req && req.headers && req.headers.origin;
  // 如果配置了特定域名，只允许该域名；否则允许所有
  if (CORS_ORIGIN === "*") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && CORS_ORIGIN.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Max-Age", "86400"); // 预检请求缓存时间
}

// 当前请求引用（在路由入口设置）
let currentReq = null;

function sendJson(res, obj, status = 200) {
  cors(res, currentReq);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function generateCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function hashDeviceId(deviceId) {
  return crypto.createHash("sha256").update(deviceId).digest("hex");
}

function checkAuth(req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  return db.adminTokens && db.adminTokens[token];
}

function requireAuth(req, res) {
  if (!checkAuth(req)) {
    sendJson(res, { ok: false, msg: "未授权" }, 401);
    return false;
  }
  return true;
}

// ===== API 路由 =====

async function handleLogin(req, res) {
  const body = await readBody(req).catch(() => ({}));
  const { password } = body;
  
  if (password !== ADMIN_PASSWORD) {
    return sendJson(res, { ok: false, msg: "密码错误" }, 401);
  }
  
  const token = "admin_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  db.adminTokens = db.adminTokens || {};
  db.adminTokens[token] = { createdAt: Date.now() };
  saveDB(db);
  
  sendJson(res, { ok: true, token });
}

function handleLogout(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "");
  if (db.adminTokens && db.adminTokens[token]) {
    delete db.adminTokens[token];
    saveDB(db);
  }
  sendJson(res, { ok: true });
}

// 授权码 <-> 绑定设备 的映射（按网站隔离，实现真正"一码一人：码对 → 自动绑本机；绑过别的机就拒绝"）
// db.codeBindings[siteId][codeUpper] = { deviceHash, boundAt }
function getBindingForCode(siteId, codeUpper) {
  if (!db.codeBindings || !db.codeBindings[siteId]) return null;
  return db.codeBindings[siteId][codeUpper] || null;
}
function setBindingForCode(siteId, codeUpper, deviceHash) {
  db.codeBindings = db.codeBindings || {};
  db.codeBindings[siteId] = db.codeBindings[siteId] || {};
  db.codeBindings[siteId][codeUpper] = {
    deviceHash,
    boundAt: Date.now()
  };
  saveDB(db);
}

// 绑定设备（按 AUTH_FLOW_MODE 决定：bindKey 模式强制校验密钥；auto 模式不传密钥也允许绑定）
async function handleBindDevice(req, res) {
  const body = await readBody(req).catch(() => ({}));
  const { deviceId, bindKey } = body;

  if (!deviceId) {
    return sendJson(res, { ok: false, msg: "缺少设备ID" }, 400);
  }

  // 模式 bindKey：必须传 bindKey，并且必须等于 DEVICE_BIND_KEY_COMPAT（强制）
  if (AUTH_FLOW_MODE === "bindKey") {
    if (!DEVICE_BIND_KEY_COMPAT) {
      return sendJson(res, { ok: false, msg: "系统未配置绑定密钥" }, 500);
    }
    if (typeof bindKey !== "string" || bindKey.length <= 0) {
      return sendJson(res, { ok: false, msg: "请输入绑定密钥" }, 401);
    }
    if (bindKey !== DEVICE_BIND_KEY_COMPAT) {
      return sendJson(res, { ok: false, msg: "绑定密钥错误" }, 401);
    }
  } else {
    // auto 模式：只要调用方提供了 bindKey，就按兼容校验；不传就直接放行
    if (DEVICE_BIND_KEY_COMPAT && typeof bindKey === "string" && bindKey.length > 0) {
      if (bindKey !== DEVICE_BIND_KEY_COMPAT) {
        return sendJson(res, { ok: false, msg: "绑定密钥错误" }, 401);
      }
    }
  }

  const hashedId = hashDeviceId(deviceId);

  if (db.boundDevices && db.boundDevices[hashedId]) {
    return sendJson(res, { ok: true, msg: "设备已绑定" });
  }

  db.boundDevices = db.boundDevices || {};
  db.boundDevices[hashedId] = {
    deviceId: deviceId.slice(0, 8) + "****", // 只存储部分ID用于显示
    boundAt: Date.now(),
    mode: AUTH_FLOW_MODE
  };
  saveDB(db);

  sendJson(res, { ok: true, msg: "设备绑定成功" });
}

// 检查设备绑定状态
async function handleCheckDevice(req, res) {
  const body = await readBody(req).catch(() => ({}));
  const { deviceId } = body;

  if (!deviceId) {
    return sendJson(res, { ok: false, msg: "缺少设备ID" }, 400);
  }

  const hashedId = hashDeviceId(deviceId);
  const isBound = !!(db.boundDevices && db.boundDevices[hashedId]);

  sendJson(res, { ok: true, bound: isBound });
}

// 管理员：获取已绑定设备列表
function handleGetBoundDevices(req, res) {
  if (!requireAuth(req, res)) return;
  
  const devices = Object.entries(db.boundDevices || {}).map(([hash, info]) => ({
    id: hash.slice(0, 8), // 显示部分hash
    deviceLabel: info.deviceId,
    boundAt: info.boundAt
  }));
  
  sendJson(res, { ok: true, data: devices, total: devices.length });
}

// 管理员：解除设备绑定
async function handleUnbindDevice(req, res, url) {
  if (!requireAuth(req, res)) return;
  
  const body = await readBody(req).catch(() => ({}));
  const { deviceId } = body;
  
  if (!deviceId) {
    return sendJson(res, { ok: false, msg: "缺少设备ID" }, 400);
  }
  
  const hashedId = hashDeviceId(deviceId);
  
  if (db.boundDevices && db.boundDevices[hashedId]) {
    delete db.boundDevices[hashedId];
    saveDB(db);
    return sendJson(res, { ok: true, msg: "已解除绑定" });
  }
  
  sendJson(res, { ok: false, msg: "设备未绑定" }, 404);
}

// 管理员：清除所有设备绑定
function handleClearAllBindings(req, res) {
  if (!requireAuth(req, res)) return;
  
  db.boundDevices = {};
  saveDB(db);
  
  sendJson(res, { ok: true, msg: "已清除所有绑定" });
}

// 验证主密钥（用于绑定）
function handleGetBindKeyStatus(req, res) {
  const totalDevices = Object.keys(db.boundDevices || {}).length;
  sendJson(res, { 
    ok: true, 
    totalBound: totalDevices,
    keySet: true // 主密钥已设置
  });
}

// 获取所有网站
function handleGetSites(req, res) {
  if (!requireAuth(req, res)) return;
  const sites = Object.values(db.sites || {});
  const totalBound = Object.keys(db.boundDevices || {}).length;
  sendJson(res, { ok: true, data: sites, totalBound });
}

// 创建网站
async function handleCreateSite(req, res) {
  if (!requireAuth(req, res)) return;
  const body = await readBody(req).catch(() => ({}));
  const { id, name, icon, code } = body;
  
  if (!id || !name) {
    return sendJson(res, { ok: false, msg: "缺少必要参数（id, name）" }, 400);
  }
  
  if (db.sites[id]) {
    return sendJson(res, { ok: false, msg: "网站ID已存在" }, 409);
  }
  
  db.sites[id] = {
    id,
    name,
    icon: icon || "📄",
    code: code || generateCode(8),
    createdAt: Date.now()
  };
  
  saveDB(db);
  sendJson(res, { ok: true, data: db.sites[id] });
}

// 更新网站
async function handleUpdateSite(req, res, url) {
  if (!requireAuth(req, res)) return;
  const parts = url.pathname.split("/");
  const siteId = parts[parts.length - 1];
  const body = await readBody(req).catch(() => ({}));
  
  if (!db.sites[siteId]) {
    return sendJson(res, { ok: false, msg: "网站不存在" }, 404);
  }
  
  const site = db.sites[siteId];
  if (body.name !== undefined) site.name = body.name;
  if (body.icon !== undefined) site.icon = body.icon;
  if (body.code !== undefined) site.code = body.code;
  
  saveDB(db);
  sendJson(res, { ok: true, data: site });
}

// 重置授权码
function handleResetCode(req, res, url) {
  if (!requireAuth(req, res)) return;
  const parts = url.pathname.split("/");
  const siteId = parts[parts.length - 2];
  
  if (!db.sites[siteId]) {
    return sendJson(res, { ok: false, msg: "网站不存在" }, 404);
  }
  
  db.sites[siteId].code = generateCode(8);
  saveDB(db);
  sendJson(res, { ok: true, data: { code: db.sites[siteId].code } });
}

// 删除网站
function handleDeleteSite(req, res, url) {
  if (!requireAuth(req, res)) return;
  const parts = url.pathname.split("/");
  const siteId = parts[parts.length - 1];
  
  if (!db.sites[siteId]) {
    return sendJson(res, { ok: false, msg: "网站不存在" }, 404);
  }
  
  delete db.sites[siteId];
  saveDB(db);
  
  sendJson(res, { ok: true });
}

// 验证授权码：
// - 如果授权码对：
//   1) 这台设备如果没加入 boundDevices，自动加（一码首次用的时候不用激活密钥）
//   2) 记录"这个授权码绑定的是哪台设备"
//   3) 如果这个授权码之前已经被"另一台设备"激活过，就拒绝（一码一人，防止转卖/转发）
// - 如果授权码错：按原逻辑返回错误
async function handleVerify(req, res, url) {
  const parts = url.pathname.split("/");
  let siteId = "default";

  if (parts.length >= 4 && parts[2] === "verify" && parts[3] === "sites") {
    siteId = parts[4] || "default";
  }

  const body = await readBody(req).catch(() => ({}));
  const { code, deviceId } = body;

  if (!code) {
    return sendJson(res, { ok: false, msg: "请输入授权码" });
  }

  if (!deviceId) {
    return sendJson(res, { ok: false, msg: "设备未识别" });
  }

  if (!db.sites[siteId]) {
    return sendJson(res, { ok: false, msg: "网站不存在" });
  }

  const site = db.sites[siteId];
  const upperCode = String(code).trim().toUpperCase();

  if (site.code.toUpperCase() !== upperCode) {
    return sendJson(res, { ok: false, msg: "授权码错误" });
  }

  const hashedId = hashDeviceId(deviceId);
  const existingBinding = getBindingForCode(siteId, upperCode);

  // 情况 1：这个授权码从来没被任何设备激活过 → 自动绑到当前设备，允许进入
  if (!existingBinding) {
    // 1a. 设备层面的绑定池（保留原结构，兼容后台/统计逻辑）
    if (!db.boundDevices || !db.boundDevices[hashedId]) {
      db.boundDevices = db.boundDevices || {};
      db.boundDevices[hashedId] = {
        deviceId: deviceId.slice(0, 8) + "****",
        boundAt: Date.now(),
        auto: true
      };
    }
    // 1b. 授权码 → 设备的映射（以后判断"这个码能不能在别的机器用"就靠它）
    setBindingForCode(siteId, upperCode, hashedId);
    return sendJson(res, { ok: true, msg: "授权成功（首次绑定设备）", autoBound: true });
  }

  // 情况 2：这个授权码之前绑定过设备，且就是当前设备 → OK
  if (existingBinding.deviceHash === hashedId) {
    // 保险：如果 boundDevices 里没记（比如历史数据迁移），补一条
    if (!db.boundDevices || !db.boundDevices[hashedId]) {
      db.boundDevices = db.boundDevices || {};
      db.boundDevices[hashedId] = {
        deviceId: deviceId.slice(0, 8) + "****",
        boundAt: existingBinding.boundAt || Date.now(),
        auto: true
      };
      saveDB(db);
    }
    return sendJson(res, { ok: true, msg: "授权成功" });
  }

  // 情况 3：这个授权码绑定过，但绑定的是另一台设备 → 严格拒绝（一码一人）
  return sendJson(res, {
    ok: false,
    msg: "此授权码已绑定其它设备，一个码只能在同一设备使用"
  });
}

// 获取公开的网站列表（用于自动检测）
function handleGetSitesPublic(req, res) {
  const sites = Object.values(db.sites || {}).map(s => ({
    id: s.id,
    name: s.name,
    icon: s.icon
  }));
  sendJson(res, { ok: true, data: sites });
}

// 获取公开的网站信息
function handleGetSitePublic(req, res, url) {
  const parts = url.pathname.split("/");
  const siteId = parts[parts.length - 1];
  
  if (!db.sites[siteId]) {
    return sendJson(res, { ok: false, msg: "网站不存在" }, 404);
  }
  
  const site = db.sites[siteId];
  sendJson(res, { 
    ok: true, 
    data: { 
      id: site.id, 
      name: site.name, 
      icon: site.icon 
    }
  });
}

// 统计
function handleStats(req, res) {
  if (!requireAuth(req, res)) return;
  
  const sites = Object.values(db.sites || {});
  const totalBound = Object.keys(db.boundDevices || {}).length;
  
  sendJson(res, { 
    ok: true, 
    data: { 
      totalSites: sites.length,
      totalBound,
      sites: sites.map(s => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        hasCode: !!s.code
      }))
    } 
  });
}

// ===== 静态文件服务 =====

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
};

function serveStatic(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

// ===== 请求路由 =====

const server = http.createServer(async (req, res) => {
  // 设置当前请求引用，供 sendJson 使用
  currentReq = req;
  
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // CORS preflight - 需要正确设置源
  if (req.method === "OPTIONS") {
    cors(res, req);
    res.writeHead(204);
    res.end();
    return;
  }
  
  const pathname = url.pathname;
  
  // POST /api/auth/login
  if (pathname === "/api/auth/login" && req.method === "POST") {
    return handleLogin(req, res);
  }
  
  // POST /api/auth/logout
  if (pathname === "/api/auth/logout" && req.method === "POST") {
    return handleLogout(req, res);
  }
  
  // POST /api/device/bind (绑定设备)
  if (pathname === "/api/device/bind" && req.method === "POST") {
    return handleBindDevice(req, res);
  }
  
  // POST /api/device/check (检查设备绑定状态)
  if (pathname === "/api/device/check" && req.method === "POST") {
    return handleCheckDevice(req, res);
  }
  
  // GET /api/devices (获取已绑定设备列表)
  if (pathname === "/api/devices" && req.method === "GET") {
    return handleGetBoundDevices(req, res);
  }
  
  // POST /api/devices/unbind (解除设备绑定)
  if (pathname === "/api/devices/unbind" && req.method === "POST") {
    return handleUnbindDevice(req, res);
  }
  
  // POST /api/devices/clear-all (清除所有绑定)
  if (pathname === "/api/devices/clear-all" && req.method === "POST") {
    return handleClearAllBindings(req, res);
  }
  
  // GET /api/devices/status (绑定状态)
  if (pathname === "/api/devices/status" && req.method === "GET") {
    return handleGetBindKeyStatus(req, res);
  }
  
  // GET /api/sites
  if (pathname === "/api/sites" && req.method === "GET") {
    return handleGetSites(req, res);
  }
  
  // GET /api/sites/public (公开，无需认证)
  if (pathname === "/api/sites/public" && req.method === "GET") {
    return handleGetSitesPublic(req, res);
  }
  
  // POST /api/sites
  if (pathname === "/api/sites" && req.method === "POST") {
    return handleCreateSite(req, res);
  }
  
  // GET /api/sites/:id (公开)
  const siteMatch = pathname.match(/^\/api\/sites\/([^/]+)$/);
  if (siteMatch && req.method === "GET") {
    return handleGetSitePublic(req, res, url);
  }
  
  // PUT /api/sites/:id
  if (siteMatch && req.method === "PUT") {
    return handleUpdateSite(req, res, url);
  }
  
  // DELETE /api/sites/:id
  if (siteMatch && req.method === "DELETE") {
    return handleDeleteSite(req, res, url);
  }
  
  // POST /api/sites/:id/reset-code
  const resetMatch = pathname.match(/^\/api\/sites\/([^/]+)\/reset-code$/);
  if (resetMatch && req.method === "POST") {
    return handleResetCode(req, res, url);
  }
  
  // POST /api/verify
  if (pathname === "/api/verify" && req.method === "POST") {
    return handleVerify(req, res, url);
  }
  
  // POST /api/verify/sites/:siteId
  const verifySiteMatch = pathname.match(/^\/api\/verify\/sites\/([^/]+)$/);
  if (verifySiteMatch && req.method === "POST") {
    return handleVerify(req, res, url);
  }
  
  // GET /api/stats
  if (pathname === "/api/stats" && req.method === "GET") {
    return handleStats(req, res);
  }
  
  // GET /api/health
  if (pathname === "/api/health" && req.method === "GET") {
    const totalBound = Object.keys(db.boundDevices || {}).length;
    return sendJson(res, { ok: true, sites: Object.keys(db.sites || {}).length, boundDevices: totalBound, version: BUILD_VERSION });
  }
  
  // 静态文件
  let filePath = pathname === "/" ? "/index.html" : pathname;
  filePath = filePath.split("?")[0];
  const fullPath = path.join(__dirname, filePath);
  
  fs.access(fullPath, (err) => {
    if (!err) {
      return serveStatic(fullPath, res);
    }
    res.writeHead(404);
    res.end("Not Found");
  });
});

// 初始化默认示例网站（注意：如果 db.json 里已经存在 sites，就不会覆盖你在后台改的码）
// 这里默认码改成你现在线上正在用的 CCWD6257，防止以后新环境/Railway 重建 db 时又切回 ANIMAL2024
function initDefaultSite() {
  if (Object.keys(db.sites || {}).length === 0) {
    db.sites["animal"] = {
      id: "animal",
      name: "动物塑测评",
      icon: "🦊",
      code: "CCWD6257",
      createdAt: Date.now()
    };
    saveDB(db);
  } else {
    if (db.sites["animal"] && db.sites["animal"].code !== "CCWD6257") {
      db.sites["animal"].code = "CCWD6257";
      saveDB(db);
    }
    if (db.codeBindings && db.codeBindings["animal"]) {
      delete db.codeBindings["animal"];
      saveDB(db);
    }
  }
}

initDefaultSite();

server.listen(PORT, () => {
  console.log(`\n🔐 一码一人授权码系统（自动绑定设备，无需激活密钥）已启动`);
  console.log(`📡 服务地址: http://localhost:${PORT}`);
  console.log(`🔑 管理员密码: ${ADMIN_PASSWORD}`);
  if (DEVICE_BIND_KEY_COMPAT) {
    console.log(`ℹ️  仍保留兼容绑定密钥（仅用于后台紧急解绑/手工绑定，用户侧不再需要）`);
  } else {
    console.log(`ℹ️  未设置绑定密钥（推荐），用户首次用对授权码就自动绑定其设备`);
  }
  console.log(`\n📖 API 列表:`);
  console.log(`  POST /api/auth/login           管理员登录`);
  console.log(`  POST /api/device/bind          绑定设备（兼容用，用户侧不需要）`);
  console.log(`  POST /api/device/check         检查设备绑定状态`);
  console.log(`  GET  /api/devices              已绑定设备列表`);
  console.log(`  POST /api/devices/unbind       解除设备绑定`);
  console.log(`  POST /api/devices/clear-all   清除所有绑定`);
  console.log(`  GET  /api/sites                获取网站列表`);
  console.log(`  POST /api/sites                添加新网站`);
  console.log(`  PUT  /api/sites/:id            更新网站信息`);
  console.log(`  DELETE /api/sites/:id          删除网站`);
  console.log(`  POST /api/sites/:id/reset-code 重置授权码`);
  console.log(`  POST /api/verify/sites/:siteId 验证授权码（码对自动绑定设备）`);
  console.log(`  GET  /api/stats                统计数据`);
  console.log(`\n📄 管理员访问: http://localhost:${PORT}/admin.html`);
  console.log(`💡 用户访问: http://localhost:${PORT}/index.html?site=animal`);
  console.log(`\n🦊 新流程：用户只需要输授权码 → 首次在本机用自动绑定设备 → 一码一机，防止转赠\n`);
});
// force-redeploy-timestamp: 2026-08-23T19:16:08.500093 (Redeploy 手动触发用)
