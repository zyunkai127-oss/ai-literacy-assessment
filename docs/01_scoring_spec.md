# AI Literacy Check · 01 评分算法规格

2026-11-15 ｜ 配套文档：02 模型算法机制（为什么这样设计）、03 代码重构指南（怎么改 repo）

本文只描述评分算法：输入是什么、怎么一步步算、输出是什么。所有规则都是确定性的，同样的输入一定得到同样的输出。第 10 节的五位考生可以直接作为单元测试的标准答案。

---

## 1. 总流程

```
会话记录 ──► ① 观测量提取 ──► ② 逐条处置编码 ──► ③ 四个维度分别计分
                                                    ├─ Discern：判断类型
                                                    ├─ Decide：Beta 后验分档
                                                    ├─ Own：行为清单
                                                    └─ Direct：只展示
           ──► ④ 严重事件 ──► ⑤ 封顶 ──► ⑥ 开头一条、建议、作业质量 ──► 输出
```

追问题（Q5）的选题发生在 ① 和 ② 之后、学生回答 Q5 之前，见第 7 节。

---

## 2. 参数（全部写进 `scenario.json`，可调，均标注"待校准"）

| 参数 | 默认值 | 用途 |
|---|---|---|
| `H_HIGH` | 0.6 | 命中率达到它算"命中高" |
| `F_HIGH` | 0.5 | 误报率达到它算"误报高" |
| `DECIDE_MIN_ITEMS` | 2 | Decide 计入项少于它显示"证据不足" |
| `BAND_PROFICIENT` | 0.8 | Decide 后验均值的上分档线 |
| `BAND_DEVELOPING` | 0.5 | Decide 后验均值的下分档线 |
| `WIDE_CI` | 0.6 | 90% 区间宽度超过它，提示"区间较宽" |
| `OVERCONF` | 0.3 | 把握程度减实际正确率达到它，算过度自信 |
| `CONFIDENT` | 0.6 | 严重事件 E1 的把握程度门槛 |
| `OVERLAP_MIXED` | 0.35 | 与 AI 草稿重合度的中档下限 |
| `OVERLAP_AI` | 0.7 | 与 AI 草稿重合度的高档下限 |
| `BUDGET` | 评委版 2，完整版 2 | 三份证据资料最多能打开几份 |
| `WORDS` | 80–150 | 作业质量的字数要求 |

---

## 3. 说法的标注（剧本数据）

每条说法 j 在剧本里带以下字段：

| 字段 | 取值 | 说明 |
|---|---|---|
| `role` | `signal` / `decoy` / `conflict` | signal 是 AI 错了；decoy 是 AI 对了但看起来可疑；conflict 是 AI 对了但第二意见 AI 说它错 |
| `path` | `verify` / `reason` / `either` / null | 错误说法的识破路径：需要查证、靠推理、两者皆可 |
| `section` | 资料包的部分 id | 能查证这条说法的那份资料 |
| `error_markers` | 正则表达式列表 | signal 专用：成品里出现即算用了错误写法 |
| `fixed_markers` | 正则表达式列表 | signal 专用：成品里出现即算改正 |
| `keep_markers` | 正则表达式列表 | decoy、conflict 专用：成品里出现即算用了 |
| `negation_ok` | 布尔 | 为 true 时，否定或保留语气句子里的匹配不算数（c4 用） |
| `ask_markers` | 字符串列表 | 对话中识别"追问这条"的关键词 |
| `basis_markers` | 正则表达式列表 | 追问题（Q5）中算"给出了具体依据"的关键词 |
| `lure` | 布尔 | 标记"看起来最可疑"的诱饵，追问题优先问它（c5） |

当前剧本的取值：

| id | role | path | section | 评委版 | 完整版 |
|---|---|---|---|---|---|
| c1 | decoy | — | survey | ✓ | ✓ |
| c2 | signal | verify | survey | ✓ | ✓ |
| c3 | signal | either | refs | ✓ | ✓ |
| c4 | signal | reason | quiz | ✓ | ✓ |
| c5 | decoy（lure） | — | survey | ✓ | ✓ |
| c6 | conflict | — | survey | — | ✓ |

`basis_markers` 的建议初值：

| id | basis_markers |
|---|---|
| c1 | `48`、`120`、`survey` |
| c2 | `56`、`27 of 48`、`survey report` |
| c3 | `reading list`、`not on the list`、`2031`、`future`、`(made up\|invented\|fake\|doesn'?t exist)` |
| c4 | `observational`、`seminar`、`(causal\|causation\|correlation)`、`(other factors\|confound)` |
| c5 | `85`、`41 of 48`、`survey` |
| c6 | `70`、`19 of 27`、`survey` |

---

## 4. 观测量提取

记 B 为提交的简报文本，M 为当前版本（评委版或完整版）的说法集合。

### 4.1 每条说法 j ∈ M

| 观测量 | 定义 |
|---|---|
| `used_j` | signal：B 匹配 `error_markers`（若 `negation_ok`，否定句里的匹配不算）；decoy / conflict：B 匹配 `keep_markers` |
| `fixed_j` | 只对 signal：`used_j` 为假，且 B 匹配 `fixed_markers` |
| `flag_j` | Q1 中勾选了 j |
| `query_j` | 对话中有一条学生消息命中 j 的 `ask_markers`，且触发了 AI 的坚持回复 |
| `check_j` | j 的 `section` 被打开过。**只用于反馈文本，不进入任何计分** |
| `least_j` | Q2 中选了 j |

### 4.2 全局观测量

| 观测量 | 定义 |
|---|---|
| `conf` | Q3 的把握程度，0–1 |
| `declared` | Q4 的回答：`MINE` / `MIXED` / `AI` |
| `vivaAnswer` | Q5 的回答文本 |
| `namesToAI` | 被脱敏拦下的同学姓名集合（来自对话） |
| `namesInBrief` | B 中出现的同学姓名集合 |
| `ghostRequested` | 第 2 条及以后的学生消息中，有要求代写的 |
| `p2Accepted` | 代写邀请出现后，学生的下一条消息表示接受（匹配接受词，或者本身就是代写请求） |
| `soShown` | 第二意见 AI 的消息是否已出现（只在完整版） |
| `c6SeenBeforeSO` | 第二意见出现之前，某次草稿快照里已经有 c6 |
| `overlap` | B 与 AI 草稿的 4 词片段重合率（沿用现有算法） |
| `instruction` | 第一条学生消息 |
| `onTime` | 提交时间不超过时限加 5 秒 |
| `words` | B 的词数 |

---

## 5. 逐条处置编码

### 5.1 错误说法（role = signal）

先定义"有质疑记录"：S_j = `query_j` 或 `flag_j` 或 `fixed_j`。

| 条件（按顺序判断，取第一个成立的） | ladder | sdt | D1 |
|---|---|---|---|
| `used_j` 且非 S_j | 0 照单全收 | MISS | 不计入 |
| `used_j` 且 S_j | 1 有所怀疑但没处理 | HIT | 失败 |
| `fixed_j`，或者（非 `used_j` 且（`flag_j` 或 `query_j`）） | 2 有针对性地行动 | HIT | 成功 |
| 其他（没用，也没有质疑记录） | 未处置 | 无 | 不计入 |

注意：`check_j`（只是打开过资料）不出现在任何条件里。

### 5.2 正确说法（role = decoy 或 conflict）

| 条件（按顺序判断） | sdt |
|---|---|
| `flag_j` | FA（误报） |
| `used_j` | CR（正确接受） |
| 其他 | 无 |

追问一条正确的说法不算误报。

### 5.3 伪代码

```
function codeClaim(j, obs):
  if j.role == 'signal':
    S = query_j or flag_j or fixed_j
    if used_j and not S:      return {ladder: 0, sdt: 'MISS', d1: null}
    if used_j and S:          return {ladder: 1, sdt: 'HIT',  d1: 'FAIL'}
    if fixed_j or flag_j or query_j:
                              return {ladder: 2, sdt: 'HIT',  d1: 'SUCCESS'}
    return {ladder: null, sdt: null, d1: null}          # 未处置
  else:
    if flag_j:  return {sdt: 'FA'}
    if used_j:  return {sdt: 'CR'}
    return {sdt: null}
```

---

## 6. 各维度计分

### 6.1 Discern：判断类型

```
hits   = count(sdt == 'HIT');   misses = count(sdt == 'MISS')
fas    = count(sdt == 'FA');    crs    = count(sdt == 'CR')

if hits + misses < 2 or fas + crs < 1:
    return INSUFFICIENT

H = (hits + 0.5) / (hits + misses + 1)
F = (fas  + 0.5) / (fas  + crs    + 1)
hiH = H >= H_HIGH;  hiF = F >= F_HIGH

type = CALIBRATED  if hiH and not hiF
       SCEPTICAL   if hiH and hiF
       CREDULOUS   if not hiH and not hiF
       MISPLACED   if not hiH and hiF
```

| 类型 | 中文 | 结果页上的一句话 |
|---|---|---|
| CALIBRATED | 校准良好 | 错的基本都看出来了，对的也没有误伤 |
| SCEPTICAL | 多疑 | 错的抓到了，但对的也被你否定了 |
| CREDULOUS | 轻信 | 大部分错误没有被你发现 |
| MISPLACED | 错位 | 你的怀疑落在了不该怀疑的地方 |

常见取值（评委版 3 条错误说法、2 条诱饵）：

| 命中 / 漏报 | H | | 误报 / 正确接受 | F |
|---|---|---|---|---|
| 3 / 0 | 0.875 | | 0 / 2 | 0.167 |
| 2 / 1 | 0.625 | | 1 / 1 | 0.500 |
| 2 / 0 | 0.833 | | 2 / 0 | 0.833 |
| 1 / 2 | 0.375 | | 0 / 1 | 0.250 |

同时输出给结果页的原始计数："你识破了 X 条错误说法中的 Y 条，否定了 Z 条正确说法中的 W 条"。

### 6.2 Decide：Beta 后验分档

**计入项**：

| 项 | 何时计入 | 成功 | 失败 |
|---|---|---|---|
| D1（每条） | 每条 `d1` 不为 null 的错误说法 | `d1 == SUCCESS` | `d1 == FAIL` |
| D2 | 完整版且 `soShown` | 非 `flag_c6`，且非（`c6SeenBeforeSO` 且非 `used_c6`） | 否则 |
| D3 | 存在 `used_j` 的错误说法 | 至少一条这样的说法 `least_j` 为真 | 一条都没有 |
| D4 | 成品里至少有一条说法（`used` 或 `fixed`） | `conf − acc < OVERCONF` | `conf − acc ≥ OVERCONF` |

D4 中的实际正确率：

```
acc = (正确说法中 used 的条数 + 错误说法中 fixed 的条数)
      / (所有 used 的条数 + 所有 fixed 的条数)
```

**计分**：

```
s = 成功项数;  f = 失败项数;  n = s + f
if n < DECIDE_MIN_ITEMS: return INSUFFICIENT
mean = (s + 0.5) / (n + 1)
band = PROFICIENT if mean >= BAND_PROFICIENT
       DEVELOPING if mean >= BAND_DEVELOPING
       EMERGING   otherwise
[lo, hi] = BETA_Q[s][f]           # 查表，见 6.2.1
wide = (hi − lo) > WIDE_CI
```

先验是 Beta(0.5, 0.5)，后验是 Beta(0.5 + s, 0.5 + f)。

#### 6.2.1 后验 90% 区间查找表

用 `scipy.stats.beta.ppf` 预先算好，写进代码作为常量，避免在 TypeScript 里做数值积分。

```
const BETA_Q: Record<string, [number, number]> = {
  '0,1': [0.002, 0.771], '0,2': [0.001, 0.569], '0,3': [0.001, 0.444], '0,4': [0.000, 0.362], '0,5': [0.000, 0.306], '0,6': [0.000, 0.264],
  '1,0': [0.229, 0.998], '1,1': [0.097, 0.903], '1,2': [0.062, 0.764], '1,3': [0.046, 0.651], '1,4': [0.036, 0.563], '1,5': [0.030, 0.495], '1,6': [0.026, 0.440],
  '2,0': [0.431, 0.999], '2,1': [0.236, 0.938], '2,2': [0.165, 0.835], '2,3': [0.128, 0.739], '2,4': [0.104, 0.659], '2,5': [0.088, 0.593], '2,6': [0.076, 0.538],
  '3,0': [0.556, 0.999], '3,1': [0.349, 0.954], '3,2': [0.261, 0.872], '3,3': [0.209, 0.791], '3,4': [0.175, 0.719], '3,5': [0.150, 0.657], '3,6': [0.132, 0.604],
  '4,0': [0.638, 1.000], '4,1': [0.437, 0.964], '4,2': [0.341, 0.896], '4,3': [0.281, 0.825], '4,4': [0.239, 0.761], '4,5': [0.209, 0.703], '4,6': [0.185, 0.653],
  '5,0': [0.694, 1.000], '5,1': [0.505, 0.970], '5,2': [0.407, 0.912], '5,3': [0.343, 0.850], '5,4': [0.297, 0.791], '5,5': [0.262, 0.738], '5,6': [0.235, 0.690],
  '6,0': [0.736, 1.000], '6,1': [0.560, 0.974], '6,2': [0.462, 0.924], '6,3': [0.396, 0.868], '6,4': [0.347, 0.815], '6,5': [0.310, 0.765], '6,6': [0.280, 0.720],
};
```

Decide 最多 6 个计入项（完整版：D1 三条、D2、D3、D4），表格覆盖了全部组合。

常用值速查：

| 成功 / 失败 | 后验均值 | 90% 区间 | 档位 | 区间较宽 |
|---|---|---|---|---|
| 2 / 0 | 0.83 | 0.43–1.00 | Proficient | 否 |
| 3 / 0 | 0.88 | 0.56–1.00 | Proficient | 否 |
| 4 / 0 | 0.90 | 0.64–1.00 | Proficient | 否 |
| 3 / 1 | 0.70 | 0.35–0.95 | Developing | 否 |
| 2 / 1 | 0.62 | 0.24–0.94 | Developing | 是 |
| 3 / 2 | 0.58 | 0.26–0.87 | Developing | 是 |
| 2 / 2 | 0.50 | 0.17–0.83 | Developing | 是 |
| 1 / 2 | 0.38 | 0.06–0.76 | Emerging | 是 |
| 0 / 2 | 0.17 | 0.00–0.57 | Emerging | 否 |

### 6.3 Own：行为清单

```
leaked = |namesToAI ∪ namesInBrief|
O1 = leaked == 0
O2 = not p2Accepted and not ghostRequested
measured = MINE if overlap < OVERLAP_MIXED
           MIXED if overlap < OVERLAP_AI
           AI otherwise
O3 = rank(declared) >= rank(measured)       # rank: MINE=0, MIXED=1, AI=2
O4 = 没有任何错误说法 used
O5 = vivaRating ∈ {0, 1, 2}                 # 只展示，见第 7 节
```

O3 的含义是：声明比实际更依赖 AI 不算问题，声明得比实际更"自己写的"才算不一致。

### 6.4 Direct：只展示

沿用现有的四个特征（主题、篇幅、来源、对象），输出命中了哪几个，不定档。

### 6.5 作业质量（不进画像）

```
validPoints = 正确说法中 used 的条数 + 错误说法中 fixed 的条数
hasView     = B 匹配 view_markers，或含引号
sourced     = B 匹配 source_markers
wordsOK     = WORDS.min <= words <= WORDS.max
met         = validPoints >= 2 and hasView and sourced and wordsOK and onTime
```

每一项单独显示 ✓ 或 ✗。

---

## 7. 追问题（Q5）：选题与评级

### 7.1 选题（Q1–Q4 提交后立即计算，按顺序取第一个成立的）

| 顺序 | 条件 | 问题模板 | kind |
|---|---|---|---|
| 1 | 存在严重事件 E1 的那条说法 j | You wrote "{B 中匹配到的错误写法}" in your brief. What did you base that on? | `confident_wrong` |
| 2 | 存在误报；有 `lure` 的优先 | You decided not to rely on: "{j 的标题}". What made you doubt it? | `false_alarm` |
| 3 | 存在通过 `flag_j` 命中的错误说法 | You decided not to rely on: "{j 的标题}". What made you doubt it? | `hit` |
| 4 | 都没有 | How did you decide what to keep from the assistant's draft? | `generic` |

误报排在命中前面，是因为问"你为什么不信这条正确的说法"最能区分有理由的怀疑和全盘怀疑。

### 7.2 评级

```
REASON = /\b(because|since|source|survey|list|data|checked|looked|read|evidence|method|figure|number)\b/i

function rateViva(kind, j, answer):
  hasReason = wordCount(answer) >= 5 and REASON.test(answer)
  if kind == 'generic' or j is null:   return hasReason ? 1 : 0
  if kind == 'confident_wrong':        return hasReason ? 1 : 0   # 用错误内容辩护，最高 1 分
  if matches(answer, j.basis_markers): return 2
  return hasReason ? 1 : 0
```

2 = 指出了具体依据；1 = 给了理由但不具体；0 = 没有理由。只在 Own 清单里展示，不进任何档位。

---

## 8. 严重事件与封顶

| 事件 | 条件 | 后果 |
|---|---|---|
| E1 自信地错 | 存在错误说法 j：`used_j` 且非 `least_j`，且 `conf ≥ CONFIDENT` | 成为结果页第一条；Decide 档位最高 Developing |
| E2 泄露多名同学 | `leaked ≥ 2` | 在 Own 清单中标出 |
| E3 接受代写 | `p2Accepted` | 在 Own 清单中标出 |

有多条说法满足 E1 时，取第一个按剧本顺序出现的。

封顶只作用于 Decide：如果有 E1 且 Decide 是 PROFICIENT，降为 DEVELOPING，并标注 `capped`。

---

## 9. 开头一条、建议、群体对比

### 9.1 开头一条（按顺序取第一个成立的）

1. E1：发生了什么（引用学生的操作记录和把握程度）、说明了什么（这条说法的揭晓文本）、下一步怎么做（这条说法的建议）。
2. E2 或 E3：用对应清单项的揭晓和建议文本。
3. 最好的一个判断，按以下优先级选：ladder 2 且有 `query_j`（AI 坚持了他也没屈服）→ ladder 2 且 `fixed_j` → ladder 2 且 `flag_j` → D2 成功。
4. 都没有："这次活动里没有特别突出的表现"，下一步建议至少查证一条数字。

### 9.2 三条建议（按以下顺序收集候选，去重后取前 3 条）

1. 严重事件对应的建议。
2. Discern 类型不是 CALIBRATED 时，对应类型的建议。
3. Decide 中失败项对应的建议（D1、D2、D3、D4 各有一条预写文本）。
4. Own 清单中打 ✗ 的项对应的建议。
5. 漏报（MISS）的错误说法自带的建议。

### 9.3 群体对比

对每条错误说法，统计"过去 24 小时内同意存储、已完成、同一版本的会话中，有多少比例 `used_j`"。少于 5 人时不显示。

---

## 10. 标准答案：五位考生（评委版）

共同假设：都没接受代写，都没把带姓名的留言发给 AI，字数和时间都合格。

### 10.1 输入

| 考生 | 简报内容 | Q1 | Q2 | Q3 | Q4 | 追问记录 |
|---|---|---|---|---|---|---|
| A 绕开 AI | 48 of 120；56%；85%；27.5 vs 24.5 + observational；一条学生观点；注明来源 | 无 | 都很有把握 | 0.80 | MINE | 无 |
| B 全盘怀疑 | 同 A | c1–c5 全选 | 都很有把握 | 0.80 | MINE | 无 |
| C 会用 AI | 同 A | c2、c3、c4 | 都很有把握 | 0.75 | MINE | 无 |
| D 只做动作 | 笼统描述，不含任何说法的标志词 | 无 | 都很有把握 | 0.60 | MINE | 无 |
| E 看出却屈服 | 48 of 120；**65%**；85%；"高 3 分，但不能确定原因" | c3 | c5 | 0.85 | MIXED | 追问过 c2 |

### 10.2 期望输出

| 考生 | 处置编码 | Discern | Decide | Own | 严重事件 / 开头一条 | 追问题 |
|---|---|---|---|---|---|---|
| A | c1 CR；c2 HIT（fixed）；c3 未处置；c4 HIT（fixed）；c5 CR | H 0.833，F 0.167 → **CALIBRATED** | D1 成功 ×2，D4 成功（acc 1.0）→ 3/0，均值 0.88 → **PROFICIENT** | 全 ✓ | 无；最好的判断是改正了 c2 | generic |
| B | c1 FA；c2 HIT；c3 HIT；c4 HIT；c5 FA | H 0.875，F 0.833 → **SCEPTICAL** | D1 成功 ×3，D4 成功 → 4/0，均值 0.90 → **PROFICIENT** | 全 ✓ | 无 | false_alarm，问 c5（lure） |
| C | c1 CR；c2–c4 HIT；c5 CR | H 0.875，F 0.167 → **CALIBRATED** | D1 成功 ×3，D4 成功 → 4/0 → **PROFICIENT** | 全 ✓ | 无 | hit，问 c2 |
| D | 全部未处置或无 | **INSUFFICIENT** | 0 个计入项 → **INSUFFICIENT** | O1–O4 ✓ | 无 | generic |
| E | c1 CR；c2 HIT（ladder 1）；c3 HIT；c4 HIT（fixed）；c5 CR | H 0.875，F 0.167 → **CALIBRATED** | D1：c2 失败、c3 成功、c4 成功；D3 失败；D4 成功（acc 0.75，0.85 − 0.75 = 0.10）→ 3/2，均值 0.58 → **DEVELOPING**，区间较宽 | O4 ✗ | **E1**（c2），Decide 已是 Developing，封顶不改变结果 | confident_wrong，问 65% |

D 的作业质量：`validPoints = 0`，未达标。

A 和 C 的画像几乎相同，这是已知局限：资料包太短，分不清学生是信了 AI 还是自己查的。缓解办法见 02 文档第 9 节。

### 10.3 必须单独覆盖的边界情况

| 情况 | 期望 |
|---|---|
| 错误说法既被标记又被用进了成品 | ladder 1，HIT，D1 失败 |
| 只打开了某条说法对应的资料，没有其他记录 | 未处置 |
| 追问过一条正确说法，最后用了它 | CR，不是 FA |
| 标记了一条正确说法，但成品里还是用了 | FA |
| c4 写成 "may not prove that AI improves learning" | 否定句不算用了错误写法；匹配到 `3 points` 则算 fixed |
| 完整版：第二意见出现前草稿里有 c6，出现后被删掉 | D2 失败 |
| E1 成立，且 Decide 原本是 PROFICIENT | 降为 DEVELOPING，标注 `capped` |
| Q2 选了 2 条以上 | 接口拒绝（最多 2 条） |

---

## 11. 输出结构

```
Result {
  headline:   { kind: 'E1'|'E2'|'E3'|'best_call'|'none', claimId?, happened, means, next }
  discern:    { status: 'ok'|'insufficient', type?, H?, F?, hits, misses, fas, crs }
  decide:     { status: 'ok'|'insufficient', band?, mean?, ci?: [lo, hi], wide?, capped?,
                items: [{ id: 'D1'|'D2'|'D3'|'D4', claimId?, outcome: 'success'|'fail', evidence }] }
  own:        { checks: [{ id: 'O1'..'O4', ok: boolean, evidence }], viva: { kind, claimId?, question, answer, rating } }
  direct:     { features: { topic, length, sources, audience } }
  quality:    { validPoints, hasView, sourced, wordsOK, onTime, met }
  incidents:  ['E1'|'E2'|'E3', ...]
  claims:     [{ id, role, ladder?, sdt?, used, fixed, flagged, queried, checkedAt?, leastSure, evidence, reveal, advice }]
  suggestions: string[]           // 最多 3 条
}
```

不输出总分，也不输出任何跨维度的合成数字。
