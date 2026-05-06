import { useQuery } from '@tanstack/react-query'
import { ibgeApi } from '../services/api'

export const useRegions = () =>
  useQuery({ queryKey: ['regions'], queryFn: ibgeApi.getRegions, staleTime: Infinity })

export const useUfs = (regionId?: number) =>
  useQuery({
    queryKey: ['ufs', regionId],
    queryFn: () => ibgeApi.getUfs(regionId),
    enabled: true,
    staleTime: 1000 * 60 * 5,
  })

export const useMunicipios = (ufId?: number) =>
  useQuery({
    queryKey: ['municipios', ufId],
    queryFn: () => ibgeApi.getMunicipios(ufId),
    enabled: true,
    staleTime: 1000 * 60 * 5,
  })
