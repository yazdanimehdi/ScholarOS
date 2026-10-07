"""Self-check for render-cv.py's pure helpers. Run: python3 scripts/test_render_cv.py"""

import importlib.util
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("render_cv", Path(__file__).with_name("render-cv.py"))
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)

sections = {
    "education": [{"institution": "A", "visible": False}, {"institution": "B", "visible": True}],
    "summary": ["text"],
}
assert rc.drop_hidden(sections) == {"education": [{"institution": "B"}], "summary": ["text"]}, rc.drop_hidden(sections)

with tempfile.TemporaryDirectory() as d:
    Path(d, "a.md").write_text("---\ntitle: Old\nauthors: [X]\nvenue: V\nyear: 2020\n---\nbody\n")
    Path(d, "b.md").write_text("---\ntitle: New\nauthors: [Y, Z]\nvenue: W\nyear: 2024\ndoi: 10.1/x\n---\n")
    Path(d, "c.md").write_text("no front matter\n")
    pubs = rc.collection_publications(Path(d))
    assert [p["title"] for p in pubs] == ["New", "Old"], pubs
    assert pubs[0] == {"title": "New", "authors": ["Y", "Z"], "journal": "W", "date": "2024", "doi": "10.1/x"}, pubs[0]

hidden_only = {"cv": {"name": "N", "sections": {"experience": [{"company": "C", "position": "P", "visible": False}]}}}
out = rc.build_rendercv_input(hidden_only, with_collection=True)
assert "experience" not in out["cv"]["sections"], out
assert out["cv"]["sections"]["publications"], "filled from src/content/publications"

own_pubs = {"cv": {"name": "N", "sections": {"selected": [{"title": "T", "authors": ["A"]}]}}}
assert "publications" not in rc.build_rendercv_input(own_pubs, with_collection=True)["cv"]["sections"]
assert "publications" not in rc.build_rendercv_input(hidden_only)["cv"]["sections"], "per-person CVs stay as written"

# Malformed or non-mapping front matter is skipped with a warning; backups are not publications.
with tempfile.TemporaryDirectory() as d:
    Path(d, "good.md").write_text("---\ntitle: Good\nauthors: [A]\n---\n")
    Path(d, "bad.md").write_text("---\ntitle: [unclosed\n---\n")
    Path(d, "list.md").write_text("---\n- a\n- b\n---\n")
    Path(d, "good.md.bak").write_text("---\ntitle: Backup\nauthors: [A]\n---\n")
    Path(d, "mdx.mdx").write_text("---\ntitle: Mdx\nauthors: [A]\n---\n")
    assert sorted(p["title"] for p in rc.collection_publications(Path(d))) == ["Good", "Mdx"]

# A CV whose own publications are all hidden keeps them hidden instead of showing the collection.
all_hidden = {"cv": {"name": "N", "sections": {"selected": [{"title": "T", "authors": ["A"], "visible": False}]}}}
assert "publications" not in rc.build_rendercv_input(all_hidden, with_collection=True)["cv"]["sections"]
with_pdf = {"cv": {"name": "N", "sections": {}}, "pdf": {"pageSize": "A4"}}
assert "pdf" not in rc.build_rendercv_input(with_pdf), "the JS renderer's page size never reaches RenderCV"
print("render-cv self-check passed")
