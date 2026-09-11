export type TipoPlanilha = 'VENDAS' | 'ESTOQUE';
export type StatusUpload = 'PROCESSANDO' | 'PROCESSADO' | 'ERRO';

/** Corpo da resposta de POST /api/analise/upload/vendas e /upload/estoque */
export interface UploadPlanilhaResponse {
  id: number;
  tipo: TipoPlanilha;
  nomeArquivoOriginal: string;
  status: StatusUpload;
  mensagemErro: string | null;
  quantidadeLinhas: number;
}

export interface IndicadorPratoDto {
  nomePrato: string;
  margemCalculada: number;
  alerta: boolean;
}

/** Corpo da resposta de POST/GET /api/analise/relatorio */
export interface RelatorioResponse {
  id: number;
  cmvCalculado: number | null;
  conteudoTextoIA: string;
  geradoEm: string;
  indicadoresPrato: IndicadorPratoDto[];
}

/** Item da lista de GET /api/analise/relatorio (histórico, RF-15). */
export interface RelatorioResumoResponse {
  id: number;
  cmvCalculado: number | null;
  geradoEm: string;
}

/** Comparação de um prato entre dois relatórios (RF-15). */
export interface ComparacaoPratoDto {
  nomePrato: string;
  margemAtual: number;
  margemAnterior: number | null;
  deltaMargem: number | null;
}

/** Corpo da resposta de GET /api/analise/relatorio/comparar (RF-15). */
export interface CompararRelatoriosResponse {
  idAtual: number;
  geradoEmAtual: string;
  cmvAtual: number | null;
  idAnterior: number;
  geradoEmAnterior: string;
  cmvAnterior: number | null;
  deltaCmv: number | null;
  pratos: ComparacaoPratoDto[];
}
