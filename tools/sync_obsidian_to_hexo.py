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
3. Transclusion / Note Embeds:
   - Expands embedded notes `![[note]]` and `![alt](relative/path/note.md)` into post body
4. Asset & Image Management:
   - Finds local image references `![](...)` and `![[...]]`
   - Copies referenced images to Hexo companion asset folder `source/_posts/<slug>/`
   - Rewrites markdown image paths to clean relative paths
5. Obsidian Syntax Translation:
   - Callouts `> [!tip] Title` -> Hexo container `::: tip Title`
   - Wikilinks `[[Note|Label]]` -> link if published, plain text if private
   - Comments `%% ... %%` -> stripped
6. Cache & Safe Unpublish Cleanup:
   - Tracks synced notes in `.sync_cache.json`
   - Strictly validates destination paths to prevent deleting unintended folders
   - Safely removes Hexo posts and asset folders if note is deleted or set to publish: false
7. Git Automation:
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

# Image file extensions
IMAGE_EXTS = ('.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico')

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
        "ignored_folders": [".obsidian", ".trash", ".trash_backup", ".git", "_templates", "templates"],
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

def calculate_file_sha256(file_path: Path) -> str:
    """Compute SHA-256 hex digest of a binary file."""
    hasher = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            hasher.update(chunk)
    return hasher.hexdigest()

def parse_frontmatter(content: str):
    """
    Split frontmatter and body.
    Returns (frontmatter_dict, body_text)
    """
    if not content.startswith('---'):
        return {}, content

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
        new_body = body[:match.start()] + body[match.end():]
        return title, new_body
    return None, body

def is_ignored_path(path: Path, vault_path: Path, ignored_folders: set) -> bool:
    """Return True if path resides inside any ignored or hidden dot-folder."""
    try:
        rel_parts = path.relative_to(vault_path).parts[:-1]
    except ValueError:
        return False
    return any(part in ignored_folders or part.startswith('.') for part in rel_parts)

def resolve_note_target(raw_target: str, note_path: Path, vault_path: Path, ignored_folders: set):
    """Resolve an embedded Markdown or Wikilink note target inside the vault."""
    clean_target = urllib.parse.unquote(raw_target).replace('\\', '/').strip()
    if '#' in clean_target:
        clean_target = clean_target.split('#', 1)[0].strip()
    if not clean_target:
        return None

    cand_name = clean_target if clean_target.lower().endswith(('.md', '.markdown')) else f"{clean_target}.md"
    cand = (note_path.parent / cand_name).resolve()
    if cand.is_file():
        return cand

    vault_cand = (vault_path / cand_name).resolve()
    if vault_cand.is_file():
        return vault_cand

    base = Path(cand_name).name
    for f in vault_path.rglob(base):
        if f.is_file() and not is_ignored_path(f, vault_path, ignored_folders):
            return f.resolve()
    return None

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
            if line.startswith('>') or line.startswith(' >'):
                stripped = re.sub(r'^\s*>\s?', '', line)
                output.append(stripped)
                i += 1
                continue
            else:
                output.append(':::')
                in_callout = False
                output.append(line)
                i += 1
                continue

        output.append(line)
        i += 1

    if in_callout:
        output.append(':::')

    return '\n'.join(output)

def find_asset_file(image_ref: str, note_path: Path, vault_path: Path, ignored_folders: set):
    """Locate an image/asset referenced in a note relative to that note's directory."""
    clean_ref = urllib.parse.unquote(image_ref).strip('<>').replace('\\', '/')
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
            return cand.resolve()

    assets_dir = note_dir / "assets"
    if assets_dir.is_dir():
        for f in assets_dir.rglob(base_name):
            if f.is_file():
                return f.resolve()

    for f in vault_path.rglob(base_name):
        if f.is_file() and not is_ignored_path(f, vault_path, ignored_folders):
            return f.resolve()

    return None

def register_asset(asset_file: Path, asset_ops: dict) -> str:
    """Register a local asset to be copied, disambiguating filename collisions."""
    resolved = asset_file.resolve()
    clean_name = re.sub(r'\s+', '-', resolved.name)

    if clean_name in asset_ops and asset_ops[clean_name] != resolved:
        short_hash = hashlib.sha256(str(resolved).encode('utf-8')).hexdigest()[:6]
        stem = Path(clean_name).stem
        suffix = Path(clean_name).suffix
        clean_name = f"{stem}-{short_hash}{suffix}"

    asset_ops[clean_name] = resolved
    return clean_name

def render_note_content(body: str, note_path: Path, vault_path: Path,
                        published_map: dict, ignored_folders: set,
                        convert_wikilinks: bool, deps: list, asset_ops: dict,
                        visited: set, depth: int = 0) -> str:
    """
    Recursively expand embedded notes and rewrite local images/wikilinks in-memory.
    Each note resolves relative assets against its own directory before splicing into parent.
    """
    body = re.sub(r'%%.*?%%', '', body, flags=re.DOTALL)
    embed_placeholders = {}

    def load_embed(cand: Path, fallback: str) -> str:
        resolved = cand.resolve()
        if depth >= 4 or resolved in visited:
            return fallback
        try:
            sub_text = resolved.read_text(encoding='utf-8')
        except Exception as e:
            print(f"[WARN] Failed to read embedded note {resolved}: {e}")
            return fallback

        if resolved not in deps:
            deps.append(resolved)
        _, sub_body = parse_frontmatter(sub_text)
        rendered = render_note_content(
            sub_body, resolved, vault_path, published_map, ignored_folders,
            convert_wikilinks, deps, asset_ops, visited | {resolved}, depth + 1
        )
        token = f"__OBSIDIAN_EMBED_TOKEN_{len(embed_placeholders)}__"
        embed_placeholders[token] = rendered
        return token

    # 1. Expand Markdown note embeds: ![alt](path/to/note.md)
    def replace_md_embed(match):
        raw_target = urllib.parse.unquote(match.group(2).strip()).replace('\\', '/')
        target_no_anchor = raw_target.split('#', 1)[0]
        if not target_no_anchor.lower().endswith(('.md', '.markdown')):
            return match.group(0)
        cand = resolve_note_target(raw_target, note_path, vault_path, ignored_folders)
        if cand:
            return load_embed(cand, match.group(0))
        return match.group(0)

    body = re.sub(r'!\[(.*?)\]\((.*?)\)', replace_md_embed, body)

    # 2. Expand Wikilink note embeds: ![[Note Name]] (when not an image)
    def replace_wikilink_embed(match):
        inner = match.group(1).strip()
        raw_target = inner.split('|', 1)[0].strip()
        target_no_anchor = raw_target.split('#', 1)[0].strip()
        if any(target_no_anchor.lower().endswith(ext) for ext in IMAGE_EXTS):
            return match.group(0)
        cand = resolve_note_target(raw_target, note_path, vault_path, ignored_folders)
        if cand:
            return load_embed(cand, match.group(0))
        return match.group(0)

    body = re.sub(r'!\[\[(.*?)\]\]', replace_wikilink_embed, body)

    # 3. Rewrite Wikilink images: ![[image.png]] or ![[image.png|width]]
    def replace_wikilink_image(match):
        inner = match.group(1).strip()
        parts = inner.split('|')
        raw_target = parts[0].strip()
        width = parts[1].strip() if len(parts) > 1 else None

        asset_file = find_asset_file(raw_target, note_path, vault_path, ignored_folders)
        if asset_file:
            clean_name = register_asset(asset_file, asset_ops)
            if width:
                return f'<img src="{clean_name}" alt="{clean_name}" width="{width}" />'
            return f'![{clean_name}]({clean_name})'
        print(f"[WARN] Asset not found in note {note_path.name}: {raw_target}")
        return match.group(0)

    body = re.sub(r'!\[\[(.*?)\]\]', replace_wikilink_image, body)

    # 4. Rewrite Standard Markdown images: ![caption](path)
    def replace_standard_image(match):
        caption = match.group(1)
        raw_target = match.group(2).strip()

        if raw_target.startswith(('http://', 'https://', '//', 'data:')):
            return match.group(0)

        asset_file = find_asset_file(raw_target, note_path, vault_path, ignored_folders)
        if asset_file:
            clean_name = register_asset(asset_file, asset_ops)
            return f'![{caption}]({clean_name})'
        print(f"[WARN] Image file not found: {raw_target} in {note_path.name}")
        return match.group(0)

    body = re.sub(r'!\[(.*?)\]\((.*?)\)', replace_standard_image, body)

    # 5. Rewrite Wikilinks: [[Target Note]] or [[Target Note|Display Text]]
    if convert_wikilinks:
        def replace_wikilink(match):
            inner = match.group(1).strip()
            parts = inner.split('|')
            target = parts[0].strip()
            display = parts[1].strip() if len(parts) > 1 else target

            heading = ''
            if '#' in target:
                target, heading = target.split('#', 1)
                heading = '#' + clean_slug(heading)

            clean_target = Path(target).stem
            if clean_target in published_map:
                pub_info = published_map[clean_target]
                slug = pub_info.get('permalink') or pub_info.get('slug')
                return f'[{display}](/posts/{slug}/{heading})'
            return display

        body = re.sub(r'(?<!!)\[\[(.*?)\]\]', replace_wikilink, body)

    # 6. Restore rendered embeds after parent regex passes finish
    for token, rendered in embed_placeholders.items():
        body = body.replace(token, rendered)

    return body

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
        except Exception:
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
        rel_post = (c_info.get("hexo_file") or "").strip()
        rel_asset = (c_info.get("hexo_asset_dir") or "").strip()
        print(f"[UNPUBLISH] Removing previously published note: {rel_path}")
        if not dry_run:
            if rel_post:
                post_file = root_dir / rel_post
                if post_file.is_file():
                    try:
                        post_file.unlink()
                        print(f"  - Deleted post file {post_file}")
                    except Exception as e:
                        print(f"[WARN] Failed to delete {post_file}: {e}")

            # STRICT SAFETY CHECK: Only delete asset folder if non-empty and strictly inside hexo_posts_path
            if rel_asset:
                asset_dir = root_dir / rel_asset
                try:
                    resolved_asset = asset_dir.resolve()
                    resolved_posts = hexo_posts_path.resolve()
                    if resolved_asset != resolved_posts and resolved_asset.is_relative_to(resolved_posts):
                        if resolved_asset.is_dir():
                            shutil.rmtree(resolved_asset)
                            print(f"  - Deleted asset folder {resolved_asset}")
                    else:
                        print(f"[WARN] Asset directory {asset_dir} outside posts dir, deletion skipped for safety.")
                except Exception as e:
                    print(f"[WARN] Failed to delete asset dir {asset_dir}: {e}")

            del cached_notes[rel_path]

    # Pass 3: Sync each published note
    sync_count = 0
    skip_count = 0
    convert_wikilinks = config.get("convert_wikilinks", True)
    clean_assets = bool(config.get("clean_unreferenced_assets", True))
    resolved_posts_root = hexo_posts_path.resolve()

    for note in published_notes:
        md_path = note["path"].resolve()
        rel_path = note["rel_path"]
        fm = note["fm"].copy()
        raw_body = note["body"]
        note_stem = note["stem"]
        slug = note["slug"]

        deps = [md_path]
        asset_ops = {}
        body = render_note_content(
            raw_body, md_path, vault_path, published_map, ignored_folders,
            convert_wikilinks, deps, asset_ops, {md_path}
        )

        # Clean title: strip quotes if present
        if 'title' in fm and isinstance(fm['title'], str):
            fm['title'] = fm['title'].strip('\'"')
        elif 'title' not in fm:
            extracted_title, body = extract_h1_title(body)
            fm['title'] = extracted_title or note_stem

        # Date & Updated (always use latest mtime across wrapper note and all embedded notes)
        stat = md_path.stat()
        max_mtime = max(p.stat().st_mtime for p in deps)
        if 'date' not in fm:
            fm['date'] = datetime.fromtimestamp(stat.st_ctime).strftime('%Y-%m-%d %H:%M:%S')
        fm.pop('update', None)
        fm['updated'] = datetime.fromtimestamp(max_mtime).strftime('%Y-%m-%d %H:%M:%S')

        # Categories: derive from vault directory path if not provided
        if 'categories' not in fm:
            parent_parts = [p for p in note["path"].relative_to(vault_path).parent.parts if p]
            # If note is in 00-Blog, don't label category as 00-Blog
            filtered_parts = [p for p in parent_parts if not p.lower().endswith(('blog', '00-blog'))]
            if filtered_parts:
                fm['categories'] = list(filtered_parts)

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

        # Syntax conversion
        if config.get("convert_callouts", True):
            body = convert_callouts(body)

        # Target destinations
        dest_md_filename = f"{clean_slug(note_stem)}.md"
        dest_md_file = hexo_posts_path / dest_md_filename
        dest_asset_dir = hexo_posts_path / clean_slug(note_stem)
        rel_hexo_file = str(dest_md_file.relative_to(root_dir))

        frontmatter_str = yaml.dump(fm, allow_unicode=True, default_flow_style=False, sort_keys=False)
        final_content = f"---\n{frontmatter_str}---\n\n{body.lstrip()}\n"

        # Dependency-aware hash (rendered content + embedded notes + asset file bytes)
        asset_digests = sorted(
            (name, calculate_file_sha256(src_path))
            for name, src_path in asset_ops.items()
        )
        hash_payload = json.dumps({
            "final_content": final_content,
            "assets": asset_digests,
            "dest_md": rel_hexo_file,
            "clean_assets": clean_assets,
        }, ensure_ascii=False, sort_keys=True)
        dep_hash = calculate_sha256(hash_payload)

        cached_entry = cached_notes.get(rel_path, {})
        disk_matches = dest_md_file.is_file() and dest_md_file.read_text(encoding='utf-8') == final_content
        assets_ok = all((dest_asset_dir / name).is_file() for name in asset_ops)
        no_stale_assets = (
            not clean_assets
            or not dest_asset_dir.is_dir()
            or all(f.name in asset_ops for f in dest_asset_dir.iterdir() if f.is_file())
        )

        if (
            not force
            and cached_entry.get("sha256") == dep_hash
            and cached_entry.get("hexo_file") == rel_hexo_file
            and disk_matches
            and assets_ok
            and no_stale_assets
        ):
            skip_count += 1
            continue

        print(f"[SYNC] Processing: {rel_path} -> slug: {slug}")
        for dep_path in deps[1:]:
            print(f"  [EMBED] Linked note: {dep_path.relative_to(vault_path)}")

        if not dry_run:
            hexo_posts_path.mkdir(parents=True, exist_ok=True)
            with open(dest_md_file, 'w', encoding='utf-8') as f:
                f.write(final_content)

            # Copy new or modified assets
            if asset_ops:
                dest_asset_dir.mkdir(parents=True, exist_ok=True)
                for clean_name, src_asset in asset_ops.items():
                    target_path = dest_asset_dir / clean_name
                    if not target_path.is_file() or calculate_file_sha256(target_path) != calculate_file_sha256(src_asset):
                        shutil.copy2(src_asset, target_path)

            # Clean unreferenced stale assets safely
            if clean_assets and dest_asset_dir.is_dir():
                resolved_asset_dir = dest_asset_dir.resolve()
                if resolved_asset_dir != resolved_posts_root and resolved_asset_dir.is_relative_to(resolved_posts_root):
                    for existing_file in list(resolved_asset_dir.iterdir()):
                        if existing_file.is_file() and existing_file.name not in asset_ops:
                            existing_file.unlink()
                            print(f"  - Removed stale asset: {existing_file.name}")
                    if not any(resolved_asset_dir.iterdir()):
                        resolved_asset_dir.rmdir()

            has_assets = dest_asset_dir.is_dir() and any(dest_asset_dir.iterdir())
            rel_asset_dir = str(dest_asset_dir.relative_to(root_dir)) if has_assets else ""
            cached_notes[rel_path] = {
                "sha256": dep_hash,
                "dependencies": [str(p.relative_to(vault_path)) for p in deps],
                "hexo_file": rel_hexo_file,
                "hexo_asset_dir": rel_asset_dir,
                "assets": sorted(asset_ops.keys()),
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
        try:
            status_res = subprocess.run(
                ["git", "status", "--porcelain", "source/_posts"],
                cwd=str(root_dir),
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
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
                push_res = subprocess.run(
                    ["git", "push", "origin", "main"],
                    cwd=str(root_dir),
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    errors='replace'
                )
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
