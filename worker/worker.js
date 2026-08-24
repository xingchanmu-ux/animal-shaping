/* ============================================================
 * 动物塑性格测评 - Cloudflare Worker 后端
 * 功能：授权码校验 + 码-设备绑定（一人一码一设备）
 * 存储：Cloudflare KV (ANIMAL_CODES)
 *   key=授权码  value=已绑定的设备ID
 * ============================================================
 * 部署见同目录 wrangler.toml 与 README.md
 * ============================================================ */

// 授权码池（私信发给用户的码）。用尽时在此数组追加 AS+6位码即可。
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

// 部署后将 '*' 改成你的前端域名，例如 'https://yourname.pages.dev'
const ALLOW_ORIGIN = "*";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // 健康检查
    if (url.pathname === "/" || url.pathname === "/api/health") {
      return json({ ok: true, service: "animal-shaping-auth" });
    }

    // 主接口：POST /api/verify
    if (url.pathname === "/api/verify" && request.method === "POST") {
      return handleVerify(request, env);
    }

    return json({ ok: false, msg: "Not Found" }, 404);
  },
};

/* ---------------- 核心校验逻辑 ----------------
 * 输入 { code, deviceId }
 * 1) 码不在码池 → 无效
 * 2) 码在码池但 KV 无绑定 → 首次绑定（写入 KV），返回成功
 * 3) 码已绑定且 deviceId 匹配 → 返回成功（同一人无限次用）
 * 4) 码已绑定但 deviceId 不匹配 → 拒绝（别人用了）
 * ----------------------------------------------- */
async function handleVerify(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ ok: false, msg: "请求格式错误" }, 400);
  }

  const code = String(body.code || "").trim().toUpperCase();
  const deviceId = String(body.deviceId || "").trim();

  if (!code) return json({ ok: false, msg: "请输入授权码" });
  if (!deviceId) return json({ ok: false, msg: "设备标识缺失，无法绑定" });
  if (deviceId.length < 8) return json({ ok: false, msg: "设备标识异常" });

  // 码池校验
  if (!CODE_POOL.has(code)) {
    return json({ ok: false, msg: "授权码无效，请确认是否输入正确" });
  }

  // 查 KV 绑定
  let bound;
  try {
    bound = await env.ANIMAL_CODES.get(code);
  } catch (e) {
    return json({ ok: false, msg: "服务暂时不可用，请稍后重试" }, 500);
  }

  if (!bound) {
    // 首次绑定
    try {
      await env.ANIMAL_CODES.put(code, deviceId);
    } catch (e) {
      return json({ ok: false, msg: "绑定失败，请稍后重试" }, 500);
    }
    return json({ ok: true, first: true, msg: "授权成功" });
  }

  if (bound !== deviceId) {
    return json({ ok: false, msg: "此码已被他人绑定，无法使用" });
  }

  // 同一设备同一码 → 放行（无限次）
  return json({ ok: true, first: false, msg: "授权成功" });
}

/* ---------------- 工具 ---------------- */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}
