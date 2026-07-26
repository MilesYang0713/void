# VOID v0.13.0 — Strong Local Validation

本版在 v0.12.0 的账户、IndexedDB 本地优先保存、Supabase 云同步和 JSON 备份基础上，完善登录与注册体验。

## 本版新增

- 已内置当前 VOID Supabase Project URL 与 Publishable key
- 无需每次更新版本都重新创建 `.env.local`
- 环境变量仍可覆盖默认配置，方便未来切换 Supabase 项目
- 注册密码必须同时包含：
  - 至少 8 位字符
  - 小写字母
  - 大写字母
  - 数字
  - 标点或特殊符号
- 注册页面实时显示密码规则完成情况
- 注册时必须再次输入密码确认
- 邮箱格式、密码强度、两次密码一致性都先在本地检查
- 本地检查通过后，才向 Supabase 发送注册请求
- 常见 Supabase 错误转换成更容易理解的中文或英文提示
- 当前未加入密码找回功能
- 当前按“不使用邮箱验证”的产品方案设计

## 启动

第一次使用本项目文件夹：

```powershell
npm install
npm run dev
```

覆盖到已经安装过相同依赖的项目文件夹后：

```powershell
npm run dev
```

## Supabase 后台设置

在 Supabase Dashboard 中：

```text
Authentication
→ Providers
→ Email
→ 关闭 Confirm email
```

当前版本不依赖邮箱验证，也未制作密码找回入口。

然后在 SQL Editor 中运行：

```text
supabase/schema.sql
```

确保 `user_spaces` 表、RLS 和 Realtime 已配置。

## Supabase 配置方式

当前项目已在 `src/lib/supabase.ts` 中配置默认的 Project URL 与 Publishable key，因此解压后不必再填写 `.env.local`。

未来需要切换项目时，可以创建 `.env.local` 覆盖默认值：

```env
VITE_SUPABASE_URL=https://your-new-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_new_key
```

前端只允许使用 Publishable key。不要把 Secret key、service_role key 或数据库密码写入前端。

## 密码示例

符合要求：

```text
VoidIdea8!
```

不符合要求：

```text
voididea
12345678
VoidIdea8
```

## 数据保存流程

```text
每次修改
→ 立即保存到 IndexedDB
→ 有网络时自动同步 Supabase
→ 断网时继续使用
→ 网络恢复后自动上传
```

设置页面仍然支持 JSON 导出、JSON 导入和手动立即同步。
