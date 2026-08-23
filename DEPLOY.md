# 🦊 动物塑测评系统 - 部署指南

## 架构说明

```
用户浏览器
    ├── 前端 (Netlify) - 静态页面
    │   └── index.html (测评页面)
    │   └── admin.html (管理后台)
    │
    └── 后端 (Railway) - API服务器
        └── server.js (授权码验证、设备绑定)
        └── db.json (数据存储)
```

---

## 🚀 第一步：部署后端到 Railway

### 1. 准备文件

需要上传到 Railway 的文件：
- `server.js` - 后端服务器
- `package.json` - 项目配置
- `start.sh` - 启动脚本（可选）

### 2. 注册 Railway
1. 访问 https://railway.app 注册账号
2. 点击 **"Start New Project"**
3. 选择 **"Deploy from GitHub repo"** 或 **"New" → "Deploy a Node Server"**

### 3. 配置环境变量（可选）

在 Railway 项目设置中添加：
```
ADMIN_PASSWORD=你的管理员密码
DEVICE_BIND_KEY=你的绑定密钥
CORS_ORIGIN=https://dwpd.netlify.app
```

### 4. 部署
- Build Command: `npm install`
- Start Command: `node server.js`

### 5. 获取后端地址
部署完成后，在 Railway 仪表盘获取公网地址，例如：
```
https://animal-shaping.up.railway.app
```

---

## 🌐 第二步：部署前端到 Netlify

### 1. 上传文件
将以下文件上传到 Netlify：
- `index.html` - 测评页面

### 2. 配置后端地址

编辑 `index.html`，找到 API_BASE 配置部分：

```javascript
// ===== API 配置 =====
const API_BASE = window.location.hostname === "localhost" 
  ? ""  // 本地开发
  : "https://animal-shaping.up.railway.app";  // 替换为你的 Railway 地址
```

或者通过 URL 参数传递：
```
https://dwpd.netlify.app/index.html?site=animal&api=https://animal-shaping.up.railway.app
```

### 3. 管理后台
管理后台可以：
- 方案A：也部署到 Netlify（通过 `?api=` 参数指定后端）
- 方案B：直接使用 Railway 上的 admin.html

---

## 📝 使用流程

### 管理员操作

1. **访问管理后台**
   - Railway: `https://animal-shaping.up.railway.app/admin.html`
   - 或 Netlify: `https://dwpd.netlify.app/admin.html?api=https://animal-shaping.up.railway.app`

2. **登录**（默认密码: `admin888`）

3. **添加网站**
   - 网站ID: 英文标识（如 `animal`）
   - 网站名称: 显示名称
   - 授权码: 自定义或自动生成

4. **分享给用户**
   ```
   链接: https://dwpd.netlify.app/index.html?site=animal
   授权码: ANIMAL2024
   绑定密钥: DEVICE_BIND_2024
   ```

### 用户使用流程

1. 打开链接 → 点击「开始测试」
2. 输入授权码
3. 首次使用需输入绑定密钥
4. 完成测评

---

## 🔧 自定义配置

### 修改管理员密码
```bash
# 方式1：环境变量
ADMIN_PASSWORD=newpassword node server.js

# 方式2：直接修改 server.js
# 搜索 ADMIN_PASSWORD_HASH 并修改
```

### 修改绑定密钥
```bash
# 方式1：环境变量
DEVICE_BIND_KEY=newkey node server.js

# 方式2：直接修改 server.js
# 搜索 DEVICE_BIND_KEY 并修改
```

### 限制 CORS 源
```bash
CORS_ORIGIN=https://dwpd.netlify.app node server.js
```

---

## 📊 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 管理员登录 |
| POST | `/api/device/bind` | 绑定设备 |
| POST | `/api/device/check` | 检查绑定状态 |
| GET | `/api/sites/public` | 公开网站列表 |
| POST | `/api/verify/sites/:siteId` | 验证授权码 |
| GET | `/api/stats` | 统计数据 |

管理员专用（需 Token）：
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sites` | 网站列表 |
| POST | `/api/sites` | 添加网站 |
| PUT | `/api/sites/:id` | 更新网站 |
| DELETE | `/api/sites/:id` | 删除网站 |
| GET | `/api/devices` | 设备列表 |
| POST | `/api/devices/unbind` | 解除绑定 |
| POST | `/api/devices/clear-all` | 清除所有 |

---

## 💾 数据备份

数据存储在 Railway 的 `db.json` 文件中。

下载备份：
```bash
# 通过 API 获取统计
curl https://animal-shaping.up.railway.app/api/stats
```

---

## ❓ 常见问题

**Q: 为什么需要设备绑定？**
A: 防止一个授权码被多人使用，保护你的商业利益。

**Q: 用户换设备怎么办？**
A: 在管理后台解除旧设备绑定，让用户在新设备重新绑定。

**Q: 可以跳过设备绑定吗？**
A: 可以，修改 server.js 中的 verifyCode 函数，移除绑定检查。

**Q: 如何支持更多用户？**
A: 系统已支持万级用户，如需更多考虑迁移到数据库服务。
