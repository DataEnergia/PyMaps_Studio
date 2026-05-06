import json
import logging
from typing import Tuple, Optional, Any
from pydantic import ValidationError
from .models import InfographicSpec, BlockType

logger = logging.getLogger(__name__)


def parse_and_validate(raw_output: str, canvas_width: int = 1200, canvas_height: int = 800) -> Tuple[Optional[InfographicSpec], Optional[str]]:
    data = _extract_json(raw_output)
    if data is None:
        return None, "JSON inválido na resposta"
    if not isinstance(data, dict):
        return None, "Resposta não é objeto JSON"
    if "spec" not in data and "blocks" not in data:
        return None, "Campo 'spec' ou 'blocks' ausente"

    # Suporta tanto {action, spec, message} quanto {canvas, blocks} direto
    spec_data = data.get("spec", data)
    if not isinstance(spec_data, dict):
        return None, "Spec não é objeto JSON"

    spec_data = _normalize(spec_data, canvas_width, canvas_height)

    try:
        spec = InfographicSpec(**spec_data)
    except ValidationError as e:
        errors = [f"{'->'.join(str(x) for x in err['loc'])}: {err['msg']}" for err in e.errors()[:3]]
        return None, f"Validação: {'; '.join(errors)}"

    return spec, None


def _extract_json(text: str) -> Optional[Any]:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if len(lines) > 1:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    import re
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


CONFIG_KEYS_BY_TYPE: dict[str, set[str]] = {
    "map": {"area", "style", "basemap", "markers", "showLabels", "zoom", "center", "fillColor", "borderColor", "borderWidth", "markerColor", "markerSize"},
    "card": {"title", "value", "subtitle", "icon", "color", "backgroundColor"},
    "chart": {"chartType", "title", "data", "colors", "showLegend", "showValues", "horizontal"},
    "text": {"content", "fontSize", "alignment", "heading", "headingSize"},
    "table": {"columns", "rows", "title", "striped", "maxRows"},
    "image": {"src", "alt", "fit", "borderRadius"},
    "timeline": {"orientation", "events", "title", "showValues"},
    "minimap": {"area", "highlightPosition", "highlightLabel", "label"},
    "connector": {"fromAnchor", "toAnchor", "style", "color", "strokeWidth", "dashed", "arrowEnd", "label"},
    "divider": {"orientation", "color", "thickness", "style", "label"},
}


def _normalize(data: dict, canvas_width: int, canvas_height: int) -> dict:
    if "canvas" not in data:
        data["canvas"] = {}
    canvas = data["canvas"]
    if isinstance(canvas, dict):
        canvas.setdefault("width", canvas_width)
        canvas.setdefault("height", canvas_height)
        canvas.setdefault("background", "var(--surface)")

    valid_types = {bt.value for bt in BlockType}
    normalized_blocks = []
    for i, block in enumerate(data.get("blocks", [])):
        if not isinstance(block, dict):
            continue
        block.setdefault("id", f"block-{i + 1}")
        block_type = block.get("type", "")
        if block_type not in valid_types:
            block["type"] = BlockType.TEXT.value

        # Normalize bounds from various formats
        if "bounds" not in block or not isinstance(block.get("bounds"), dict):
            x = block.get("x", 0)
            y = block.get("y", 0)
            w = block.get("width", block.get("w", 300))
            h = block.get("height", block.get("h", 200))
            block["bounds"] = {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}
        bounds = block["bounds"]
        for key in ("x", "y", "w", "h"):
            if key not in bounds or not isinstance(bounds.get(key), (int, float)):
                bounds[key] = 0
            else:
                bounds[key] = int(bounds[key])
        if bounds["w"] <= 0:
            bounds["w"] = 300
        if bounds["h"] <= 0:
            bounds["h"] = 200

        # Normalize config from various formats (props -> config)
        if "config" not in block or not block["config"]:
            if "props" in block and isinstance(block["props"], dict):
                block["config"] = block.pop("props")
            else:
                block["config"] = {}

        # Move type-specific keys from block root into config if missing there
        cfg = block.get("config", {})
        if not isinstance(cfg, dict):
            cfg = {}
        known_keys = CONFIG_KEYS_BY_TYPE.get(block_type, set())
        for key in known_keys:
            if key in block and key not in cfg:
                cfg[key] = block.pop(key)

        # Ensure map area has a default type
        if block_type == "map":
            if "area" not in cfg or not isinstance(cfg.get("area"), dict):
                cfg["area"] = {"type": "brasil", "id": None}
            elif not cfg["area"].get("type"):
                cfg["area"]["type"] = "brasil"

        block["config"] = cfg
        block.setdefault("locked", False)
        block.setdefault("zIndex", i)
        normalized_blocks.append(block)

    data["blocks"] = normalized_blocks
    return data
