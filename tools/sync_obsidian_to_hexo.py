#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_obsidian_to_hexo.py
========================
Automated synchronizer from Obsidian Vault to Hexo + Butterfly blog.

Features:
1. Frontmatter Filter: Only notes with `publish: true` (or `published: true`) are published.
2. Metadata Enrichment:
   - title: from frontmatter > first `# H1` > filename
   - date: from frontmatter > file ctime
   - updated: from frontmatter > file mtime
   - categories: from frontmatter > folder hierarchy
   - tags: from frontmatter > inline `#tag`
   - permalink: preserved or auto-generated
   - description: from frontmatter > first 150 chars
3. Asset & Image Management:
   - Finds local image references `![](...)` and `![[...]]`
   - Copies referenced images to Hexo companion asset folder `source/_posts/<slug>/`
   - Rewrites markdown image paths to clean relative paths
4. Obsidian Syntax Translation:
   - Callouts `> [!tip] Title` -> Hexo container `::: tip Title`
   - Wikilinks `[[Note|Label]]` -> link if published, plain text if private
   - Comments `%% ... %%` -> stripped
5. Cache & Unpublish Cleanup:
   - Tracks synced notes in `.sync_cache.json`
   - Automatically removes Hexo posts and asset folders if note is deleted or set to publish: false
6. Git Automation:
   - Auto commits changes in Hexo repo
   - Auto pushes to GitHub to trigger GitHub Actions deployment
"""

import os
import sys
import re
import json
import yaml
import shutil
import hashlib
import argparse
import subprocess
import urllib.parse
from pathlib import Path
from datetime import datetime

# Callout type mapping from Obsidian to Hexo container
CALLOUT_MAP = {
    'note': 'note',
    'abstract': 'note',
    'summary': 'note',
    'tldr': 'note',
    'info': 'info',
    'todo': 'info',
    'tip': 'tip',
    'hint': 'tip',
    'important': 'tip',
    'success': 'tip',
    'check': 'tip',
    'done': 'tip',
    'question': 'info',
    'help': 'info',
    'faq': 'info',
    'warning': 'warning',
    'caution': 'warning',
    'attention': 'warning',
    'failure': 'danger',
    'fail': 'danger',
    'missing': 'danger',
    'danger': 'danger',
    'error': 'danger',
    'bug': 'danger',
    'example': 'note',
    'quote': 'note',
    'cite': 'note',
}

def load_config(config_path: Path) -> dict:
    default_config = {
        "vault_path": r"D:\My-Knowledge-Vault",
        "hexo_posts_path": r"source\_posts",
        "publish_flag": "publish",
        "ignored_folders": [".obsidian", ".trash", ".trash_backup", ".git"],
        "auto_git_commit": True,
        "auto_git_push": True,
        "convert_callouts": True,
        "convert_wikilinks": True,
        "clean_unreferenced_assets": True
    }
    if config_path.exists():
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                user_config = json.load(f)
                default_config.update(user_config)
        except Exception as e:
            print(f"[WARN] Failed to read {config_path}: {e}. Using defaults.")
    return default_config

def load_cache(cache_path: Path) -> dict:
    if cache_path.exists():
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {"notes": {}}
    return {"notes": {}}

def save_cache(cache_path: Path, cache: dict):
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

def calculate_sha256(content: str) -> str:
    return hashlib.sha256(content.encode('utf-8')).hexdigest()

def parse_frontmatter(content: str):
    """
    Split frontmatter and body.
    Returns (frontmatter_dict, body_text)
    """
    if not content.startswith('---'):
        return {}, content

    # Find the closing ---
    match = re.match(r'^---\r?\n(.*?)\r?\n---\r?\n(.*)$', content, re.DOTALL)
    if not match:
        return {}, content

    fm_raw, body = match.group(1), match.group(2)
    try:
        data = yaml.safe_load(fm_raw)
        if isinstance(data, dict):
            return data, body
        return {}, content
    except Exception as e:
        print(f"[WARN] Error parsing YAML frontmatter: {e}")
        return {}, content

def is_published(fm: dict, publish_flag: str) -> bool:
    val = fm.get(publish_flag)
    if val is None:
        # Also check alternative common keys
        val = fm.get('published') or fm.get('blog')
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        return val != 0
    if isinstance(val, str):
        return val.strip().lower() in ('true', 'yes', '1', 'on')
    return False

def clean_slug(text: str) -> str:
    """Produce a safe filename slug"""
    clean = re.sub(r'[\\/*?:"<>|]', '', text)
    clean = clean.strip().replace(' ', '-')
    return clean

def extract_h1_title(body: str):
    """If body starts with an H1 (# Title), extract it and remove it from body"""
    match = re.search(r'^\s*#\s+([^\r\n]+)\r?\n', body)
    if match:
        title = match.group(1).strip()
        # Remove the first H1 line so it won't duplicate with Hexo's post title
        new_body = body[:match.start()] + body[match.end():]
        return title, new_body
    return None, body

def convert_callouts(body: str) -> str:
    """
    Convert Obsidian callout blocks:
    > [!type] Optional Title
    > Content
    to Hexo container:
    ::: type Optional Title
    Content
    :::
    """
    lines = body.split('\n')
    output = []
    in_callout = False
    callout_type = ''
    callout_title = ''

    i = 0
    callout_header_regex = re.compile(r'^\s*>\s*\[!([a-zA-Z0-9_-]+)\][+-]?(?:\s+(.*))?$')

    while i < len(lines):
        line = lines[i]
        header_match = callout_header_regex.match(line)
        if header_match:
            # If already in a callout, close it
            if in_callout:
                output.append(':::')
                in_callout = False

            raw_type = header_match.group(1).lower()
            callout_title = (header_match.group(2) or '').strip()
            callout_type = CALLOUT_MAP.get(raw_type, 'note')
            
            if callout_title:
                output.append(f'::: {callout_type} {callout_title}')
            else:
                output.append(f'::: {callout_type}')
            in_callout = True
            i += 1
            continue

        if in_callout:
            # Check if this line is still part of the blockquote
            if line.startswith('>') or line.startswith(' >'):
                # Strip leading '>' and optional space
                stripped = re.sub(r'^\s*>\s?', '', line)
                output.append(stripped)
                i += 1
                continue
            else:
                # End of callout
                output.append(':::')
                in_callout = False
                # Proceed to process current line normally
                output.append(line)
                i += 1
                continue

        output.append(line)
        i += 1

    if in_callout:
        output.append(':::')

    return '\n'.join(output)

def find_asset_file(image_ref: str, note_path: Path, vault_path: Path) -> Path:
    """
    Locate an image/asset referenced in note.
    Checks:
    1. note_dir / image_ref
    2. note_dir / "assets" / image_ref
    3. vault_path / "assets" / image_ref
    4. Substrings in note_dir / "assets"
    5. Recursive search in vault if not found
    """
    clean_ref = urllib.parse.unquote(image_ref).replace('\\', '/')
    base_name = Path(clean_ref).name
    note_dir = note_path.parent

    candidates = [
        note_dir / clean_ref,
        note_dir / "assets" / base_name,
        note_dir / base_name,
        vault_path / "assets" / base_name,
        vault_path / clean_ref
    ]

    for cand in candidates:
        if cand.is_file():
            return cand

    # If still not found, search in note_dir's assets folder recursively
    assets_dir = note_dir / "assets"
    if assets_dir.is_dir():
        for f in assets_dir.rglob(base_name):
            if f.is_file():
                return f

    # Vault-wide search as fallback
    for f in vault_path.rglob(base_name):
        if f.is_file() and not any(part in f.parts for part in ['.obsidian', '.git', '.trash']):
            return f

    return None

def process_images_and_links(body: str, note_path: Path, vault_path: Path,
                             dest_asset_dir: Path, published_map: dict) -> tuple:
    """
    Process:
    1. Remove Obsidian comments %%...%%
    2. Copy referenced images to dest_asset_dir and rewrite image links
    3. Process wikilinks [[Target|Label]]: link if published, plain text if private
    """
    # 1. Strip comments
    body = re.sub(r'%%.*?%%', '', body, flags=re.DOTALL)

    copied_assets = set()

    # 2. Process Wikilink Images: ![[image.png]] or ![[image.png|width]]
    def replace_wikilink_image(match):
        inner = match.group(1).strip()
        parts = inner.split('|')
        raw_target = parts[0].strip()
        width = parts[1].strip() if len(parts) > 1 else None

        asset_file = find_asset_file(raw_target, note_path, vault_path)
        if asset_file:
            dest_asset_dir.mkdir(parents=True, exist_ok=True)
            # Create a clean safe filename without spaces
            clean_name = re.sub(r'\s+', '-', asset_file.name)
            target_path = dest_asset_dir / clean_name
            shutil.copy2(asset_file, target_path)
            copied_assets.add(clean_name)

            if width:
                return f'<img src="{clean_name}" alt="{clean_name}" width="{width}" />'
            else:
                return f'![{clean_name}]({clean_name})'
        else:
            print(f"[WARN] Asset not found in note {note_path.name}: {raw_target}")
            return match.group(0)

    body = re.sub(r'!\[\[(.*?)\]\]', replace_wikilink_image, body)

    # 3. Process Standard Markdown Images: ![caption](path)
    def replace_standard_image(match):
        caption = match.group(1)
        raw_target = match.group(2).strip()

        # If it's a web link, keep as is
        if raw_target.startswith('http://') or raw_target.startswith('https://') or raw_target.startswith('//'):
            return match.group(0)

        asset_file = find_asset_file(raw_target, note_path, vault_path)
        if asset_file:
            dest_asset_dir.mkdir(parents=True, exist_ok=True)
            clean_name = re.sub(r'\s+', '-', asset_file.name)
            target_path = dest_asset_dir / clean_name
            shutil.copy2(asset_file, target_path)
            copied_assets.add(clean_name)
            return f'![{caption}]({clean_name})'
        else:
            print(f"[WARN] Image file not found: {raw_target} in {note_path.name}")
            return match.group(0)

    body = re.sub(r'!\[(.*?)\]\((.*?)\)', replace_standard_image, body)

    # 4. Process Wikilinks: [[Target Note]] or [[Target Note|Display Text]]
    def replace_wikilink(match):
        inner = match.group(1).strip()
        parts = inner.split('|')
        target = parts[0].strip()
        display = parts[1].strip() if len(parts) > 1 else target

        # Separate heading anchor if any: Target#Heading
        heading = ''
        if '#' in target:
            target, heading = target.split('#', 1)
            heading = '#' + clean_slug(heading)

        # Check if target note is published
        clean_target = Path(target).stem
        if clean_target in published_map:
            pub_info = published_map[clean_target]
            slug = pub_info.get('permalink') or pub_info.get('slug')
            return f'[{display}](/posts/{slug}/{heading})'
        else:
            # Private note or external: strip link to plain text
            return display

    # Negative lookbehind to avoid matching ![[...]]
    body = re.sub(r'(?<!!)\[\[(.*?)\]\]', replace_wikilink, body)

    return body, copied_assets

def generate_description(body: str, max_len: int = 150) -> str:
    """Extract first non-empty paragraph as summary description"""
    lines = body.split('\n')
    desc = ''
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#') or line.startswith(':::') or line.startswith('!['):
            continue
        desc = line
        break
    # Strip basic markdown markers
    desc = re.sub(r'[*_`~[\]]', '', desc)
    if len(desc) > max_len:
        desc = desc[:max_len] + '...'
    return desc

def sync(dry_run: bool = False, no_push: bool = False, force: bool = False):
    root_dir = Path(__file__).resolve().parent.parent
    config_path = root_dir / "sync_config.json"
    config = load_config(config_path)

    vault_path = Path(config["vault_path"])
    hexo_posts_path = root_dir / config["hexo_posts_path"]
    publish_flag = config.get("publish_flag", "publish")
    ignored_folders = set(config.get("ignored_folders", []))

    cache_path = root_dir / ".sync_cache.json"
    cache = load_cache(cache_path)
    cached_notes = cache.get("notes", {})

    if not vault_path.is_dir():
        print(f"[ERROR] Obsidian Vault path does not exist: {vault_path}")
        sys.exit(1)

    print("==================================================")
    print("   Obsidian -> Hexo & Butterfly Auto Synchronizer  ")
    print(f"   Vault: {vault_path}")
    print(f"   Hexo:  {hexo_posts_path}")
    print(f"   Mode:  {'DRY-RUN (Simulated)' if dry_run else 'ACTIVE'}")
    print("==================================================")

    # Pass 1: Discover all published notes across the vault
    all_vault_mds = []
    for root, dirs, files in os.walk(vault_path):
        dirs[:] = [d for d in dirs if d not in ignored_folders and not d.startswith('.')]
        for file in files:
            if file.endswith('.md'):
                all_vault_mds.append(Path(root) / file)

    published_notes = []
    published_map = {}

    for md_path in all_vault_mds:
        try:
            with open(md_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            continue

        fm, body = parse_frontmatter(content)
        if is_published(fm, publish_flag):
            rel_path = md_path.relative_to(vault_path)
            note_stem = md_path.stem
            custom_permalink = fm.get('permalink') or fm.get('abbrlink')
            slug = custom_permalink or clean_slug(note_stem)
            pub_info = {
                "path": md_path,
                "rel_path": str(rel_path),
                "stem": note_stem,
                "fm": fm,
                "body": body,
                "content": content,
                "slug": slug,
                "permalink": custom_permalink
            }
            published_notes.append(pub_info)
            published_map[note_stem] = pub_info

    print(f"[SCAN] Found {len(all_vault_mds)} notes in vault. {len(published_notes)} marked with '{publish_flag}: true'.")

    # Pass 2: Detect unpublish / deleted notes from previous syncs
    current_rel_paths = {p["rel_path"] for p in published_notes}
    unpublish_list = []
    for rel_path, c_info in list(cached_notes.items()):
        if rel_path not in current_rel_paths:
            unpublish_list.append((rel_path, c_info))

    for rel_path, c_info in unpublish_list:
        post_file = root_dir / c_info.get("hexo_file", "")
        asset_dir = root_dir / c_info.get("hexo_asset_dir", "")
        print(f"[UNPUBLISH] Removing previously published note: {rel_path}")
        if not dry_run:
            if post_file.is_file():
                post_file.unlink()
                print(f"  - Deleted {post_file}")
            if asset_dir.is_dir():
                shutil.rmtree(asset_dir)
                print(f"  - Deleted asset folder {asset_dir}")
            del cached_notes[rel_path]

    # Pass 3: Sync each published note
    sync_count = 0
    skip_count = 0

    for note in published_notes:
        md_path = note["path"]
        rel_path = note["rel_path"]
        fm = note["fm"].copy()
        body = note["body"]
        note_stem = note["stem"]
        slug = note["slug"]

        # Content hash check for fast incremental skipping
        content_hash = calculate_sha256(note["content"])
        if not force and rel_path in cached_notes and cached_notes[rel_path].get("sha256") == content_hash:
            # Check if hexo file still exists
            expected_hexo_file = root_dir / cached_notes[rel_path].get("hexo_file", "")
            if expected_hexo_file.exists():
                skip_count += 1
                continue

        print(f"[SYNC] Processing: {rel_path} -> slug: {slug}")

        # Title: Frontmatter > H1 in body > Note filename
        if 'title' not in fm:
            extracted_title, body = extract_h1_title(body)
            fm['title'] = extracted_title or note_stem

        # Date & Updated
        stat = md_path.stat()
        if 'date' not in fm:
            fm['date'] = datetime.fromtimestamp(stat.st_ctime).strftime('%Y-%m-%d %H:%M:%S')
        if 'updated' not in fm:
            fm['updated'] = datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')

        # Categories: derive from vault directory path if not provided
        if 'categories' not in fm:
            parent_parts = [p for p in md_path.relative_to(vault_path).parent.parts if p]
            # Clean numbered prefix (e.g. "01-基本概念" -> "01-基本概念")
            if parent_parts:
                fm['categories'] = list(parent_parts)

        # Tags: parse inline #tag if tags not in frontmatter
        if 'tags' not in fm:
            inline_tags = set(re.findall(r'(?:^|\s)#([\w\u4e00-\u9fa5]+)(?=\s|$)', body))
            if inline_tags:
                fm['tags'] = list(inline_tags)

        # Permalink: keep or assign
        if 'permalink' not in fm:
            fm['permalink'] = slug

        # Description: fallback
        if 'description' not in fm:
            desc = generate_description(body)
            if desc:
                fm['description'] = desc

        # Target destinations
        dest_md_filename = f"{clean_slug(note_stem)}.md"
        dest_md_file = hexo_posts_path / dest_md_filename
        dest_asset_dir = hexo_posts_path / clean_slug(note_stem)

        # Syntax conversion
        if config.get("convert_callouts", True):
            body = convert_callouts(body)

        body, copied_assets = process_images_and_links(
            body, md_path, vault_path, dest_asset_dir, published_map
        )

        # Construct new frontmatter string
        # Clean internal publish flag if desired or keep it
        frontmatter_str = yaml.dump(fm, allow_unicode=True, default_flow_style=False, sort_keys=False)
        final_content = f"---\n{frontmatter_str}---\n\n{body.lstrip()}\n"

        if not dry_run:
            hexo_posts_path.mkdir(parents=True, exist_ok=True)
            with open(dest_md_file, 'w', encoding='utf-8') as f:
                f.write(final_content)

            # Update cache
            rel_hexo_file = str(dest_md_file.relative_to(root_dir))
            rel_asset_dir = str(dest_asset_dir.relative_to(root_dir)) if dest_asset_dir.exists() else ""
            cached_notes[rel_path] = {
                "sha256": content_hash,
                "hexo_file": rel_hexo_file,
                "hexo_asset_dir": rel_asset_dir,
                "assets": list(copied_assets),
                "synced_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }

        sync_count += 1

    if not dry_run:
        save_cache(cache_path, {"notes": cached_notes})

    print(f"\n[SUMMARY] Synced: {sync_count}, Skipped (unchanged): {skip_count}, Unbound/Removed: {len(unpublish_list)}")

    # Pass 4: Git Commit & Push
    if dry_run:
        print("[DRY-RUN] Finished simulation. No files written and no Git push performed.")
        return

    if config.get("auto_git_commit", True):
        # Check git status
        try:
            status_res = subprocess.run(
                ["git", "status", "--porcelain", "source/_posts"],
                cwd=str(root_dir),
                capture_output=True,
                text=True,
                check=True
            )
            changes = status_res.stdout.strip()
            if not changes:
                print("[GIT] No changes in source/_posts. Nothing to commit.")
                return

            print("[GIT] Changes detected in source/_posts. Committing...")
            subprocess.run(["git", "add", "source/_posts"], cwd=str(root_dir), check=True)
            
            commit_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            commit_msg = f"content: sync notes from Obsidian [{commit_time}]"
            subprocess.run(["git", "commit", "-m", commit_msg], cwd=str(root_dir), check=True)
            print(f"[GIT] Committed: '{commit_msg}'")

            if config.get("auto_git_push", True) and not no_push:
                print("[GIT] Pushing to origin/main...")
                push_res = subprocess.run(["git", "push", "origin", "main"], cwd=str(root_dir), capture_output=True, text=True)
                if push_res.returncode == 0:
                    print("==================================================")
                    print(" [SUCCESS] Successfully pushed to GitHub main branch!")
                    print(" GitHub Actions will automatically deploy to GitHub Pages.")
                    print(" Website: https://xingyuliu456.github.io")
                    print("==================================================")
                else:
                    print(f"[ERROR] git push failed: {push_res.stderr}")
            else:
                print("[GIT] Auto push is disabled or --no-push was passed. Skipped push.")
        except Exception as e:
            print(f"[ERROR] Git operation error: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Sync Obsidian notes to Hexo & Butterfly blog")
    parser.add_argument('--dry-run', action='store_true', help="Simulate sync without modifying files or git push")
    parser.add_argument('--no-push', action='store_true', help="Sync files locally but do not git push")
    parser.add_argument('--force', action='store_true', help="Force sync all published notes ignoring cache")
    args = parser.parse_args()

    sync(dry_run=args.dry_run, no_push=args.no_push, force=args.force)
