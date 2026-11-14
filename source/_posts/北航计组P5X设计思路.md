---
title: 北航计组P5X设计思路
publish: true
permalink: co-p5x-design
categories:
- 计算机组成
tags:
- cpu
- 异常处理
cover: https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQqspQ21bs3Vw6cDT8SD2kMitIcxFb50LdVzDVe4-M0V_aNhXqLETS9jYTq&s=10
description: 从 P4 到 P5X：单周期 MIPS CPU 异常处理改造全记录（避坑指南版）
date: 2026-11-14 19:07:10
updated: '2026-11-14 20:16:18'
---

# 从 P4 到 P5X：单周期 MIPS CPU 异常处理改造全记录（避坑指南版）

> **前言**：如果说 P4 是一台“岁月静好、假设程序员永远不写 Bug”的理想单周期 CPU，那么 P5X 就是给它装上了**行车记录仪、安全气囊和 110 一键报警器**。从此以后，无论是 PC 跑到荒郊野外、指令解码出外星语、加法加爆了，还是访存越界，CPU 都能优雅地踩下急刹车，把现场打包进 CP0，然后一脚油门切进 `0x00004180` 的异常处理程序！

---

## 一、任务要求与异常种类速览

在动手改电路之前，先把“交警执法手册”和“设计红线”贴在桌面上。

### 1.1 P5X 核心任务要求

- **指令集扩展（共 14 条）**：在 P4（`add, sub, ori, lw, sw, beq, lui, jal, jr, nop`）基础上，新增 4 条指令：`syscall`、`mfc0`、`mtc0`、`eret`。
  - 其中 `syscall` 直接在硬件中拉起系统调用异常，无需像 MARS 那样读取 `$v0` 来模拟 I/O。
- **固定异常入口**：所有异常统一跳转到 **`0x00004180`**，不支持异常嵌套（即进入异常处理态后不会再响应新异常）。注：正常程序从 `0x417c` 顺序执行到 `0x4180` 是允许的。
- **受害者 PC（Victim PC）与零副作用**：
  - 发生异常的那条指令本身不能产生任何持久性副作用——**禁止写 GRF、禁止写 DM、禁止普通 `mtc0` 写 CP0**。
  - 若因 `jr` / `eret` 跳到了未字对齐的地址，存入 `EPC` 的必须是那个**非法 PC 本身**。
- **CP0 最小实现规范**：包含 `SR(12)`、`CAUSE(13)`、`EPC(14)` 三个寄存器，复位全为 `0`，未实现位恒为 `0`；CP0 写入无需 `$display` 打印。

### 1.2 异常种类与优先级一览表

| 异常码 (`ExcCode`) | 名称 | 涉及指令 | 触发条件 |
| :---: | :---: | :---: | :--- |
| **`4`** | `AdEL`（取指） | 所有指令 | `PC` 未按 4 字节对齐（`PC[1:0] != 2'b00`）或不在指令区 `0x3000 ~ 0x6ffc` |
| **`10`** | `RI`（未知指令） | 非法指令 | 非 14 条合法指令码（仅需判别 `OpCode` 与 R 型 `Funct`，且保证不出现 `OpCode=010000` 的非法指令） |
| **`8`** | `Syscall` | `syscall` | 执行 `syscall` 指令 |
| **`4`** | `AdEL`（取数） | `lw` | 访存地址未字对齐、计算地址时加法溢出，或地址超出 `0x0000 ~ 0x2fff` |
| **`5`** | `AdES`（存数） | `sw` | 访存地址未字对齐、计算地址时加法溢出，或地址超出 `0x0000 ~ 0x2fff` |
| **`12`** | `Ov`（算术溢出） | `add`, `sub` | 有符号加/减法运算溢出 |

> **仲裁优先级（从高到低）**：  
> `AdEL（取指）` $>$ `RI` $>$ `Syscall` $>$ `AdEL（取数）/ AdES` $>$ `Ov`

---

## 二、全局架构总览：P5X 到底多了一套什么机制？

单周期 CPU 的好处是**“一条指令的所有异常都在当前周期内当场抓获、当场处决”**，没有流水线里“前一条指令炸了后一条还得 flush”的连环车祸。

整个异常处理的生命周期就像一次**“急诊抢救”**：

```text
异常产生（IM / ctrl / ALU / 顶层判定）
   │
   ▼
顶层优先级编码器 ──► 输出 5 位 ExcCodeIn
   │
   ▼
CP0 审查（!SR[1] 且 ExcCodeIn != 0）──► 拉高 Req = 1
   │
   ├──► 1. 断电止损：屏蔽 GRF / DM / 普通 CP0 写入（~Req）
   ├──► 2. 保护现场：SR[1](EXL) <= 1, CAUSE[6:2] <= ExcCodeIn, EPC <= PC
   └──► 3. 紧急转院：NPC 强制选择 0x00004180
   ...
（内核处理完异常，执行 eret）
   │
   ▼
ctrl 拉高 EXLClr = 1 ──► CP0 清除 SR[1] <= 0，NPC 跳回 EPC 断点继续跑
```

理解了这张图，下面按**取指 $\rightarrow$ 译码 $\rightarrow$ 执行 $\rightarrow$ 访存 $\rightarrow$ 异常中枢 CP0 $\rightarrow$ 下一拍地址 NPC $\rightarrow$ 顶层总线**的顺序逐个拆解！

---

## 三、分模块改造详解（按指令生命周期顺序）

### 3.1 `IM`（取指阶段）：把大门的安检机

在 P4 里，`IM` 是个老实人，PC 给啥地址它就吐啥机器码。但引入异常后，PC 万一因为 `jr` 或 `eret` 跳到了 `0x00003001`（没对齐）或者 `0x00008000`（飞出 ROM 了），`IM` 必须第一时间拉响警报！

- **新增信号**：
  - `output AdELIM`：1 位异常指示信号，表示当前取指地址非法。
- **新增逻辑与原因**：
  1. **合法范围与对齐检查**：MIPS 指令固定 4 字节，且指令区限定在 `0x00003000 ~ 0x00006ffc`。只要违反对齐或越界，`AdELIM` 就拉高为 `1`。
  2. **防呆钳位（极其关键！）**：一旦 `AdELIM == 1`，绝对不能让 ROM 里越界读出的 `32'hxxxxxxxx`（未知态 `x`）继续流向后面的 `ctrl` 和 `ALU`！必须强制把输出指令 `data` 替换为 `nop`（`32'h00000000`），从源头上掐断乱码引发的次生灾害（例如把 `x` 传进 `ctrl` 导致整个控制信号飘红）。

```verilog
// IM.v 核心逻辑片段
assign AdELIM = addr[1:0] != 2'b00 || addr < 32'h00003000 || addr > 32'h00006ffc;
assign data   = AdELIM ? 32'h00000000 : ROM[ROM_addr];
```

- **踩坑提醒**：
  - **别忘了钳位 `data`**：如果只拉高 `AdELIM` 却不把输出置为 `32'h00000000`，当 PC 越界时，后续模块满屏红 `x`，虽然最终 `ExcCodeIn` 因优先级高选了 `4`，但仿真波形和潜在组合逻辑传播非常危险。

---

### 3.2 `ctrl`（译码与控制）：扩编保安队长

`ctrl` 不仅要认识 4 条新指令，还要在发现“外星指令”时大喊一句 `RI`，同时还要告诉顶层当前指令到底是不是 `add/sub`、`lw`、`sw` 或 `syscall`。

- **新增信号**：
  - **新输入**：`input [4:0] rs`（因为 `mfc0`、`mtc0`、`eret` 共用同一个 `OpCode = 6'b010000`，全靠 `rs` 字段区分！）。
  - **位宽扩展**：`NPC_Sel` 从 2 位扩成 **3 位 `[2:0]`**，为 `ERET` 腾出编码位。
  - **新输出**：
    - `CP0Write`：仅 `mtc0` 有效，允许写 CP0。
    - `EXLClr`：仅 `eret` 有效，退出异常态时清除 `SR.EXL`。
    - `RI`：未知指令信号。
    - `is_syscall`、`is_add_sub`、`is_lw`、`is_sw`：把指令身份牌直接递给顶层做异常资格过滤（后面 `ALU` 会解释为什么必须由它来过滤）。
- **新增逻辑与原因**：
  - **显式译码 `nop`**：以前 P4 里 `nop`（`32'h00000000`）靠“所有控制信号默认 0”混过去了；但现在我们要计算 `RI`（不在合法集合里的全判非法），如果 `ctrl` 不把 `nop`（`r_type && Funct == 6'b000000`）写进合法列表，CPU 一跑空指令就会当场 `RI` 报错自闭！
  - **`MemtoReg` 扩展为 4 选 1**：`mfc0` 要把 `CP0Out` 写回通用寄存器 `GPR[rt]`，所以回写多路选择器需要新增 `2'b11` 通路。

```verilog
// ctrl.v 核心译码与新控制信号片段
assign nop     = r_type && (Funct == 6'b000000);
assign syscall = r_type && (Funct == 6'b001100);
assign mfc0    = error_type && (rs == 5'b00000); // OpCode == 6'b010000
assign mtc0    = error_type && (rs == 5'b00100);
assign eret    = error_type && (rs == 5'b10000) && (Funct == 6'b011000);

assign RegWrite = (add || sub || ori || lw || lui || jal || mfc0);
assign MemtoReg = lw   ? 2'b01 :
                  jal  ? 2'b10 :
                  mfc0 ? 2'b11 : 2'b00;
assign CP0Write = mtc0;
assign EXLClr   = eret;
assign RI = !(add || sub || ori || lw || sw || beq || lui || jal || jr || nop || syscall || mfc0 || mtc0 || eret);
```

- **踩坑提醒**：
  - **CP0 指令的寄存器字段“反直觉”**：普通 R 型指令写 `rd`、读 `rs/rt`；但 `mfc0` 和 `mtc0` 是**用 `rd` (`Instr[15:11]`) 指定 CP0 寄存器编号，用 `rt` (`Instr[20:16]`) 读写通用寄存器**！连线时千万别把 `RegDst` 接到 `rd` 上。
  - **别漏掉 `nop`**：把 `nop` 漏出 `RI` 表达式，是 P5X 最经典的首发 Bug 没有之一。

---

### 3.3 `ALU`（执行阶段）：双符号位抓溢出

`ALU` 本身很单纯，就是个只管干活的计算器：算对算错它报出来，但算出来的溢出到底算不算“犯罪（`Ov` 还是 `AdEL/AdES`）”，由外面的顶层结合指令类型说了算。

- **新增信号**：
  - `output overflow`：1 位溢出标志，仅代表当前有符号加/减法发生溢出。
- **新增逻辑与原因**：
  - **33 位双符号位扩展法**：判断补码加减溢出的经典套路——把 32 位操作数最高位再复制一遍变成 33 位（`{A[31], A}`），用 33 位做加减，只要结果的最高两位 `[32]` 和 `[31]` 不相等，就说明正正相加变负、或负负相加变正，实锤溢出！
  - **必须门控 `ALUop`**：只有当前 `ALU` 真的在做 `ALU_ADD` 时才采信 `extAdd` 的溢出，做 `ALU_SUB` 时才采信 `extSub` 的溢出；`ori`、`lui` 这种逻辑/移位操作绝不允许因为并行的加法器瞎算而误报 `overflow`。

```verilog
// ALU.v 溢出检测核心片段
wire [32:0] extA   = {inputA[31], inputA};
wire [32:0] extB   = {inputB[31], inputB};
wire [32:0] extAdd = extA + extB;
wire [32:0] extSub = extA - extB;

assign overflow = (ALUop == ALU_ADD && extAdd[32] != extAdd[31]) ||
                  (ALUop == ALU_SUB && extSub[32] != extSub[31]);
```

- **踩坑提醒**：
  - **“并行运算不门控”陷阱**：早期容易直接写 `extAdd[32] != extAdd[31]` 而忘了判断 `ALUop == ALU_ADD`，结果做个 `ori` 甚至 `sub` 时加法器顺带溢出了，直接假报警。
  - **`ALU.overflow == 1` 不等于 `Ov` 异常！**：
    1. `beq` 也用 `ALU_SUB` 比较两数相等，但 `beq` **永远不会触发 `Ov`**；
    2. `lw` / `sw` 用 `ALU_ADD` 算 `base + offset`，此时溢出触发的是 **`AdEL` / `AdES`**，而不是 `Ov`！
    3. 哪怕以后扩展 `addu`、`addiu`，`ALU` 这里依然只需老老实实报当前运算是否溢出，最终在顶层用 `is_add_sub`（或未来的 `can_ov` 控制信号）门控即可——**控制信号各司其职，不要让局部信号污染无关指令**。

---

### 3.4 `DM`（访存阶段）：防止地址翻车与读出 `x`

到了 `DM`，其实写保护（`MemWrite && ~Req`）和地址异常判定都放在了顶层 `mips.v`，但 `DM` 自己还有最后一道防线。

- **新增信号**：无新增端口。
- **新增逻辑与原因**：
  - **读数据越界钳位**：当 `lw` 算出一个未对齐或大于 `0x00002fff` 的非法地址时，`DM` 内部的 `RAM` 索引可能会越界从而吐出 `32'hxxxxxxxx`。虽然此时 `Req` 会拉高并屏蔽 `GRF` 写入，但为了防止未知态 `x` 在数据通路上到处污染，当地址非法时直接让 `DM` 稳定输出 `32'h00000000`。

```verilog
// DM.v 读数据防呆钳位
assign Data = ((Addr[1:0] == 2'b00) && (Addr <= 32'h00002fff)) ? RAM[RAM_addr] : 32'h00000000;
```

- **踩坑提醒**：
  - **别漏判“算地址时加法溢出”！**：假设 `$t0 = 0x8000_0000`，执行 `lw $t1, -4($t0)`。`0x8000_0000 + 0xffff_fffc` 在 32 位里发生有符号溢出，虽然结果刚好绕回到合法区间甚至还是 4 的倍数，但规范明确规定**计算地址时加法溢出也属于 `AdEL` / `AdES`**！所以顶层判定 `lw`/`sw` 地址异常时，必须把 `overflow` 一并算进去。

---

### 3.5 `CP0`（协处理器 0）：全系统的“事故处理中心”

`CP0` 是 P5X 全新引入的核心大管家，负责三大职责：**存状态、收报警、管进出**。

#### 内部结构：三剑客寄存器

| 编号 | 名称 | 用到的关键位 | 职责 |
| :---: | :---: | :---: | :--- |
| **`12`** | `SR` | `SR[1]`（`EXL` 位） | 异常级标志：`1` 表示正在处理异常（屏蔽后续异常），`0` 表示正常态 |
| **`13`** | `CAUSE` | `CAUSE[6:2]`（`ExcCode`） | 记录最近一次触发异常的 5 位异常码 |
| **`14`** | `EPC` | `EPC[31:0]` | 保存受害指令的 PC，供 `eret` 恢复现场跳回 |

> 注：其余未实现的位在复位和 `mtc0` 写入时必须始终保持为 `0`。

#### 核心设计亮点：为什么 `Req` 是 `CP0` 的**输出**？

不少同学看资料时容易疑惑：“`Req` 到底是输入还是输出？”从硬件职责划分来看，**`Req` 必须是 `CP0` 的输出**！原因很简单：
- 外部（顶层）只知道“好像出事了”（`ExcCodeIn != 0`）；
- 但**能不能响应这次异常，取决于 `CP0` 肚子里的 `SR[1]`（`EXL`）是不是 0**（不能异常嵌套！）。
- 只有 `CP0` 自己手里同时握着 `ExcCodeIn` 和 `SR[1]`，所以由它组合逻辑算出 `Req = (ExcCodeIn != 5'd0) && !SR[1]` 并广播给全系统（叫停写操作、命令 `NPC` 跳 `0x4180`），逻辑最闭环、最干净！

```verilog
// CP0.v 关键逻辑片段
assign Req = (ExcCodeIn != 5'd0) && !SR[1];

always @(posedge clk) begin
    if (reset) begin
        SR    <= 32'd0;
        CAUSE <= 32'd0;
        EPC   <= 32'd0;
    end else if (Req) begin
        SR[1]      <= 1'b1;
        CAUSE[6:2] <= ExcCodeIn;
        EPC        <= VPC;
    end else if (EXLClr) begin
        SR[1] <= 1'b0;
    end else if (en) begin
        case (CP0Add)
            5'd12: SR[1]      <= CP0In[1];      // 仅写入已实现位，其余位恒为 0
            5'd13: CAUSE[6:2] <= CP0In[6:2];
            5'd14: EPC        <= CP0In;
        endcase
    end
end
```

- **踩坑提醒**：
  1. **漏写 `else if (en)`**：如果 `mtc0` 写支路忘了加 `en` 使能条件，那么随便一条 `add $12, ...`（只要 `rd` 碰巧等于 12/13/14）就会把 `SR`/`CAUSE`/`EPC` 顺手给改写了，堪称灵异 Bug 制造机！
  2. **给 `EPC` 强行清零低两位**：千万不要写 `EPC <= {CP0In[31:2], 2'b00}` 或类似截断！测试要求“未字对齐跳转时，`EPC` 必须保存那个非法 PC 本身”。
  3. **未实现位不能被 `mtc0` 污染**：`mtc0` 写 `SR`/`CAUSE` 时，只挑 `SR[1]` 和 `CAUSE[6:2]` 赋值，防止向未实现位写入脏数据。

---

### 3.6 `NPC`（下一条指令地址）：抢救车拥有最高优先级

P4 的 `NPC` 只要操心 `PC+4`、`beq`、`jal`、`jr` 四个路口；到了 P5X，它得给**救护车（`Req`）**让出绝对最高优先级，并新增一条**出院通道（`ERET`）**。

- **新增信号**：
  - `input Req`：来自 `CP0` 的异常响应信号。
  - `input [31:0] EPC`：来自 `CP0` 的 `EPCOut`。
  - `NPC_Sel` 扩宽至 `[2:0]`，新增 `ERET = 3'b100`。
- **新增逻辑与原因**：
  - `Req` 必须放在**整个三目运算符的最外层第一顺位**！因为只要异常发生，不管当前指令原本想顺延、想跳转还是想 `beq`，下一拍 PC 都必须无条件砸向 `32'h00004180`。

```verilog
// NPC.v 关键片段
assign NPC = Req                   ? 32'h00004180 :
             (NPC_Sel == PCPLUS4)  ? NPC_PCplus4 :
             (NPC_Sel == IMM26)    ? NPC_imm26 :
             (NPC_Sel == GRFconst) ? NPC_GRF :
             (NPC_Sel == IMM16 && zero) ? NPC_imm16 :
             (NPC_Sel == ERET)     ? EPC :
             NPC_PCplus4;
```

- **踩坑提醒**：
  - **把 `Req` 藏进 `ERET` 分支的悲剧**：曾经不小心把 `Req ? 0x4180` 塞在某条子分支里，结果除了那条指令外，所有异常全部照常跑飞！记住：**`Req` 是全局最高优先级抢占，必须站在 `NPC` 选择器最顶端**。

---

### 3.7 `mips`（顶层连线与仲裁）：交响乐团的指挥棒

顶层 `mips.v` 不负责具体算术，只负责两件大事：**按优先级给所有报警器排座次**，以及**在 `Req` 拉高时一键切断所有写使能**。

- **新增逻辑与原因**：
  1. **异常资格门控 + 优先级编码**：把 `IM`、`ctrl`、`ALU` 送来的零散线索汇聚起来，严格按照 `AdEL(取指) > RI > Syscall > AdEL(取数)/AdES > Ov` 输出 5 位 `ExcCodeIn`。
  2. **全局写保护（零副作用铁律）**：只要 `Req == 1`，`DM.MemWrite`、`GRF.WE`、`CP0.en` 统统被 `~Req` 一刀切断，保证受害指令绝不留下任何痕迹。
  3. **CP0 数据通路接线**：`CP0Add` 接 `rd`（`Instr[15:11]`），`CP0In` 接 `GRF` 读出的 `RD2`（`GPR[rt]`），`CP0Out` 接进 `GRF` 回写 4 选 1 的 `2'b11` 号口，`EPCOut` 接给 `NPC`。

```verilog
// mips.v 异常汇集、优先级编码与写使能屏蔽关键片段
assign exc_AdEL_IF = AdELIM;
assign exc_RI      = RI;
assign exc_Syscall = is_syscall;
assign exc_AdEL_DM = is_lw && ((Addr[1:0] != 2'b00) || overflow || (Addr > 32'h00002fff));
assign exc_AdES_DM = is_sw && ((Addr[1:0] != 2'b00) || overflow || (Addr > 32'h00002fff));
assign exc_Ov      = is_add_sub && overflow;

assign ExcCodeIn = exc_AdEL_IF ? 5'd4  :
                   exc_RI      ? 5'd10 :
                   exc_Syscall ? 5'd8  :
                   exc_AdEL_DM ? 5'd4  :
                   exc_AdES_DM ? 5'd5  :
                   exc_Ov      ? 5'd12 :
                   5'd0;

// 写使能全局门控
// DM:  .MemWrite(MemWrite && ~Req)
// GRF: .WE(RegWrite && ~Req)
// CP0: .en(CP0Write & ~Req)
```

- **提醒**：注意要把所有新增加的信号都提前在mips里面声明。
  

---

## 四、联调测试思路：怎么验证你的 P5X 真稳了？

写完代码别急着交差，针对 P5X 特性，测试程序（在 `0x3000` 主程序 + `0x4180` 异常处理程序）重点一定要覆盖以下“作死场景”：

1. **基础通路**：`mtc0` / `mfc0` 对 `SR`、`CAUSE`、`EPC` 的读写，确认未实现位始终读出 `0`。
2. **五大异常挨个触发**：
   - `Ov`：`add` 正溢出（`0x7fffffff + 1`）与 `sub` 负溢出（`0x80000000 - 1`），同时验证**溢出发生时目标寄存器没有被改写**；再测一条 `beq` 减法溢出不能报错。
   - `Syscall`：直接触发 `ExcCode = 8`，`eret` 返回时注意在 handler 里让 `EPC += 4` 跳过引发异常的指令（否则会原地无限循环报警！）。
   - `AdEL(DM)` / `AdES(DM)`：分别测**未字对齐**（如 `lw` 地址末尾为 `2`）、**地址越界**（如 `0x3000`）以及**地址加法溢出**（如 `0x80000000 + (-4)`）。
   - `RI`：塞一条合法集合之外的机器码，确认跳入 `0x4180` 且 `CAUSE[6:2] == 10`。
   - `AdEL(IM)`：用 `jr` 跳去未对齐地址（如 `0x3001`）和越界地址（如 `0x7000`），检查 `EPC` 是否原汁原味保留了那个非法 PC。
3. **优先级与嵌套防御**：在 `0x4180` 处理函数内部确认 `SR[1] == 1`；或者在非法 PC 下检查是否优先报取指 `AdEL(4)`，最终 `eret` 安全撤退停机。

---

> **写在最后**：从 P4 到 P5X，本质上是给单周期 CPU 加上了一层**“异常安全网”**——`IM` 守入口、`ctrl` 辨身份、`ALU` 报溢出、`CP0` 管状态并拉起 `Req`、顶层做优先级仲裁并一键断电写使能、`NPC` 负责抢救跳转。只要把每个模块新增信号的边界和 `wire` 位宽守住，单周期异常处理其实稳如老狗！

