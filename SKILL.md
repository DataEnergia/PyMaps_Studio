# PyMaps Studio — SKILL de Preparação de Dados

> **skill:** `pymaps-data-preparation`  
> **versão:** 1.0  
> **idioma:** pt-BR (conteúdo dos dados pode ser qualquer idioma)  
> **público:** Agentes de IA (LLMs) que ajudam usuários a preparar dados para o PyMaps Studio  

---

## 1. Visão Geral

O **PyMaps Studio** é um estúdio cartográfico para criação de infográficos e visualizações de dados geoespaciais do Brasil. Ele funciona como um canvas WYSIWYG onde o usuário monta dashboards combinando blocos (mapas, gráficos, tabelas, cards, texto, imagens) e exporta em PNG, SVG ou PDF.

Este SKILL instrui agentes de IA a **preparar, limpar e formatar dados tabulares** para que o usuário possa simplesmente fazer upload no PyMaps e a visualização funcione imediatamente — sem precisar renomear colunas, converter tipos ou adivinhar configurações.

### Formatos de entrada aceitos pelo PyMaps
- **CSV** (UTF-8, separador vírgula ou ponto-e-vírgula)
- **Excel** (.xls, .xlsx)
- **GeoJSON** (.geojson, .json) — apenas para camadas customizadas

### Tipos de bloco que usam dados
| Bloco | Descrição |
|---|---|
| **Mapa Coroplético** | Áreas coloridas por valor (ex: produção por município) |
| **Camadas de Pontos** | Marcadores no mapa com latitude/longitude |
| **Gráficos** | Barras, linhas, pizza, dispersão, radar, etc. |
| **Tabelas** | Dados tabulares formatados |
| **GeoJSON Customizado** | Sobreposição de polígonos, linhas ou pontos |

---

## 2. Mapa Coroplético (Choropleth)

> **Uso:** Quando o usuário quer colorir áreas do mapa (municípios, UFs ou regiões) de acordo com um valor numérico.  
> **Exemplo de pedido do usuário:** *"Crie um mapa da produção de soja por município em São Paulo"*

### 2.1 — Colunas Obrigatórias

| # | Coluna | Tipo | Descrição |
|---|---|---|---|
| 1 | **Identificador geográfico** | `string` ou `number` | Código IBGE, sigla UF ou nome da área |
| 2 | **Valor** | `number` | Valor numérico que define a cor (inteiro ou decimal) |

### 2.2 — Identificadores Geográficos Aceitos

O PyMaps faz "join" entre os dados do usuário e o GeoJSON do IBGE. O sistema reconhece **automaticamente** os seguintes formatos de identificação:

| Formato | Exemplo | Nível geográfico | Confiabilidade |
|---|---|---|---|
| Código IBGE de município (7 dígitos) | `3500105` | Município | ⭐⭐⭐ Excelente |
| Código IBGE de município (6 dígitos) | `350010` | Município | ⭐⭐⭐ Excelente |
| Sigla da UF (2 letras maiúsculas) | `SP`, `RJ`, `MG` | UF | ⭐⭐⭐ Excelente |
| Código da UF (2 dígitos) | `35`, `33`, `31` | UF | ⭐⭐⭐ Excelente |
| Código da região (1 dígito) | `1`, `2`, `3`, `4`, `5` | Região | ⭐⭐⭐ Excelente |
| Nome do município | `São Paulo`, `Adamantina` | Município | ⭐⭐ Bom¹ |
| Nome da UF | `São Paulo`, `Minas Gerais` | UF | ⭐⭐ Bom¹ |
| Nome da região | `Norte`, `Sudeste` | Região | ⭐⭐ Bom¹ |

> **¹ Atenção com nomes:** O sistema remove acentos, ignora case (maiúsculas/minúsculas) e remove espaços e caracteres especiais ao fazer a correspondência. Portanto, `São Paulo`, `sao paulo`, `SAOPAULO` e `São  Paulo` são todos equivalentes. **No entanto**, prefira sempre usar códigos IBGE ou siglas quando disponíveis, pois nomes podem ter variações (`Embu` vs `Embu das Artes`).

### 2.3 — Coluna de Valor

- **Deve ser numérica.** Valores como `"125.000"`, `125000`, `125000.5` são aceitos.
- **Não pode conter texto misturado.** Exemplos inválidos: `125 mil`, `R$ 125.000`, `N/D`, `-`, `*`.
- **Valores nulos, vazios ou não-numéricos** são ignorados (o município/UF ficará sem cor).
- **Use ponto como separador decimal** no CSV (ex: `125000.5`). O PyMaps interpreta corretamente.

### 2.4 — Colunas Opcionais Recomendadas

| Coluna | Tipo | Descrição |
|---|---|---|
| `unidade` | `string` | Unidade de medida para a legenda: `t`, `ha`, `R$`, `%`, `kg/ha`, `m³`, etc. |
| `nome_area` | `string` | Nome legível da área (para referência, não usado no join) |

### 2.5 — Níveis Geográficos Detectados Automaticamente

O PyMaps detecta o nível geográfico pela amostra dos dados:

| Padrão detectado | Nível | GeoJSON carregado |
|---|---|---|
| 50%+ dos IDs têm 6-7 dígitos numéricos | `município` | GeoJSON de UFs necessárias |
| 50%+ dos IDs são siglas de UF (2 letras) ou 2 dígitos (11-53) | `uf` | GeoJSON do Brasil |
| 50%+ dos IDs são 1 dígito (1-5) | `região` | GeoJSON do Brasil |
| Nenhum padrão claro | `desconhecido` | GeoJSON do Brasil (tentativa genérica) |

> **Nota para o agente:** Se o nível for `município`, o PyMaps carrega o GeoJSON de **cada UF necessária** separadamente. Se o arquivo tiver municípios de todo o Brasil, isso pode levar alguns segundos.

### 2.6 — Paletas de Cores Disponíveis

O usuário pode escolher uma paleta no PyMaps. O agente pode sugerir uma apropriada. As opções são:

`blue` (azul), `orange` (laranja), `green` (verde), `purple` (roxo), `red` (vermelho), `teal`, `amber` (âmbar), `emerald` (esmeralda), `cyan` (ciano), `rose` (rosa), `pink`, `yellow` (amarelo), `lime` (lima), `fuchsia` (fúcsia), `slate` (ardósia), `brown` (marrom), `indigo` (índigo), `sky` (céu), `seismic` (sísmico), `coolwarm` (frio-quente)

> **Dica:** Para dados de agricultura/biocombustíveis, `green` ou `emerald` são semanticamente apropriados. Para dados de alerta/perigo, `red` ou `orange`. Para dados neutros, `blue` ou `slate`.

### 2.7 — Classes (Faixas de Cor)

Padrão: **5 classes** (quintis). Opções: 3, 5 ou 7.  
Quanto mais classes, mais detalhada a diferenciação visual.

### 2.8 — Exemplo de CSV Pronto para Choropleth

```csv
codigo_ibge,producao_soja_t,unidade
3500105,125000,t
3500204,89000,t
3500303,156000,t
3500402,78000,t
3500501,203000,t
3500600,95000,t
3500709,112000,t
3500808,67000,t
3500907,145000,t
3501004,178000,t
```

> **Regras deste exemplo:**
> - Coluna de ID: `codigo_ibge` com 7 dígitos (municípios de SP)
> - Coluna de valor: `producao_soja_t` (número inteiro)
> - Coluna de unidade: `t` (toneladas)
> - Sem acentos no nome da coluna (bom, mas não obrigatório)
> - Nenhum valor nulo ou texto misturado

---

## 3. Camadas de Pontos (Point Layers)

> **Uso:** Quando o usuário quer mostrar localizações específicas no mapa (usinas, fábricas, reservatórios, etc.).  
> **Exemplo de pedido:** *"Mostre as usinas de etanol no mapa do Brasil"*

### 3.1 — Colunas Obrigatórias

| # | Coluna | Tipo | Descrição | Exemplo |
|---|---|---|---|---|
| 1 | `lat` ou `latitude` | `number` | Latitude em graus decimais | `-23.5505` |
| 2 | `lon`, `lng` ou `longitude` | `number` | Longitude em graus decimais | `-46.6333` |

### 3.2 — Regras de Coordenadas

- **Sistema:** WGS84 (graus decimais), que é o padrão do GPS e Google Maps.
- **Latitudes do Brasil:** aproximadamente entre `5` (Norte) e `-34` (Sul).
- **Longitudes do Brasil:** aproximadamente entre `-74` (Oeste) e `-34` (Leste).
- **Valores fora desta faixa** provavelmente estão trocados ou em outro sistema.
- **Separador decimal:** ponto (`.`), não vírgula.
- **Não use formato DMS** (graus, minutos, segundos como `23° 33' 02"S`). Converta para decimal.

### 3.3 — Colunas Opcionais Recomendadas

| Coluna | Tipo | Descrição |
|---|---|---|
| `nome` ou `label` | `string` | Nome do ponto (aparece no tooltip) |
| `cor` ou `color` | `string` | Cor do marcador em hex (`#2563eb`) |
| `tamanho` ou `size` | `number` | Tamanho do marcador (2 a 48, padrão 6) |
| `categoria` | `string` | Para agrupar pontos por cor/tamanho |
| `info` | `string` | Texto adicional para tooltip |

### 3.4 — Exemplo de CSV Pronto para Pontos

```csv
nome,lat,lon,cor,tamanho,categoria
Usina A - Piracicaba,-22.7342,-47.6481,#2563eb,8,Etanol
Usina B - São José do Rio Preto,-20.8118,-49.3762,#e74c3c,6,Açúcar
Usina C - Ribeirão Preto,-21.1704,-47.8103,#2ecc71,10,Etanol
Usina D - Bauru,-22.3145,-49.0587,#f39c12,6,Biodiesel
Usina E - Franca,-20.5386,-47.4008,#9b59b6,8,Etanol
```

---

## 4. Gráficos (Charts)

> **Uso:** Quando o usuário quer criar barras, linhas, pizza, etc.  
> **Exemplo de pedido:** *"Crie um gráfico de barras comparando a produção de soja por UF"*

### 4.1 — Tipos de Gráfico Suportados

| Tipo | Descrição | Categoria |
|---|---|---|
| `bar` | Barras verticais | Comparação |
| `line` | Linha | Tendência temporal |
| `area` | Área preenchida | Tendência com volume |
| `pie` | Pizza | Proporções |
| `donut` | Rosca | Proporções + centro livre |
| `scatter` | Dispersão | Correlação X vs Y |
| `stacked` | Barras empilhadas | Composição por categoria |
| `composed` | Barras + linha | Comparação + tendência |
| `treemap` | Retângulos aninhados | Hierarquia |
| `funnel` | Funil | Etapas de conversão |
| `radar` | Radar | Múltiplas variáveis |
| `radial` | Anéis concêntricos | Composição radial |

### 4.2 — Estrutura de Dados por Tipo

#### Gráficos simples (`bar`, `line`, `area`, `pie`, `donut`, `treemap`, `funnel`, `radial`)

```csv
categoria,valor
São Paulo,350000
Minas Gerais,280000
Paraná,190000
Goiás,160000
Mato Grosso,420000
```

- `categoria`: rótulo do eixo X ou fatia do gráfico (string)
- `valor`: valor numérico

#### Gráfico de dispersão (`scatter`)

```csv
x,y
10,25
20,40
30,35
40,60
50,55
```

- `x`: valor do eixo horizontal
- `y`: valor do eixo vertical

#### Gráfico empilhado (`stacked`)

```csv
categoria,serie_2023,serie_2024
São Paulo,320000,350000
Minas Gerais,250000,280000
Paraná,170000,190000
```

- `categoria`: rótulo do eixo X
- `serie_2023`, `serie_2024`: uma coluna numérica por série
- O PyMaps usa `values` (primeira série) e `values2` (segunda série)

#### Gráfico composto (`composed`)

Mesma estrutura do `stacked`, mas o PyMaps renderiza uma série como barras e outra como linha.

#### Gráfico radar (`radar`)

```csv
categoria,indicador_a,indicador_b,indicador_c
São Paulo,85,92,78
Minas Gerais,72,88,65
Paraná,90,75,82
```

- `categoria`: nome da amostra (cada linha = um polígono no radar)
- `indicador_a`, `indicador_b`, etc.: colunas numéricas = eixos do radar

### 4.3 — Regras Gerais para Gráficos

- **Nomes de colunas:** use nomes intuitivos. O PyMaps usa a primeira coluna como `categoria` e a segunda como `valor` por padrão.
- **Valores:** devem ser numéricos. O PyMaps formata automaticamente com separador de milhares (pt-BR).
- **Prefixo/Sufixo:** pode ser adicionado manualmente no PyMaps (ex: `R$`, `%`, `t`).
- **Cores:** o PyMaps usa uma paleta padrão de 10 cores. O usuário pode customizar no app.

### 4.4 — Exemplo Completo: Gráfico de Barras

```csv
uf,producao_soja_2024_t,unidade
Mato Grosso,4200000,t
Paraná,1900000,t
Rio Grande do Sul,1600000,t
Goiás,1500000,t
Minas Gerais,1200000,t
São Paulo,800000,t
```

---

## 5. Tabelas (Tables)

> **Uso:** Quando o usuário quer mostrar dados tabulares no infográfico.  
> **Exemplo de pedido:** *"Crie uma tabela com os 10 maiores produtores de soja"*

### 5.1 — Estrutura

- Primeira linha = cabeçalho com nomes das colunas.
- O PyMaps detecta automaticamente o tipo de dado (`text`, `number`, `currency`, `percent`, `date`).
- Não é necessário informar o tipo no CSV.

### 5.2 — Templates de Tabela Disponíveis

O usuário escolhe no PyMaps: `editorial`, `minimal`, `striped`, `card`, `comparison`, `ranking`, `heatmap`

### 5.3 — Exemplo

```csv
rank,municipio,uf,producao_t,area_ha,rendimento_kg_ha
1,Sorriso,MT,850000,280000,30.4
2,Rio Verde,GO,620000,210000,29.5
3,Luís Eduardo Magalhães,BA,580000,195000,29.7
4,Campo Novo do Parecis,MT,540000,180000,30.0
5,Sapezal,MT,510000,175000,29.1
```

---

## 6. GeoJSON Customizado

> **Uso:** Quando o usuário tem dados geoespaciais próprios (polígonos de áreas de plantio, rotas de transporte, etc.).  
> **Exemplo:** *"Sobrepoña no mapa as áreas de preservação permanente"*

### 6.1 — Requisitos

- Deve ser um **GeoJSON válido** (`FeatureCollection`).
- Cada `Feature` deve ter um objeto `properties` (pode estar vazio, mas é recomendado ter dados).
- Propriedades de ID reconhecidas: `CD_MUN`, `codigo_ibge`, `codarea`, `CD_UF`, `id`

### 6.2 — Tipos de Geometria Aceitos

| Tipo | Uso |
|---|---|
| `Point` | Pontos customizados |
| `LineString` | Linhas (rotas, dutovias, linhas de transmissão) |
| `Polygon` | Polígonos (áreas de plantio, reservas, bacias) |

### 6.3 — Exemplo de GeoJSON

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "nome": "Área de Plantio A",
        "cultura": "Soja",
        "area_ha": 1250
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [-47.8, -22.3],
            [-47.7, -22.3],
            [-47.7, -22.4],
            [-47.8, -22.4],
            [-47.8, -22.3]
          ]
        ]
      }
    }
  ]
}
```

---

## 7. Fluxo de Trabalho do Agente (Passo a Passo)

Quando o usuário fizer um pedido como:
> *"Analise estes dados de soja e prepare para um mapa coroplético no PyMaps"*

Siga **estritamente** os passos abaixo:

### Passo 1 — Entender o pedido
- Identifique o **tipo de visualização** desejada (mapa coroplético, pontos, gráfico, tabela).
- Identifique o **nível geográfico** (município, UF, região) se for mapa.
- Anote a **unidade de medida** se mencionada (toneladas, hectares, reais, etc.).

### Passo 2 — Analisar os dados brutos
- Leia o arquivo fornecido pelo usuário.
- Liste todas as colunas e seus tipos.
- Identifique colunas que podem servir como ID geográfico ou coordenadas.
- Verifique se há valores nulos, textos misturados com números, ou formatos estranhos.

### Passo 3 — Limpar e padronizar

**Para mapa coroplético:**
- Renomeie a coluna de ID para um nome claro (`codigo_ibge`, `sigla_uf`, `nome_municipio`, etc.).
- Padronize códigos IBGE para **7 dígitos** (adicione zero à esquerda se necessário: `35010` → `3500105`).
  - Atenção: códigos de 6 dígitos são aceitos, mas 7 dígitos é o padrão IBGE completo.
- Converta a coluna de valor para numérico (trate vírgula como separador decimal se o dado vier em pt-BR).
- Remova linhas com valores nulos ou inválidos na coluna de valor.
- Normalize nomes de municípios/UFs se forem usados como ID (remova espaços duplos, padronize capitalização).

**Para camadas de pontos:**
- Identifique e renomeie colunas de latitude e longitude para `lat` e `lon`.
- Converta coordenadas de DMS para decimal, se necessário.
- Verifique se latitudes estão entre -35 e 5 (Brasil) e longitudes entre -75 e -35.
- Remova pontos com coordenadas inválidas ou nulas.

**Para gráficos:**
- Renomeie colunas para `categoria` e `valor` (ou múltiplas séries conforme o tipo).
- Converta valores para numérico.
- Ordene categorias de forma lógica (alfabética, cronológica ou por valor descendente).

### Passo 4 — Adicionar metadados
- Adicione uma coluna `unidade` se aplicável (para mapas coropléticos).
- Adicione uma coluna `fonte` se o usuário mencionar a origem dos dados.
- Inclua o ano ou período no nome da coluna de valor (ex: `producao_2024_t`).

### Passo 5 — Validar
Antes de entregar, verifique:
- [ ] **IDs geográficos** estão no formato correto e consistente.
- [ ] **Valores numéricos** não contêm texto, símbolos de moeda ou unidades misturadas.
- [ ] **Não há linhas duplicadas** de ID geográfico (a menos que seja intencional, como pontos).
- [ ] **Unidade de medida** está clara e consistente.
- [ ] **Nomes de colunas** são intuitivos e em minúsculas com underscore.
- [ ] **Número de registros** faz sentido:
  - Municípios: ~5.570 registros para Brasil completo
  - UFs: 27 registros (26 estados + DF)
  - Regiões: 5 registros
- [ ] **Coordenadas** (se houver) estão em graus decimais com ponto como separador.

### Passo 6 — Gerar o arquivo final
- Exporte como **CSV** (UTF-8, separador vírgula, ponto como decimal).
- Ou exporte como **Excel** (.xlsx) se o usuário preferir.
- Nomeie o arquivo de forma descritiva: `soja_sp_municipios_2024.csv`.

### Passo 7 — Instruir o usuário
- Informe **exatamente como usar** o arquivo no PyMaps:
  - Qual bloco criar (mapa, gráfico, etc.).
  - Qual aba do painel lateral usar ("Camada Coroplética", "Camadas de Pontos", etc.).
  - Quais colunas selecionar no dropdown do PyMaps.
  - Qual paleta de cor sugerir (se aplicável).

---

## 8. Exemplos Completos de Transformação

### Exemplo A — Soja por município (dados do SIDRA)

**Entrada típica (bruta):**
```csv
Município (Código),Município,Variável,Ano,Produção
3500105,Adamantina (SP),Produção de soja em grão,2024,"125.000"
3500204,Adolfo (SP),Produção de soja em grão,2024,"89.000"
```

**Problemas identificados:**
1. Código do município vem com nome concatenado: `3500105` (OK) mas `Município` tem nome + UF.
2. Coluna `Produção` usa ponto como separador de milhar: `"125.000"` (pode ser confundido com decimal).
3. Coluna `Variável` é redundante (todos são "Produção de soja em grão").
4. Coluna `Ano` é uniforme (2024).

**Saída preparada:**
```csv
codigo_ibge,producao_soja_t,unidade
3500105,125000,t
3500204,89000,t
3500303,156000,t
3500402,78000,t
3500501,203000,t
```

**Instruções ao usuário:**
> Arquivo pronto! No PyMaps:
> 1. Crie um bloco de **Mapa**.
> 2. No painel esquerdo, vá em **Camada Coroplética**.
> 3. Faça upload do arquivo.
> 4. Selecione `codigo_ibge` como coluna de área.
> 5. Selecione `producao_soja_t` como coluna de valor.
> 6. A unidade `t` já está configurada na legenda.
> 7. Sugestão de paleta: `green` ou `emerald`.

---

### Exemplo B — Usinas de biocombustíveis (lista de endereços)

**Entrada típica (bruta):**
```csv
Nome,Município,UF,Endereço,Capacidade_m3_dia
Usina Piracicaba,Piracicaba,SP,"Av. Industrial, 1000",50000
Usina Sertãozinho,Sertãozinho,SP,"Rua Açúcar, 500",35000
```

**Problemas identificados:**
1. Não há latitude/longitude — é necessário geocodificar os endereços ou municípios.
2. `Capacidade_m3_dia` tem unidade no nome da coluna.

**Abordagem:**
- Se o agente tiver acesso a geocodificação: obtenha lat/lon para cada município.
- Se não tiver: informe ao usuário que ele precisará geocodificar, ou use apenas o município como ponto central (aproximado).

**Saída preparada (com geocodificação):**
```csv
nome,municipio,uf,lat,lon,capacidade_m3_dia,cor,categoria
Usina Piracicaba,Piracicaba,SP,-22.7342,-47.6481,50000,#2563eb,Etanol
Usina Sertãozinho,Sertãozinho,SP,-21.1378,-47.9903,35000,#e74c3c,Açúcar
```

**Instruções ao usuário:**
> Arquivo pronto! No PyMaps:
> 1. Crie um bloco de **Mapa**.
> 2. No painel esquerdo, vá em **Camadas de Pontos**.
> 3. Faça upload do arquivo.
> 4. Selecione `lat` e `lon` como colunas de coordenadas.
> 5. Dê um nome à camada (ex: "Usinas de Etanol").
> 6. Os pontos serão filtrados automaticamente pela área do mapa.

---

### Exemplo C — Produção por UF para gráfico de barras

**Entrada típica (bruta):**
```csv
UF,Produção (t)
Mato Grosso,"42.000.000"
Paraná,"19.000.000"
Rio Grande do Sul,"16.000.000"
```

**Problemas:**
1. Separador de milhar é ponto no Brasil, mas pode ser interpretado como decimal.
2. Nome da coluna tem espaços e parênteses.

**Saída preparada:**
```csv
categoria,valor
Mato Grosso,42000000
Paraná,19000000
Rio Grande do Sul,16000000
```

**Instruções ao usuário:**
> Arquivo pronto! No PyMaps:
> 1. Crie um bloco de **Gráfico**.
> 2. Selecione o tipo **Barras**.
> 3. Faça upload do arquivo.
> 4. O PyMaps usará `categoria` como eixo X e `valor` como altura das barras.
> 5. Adicione o sufixo `t` (toneladas) nas configurações do gráfico.
> 6. Sugestão: ordene por valor descendente para melhor visualização.

---

## 9. Limitações e Dicas Importantes

### Limitações do PyMaps
1. **Apenas Brasil:** O PyMaps usa a API do IBGE para GeoJSON. Não funciona para outros países.
2. **Um nível geográfico por mapa coroplético:** Não é possível misturar municípios e UFs no mesmo mapa coroplético.
3. **GeoJSON de municípios é carregado por UF:** Se o arquivo tiver municípios de todo o Brasil, o carregamento pode levar alguns segundos.
4. **Sem suporte a shapefiles diretamente:** Converta shapefiles para GeoJSON antes de importar.
5. **Tamanho de arquivo:** CSVs com até ~50.000 linhas funcionam bem. Excel muito grandes podem demorar.

### Dicas para o Agente
1. **Sempre prefira código IBGE** a nomes de municípios para mapas coropléticos.
2. **Converta unidades explicitamente** se o usuário pedir (ex: converter `kg` para `t` dividindo por 1000).
3. **Verifique duplicatas de ID** em mapas coropléticos — cada município/UF deve aparecer uma única vez.
4. **Para dados temporais**, crie colunas separadas por ano (ex: `producao_2023`, `producao_2024`) para gráficos empilhados/comparativos.
5. **Se os dados vierem do SIDRA, IBGE ou similar**, provavelmente já terão código IBGE — aproveite isso.
6. **Sempre informe ao usuário** qual coluna é o ID e qual é o valor no arquivo gerado.
7. **Se o nível geográfico não puder ser determinado** (ex: nomes de municípios de fora do Brasil), avise o usuário imediatamente.

### Anti-Padrões (O que NÃO fazer)
- ❌ Não deixe unidades dentro da coluna de valor (`125 t`, `R$ 125.000`).
- ❌ Não use vírgula como separador decimal no CSV (use ponto).
- ❌ Não misture níveis geográficos (municípios e UFs na mesma coluna de ID).
- ❌ Não deixe linhas com IDs duplicados sem justificativa.
- ❌ Não forneça coordenadas em DMS (graus, minutos, segundos) sem converter.
- ❌ Não esqueça de remover cabeçalhos duplos ou notas de rodapé dos dados brutos.

---

## 10. Referência Rápida: Nome das Colunas

Use esta convenção para nomear colunas no arquivo final:

| Contexto | Nome da coluna recomendado | Tipo |
|---|---|---|
| ID geográfico (IBGE 7 dígitos) | `codigo_ibge` | number/string |
| ID geográfico (sigla UF) | `sigla_uf` | string |
| ID geográfico (nome município) | `nome_municipio` | string |
| Latitude | `lat` | number |
| Longitude | `lon` | number |
| Valor numérico | `producao_xxx`, `valor_xxx`, `indicador_xxx` | number |
| Unidade | `unidade` | string |
| Categoria (gráficos) | `categoria` | string |
| Ano/Período | `ano`, `periodo` | number/string |
| Nome do ponto | `nome` | string |
| Cor do ponto | `cor` | string (hex) |

---

## 11. Checklist Final de Entrega

Antes de entregar o arquivo ao usuário, confirme mentalmente:

- [ ] O arquivo está no formato correto (CSV UTF-8 ou Excel)?
- [ ] As colunas têm nomes claros e sem espaços?
- [ ] Os valores numéricos estão realmente numéricos (sem texto misturado)?
- [ ] Os IDs geográficos estão consistentes (todos do mesmo tipo: IBGE, sigla ou nome)?
- [ ] Não há duplicatas de ID (para mapas coropléticos)?
- [ ] A unidade de medida está separada da coluna de valor?
- [ ] As coordenadas estão em graus decimais com ponto como separador?
- [ ] O número de registros faz sentido para o nível geográfico?
- [ ] Foram dadas instruções claras de como usar no PyMaps?
- [ ] O nome do arquivo é descritivo?

---

*Documento gerado para PyMaps Studio v3.0+. Atualize este skill sempre que houver mudanças significativas na API de dados ou nos blocos suportados.*
