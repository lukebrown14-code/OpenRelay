"""Emit bounded Python symbols and local import targets for the Stage 8 map."""

from __future__ import annotations

import ast
import json
import sys
from pathlib import Path


def parse_file(root: Path, relative: str) -> dict:
    source = (root / relative).read_text(encoding="utf-8")
    tree = ast.parse(source, filename=relative)
    symbols: list[dict] = []
    imports: set[str] = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            symbols.append({"name": node.name, "line": node.lineno, "kind": "class" if isinstance(node, ast.ClassDef) else "function"})
            if isinstance(node, ast.ClassDef):
                for child in node.body:
                    if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        symbols.append({"name": f"{node.name}.{child.name}", "line": child.lineno, "kind": "method"})
        elif isinstance(node, ast.Import):
            imports.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            base = node.module or ""
            if node.level:
                package = relative.removesuffix(".py").replace("/", ".").split(".")[:-1]
                base = ".".join(package[: max(0, len(package) - node.level + 1)] + ([base] if base else []))
            if base:
                imports.add(base)
                for alias in node.names:
                    imports.add(f"{base}.{alias.name}")
    return {"file": relative, "symbols": symbols[:80], "imports": sorted(imports)}


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    paths = json.load(sys.stdin)
    result = []
    for relative in paths:
        try:
            result.append(parse_file(root, relative))
        except (OSError, SyntaxError, UnicodeError) as exc:
            result.append({"file": relative, "symbols": [], "imports": [], "error": type(exc).__name__})
    json.dump(result, sys.stdout, separators=(",", ":"))


if __name__ == "__main__":
    main()
