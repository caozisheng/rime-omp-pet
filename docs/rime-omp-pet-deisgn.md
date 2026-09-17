# Rime OMP Pet 设计

> 文件名中的 `deisgn` 拼写沿用需求，避免改变既定路径。
>
> 状态：设计已确认，待实现。

## 1. 背景与目标

在 Oh My Pi（OMP）的 prompt/editor 右侧增加一个 ASCII 宠物 widget。宠物内容默认在 widget 内靠左对齐，也可通过配置改为靠右。宠物根据 coding agent 的当前状态切换表情和动作，动画帧可扩展，用户可以通过脚本或 JSON 资源定义新的动物、动作和帧。

本设计只解决 OMP 内的状态指示与轻量视觉反馈，不实现独立的 Tamagotchi 模拟。宠物没有饥饿、疲劳、成长、金币或离线衰减等持久属性。

### 目标

- 作为独立 OMP extension 工作，不修改 OMP core。
- 使用 OMP 原生 widget 插槽，显示在 prompt/editor 右侧。
- 宠物内容在 widget 可用区域内默认靠左对齐。
- 同时表达稳定的 agent 生命周期状态和短暂的工具/任务事件。
- 支持 cat、dog 等可插拔 PetPack。
- 支持脚本定义 ASCII 图，也支持不执行代码的 JSON 资源。
- 对终端 resize、窄终端、错误资源和 session shutdown 安全。
- 不发送清屏、移动光标或直接操作 terminal scrollback 的控制序列。

### 非目标

- 不 fork 或 patch OMP。
- 不启动 tmux、sidecar 或独立动画进程。
- 不依赖 Kitty graphics、Sixel、图片或 Unicode 半区块。
- 不解析 transcript 猜测 agent 状态。
- 不把用户资源脚本当作沙箱执行。
- 第一版不实现宠物养成、持久心情或多宠物同时显示。

## 2. 参考调研与素材结论

### 2.1 OMP 参考

OMP 已有 extension UI API：

```ts
ctx.ui.setWidget("rime-omp-pet", component, {
  placement: "rightEditor",
});
```

widget 组件遵循 TUI 的宽度感知渲染约定：

```ts
interface Component {
  render(width: number): string[];
}
```

因此不需要修改 composer、prompt 或 TUI 核心。动画刷新应通过 OMP extension 的受管 timer 驱动，由 `setWidget` 更新组件内容，让 OMP TUI 负责 viewport 重绘。

### 2.2 GitHub 调研结果

- [`dropdevrahul/campy`](https://github.com/dropdevrahul/campy)：最接近目标架构。面向 CLI coding agent，包含 cat/dog、多种语义状态、分层动画和 agent adapter。当前实现以其 MIT 许可的 cat/dog 资源为默认素材来源，固定在 commit `814566b7df24512c64884550bd22589d5fedd2d4`；将八行/分层帧规范化为本项目的单层、可打印 ASCII、cat 14×5 / dog 16×5 帧，并保留许可证文本。
- [`ts-animal/ts-animal`](https://github.com/ts-animal/ts-animal)：MIT 许可的纯文本逐帧资源库，适合作为未来用户自定义资源的输入参考。
- [`smikulcik/ascii-sprite-editor`](https://github.com/smikulcik/ascii-sprite-editor)：ISC 许可，支持逐帧编辑、帧时长和 JSON 导出。适合作为艺术资源制作工具，不作为运行时依赖。
- [`con-dog/clippy`](https://github.com/con-dog/clippy)：展示了按编号文本帧组织 ASCII 动画的方式，并关注 Windows CMD；但使用 GPL-3.0，不能未经许可审查直接混入扩展资源。
- [`kernastra/pi-pets`](https://github.com/kernastra/pi-pets)：验证了 coding-agent 生命周期反应、manifest 和 artwork provenance 的价值，但主要使用 PNG/Kitty graphics，且艺术资源为 CC BY 4.0，不直接适合作为 ASCII 资源。
- [`paulrobello/term-pet`](https://github.com/paulrobello/term-pet)：提供跨平台终端宠物和资源/配置思路，但以外部 Python/Rich 进程为主，不符合 OMP 内嵌 widget 的生命周期模型。
- [`znigwr-rgb/tamagotchi-cat`](https://github.com/znigwr-rgb/tamagotchi-cat)：可借鉴进食、开心、睡眠和受伤等动作语义，但其持久需求系统不纳入本项目。

GitHub 搜索结果中还包含 nyancat、桌面宠物、XPM/PNG sprite 和完整屏幕清屏动画。它们不满足 OMP widget 的布局和终端历史约束，不能仅凭搜索摘要直接采用。

### 2.3 第一版素材策略

第一版默认发布从 `campy` 派生并规范化的 cat 和 dog ASCII 帧，尺寸固定为 cat 14×5、dog 16×5。转换仅替换 Unicode glyph、压平分层并裁剪/补齐高度；不改变动作语义。许可证副本位于 `licenses/CAMPY-MIT.txt`。

任何导入的第三方帧都必须记录：仓库 URL、commit/tag、文件路径、许可证、版权声明和转换步骤。建议使用 `provenance.json` 保存这些信息。

## 3. 总体架构

```text
OMP extension events
        |
        v
  event adapter
        |
        +--> lifecycle state
        +--> reaction event + TTL
                    |
                    v
          priority/TTL resolver
                    |
                    v
              action name
                    |
                    v
              PetPack lookup
                    |
                    v
                Animator
                    |
                    v
             Pet Widget render
                    |
                    v
        ctx.ui.setWidget(rightEditor)
```

建议目录：

```text
rime-omp-pet/
├── extension.ts
├── src/pet/
│   ├── types.ts          # 状态、动作、reaction 数据结构
│   ├── state.ts          # 生命周期和 TTL 优先级解析
│   ├── animator.ts       # 帧时钟、切换和销毁
│   ├── renderer.ts       # 左/右对齐、宽度裁剪和安全输出
│   └── validate.ts       # PetPack schema 校验
├── packs/                # 所有宠物统一为 JSON 配置文件（内置包也不例外）
│   ├── cat.json
│   ├── dog.json
│   └── parrot.json
└── provenance.json
```

状态机、动画引擎和 renderer 应尽量不依赖 OMP 类型，使它们可以通过纯数据测试。只有 `extension.ts` 和 `event-adapter.ts` 依赖 OMP extension API。

## 4. Widget 布局与渲染

### 4.1 挂载

```ts
ctx.ui.setWidget("rime-omp-pet", component, {
  placement: "rightEditor",
});
```

宠物 widget 不直接调用 `process.stdout.write`，不清屏，不移动终端光标，不维护 scrollback。所有更新交由 OMP TUI 处理。

### 4.2 内容对齐

渲染器接收 OMP 提供的 `width`。默认不添加左侧 padding，使 sprite 在右侧 widget 内靠左；配置 `align: "right"` 时，按可用宽度计算 padding：

```ts
const leftPadding = align === "right" ? Math.max(0, width - spriteWidth) : 0;
return frame.lines.map(line => " ".repeat(leftPadding) + line);
```

实际实现应使用 OMP/TUI 已有的 ANSI-aware display-width 工具，不使用普通字符串长度计算带 ANSI 或未来扩展字符的宽度。

约束：

- 支持宽度范围：14–70 列（validator 与 renderer 强制），默认固定高度 5 行；猫资源每个动作的首帧从第 1 列开始，后续横向位移限制在 70 列舞台内；资源高度不一致时拒绝或补齐，不让布局随帧跳动。
- 宽度不足时隐藏宠物，或降级到单行最小 fallback；不抛异常。
- 资源内容不携带 ANSI escape sequence。
- 第一版只接受普通 ASCII，避免 CJK、组合字符和 emoji 的终端宽度差异。
- resize 只重新计算 padding，不重置动画帧。
- 空 widget 和 session shutdown 必须取消刷新 timer。

### 4.3 可选状态文字

第一版默认只显示宠物，不显示状态文字，避免增加高度和干扰 prompt。未来可配置短标签，例如 `thinking`、`running tests`，但标签必须服从同一宽度裁剪规则。

## 5. 两层状态模型

### 5.1 基础生命周期状态

```ts
type LifecycleState =
  | "idle"
  | "thinking"
  | "tool-running"
  | "waiting-user"
  | "success"
  | "error"
  | "interrupted"
  | "compacting";
```

生命周期状态持续到下一个明确的 OMP 状态转换。

### 5.2 短暂 reaction

```ts
type ReactionEvent =
  | "tool-start"
  | "file-read"
  | "file-edited"
  | "command-running"
  | "test-passed"
  | "test-failed"
  | "subagent-completed"
  | "context-compacted"
  | "turn-succeeded"
  | "turn-failed"
  | "interrupted";

interface Reaction {
  event: ReactionEvent;
  action: string;
  priority: number;
  expiresAt: number;
  sequence: number;
}
```

选择规则：

1. 丢弃 `expiresAt <= now` 的 reaction。
2. 未过期 reaction 中选择最高 `priority`。
3. priority 相同时选择最新 `sequence`。
4. 没有有效 reaction 时使用当前 lifecycle state 对应的动作。
5. lifecycle 改变不清除仍然有效的高优先级 reaction。
6. 同类高频事件应合并或节流，避免宠物频繁跳变。
7. reaction 到期后自动回到当前 lifecycle state，而不是回到创建 reaction 时的旧状态。

建议默认优先级和 TTL：

| 优先级 | 事件 | 默认动作 | TTL |
|---:|---|---|---:|
| 100 | `test-failed` / `turn-failed` | `panic` 或 `sad` | 3000 ms |
| 90 | `interrupted` | `surprised` | 2000 ms |
| 80 | `test-passed` / `turn-succeeded` | `celebrate` | 2500 ms |
| 70 | `file-edited` | `happy` 或 `work` | 1200 ms |
| 60 | `tool-start` / `command-running` | `work` | 800 ms |
| 50 | `subagent-completed` | `excited` | 2000 ms |
| 40 | `context-compacted` | `compact` | 2000 ms |
| 10 | 无 reaction | lifecycle 对应动作 | 持续 |

TTL、priority 和 action 应进入配置，不能散落在事件处理器中。

### 5.3 默认映射

| OMP 状态或事件 | 默认动作 | 视觉语义 |
|---|---|---|
| session 启动 | `wake` | 唤醒 |
| idle | `idle` | 呼吸、眨眼 |
| agent 思考 | `think` | 约 9.65 秒的低干扰叙事循环：缓慢横跨舞台、停步困惑、歪头思索、短暂灵光、转身返回 |
| 工具运行 | `work` | 工作、打字 |
| 等待用户 | `wait` | 等待输入 |
| 工具或 turn 成功 | `happy` | 开心 |
| 工具或 turn 失败 | `sad` | 沮丧 |
| 测试通过 | `celebrate` | 庆祝 |
| 测试失败 | `panic` | 惊讶、慌张 |
| 上下文压缩 | `compact` | 整理或眩晕 |
| 用户中断 | `interrupted` | 停止、惊讶 |
| session 结束 | `sleep` | 收尾并释放资源 |

状态机只产生动作名，不知道 cat 或 dog 的字符细节。资源包决定动作是否存在以及动作的具体帧。

## 6. PetPack 资源协议

### 6.1 TypeScript/JavaScript manifest

```ts
export interface PetPack {
  schemaVersion: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  fallbackAction: string;
  actions: Record<string, Animation>;
  metadata?: {
    author?: string;
    license?: string;
    source?: string;
  };
}

export interface Animation {
  loop: boolean;
  frames: Frame[];
}

export interface Frame {
  lines: string[];
  durationMs?: number;
}
```

示例：

```ts
export default {
  schemaVersion: 1,
  id: "cat",
  name: "ASCII Cat",
  width: 14,
  height: 5,
  fallbackAction: "idle",
  actions: {
    idle: {
      loop: true,
      frames: [
        {
          lines: [
            "  /\\_/\\     ",
            " ( o.o )      ",
            "  > ^ <       ",
            "              ",
            "              ",
          ],
          durationMs: 900,
        },
      ],
    },
  },
} satisfies PetPack;
```

### 6.2 JSON manifest

JSON 资源具有相同字段：

```json
{
  "schemaVersion": 1,
  "id": "cat",
  "name": "ASCII Cat",
  "width": 14,
  "height": 5,
  "fallbackAction": "idle",
  "actions": {
    "idle": {
      "loop": true,
      "frames": [
        {
          "lines": [
            "  /\\_/\\     ",
            " ( o.o )      ",
            "  > ^ <       ",
            "              ",
            "              "
          ],
          "durationMs": 900
        }
      ]
    }
  }
}
```

仓库自带完整示例 `packs/parrot.json`：一个 24×5 的鹦鹉 pack，全部动画通过配置文件定义，动作设计以"整只精灵在画布上平移、镜像"为主——wait 左右踱步、panic 在画布边缘弹跳、excited 沿全宽滑行。它由 `scripts/build-parrot.ts`（精灵合成器：手绘 pose + 平移/镜像变换）生成，可作为编写大型动作 pack 的参考。

### 6.3 校验与回退

加载时必须校验：

- `schemaVersion` 是支持的版本；
- `id` 是安全的非空标识符；
- `width`、`height`、`durationMs` 在合理范围内；
- 至少存在 `idle` 或可解析的 `fallbackAction`；
- 每个 frame 的行数等于 `height`；
- 每行可归一化到 `width`；
- 不包含 ANSI 控制序列；
- 动作至少有一帧；
- `loop: false` 动作结束后能回到当前基础动作。

动作查找顺序：

1. 当前动作；
2. manifest 的 `fallbackAction`；
3. `idle`；
4. 内置静态 fallback cat。

单个 malformed pack 只记录 warning 并禁用该 pack，不能终止 OMP session。动画渲染异常也必须回退到内置静态帧。

## 7. 动画引擎

第一版采用单层动画，避免不必要的分层复杂度：

```ts
class Animator {
  setAction(action: string): void;
  start(): void;
  stop(): void;
  dispose(): void;
}
```

行为：

- action 改变时从第 0 帧开始；
- `loop: true` 循环播放；
- `loop: false` 播放结束后回到 resolver 当前动作；
- 切换 action 前取消旧 timer；
- 所有 timer 使用 OMP extension 提供的受管 timer；
- `dispose()` 取消 timer 和事件订阅；
- session shutdown 时释放 widget、animator 和 registry 监听；
- idle tick 使用较慢频率，降低无意义终端刷新；
- 相同 action 和相同 frame 不重复触发 widget 更新。

未来可以增加 `base`、`eyes`、`overlay` 等分层动画，但不是第一版协议要求。分层设计应保持对单层 `frames` 的兼容。

## 8. 用户自定义与配置

### 8.1 资源发现位置

仓库自带的 `packs/` 目录在运行时枚举（相对 extension 模块解析），用户不需要改任何代码：clone 后往 `packs/` 放入新的 `<animal>.json`，重启 OMP 即可通过 `/pet <animal>` 使用。静态导入只保留 cat 作为发现完成前/失败时的同步兜底。

用户与项目级资源：

```text
~/.omp/agent/pets/
├── cat.json
├── dog.json
└── my-fox.ts
```

以及项目级资源：

```text
<project>/.omp/pets/
└── project-pet.ts
```

资源发现顺序明确且稳定：仓库 `packs/` → 用户全局资源 → 项目资源；同一 `id` 的后者覆盖前者（用户可以覆盖仓库自带包）。资源在 session 启动时发现；OMP reload 后重新发现。

### 8.2 配置示例

```yaml
pet:
  enabled: true
  pack: cat
  maxWidth: 70
  maxHeight: 5
  alignment: right
  idleFrameMs: 1200
  reactions:
    test-failed:
      action: panic
      ttlMs: 3000
```

推荐保留以下命令扩展点：

```text
/pet
/pet on
/pet off
/pet cat
/pet dog
/pet status
/pet reload
```

命令不是状态机的必要依赖；如果第一版不实现命令，仍应保留等价的配置能力。

### 8.3 信任边界

OMP extension 的 `.ts`/`.js` 在进程内执行，拥有当前 extension 的进程权限。文档必须明确：

- 只加载用户信任的脚本；
- JSON 是不执行代码的首选自定义格式；
- 不执行远程下载的动画脚本；
- 不通过 shell 启动外部动画程序；
- 资源脚本错误只能禁用资源，不得让 OMP 退出。

## 9. OMP 事件接入

extension 只使用公开生命周期、工具和 turn 事件，不读取 OMP 私有字段，不解析 transcript。事件适配器负责：

- 将 OMP payload 转换成内部稳定事件；
- 隔离 OMP 事件命名或 payload 变化；
- 合并重复工具事件；
- 将工具类型映射为 `file-read`、`file-edited`、`command-running`、`test-*` 等反应；
- 对未知事件安全忽略；
- 不让 PetPack 依赖 OMP 事件类型。

工具结果通常不能可靠地仅凭工具名称判断“测试通过/失败”。应优先使用 OMP 已公开的结果或 turn 状态；只有有证据时才发出 `test-passed`/`test-failed`，否则使用通用 `turn-succeeded`/`turn-failed`。

## 10. 资源许可证与 provenance

首版内置 cat/dog 使用原创帧。未来如果导入第三方资源，必须在 `provenance.json` 保存类似记录：

```json
{
  "assetId": "cat-coffee-frame-1",
  "repository": "https://github.com/ts-animal/ts-animal",
  "ref": "<commit-or-tag>",
  "path": "src/zoo/cat-coffee/frame_1.txt",
  "license": "MIT",
  "copyright": "ts-animal contributors",
  "transformations": [
    "normalized to fixed height",
    "converted to ASCII-compatible width",
    "trimmed trailing whitespace"
  ]
}
```

许可证判断必须针对具体仓库和具体文件，不只依据搜索摘要。GPL、CC BY、ISC、MIT 等许可的再分发要求不同；引入时应保留必要版权和许可证文本。

## 11. 失败处理与生命周期

| 场景 | 行为 |
|---|---|
| 未知 action | 回退到 pack fallback，再回退 idle |
| malformed JSON/脚本 | warning，禁用该 pack，保持 OMP 运行 |
| 帧高度错误 | 拒绝该动作或 pack，不改变当前 widget |
| 帧过宽 | 截断到 manifest width |
| 终端过窄 | 隐藏或显示最小 fallback，不抛异常 |
| resize | 根据对齐配置重新计算 padding，保留动画状态 |
| reaction 过期 | 重新解析当前 lifecycle state |
| timer 回调晚到 | 通过 disposed/generation guard 忽略 |
| session shutdown | 取消 timer、监听和 widget，回收资源 |
| renderer 异常 | 显示内置静态 fallback cat，并记录 warning |

## 12. 实现阶段验收标准

1. OMP 启动后，宠物出现在 prompt/editor 右侧，内容默认靠左。
2. 宠物不覆盖 prompt，不清除终端历史，不直接写 terminal stdout。
3. `idle`、`thinking`、`tool-running`、`waiting-user`、`success`、`error`、`compacting` 等基础状态可以切换。
4. 成功和失败事件显示不同的短暂动作。
5. reaction TTL 到期后回到当时最新的基础状态。
6. 高优先级 reaction 覆盖低优先级 reaction。
7. action 缺失时回退到 pack 的 fallback/idle。
8. malformed pack 不终止 OMP session。
9. 终端 resize 后仍保持所选对齐方式且不越界。
10. session shutdown 后没有遗留 timer 或事件监听。
11. 用户可以通过 JSON 或 TypeScript 资源增加新动物。
12. 第三方素材具有明确 provenance 和 license 记录。
13. 窄终端下 widget 安全隐藏或降级。
14. cat 和 dog 至少各包含 `idle`、`think`/`work`、`happy`/`celebrate`、`sad`/`panic` 四类动作。
15. 状态机、resolver、renderer 和资源校验可以脱离 OMP 事件适配器单独验证。

## 13. 推荐实施顺序

1. 定义 `PetPack`、frame 校验和内置静态 fallback。
2. 实现纯数据的 lifecycle/reaction resolver，覆盖 priority、TTL、同优先级新旧事件和过期回退。
3. 实现单层 Animator，使用受管 timer 并提供 `dispose()`。
4. 实现宽度感知、默认左对齐、可选右对齐和窄终端降级 renderer。
5. 接入 OMP `rightEditor` widget 和 session shutdown。
6. 接入 lifecycle、tool、turn 事件适配器。
7. 添加原创 cat/dog 资源及 provenance 文件。
8. 添加配置和资源发现；再考虑 `/pet` 命令。
9. 运行真实 OMP smoke test，确认布局、动画、resize、失败回退和 shutdown。

## 14. 参考链接

- [Oh My Pi](https://github.com/can1357/oh-my-pi)
- [OMP extension loading](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extension-loading.md)
- [OMP extensions guide](https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extensions.md)
- [coding-buddy](https://github.com/ramarivera/coding-buddy)
- [campy](https://github.com/dropdevrahul/campy)
- [ts-animal](https://github.com/ts-animal/ts-animal)
- [ascii-sprite-editor](https://github.com/smikulcik/ascii-sprite-editor)
- [clippy](https://github.com/con-dog/clippy)
- [pi-pets](https://github.com/kernastra/pi-pets)
- [term-pet](https://github.com/paulrobello/term-pet)
- [tamagotchi-cat](https://github.com/znigwr-rgb/tamagotchi-cat)
