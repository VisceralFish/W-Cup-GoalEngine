# W-Cup Goal Engine

赔率约束下的四节制足球比赛模拟器。当前版本实现规格中的 V0.1–V0.4：多市场联合校准、Q1–Q4 状态模拟、冷门路径识别和体彩相对外盘的错误定价分析。

## 当前范围

已实现：

- 外盘 1X2 赔率作为校准源
- 体彩 1X2 赔率独立去水并保留为比较数据
- 外盘比分盘、总进球盘、大小球联合校准
- Poisson 参数网格拟合及 `tempo` 推断
- `phase_shape` 推断和四节进球权重
- 领先降速、强队落后反扑、弱队领先收缩
- Q4 必须赢冒险和双方接受平局降速
- 球队进攻、防守和终结状态系数
- 可复现的带种子蒙特卡洛模拟
- 全场、半场、总进球、四节进球和比分分布
- 首球、逆转和冷门路径分析
- 体彩 1X2、比分、总进球错误定价候选
- TypeScript 核心库与命令行接口

尚未实现：

- 半全场市场联合校准
- 球队风格和球员级参数
- 实时滚球更新
- HTTP API 与前端

当前引擎提供概率分析，不构成确定性赛果或投注建议。

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

输出为结构化 JSON，主要包含：

- `derivedParams`：λ、tempo、phase shape、四节权重和状态参数
- `simulationSummary`：全场、半场和总进球统计
- `scoreDistribution`：完整比分概率
- `quarterGoalDistribution`：Q1–Q4 进球概率
- `pathAnalysis`：首球、逆转和冷门路径
- `mispricingAnalysis`：体彩相对模型与外盘的概率 Gap
- `diagnostics`：分市场拟合损失、完整度和警告

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
      odds1x2: { homeWin: 1.55, draw: 4.2, awayWin: 8 },
      correctScore: {
        "0-0": 13,
        "1-0": 7.5,
        "2-0": 8.5,
        "1-1": 10.5,
        "0-1": 20,
        other: 3.2,
      },
      totalGoals: {
        "0": 13,
        "1": 5,
        "2": 3.5,
        "3": 4,
        "4": 7,
        "5": 12,
        "6": 20,
        "7+": 30,
      },
    },
    international: {
      odds1x2: { homeWin: 1.7, draw: 3.8, awayWin: 5.5 },
      correctScore: {
        "0-0": 11,
        "1-0": 6.5,
        "2-0": 8,
        "1-1": 7.5,
        "0-1": 12,
        other: 3,
      },
      totalGoals: {
        "0": 11,
        "1": 4.5,
        "2": 3.2,
        "3": 3.8,
        "4": 6.5,
        "5": 11,
        "6": 18,
        "7+": 28,
      },
      overUnder: { line: 2.5, over: 2.05, under: 1.8 },
      halfTime1x2: { homeWin: 2.25, draw: 2.1, awayWin: 5.5 },
    },
  },
  context: {
    motivation: {
      homeAcceptDraw: true,
      awayNeedWin: true,
    },
    teamCondition: {
      homeAttackMultiplier: 1.05,
      awayAttackMultiplier: 0.95,
      homeDefenseMultiplier: 1.05,
      awayDefenseMultiplier: 0.95,
      homeFinishingMultiplier: 1.03,
      awayFinishingMultiplier: 0.98,
    },
  },
  simulation: {
    simulations: 10_000,
    seed: 42,
  },
});
```

球队状态系数默认均为 `1.0`，计算规则如下：

```text
home lambda =
  market home lambda
  × homeAttackMultiplier
  × homeFinishingMultiplier
  ÷ awayDefenseMultiplier

away lambda =
  market away lambda
  × awayAttackMultiplier
  × awayFinishingMultiplier
  ÷ homeDefenseMultiplier
```

大于 `1` 表示增强，小于 `1` 表示减弱。防守系数描述本队防守能力，因此它作用于对手 λ 的分母。调整后的 λ 会用于四节分配与状态机；原始市场 λ 和所有生效系数同时保留在 `derivedParams` 中。

比分盘和总进球盘允许提供部分选项。若市场没有覆盖完整选项，校准和错误定价比较会在已提供选项范围内归一化；建议提供 `other` 比分项及完整的 `0`–`7+` 总进球项，以提高可解释性。

完整产品规格见 [四节制足球比赛引擎_Spec.md](./四节制足球比赛引擎_Spec.md)。
