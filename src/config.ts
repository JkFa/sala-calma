/**
 * Configuração central do app. Para trocar o nome, mude só aqui
 * (e rode o build: o manifest e o <title> leem estes valores).
 */
export const APP = {
  name: 'Sala Calma',
  shortName: 'Sala Calma',
  description:
    'Mede o nível de ruído da sala de aula pelo microfone do aparelho, sem gravar áudio. Relatórios para o professor e para a escola.',
  themeColor: '#f3eee4',
  backgroundColor: '#f3eee4',
} as const

/** Duração de cada janela de medição, em ms. */
export const WINDOW_MS = 125

/**
 * Limiares padrão (em dB(A) calibrado). Todos são ajustáveis em Ajustes.
 *
 * - calmo / alto: faixas de uso em sala ocupada. Não existem em norma:
 *   são pontos de partida práticos. A OMS recomenda 35 dB LAeq de ruído
 *   de fundo em sala de aula (sala sem a atividade da aula), o que uma
 *   sala ocupada quase nunca atinge.
 * - esforcoVocal: ruído de fundo a partir do qual a voz tende a subir
 *   (efeito Lombard). Estudo de laboratório encontrou o ponto de virada
 *   em 43,3 dB(A) (Bottalico et al., 2017). Usamos 43.
 */
export const DEFAULT_THRESHOLDS = {
  calmoAte: 55,
  altoDesde: 65,
  esforcoVocal: 43,
} as const

/** Offset genérico usado quando o aparelho não foi calibrado. */
export const UNCALIBRATED_OFFSET = 100

export const SOURCES = [
  {
    id: 'oms-1999',
    label: 'OMS — Guidelines for Community Noise (1999)',
    detail:
      'Sala de aula, durante a aula: 35 dB LAeq de ruído de fundo, para permitir boas condições de ensino.',
    url: 'https://www.who.int/publications/i/item/a68672',
    status: 'confirmado',
  },
  {
    id: 'oms-europa',
    label: 'OMS/Europa — Ficha sobre ruído',
    detail: 'Recomenda menos de 35 dB(A) em salas de aula.',
    url: 'https://www.who.int/europe/news-room/fact-sheets/item/noise',
    status: 'confirmado',
  },
  {
    id: 'lombard',
    label:
      'Bottalico, Passione, Graetzer, Hunter (2017) — Evaluation of the starting point of the Lombard effect',
    detail:
      'Ponto de virada do efeito Lombard em 43,3 dB(A) de ruído de fundo (estudo de laboratório).',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5612409/',
    status: 'confirmado',
  },
  {
    id: 'nbr-10152',
    label: 'ABNT NBR 10152:2017 — Acústica: níveis de pressão sonora em ambientes internos',
    detail:
      'Traz valores de referência (RLAeq) para salas de aula. Fontes secundárias citam 35 dB(A); não conferimos a tabela original da norma, que é paga.',
    url: 'https://www.abntcatalogo.com.br/',
    status: 'a confirmar',
  },
] as const
