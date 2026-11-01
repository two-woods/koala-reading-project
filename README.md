# 考拉书房 · GitHub Pages 静态版

这是供 GitHub Pages 托管的独立静态发布包。部署后项目地址为 `https://two-woods.github.io/koala-reading-project/`。

## 功能与数据

- 支持在当前浏览器导入 EPUB、TXT 和 Markdown，阅读、查本地 ECDICT、保存词汇/笔记/阅读进度、复习及使用考拉乐园。
- 书籍和学习数据保存在访问者当前浏览器的 IndexedDB。每位访问者各自导入读物，朋友之间不共享数据；清除浏览器数据或更换浏览器前，请先导出备份。
- 不包含原项目的书籍、用户数据、服务器代码、服务器地址或部署记录。
- GitHub Pages 不运行 Node 服务，因此外刊目录自动检查、自动下载导入、私有服务器同步和跨设备同步不可用。外刊来源只提供上游目录链接。
- ECDICT 本地词库遵循 MIT 许可；许可和来源说明随词库文件保留。

## 更新网页

将新的 `site/` 静态文件提交到 `main` 分支后，GitHub Actions 会自动发布。仓库须设为公开，才能使用 GitHub Free 的 Pages。
