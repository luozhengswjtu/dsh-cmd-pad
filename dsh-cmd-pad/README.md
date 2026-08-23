# dsh-cmd-pad

DSH Web UI 里的「测试命令行速查面板」：命令按**自定义分组 + 项目**归档，点一下直接跑，或一键复制。
产品设计见 `dsh-cmd-pad-功能文档与交互设计.md`（v0.3）；落地路线见 `TASK.md`。

## 形态（双形态，软依赖 better-sidebar）

- **主形态**（装了 better-sidebar）：注册为侧边栏 Tab `cmd-pad:pad`（order 45，单实例）；
- **降级形态**（没装）：浮动图标 + 非模态右侧抽屉。

## 安装

```bash
dsh plugin --profile web add <本目录>
```

装完重启 `dsh web` + 硬刷新浏览器（Ctrl+Shift+R）。

## 仓库结构

```
dsh-cmd-pad/
├── package.json       # dsh.bundle.patch + dsh.client 声明；peer 含 dsh-better-sidebar(optional)
├── cordis.patch.yml   # host 半挂载行（id: cmd-pad / name: dsh-cmd-pad）
├── src/
│   ├── index.js       # host 半：/cmd-pad 前缀路由（T01 骨架，T02 起填充 API）
│   └── client.js      # client 半：手写 __ModuleLoader__.load wire format（零构建）
└── README.md
```

## 开发守则

见仓库根 `AGENTS.md` 与 `docs/`（接入规范 / 视觉风格统一规范）。
