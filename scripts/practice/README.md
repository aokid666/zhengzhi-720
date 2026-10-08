# 冲刺资料提取

从仓库根目录运行 `python scripts/practice/extract.py`，然后 `python scripts/practice/finalize.py`。需要 PyMuPDF。PDF 和中间结果放在被忽略的 `.practice-build/`。

乘风笔记按原文件红色题干、蓝色答案提取；题面和批注分开。连线按原题和原答案配对，支持跨页、一对多和多对一。每日任务只提取真实题目，任务表保留原页浏览。题面漏印的 2023 年第 21 题 B 项按同文件 PDF P107 同题解析补齐。材料分析由本人对照原答案自评。

截图仓库 `aokid666/zz-sprint-practice-2027`，628 页首次 225dpi PNG，前端只按坐标裁切完整图，无转存或格式转换。校验值见 `data/practice-sources.json`。

讲义与背诵手册按相同原文片段匹配，未匹配时明确显示没找到。

验证：`TZ=UTC node --test tests/*.test.cjs`。

交互验证：安装 happy-dom 后运行 `TZ=UTC node tests/practice-ui.mjs`。覆盖两种配对模式、答题计数、重做、多对多、材料自评、按需加载、原页全文搜索与工具栏。
