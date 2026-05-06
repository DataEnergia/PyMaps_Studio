import json
import logging
from typing import Dict, Any
from fastapi import APIRouter, HTTPException

from .spec_parser import parse_and_validate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/studio", tags=["studio"])


@router.get("/blocks")
def list_blocks():
    """List all available block types and their config schemas."""
    return {
        "block_types": [
            {
                "type": "map",
                "description": "Mapa geográfico interativo via MapLibre GL",
                "config_keys": ["area", "style", "basemap", "markers", "showLabels", "zoom", "center"],
            },
            {
                "type": "card",
                "description": "Card de indicador/KPI com valor destacado",
                "config_keys": ["title", "value", "subtitle", "icon", "color", "backgroundColor"],
            },
            {
                "type": "chart",
                "description": "Gráfico (bar, line, pie, scatter, donut, area)",
                "config_keys": ["chartType", "title", "data", "colors", "showLegend", "showValues", "horizontal"],
            },
            {
                "type": "text",
                "description": "Bloco de texto formatado com título opcional",
                "config_keys": ["content", "fontSize", "alignment", "heading", "headingSize"],
            },
            {
                "type": "table",
                "description": "Tabela de dados com colunas configuráveis",
                "config_keys": ["columns", "rows", "title", "striped", "maxRows"],
            },
            {
                "type": "image",
                "description": "Imagem estática (logo, foto, referência)",
                "config_keys": ["src", "alt", "fit", "borderRadius"],
            },
            {
                "type": "timeline",
                "description": "Linha do tempo horizontal ou vertical",
                "config_keys": ["orientation", "events", "title", "showValues"],
            },
            {
                "type": "minimap",
                "description": "Mapa reduzido de contexto geográfico",
                "config_keys": ["area", "highlightPosition", "highlightLabel", "label"],
            },
            {
                "type": "connector",
                "description": "Linha/seta SVG conectando blocos",
                "config_keys": ["fromAnchor", "toAnchor", "style", "color", "strokeWidth", "dashed", "arrowEnd", "label"],
            },
            {
                "type": "table",
                "description": "Tabela de dados",
                "config_keys": ["columns", "rows", "title", "striped", "maxRows"],
            },
            {
                "type": "divider",
                "description": "Separador visual horizontal ou vertical",
                "config_keys": ["orientation", "color", "thickness", "style", "label"],
            },
        ]
    }


@router.post("/validate-spec")
def validate_spec(spec: Dict[str, Any]):
    spec_obj, error = parse_and_validate(json.dumps(spec))
    if error:
        raise HTTPException(422, error)
    return {
        "valid": True,
        "blocks": len(spec_obj.blocks),
        "types": [b.type.value for b in spec_obj.blocks],
    }
