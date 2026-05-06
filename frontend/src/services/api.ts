import axios from 'axios'
import { Region, UF, Municipio, UploadedData, PointData, FilterResult } from '../types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// Add response interceptor for better error messages
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.detail || error.message || 'Erro desconhecido'
    return Promise.reject(new Error(message))
  }
)

// Module-level GeoJSON cache — avoids redundant fetches when the user
// navigates tabs or re-applies choropleth with the same geographic level.
const _geojsonCache = new Map<string, Promise<unknown>>()

export const ibgeApi = {
  getRegions: () => api.get<Region[]>('/regions').then(r => r.data),
  getUfs: (regionId?: number) =>
    api.get<UF[]>('/ufs', { params: regionId ? { region_id: regionId } : {} }).then(r => r.data),
  getMunicipios: (ufId?: number) =>
    api.get<Municipio[]>('/municipios', { params: ufId ? { uf_id: ufId } : {} }).then(r => r.data),
  getAreaName: (type: string, id: number) =>
    api.get<{ nome: string }>(`/area-name/${type}/${id}`).then(r => r.data.nome),
  getGeoJSON: (type: string, id?: number | null): Promise<unknown> => {
    const key = `${type}:${id ?? ''}`
    if (!_geojsonCache.has(key)) {
      _geojsonCache.set(key, api.get('/geojson/' + type, { params: id ? { area_id: id } : {} }).then(r => r.data))
    }
    return _geojsonCache.get(key)!
  },
}

export const uploadApi = {
  uploadFile: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<UploadedData>('/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
}

export const geoApi = {
  filterPoints: (points: PointData[], geojson: unknown) =>
    api.post<FilterResult>('/filter-points', {
      points,
      area_geojson: geojson,
    }).then(r => r.data),
}

// ── Iconify search ──
export interface IconifySearchResult {
  icons: string[]
  total: number
}

export const iconifyApi = {
  search: (query: string, limit = 48) =>
    api.get<IconifySearchResult>('/iconify/search', { params: { query, limit } }).then(r => r.data),
  getSvg: (prefix: string, name: string) =>
    api.get<{ svg: string; prefix: string; name: string }>('/iconify/svg', { params: { prefix, name } }).then(r => r.data),
}

// ── Custom Icons ──
export interface CustomIcon {
  name: string
  label: string
  category: string
  svg: string
}

export const customIconApi = {
  list: () => api.get<CustomIcon[]>('/custom-icons').then(r => r.data),
  create: (icon: CustomIcon) => api.post<CustomIcon>('/custom-icons', icon).then(r => r.data),
  delete: (name: string) => api.delete(`/custom-icons/${name}`).then(r => r.data),
}
