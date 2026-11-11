---
title: git操作
publish: true
permalink: git-operation
categories:
- git
tags:
- git
- 命令行
cover: https://images.unsplash.com/photo-1788104317221-e85195344eb2?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D
description: 介绍了基本的git操作
date: 2026-11-11 21:31:15
update: 2026-11-11 21:31:15
updated: '2026-11-11 21:32:54'
---

### Git 核心心智模型与常用命令速查

Git 的核心设计是**快照流**与**指针移动**。分支本质上只是一个指向特定提交（Commit）的轻量级可移动指针（41 字节的文本文件），创建和切换分支开销极小。

```
工作区 (Working Dir)  ──git add──>  暂存区 (Staging Area)  ──git commit──>  本地版本库 (HEAD)  ──git push──>  远程仓库 (Gitee/GitHub)
```

#### 1. 基础工作流

- `git status`：查看工作区与暂存区状态（最高频命令）。
    
- `git add <file>`：将文件修改加入暂存区（`git add .` 暂存所有改动）。
    
- `git commit -m "提交信息"`：将暂存区内容固化为一个不可篡改的快照版本。
    
- `git log --oneline --graph --all`：以 ASCII 字符图形式查看所有分支的演进拓扑图。
    
- `git diff`：对比工作区与暂存区的差异。
    

#### 2. 分支管理（隔离开发的核心）

- `git branch`：列出本地所有分支（带 `*` 号为当前所在分支）。
    
- `git branch <branch-name>`：基于当前提交创建新分支。
    
- `git checkout -b <branch-name>`（新语法：`git switch -c <branch-name>`）：创建并立即切换到新分支。
    
- `git checkout <branch-name>`（新语法：`git switch <branch-name>`）：切换分支。
    
- `git merge <branch-name>`：将指定分支合并到当前所在分支。
    
- `git branch -d <branch-name>`：删除已被合并的分支（强制删除未合并分支用 `-D`）。
    

#### 3. 远程协作与状态恢复

| 命令                       | 作用                           |
| ------------------------ | ---------------------------- |
| `git remote`             | 列出所有远程仓库名                    |
| `git remote -v`          | 列出远程仓库名 + 对应 URL（fetch/push） |
| `git remote show <name>` | 查看某远程仓库详细信息（分支、跟踪关系等）        |


|命令|作用|
|---|---|
|`git remote add <name> <url>`|添加一个远程仓库，如 `git remote add origin <url>`|
|`git remote remove <name>`|删除远程仓库（别名 `rm`）|
|`git remote rename <old> <new>`|重命名远程仓库|


| 命令                                       | 作用                                 |
| ---------------------------------------- | ---------------------------------- |
| `git remote set-url <name> <new-url>`    | 修改远程仓库 URL                         |
| `git remote set-url --push <name> <url>` | 单独设置 push 用 URL（fetch/push 可用不同地址） |
    
- `git push -u origin <branch>`：推送到远程分支，`-u` 用于建立本地分支与远程分支的追踪关系。
    
- `git pull origin <branch>`：拉取远程分支并自动合并（等同于 `git fetch` + `git merge`）。
    
- `git restore <file>`：撤销工作区文件的未暂存改动。
    
- `git stash` / `git stash pop`：将当前未提交的改动临时压入存储区 / 恢复暂存。
