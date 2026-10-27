# 可信发布流程

目标：npm 上的每个版本都由 GitHub Actions 构建并带有 npm provenance；日常发布不再依赖本地长期 token 或逐个输入 2FA。

## 0. 一次性引导：先让包存在

npm 的 Trusted Publishing 只能配置**已经存在**的包（`npm trust` 要求包已发布）。所以第一个版本需要手动发布一次：

```bash
cd /path/to/ds-conversation-search
npm publish
# 按提示输入 6 位 2FA OTP
```

确认：

```bash
npm view ds-conversation-search version
```

## 1. 把仓库放到 GitHub

把本目录作为仓库根目录推送到 GitHub（公开仓库才能让 provenance 的源码链接可公开验证）：

```bash
git init
git add .
git commit -m "release: ds-conversation-search 1.0.0"
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

建议在 `package.json` 里补上：

```json
"repository": {
  "type": "git",
  "url": "git+https://github.com/<owner>/<repo>.git"
}
```

## 2. 配置 Trusted Publishing（OIDC）

要求：npm 11.15+、账号已开启 2FA。首次配置需要一次 OTP。

```bash
npm trust github ds-conversation-search \
  --file publish.yml \
  --repo <owner>/<repo> \
  --environment npm \
  --allow-publish
```

也可以去 npmjs.com：包页面 → Settings → Trusted publishing → Add a trusted publisher → GitHub Actions，填写 owner/repo、workflow 文件名 `publish.yml`、environment `npm`。

检查：

```bash
npm trust list ds-conversation-search
```

## 3. 之后的发布

1. 修改 `package.json` 版本，提交；
2. 打 tag（如 `v1.0.1`）并创建 GitHub Release；
3. `.github/workflows/publish.yml` 自动运行：
   - `id-token: write` 让 npm 用 GitHub OIDC 换取短期发布凭证；
   - `npm publish --provenance` 生成 provenance；
   - **不需要** `NPM_TOKEN` secret。

发布后 npm 包页面会显示 **Built and signed on GitHub Actions**，并附 provenance 声明。

## 4. 验证

```bash
npm view ds-conversation-search version dist-tags
npm audit signatures           # 在安装了该包的项目中验证 registry 签名/证明
npm view ds-conversation-search@<version> --json | grep -i attestation
```

## 可选：第一个版本也必须由 CI 发布

如果不想在本地手动首发，可以用一个**粒度访问令牌**做一次性引导：

1. npmjs.com → Access Tokens → Generate New Token → Granular Access Token：
   - 只勾选 `ds-conversation-search`；
   - 权限选 Read and write；
   - 开启 “bypass 2FA”（仅因为这是临时引导）；
   - 设置很短的有效期。
2. 把令牌放到 GitHub Actions Secret `NPM_TOKEN`。
3. 临时在 workflow 的 publish step 加上：

```yaml
env:
  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

4. 首发成功后立刻：
   - 删除 `NPM_TOKEN` secret；
   - revoke 该 token；
   - 按第 2 步配置 Trusted Publishing，之后只走 OIDC。

长期不要使用带 bypass 2FA 的 token；它只是首发的临时桥。

## 安全清单

- 包内 `files` 使用 allowlist，发布前 `npm pack --dry-run` 检查内容；
- 不使用 `preinstall`/`postinstall` 等生命周期脚本；
- 使用 `package-lock.json` + `npm ci --ignore-scripts`；
- workflow 权限最小化：`contents: read`、`id-token: write`；
- 使用受保护的 GitHub Environment（本模板用 `npm`），限制谁能触发发布；
- GitHub Actions 建议按 commit SHA 固定（本模板先用 `@v4`，正式仓库可改为 SHA）；
- 发布 tag 与 `package.json` 版本保持一致；
- 不把 token 写进仓库、README 或日志；
- 发现 token 泄露立即 revoke，并检查 npm 包的版本/维护者。

## 官方文档

- https://docs.npmjs.com/trusted-publishers
- https://docs.npmjs.com/cli/v11/commands/npm-trust
- https://docs.npmjs.com/generating-provenance-statements
