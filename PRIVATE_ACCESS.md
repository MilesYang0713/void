# VOID v0.19.0 私人远程访问（Tailscale）

这个版本不要求把前端部署到公网。推荐结构：

```text
iPhone / iPad
    ↓ Tailscale 私网 HTTPS
你的 Windows 电脑
    ↓ localhost
VOID 静态预览服务
```

## 一次性准备

1. 在 Windows 电脑和 iPhone 上安装 Tailscale。
2. 两台设备登录同一个 tailnet。
3. 保持 Tailscale 的 MagicDNS 和 HTTPS 可用。
4. 不要使用 `tailscale funnel`。Funnel 用于公网开放，不符合这个项目的私人使用目标。

## 每次更新代码后

在 VOID 项目目录执行：

```powershell
npm run build
npm run preview:private
```

第二条命令会让构建结果仅监听：

```text
http://127.0.0.1:4173
```

另开一个 PowerShell 窗口：

```powershell
tailscale serve --bg 4173
```

Tailscale 会输出一个类似下面的私人 HTTPS 地址：

```text
https://你的电脑名.你的-tailnet.ts.net
```

只有获得 tailnet 访问权限的设备才能打开这个地址。

## iPhone 添加到主屏幕

1. 保持 iPhone 的 Tailscale 连接开启。
2. 用 Safari 打开 Tailscale Serve 输出的 HTTPS 地址。
3. 点击 Safari 分享按钮。
4. 选择“添加到主屏幕”。
5. 以后可以像普通 App 一样打开 VOID。

## 停止私人访问

```powershell
tailscale serve off
```

同时关闭运行 `npm run preview:private` 的 PowerShell 窗口。

## 安全边界

- 前端网页本体只在电脑本机运行，没有公网 URL。
- Vite Preview 只监听 `127.0.0.1`，局域网设备不能绕过 Tailscale 直接访问。
- Tailscale Serve 只向 tailnet 提供服务；不要改用 Funnel。
- Supabase 的 publishable key 可以存在前端，但必须继续依赖 RLS 隔离用户数据。
- 不要把 Supabase service role key、数据库密码或其他管理员密钥放入项目。
- 电脑关机、休眠，或预览服务停止时，手机将无法访问，这是私人自托管模式的正常限制。
