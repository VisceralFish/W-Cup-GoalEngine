# 四节制足球比赛引擎 Spec

> 版本：v0.1  
> 定位：赔率约束下的四节制进球过程模拟器  
> 适用场景：世界杯赛果/比分/进球路径概率模拟、体彩相对外盘错误定价识别、冷门路径分析  
> 非目标：不是完整足球经理游戏引擎，不直接承诺预测真实比分，不提供确定性投注结论。

---

## 1. 一句话结论

本系统将胜平负、比分、总进球、半场胜平负、半全场等赔率市场输入，反推为 `λ_home`、`λ_away`、`tempo`、`phase_shape`、四节进球强度和状态转移参数，再通过蒙特卡洛模拟生成比分分布、四节进球路径、冷门路径和体彩相对市场的概率 Gap。

---

## 2. 背景与设计动机

传统赛果分析通常直接从胜平负赔率或主观判断推导最终结果，缺少对“比赛如何发生”的解释。足球比赛不是静态事件，而是一个随时间、比分状态、比赛目标和战术风险动态变化的进球过程。

2026 世界杯由于补水暂停、补时增加和高温条件，比赛天然呈现更明显的四节化结构：

```text
Q1：0' - 25'        开局阶段 / 第一次补水暂停前
Q2：25' - 45+'      上半场补水暂停后 / 半场前冲刺
Q3：45' - 70'       中场调整后 / 第二次补水暂停前
Q4：70' - 90+'      末段博弈 / 体能下降 / 补时放大
```

因此，本系统不直接预测比分，而是构建一个“赔率约束下的四节制比赛引擎”：

```text
赔率输入
  ↓
去水与市场概率归一化
  ↓
反推全场期望进球 λ_home / λ_away
  ↓
反推比赛节奏 tempo 与四节形态 phase_shape
  ↓
生成 Q1-Q4 双方进球强度
  ↓
根据比分状态动态修正后续强度
  ↓
蒙特卡洛模拟 N 场比赛
  ↓
输出比分分布、进球路径、冷门路径、赔率 Gap
```

---

## 3. 系统目标

### 3.1 核心目标

1. 将赔率市场转化为可解释的比赛进球过程。
2. 输出全场比分分布、半场比分分布、四节进球概率和路径概率。
3. 识别体彩赔率相对国际市场赔率的错误定价。
4. 显式建模冷门路径，而不是只给出弱队不败概率。
5. 保持模型可校准、可解释、可回测。

### 3.2 非目标

本系统不做以下内容：

1. 不模拟每名球员、每次传球、每次射门。
2. 不构建完整 FM 式足球经理引擎。
3. 不将模型结果包装为确定性投注建议。
4. 不用大量不可验证的战术参数直接决定比分。
5. 不直接声称模型能战胜市场，只识别“相对赔率差异”。

---

## 4. 核心设计原则

### 4.1 赔率优先

外盘赔率作为主校准源，体彩赔率作为待检测市场。

```text
外盘赔率 → 拟合市场隐含分布
体彩赔率 → 计算体彩隐含概率
模型分布 → 与体彩隐含概率比较 Gap
```

### 4.2 过程模拟，而非比分硬算

系统不直接输出“预测比分”，而是模拟比赛过程：

```text
Q1 → 状态更新 → Q2 → 中场重置 → Q3 → 状态更新 → Q4 → 最终比分
```

### 4.3 所有足球语义必须折算为概率参数

球队风格、比赛动机、补水暂停、领先/落后反应等足球语义，不直接决定比分，只能影响：

```text
λ_home
λ_away
tempo
phase_shape
quarter_weights
state_transition
```

### 4.4 控制参数数量

MVP 阶段不引入球员级参数，避免伪精细化。优先实现宏观、可拟合、可回测的参数体系。

---

## 5. 核心概念定义

### 5.1 λ_home / λ_away

双方全场期望进球。

```text
λ_home = 主队全场期望进球
λ_away = 客队全场期望进球
λ_total = λ_home + λ_away
```

这两个参数主要由胜平负赔率、比分赔率、总进球赔率共同拟合得出。

### 5.2 tempo

比赛整体节奏因子。

```text
tempo < 1.0   低节奏 / 小比分倾向
tempo = 1.0   中性节奏
tempo > 1.0   高节奏 / 开放局
```

修正公式：

```text
λ_home_adj = λ_home × tempo
λ_away_adj = λ_away × tempo
```

建议范围：

```text
0.75 - 0.90：低节奏
0.90 - 1.10：正常节奏
1.10 - 1.25：高节奏
1.25 - 1.40：极开放
```

### 5.3 phase_shape

四节进球分布形态。

```text
balanced              均衡
front_loaded          前置发力
back_loaded           后置发力
low_first_half        上半场低节奏
high_first_half       上半场高节奏
chaotic               开放对攻
favorite_late_push    强队后程发力
underdog_survival     弱队死守求生
```

### 5.4 quarter_weights

将全场 λ 分配到 Q1-Q4 的权重。

```text
homeQuarterWeights = [Q1, Q2, Q3, Q4]
awayQuarterWeights = [Q1, Q2, Q3, Q4]
```

要求：

```text
sum(homeQuarterWeights) = 1
sum(awayQuarterWeights) = 1
```

### 5.5 state_reaction

比分状态对后续节段进球强度的修正。

典型状态：

```text
强队领先
强队落后
弱队领先
弱队落后
平局进入末段
双方都接受平局
一方必须赢
```

---

## 6. 输入参数设计

## 6.1 MVP 输入参数

第一版建议只要求以下输入：

```text
基础信息：
1. 主队
2. 客队
3. 比赛阶段
4. 小组第几轮，可选

赔率信息：
5. 体彩胜平负赔率
6. 外盘胜平负赔率
7. 体彩比分赔率
8. 外盘比分赔率
9. 总进球赔率 / 大小球赔率
10. 半场胜平负赔率
11. 半全场赔率，可选

比赛上下文：
12. 主队是否必须赢
13. 客队是否必须赢
14. 主队是否接受平局
15. 客队是否接受平局

模拟参数：
16. 模拟次数
17. 随机种子，可选
```

### 6.1.1 最小输入 TypeScript 定义

```ts
type Odds1x2 = {
  homeWin: number;
  draw: number;
  awayWin: number;
};

type CorrectScoreOdds = {
  "0-0"?: number;
  "1-0"?: number;
  "2-0"?: number;
  "2-1"?: number;
  "3-0"?: number;
  "3-1"?: number;
  "1-1"?: number;
  "0-1"?: number;
  "0-2"?: number;
  "1-2"?: number;
  "2-2"?: number;
  "3-2"?: number;
  "other"?: number;
};

type TotalGoalsOdds = {
  "0"?: number;
  "1"?: number;
  "2"?: number;
  "3"?: number;
  "4"?: number;
  "5"?: number;
  "6"?: number;
  "7+"?: number;
};

type OverUnderOdds = {
  line: number;
  over: number;
  under: number;
};

type HalfTime1x2Odds = {
  homeWin: number;
  draw: number;
  awayWin: number;
};

type HalfFullOdds = {
  "H-H"?: number;
  "H-D"?: number;
  "H-A"?: number;
  "D-H"?: number;
  "D-D"?: number;
  "D-A"?: number;
  "A-H"?: number;
  "A-D"?: number;
  "A-A"?: number;
};

type MinimalQuarterGoalEngineInput = {
  match: {
    homeTeam: string;
    awayTeam: string;
    stage: "group" | "knockout";
    groupRound?: 1 | 2 | 3;
  };

  markets: {
    lottery: {
      odds1x2: Odds1x2;
      correctScore?: CorrectScoreOdds;
      totalGoals?: TotalGoalsOdds;
      halfTime1x2?: HalfTime1x2Odds;
      halfFull?: HalfFullOdds;
    };

    international: {
      odds1x2: Odds1x2;
      correctScore: CorrectScoreOdds;
      overUnder?: OverUnderOdds;
      totalGoals?: TotalGoalsOdds;
      halfTime1x2?: HalfTime1x2Odds;
      halfFull?: HalfFullOdds;
    };
  };

  context?: {
    motivation?: {
      homeNeedWin?: boolean;
      awayNeedWin?: boolean;
      homeAcceptDraw?: boolean;
      awayAcceptDraw?: boolean;
      homeAlreadyQualified?: boolean;
      awayAlreadyQualified?: boolean;
    };
  };

  simulation: {
    simulations: number;
    seed?: number;
  };
};
```

---

## 6.2 完整输入参数

完整版本支持球队强度、风格标签、手动 override 和高级模拟控制。

```ts
type TeamStyle =
  | "high_pressing"
  | "possession"
  | "counter_attack"
  | "deep_block"
  | "set_piece"
  | "open_game"
  | "low_block"
  | "slow_start"
  | "late_push"
  | "chaotic";

type PhaseShape =
  | "balanced"
  | "front_loaded"
  | "back_loaded"
  | "low_first_half"
  | "high_first_half"
  | "chaotic"
  | "favorite_late_push"
  | "underdog_survival";

type QuarterGoalEngineInput = {
  match: {
    matchId: string;
    homeTeam: string;
    awayTeam: string;
    competition: "WorldCup";
    stage:
      | "group"
      | "round_of_32"
      | "round_of_16"
      | "quarter_final"
      | "semi_final"
      | "final";
    groupRound?: 1 | 2 | 3;
    neutralVenue: boolean;
    kickoffTime?: string;
  };

  markets: {
    lottery?: MarketOddsInput;
    international?: MarketOddsInput;
  };

  context?: {
    teamPower?: {
      homeElo?: number;
      awayElo?: number;
      homeFifaRank?: number;
      awayFifaRank?: number;
    };

    teamRating?: {
      homeAttackRating?: number;
      homeDefenseRating?: number;
      awayAttackRating?: number;
      awayDefenseRating?: number;
    };

    teamStyle?: {
      homeStyles?: TeamStyle[];
      awayStyles?: TeamStyle[];
    };

    motivation?: {
      homeNeedWin?: boolean;
      awayNeedWin?: boolean;
      homeAcceptDraw?: boolean;
      awayAcceptDraw?: boolean;
      homeAlreadyQualified?: boolean;
      awayAlreadyQualified?: boolean;
      homeMustAvoidBigLoss?: boolean;
      awayMustAvoidBigLoss?: boolean;
    };
  };

  engine?: {
    lambdaOverride?: {
      lambdaHome?: number;
      lambdaAway?: number;
    };

    tempoOverride?: number;
    phaseShapeOverride?: PhaseShape;

    quarterWeightsOverride?: {
      home: [number, number, number, number];
      away: [number, number, number, number];
    };

    stateReaction?: {
      favoriteTrailingBoost?: number;
      underdogLeadingDefense?: number;
      drawLateRiskBoost?: number;
      leaderSlowdown?: number;
      opponentCounterBoost?: number;
    };

    randomness?: {
      matchTempoNoiseSigma?: number;
      quarterNoiseSigma?: number;
      finishingNoiseSigma?: number;
      seed?: number;
    };

    simulation?: {
      simulations: number;
      maxGoalsPerTeam?: number;
    };
  };
};

type MarketOddsInput = {
  source: "lottery" | "international" | "exchange" | "bookmaker_avg";
  odds1x2?: Odds1x2;
  correctScore?: CorrectScoreOdds;
  totalGoals?: TotalGoalsOdds;
  overUnder?: OverUnderOdds;
  halfTime1x2?: HalfTime1x2Odds;
  halfFull?: HalfFullOdds;
  timestamp?: string;
};
```

---

## 7. 输入参数优先级

当多个输入互相冲突时，按以下优先级处理：

```text
1. 手动 override 参数
2. 外盘赔率
3. 外盘比分赔率
4. 外盘总进球 / 大小球赔率
5. 外盘半场 / 半全场赔率
6. 体彩赔率
7. 球队强度评分
8. 球队风格标签
9. 比赛动机
10. 默认参数
```

但在错误定价分析中，校准源和比较源必须区分：

```text
外盘赔率：用于拟合市场共识分布
体彩赔率：用于计算待检测隐含概率
模型输出：用于与体彩隐含概率比较
```

不建议把体彩赔率和外盘赔率简单混合后一起拟合，否则会稀释错误定价信号。

---

## 8. 输出参数设计

## 8.1 核心输出

```ts
type QuarterGoalEngineOutput = {
  derivedParams: DerivedEngineParams;
  marketProbabilities: MarketProbabilities;
  simulationSummary: SimulationSummary;
  scoreDistribution: ScoreDistribution;
  quarterGoalDistribution: QuarterGoalDistribution;
  pathAnalysis: PathAnalysis;
  mispricingAnalysis?: MispricingAnalysis;
  diagnostics: EngineDiagnostics;
};
```

## 8.2 派生参数输出

```ts
type DerivedEngineParams = {
  lambdaHome: number;
  lambdaAway: number;
  lambdaTotal: number;

  tempo: number;
  phaseShape: PhaseShape;

  homeQuarterWeights: [number, number, number, number];
  awayQuarterWeights: [number, number, number, number];

  homeQuarterLambda: [number, number, number, number];
  awayQuarterLambda: [number, number, number, number];

  drawCorrelationFactor: number;
  favoriteBias: number;

  stateReactionProfile: {
    favoriteTrailingBoost: number;
    underdogLeadingDefense: number;
    drawLateRiskBoost: number;
    leaderSlowdown: number;
    opponentCounterBoost: number;
  };
};
```

## 8.3 模拟摘要输出

```ts
type SimulationSummary = {
  simulations: number;

  fullTime: {
    homeWinProb: number;
    drawProb: number;
    awayWinProb: number;
    expectedHomeGoals: number;
    expectedAwayGoals: number;
    expectedTotalGoals: number;
  };

  halfTime: {
    homeLeadProb: number;
    drawProb: number;
    awayLeadProb: number;
    expectedGoals: number;
  };

  totalGoals: {
    under15: number;
    over15: number;
    under25: number;
    over25: number;
    under35: number;
    over35: number;
  };
};
```

## 8.4 比分分布输出

```ts
type ScoreDistribution = Array<{
  score: string;
  probability: number;
  count: number;
  impliedLotteryProbability?: number;
  impliedInternationalProbability?: number;
  gapVsLottery?: number;
}>;
```

示例：

```json
[
  {
    "score": "1-0",
    "probability": 0.123,
    "count": 1230,
    "impliedLotteryProbability": 0.091,
    "impliedInternationalProbability": 0.118,
    "gapVsLottery": 0.032
  }
]
```

## 8.5 四节进球分布输出

```ts
type QuarterGoalDistribution = {
  Q1: QuarterResult;
  Q2: QuarterResult;
  Q3: QuarterResult;
  Q4: QuarterResult;
};

type QuarterResult = {
  homeGoalProb: number;
  awayGoalProb: number;
  anyGoalProb: number;
  noGoalProb: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  expectedTotalGoals: number;
};
```

## 8.6 路径分析输出

```ts
type PathAnalysis = {
  firstGoal: {
    noGoalProb: number;
    homeFirstGoalProb: number;
    awayFirstGoalProb: number;
    byQuarter: {
      Q1: number;
      Q2: number;
      Q3: number;
      Q4: number;
    };
  };

  comeback: {
    homeComebackWinProb: number;
    awayComebackWinProb: number;
    favoriteComebackProb: number;
    underdogHoldLeadProb: number;
  };

  upsetPaths: Array<{
    pathType: string;
    probability: number;
    commonScores: string[];
    description: string;
  }>;
};
```

典型冷门路径：

```text
1. 弱队 Q1/Q2 先进球，后续深防守，最终 0-1 / 1-1
2. 前三节 0-0，强队 Q4 压上，弱队反击偷袭
3. 强队早早领先后降速，弱队 Q4 扳平
4. 半场平，全场弱队胜
```

## 8.7 错误定价分析输出

```ts
type MispricingAnalysis = {
  targetMarket: "lottery";
  referenceMarket: "international";

  candidates: Array<{
    marketType:
      | "1x2"
      | "correct_score"
      | "total_goals"
      | "half_time_1x2"
      | "half_full";
    selection: string;
    modelProbability: number;
    lotteryImpliedProbability: number;
    internationalImpliedProbability?: number;
    probabilityGap: number;
    fairOdds: number;
    lotteryOdds?: number;
    edgeScore: number;
    confidence: "low" | "medium" | "high";
    reason: string;
  }>;
};
```

---

## 9. 核心算法流程

## 9.1 总流程

```text
1. 输入校验
2. 赔率去水
3. 外盘市场概率归一化
4. 体彩隐含概率归一化
5. 拟合 λ_home / λ_away
6. 拟合 tempo
7. 拟合 draw_correlation_factor
8. 推断 phase_shape
9. 生成四节权重
10. 生成初始四节 λ
11. 执行蒙特卡洛模拟
12. 统计比分、半场、四节、路径分布
13. 与体彩隐含概率比较
14. 输出错误定价候选
15. 输出诊断信息
```

---

## 9.2 赔率去水

任意赔率集合转换为隐含概率：

```text
raw_probability_i = 1 / odds_i
normalized_probability_i = raw_probability_i / sum(raw_probability)
```

示例：

```text
主胜 1.80，平 3.40，客胜 4.80
raw = [0.5556, 0.2941, 0.2083]
sum = 1.0580
normalized = [0.5251, 0.2780, 0.1969]
```

所有赔率输入必须去水，否则模型会系统性高估事件概率。

---

## 9.3 λ 拟合

目标是寻找 `λ_home`、`λ_away`，使模型分布尽量贴近外盘市场分布。

初始比分概率使用独立 Poisson：

```text
P(HomeGoals = i) = Pois(i, λ_home)
P(AwayGoals = j) = Pois(j, λ_away)
P(score = i:j) = Pois(i, λ_home) × Pois(j, λ_away)
```

优化目标：

```text
loss =
  w_1x2 × error_1x2
+ w_score × error_score
+ w_total × error_total_goals
+ w_ht × error_half_time
+ w_hf × error_half_full
```

推荐初始权重：

```text
w_score = 0.40
w_total = 0.25
w_1x2 = 0.20
w_ht = 0.10
w_hf = 0.05
```

如果比分赔率缺失，则权重重分配：

```text
w_total = 0.40
w_1x2 = 0.35
w_ht = 0.15
w_hf = 0.10
```

### 9.3.1 参数搜索范围

```text
λ_home ∈ [0.1, 4.5]
λ_away ∈ [0.1, 4.5]
λ_total ∈ [0.3, 6.5]
```

### 9.3.2 推荐实现

MVP 可使用网格搜索 + 局部优化：

```text
1. 粗网格：λ_home, λ_away 步长 0.05
2. 找到 Top K 候选
3. 局部 Nelder-Mead / L-BFGS-B 优化
4. 输出最小 loss 参数
```

---

## 9.4 draw_correlation_factor

简单独立 Poisson 常低估低比分平局，尤其是 0-0、1-1。需要引入平局修正。

MVP 简化方式：

```text
P(0-0) *= draw_factor_00
P(1-1) *= draw_factor_11
P(2-2) *= draw_factor_22
```

然后重新归一化。

默认：

```text
draw_factor_00 = 1.05 - 1.25
draw_factor_11 = 1.03 - 1.18
draw_factor_22 = 1.00 - 1.10
```

进阶版本可使用 Dixon-Coles 修正。

---

## 9.5 tempo 推断

tempo 来源：

```text
1. 总进球赔率 / 大小球赔率
2. 比分赔率结构
3. 0-0、1-0、1-1 与 2-1、3-1、2-2、3-2 的相对热度
4. 半场胜平负赔率
```

MVP 规则：

```text
如果低比分热度高：tempo 下调
如果高比分热度高：tempo 上调
如果半场平概率高：Q1/Q2 降速
如果半场胜负概率高：Q1/Q2 升速
```

低比分集合：

```text
0-0, 1-0, 0-1, 1-1
```

高比分集合：

```text
2-1, 1-2, 3-1, 1-3, 2-2, 3-2, 2-3
```

建议输出：

```text
tempo = clamp(λ_total_from_total_goals / λ_total_from_1x2_score, 0.75, 1.40)
```

---

## 9.6 phase_shape 推断

根据赔率和上下文推断四节形态。

### 9.6.1 映射规则

```text
半场平概率高 + D-H 半全场偏热 → back_loaded / favorite_late_push
半场胜负概率高 + 总进球偏高 → front_loaded / chaotic
0-0、1-1 偏热 → low_first_half
强队深盘 + 2-0、3-0 偏热 → front_loaded 或 balanced
弱队不败赔率压低 + 低比分热 → underdog_survival
双方必须赢 + 高总进球 → chaotic
双方接受平局 → low_first_half + Q4 降速
```

### 9.6.2 默认四节权重

```ts
const phaseWeights = {
  balanced: [0.23, 0.24, 0.24, 0.29],
  front_loaded: [0.28, 0.25, 0.23, 0.24],
  back_loaded: [0.20, 0.22, 0.26, 0.32],
  low_first_half: [0.19, 0.21, 0.27, 0.33],
  high_first_half: [0.27, 0.27, 0.22, 0.24],
  chaotic: [0.25, 0.25, 0.25, 0.25],
  favorite_late_push: [0.21, 0.22, 0.26, 0.31],
  underdog_survival: [0.18, 0.21, 0.25, 0.36],
};
```

---

## 9.7 四节 λ 生成

```text
λ_home_Qi = λ_home × tempo × homeQuarterWeight[i]
λ_away_Qi = λ_away × tempo × awayQuarterWeight[i]
```

每节进球数抽样：

```text
home_goals_Qi ~ Poisson(λ_home_Qi_adjusted)
away_goals_Qi ~ Poisson(λ_away_Qi_adjusted)
```

每节至少一球概率：

```text
P(goal in quarter) = 1 - exp(-λ_quarter_total)
```

---

## 10. 四节状态机设计

## 10.1 四节定义

```text
Q1：0' - 25'
Q2：25' - 45+'
Q3：45' - 70'
Q4：70' - 90+'
```

语义：

```text
Q1：开局策略暴露，强队抢开局，弱队防守纪律完整
Q2：第一次补水暂停后，教练小调整，半场前冲刺
Q3：中场重置后，战术方案重新生效
Q4：末段博弈，体能下降，换人，补时，战术冒险
```

## 10.2 状态更新节点

```text
Q1 结束：轻量状态更新
Q2 结束：中场强重置
Q3 结束：末段策略更新
Q4 结束：输出最终比分
```

## 10.3 状态变量

```ts
type MatchState = {
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  homeGoals: number;
  awayGoals: number;

  goalDiff: number;
  favorite: "home" | "away" | "none";
  underdog: "home" | "away" | "none";

  homeNeedWin: boolean;
  awayNeedWin: boolean;
  homeAcceptDraw: boolean;
  awayAcceptDraw: boolean;

  homeRedCards?: number;
  awayRedCards?: number;
};
```

## 10.4 状态修正规则

### 10.4.1 领先方降速

```text
如果球队领先：
λ_leader_next *= leaderSlowdown
```

默认：

```text
leaderSlowdown = 0.92
```

### 10.4.2 强队落后反扑

```text
如果 favorite 落后：
λ_favorite_next *= favoriteTrailingBoost
```

默认：

```text
favoriteTrailingBoost = 1.20
```

### 10.4.3 弱队领先死守

```text
如果 underdog 领先：
λ_underdog_next *= underdogLeadingDefense
```

默认：

```text
underdogLeadingDefense = 0.85
```

### 10.4.4 对手反击空间

```text
如果落后方必须压上：
λ_leader_counter_next *= opponentCounterBoost
```

默认：

```text
opponentCounterBoost = 1.08
```

### 10.4.5 平局末段冒险

```text
如果 Q4 开始时平局且至少一方必须赢：
λ_need_win_team_Q4 *= drawLateRiskBoost
λ_opponent_Q4 *= opponentCounterBoost
```

默认：

```text
drawLateRiskBoost = 1.15
```

### 10.4.6 双方接受平局

```text
如果 Q4 开始时平局且双方都接受平局：
λ_home_Q4 *= 0.85
λ_away_Q4 *= 0.85
draw_lock_factor += 0.10
```

---

## 11. 蒙特卡洛模拟设计

## 11.1 模拟次数

```text
快速预览：1,000 次
标准分析：10,000 次
高精度分析：50,000 次
```

MVP 默认：

```text
10,000 次
```

## 11.2 随机扰动

扰动不能过大，否则会破坏赔率校准。

```text
matchTempoNoiseSigma = 0.12
quarterNoiseSigma = 0.08
finishingNoiseSigma = 0.10
```

每场比赛开始时：

```text
match_noise ~ LogNormal(0, matchTempoNoiseSigma)
λ_home *= match_noise
λ_away *= match_noise
```

每节开始时：

```text
quarter_noise ~ LogNormal(0, quarterNoiseSigma)
λ_Qi *= quarter_noise
```

射门效率扰动：

```text
finishing_noise ~ LogNormal(0, finishingNoiseSigma)
λ_team_Qi *= finishing_noise
```

## 11.3 单场模拟伪代码

```ts
function simulateOneMatch(params: DerivedEngineParams, context: MatchContext): MatchResult {
  let state = initMatchState(context);

  for (const quarter of ["Q1", "Q2", "Q3", "Q4"]) {
    let homeLambda = params.homeQuarterLambda[quarter];
    let awayLambda = params.awayQuarterLambda[quarter];

    const adjusted = applyStateReaction({
      quarter,
      state,
      homeLambda,
      awayLambda,
      stateReactionProfile: params.stateReactionProfile,
    });

    homeLambda = adjusted.homeLambda;
    awayLambda = adjusted.awayLambda;

    homeLambda *= sampleLogNormal(0, params.randomness.quarterNoiseSigma);
    awayLambda *= sampleLogNormal(0, params.randomness.quarterNoiseSigma);

    const homeGoals = samplePoisson(homeLambda);
    const awayGoals = samplePoisson(awayLambda);

    state.homeGoals += homeGoals;
    state.awayGoals += awayGoals;

    state = updateStateAfterQuarter(state, quarter);
  }

  return {
    homeGoals: state.homeGoals,
    awayGoals: state.awayGoals,
    quarterScores: state.quarterScores,
    pathEvents: state.pathEvents,
  };
}
```

---

## 12. 错误定价识别设计

## 12.1 基本思路

```text
modelProbability = 模型模拟概率
lotteryImpliedProbability = 体彩赔率去水后隐含概率
internationalImpliedProbability = 外盘去水后隐含概率
probabilityGap = modelProbability - lotteryImpliedProbability
fairOdds = 1 / modelProbability
```

候选项筛选：

```text
probabilityGap > threshold
lotteryOdds > fairOdds
confidence >= medium
```

## 12.2 Edge Score

```text
edgeScore = probabilityGap × liquidityWeight × marketConfidence × oddsQuality
```

MVP 可简化为：

```text
edgeScore = probabilityGap / max(lotteryImpliedProbability, 0.01)
```

### 12.3 置信度分级

```text
High：外盘、比分盘、总进球、半场盘一致支持
Medium：至少两个市场支持
Low：只有模型模拟支持，赔率证据不足
```

### 12.4 候选输出示例

```json
{
  "marketType": "correct_score",
  "selection": "1-1",
  "modelProbability": 0.121,
  "lotteryImpliedProbability": 0.094,
  "internationalImpliedProbability": 0.118,
  "probabilityGap": 0.027,
  "fairOdds": 8.26,
  "lotteryOdds": 10.60,
  "edgeScore": 0.287,
  "confidence": "medium",
  "reason": "外盘比分分布与模型均显示 1-1 概率高于体彩隐含概率，且半场平局路径较强。"
}
```

---

## 13. 冷门路径识别

## 13.1 冷门定义

冷门不只等于弱队赢球，可以分为：

```text
1. 弱队胜
2. 弱队不败
3. 强队小胜但无法穿盘
4. 半场冷门
5. 弱队先进球
6. 低比分锁死
7. 强队领先后被追平
```

## 13.2 路径类型

```text
underdog_early_lead
underdog_survive_first_half
favorite_late_comeback
favorite_fail_to_break_block
late_counter_upset
draw_lock
high_chaos_upset
```

## 13.3 路径判定示例

```text
如果 underdog Q1/Q2 先进球，且最终不败：
pathType = underdog_early_lead

如果前三节 0-0，最终平局或弱队偷胜：
pathType = favorite_fail_to_break_block

如果 Q4 弱队进球导致平局或反超：
pathType = late_counter_upset
```

---

## 14. 模块架构

## 14.1 模块划分

```text
1. OddsNormalizer
   - 赔率去水
   - 隐含概率计算

2. MarketCalibrator
   - λ_home / λ_away 拟合
   - draw_factor 拟合
   - tempo 拟合

3. PhaseShapeInferencer
   - 根据赔率和上下文推断 phase_shape
   - 生成四节权重

4. QuarterEngine
   - 四节 λ 生成
   - 状态机推进
   - 单场比赛模拟

5. MonteCarloRunner
   - 批量模拟
   - 随机种子管理
   - 结果聚合

6. DistributionAnalyzer
   - 比分分布
   - 半场分布
   - 总进球分布
   - 四节进球分布

7. PathAnalyzer
   - 冷门路径识别
   - 首球路径
   - 逆转路径

8. MispricingDetector
   - 体彩 vs 模型概率 Gap
   - 外盘 vs 体彩 Gap
   - edgeScore 计算

9. ReportGenerator
   - 生成结构化 JSON
   - 生成自然语言解释
```

---

## 15. API 设计

## 15.1 模拟接口

```http
POST /api/quarter-goal-engine/simulate
Content-Type: application/json
```

Request：

```json
{
  "match": {
    "homeTeam": "Germany",
    "awayTeam": "Ecuador",
    "stage": "group",
    "groupRound": 3
  },
  "markets": {
    "lottery": {
      "odds1x2": { "homeWin": 1.45, "draw": 4.10, "awayWin": 6.20 }
    },
    "international": {
      "odds1x2": { "homeWin": 1.50, "draw": 4.00, "awayWin": 6.00 },
      "correctScore": {
        "1-0": 6.80,
        "2-0": 7.20,
        "2-1": 8.50,
        "1-1": 9.00,
        "0-0": 12.00
      },
      "overUnder": { "line": 2.5, "over": 1.92, "under": 1.88 }
    }
  },
  "context": {
    "motivation": {
      "homeNeedWin": false,
      "awayNeedWin": true,
      "homeAcceptDraw": true,
      "awayAcceptDraw": false
    }
  },
  "simulation": {
    "simulations": 10000,
    "seed": 42
  }
}
```

Response：

```json
{
  "derivedParams": {
    "lambdaHome": 1.72,
    "lambdaAway": 0.82,
    "lambdaTotal": 2.54,
    "tempo": 0.98,
    "phaseShape": "favorite_late_push",
    "homeQuarterWeights": [0.21, 0.22, 0.26, 0.31],
    "awayQuarterWeights": [0.20, 0.22, 0.24, 0.34]
  },
  "simulationSummary": {
    "fullTime": {
      "homeWinProb": 0.586,
      "drawProb": 0.243,
      "awayWinProb": 0.171
    }
  },
  "scoreDistribution": [
    { "score": "1-0", "probability": 0.118 },
    { "score": "2-0", "probability": 0.102 },
    { "score": "2-1", "probability": 0.094 }
  ],
  "pathAnalysis": {
    "upsetPaths": [
      {
        "pathType": "late_counter_upset",
        "probability": 0.064,
        "commonScores": ["1-1", "1-2"],
        "description": "客队必须赢，Q4 进攻强度提高，同时主队接受平局导致主动降速。"
      }
    ]
  }
}
```

---

## 16. 前端页面设计

## 16.1 页面结构

```text
1. 比赛信息区
2. 赔率输入区
3. 上下文输入区
4. 引擎参数展示区
5. 四节进球流图
6. 模拟比分分布
7. 冷门路径分析
8. 错误定价候选
9. 诊断与警告
```

## 16.2 关键 UI 组件

### 比赛卡片

```text
Germany vs Ecuador
世界杯 小组赛 第三轮
模拟次数：10,000
```

### 四节进球流

```text
Q1 0-25     主队 28% / 客队 14% / 任意进球 38%
Q2 25-45+   主队 30% / 客队 16% / 任意进球 42%
Q3 45-70    主队 35% / 客队 18% / 任意进球 48%
Q4 70-90+   主队 41% / 客队 25% / 任意进球 58%
```

### 比分分布

```text
1-0  11.8%
2-0  10.2%
2-1   9.4%
1-1   8.9%
0-0   6.8%
```

### 错误定价候选

```text
候选：1-1
模型概率：8.9%
体彩隐含概率：6.7%
Gap：+2.2%
置信度：Medium
原因：低比分平局路径强，半场平局概率高，外盘比分分布支持。
```

---

## 17. 数据校验与异常处理

## 17.1 必填校验

MVP 必填：

```text
homeTeam
awayTeam
stage
lottery.odds1x2
international.odds1x2
simulation.simulations
```

强烈建议但非硬必填：

```text
international.correctScore
international.overUnder / totalGoals
halfTime1x2
```

## 17.2 异常处理

### 赔率缺失

```text
如果比分赔率缺失：降级为 1x2 + 总进球模型
如果总进球缺失：使用比分赔率推导 λ_total
如果半场赔率缺失：使用默认四节权重
```

### 赔率异常

```text
如果赔率 <= 1：报错
如果去水后概率和偏离过大：提示数据质量问题
如果某市场赔率严重离散：降低该市场权重
```

### 模型拟合失败

```text
返回 fallback 参数
标记 diagnostics.fitQuality = low
禁止输出 high confidence 错误定价候选
```

---

## 18. 诊断指标

```ts
type EngineDiagnostics = {
  fitQuality: "low" | "medium" | "high";
  marketCompleteness: "low" | "medium" | "high";
  oddsConsistency: "low" | "medium" | "high";

  loss: {
    total: number;
    odds1x2: number;
    correctScore?: number;
    totalGoals?: number;
    halfTime?: number;
    halfFull?: number;
  };

  warnings: string[];
};
```

常见 warning：

```text
比分赔率缺失，比分分布可信度下降。
半场赔率缺失，四节分布使用默认模板。
体彩与外盘赔率差异过大，请确认采集时间一致。
模型拟合误差较高，不建议输出强投注结论。
```

---

## 19. MVP 范围

## 19.1 V0.1

实现：

```text
1. 赔率去水
2. 胜平负概率转换
3. Poisson λ_home / λ_away 拟合
4. 比分分布输出
5. 蒙特卡洛模拟
6. Top 比分输出
```

不实现：

```text
四节状态转移
冷门路径
半全场
错误定价 edgeScore
```

## 19.2 V0.2

增加：

```text
1. 总进球赔率校准
2. 比分赔率校准
3. draw_correlation_factor
4. 体彩 vs 外盘比分 Gap
```

## 19.3 V0.3

增加：

```text
1. 四节 phase_shape
2. 四节 λ 分配
3. Q1-Q4 进球概率
4. 半场胜平负校准
```

## 19.4 V0.4

增加：

```text
1. 状态转移
2. 强队落后反扑
3. 弱队领先死守
4. Q4 末段冒险
5. 冷门路径识别
```

## 19.5 V1.0

完整版本：

```text
1. 外盘主校准
2. 体彩待检测
3. 四节制比赛引擎
4. 路径分析
5. 错误定价候选
6. 诊断与置信度
7. 前端可视化
```

---

## 20. 后续扩展

## 20.1 球队风格标签

```text
high_pressing
possession
counter_attack
deep_block
set_piece
slow_start
late_push
chaotic
```

这些标签只影响四节权重和状态转移，不直接决定比分。

## 20.2 球员级信息

后期可加入：

```text
核心球员缺阵
主力门将缺阵
中卫组合变化
锋线状态
替补冲击力
```

但仍必须折算到：

```text
attack_rating
defense_rating
finishing_noise
state_reaction
```

## 20.3 实时滚球版本

未来可支持比赛中实时更新：

```text
当前时间
当前比分
红黄牌
射门 / xG
控球率
赔率变化
```

然后从当前 quarter 继续模拟剩余比赛。

---

## 21. 风险与限制

### 21.1 赔率重述风险

如果系统只用赔率拟合，再输出类似赔率的结果，本质可能只是复杂重述市场。

解决方式：

```text
1. 明确区分市场解释和错误定价判断
2. 使用外盘作为校准源，体彩作为比较源
3. 输出模型诊断和拟合误差
```

### 21.2 伪精细化风险

不要过早引入球员级、战术级参数，否则不可校准。

### 21.3 数据采集时间差风险

体彩赔率和外盘赔率必须尽量同一时间采集，否则 Gap 可能只是时间差导致。

### 21.4 世界杯样本不足

历史比分样本少，不能作为主依据。历史数据只作为弱先验。

### 21.5 投注风险

模型输出是概率分析，不是确定性收益工具。任何投注建议都应包含不确定性说明。

---

## 22. 推荐项目命名

可选命名：

```text
Quarter Goal Engine
四节进球流引擎
Odds-FM Engine
Market-Calibrated Match Engine
GoalFlow Simulator
```

推荐中文名：

```text
四节进球流引擎
```

推荐英文名：

```text
Quarter Goal Engine
```

---

## 23. 最终架构摘要

```text
                    ┌────────────────────┐
                    │   赔率输入层        │
                    │  体彩 / 外盘 / 比分 │
                    └─────────┬──────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │ OddsNormalizer      │
                    │ 赔率去水 / 概率归一 │
                    └─────────┬──────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │ MarketCalibrator    │
                    │ λ / tempo / draw    │
                    └─────────┬──────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │ PhaseShapeInferencer│
                    │ 四节权重 / 形态推断 │
                    └─────────┬──────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │ QuarterEngine       │
                    │ Q1-Q4 状态机模拟    │
                    └─────────┬──────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │ MonteCarloRunner    │
                    │ N 次比赛模拟        │
                    └─────────┬──────────┘
                              │
                              ▼
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│比分分布       │      │冷门路径       │      │错误定价分析   │
│Score Dist    │      │Path Analysis │      │Mispricing    │
└──────────────┘      └──────────────┘      └──────────────┘
```

---

## 24. 开发优先级建议

第一阶段只做：

```text
赔率去水
Poisson λ 拟合
比分分布
四节权重
蒙特卡洛模拟
```

第二阶段再做：

```text
状态转移
冷门路径
体彩 vs 外盘 Gap
```

第三阶段再做：

```text
球队风格
动机系统
半全场路径校准
自然语言解释
```

不要第一版就做完整 FM，否则参数会失控。

