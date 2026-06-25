# W-Cup Goal Engine

赔率约束下的足球比分概率模拟器。当前版本实现规格中的 V0.1：赔率去水、1X2 市场概率归一化、Poisson `lambda_home` / `lambda_away` 拟合、蒙特卡洛模拟和 Top 比分输出。

## 当前范围

已实现：

- 外盘 1X2 赔率作为校准源
- 体彩 1X2 赔率独立去水并保留为比较数据
- Poisson 参数网格拟合
- 可复现的带种子蒙特卡洛模拟
- 全场胜平负、期望进球和比分分布
- TypeScript 核心库与命令行接口

尚未实现：

- 比分盘和总进球盘联合校准
- 四节权重与状态转移
- 冷门路径和错误定价分析
- HTTP API 与前端

这些功能对应规格中的 V0.2 及后续版本。

## 环境

- Node.js 22 或更高版本
- npm 10 或更高版本

## 安装与验证

```powershell
npm install
npm test
```

## 运行示例

```powershell
npm run simulate -- examples/germany-ecuador.json
```

也可以构建后直接运行：

```powershell
npm run build
node dist/cli.js examples/germany-ecuador.json
```

输出为结构化 JSON，包含拟合参数、市场概率、模拟摘要、完整比分分布、Top 10 比分和诊断信息。

## 作为库使用

```ts
import { simulate } from "w-cup-goal-engine";

const result = simulate({
  match: {
    homeTeam: "Germany",
    awayTeam: "Ecuador",
    stage: "group",
    groupRound: 3,
  },
  markets: {
    lottery: {
      odds1x2: { homeWin: 1.45, draw: 4.1, awayWin: 6.2 },
    },
    international: {
      odds1x2: { homeWin: 1.5, draw: 4, awayWin: 6 },
    },
  },
  simulation: {
    simulations: 10_000,
    seed: 42,
  },
});
```

完整产品规格见 [四节制足球比赛引擎_Spec.md](./四节制足球比赛引擎_Spec.md)。
