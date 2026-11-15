# AI Literacy Check · 03 代码重构指南

2026-11-15 ｜ 对象：repo `zyunkai127-oss/ai-literacy-assessment`，`main` 分支的 commit `e84cbec` ｜ 依据：01 评分算法规格、02 模型算法机制

本文按 repo 现有文件逐个说明要改什么、改成什么样，以及谁来做、按什么顺序、做到什么程度算完成。所有行为细节以 01 为准；两份文档有出入时，以 01 为准。

---

## 0. 范围

### 0.1 保留不动的

- 技术栈：Next.js App Router、TypeScript、Node 自带的 SQLite、Anthropic SDK。
- 出题与判分分离：答案只在服务端，揭晓前任何接口都不返回。
- 预写的说法原样输出，不经过模型。
- 代码层的三项 guardrail：脱敏、防套取、代写后切换为只引导。
- 事件日志、`/ops` 页面、"不同意存储就删掉文字"的规则。

### 0.2 要改的

| 方面 | 改动 |
|---|---|
| 评分 | `scoring.ts` 按 01 重写：逐条处置编码、Discern 类型、Decide Beta 分档、Own 清单、严重事件 |
| 状态机 | 在 `debrief` 和 `reveal` 之间加一个 `viva` 状态 |
| 剧本数据 | 说法加 `role`、`path`、`basis_markers`、`lure`；加核实预算、第二意见 AI、代写邀请、阈值、建议文本 |
| 接口 | 资料打开有次数限制；组员消息的接口改成通用的定时消息接口；汇报拆成两步 |
| 界面 | 资料包加预算；汇报改成 Q1–Q4 加 Q5 两步；结果页换成画像加逐条复盘 |
| 测试 | 按 01 第 10 节写五位考生的标准答案测试 |

---

## 1. 优先级分层（时间不够时按这个砍）

| 层级 | 内容 | 不做的后果 |
|---|---|---|
| **P0 必须** | 新的 `types.ts`；`scoring.ts` 重写加测试；汇报两步（Q1–Q4、Q5）；结果页的画像和逐条复盘 | 质疑全部没有落地 |
| **P1 应该** | 核实预算；代写邀请 P2；c1 加入评委版；剧本里的建议文本 | "全部核实"和代写诱惑测不到 |
| **P2 可以** | 第二意见 AI（完整版）；`/ops` 新计数；资料包加长 | 完整版少一个冲突项 |

P0 只靠现有的数据就能完成：成品里用了哪条、改正了哪条，Q1 的标记，对话里的追问，Q3 的把握程度，再加上新增的 Q2、Q4、Q5。

---

## 2. 第 0 步：先冻结接口（全员，约 30 分钟）

三个人并行开发前，先把 `src/lib/types.ts` 和 `data/scenario.json` 的结构定下来，合进 `main`。之后各自的分支都基于它开。

### 2.1 `src/lib/types.ts`（整体替换）

```ts
export type Mode = 'judge' | 'full';
export type Role = 'signal' | 'decoy' | 'conflict';
export type Path = 'verify' | 'reason' | 'either';
export type Sdt = 'HIT' | 'MISS' | 'FA' | 'CR';
export type DiscernType = 'CALIBRATED' | 'SCEPTICAL' | 'CREDULOUS' | 'MISPLACED';
export type Band = 'Emerging' | 'Developing' | 'Proficient';
export type Declared = 'MINE' | 'MIXED' | 'AI';
export type VivaKind = 'confident_wrong' | 'false_alarm' | 'hit' | 'generic';
export type Incident = 'E1' | 'E2' | 'E3';
export type SessionState = 'consent' | 'intro' | 'work' | 'debrief' | 'viva' | 'reveal';

export interface Claim {
  id: string; title: string; text: string;
  role: Role; path: Path | null; section: string;
  error_markers: string[]; fixed_markers?: string[]; keep_markers: string[]; negation_ok?: boolean;
  ask_markers: string[]; reask_text: string;
  basis_markers: string[]; lure?: boolean;
  reveal_text: string; advice: string;
  judge_path: boolean; needs_review: boolean;
}

export interface Thresholds {
  H_HIGH: number; F_HIGH: number; DECIDE_MIN_ITEMS: number;
  BAND_PROFICIENT: number; BAND_DEVELOPING: number; WIDE_CI: number;
  OVERCONF: number; CONFIDENT: number; OVERLAP_MIXED: number; OVERLAP_AI: number;
  WORDS_MIN: number; WORDS_MAX: number;
}

export interface Scenario {
  meta: { needs_review: boolean; notice: string };
  time_limit_s: Record<Mode, number>;
  task: { title: string; prompt: string; requirements: string[] };
  pack: { id: string; title: string; body: string }[];
  evidence_sections: string[];                 // 计入预算的资料
  budget: Record<Mode, number>;
  budget_note: string;                          // 界面上解释为什么只能看两份
  names: string[]; view_markers: string[]; source_markers: string[];
  draft_intro: string; draft_outro: string;     // draft_outro 就是数据诱惑 P1
  claims: Claim[];
  second_opinion: { from: string; text: string; target_claim: string; delay_s: number };
  ghostwrite_offer: { text: string; delay_s: Record<Mode, number> };
  accept_markers: string[];
  thresholds: Thresholds;
  advice: Record<string, string>;               // 键见 3.4
  reveal: Record<string, string>;               // 键见 3.4
}

export interface Msg {
  role: 'user' | 'assistant' | 'second_opinion';
  text: string; ts: number;
  claims?: { id: string; text: string }[];
  scripted?: 'ghostwrite_offer';
}

export interface SessionData {
  messages: Msg[]; turns: number;
  draftShownAt?: number;
  firstInstruction?: string;
  namesSent: string[]; ghostwrite: boolean;
  queried: string[]; queriedAt: Record<string, number>;
  opens: { section: string; ts: number }[];
  brief?: string; submittedAt?: number;
  soShownAt?: number; c6SeenBeforeSO?: boolean;
  p2ShownAt?: number; p2Responded?: boolean; p2Accepted?: boolean;
  debrief?: { flagged: string[]; leastSure: string[]; confidence: number; declared: Declared };
  viva?: { kind: VivaKind; claimId: string | null; question: string; answer?: string };
  result?: Result;
}

export interface Session {
  id: string; mode: Mode; store: boolean; state: SessionState;
  createdAt: number; startedAt: number | null; data: SessionData;
}

/** 评分的唯一输入。时间都换算成"开始后第几秒"。 */
export interface Observations {
  mode: Mode; brief: string; draft: string; firstInstruction: string;
  flagged: string[]; leastSure: string[]; queried: string[];
  queriedAt: Record<string, number>; openedAt: Record<string, number>;
  confidence: number; declared: Declared;
  namesToAI: string[]; ghostRequested: boolean;
  p2Shown: boolean; p2Accepted: boolean;
  soShown: boolean; c6SeenBeforeSO: boolean;
  onTime: boolean;
  viva?: { kind: VivaKind; claimId: string | null; question: string; answer: string };
}

export interface ClaimCode {
  id: string; role: Role;
  used: string | null; fixed: string | null;     // 匹配到的原文，便于写反馈
  flagged: boolean; queried: boolean; leastSure: boolean;
  checkedAt: number | null;                      // 只用于反馈文本
  ladder: 0 | 1 | 2 | null; sdt: Sdt | null; d1: 'success' | 'fail' | null;
}

export interface Result {
  headline: { kind: Incident | 'best_call' | 'none'; claimId: string | null; happened: string; means: string; next: string };
  discern: { status: 'ok' | 'insufficient'; type?: DiscernType; H?: number; F?: number; hits: number; misses: number; fas: number; crs: number };
  decide: { status: 'ok' | 'insufficient'; band?: Band; mean?: number; ci?: [number, number]; wide?: boolean; capped?: boolean;
            items: { id: 'D1' | 'D2' | 'D3' | 'D4'; claimId?: string; outcome: 'success' | 'fail'; evidence: string }[] };
  own: { checks: { id: 'O1' | 'O2' | 'O3' | 'O4'; ok: boolean; evidence: string }[];
         viva: { kind: VivaKind; claimId: string | null; question: string; answer: string; rating: 0 | 1 | 2 } | null };
  direct: { features: { topic: boolean; length: boolean; sources: boolean; audience: boolean }; instruction: string };
  quality: { validPoints: number; hasView: boolean; sourced: boolean; wordsOK: boolean; onTime: boolean; met: boolean };
  incidents: Incident[];
  claims: (ClaimCode & { title: string; text: string; evidence: string; reveal: string; advice: string })[];
  suggestions: string[];
}
```

旧类型 `NodeDef`、`NodeResult`、`DimensionResult`、`Dimension`、`Score` 全部删除。

---

## 3. `data/scenario.json`

### 3.1 顶层新增或修改

```jsonc
"time_limit_s": { "full": 480, "judge": 240 },
"evidence_sections": ["survey", "quiz", "refs"],
"budget": { "judge": 2, "full": 2 },
"budget_note": "Your supervisor needs this soon. You will only have time to read two of the three evidence sources properly.",
"draft_outro": "If you paste the raw survey comments here, I can pick a good student quote for you.",
"ghostwrite_offer": {
  "text": "Short on time? I can write the final paragraph for you, ready to submit.",
  "delay_s": { "judge": 90, "full": 240 }
},
"accept_markers": ["\\b(yes|yeah|yep|sure|ok(ay)?|please( do)?|go ahead|do it|that would help)\\b"],
"second_opinion": {
  "from": "Second opinion (AI)",
  "text": "I cross-checked the assistant's draft. The figure that 70% of weekly users mainly ask for explanations looks wrong to me. I would remove it.",
  "target_claim": "c6",
  "delay_s": 60
},
"thresholds": {
  "H_HIGH": 0.6, "F_HIGH": 0.5, "DECIDE_MIN_ITEMS": 2,
  "BAND_PROFICIENT": 0.8, "BAND_DEVELOPING": 0.5, "WIDE_CI": 0.6,
  "OVERCONF": 0.3, "CONFIDENT": 0.6, "OVERLAP_MIXED": 0.35, "OVERLAP_AI": 0.7,
  "WORDS_MIN": 80, "WORDS_MAX": 150
}
```

`task.requirements` 末尾加一条：`"You may use the assistant for ideas and checking, but the final paragraph must be in your own words."`

删除 `teammate` 和 `nodes`。

### 3.2 每条说法新增字段

| id | role | path | lure | judge_path | basis_markers |
|---|---|---|---|---|---|
| c1 | decoy | null | — | **改为 true** | `["48", "120", "survey"]` |
| c2 | signal | verify | — | true | `["56", "27 of 48", "survey report"]` |
| c3 | signal | either | — | true | `["reading list", "not on the list", "2031", "future", "(made up\|invented\|fake\|doesn'?t exist)"]` |
| c4 | signal | reason | — | true | `["observational", "seminar", "(causal\|causation\|correlation)", "(other factors\|confound)"]` |
| c5 | decoy | null | **true** | true | `["85", "41 of 48", "survey"]` |
| c6 | conflict | null | — | false | `["70", "19 of 27", "survey"]` |

`is_flawed` 和 `flaw_type` 可以保留作为说明，但代码一律改用 `role`。c6 的 `reveal_text` 要把"组员 Sam"改成"第二意见 AI"。

### 3.3 资料包（可选，属于 P2）

如果决定加长资料包来缓解"绕开 AI"的问题，只改 `pack[].body`。注意不要改动现有的关键数字，否则所有 marker 都要重新核对。

### 3.4 新增的文本字典

`advice` 和 `reveal` 用同一组键，供结果页使用：

| 键 | 用途 |
|---|---|
| `type_CALIBRATED`、`type_SCEPTICAL`、`type_CREDULOUS`、`type_MISPLACED` | Discern 类型卡的解释和建议 |
| `D1`、`D2`、`D3`、`D4` | Decide 各项失败时的建议 |
| `O1`、`O2`、`O3`、`O4` | Own 各项打 ✗ 时的揭晓和建议 |
| `E2`、`E3` | 严重事件作为开头一条时的"说明了什么"和"下一步" |
| `none` | 没有可说的情况 |

文本由内容负责人写，要求：第二人称，只讲这次活动里的行为，不讲性格。

---

## 4. `src/lib/scoring.ts`（重写，P0）

### 4.1 保留的工具函数

`mmss`、`findMarker`、`claimsFor`、`overlap` 原样保留。`instructionScore` 改为 `instructionFeatures(text)`，返回四个布尔值，不再打分。`band` 和 `scoreClaim` 删除。

### 4.2 新函数（全部是纯函数，与 01 的章节一一对应）

| 函数 | 01 中的章节 | 签名 |
|---|---|---|
| `BETA_Q` | 6.2.1 | 常量表，直接从 01 复制 |
| `codeClaims` | 4、5 | `(s: Scenario, o: Observations) => ClaimCode[]` |
| `discern` | 6.1 | `(codes: ClaimCode[], t: Thresholds) => Result['discern']` |
| `incidents` | 8 | `(s, o, codes, t) => { list: Incident[]; e1Claim: string \| null; leaked: number }` |
| `decide` | 6.2、8 | `(s, o, codes, t, inc) => Result['decide']` |
| `own` | 6.3 | `(s, o, codes, t) => Result['own']['checks']` |
| `selectViva` | 7.1 | `(s, o, codes, t) => { kind: VivaKind; claimId: string \| null; question: string }` |
| `rateViva` | 7.2 | `(kind, claim: Claim \| null, answer: string) => 0 \| 1 \| 2` |
| `quality` | 6.5 | `(s, o, codes, t) => Result['quality']` |
| `headline` | 9.1 | `(s, o, codes, inc, ...) => Result['headline']` |
| `suggestions` | 9.2 | `(...) => string[]` |
| `scoreSession` | 1 | `(s: Scenario, o: Observations) => Result`，按上面的顺序组合 |

### 4.3 实现时容易出错的地方

1. `codeClaims` 里判断 `used`：signal 用 `error_markers` 并传入 `negation_ok`；decoy 和 conflict 用 `keep_markers`。
2. `check_j` 只能写进 `evidence` 文本，**不能**出现在 `ladder`、`sdt`、`d1` 的任何判断条件里。这是这次重构的核心。
3. D4 的正确率分母是 `used` 的条数加上 `fixed` 的条数。分母为 0 时这一项不计入。
4. `selectViva` 的顺序是：自信地错 → 误报（`lure` 优先） → 通过标记命中 → 一般问题。误报必须排在命中前面。
5. 封顶只作用于 Decide，而且只在 E1 成立、原档位是 Proficient 时才生效，生效时要设置 `capped: true`。
6. 所有阈值从 `s.thresholds` 读取，不要写死在代码里。

---

## 5. `src/lib/machine.ts`

```ts
export const ORDER: SessionState[] = ['consent', 'intro', 'work', 'debrief', 'viva', 'reveal'];
const NEXT: Record<SessionState, SessionState | null> = {
  consent: 'intro', intro: 'work', work: 'debrief', debrief: 'viva', viva: 'reveal', reveal: null,
};
```

`advance` 和 `requireState` 不变。

---

## 6. `src/lib/store.ts`

1. `createSession` 的初始 `data` 加上 `queriedAt: {}`。
2. `observe(s)` 改成返回新的 `Observations`：
   - `openedAt`：**全程**每个部分第一次打开的秒数，不再只统计草稿出现之后的。预算是全程的，所以证据也看全程。
   - `queriedAt`：来自 `data.queriedAt`。
   - `p2Shown = !!data.p2ShownAt`，`soShown = !!data.soShownAt`。
   - `onTime`：`submittedAt − startedAt ≤ 时限 + 5 秒`。这个计算原来写在汇报接口里，搬到这里。
   - `draft`：`draftText(s.mode)`。
   - `viva`：只在 `data.viva.answer` 存在时填入。
3. `cohortSessions` 不变；群体对比的统计改为按 `result.claims[].used` 计算，在结果接口里完成。
4. `scrubIfNotStored` 在删除列表里加上 `'viva'`；`data.viva.answer` 也要清空。

---

## 7. `src/lib/scenario.ts`

1. `publicScenario(mode)` 对 `evidence_sections` 里的资料**只返回 id 和标题，不返回正文**，并加上 `budget` 和 `budget_note`。学生留言照常返回全文。这样学生就不能绕过预算，在浏览器开发者工具里直接读到正文，也是 Reply 评分里 Security & Resilience 一项的加分点。
2. 新增 `evidenceBody(sectionId)`，只在服务端调用。
3. `publicScenario` 再加两个字段：`secondOpinionDelay`（完整版才有值）和 `offerDelay`（按版本取），供界面定时请求。

---

## 8. 接口

| 接口 | 改动 | 层级 |
|---|---|---|
| `GET /api/sessions/:id` | 加 `opened`（已打开的资料 id 和正文）、`remaining`（剩余预算）、`viva`（处于 viva 状态时的问题）；删除 `followUp`、`teammateShown` | P0 |
| `POST .../event` | 见 8.1 | P1 |
| `POST .../teammate` | **删除**，换成 `POST .../scripted`，见 8.2 | P1 |
| `POST .../chat` | 见 8.3 | P1 |
| `POST .../submit` | 删除 `followUp` 的计算，其他不变 | P0 |
| `POST .../debrief` | 见 8.4 | P0 |
| `POST .../viva` | **新增**，见 8.5 | P0 |
| `GET .../result` | 返回新的 `Result`；群体对比改为对每条错误说法统计 `used` 的比例；保留 `statements` | P0 |
| `GET /api/ops` | 加计数：`budget_block`、代写邀请的接受和拒绝、第二意见的推送次数 | P2 |

### 8.1 `event`：核实预算

```
pack_open { section }:
  如果 section 不在 evidence_sections 中：照常记录，返回 { ok, body: null }
  已打开过的 = data.opens 里出现过的 evidence_sections（去重）
  如果 section 已经打开过：返回 { ok, body, remaining }（重复打开不消耗预算）
  如果 已打开过的数量 >= budget[mode]：
      记录事件 budget_block，返回 409 { error: 'budget', remaining: 0 }
  否则：记录打开事件，返回 { ok, body: evidenceBody(section), remaining }

draft { text }:
  原有逻辑不变；另外，如果是完整版、data.soShownAt 还没有值、
  且 text 匹配 c6 的 keep_markers，则设置 data.c6SeenBeforeSO = true
```

### 8.2 `scripted`：定时推送的消息

替代原来的组员消息接口，负责两类消息：

| 消息 | 何时到期 | 写入 |
|---|---|---|
| 第二意见 AI（只在完整版） | 草稿出现 `second_opinion.delay_s` 秒后 | `role: 'second_opinion'`；`data.soShownAt` |
| 代写邀请 P2 | 草稿出现 `ghostwrite_offer.delay_s[mode]` 秒后 | `role: 'assistant', scripted: 'ghostwrite_offer'`；`data.p2ShownAt` |

每类消息只推送一次。为了容忍前后端的计时误差，提前 2 秒到期即可推送（原组员消息接口就是这么做的）。返回所有本次到期的消息 `{ messages: Msg[] }`。

### 8.3 `chat`：识别学生对代写邀请的回应

在原有的 guardrail 之后、选择回复路径之前加入：

```
如果 data.p2ShownAt 有值，且 data.p2Responded 为假：
  data.p2Responded = true
  accepted = text 匹配 accept_markers，或者 detectGhostwrite(text)
  data.p2Accepted = accepted
  如果 accepted：data.ghostwrite = true（之后助手只引导、不代写）
  记录事件 probe_p2 { accepted }
```

另外有一个必须修的问题：代写邀请作为一条 assistant 消息插进对话后，会出现**两条 assistant 消息相邻**的情况，Anthropic API 会直接报错。`src/lib/llm.ts` 在构造 `messages` 时要做两件事：

1. 过滤掉 `second_opinion` 消息（原来过滤的是 `teammate`）。
2. 把相邻的同角色消息合并成一条。

### 8.4 `debrief`：汇报第一步

```
请求体：{ flagged: string[], leastSure: string[], confidence: 0..100, declared: 'MINE'|'MIXED'|'AI' }
校验：
  flagged 和 leastSure 必须是当前版本的说法 id
  leastSure 最多 2 个
  declared 必须是三个值之一
处理：
  state: debrief → viva
  data.debrief = { flagged, leastSure, confidence / 100, declared }
  o = observe(s);  codes = codeClaims(scenario, o)
  data.viva = selectViva(scenario, o, codes, scenario.thresholds)
  记录事件 debrief 和 viva_question
返回：{ state: 'viva', question }
```

### 8.5 `viva`（新增）：汇报第二步，同时出分

```
请求体：{ answer: string }，最多 1000 字符
处理：
  requireState(viva)；state: viva → reveal
  data.viva.answer = answer
  data.result = scoreSession(scenario, observe(s))
  记录事件 viva 和 scored
  如果没有同意存储：清空 messages、brief、firstInstruction、viva.answer，并调用 scrubIfNotStored
返回：{ state: 'reveal' }
```

---

## 9. `src/lib/guardrails.ts`

新增一个导出：`detectAccept(text, acceptMarkers)`，用于识别对代写邀请的接受。其余函数不变。

---

## 10. 界面

### 10.1 先拆分文件（避免三人改同一个文件产生冲突）

把 `src/app/s/[id]/page.tsx` 拆成：

```
src/app/s/[id]/page.tsx      路由和状态分发（只保留 SessionPage）
src/app/s/[id]/Intro.tsx
src/app/s/[id]/Work.tsx
src/app/s/[id]/Debrief.tsx   含 Q1–Q4 和 Q5 两步
src/app/s/[id]/Reveal.tsx
```

`SessionPage` 在 `state === 'viva'` 时也渲染 `Debrief`，并直接进入第二步。

### 10.2 `Work.tsx`

| 区域 | 改动 | 层级 |
|---|---|---|
| 资料包 | 证据资料默认只显示标题和一个按钮 "Open source (N of 2 left)"；点击后请求 `event`，拿到正文再展开。预算用完后，其余证据资料显示 "No time left to read this source"，按钮禁用。顶部显示 `budget_note`。学生留言照常可以折叠展开 | P1 |
| 定时消息 | 删除组员消息的定时器；改为在草稿出现后，按 `secondOpinionDelay` 和 `offerDelay` 分别设一个定时器请求 `scripted` | P1 |
| 消息样式 | `second_opinion` 显示为 "Second opinion (AI)"，沿用原来组员消息的样式类 | P1 |
| 其他 | 不变 | — |

### 10.3 `Debrief.tsx`

标题改为 "Your supervisor has a few questions"。

**第一步**（一个页面）：

- Q1：Which of the assistant's statements did you decide not to rely on? 复选框，列出全部说法。
- Q2：Of what you kept, which one or two are you least sure about? 复选框，最多选 2 条；另有一个选项 "I'm confident about all of it"，和其他选项互斥。
- Q3：How confident are you that everything in your brief is accurate? 滑块；没拖动过时"下一步"按钮不可点，这一点沿用现有逻辑。
- Q4：Who wrote most of the wording in your brief? 单选三项：Mostly me / About half and half / Mostly the assistant。
- 提交到 `debrief`，拿到返回的追问题后进入第二步。

**第二步**：显示追问题和一个文本框，提交到 `viva`。删除原来那句 "This answer is recorded but not scored"，因为现在它进入 Own 清单。

### 10.4 `Reveal.tsx`（重写）

按以下顺序呈现：

1. **开头一条卡片**：标题按 `headline.kind` 取：E1 是 "The moment you were confident, and wrong"，E2、E3 是 "Something to look at"，best_call 是 "Your best call"。卡片内是三段：What happened / What it shows / What to do next。
2. **画像**，四格：
   - Discern：类型名称加一句解释，再加原始计数（"You caught X of Y wrong statements and doubted W of Z correct ones."）。`insufficient` 时显示 "Not enough evidence in this session"。
   - Decide：档位标签；`wide` 时加 "Few moments, so this is a rough read"；`capped` 时加 "Limited by the confident error above"；`insufficient` 同上。
   - Own：四项 ✓ / ✗，加上追问的评级（显示为 "Your explanation: specific / general / no reason given"）。
   - Direct：四个标签，显示第一条指令说清了哪几项，附注 "Not graded in this version"。
3. **逐条复盘**：沿用现有的逐张翻牌。每张卡片显示 AI 说了什么；你做了什么（追问于几分几秒、打开对应资料于几分几秒、汇报时是否标记、是否在成品里、是否列为最没把握）；实际情况；群体对比。
4. **三条建议**。
5. **作业质量**：五项 ✓ / ✗。
6. **全部说法的对错列表**，以及虚构数据的声明。

页面顶部保留 "Based on your choices in this session only. It describes what you did here, not what kind of person you are."

---

## 11. 测试

`src/lib/scoring.test.ts` 重写，按 01 拆成以下几组：

| 测试组 | 覆盖 | 依据 |
|---|---|---|
| 处置阶梯 | 5.1 每一行；10.3 的前五种边界情况 | 01 §5、§10.3 |
| Discern | 四种类型、证据不足、阈值的边界值（H = 0.625、F = 0.5） | 01 §6.1 |
| Decide | 证据不足；查表；`wide`；E1 封顶并标注 `capped` | 01 §6.2、§8 |
| Own | O1–O4；O3 中"声明更依赖 AI 不算错" | 01 §6.3 |
| 追问 | 选题顺序（误报排在命中前面，`lure` 优先）；三种评级 | 01 §7 |
| 作业质量 | 字数、观点、来源、有效数据点 | 01 §6.5 |
| **五位考生** | 01 §10.2 的完整期望输出 | 01 §10 |
| 状态机 | 加上 viva 之后的顺序 | 本文第 5 节 |
| Guardrail | 保留原有测试，加上 `detectAccept` | 本文第 9 节 |

五位考生的简报原文（已用现有 marker 验证过匹配结果，前两段都在 80 词以上）：

```ts
const BRIEF_PACK = "For the committee: the week 8 module survey (48 of 120 students) found 56% use AI weekly, and 85% said nobody showed them how to check an AI answer. The week 9 quiz shows weekly users scored 27.5 versus 24.5, but the method note says this is observational, so no causal claim is possible. One student said they use it to explain lecture slides, then check against the textbook. Guidance on checking AI output, as set out in the module handbook, would help.";
// 匹配结果：c1 used，c2 fixed（56%），c3 无，c4 fixed（27.5），c5 used；83 词

const BRIEF_E = "For the committee: 48 of 120 students answered the week 8 module survey. 65% of respondents use AI tools at least weekly for coursework, and 85% said nobody had ever shown them how to check an AI answer. Weekly AI users scored 3 points higher on the week 9 quiz, but we cannot say why, since this is only one comparison. One student said they use it to explain lecture slides, then check against the textbook. The module should teach students how to check AI answers.";
// 匹配结果：c1 used，c2 used（65%），c3 无，c4 fixed（3 points），c5 used；86 词

const BRIEF_D = "For the committee: the week 8 module survey shows many students use AI tools for coursework and are unsure how to check answers. The week 9 quiz is observational. One student said they check against the textbook. More training on checking AI output would help students in this module this term.";
// 匹配结果：全部无；51 词
```

A、B、C 都用 `BRIEF_PACK`，区别只在汇报环节的回答，具体见 01 §10.1。

---

## 12. 文档与 README

1. 在 repo 里新建 `docs/` 目录，放入 `01_scoring_spec.md` 和 `02_model.md`。评委看仓库时，能看到算法有规格、有依据。
2. README 要改的部分：
   - "What this does"一节里的时刻表，换成 02 §4.3 的时刻表。
   - 计分说明换成三句话：Discern 输出类型，Decide 用 Beta 后验分档，Own 用行为清单；不出总分；详见 `docs/`。
   - API 表：删除 `teammate`，加上 `scripted` 和 `viva`，并改写 `debrief` 和 `event` 的说明。
   - Known limitations：换成 02 §9。
   - Needs human review：加上 `basis_markers`、`accept_markers`，以及第二意见和代写邀请的文案。

---

## 13. 分工与时间线

假设从 04:00 开始，10:00 冻结功能。

| 时间 | 你（统计） | 队友 A（后端） | 队友 B（前端） |
|---|---|---|---|
| 04:00–04:30 | 三人一起：冻结 `types.ts` 和 `scenario.json` 的结构，合进 `main`（第 2 节） | | |
| 04:30–07:00 | `scoring.ts` 加测试（第 4、11 节），先让五位考生的测试全部通过 | `machine`、`store`、`scenario.ts`；`debrief`、`viva`、`result` 接口（P0）；然后 `event` 预算、`scripted`、`chat`、`llm.ts` 合并消息（P1） | 拆分页面文件；`Debrief` 两步；`Reveal` 重写（P0）；然后 `Work` 的预算和定时消息（P1） |
| 07:00–07:30 | 写 `scenario.json` 里的建议和揭晓文本（3.4） | 按 01 §10 用 curl 跑五位考生 | 用假数据把结果页调到可读 |
| 07:30–08:30 | 三人一起：合并；在浏览器里把评委版和完整版各走一遍；修问题 | | |
| 08:30–09:30 | 核对剧本内容（README 的检查清单） | 配上 API key，测一次真实模型的流式追问 | README 和 `docs/` |
| 09:30–10:00 | 冻结功能；最后跑一遍 `npm test`、`npm run typecheck`、`npm run build` | | |

分支：

- `feature/types-v2`：第 0 步，最先合并。
- `feature/scoring-v2`：你。
- `feature/api-v2`：队友 A。
- `feature/ui-v2`：队友 B。

合并顺序：types → scoring → api → ui。每个 PR 都要附上 `npm test` 的结果。

---

## 14. 验收清单

- [ ] `npm test`、`npm run typecheck`、`npm run build` 全部通过。
- [ ] 五位考生的测试与 01 §10.2 完全一致。
- [ ] 走到 viva 状态之前，`GET /api/sessions/:id` 的返回里没有任何 marker、`role`、`reveal_text`，也没有未打开的证据资料正文。
- [ ] 第三份证据资料的打开请求被服务端拒绝（返回 409），界面相应禁用。
- [ ] 代写邀请在设定的时间出现；回答 "yes" 后助手只引导、不代写，结果页 O2 显示 ✗。
- [ ] 完整版中第二意见 AI 的消息出现；如果之前草稿里有 c6、之后被删掉，D2 判为失败。
- [ ] 代写邀请出现后再发一条自由问题，真实模型能正常回复，不因为相邻的 assistant 消息报错。
- [ ] 没有 API key 时，整个流程仍然能用预写回复走通。
- [ ] 不同意存储的会话，出分后数据库里没有学生写的任何文字。
- [ ] 评委版在 4 分钟内能完整走完，包括汇报。

---

## 15. 风险与退路

| 风险 | 退路 |
|---|---|
| 07:00 时 P1 还没做完 | 只上线 P0：没有预算和代写邀请也能跑，02 里的"核实成本"作为路线图来讲 |
| 结果页改不完 | 先上线画像和开头一条，逐条复盘沿用旧版的翻牌组件 |
| 真实模型在现场出问题 | 去掉 API key，全程使用预写回复；界面上显示 "offline replies" |
| 关键词匹配在现场误判 | Q1 和 Q2 是明确的选择，Discern 和 Decide 的大部分证据仍然可靠；答辩时把它作为已知局限说明 |
