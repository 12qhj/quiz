# 刷题助手 · 三科刷题

数据库原理 / Hadoop 生态 / 数据结构（严蔚敏 第 3 版）三科合一的自测刷题网页。
单文件、纯前端、离线可用：打开 `index.html` 即可，无需后端与构建。

- 在线地址：<https://12qhj.github.io/quiz/>
- 题库：数据库原理 161 题（7 章）· Hadoop 生态 125 题（11 章）· 数据结构 171 题（8 章）
- 题型：单选、多选、填空、序列填空、代码填空、SQL、命令、匹配、排序、简答
- 进度按科目分别保存在浏览器 localStorage，互不影响

## 部署

`.github/workflows/deploy.yml` 在每次 push 到 `main` 时自动发布到 GitHub Pages
（`actions/upload-pages-artifact` + `actions/deploy-pages`，使用 OIDC，无需令牌）。

首次需要在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。

## 本地使用

```bash
# 直接双击 index.html，或起一个静态服务
python -m http.server 8080
```
