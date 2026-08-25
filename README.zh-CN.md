# Rancho Project Search — Python 版

这是原 `zeyongj.github.io` 项目的本地 Python 迁移版。原有 Rancho UI、Project Number 主键、Strata/RM 搜索和 AP/AR 分配逻辑均保留，同时增加了本地数据管理与 Excel 一键导入。

## 快速启动

```bash
python -m venv .venv
```

Windows：

```text
.venv\Scripts\activate
python -m pip install -e ".[desktop]"
python run.py
```

macOS：

```bash
source .venv/bin/activate
python -m pip install -e ".[desktop]"
python run.py
```

启动时可以选择：

- **Open as App Window**：以可交互桌面窗口显示原网页 UI。
- **Open in Local Browser**：以本机浏览器打开，复制粘贴大量数据时更方便。

## Data Workspace

原 **Admin Login** 已更名为 **Data Workspace**，不再需要账号或密码。用户可以：

- 点击 **Open Data Folder** 直接访问数据文件；
- 在 Direct text editor 中复制、粘贴或修改 CSV/JSON；
- 选择目标文件后上传新文件并覆盖；
- 继续用结构化表格添加、修改、删除 AP/AR 条目；
- 只上传一个 Project List `.xlsx`，自动生成并保留 `pm.csv` 与 `nlm.csv`。

所有覆盖操作都会先在 `data/backups/时间戳/` 中保存旧文件。

## 项目号规则

Project Number 仍然是主键。应用先读取 `pm.csv`；只要项目号出现在 `pm.csv`，它就始终是 Active，之后不会再从 `nlm.csv` 中读取同号项目。

附件工作簿中 `5038`、`5049`、`5131` 同时出现在 Active Projects 与 NLM，导入后这三个项目都会正确显示为 Active。

更完整的数据说明见 [docs/DATA_GUIDE.md](docs/DATA_GUIDE.md)。

