export interface Region {
  id: number
  nome: string
}

export interface UF {
  id: number
  nome: string
}

export interface Municipio {
  id: number
  nome: string
}

export interface UploadedData {
  data: Record<string, unknown>[]
  columns: string[]
  row_count: number
}

export interface PointData {
  lat: number
  lon: number
}

export interface FilterResult {
  filtered_points: PointData[]
  total: number
  matched: number
}


