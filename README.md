# 智时日程 (Student Planner)

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)]()
[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20Web-green.svg)]()
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)]()

智时日程是一款面向学生场景的轻量级日程管理应用，聚焦“课程表 + 每日待办”双核心能力。项目同时支持 Web 与 Android 容器化运行，强调移动端交互体验、课表可视化管理和本地提醒能力。

## ✨ 项目亮点

- 课程表与日程清单一体化，减少在多个应用间切换。
- 面向移动端优化的交互体验，支持底部导航、滑动切页和弹窗式录入。
- 支持本地通知提醒，在 Android 场景下可结合 Capacitor 获得更稳定的提醒能力。
- 数据默认保存在浏览器本地存储，部署和使用门槛低。

## ✨ 核心功能

### 1. 智能课表系统

- 支持按周查看课程表，并根据学期起始日期自动推算当前周次。
- 支持单双周与指定周数组合显示逻辑。
- 支持手动添加课程，包含课程名、地点、星期、起止节次、周类型等信息。
- 支持 URL 导入和 JSON 导入课程数据，便于从外部教务系统迁移。
- 课程表视图会自动滚动定位到当天列，提升移动端查看效率。

### 2. 高效计划清单

- 提供“今日日程”视图，按时间排序展示当天计划。
- 支持新增、完成、删除任务，并展示当天完成进度。
- 支持任务优先级标记，区分普通事项与重要事项。
- 支持在日历视图中查看和管理不同日期下的计划。

### 3. 智能通知提醒

- 集成 `@capacitor/local-notifications`，在移动端提供本地提醒能力。
- 默认在任务开始前 5 分钟提醒。
- 当 Capacitor 通知不可用时，可回退到 Web Notification。

### 4. 自动同步能力

- 可将“今日课程”自动同步为当日日程计划。
- 支持导入后的课程自动标记完成状态，适合以打卡方式记录课程进度。

### 5. 移动端交互体验

- 底部导航适配移动端操作习惯。
- 页面间支持左右滑动切换。
- 弹窗与卡片布局针对触屏设备做了优化。
- 底部导航区启用了防文本误选设计，减少误触干扰。

## 🛠️ 技术栈

- 前端框架：React 19 + TypeScript
- 构建工具：Vite 6
- 样式方案：Tailwind CSS 4
- 动效方案：Framer Motion 风格动画 API
- 图标库：Lucide React
- 移动端封装：Capacitor 8
- 日期处理：date-fns
- 开发服务与代理：Express + Vite Middleware

## 🚀 快速启动

### 环境要求

- Node.js 18 及以上
- npm 9 及以上
- Android Studio（仅在需要打包 Android 时）

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境

项目开发模式通过 `server.ts` 启动 Express 服务，并挂载 Vite 中间件：

```bash
npm run dev
```

默认启动后可访问：

```text
http://localhost:3000
```

### 3. 构建 Web 版本

```bash
npm run build
```

### 4. Android 打包流程

```bash
npm run static-build
npx cap sync
npx cap open android
```

如果你更倾向于使用项目内脚本，也可以执行：

```bash
npm run cap-sync
npm run android-open
```

## 📜 可用脚本

| 脚本 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Express + Vite 开发服务 |
| `npm run build` | 构建 Web 生产包 |
| `npm run static-build` | 生成静态前端产物 |
| `npm run preview` | 预览构建结果 |
| `npm run lint` | 执行 TypeScript 类型检查 |
| `npm run start` | 以 Node 模式启动服务 |
| `npm run cap-sync` | 拷贝 Web 构建产物到 Capacitor 平台目录 |
| `npm run android-open` | 用 Android Studio 打开 Android 工程 |

## 📂 项目结构

```text
.
├── android/                 # Android 原生工程
├── public/                  # 静态资源目录
├── src/
│   ├── components/          # 可复用组件（如 WheelPicker）
│   ├── lib/                 # 工具函数
│   ├── App.tsx              # 核心业务逻辑与主视图
│   ├── index.css            # 全局样式与 Tailwind 注入
│   ├── main.tsx             # React 应用入口
│   └── types.ts             # 类型定义
├── server.ts                # Express 开发/生产服务与导入代理接口
├── capacitor.config.ts      # Capacitor 配置
├── package.json             # 项目脚本与依赖声明
└── README.md                # 项目说明文档
```

## 🔌 数据与存储说明

- 日程、课程与设置默认保存在浏览器 `localStorage`。
- 当前项目未接入数据库，适合个人使用、原型演示或二次开发。
- 提醒开关、课程自动同步开关等设置也会持久化保存。

## 🌐 导入能力说明

项目内置了 `/api/proxy-import` 接口，用于代理拉取外部课表数据，避免直接在前端请求时受到跨域限制。

支持的导入方式包括：

- URL 导入：传入外部课表数据地址，由服务端代理拉取。
- JSON 导入：直接粘贴课表 JSON 数据进行解析。
- 周次解析：支持从周数字段中提取具体周次，并推导单双周类型。

## ⚙️ 环境变量

仓库中提供了 `.env.example`，当前示例如下：

```bash
GEMINI_API_KEY="MY_GEMINI_API_KEY"
APP_URL="MY_APP_URL"
```

说明：

- 当前核心日程与课表功能不依赖数据库。
- 如果你后续扩展 AI 或云端能力，可以基于这些变量继续开发。

## 📱 平台说明

- Web：适合日常浏览器使用和快速部署。
- Android：适合结合 Capacitor 打包为移动应用，并启用本地通知。

## 🔮 后续可扩展方向

- 账号系统与云端同步
- 课程导入适配更多教务系统
- 任务分类、标签与搜索
- 课表分享与导出
- 数据备份与恢复

