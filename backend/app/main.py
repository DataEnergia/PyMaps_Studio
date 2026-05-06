from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import requests
import cachetools
import pandas as pd
import io
import logging
import json
import os
from shapely.geometry import Point, shape
import geopandas as gpd
from .studio.router import router as studio_router
from .database import engine, Base
from .routers import auth, projects_simple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create DB tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="PyMaps API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(studio_router)
app.include_router(auth.router)
app.include_router(projects_simple.router)

# Cache
API_CACHE = cachetools.TTLCache(maxsize=200, ttl=3600)
IBGE_BASE = "https://servicodados.ibge.gov.br/api/v1/localidades"
IBGE_MALHAS = "https://servicodados.ibge.gov.br/api/v3/malhas"

# Local GeoJSON storage
GEOJSON_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "geojson")
os.makedirs(GEOJSON_DIR, exist_ok=True)

def _local_geojson_path(area_type: str, area_id: Optional[int] = None) -> str:
    if area_type == "brasil":
        return os.path.join(GEOJSON_DIR, "brasil.geojson")
    return os.path.join(GEOJSON_DIR, f"{area_type}_{area_id}.geojson")

def _load_local_geojson(area_type: str, area_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    path = _local_geojson_path(area_type, area_id)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load local geojson {path}: {e}")
    return None

def _save_local_geojson(area_type: str, area_id: Optional[int], data: Dict[str, Any]) -> None:
    path = _local_geojson_path(area_type, area_id)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"Failed to save local geojson {path}: {e}")

# ── Local static JSON data (regions, UFs) ──
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

def _load_local_json(filename: str) -> Optional[List[Dict[str, Any]]]:
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load local JSON {path}: {e}")
    return None

# ── Custom Icons storage ──
CUSTOM_ICONS_PATH = os.path.join(DATA_DIR, "custom_icons.json")

def _load_custom_icons() -> List[Dict[str, Any]]:
    if os.path.exists(CUSTOM_ICONS_PATH):
        try:
            with open(CUSTOM_ICONS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load custom icons: {e}")
    return []

def _save_custom_icons(icons: List[Dict[str, Any]]) -> None:
    try:
        with open(CUSTOM_ICONS_PATH, "w", encoding="utf-8") as f:
            json.dump(icons, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Failed to save custom icons: {e}")
        raise HTTPException(500, f"Erro ao salvar ícone: {str(e)}")

# Schemas
class Region(BaseModel):
    id: int
    nome: str

class UF(BaseModel):
    id: int
    nome: str

class Municipio(BaseModel):
    id: int
    nome: str

class PointData(BaseModel):
    lat: float
    lon: float

class FilterRequest(BaseModel):
    points: List[PointData]
    area_geojson: Dict[str, Any]

class UploadResponse(BaseModel):
    data: List[Dict[str, Any]]
    columns: List[str]
    row_count: int

# Helpers
def cached_get(url: str) -> Any:
    if url in API_CACHE:
        return API_CACHE[url]
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        API_CACHE[url] = data
        return data
    except Exception as e:
        logger.error(f"API Error {url}: {e}")
        return None

# Endpoints
@app.get("/")
def root():
    return {"message": "PyMaps API v3.0", "status": "ok"}

@app.get("/regions", response_model=List[Region])
def regions():
    local = _load_local_json("regions.json")
    if local:
        return [{"id": r["id"], "nome": r["nome"]} for r in local]
    data = cached_get(f"{IBGE_BASE}/regioes")
    if not data:
        raise HTTPException(503, "IBGE API indisponível")
    return [{"id": r["id"], "nome": r["nome"]} for r in data]

@app.get("/ufs", response_model=List[UF])
def ufs(region_id: Optional[int] = None):
    local = _load_local_json("ufs.json")
    if local:
        if region_id:
            local = [u for u in local if u.get("regiao_id") == region_id]
        return [{"id": u["id"], "nome": u["nome"]} for u in local]
    url = f"{IBGE_BASE}/regioes/{region_id}/estados" if region_id else f"{IBGE_BASE}/estados"
    data = cached_get(url)
    if not data:
        raise HTTPException(503, "IBGE API indisponível")
    return [{"id": u["id"], "nome": u["nome"]} for u in data]

@app.get("/municipios", response_model=List[Municipio])
def municipios(uf_id: Optional[int] = None):
    # Try local cache per UF
    if uf_id:
        local = _load_local_json(f"municipios_{uf_id}.json")
        if local:
            return [{"id": m["id"], "nome": m["nome"]} for m in local]
    url = f"{IBGE_BASE}/estados/{uf_id}/municipios" if uf_id else f"{IBGE_BASE}/municipios"
    data = cached_get(url)
    if not data:
        raise HTTPException(503, "IBGE API indisponível")
    # Cache municipios per UF
    if uf_id and data:
        try:
            with open(os.path.join(DATA_DIR, f"municipios_{uf_id}.json"), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception:
            pass
    return [{"id": m["id"], "nome": m["nome"]} for m in data]

@app.get("/area-name/{area_type}/{area_id}")
def area_name(area_type: str, area_id: int):
    mapping = {
        "region": f"{IBGE_BASE}/regioes/{area_id}",
        "uf": f"{IBGE_BASE}/estados/{area_id}",
        "municipio": f"{IBGE_BASE}/municipios/{area_id}",
    }
    url = mapping.get(area_type)
    if not url:
        raise HTTPException(400, "Tipo de área inválido")
    data = cached_get(url)
    return {"nome": data.get("nome", "Desconhecido") if data else "Desconhecido"}

@app.get("/geojson/{area_type}")
def geojson(area_type: str, area_id: Optional[int] = None):
    # 1. Try local file first (fast, works offline)
    local = _load_local_geojson(area_type, area_id)
    if local:
        logger.info(f"Serving local geojson for {area_type} id={area_id}")
        return local

    # 2. Fallback to IBGE API
    urls = {
        "brasil": f"{IBGE_MALHAS}/paises/BR?intrarregiao=UF&formato=application/vnd.geo+json",
        "region": f"{IBGE_MALHAS}/regioes/{area_id}?intrarregiao=UF&formato=application/vnd.geo+json" if area_id else None,
        "uf": f"{IBGE_MALHAS}/estados/{area_id}?intrarregiao=municipio&formato=application/vnd.geo+json" if area_id else None,
        "municipio": f"{IBGE_MALHAS}/municipios/{area_id}?formato=application/vnd.geo+json" if area_id else None,
    }
    url = urls.get(area_type)
    if not url:
        raise HTTPException(400, f"Parâmetros inválidos para área: {area_type}, id={area_id}")

    try:
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        # Cache locally for future offline use
        _save_local_geojson(area_type, area_id, data)
        return data
    except Exception as e:
        logger.error(f"GeoJSON Error: {e}")
        raise HTTPException(503, f"Erro ao carregar GeoJSON: {str(e)}")

@app.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        filename = file.filename or ""
        
        if filename.lower().endswith(".csv"):
            df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
        elif filename.lower().endswith((".xls", ".xlsx")):
            df = pd.read_excel(io.BytesIO(contents))
        else:
            raise HTTPException(400, "Formato inválido. Use CSV ou Excel.")
        
        # Converter NaN para None
        df = df.where(pd.notnull(df), None)
        # Converter tipos numéricos para tipos JSON serializáveis
        for col in df.columns:
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                df[col] = df[col].astype(str)
        
        return {
            "data": df.to_dict("records"),
            "columns": df.columns.tolist(),
            "row_count": len(df)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(400, f"Erro ao processar arquivo: {str(e)}")

@app.post("/filter-points")
def filter_points(req: FilterRequest):
    try:
        gdf = gpd.GeoDataFrame.from_features(req.area_geojson.get("features", []))
        if gdf.crs is None:
            gdf.set_crs("EPSG:4326", inplace=True)
        
        union = gdf.unary_union
        filtered = []
        
        for p in req.points:
            try:
                pt = Point(float(p.lon), float(p.lat))
                if union.contains(pt):
                    filtered.append({"lat": p.lat, "lon": p.lon})
            except (ValueError, TypeError):
                continue
        
        return {"filtered_points": filtered, "total": len(req.points), "matched": len(filtered)}
    except Exception as e:
        logger.error(f"Filter error: {e}")
        # Se falhar, retorna todos os pontos sem filtrar
        return {"filtered_points": [{"lat": p.lat, "lon": p.lon} for p in req.points], "total": len(req.points), "matched": len(req.points)}

# ── Iconify API proxy (search + SVG) ──
ICONIFY_SEARCH_URL = "https://api.iconify.design/search"
ICONIFY_SVG_URL = "https://api.iconify.design"

@app.get("/iconify/search")
def iconify_search(query: str, limit: int = 48):
    """Search icons via Iconify public API."""
    cache_key = f"iconify_search:{query}:{limit}"
    if cache_key in API_CACHE:
        return API_CACHE[cache_key]
    try:
        resp = requests.get(
            ICONIFY_SEARCH_URL,
            params={"query": query, "limit": limit},
            timeout=10
        )
        resp.raise_for_status()
        data = resp.json()
        API_CACHE[cache_key] = data
        return data
    except Exception as e:
        logger.error(f"Iconify search error: {e}")
        raise HTTPException(503, f"Erro na busca de ícones: {str(e)}")

@app.get("/iconify/svg")
def iconify_svg(prefix: str, name: str):
    """Fetch raw SVG from Iconify public API."""
    cache_key = f"iconify_svg:{prefix}:{name}"
    if cache_key in API_CACHE:
        return API_CACHE[cache_key]
    try:
        resp = requests.get(
            f"{ICONIFY_SVG_URL}/{prefix}/{name}.svg",
            timeout=10
        )
        resp.raise_for_status()
        svg = resp.text
        API_CACHE[cache_key] = svg
        return {"svg": svg, "prefix": prefix, "name": name}
    except Exception as e:
        logger.error(f"Iconify SVG error: {e}")
        raise HTTPException(503, f"Erro ao carregar SVG: {str(e)}")

# ── Custom Icons CRUD ──
class CustomIcon(BaseModel):
    name: str
    label: str
    category: str
    svg: str

@app.get("/custom-icons", response_model=List[CustomIcon])
def list_custom_icons():
    return _load_custom_icons()

@app.post("/custom-icons", response_model=CustomIcon)
def add_custom_icon(icon: CustomIcon):
    icons = _load_custom_icons()
    # Prevent duplicate names
    if any(i["name"] == icon.name for i in icons):
        raise HTTPException(400, f"Ícone '{icon.name}' já existe")
    icons.append(icon.model_dump())
    _save_custom_icons(icons)
    return icon

@app.delete("/custom-icons/{name}")
def delete_custom_icon(name: str):
    icons = _load_custom_icons()
    filtered = [i for i in icons if i["name"] != name]
    if len(filtered) == len(icons):
        raise HTTPException(404, f"Ícone '{name}' não encontrado")
    _save_custom_icons(filtered)
    return {"message": f"Ícone '{name}' removido"}
