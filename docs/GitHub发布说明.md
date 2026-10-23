# GitHub 发布与维护

仓库：[tideyzhang/kehen](https://github.com/tideyzhang/kehen)。采用 MIT 许可，首次公开版本为 `v0.7.4-beta.1`，标记为 Pre-release。

源码、测试、构建脚本、文档及正式图片进入 Git。安装包、实际数据库、备份和构建中间文件不进入源码历史。Releases 提供 Windows x64 安装版、便携 ZIP、Mac arm64 ZIP 及 `SHA256SUMS.txt`。

## 发布步骤

1. 在 main 上完成集中修改，更新 package.json 与锁定文件中的版本，运行单元及受影响的桌面流程测试。
2. 在相应环境构建 Windows 安装版、便携包和 Mac arm64 ZIP；运行 `scripts/verify-release.cjs` 检查成品源码、版本、图标与校验值，并核对第三方声明。
3. 执行 `node scripts/prepare-github-release.cjs`，在 `dist/github/` 生成 GitHub 可保留的英文附件名与对应校验清单。中文构建包及 ZIP 内中文版本目录保留。
4. 更新公开版本说明、数据格式范围和验证边界，创建与软件版本一致的 `v` 标签。
5. 新建 Release 草稿，上传三份附件及校验文件，重新下载核对后发布。beta 版勾选 Pre-release。
6. 已公开标签与程序附件不替换内容；软件修正通过新版本发布，文档可在主分支持续完善。当前不启用自动公开发行。

## 数据与验收

数据库格式与软件版本分别评估，发布说明须明确 `.db` 读取、完整备份恢复、数据目录及迁移步骤；数据变更前保留备份。构建成功不代替 Windows 教室实机的安装、触屏、缩放和 PPT 置顶验收。

许可原文和清单随每份程序分发，依赖变化时同步更新。文档按当前产品组织，使用演示学生，不夹带方案讨论或未发布版本的介绍。
