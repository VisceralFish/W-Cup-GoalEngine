# W-Cup Goal Engine

赔率约束下的四节制足球比赛模拟器。当前版本实现多市场联合校准、Q1–Q4 动态出线状态模拟、冷门路径识别和体彩相对外盘的错误定价分析。

## 当前范围

已实现：

- 外盘 1X2 赔率作为校准源
- 体彩 1X2 赔率独立去水并保留为比较数据
- 外盘比分盘、总进球盘、大小球联合校准
- Poisson 参数网格拟合及 `tempo` 推断
- `phase_shape` 推断和四节进球权重
- 领先降速、强队落后反扑、弱队领先收缩
- 根据当前比分、比赛阶段和出线目标动态调整风险
- 支持必须赢、平局即可和净胜球目标
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
    qualificationContext: {
      homeTarget: "draw_or_better",
      awayTarget: "win",
    },
  },
  simulation: {
    simulations: 10_000,
    seed: 42,
  },
});
```

基础 λ 完全由赔率市场校准。伤停、轮换、赛前状态等信息视为已经反映在最新赔率中，不再通过赛前球队状态系数重复调整。

Q1 开球时使用纯市场基线。此后在每次进球、丢球或扳平，以及每节切换时，根据当前比分动态计算出线反应。每节内部使用事件驱动模拟：

```text
等待下一粒进球
→ 判断进球方
→ 更新比分与出线状态
→ 立即重算双方进球强度
→ 模拟本节剩余时间
```

动态计算公式：

```text
urgency = 当前比分距离出线目标的差距
timePressure = [0.15, 0.35, 0.65, 1.00]
risk = urgency × timePressure

ownAttack =
  1 + risk × attackResponse

opponentAttack =
  (1 + risk × defensiveExposure)
  × (1 + risk × counterExposure)
```

默认反应参数：

```text
attackResponse     = 0.30
defensiveExposure  = 0.16
counterExposure    = 0.10
targetProtection   = 0.15
```

目标已经达成时，球队会随比赛进程降低主动进攻，并轻微压低对手进攻：

```text
ownAttack      = 1 - timePressure × targetProtection
opponentAttack = 1 - timePressure × targetProtection × 0.5
```

支持的目标：

```ts
type QualificationTarget =
  | "win"
  | "draw_or_better"
  | "goal_difference"
  | "none";
```

净胜球目标示例：

```ts
qualificationContext: {
  homeTarget: "goal_difference",
  homeRequiredGoalDifference: 2,
  awayTarget: "draw_or_better",
}
```

旧的 `context.motivation` 仍可兼容读取，但会生成迁移警告。

比分盘和总进球盘允许提供部分选项。若市场没有覆盖完整选项，校准和错误定价比较会在已提供选项范围内归一化；建议提供 `other` 比分项及完整的 `0`–`7+` 总进球项，以提高可解释性。

完整产品规格见 [四节制足球比赛引擎_Spec.md](./四节制足球比赛引擎_Spec.md)。
