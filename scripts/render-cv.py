#!/usr/bin/env python3
"""
Render CV PDF from config/cv.yml using RenderCV.

Reads the CMS-friendly cv.yml, converts to RenderCV's expected format,
runs rendercv to generate a PDF, copies the output to public/cv.pdf,
and writes metadata to src/data/cv.json.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config" / "cv.yml"
UPLOAD_PATH = ROOT / "config" / "cv-upload.yml"
OUTPUT_PDF = ROOT / "public" / "cv.pdf"
METADATA_PATH = ROOT / "src" / "data" / "cv.json"
PERSON_CV_DIR = ROOT / "cv"
PERSON_OUTPUT_DIR = ROOT / "public" / "cv"
PERSON_META_PATH = ROOT / "src" / "data" / "cv-people.json"
MAX_PDF_SIZE = 10 * 1024 * 1024  # 10 MB limit


def load_upload() -> tuple[str, dict] | None:
    """Load raw YAML upload if enabled and non-empty.

    Returns (raw_content_string, parsed_dict) so the renderer can write
    the original YAML verbatim (preserving section order and all entries).
    """
    if not UPLOAD_PATH.exists():
        return None
    with open(UPLOAD_PATH, "r") as f:
        data = yaml.safe_load(f)
    if not data or not data.get("enabled"):
        return None
    content = (data.get("content") or "").strip()
    if not content:
        return None
    parsed = yaml.safe_load(content)
    if not isinstance(parsed, dict) or "cv" not in parsed:
        print("WARNING: Uploaded YAML is missing 'cv' key, falling back to structured config")
        return None
    print("Using raw YAML from cv-upload.yml")
    return content, parsed


def load_config() -> dict:
    with open(CONFIG_PATH, "r") as f:
        return yaml.safe_load(f)


def camel_to_snake(name: str) -> str:
    """Convert camelCase to snake_case."""
    s1 = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", name)
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s1).lower()


def convert_keys(obj):
    """Recursively convert all dict keys from camelCase to snake_case."""
    if isinstance(obj, dict):
        return {camel_to_snake(k): convert_keys(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [convert_keys(item) for item in obj]
    return obj


def snake_to_camel(name: str) -> str:
    """Convert snake_case to camelCase."""
    parts = name.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def convert_keys_to_camel(obj):
    """Recursively convert all dict keys from snake_case to camelCase."""
    if isinstance(obj, dict):
        return {snake_to_camel(k): convert_keys_to_camel(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [convert_keys_to_camel(item) for item in obj]
    return obj


def sync_upload_to_structured(uploaded: dict) -> None:
    """Convert uploaded RenderCV data back to CMS-friendly format and write to config/cv.yml.

    Also disables the upload in cv-upload.yml so the structured config takes over.
    """
    camel_data = convert_keys_to_camel(uploaded)

    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        yaml.dump(camel_data, f, default_flow_style=False, allow_unicode=True)
    print(f"Synced upload to structured config at {CONFIG_PATH}")

    # Disable the upload so structured config takes over
    if UPLOAD_PATH.exists():
        with open(UPLOAD_PATH, "r") as f:
            upload_data = yaml.safe_load(f) or {}
        upload_data["enabled"] = False
        with open(UPLOAD_PATH, "w") as f:
            yaml.dump(upload_data, f, default_flow_style=False, allow_unicode=True)
        print("Disabled cv-upload.yml (enabled: false)")


def transform_section_entries(sections: dict) -> dict:
    """Transform our CV section format to RenderCV entry types."""
    result = {}

    for section_name, entries in sections.items():
        if not entries:
            continue

        if section_name == "education":
            result[section_name] = [
                transform_education_entry(e) for e in entries
            ]
        elif section_name == "experience":
            result[section_name] = [
                transform_experience_entry(e) for e in entries
            ]
        elif section_name == "publications":
            result[section_name] = [
                transform_publication_entry(e) for e in entries
            ]
        elif section_name == "awards":
            result[section_name] = [
                transform_one_line_entry(e) for e in entries
            ]
        elif section_name == "skills":
            result[section_name] = [
                transform_one_line_entry(e) for e in entries
            ]
        else:
            # Pass through unknown sections as-is
            print(f"INFO: Passing through unknown section '{section_name}' ({len(entries)} entries)")
            result[section_name] = entries

    return result


def transform_education_entry(entry: dict) -> dict:
    """Map education entry to RenderCV EducationEntry."""
    result = {
        "institution": entry.get("institution", ""),
        "area": entry.get("area", ""),
        "degree": entry.get("degree", ""),
    }
    if entry.get("location"):
        result["location"] = entry["location"]
    if entry.get("start_date"):
        result["start_date"] = entry["start_date"]
    if entry.get("end_date"):
        result["end_date"] = entry["end_date"]
    highlights = entry.get("highlights", [])
    if highlights:
        result["highlights"] = highlights
    return result


def transform_experience_entry(entry: dict) -> dict:
    """Map experience entry to RenderCV ExperienceEntry."""
    result = {
        "company": entry.get("company", ""),
        "position": entry.get("position", ""),
    }
    if entry.get("location"):
        result["location"] = entry["location"]
    if entry.get("start_date"):
        result["start_date"] = entry["start_date"]
    if entry.get("end_date"):
        result["end_date"] = entry["end_date"]
    highlights = entry.get("highlights", [])
    if highlights:
        result["highlights"] = highlights
    return result


def transform_publication_entry(entry: dict) -> dict:
    """Map publication entry to RenderCV PublicationEntry."""
    result = {
        "title": entry.get("title", ""),
        "authors": entry.get("authors", []),
    }
    if entry.get("journal"):
        result["journal"] = entry["journal"]
    if entry.get("date"):
        result["date"] = str(entry["date"])
    if entry.get("doi"):
        result["doi"] = entry["doi"]
    if entry.get("url"):
        result["url"] = entry["url"]
    return result


def transform_one_line_entry(entry: dict) -> dict:
    """Map award/skill entry to RenderCV OneLineEntry."""
    return {
        "label": entry.get("label", ""),
        "details": entry.get("details", ""),
    }


def build_rendercv_input(config: dict) -> dict:
    """Convert our cv.yml format to RenderCV's expected YAML input."""
    # Convert all keys from camelCase to snake_case
    converted = convert_keys(config)

    cv = converted.get("cv", {})
    sections_raw = cv.pop("sections", {})

    # Transform section entries to proper RenderCV types
    cv["sections"] = transform_section_entries(sections_raw)

    result = {"cv": cv}

    # Include design settings if present
    design = converted.get("design")
    if design:
        result["design"] = design

    return result


def find_output_pdf(output_dir: Path) -> Path | None:
    """Find the generated PDF in RenderCV's output directory."""
    for pdf in output_dir.rglob("*.pdf"):
        return pdf
    return None


def render_cv(rendercv_input: dict | str) -> Path:
    """Run RenderCV and return path to the generated PDF.

    rendercv_input can be a dict (YAML-dumped) or a raw YAML string
    (written verbatim to preserve section order).
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        input_file = tmpdir_path / "cv_input.yaml"

        with open(input_file, "w") as f:
            if isinstance(rendercv_input, str):
                f.write(rendercv_input)
            else:
                yaml.dump(rendercv_input, f, default_flow_style=False, allow_unicode=True)

        print(f"Running rendercv render on {input_file}...")

        result = subprocess.run(
            ["rendercv", "render", str(input_file)],
            capture_output=True,
            text=True,
            cwd=tmpdir,
            timeout=120,
        )

        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)

        if result.returncode != 0:
            raise RuntimeError(f"rendercv exited with code {result.returncode}")

        # RenderCV outputs to rendercv_output/ by default
        output_dir = tmpdir_path / "rendercv_output"
        pdf_path = find_output_pdf(output_dir)

        # Fallback: search entire tmpdir if not found in expected location
        if pdf_path is None:
            pdf_path = find_output_pdf(tmpdir_path)

        if pdf_path is None:
            raise RuntimeError("RenderCV did not produce a PDF file")

        # Copy to a stable temp location before tmpdir is cleaned up
        stable_path = Path(tempfile.mktemp(suffix=".pdf"))
        shutil.copy2(pdf_path, stable_path)
        return stable_path


def validate_pdf(pdf_path: Path) -> None:
    """Validate the generated PDF."""
    if not pdf_path.exists():
        raise RuntimeError("PDF file does not exist")

    size = pdf_path.stat().st_size
    if size == 0:
        raise RuntimeError("PDF file is empty")

    if size > MAX_PDF_SIZE:
        raise RuntimeError(
            f"PDF file is too large: {size / 1024 / 1024:.1f}MB (limit: {MAX_PDF_SIZE / 1024 / 1024:.0f}MB)"
        )

    print(f"PDF validated: {size / 1024:.1f} KB")


def write_metadata(pdf_size: int) -> None:
    """Write CV metadata JSON for the site to consume."""
    metadata = {
        "lastGenerated": datetime.now(timezone.utc).isoformat(),
        "pdfPath": "/cv.pdf",
        "pdfSize": pdf_size,
    }

    METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(METADATA_PATH, "w") as f:
        json.dump(metadata, f, indent=2)
        f.write("\n")

    print(f"Metadata written to {METADATA_PATH}")


def render_person_cvs() -> None:
    """Render per-person CV PDFs from cv/*.yml files."""
    if not PERSON_CV_DIR.exists():
        print("No per-person CV directory found, skipping.")
        return

    yml_files = sorted(PERSON_CV_DIR.glob("*.yml"))
    # Filter out .gitkeep and other non-CV files
    yml_files = [f for f in yml_files if f.stem != ".gitkeep"]

    if not yml_files:
        print("No per-person CV files found, skipping.")
        return

    PERSON_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    person_meta: dict = {}
    errors: list[str] = []

    for cv_file in yml_files:
        person_id = cv_file.stem
        print(f"\n--- Rendering CV for {person_id} ---")

        try:
            with open(cv_file, "r") as f:
                config = yaml.safe_load(f)

            if not config or not config.get("cv"):
                print(f"WARNING: {cv_file.name} is empty or missing 'cv' section, skipping.")
                continue

            rendercv_input = build_rendercv_input(config)
            pdf_path = render_cv(rendercv_input)
            validate_pdf(pdf_path)

            dest = PERSON_OUTPUT_DIR / f"{person_id}.pdf"
            shutil.copy2(pdf_path, dest)
            pdf_size = dest.stat().st_size
            pdf_path.unlink(missing_ok=True)

            person_meta[person_id] = {
                "lastGenerated": datetime.now(timezone.utc).isoformat(),
                "pdfPath": f"/cv/{person_id}.pdf",
                "pdfSize": pdf_size,
            }

            print(f"PDF written to {dest} ({pdf_size / 1024:.1f} KB)")

        except Exception as e:
            print(f"ERROR: Failed to render CV for {person_id}: {e}")
            errors.append(person_id)

    # Write per-person metadata
    PERSON_META_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(PERSON_META_PATH, "w") as f:
        json.dump(person_meta, f, indent=2)
        f.write("\n")

    print(f"\nPerson CV metadata written to {PERSON_META_PATH}")
    if errors:
        print(f"WARNING: Failed to render CVs for: {', '.join(errors)}")


def main():
    # Check for raw YAML upload first (takes priority)
    upload_result = load_upload()

    if upload_result:
        raw_content, uploaded = upload_result
        # Sync upload to structured config and disable upload
        sync_upload_to_structured(uploaded)
        # Use the raw YAML string directly to preserve section order and all entries
        rendercv_input = raw_content
    else:
        if not CONFIG_PATH.exists():
            print(f"ERROR: CV config not found at {CONFIG_PATH}")
            sys.exit(1)

        print(f"Loading CV config from {CONFIG_PATH}...")
        config = load_config()

        if not config or not config.get("cv"):
            print("ERROR: CV config is empty or missing 'cv' section")
            sys.exit(1)

        # Build RenderCV input from structured config
        rendercv_input = build_rendercv_input(config)

    # Render PDF
    try:
        pdf_path = render_cv(rendercv_input)
    except subprocess.TimeoutExpired:
        print("ERROR: RenderCV timed out after 120 seconds")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: Failed to render CV: {e}")
        sys.exit(1)

    # Validate
    try:
        validate_pdf(pdf_path)
    except RuntimeError as e:
        print(f"ERROR: PDF validation failed: {e}")
        pdf_path.unlink(missing_ok=True)
        sys.exit(1)

    # Copy to public/cv.pdf
    OUTPUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(pdf_path, OUTPUT_PDF)
    pdf_size = OUTPUT_PDF.stat().st_size
    print(f"PDF written to {OUTPUT_PDF}")

    # Clean up temp PDF
    pdf_path.unlink(missing_ok=True)

    # Write metadata
    write_metadata(pdf_size)

    print("\nCV render complete!")

    # Render per-person CVs
    render_person_cvs()


if __name__ == "__main__":
    main()
