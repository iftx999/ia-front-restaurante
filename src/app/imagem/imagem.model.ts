export type TamanhoImagem = 'quadrado' | 'paisagem' | 'retrato';

/** Corpo da resposta de POST /api/imagens/gerar e POST /api/imagens/editar */
export interface ImagemPratoResponse {
  id: number;
  prompt: string;
  tipoOperacao: 'GERACAO' | 'EDICAO';
  url: string;
  criadaEm: string;
}
