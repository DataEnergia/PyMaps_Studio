from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal, Union
from enum import Enum


class BlockType(str, Enum):
    MAP = "map"
    CARD = "card"
    CHART = "chart"
    TEXT = "text"
    TABLE = "table"
    IMAGE = "image"
    TIMELINE = "timeline"
    MINIMAP = "minimap"
    CONNECTOR = "connector"
    DIVIDER = "divider"


class ChartType(str, Enum):
    BAR = "bar"
    LINE = "line"
    PIE = "pie"
    SCATTER = "scatter"
    DONUT = "donut"
    AREA = "area"


class Bounds(BaseModel):
    x: int
    y: int
    w: int
    h: int


class AreaSpec(BaseModel):
    type: str = Field(description="region | uf | municipio | brasil")
    id: Optional[int] = None
    nome: Optional[str] = None


class MapMarker(BaseModel):
    lat: float
    lon: float
    label: Optional[str] = None
    color: Optional[str] = "#E53935"
    size: Optional[int] = 10


class MapBlockConfig(BaseModel):
    area: AreaSpec
    style: Literal["light", "dark"] = "light"
    basemap: Literal["none", "road", "terrain", "satellite"] = "road"
    markers: List[MapMarker] = []
    showLabels: bool = True
    zoom: Optional[float] = None
    center: Optional[List[float]] = None
    fillColor: Optional[str] = "#e09a3a"
    borderColor: Optional[str] = "#7a8a9a"
    borderWidth: Optional[int] = 1
    markerColor: Optional[str] = "#d9822b"
    markerSize: Optional[int] = 8


class CardBlockConfig(BaseModel):
    title: str
    value: str
    subtitle: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = "#1B5E20"
    backgroundColor: Optional[str] = None


class ChartData(BaseModel):
    labels: List[str]
    values: List[float]
    datasetLabel: Optional[str] = None


class ChartBlockConfig(BaseModel):
    chartType: ChartType = ChartType.BAR
    title: Optional[str] = None
    data: ChartData
    colors: List[str] = []
    showLegend: bool = True
    showValues: bool = True
    horizontal: bool = False


class TextBlockConfig(BaseModel):
    content: str
    fontSize: Optional[int] = 14
    alignment: Literal["left", "center", "right"] = "left"
    heading: Optional[str] = None
    headingSize: Optional[int] = 18


class TableColumn(BaseModel):
    key: str
    label: str
    align: Literal["left", "center", "right"] = "left"
    format: Optional[str] = None


class TableBlockConfig(BaseModel):
    columns: List[TableColumn]
    rows: List[Dict[str, Any]]
    title: Optional[str] = None
    striped: bool = True
    maxRows: Optional[int] = 20


class ImageBlockConfig(BaseModel):
    src: str
    alt: Optional[str] = None
    fit: Literal["contain", "cover", "fill"] = "cover"
    borderRadius: Optional[int] = 0


class TimelineEvent(BaseModel):
    date: str
    title: str
    subtitle: Optional[str] = None
    value: Optional[str] = None
    color: Optional[str] = None


class TimelineBlockConfig(BaseModel):
    orientation: Literal["horizontal", "vertical"] = "horizontal"
    events: List[TimelineEvent]
    title: Optional[str] = None
    showValues: bool = True


class MinimapBlockConfig(BaseModel):
    area: AreaSpec
    highlightPosition: Optional[List[float]] = None
    highlightLabel: Optional[str] = None
    label: Optional[str] = None


class ConnectorAnchor(BaseModel):
    blockId: Optional[str] = None
    anchor: Optional[str] = "center"
    x: Optional[int] = None
    y: Optional[int] = None


class ConnectorBlockConfig(BaseModel):
    fromAnchor: ConnectorAnchor
    toAnchor: ConnectorAnchor
    style: Literal["straight", "curved", "orthogonal"] = "curved"
    color: Optional[str] = "var(--accent)"
    strokeWidth: Optional[int] = 2
    dashed: bool = False
    arrowEnd: bool = True
    label: Optional[str] = None


class DividerBlockConfig(BaseModel):
    orientation: Literal["horizontal", "vertical"] = "horizontal"
    color: Optional[str] = "var(--border)"
    thickness: Optional[int] = 1
    style: Literal["solid", "dashed", "dotted"] = "solid"
    label: Optional[str] = None


class Block(BaseModel):
    id: str
    type: BlockType
    bounds: Bounds
    config: Union[
        MapBlockConfig,
        CardBlockConfig,
        ChartBlockConfig,
        TextBlockConfig,
        TableBlockConfig,
        ImageBlockConfig,
        TimelineBlockConfig,
        MinimapBlockConfig,
        ConnectorBlockConfig,
        DividerBlockConfig,
        Dict[str, Any],
    ]
    zIndex: Optional[int] = None
    locked: bool = False


class CanvasSpec(BaseModel):
    width: int = 1200
    height: int = 800
    background: str = "var(--surface)"


class InfographicSpec(BaseModel):
    canvas: CanvasSpec = Field(default_factory=CanvasSpec)
    blocks: List[Block] = []
    title: Optional[str] = None
    description: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
