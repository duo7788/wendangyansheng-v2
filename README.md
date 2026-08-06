<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# AI 角色化文档协作原型

该项目将一份原始项目文档派生为面向后端、前端、测试、设计等角色的 AI 工作视图；生成内容由 Kimi 产出，并保存至 Supabase。

## 工作方式

浏览器只调用本站的 `/api/generate-derivation`；Vercel 的服务端函数再调用 Kimi，并以服务器密钥将结果保存到 Supabase。Kimi 与 Supabase 的密钥都不会发送给浏览器。

## 首次配置（Vercel + Supabase）

1. 在 Supabase 控制台打开 **SQL Editor**，粘贴并运行 [supabase/schema.sql](supabase/schema.sql)。
2. 在 Vercel 项目中依次打开 **Settings → Environment Variables**，添加下列四项（Production、Preview、Development 都勾选）：
   - `KIMI_API_KEY`：从 Kimi / Moonshot 平台取得的 API Key。
   - `KIMI_MODEL`：你账户可使用的模型名；默认代码为 `kimi-k2.5`，如账户模型名称不同请按控制台显示填写。
   - `SUPABASE_URL`：Supabase **Project Settings → API** 中的 Project URL。
   - `SUPABASE_SERVICE_ROLE_KEY`：同一页的 `service_role` key；它只能填进 Vercel，绝不能填入 `VITE_` 变量或前端代码。
3. 重新部署 Vercel 项目。打开文档，选择角色并点击“生成衍生”，即可验证生成与保存。

项目已预留带原文依据的结构化理解底稿表，供后续的可追溯生成与局部同步使用。当前角色生成仍直接处理原文，避免首次生成因额外 AI 调用而变慢。对于已部署的项目，请在 Supabase SQL Editor 执行 [理解底稿迁移](supabase/migrations/20260806_document_understandings.sql)；新项目仍可直接执行完整的 [schema.sql](supabase/schema.sql)。

生成后的角色版本会在重新打开页面时从 Supabase 读取。当前原型尚未加入登录/成员权限；正式对外使用前，应先加 Supabase Auth，并在 API 中验证用户是否有该文档权限。

## Run Locally

**Prerequisites:** Node.js 20+、pnpm


1. 安装依赖：`pnpm install`
2. 复制 `.env.example` 为 `.env.local` 并填写四个变量。
3. 使用 `vercel dev` 本地测试完整的前端和 `/api` 函数；单独使用 `pnpm dev` 时，Vite 不会运行 Vercel API。
