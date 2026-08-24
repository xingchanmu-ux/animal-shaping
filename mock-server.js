/* 一体化本地服务：静态文件 + /api/verify (mock Cloudflare Worker)
 * 监听 8000，前端同域，API_BASE 留空即可用相对路径
 * 运行：node mock-server.js
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = 8000;

const CODE_POOL = new Set([
  "ASUD9HRB", "ASDC96YS", "ASQBHLQ8", "ASH4NHHV",
  "ASB2L6RS", "ASCS8NAL", "ASNH2LWV", "ASSLGL5Y",
  "ASWXFRCV", "ASSWKNRQ", "ASXP4CDJ", "ASMFDX5K",
  "ASD8BSDE", "AS7GESNS", "ASTXN2FW", "ASLSKWUF",
  "ASTHZSW4", "ASGEMWWA", "AST4G9QW", "ASLC5K6L",
  "AS9Z8JA3", "ASE3SGE3", "ASF6Z4SM", "AS684E5W",
  "ASHY6R5B", "ASW7P858", "AS53JXGW", "ASS3VS7Y",
  "AS7HP8R3", "ASB7Y4VK", "ASMM42P2", "ASYBBFQN",
  "AS643454", "AS8LXRK7", "AS843NPB", "AS9D8X2T",
  "AS98CS8B", "ASK6QD9X", "ASGW3DKV", "ASZDKJJY",
  "ASYT36LT", "ASP78CKB", "AS6BY3LY", "ASKHYR2F",
  "ASTJKXAC", "ASNA7ALT", "ASZ4SB4L", "ASD7BMUZ",
  "AS4S29LZ", "ASMFAHPL", "ASDJNZPZ", "ASLXP9WU",
  "ASG4AWNS", "ASKGK8JS", "ASVJC8FE", "ASV5XW9Y",
  "ASDHGKYM", "ASHVDGAE", "ASPFPCCV", "ASEGPHTD",
  "AS7VM5KD", "ASU2QNWM", "ASMALNDT", "AS2ZB6DL",
  "ASTUC6WN", "ASMDGPCG", "ASV4QY2R", "AS7PYUFQ",
  "ASQMBGVP", "ASDCX2D9", "ASNBDUTH", "ASDS7A6E",
  "ASRZLCKT", "ASBUGVNM", "ASQ55ECV", "AS7DCWSS",
  "ASS43U2S", "ASVJJTCQ", "ASGNP49T", "ASU99K2J"
]);
const kv = new Map(); // 内存 KV: { code: deviceId }

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function sendJson(res, obj, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...cors() });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors());
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // /api/verify
  if (url.pathname === "/api/verify" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let parsed;
      try { parsed = JSON.parse(body); } catch { return sendJson(res, { ok:false, msg:"请求格式错误" }, 400); }
      const code = String(parsed.code || "").trim().toUpperCase();
      const deviceId = String(parsed.deviceId || "").trim();
      if (!code) return sendJson(res, { ok:false, msg:"请输入授权码" });
      if (!deviceId || deviceId.length < 8) return sendJson(res, { ok:false, msg:"设备标识异常" });
      if (!CODE_POOL.has(code)) return sendJson(res, { ok:false, msg:"授权码无效，请确认是否输入正确" });
      const bound = kv.get(code);
      if (!bound) { kv.set(code, deviceId); return sendJson(res, { ok:true, first:true, msg:"授权成功" }); }
      if (bound !== deviceId) return sendJson(res, { ok:false, msg:"此码已被他人绑定，无法使用" });
      return sendJson(res, { ok:true, first:false, msg:"授权成功" });
    });
    return;
  }

  if (url.pathname === "/api/health") return sendJson(res, { ok:true });

  // 静态文件
  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  // 去掉 query
  filePath = filePath.split("?")[0];
  const full = path.join(ROOT, filePath);
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not Found"); return; }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`One-stop server on http://localhost:${PORT} (static + /api/verify mock)`);
});
