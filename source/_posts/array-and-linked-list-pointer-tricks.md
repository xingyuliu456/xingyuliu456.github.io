---
title: 顺序表与链表经典题：六道题背后的指针思维
date: 2026-11-06 21:30:00
categories:
  - 算法与数据结构
tags:
  - 顺序表
  - 链表
  - 数据结构
cover: https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=2560&q=85
description: 移除元素、合并有序数组、反转链表、中间结点、回文链表、相交链表。六道题背后是同一件事：顺序表怕"挪"，链表怕"回头"，而多指针正是绕开这两种限制的工具。文中附可交互的逐步演示。
---

<link rel="stylesheet" href="{% asset_path algo-viz.css %}">

这六道题单独看都不难，放在一起看却有一条清晰的主线：

- **顺序表**能随机访问，但插入、删除要整体挪动元素，单次代价 O(N)；
- **单链表**插入、删除只需改指针，但只能单向往后走，既不能回头，也不知道自己有多长。

几乎所有技巧都在回答同一个问题：**怎样在不付出这些代价的前提下完成任务？** 答案是多指针，让每个指针各管一件事。

| 题目 | 卡点 | 破局手法 | 时间 / 空间 |
| --- | --- | --- | --- |
| 27. 移除元素 | 删除要挪动后续元素 | 读写分离的同向双指针 | O(N) / O(1) |
| 88. 合并两个有序数组 | 从前往后写会覆盖未读数据 | 从后往前的三指针 | O(m+n) / O(1) |
| 206. 反转链表 | 改了 next 就丢了后继 | prev / cur / next 三指针 | O(N) / O(1) |
| 876. 链表的中间结点 | 不知道链表长度 | 快慢指针 | O(N) / O(1) |
| 链表的回文结构 | 单链表无法从尾往回走 | 找中点 + 反转后半 + 双向比较 | O(N) / O(1) |
| 160. 相交链表 | 两链表长度不同，无法同步 | 先对齐长度差，再同步前进 | O(m+n) / O(1) |

{% note info flat %}
文中的演示都可以交互：修改输入后点「应用」或「随机」，用 ◀ / ▶| 按钮（或点击演示区后按键盘 ← →、空格）单步执行，下方代码会同步高亮当前行。
{% endnote %}

## 一、移除元素：不要"删"，要"留"

> [27. 移除元素](https://leetcode.cn/problems/remove-element/description/)：原地移除数组中所有等于 `val` 的元素，返回剩余元素个数 k，要求数组前 k 个位置是保留下来的元素。

### 卡点

直觉做法是"遇到 val 就删掉"。可顺序表每删一个元素，都要把它后面的元素整体前移一位，最坏情况下（比如全是 val）总代价 O(N²)。

Python 的 `pop` 写起来很短，倒序遍历也顺带解决了"删除后下标错位"的问题：

```python
for i in range(len(nums) - 1, -1, -1):
    if nums[i] == val:
        nums.pop(i)
```

但 `pop(i)` 底层同样要挪动 `i` 之后的所有元素，只是把 O(N²) 藏进了库函数里。

### 思路：读写分离

题目只关心前 k 个位置的内容，并没有要求真的"删除"。所以可以把"删掉坏的"换成"把好的留下来"：

- `right` 是**读指针**，逐个扫描每个元素；
- `left` 是**写指针**，指向下一个保留元素该放的位置。

遇到不等于 val 的元素，就把它写到 `left` 处，然后 `left` 后移；否则只有 `right` 前进。整个过程维持一个不变式：**`[0, left)` 始终是已保留的元素**。扫描结束时，`left` 就是答案 k。

<div class="algo-viz" data-viz="remove"></div>

```c
// 下标写法
int left = 0;
for (int right = 0; right < numsSize; right++)
    if (nums[right] != val)
        nums[left++] = nums[right];
return left;

// 等价的 C 指针写法：指针相减即为写入的元素个数
int *left = nums, *right = nums;
for (int i = 0; i < numsSize; i++, right++)
    if (*right != val)
        *left++ = *right;
return left - nums;
```

每个元素最多被读一次、写一次，O(N) 时间、O(1) 空间。另外，`left ≤ right` 恒成立，所以写操作永远只会落在**已经读过**的位置上，不会覆盖未读数据。下一题的关键也是这一点。

## 二、合并两个有序数组：从后往前写

> [88. 合并两个有序数组](https://leetcode.cn/problems/merge-sorted-array/)：`nums1` 长度为 m + n，前 m 个是有效元素，后 n 个是 0 占位；`nums2` 有 n 个元素。两者均为非递减，要求把 `nums2` 原地合并进 `nums1` 并保持有序。

### 三种思路的演进

1. **拼接后排序**：`memcpy` 到 `nums1` 尾部再 `qsort`，O((m+n)log(m+n))。"两个数组本来就有序"这个条件完全没用上。
2. **从前往后双指针**：每次取较小者写进 `nums1` 前部。问题在于 `nums1` 前部存的是**还没读过**的数据，一旦写入 `nums2` 的元素，就会把它覆盖掉。
3. **从后往前三指针**：`nums1` 的尾部是空位，往那里写不会破坏任何数据。每次比较两段的末尾，把**较大者**写到 `nums1` 末尾。

下面的演示默认是从后往前；切换到「从前往后」，可以看到数据被覆盖的那一步。

<div class="algo-viz" data-viz="merge"></div>

### 为什么从后往前一定不会覆盖？

设 `i`、`j` 分别指向 `nums1`、`nums2` 中待处理的最后一个元素，`k` 指向下一个写入位置。初始时 k = m + n − 1 = i + j + 1；之后每写一次，`k` 和 `i`、`j` 中的一个同时减 1。因此始终有：

**k − i = j + 1**

只要 `nums2` 还有元素没处理（j ≥ 0），就有 k > i，写指针永远在 `nums1` 未读区的右边。等到 j < 0 时 k == i，`nums1` 剩下的元素已经待在正确的位置上了。

```c
int i = m - 1, j = n - 1, k = m + n - 1;
while (i >= 0 && j >= 0)
    nums1[k--] = (nums1[i] > nums2[j]) ? nums1[i--] : nums2[j--];
while (j >= 0)              // 只需补上 nums2 的剩余部分
    nums1[k--] = nums2[j--];
```

收尾只有一种情况需要处理：`nums2` 没拷完就接着拷；`nums1` 没拷完则什么都不用做，这就是上面 k == i 的含义。

{% note warning flat %}
如果用指针写法 `int *p1 = &nums1[m - 1];`，要注意 m = 0 时它指向数组起点之前，循环里 `p1--` 也会越过起点。C 标准只允许指针指向数组内部或"末尾后一个"位置，越过起点属于未定义行为。OJ 上通常能过，但用下标写法可以彻底避开这个问题。
{% endnote %}

## 三、反转链表：改指针之前，先存后继

> [206. 反转链表](https://leetcode.cn/problems/reverse-linked-list/description/)：给定单链表的头节点 `head`，反转链表并返回新的头节点。

### 卡点

数组反转可以首尾交换，单链表却既不能随机访问，也不能从尾往回走。新建一个链表、依次头插原链表的值可以做到，但要额外开 O(N) 个节点。

如果想原地把每个节点的 `next` 掉个头，难点在于：**一旦执行 `cur->next = prev`，cur 原来的后继就丢了**，剩下的链表再也找不回来。所以在修改之前，必须先把后继存下来。

### 思路：三指针各司其职

| 指针 | 职责 |
| --- | --- |
| `prev` | 已反转部分的头。初始为 NULL，它就是新链表的尾 |
| `cur` | 当前要掉头的节点 |
| `next` | 提前保存的 cur 的后继，防止断链 |

每一轮四步：**存后继 → 掉头 → prev 前进 → cur 前进**。cur 变成 NULL 时，prev 恰好是新链表的头。

<div class="algo-viz" data-viz="reverse"></div>

```c
struct ListNode *prev = NULL, *cur = head;
while (cur) {
    struct ListNode *next = cur->next; // ① 先存后继
    cur->next = prev;                  // ② 掉头
    prev = cur;                        // ③ prev 前进
    cur = next;                        // ④ cur 前进
}
return prev;
```

### 一个容易踩的坑：next 放在哪里取

如果在循环外初始化 `pnext`，再在循环末尾推进它：

```c
pnext = pcur->next;                  // head 为 NULL 时这里就崩了
while (pcur) {
    pcur->next = prev;
    prev = pcur;
    pcur = pnext;
    if (pnext) pnext = pnext->next;  // 最后一轮 pnext 已是 NULL
}
```

这样就得补两处判空：head 为空时要特判，最后一轮 `pnext` 已经是 NULL 时也不能再取 `->next`。把"存后继"挪到循环体第一行，问题就没了：能进入循环说明 cur 非空，`cur->next` 永远合法，两处判空也就都不需要了。

{% note info flat %}
"头插到新链表"如果是把**原节点**摘下来头插，而不是新建节点，那么额外空间只有 O(1)。展开写出来，代码和三指针法完全一样，prev 就是"新链表的头"。两种思路本质上是同一个算法。
{% endnote %}

## 四、链表的中间结点：快慢指针

> [876. 链表的中间结点](https://leetcode.cn/problems/middle-of-the-linked-list/description/)：返回单链表的中间结点；如果有两个中间结点，返回第二个。

### 卡点

数组取中点只要 O(1) 的 `n / 2`。链表则要先遍历一遍求长度，再走一半。能不能只遍历一次？

### 思路

让 `fast` 每次走两步，`slow` 每次走一步。fast 走到末尾时走了 2t 步，slow 正好走了 t 步，停在中间。

| 链表 | fast 停在 | slow 停在 |
| --- | --- | --- |
| 奇数个：1→2→3→4→5 | 尾节点 5（`fast->next` 为 NULL） | 3，正中间 |
| 偶数个：1→2→3→4→5→6 | NULL | 4，即第二个中间结点 |

点击上方「奇数长度 / 偶数长度」按钮，可以对比两种情况下 `fast` 的终止位置：

<div class="algo-viz" data-viz="middle"></div>

```c
struct ListNode *slow = head, *fast = head;
while (fast && fast->next) {   // 两个条件的顺序不能交换
    slow = slow->next;
    fast = fast->next->next;
}
return slow;
```

循环条件依赖 `&&` 的**短路求值**：fast 为 NULL 时不会再计算 `fast->next`。如果交换顺序，偶数长度的链表最后一步会对空指针解引用。

## 五、链表的回文结构：前两题的组合

> [链表的回文结构](https://www.nowcoder.com/practice/d281619e4b3e4a60a2cc66ea32855bfa)（牛客）：判断单链表是否为回文结构，要求时间复杂度 O(n)、额外空间复杂度 O(1)。

### 卡点

数组判断回文，首尾两个指针相向而行就行。单链表的指针只能往后走，尾指针没法往回退；把值拷进数组再判断又需要 O(n) 空间，不满足要求。

### 思路：把后半段掉个头

尾指针不能往回走，那就把后半段链表反转，让它变成一条"从尾走向中间"的链：

1. 用**快慢指针**找到中间结点 mid（第四题）；
2. **反转**从 mid 开始的后半段（第三题）；
3. p1 从原链表头、p2 从反转后的头同时出发，逐个比较 `val`。

<div class="algo-viz" data-viz="palindrome"></div>

```c
bool chkPalindrome(ListNode* A) {
    ListNode* mid = middleNode(A);     // 第四题
    ListNode* p2  = reverseList(mid);  // 第三题
    ListNode* p1  = A;
    while (p1 && p2) {
        if (p1->val != p2->val) return false;
        p1 = p1->next;
        p2 = p2->next;
    }
    return true;
}
```

### 为什么奇偶长度都不用特判？

关键在于反转之后链表的形状：前半段最后一个节点的 `next` **仍然指向 mid**，而 mid 成了反转链的尾巴（指向 NULL）。

- 偶数 `1→2→2→1`：p1 依次经过 `1, 2, 2(mid)`，p2 依次经过 `1, 2(mid)`。p2 先走到 NULL，比较结束。
- 奇数 `1→2→3→2→1`：p1、p2 都经过 `1, 2, 3(mid)`，最后一次是 mid 和自己比较，必然相等。

两条链最终都汇聚到 mid，所以一个 `while (p1 && p2)` 就同时覆盖了两种情况。

{% note warning flat %}
这个做法会修改原链表。如果调用方之后还要使用这个链表，比较结束后应当把后半段再反转一次，恢复原状。
{% endnote %}

## 六、相交链表：先对齐，再同步

> [160. 相交链表](https://leetcode.cn/problems/intersection-of-two-linked-lists/description/)：找出两个单链表相交的起始节点；如果不相交，返回 NULL。

### 先想清楚：相交长什么样？

每个节点只有一个 `next`，所以两条链表一旦在某个节点汇合，之后就共用同一条尾巴，形状是 **Y 型**。X 型不可能出现，因为它要求交点同时指向两个后继。

这个结构直接给出两个推论：

1. **判断是否相交**：只需看两个尾节点是不是同一个节点。比较的是地址，不是值。
2. **找交点**：交点之后的部分是共用的，所以两条链表的长度差全部来自交点之前。让长链表的指针先走 |lenA − lenB| 步，两个指针离交点的距离就相等了；之后同步前进，第一次指向同一个节点的地方就是交点。

<div class="algo-viz" data-viz="intersect"></div>

```c
// ① 走到尾，顺便计数（题目保证链表非空）
ListNode *curA = headA, *curB = headB;
int lenA = 1, lenB = 1;
while (curA->next) { curA = curA->next; lenA++; }
while (curB->next) { curB = curB->next; lenB++; }
if (curA != curB) return NULL;          // 尾节点不同，必不相交

// ② 假设法：先假设 A 更长，假设错了再交换，避免写两套分支
ListNode *longL = headA, *shortL = headB;
if (lenA < lenB) { longL = headB; shortL = headA; }
for (int gap = abs(lenA - lenB); gap > 0; gap--)
    longL = longL->next;

// ③ 同步前进，第一次相遇即交点
while (longL != shortL) {
    longL = longL->next;
    shortL = shortL->next;
}
return longL;
```

### 另一种写法：走完自己的路，再走对方的路

设 A 独有部分长 a，B 独有部分长 b，公共部分长 c。指针 pA 走完 A 后跳到 B 的头，pB 走完 B 后跳到 A 的头。走到交点时，两者都恰好走了 a + c + b 步，必然同时到达。如果不相交，两者会在各走 a + b 步后同时变成 NULL，循环同样会结束。

```c
struct ListNode *pA = headA, *pB = headB;
while (pA != pB) {
    pA = pA ? pA->next : headB;
    pB = pB ? pB->next : headA;
}
return pA;
```

本质上还是"消除长度差"，只是把对齐的过程藏进了换道里。

## 总结

| 手法 | 代表题 | 绕开的限制 |
| --- | --- | --- |
| 同向读写双指针 | 移除元素 | 顺序表删除要挪动元素 |
| 从后往前写 | 合并有序数组 | 原地写入会覆盖未读数据 |
| 三指针改链 | 反转链表 | 修改 next 会丢失后继 |
| 快慢指针 | 中间结点、回文链表 | 不知道链表长度 |
| 对齐指针 | 相交链表 | 两条链表长度不同 |

写这类题时，有三个问题值得每次都问一遍自己：

1. **这个结构怕什么？** 顺序表怕挪动，链表怕断链、怕回头。技巧都是围绕这些限制设计的。
2. **每个指针负责什么，不变式是什么？** 比如 `[0, left)` 是保留区、`k − i = j + 1`。不变式说得清楚，代码就不容易写错。
3. **哪里可能解引用空指针？** `fast->next`、`pnext->next`、`curA->next`，链表题的 bug 大多出在这几个地方。

<script src="{% asset_path algo-viz.js %}"></script>
