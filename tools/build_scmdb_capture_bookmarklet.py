#!/usr/bin/env python3
"""Generate a drag-to-bookmarks page for the public SCMDB capture helper."""

from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import quote


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--kind", choices=["blueprints", "missions"], default="blueprints")
    args = parser.parse_args()

    code = args.source.read_text(encoding="utf-8")
    bookmarklet = "javascript:" + quote(code, safe="()[]{}:;,.!~=+-*/?&|'")
    if args.kind == "missions":
        title = "SCMDB 任务采集助手"
        intro = "支持中文任务内容。手动启动批量采集后，助手逐个打开当前列表的任务、切换公开详情标签、尝试展开标准折叠项并关闭详情。不直接访问 /data/、自动翻页或读取应用内部数据。"
        steps = """<li>更新旧版：先导出并关闭 SCMDB 页面上的旧助手，删除旧书签，再把本页按钮重新拖到收藏栏。已打开的安装页请刷新。</li>
<li>打开 <a href="https://scmdb.net/" target="_blank" rel="noopener">SCMDB</a>，等待任务列表出现。中文翻译可以保留，另行记录页面显示的游戏版本及 LIVE/PTU。</li>
<li>点击收藏栏中的采集助手，关闭已有任务详情，先保留默认的 100 个任务，点击“自动采集详情”。程序只处理启动时当前列表中已有的卡片，运行时请勿操作站点或切换语言／版本。</li>
<li>自动采集详情会同时悬停地点变量并展开区域清单；恢复旧进度后，缺少地点明细的已完成任务也会自动重新采集。</li>
<li>每个任务会查看概览 Overview、战斗 Combat（若有）、要求 Requirements 和计算 Calculator；Calculator 只采奖励字段、声望等级差额及规则，不采人数输入或重复计算结果，Community 不采集。可随时点“停止自动采集”；停止后保留详情供检查，手动关闭即可再次启动。程序跳过本页会话中已完整跑完的任务，失败条目会记录在导出中并可重试。</li>
<li>先检查 100 个任务的导出效果，再提高本批任务数。助手按 DOM 稳定状态等待，并，使用后台 Worker 定时器（不可用时回退普通定时器），批量期间不重复扫描整个列表；面板显示实测速率和预计剩余时间。大型列表建议分批并及时导出。非标准折叠项仍需手动展开，标签计数不代表详情完整性。</li>
<li>点击“导出 JSON”，保存到 scminer-local/imports/scmdb/missions/。每25个任务和批次结束自动保存至当前浏览器的 IndexedDB；刷新后重新启动助手，确认游戏版本、翻译和 LIVE/PTU 相同，再点“恢复上次进度”。未到保存点的任务会重跑。保存失败会显示提示，需手动导出。</li>
<li>续采已有文件：点击“导入 JSON”选择任务助手的导出，记录按任务 ID 合并，不删除已有内容。文件版本缺失时默认重新采集；确认为同一版本时勾选“文件版本缺失时，确认与当前游戏版本相同”再导入，可恢复完成标记。明确版本不同的文件拒绝导入。导入后自动保存到浏览器，保存失败请手动导出。</li><li>连同页面游戏版本一起反馈首批 JSON。此阶段保留原始内容，不生成完整性保证。可把标签放到后台，运行时不要操作 SCMDB 页面。保持电脑唤醒；标签冻结／丢弃、浏览器退出或电脑休眠会暂停采集。完成后默认自动导出，下载被浏览器拦截时请手动导出。不要在游戏版本更新后恢复旧进度。</li>"""
        page = f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title>
<style>body{{max-width:780px;margin:40px auto;padding:0 22px;background:#071114;color:#e8f6f7;font:16px system-ui;line-height:1.7}}a{{color:#35d9e8}}.bookmark{{display:inline-block;padding:12px 18px;background:#35d9e8;color:#031014;border-radius:10px;font-weight:bold;text-decoration:none}}textarea{{box-sizing:border-box;width:100%;height:100px}}</style>
<h1>{title}</h1><p>{intro}</p><p>把下方按钮拖到浏览器收藏栏。点击本说明页上的按钮不会开始采集。</p><p><a class="bookmark" href="{bookmarklet}">启动 SCMDB 任务采集</a></p><ol>{steps}</ol>
<details><summary>无法拖动书签？</summary><p>新建书签，将下方完整内容复制到书签的“网址”字段。使用桌面浏览器操作更方便。</p><textarea readonly>{bookmarklet.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')}</textarea></details></html>'''
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(page, encoding="utf-8")
        print(f"wrote {args.output}")
        return
    page = f"""<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SCMDB 公开页面采集助手</title>
<style>body{{max-width:680px;margin:48px auto;padding:0 22px;background:#071114;color:#e8f6f7;font:16px system-ui,sans-serif;line-height:1.65}}a{{display:inline-block;padding:12px 18px;border-radius:10px;background:#35d9e8;color:#031014;font-weight:800;text-decoration:none}}code{{padding:2px 5px;border-radius:4px;background:#10262a}}</style>
<h1>SCMDB 公开页面采集助手</h1>
<p>把下方按钮拖到浏览器收藏栏。它只读取 Fabricator 页面已渲染的蓝图卡片和制造详情，不直接访问 <code>/data/</code>。原有配方列表与新增品质属性分别导出。</p>
<p><a href="{bookmarklet}">启动 SCMDB 采集</a></p>
<ol><li>打开 SCMDB 的 Fabricator 页面，等待列表出现。</li><li>点击收藏栏中的“启动 SCMDB 采集”。</li><li>缓慢滚到底部，让页面逐段显示蓝图；右下角会显示已记录数量。</li><li>点击“导出”，把配方列表 JSON 放入项目后交给导入器处理。</li><li>采品质属性：在原版英文界面打开一个蓝图详情，保持 Craft（制造）视图，在“更多工具”中点击“仅采当前蓝图”。会点击最低、基础、50%、最高四个公开预设按钮，记录各槽位品质、影响范围、成品基础和变化属性，再恢复原品质值。没有品质影响的配方记录明确提示。运行时请勿切换蓝图或操作控件。</li><li>先采弹匣、武器、护甲各一个；再点击“导出 JSON”。此文件为独立格式 scmdb-public-fabricator-details-v1，保存到 imports/scmdb/blueprint-details/；不要交给旧列表导入器或覆盖原配方。它保留显示精度，不宣称已验证所有计算公式。点击“自动采集详情”（从详情页启动会自动返回列表），默认每批 10 个，自动打开详情、采四组品质预设、恢复品质后返回列表。每个蓝图和批次结束保存到当前浏览器 IndexedDB，刷新后在同一游戏版本、语言下点击“恢复上次进度”。再次启动跳过已完成项，失败项可重试。停止会等待当前蓝图完成；不自动翻页，不保证后台冻结或休眠时继续。请及时导出备份，先检查 10 个样本再扩大批量。</li><li>采集范围默认“当前筛选列表”。选择“自动分类分组”后启动，会清除旧搜索和筛选，先记录全量已加载卡片，再按实际分类自动分组：列表超过 100 个才继续细分，小组直接采集，筛选无法缩小的大组继续处理并写入提示。护甲优先按轻中重、部位，武器按子类型，组件按当前可用的类别／等级／子类型。每批总量仍由“本批蓝图数”控制，达到数量或停止后再次启动会重新分组并跳过已完成记录。分组路径、数量、超大组及未分类条目写入导出，不以遍历结束证明全站完整。</li><li>“导入 JSON”支持新版蓝图属性导出，也支持旧版卡片导出。记录合并保留；新版映射让已完成蓝图直接跳过，旧文件没有映射时会打开详情确认身份后跳过品质采样。版本缺失默认重采，只有确认同版本并勾选后才恢复完成标记；明确版本不同拒绝导入。导入后自动保存进度。</li></ol>
</html>
"""
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(page, encoding="utf-8")
    print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
