---
name: "animal-shaping-auth-hardener"
description: "Hardens 一人一码授权：强制 ?site 参数、禁用本地码池兜底、清旧缓存、每次点开始都走远端校验；同时生成 Netlify 短链 /siteId 并排查绕过。Invoke 当：新增动物塑/MBTI 等测评站、部署后顾客反馈能免授权进入、或要配 Netlify 短链接。"
---

# 一人一码授权加固 & 短链 & 绕过排查

> 适用场景：本仓库下任意"前端测评 + Netlify/GitHub Pages 前端 + Railway Node 后端 + 按网站隔离授权码池"的项目。
> 目标：保证"陌生顾客打开链接后，**必须**输入对应网站的专属授权码才能进题；一旦授权码在某台设备首次使用正确，该码即自动绑定到那台设备，换设备就拒绝（一码一人）；**不出现**"访问根域名/删除 index.html 就直接玩"这种绕过。
> ⚠️ 2026-08-23 更新：**Netlify 免费账号会因为 Build minutes / Account credit exceeded，导致无法部署新代码**（连 Drop 上传都封）。**首选前端托管改 GitHub Pages**：启用 main/root Pages，并在仓库根目录放 `404.html` 脚本版短链（等价 Netlify _redirects）。

---

## 一、什么时候用这个 Skill（触发条件 checklist）

命中任意 1 条就应该调用本 Skill：

1. 部署了新的测评站点（如 `?site=mbti`、`?site=color`），需要一次性加固 + 加短链 + 验收。
2. 用户反馈："我把 `index.html` 删了 / 直接访问根域名 / 不带参数 → 不用授权码直接进题"。
3. 用户反馈："之前在这台浏览器输过授权码，现在刷新一下又能直接进题（缓存绕过）"。
4. 用户抱怨"还要输激活密钥/绑定密钥太麻烦"或者不知道密钥在哪看/怎么改 → 改为"只要授权码，对了就自动绑设备"（切 `AUTH_FLOW_MODE=auto`）。
5. 用户说"算了还是带密钥更安全" → 改为"授权码 + 激活密钥（新设备 1 次）"（切 `AUTH_FLOW_MODE=bindKey`）。
6. 需要生成短链接：让顾客记住短路径 `/xxx`，而不是发长串的 `/index.html?site=xxx`。优先做双份：Netlify `_redirects` + GitHub Pages `404.html`。
7. Netlify 面板出现「Account credit usage exceeded — new deploys are blocked」或 Build minutes 用完：立刻切 GitHub Pages，不在 Netlify 上浪费时间。

---

## 二、代码结构速览（改之前先确认这几个文件 **真实存在**，不然全是白搭）

- 前端测评页 & 授权逻辑：`/workspace/index.html`（内嵌 `<script>`，**关键开关 `const AUTH_FLOW_MODE = "auto" | "bindKey"`** 顶部一行就能切；关键函数：`initHome`、`checkAuthAndStart`、`submitCode`、`getAuth/setAuth/clearAuth`、`verifyCodeRemote`、`bootstrapPurgeLegacyAuth`、`markRemoteVerified/revokeRemoteMark`）。
- 后端授权码/设备绑定/多网站码池：`/workspace/server.js`（**关键开关 `const AUTH_FLOW_MODE = process.env.AUTH_FLOW_MODE \|\| "auto"`**，对应前端；关键函数：`handleVerify`、`handleBindDevice`、`getBindingForCode/setBindingForCode`、初始化 `db.sites / db.codeBindings / db.boundDevices`）。
- 管理后台（生成/重置网站授权码、查看/解除绑定）：`/workspace/admin.html`。
- Netlify 短链 & 兜底重定向：`/workspace/_redirects`（一行一条规则；`301!` 强制覆盖；支持 `/animal /index.html?site=animal 301`）。
- **GitHub Pages 短链 & 兜底重定向（现在是默认推荐）**：`/workspace/404.html`（页面级 JS 脚本，等价 Netlify `_redirects`：根路径 `/` → `/animal`；`/animal` → `/index.html?site=animal`；`/mbti` → `/index.html?site=mbti`；自动兼容自定义域名与 `/{repo}/` 子路径 Pages）。
- Railway 构建配置（避免旧 Railpack `secret DEVICE_BIND_KEY not found` 错误）：`/workspace/railway.toml`（必须 `builder = "Dockerfile"`、`buildEnvironment = "V2"`）。
- Dockerfile：`/workspace/Dockerfile`（Node 镜像、`COPY server.js`、`EXPOSE $PORT`、`CMD ["node","server.js"]`）。

---

## 三、前后端 AUTH_FLOW_MODE 联动对照表（用户想"换回/改成带密钥"时照这个改，不要到处瞎改代码）

| 用户诉求 | 前端 [index.html#L947-L971](../index.html#L947-L971) AUTH_FLOW_MODE= | 后端 Railway Variables 新增：AUTH_FLOW_MODE= | 效果 |
|---|---|---|---|
| 只用授权码，不要密钥（顾客体验好） | `"auto"` | 留空 或 `"auto"` | 码对 → 自动绑设备；换设备拒绝。新设备 bind API 不传密钥也允许。 |
| 必须「授权码 + 激活密钥」（更安全 / 防止授权码外流） | `"bindKey"` | `"bindKey"` | 码对 → 若设备未绑：前端立刻弹出「激活密钥」输入框；顾客输 Railway Variables 里 `DEVICE_BIND_KEY` 对应值 → bind API 校验密钥正确 → 通过 → 再 verify → 进题。**不传密钥/传错密钥后端 401 拒绝**。 |

> 注意 1：`DEVICE_BIND_KEY` 只有在 `AUTH_FLOW_MODE=bindKey` 时才会被强制校验；`auto` 模式就算没设置它也能用。  
> 注意 2：前端 + 后端 两端 AUTH_FLOW_MODE 要**一致**。如果不一致也能工作（前端 bindKey + 后端 auto 会是"强制弹窗但可以输任意字符串"），为避免投诉务必保持一致。  
> 注意 3：若 `AUTH_FLOW_MODE=bindKey` 但 Railway Variables **没设置** `DEVICE_BIND_KEY`，为防止系统崩，代码会用内置默认值 `DEVICE_BIND_2024` 兜一下，但仍然要求必须传密钥；**建议你一定自己去 Railway Variables 加一个强随机密钥，比如 `dongwu2026_muxc` 这种你自己能记住的字符串**，并把弹窗顶部的 `BIND_KEY_HINT` 改成对应提示。

---

## 四、前端托管切换（当 Netlify 被封禁/额度用完，必须换到 GitHub Pages）—— 一键流程

1. 仓库根目录必须包含：`index.html`、`admin.html`、`404.html`（必须有！）、`_redirects`（可选，只是为以后如果回到 Netlify 做兼容）。
2. 开 Pages：Repo → Settings → Pages → **Build and deployment → Source**，选 **Deploy from a branch**；Branch 选 `main`，路径选 `/ (root)`，Save。
3. 等待 GitHub Pages 自动构建（`https://<owner>.github.io/<repo>/` 是默认地址；设置了自定义域名就走自定义域名）。
4. 验证：
   - 打开 `https://<domain>/animal` → 浏览器里 JS 自动跳 `https://<domain>/index.html?site=animal`（短链有效，顾客可以直接用短链发）。
   - 打开裸域名 `/` → 自动跳 `/animal`。
   - 打开 `/index.html`（不带 `?site=`）→ 页面立刻拦："请使用完整链接（?site=xxx）访问"，按钮灰掉不能进题。
5. 若以后要加 `mbti` / `color` 等其它短链：不用加新规则，404.html 脚本自动支持 `/mbti` → `index.html?site=mbti`、`/color` → `index.html?site=color`（只要 admin 后台先创建对应 siteId 的网站条目就行）。

---

## 五、标准加固流程（按顺序做，漏一步都会出现"绕过"投诉）

### 步骤 0：先抓线上真实 HTML，不要"我本地改了就以为线上是新的"

```bash
# 抓最终落地页
curl -sSL -o /tmp/live.html -w "最终URL: %{url_effective}\nHTTP: %{http_code}\n大小: %{size_download}\n" "https://<NETLIFY_DOMAIN>/animal"

# 列出现状关键字出现次数（对照后面的期望结果）
for kw in "PAGE_BLOCKED_NO_SITE" "请使用完整链接" "校验授权中…" "bootstrapPurgeLegacyAuth" "clearAuth()" "markRemoteVerified(" "自动为本设备绑定"; do
  c=$(grep -cF "$kw" /tmp/live.html || echo 0)
  echo "$kw  出现 $c 次"
done
```

然后把线上真实的 `checkAuthAndStart` / `submitCode` / `getAuth` 函数**按大括号对抠出来**看一眼：

```python
import re
s=open('/tmp/live.html','r',encoding='utf-8',errors='ignore').read()
m=re.search(r'(function\s+checkAuthAndStart\s*\([^)]*\)\s*\{)', s)
# ...按花括号配对打印函数体
```

> 如果发现线上仍然是 `if (getAuth()) startQuiz();` 这种"本地有缓存就直接进" → **回到步骤 1 加固前端**。

---

### 步骤 1：前端 `index.html` 加固（4 层防线，缺一不可）

#### 1.1 强拦截：没有 `?site=xxx` 就不许点"开始测试"
- 读取 URL 参数时 `trim()`：`let SITE_ID = (URL_PARAMS.get("site") || "").trim();`
- 定义 `const PAGE_BLOCKED_NO_SITE = !SITE_ID;`
- `initHome()` 中，如果 `PAGE_BLOCKED_NO_SITE`：
  - `startBtn.disabled = true; opacity = 0.55; cursor = not-allowed;`
  - 点击就弹 `openCodeModal("请使用完整链接访问：在网址末尾加上 ?site=...")`，**并且同时禁用授权码输入框和提交按钮**（防止用户误以为"输码还能救"）。
  - `window.addEventListener("load", …)` 打开页面就主动弹窗，不等用户点。

#### 1.2 本地 AS 码池兜底必须线上禁用（`verifyCode` 老函数是后门！）
- `verifyCode(code)` 中：**非 localhost/127.0.0.1 一律返回 `{ ok:false, msg:"请使用完整链接..." }`**。
- 只有本地开发 `hostname === "localhost" || "127.0.0.1"` 才允许读 `admin_code_pool` 自测。

#### 1.3 `getAuth()` 本地"已授权缓存"在无 site 参数时一律视为 null
- `getAuth()` 第一行：`if (PAGE_BLOCKED_NO_SITE || !SITE_ID) return null;`。
- 新增 `clearAuth()`（移除 AUTH_KEY）、`markRemoteVerified(code)`（写 `*_remote_ok_v2` + `*_last_code` + `*_last_at`）、`revokeRemoteMark()`（把远端通过标记全清）。
- **页面一加载就做旧缓存清理**：`bootstrapPurgeLegacyAuth` 这个 IIFE，只执行一次；如果本地没有 `*_remote_ok_v2` 标记（意味着这个授权缓存是旧版、没有经过后端校验过）→ `localStorage.removeItem(AUTH_KEY)`。

#### 1.4 **核心**：点「开始测试」不再信任本地缓存 → 必须 `await verifyCodeRemote(cachedCode)` 再让进
新 `checkAuthAndStart()` 模板：

```js
function checkAuthAndStart() {
  const cachedCode = getAuth();
  if (!cachedCode) { openCodeModal(); return; }
  const startBtn = $("#btn-start");
  const originText = startBtn.textContent;
  startBtn.disabled = true;
  startBtn.textContent = "校验授权中…";
  (async () => {
    try {
      const result = await verifyCodeRemote(cachedCode);
      if (result.ok) { markRemoteVerified(cachedCode); startQuiz(); return; }
      // 兼容旧后端：若仍返回 needBind，也不再要求激活密钥，直接清缓存让用户再输一次码
      if (result && result.needBind) { clearAuth(); revokeRemoteMark(); openCodeModal("首次使用会自动为这台设备绑定，请再点一次『开始测试』提交授权码即可"); return; }
      // 其它失败一律清缓存
      clearAuth(); revokeRemoteMark();
      openCodeModal(result && result.msg ? result.msg : "授权码已失效，请重新输入");
    } catch (e) {
      clearAuth(); revokeRemoteMark();
      openCodeModal("网络连接失败，请稍后重试并输入授权码");
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = originText;
    }
  })();
}
```

并且 `verifyCodeRemote(code)` 本身也要加固：
- `PAGE_BLOCKED_NO_SITE || !SITE_ID` 时直接返回失败；
- **必须走 `/api/verify/sites/${encodeURIComponent(siteId)}`**，不允许 fallback 到裸 `/api/verify`；
- catch 分支中，非 localhost 绝不降级调用本地 `verifyCode`（那是后门）。

---

### 步骤 2：去掉"激活密钥 / DEVICE_BIND_KEY"流程（顾客只输授权码）

#### 2.1 后端 `server.js` 改成"一码一人自动绑定设备"
新 `handleVerify` 逻辑（关键顺序：**先查码对错，再查这个码绑定过哪台设备**）：

1. `code`、`deviceId` 缺一就 400；`db.sites[siteId]` 不存在就 404。
2. `site.code.toUpperCase() !== codeUpper` → `{"ok":false,"msg":"授权码错误"}`。
3. 读现有绑定：`existingBinding = getBindingForCode(siteId, codeUpper)`（数据结构 `db.codeBindings[siteId][codeUpper] = { deviceHash, boundAt }`）。
4. **情况 A：没绑过** → 自动写 `db.boundDevices[hashedId]`（兼容后台设备列表），再写 `setBindingForCode(siteId, codeUpper, hashedId)` → 返回 `{ ok:true, autoBound:true, msg:"授权成功（首次绑定设备）" }`。
5. **情况 B：绑过且就是当前设备** → 返回 `{ ok:true, msg:"授权成功" }`。
6. **情况 C：绑过但是别的设备** → 返回 `{ ok:false, msg:"此授权码已绑定其它设备，一个码只能在同一设备使用" }`。

配套兼容：`handleBindDevice` 中如果仍设置了旧 `DEVICE_BIND_KEY` 环境变量，仍允许用密钥绑定（老用户平滑过渡）；没设环境变量则不再需要 bindKey，用户也不用知道。

后台启动日志里把原来"绑定密钥 = xxx"的打印改成提示"新流程：用户只需要输授权码，码对自动绑定设备；换设备拒绝"。

#### 2.2 前端 `submitCode` 去掉激活密钥弹窗
- 原 `if (!result.ok && result.needBind) { showBindModal(code) }` 整段删除或改成上面的"请再点一次提交授权码"文案；
- 成功 toast 改成：`result.autoBound ? "授权成功，已自动为本设备绑定～开始测试吧" : "授权成功，开始测试吧"`；
- 新后端已经不可能再返回 needBind，所以 UI 不再出现 bind-modal。

#### 2.3 管理后台 `admin.html` 改文案
- 原来的 `绑定密钥 = DEVICE_BIND_2024 + 提示用户首次要输密钥` 改成："一码一人（自动绑定）+ 用户只需要输授权码 + 首次对码自动绑定该设备 + 码被别的设备用时拒绝 + 管理员可以解除绑定让码重新可用"。

#### 2.4 本地自测（必做，防止上线白屏）
- `node --check server.js`
- 提取 `index.html` / `admin.html` 所有 `<script>` 到 JS 文件 → `node --check extracted.js`
- 临时目录起一个 node server.js，跑 4 条断言：
  1. 设备A用对码首次 → `ok:true + autoBound:true`
  2. 设备A再用对码 → `ok:true`
  3. 设备B盗用同码 → `ok:false + msg含"绑定其它设备"`
  4. 错码 → `ok:false + msg="授权码错误"`

---

### 步骤 3：Netlify 短链 + 兜底重定向（`_redirects` 文件）

每个新网站（siteId = `mbti` / `color` / `xxx`）加一条：

```
/animal  /index.html?site=animal  301!
/mbti    /index.html?site=mbti    301!
/color   /index.html?site=color   301!

# 如果只有一个网站，把根路径也锁住，避免顾客再发现根域名可以直接进入
/        /animal                   301!

# 兜底：避免 Netlify 默认 404 暴露任何入口（默认跳到你主站）
/*       /index.html?site=animal  301
```

注意：`_redirects` 必须在 **Netlify publish 目录根目录**（这里仓库根就是 publish 根）；如果用 `netlify-deploy/` 子目录部署，把 `_redirects` 也复制一份到该子目录。

---

### 步骤 4：部署 & 抓线上验收

#### 4.1 推送（示例脚本模板，用真实 GitHub PAT，**不要把 Token 写死到仓库**）

```bash
# 改完 index.html / admin.html / server.js / _redirects 之后：
git add index.html admin.html server.js _redirects railway.toml Dockerfile
git commit -m "feat(auth): 去掉激活密钥；授权码对自动绑定设备；强制?site；短链绕过修复"
git push origin main
```

#### 4.2 等 Netlify / Railway 自动构建后，先 **抓线上最终页**（不是信部署面板绿灯）
等待至少 60 秒，然后：

```bash
curl -sSL -o /tmp/live_v.html -w "%{http_code} %{url_effective}\n" "https://<DOMAIN>/animal"
```

断言：
- `/` → **301 → /animal → 301 → /index.html?site=animal**
- `/animal` → 301 → `/index.html?site=animal`（HTTP 200）
- 最终页 HTML 内：
  - `PAGE_BLOCKED_NO_SITE` 出现 > 0 次
  - `校验授权中…` 出现 > 0 次
  - `自动为本设备绑定` 出现 > 0 次
  - `showBindModal(` 如果仍出现，是定义没关系；关键是 `submitCode()` 函数体里**不能再调用**它
  - `checkAuthAndStart` 函数体内必须能看到 `await verifyCodeRemote(cachedCode)`，**不能再有**旧的 `if (getAuth()) startQuiz()` 单行版本

#### 4.3 让用户按下面 4 条实机验收（你也要复现一遍）

**A. 无痕模式陌生用户（模拟小红书顾客第一次点开）**
1. `https://<DOMAIN>/animal` 打开
2. 点【开始测试】→ 按钮变"校验授权中…" → 弹授权码输入框
3. 输正确码 → toast 提示"授权成功，已自动为本设备绑定～开始测试吧" → **只输一次码，直接进题** ✅
4. **全程没有出现"绑定密钥 / 激活密钥"输入框** ✅

**B. 同一设备重开**
1. 再打开 `/animal` → 点开始测试
2. 按钮再次变"校验授权中…" → 短暂 0.5~2s → 进题（没有任何弹窗）✅

**C. 换设备/换无痕窗口盗用同码**
1. 新开无痕 → `/animal` → 输同一个码
2. 应返回"此授权码已绑定其它设备，一个码只能在同一设备使用" → **进不去** ✅

**D. 不带参数访问根/裸 index.html**
1. `https://<DOMAIN>/` → 自动跳 `/animal` → 带参数页
2. `https://<DOMAIN>/index.html` → 立刻弹"请使用完整链接…"，输入框/按钮灰，输任何码无效 → **进不去** ✅

---

### 步骤 5：管理员侧可选（但建议做）

1. 打开 admin.html → 设备绑定 Tab：确认文案不再提"绑定密钥"，能看到顾客设备列表、单条解绑、一键清空所有绑定。
2. 网站 Tab：确认可以新建 `mbti / color` 等网站、点"重置授权码"生成新 8 位码、每个网站独立码池。
3. 如果某个顾客反馈"换手机了授权码不能用"：管理员在设备 Tab **解绑旧设备**（或对应码），让顾客在新手机上再输一次授权码 → 自动绑定新设备。

---

## 四、常见绕过 & 排查套路（出现问题先按这个查）

| 现象 | 根因 99% | 修复动作 |
| --- | --- | --- |
| 直接访问 `/` 能进题 | `_redirects` 没加 `/ -> /animal` 兜底，或 `index.html` 的 `initHome` 无 `PAGE_BLOCKED_NO_SITE` 拦截 | 加 `_redirects` 两行兜底 + 补齐 `initHome` 拦截 |
| 刷新 / 重开浏览器就直接进题（本地缓存绕过） | `checkAuthAndStart` 还是旧版 `if (getAuth()) startQuiz()` 没做远端二次验真 | 改成 `await verifyCodeRemote(cachedCode)` + `markRemoteVerified`，失败一律 `clearAuth + revokeRemoteMark` |
| 旧版本用户"之前授权过"的缓存仍然秒进题 | 没有 `bootstrapPurgeLegacyAuth` 清旧缓存，或只清 AUTH_KEY 没写/读 `remote_ok_v2` 标记 | 上线后把 guard key 版本升级（`_purged_v2` → `_purged_v3`），所有老用户首次打开新版都会被强制跑一次清理 |
| 顾客手机提示"已绑定其它设备" | 这个码给了别人先用，或者顾客自己在旧浏览器激活过，现在换新手机 | admin → 设备 Tab → 解绑对应设备；或者让你（管理员）在对应网站生成新 8 位码发给这个顾客 |
| Railway 启动失败 `secret DEVICE_BIND_KEY not found` | 仍在用 Railpack 构建，且它会强校验 environment 里有没有填 secret | `railway.toml` 改成 `builder = "Dockerfile"` + `buildEnvironment = "V2"`；确保仓库根有 `Dockerfile`；重新 Connect 仓库触发构建 |
| 测线上但总显示"旧代码" | Netlify/Railway 构建慢；或浏览器缓存 | `curl -sSL ...` 抓最终 URL 的真实 HTML（curl 不带浏览器缓存），而不是看手机显示 |

---

## 五、安全注意（Skill 永远不记录的内容）

1. **绝对不要**在 commit / Skill / 文档里写入用户的 GitHub PAT、Railway Token、管理员真实密码、真实 `DEVICE_BIND_KEY`（兼容用的）。
2. **推送脚本里的 Token**永远用临时环境变量注入；任务完成后让用户去 GitHub Settings 删除 classic PAT。
3. Railway 的环境变量（`ADMIN_PASSWORD`、旧 `DEVICE_BIND_KEY` 兼容用）一律建议用户通过 Variables 面板改，**不要**在代码里硬编码真实值。
4. 授权码（每个网站一个）应该走 admin.html 后台"重置授权码"生成，**不要**写死在前端 JS。
