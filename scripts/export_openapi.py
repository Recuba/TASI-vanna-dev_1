#!/usr/bin/env python3
"""
Export the OpenAPI schema from the Ra'd AI TASI API.

Usage:
    python scripts/export_openapi.py                # Print to stdout
    python scripts/export_openapi.py -o openapi.json  # Write to file
    python scripts/export_openapi.py --yaml          # Output as YAML (requires pyyaml)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Ensure project root is on sys.path
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))


def get_openapi_schema() -> dict:
    """Import the FastAPI app and extract its OpenAPI schema."""
    from app import app

    return app.openapi()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export the Ra'd AI TASI API OpenAPI schema"
    )
    parser.add_argument(
        "-o",
        "--output",
        type=str,
        default=None,
        help="Output file path (default: stdout)",
    )
    parser.add_argument(
        "--yaml",
        action="store_true",
        help="Output as YAML instead of JSON (requires pyyaml)",
    )
    args = parser.parse_args()

    schema = get_openapi_schema()

    if args.yaml:
        try:
            import yaml

            content = yaml.dump(schema, default_flow_style=False, allow_unicode=True)
        except ImportError:
            print("ERROR: pyyaml is required for YAML output. Install with: pip install pyyaml", file=sys.stderr)
            sys.exit(1)
    else:
        content = json.dumps(schema, indent=2, ensure_ascii=False)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(content, encoding="utf-8")
        print(f"OpenAPI schema written to {output_path}", file=sys.stderr)
    else:
        print(content)


if __name__ == "__main__":
    main()
