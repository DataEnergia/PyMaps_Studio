# PyMaps Studio

PyMaps Studio e uma plataforma web para criacao rapida de mapas tematicos e infograficos geoespaciais, com foco em usuarios que nao dominam ferramentas de GIS tradicional como QGIS ou ArcGIS.

O objetivo do projeto e reduzir a complexidade do geoprocessamento para tarefas de comunicacao visual: carregar dados tabulares, vincular automaticamente com malhas geograficas e gerar composicoes visuais prontas para exportacao.

## Proposta do projeto

O PyMaps foi concebido para pessoas que precisam construir mapas e graficos de forma simples e rapida, sem depender de fluxo tecnico avancado de SIG.

- Nao e um substituto direto de suites GIS para analise espacial aprofundada.
- E um estudio de composicao visual orientado a infograficos.
- Prioriza produtividade, iteracao rapida e exportacao de materiais de apresentacao.

## Escopo geoespacial atual

As malhas do Brasil ja estao incorporadas no projeto, incluindo niveis:

- Regional
- Estadual (UF)
- Municipal

O sistema tambem aceita extensao com outras malhas (ex.: GeoJSON customizado), permitindo adaptar o uso para diferentes dominios.

## Arquitetura tecnica

O projeto e dividido em dois blocos principais:

### Frontend (`frontend/`)

- React + Vite + TypeScript
- Estado local com Zustand
- Renderizacao cartografica com MapLibre GL
- Composicao de blocos visuais (mapas, graficos, tabelas, cards, textos, formas)
- Exportacao visual em SVG e formatos derivados

Responsabilidades principais:

- Edicao WYSIWYG em canvas de infografico
- Carregamento/salvamento de projeto em JSON local
- Configuracao de camadas, estilos e elementos visuais
- Orquestracao da exportacao final

### Backend (`backend/`)

- FastAPI
- SQLAlchemy (persistencia local)
- Pandas/GeoPandas/Shapely para processamento de dados geoespaciais
- Endpoints para malhas, uploads, filtros e servicos auxiliares

Responsabilidades principais:

- Servir metadados geograficos e malhas
- Realizar ingestao de CSV/XLSX
- Executar operacoes de filtro espacial e normalizacao de dados
- Expor APIs utilitarias consumidas pelo frontend

## Pipeline de dados (visao geral)

1. Usuario carrega dados tabulares (CSV/Excel) ou GeoJSON.
2. Backend valida e transforma estruturas para formato consumivel.
3. Frontend associa os dados a camadas de mapa e blocos de grafico.
4. Usuario compoe o infografico no studio.
5. Projeto pode ser salvo localmente em JSON e reaberto depois.
6. Composicao final e exportada para uso em relatorios, apresentacoes ou publicacoes.

## Diferenciais praticos

- Curva de aprendizado menor para quem nao tem experiencia em GIS.
- Fluxo integrado de mapa + grafico + narrativa visual em um unico studio.
- Estrutura pronta para uso com malhas brasileiras.
- Extensivel para novas malhas e novos cenarios de dados.

## Posicionamento

PyMaps Studio nao busca competir com plataformas de analise geoespacial avancada.
O foco e entregar um ambiente tecnico de producao visual geoespacial para criacao rapida de infograficos, mantendo controle suficiente para uso profissional.

## Licenca

Este repositorio esta licenciado sob Apache-2.0. Consulte o arquivo `LICENSE`.
