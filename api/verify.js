// Vercel Serverless Function: POST /api/verify
// 使用 Vercel KV 存储码-设备绑定关系
const { kv } = require("@vercel/kv");

// 授权码池（私信发给用户的码）
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
  "ASS43U2S", "ASVJJTCQ", "ASGNP49T", "ASU99K2J",
]);

export default async function handler(req, res) {
  // CORS 配置（允许前端跨域调用）
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // 预检请求
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // 健康检查
  if (req.method === "GET" && req.url === "/api/verify") {
    return res.status(200).json({ ok: true });
  }

  // 只接受 POST 请求
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, msg: "Method Not Allowed" });
  }

  try {
    // Vercel Serverless 下 req.body 可能是字符串，也可能已被解析
    let body = req.body;
    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    const code = String(body.code || "").trim().toUpperCase();
    const deviceId = String(body.deviceId || "").trim();

    // 参数校验
    if (!code) return res.status(200).json({ ok: false, msg: "请输入授权码" });
    if (!deviceId || deviceId.length < 8) return res.status(200).json({ ok: false, msg: "设备标识异常" });
    if (!CODE_POOL.has(code)) return res.status(200).json({ ok: false, msg: "授权码无效，请确认是否输入正确" });

    // 查询 KV 绑定
    const bound = await kv.get(code);

    if (!bound) {
      // 首次绑定
      await kv.set(code, deviceId);
      return res.status(200).json({ ok: true, first: true, msg: "授权成功" });
    }

    if (String(bound) !== deviceId) {
      // 设备不匹配，拒绝
      return res.status(200).json({ ok: false, msg: "此码已被他人绑定，无法使用" });
    }

    // 同一设备，放行
    return res.status(200).json({ ok: true, first: false, msg: "授权成功" });
  } catch (error) {
    console.error("[Verify Error]", error);
    return res.status(500).json({ ok: false, msg: "服务暂时不可用，请稍后重试" });
  }
}
