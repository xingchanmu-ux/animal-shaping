# 🦊 动物塑测评系统

一个可爱的动物塑性格测评网站，支持设备绑定防止授权码盗用。

## ✨ 功能特点

- 🎨 **精美UI** - 奶油绿主题，少女卡通风格
- 🔐 **授权码系统** - 设备绑定，一人一码
- 🌐 **多网站支持** - 可创建多个独立测评网站
- 📱 **响应式设计** - 支持手机和电脑
- 🚀 **快速部署** - 支持 Railway + Netlify 混合部署

## 📁 项目结构

```
├── server.js          # 后端服务器 (Node.js)
├── package.json       # 项目配置
├── index.html         # 测评页面
├── admin.html         # 管理后台
└── DEPLOY.md          # 部署文档
```

## 🚀 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 启动服务器
npm start

# 访问
# 测评网站: http://localhost:3000/index.html?site=animal
# 管理后台: http://localhost:3000/admin.html
```

### 一键部署

#### 后端 - Railway

[![Deploy to Railway](https://railway.app/button.svg)](https://railway.app/new/template)

1. 点击上面的按钮
2. 连接 GitHub 仓库
3. 等待自动部署完成
4. 获取后端公网地址

#### 前端 - Netlify

1. 访问 https://app.netlify.com/drop
2. 上传 `index.html` 和 `admin.html`
3. 在 `index.html` 中配置后端地址：
   ```javascript
   const API_BASE = "https://你的railway地址.up.railway.app";
   ```

## 🔑 默认配置

- **管理员密码**: `admin888`
- **设备绑定密钥**: `DEVICE_BIND_2024`
- **测试授权码**: `ANIMAL2024`

## 📝 使用流程

### 管理员

1. 访问 `https://你的域名/admin.html`
2. 使用密码登录
3. 添加网站并生成授权码
4. 分享链接和授权码给用户

### 用户

1. 打开分享的链接
2. 输入授权码
3. 首次使用输入绑定密钥
4. 完成测评

## 🔧 自定义配置

### 修改密码

```bash
# Railway 环境变量
ADMIN_PASSWORD=你的新密码
```

### 修改绑定密钥

```bash
# Railway 环境变量
DEVICE_BIND_KEY=你的新密钥
```

## 📊 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 管理员登录 |
| POST | `/api/device/bind` | 绑定设备 |
| POST | `/api/verify/sites/:siteId` | 验证授权码 |
| GET | `/api/sites/public` | 获取公开网站列表 |

## 📖 详细文档

查看 [DEPLOY.md](DEPLOY.md) 获取完整部署指南。

## 📄 License

MIT
