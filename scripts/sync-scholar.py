#!/usr/bin/env python3
"""
Sync publications from Google Scholar.

Reads author IDs from config/scholar.yml, fetches publication metadata
via the `scholarly` library, and writes individual markdown files to
src/content/publications/.
"""

import json
import os
import re
import sys
import time
from difflib import SequenceMatcher
from pathlib import Path

import yaml

try:
    from scholarly import scholarly
except ImportError:
    print("ERROR: scholarly is not installed. Run: pip install -r scripts/requirements.txt")
    sys.exit(1)


ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config" / "scholar.yml"
OVERRIDE_PATH = ROOT / "config" / "publications.override.yml"
OUTPUT_DIR = ROOT / "src" / "content" / "publications"

# Delay between scholarly API calls to avoid rate-limiting
FETCH_DELAY = 4  # seconds


def load_config():
    with open(CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def load_overrides():
    if not OVERRIDE_PATH.exists():
        return {"additions": [], "exclude": [], "overrides": []}
    with open(OVERRIDE_PATH, "r") as f:
        data = yaml.safe_load(f) or {}
    return {
        "additions": data.get("additions") or [],
        "exclude": data.get("exclude") or [],
        "overrides": data.get("overrides") or [],
    }


def parse_frontmatter(filepath: Path) -> dict:
    """Read a .md file and extract YAML frontmatter as a dict."""
    text = filepath.read_text(encoding="utf-8")
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    try:
        return yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        return {}


def write_publication_md(pub: dict, output_dir: Path) -> None:
    """Write a publication as a .md file with YAML frontmatter."""
    pub_id = pub.get("id", "unknown")
    filepath = output_dir / f"{pub_id}.md"

    # Build frontmatter dict (exclude 'id' since it comes from filename)
    fm = {}
    for key in ("title", "authors", "venue", "year", "doi", "url", "pdf",
                 "type", "featured", "abstract", "bibtex", "image"):
        if key in pub and pub[key] is not None:
            fm[key] = pub[key]

    # Ensure required fields
    fm.setdefault("title", "Untitled")
    fm.setdefault("authors", [])
    fm.setdefault("venue", "")
    fm.setdefault("year", 0)
    fm.setdefault("type", "conference")
    fm.setdefault("featured", False)
    fm.setdefault("image", "")

    frontmatter = yaml.dump(fm, default_flow_style=False, allow_unicode=True, sort_keys=False)
    content = f"---\n{frontmatter}---\n"

    filepath.write_text(content, encoding="utf-8")


def load_existing() -> list[dict]:
    """Scan OUTPUT_DIR/*.md, parse frontmatter, set id from filename stem."""
    if not OUTPUT_DIR.exists():
        return []
    pubs = []
    for md_file in OUTPUT_DIR.glob("*.md"):
        fm = parse_frontmatter(md_file)
        if fm:
            fm["id"] = md_file.stem
            pubs.append(fm)
    return pubs


def generate_id(authors_str: str, year, title: str) -> str:
    """Generate an ID like 'smith2024adaptive'."""
    # Get last name of first author
    lastname = "unknown"
    if authors_str:
        first_author = authors_str.split(" and ")[0].strip()
        parts = first_author.split()
        if parts:
            lastname = parts[-1].lower()
            lastname = re.sub(r"[^a-z]", "", lastname)

    # Get first significant word from title
    stop_words = {"a", "an", "the", "of", "in", "on", "for", "and", "to", "with", "is", "are"}
    title_words = re.findall(r"[a-z]+", title.lower())
    word = "untitled"
    for w in title_words:
        if w not in stop_words and len(w) > 2:
            word = w
            break

    return f"{lastname}{year}{word}"


def infer_type(venue: str) -> str:
    """Infer publication type from venue name."""
    v = venue.lower()
    if any(kw in v for kw in ["arxiv", "preprint", "biorxiv", "medrxiv", "ssrn"]):
        return "preprint"
    if any(kw in v for kw in ["journal", "transactions", "letters"]):
        return "journal"
    if any(kw in v for kw in ["workshop", "w@"]):
        return "workshop"
    if any(kw in v for kw in ["thesis", "dissertation"]):
        return "thesis"
    if any(kw in v for kw in ["book", "chapter", "springer", "lecture notes"]):
        return "book-chapter"
    # Default to conference for proceedings/conferences/named venues
    return "conference"


def map_publication(pub) -> dict:
    """Map a scholarly publication object to our schema."""
    bib = pub.get("bib", {})

    title = bib.get("title", "Untitled")
    authors_str = bib.get("author", "")
    authors = [a.strip() for a in authors_str.split(" and ")] if authors_str else []
    venue = bib.get("venue", "") or bib.get("journal", "") or bib.get("booktitle", "") or ""
    year = int(bib.get("pub_year", 0)) if bib.get("pub_year") else 0
    url = pub.get("pub_url", "") or bib.get("url", "") or ""
    abstract = bib.get("abstract", "") or ""

    pub_id = generate_id(authors_str, year, title)
    pub_type = infer_type(venue)

    result = {
        "id": pub_id,
        "title": title,
        "authors": authors,
        "venue": venue,
        "year": year,
        "type": pub_type,
        "featured": False,
    }

    # Only include optional fields if they have values
    if url:
        result["url"] = url
    if abstract:
        result["abstract"] = abstract

    return result


def normalize_title(title: str) -> str:
    """Normalize title for deduplication comparison."""
    return re.sub(r"[^a-z0-9]", "", title.lower())


def titles_similar(t1: str, t2: str, threshold: float = 0.9) -> bool:
    """Check if two titles are similar enough to be considered duplicates."""
    return SequenceMatcher(None, normalize_title(t1), normalize_title(t2)).ratio() > threshold


def deduplicate(pubs: list[dict]) -> list[dict]:
    """Remove duplicate publications by DOI match or title similarity."""
    seen_dois = set()
    seen_titles = []
    unique = []

    for pub in pubs:
        doi = pub.get("doi", "")
        if doi:
            if doi in seen_dois:
                continue
            seen_dois.add(doi)

        # Check title similarity against already-seen titles
        is_dup = False
        for seen_title in seen_titles:
            if titles_similar(pub["title"], seen_title):
                is_dup = True
                break

        if not is_dup:
            seen_titles.append(pub["title"])
            unique.append(pub)

    return unique


def merge_with_existing(new_pubs: list[dict], existing: list[dict]) -> list[dict]:
    """Merge new publications with existing data, preserving manual edits."""
    existing_by_id = {p["id"]: p for p in existing}
    existing_by_title = {normalize_title(p["title"]): p for p in existing}

    merged = []
    seen_ids = set()

    for pub in new_pubs:
        norm_title = normalize_title(pub["title"])
        existing_pub = existing_by_id.get(pub["id"]) or existing_by_title.get(norm_title)

        if existing_pub:
            # Update existing entry, but preserve non-empty fields from existing
            merged_pub = {**existing_pub}
            for key, value in pub.items():
                if value and (not merged_pub.get(key) or key in ("title", "authors", "venue", "year")):
                    merged_pub[key] = value
            merged.append(merged_pub)
        else:
            merged.append(pub)

        seen_ids.add(pub["id"])

    # Keep existing entries that weren't in the new set (preserve CMS-created publications)
    for pub in existing:
        if pub["id"] not in seen_ids and normalize_title(pub["title"]) not in {
            normalize_title(p["title"]) for p in new_pubs
        }:
            merged.append(pub)

    return merged


def apply_overrides(pubs: list[dict], overrides: dict) -> list[dict]:
    """Apply manual overrides: exclude, patch, and add entries."""
    exclude_dois = set(overrides.get("exclude") or [])
    if exclude_dois:
        pubs = [p for p in pubs if p.get("doi") not in exclude_dois]

    for override in overrides.get("overrides") or []:
        doi = override.get("doi")
        fields = override.get("set", {})
        if doi and fields:
            for pub in pubs:
                if pub.get("doi") == doi:
                    pub.update(fields)

    additions = overrides.get("additions") or []
    if additions:
        pubs.extend(additions)

    return pubs


def sort_publications(pubs: list[dict]) -> list[dict]:
    """Sort by year descending, then title ascending."""
    return sorted(pubs, key=lambda p: (-p.get("year", 0), p.get("title", "")))


def setup_proxy():
    """Enable free proxy rotation if USE_PROXY=1."""
    if os.environ.get("USE_PROXY", "0") == "1":
        try:
            from scholarly import ProxyGenerator

            pg = ProxyGenerator()
            pg.FreeProxies()
            scholarly.use_proxy(pg)
            print("Proxy rotation enabled.")
        except Exception as e:
            print(f"WARNING: Failed to set up proxy: {e}")


def main():
    config = load_config()
    authors_config = config.get("authors", [])
    max_results = config.get("maxResults", 100)

    if not authors_config:
        print("No authors configured in config/scholar.yml")
        sys.exit(1)

    setup_proxy()

    existing = load_existing()
    all_pubs = []
    author_success = 0
    author_fail = 0
    total_fetched = 0

    for author_cfg in authors_config:
        name = author_cfg.get("name", "Unknown")
        scholar_id = author_cfg.get("scholar_id", "")

        if not scholar_id:
            print(f"SKIP: No scholar_id for '{name}'")
            author_fail += 1
            continue

        print(f"\nFetching publications for {name} ({scholar_id})...")
        try:
            author = scholarly.search_author_id(scholar_id)
            author = scholarly.fill(author, sections=["publications"])

            pubs = author.get("publications", [])[:max_results]
            print(f"  Found {len(pubs)} publications, fetching details...")

            for i, pub in enumerate(pubs):
                try:
                    filled = scholarly.fill(pub)
                    mapped = map_publication(filled)
                    if mapped["year"] > 0:  # Skip entries without valid year
                        all_pubs.append(mapped)
                        total_fetched += 1
                except Exception as e:
                    print(f"  WARNING: Failed to fetch details for pub #{i}: {e}")

                time.sleep(FETCH_DELAY)

            author_success += 1
            print(f"  Done: {len(pubs)} processed for {name}")

        except Exception as e:
            print(f"  ERROR: Failed to fetch author '{name}': {e}")
            author_fail += 1

        time.sleep(FETCH_DELAY)

    # If ALL authors failed, exit without writing (preserve existing data)
    if author_success == 0:
        print(f"\nERROR: All {author_fail} author(s) failed. Preserving existing data.")
        sys.exit(1)

    # Deduplicate across authors
    all_pubs = deduplicate(all_pubs)

    # Merge with existing data
    merged = merge_with_existing(all_pubs, existing)

    # Apply overrides
    overrides = load_overrides()
    merged = apply_overrides(merged, overrides)

    # Sort
    merged = sort_publications(merged)

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Write individual .md files (do NOT delete files not in new set)
    for pub in merged:
        write_publication_md(pub, OUTPUT_DIR)

    added = len(merged) - len(existing)
    print(f"\nSummary:")
    print(f"  Authors fetched: {author_success}/{len(authors_config)}")
    print(f"  Publications fetched: {total_fetched}")
    print(f"  Total after merge: {len(merged)}")
    print(f"  Net change: {'+' if added >= 0 else ''}{added}")
    if author_fail > 0:
        print(f"  Warnings: {author_fail} author(s) failed")


if __name__ == "__main__":
    main()
