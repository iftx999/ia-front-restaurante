import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import {
  AlertaRelatorioResponse,
  CompararRelatoriosResponse,
  RelatorioResponse,
  RelatorioResumoResponse,
  UploadPlanilhaResponse
} from './analise.model';

/**
 * Encapsula as chamadas HTTP ao modulo analitico (com.restoria.analise):
 * upload de planilhas, geracao/consulta de relatorio, perguntas sobre o
 * relatorio (RF-12), download em PDF/Excel (RF-14) e historico/comparacao
 * de relatorios (RF-15).
 */
@Injectable({
  providedIn: 'root'
})
export class AnaliseService {
  private readonly apiUrl = '/api/analise';

  constructor(private readonly http: HttpClient) {}

  uploadVendas(arquivo: File): Observable<UploadPlanilhaResponse> {
    return this.upload('vendas', arquivo);
  }

  uploadEstoque(arquivo: File): Observable<UploadPlanilhaResponse> {
    return this.upload('estoque', arquivo);
  }

  private upload(tipo: 'vendas' | 'estoque', arquivo: File): Observable<UploadPlanilhaResponse> {
    const formData = new FormData();
    formData.append('arquivo', arquivo);
    return this.http.post<UploadPlanilhaResponse>(`${this.apiUrl}/upload/${tipo}`, formData);
  }

  gerarRelatorio(uploadVendasId: number | null, uploadEstoqueId: number | null): Observable<RelatorioResponse> {
    return this.http.post<RelatorioResponse>(`${this.apiUrl}/relatorio`, { uploadVendasId, uploadEstoqueId });
  }

  perguntar(relatorioId: number, pergunta: string): Observable<{ resposta: string }> {
    return this.http.post<{ resposta: string }>(`${this.apiUrl}/relatorio/${relatorioId}/perguntar`, { pergunta });
  }

  baixarPdf(relatorioId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/relatorio/${relatorioId}/pdf`, { responseType: 'blob' });
  }

  baixarExcel(relatorioId: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/relatorio/${relatorioId}/excel`, { responseType: 'blob' });
  }

  listarRelatorios(): Observable<RelatorioResumoResponse[]> {
    return this.http.get<RelatorioResumoResponse[]>(`${this.apiUrl}/relatorio`);
  }

  /** RF-16: alerta do relatório mais recente do usuário, usado no banner proativo do chat. */
  obterAlertaMaisRecente(): Observable<AlertaRelatorioResponse> {
    return this.http.get<AlertaRelatorioResponse>(`${this.apiUrl}/relatorio/alerta`);
  }

  compararRelatorios(idAtual: number, idAnterior: number): Observable<CompararRelatoriosResponse> {
    return this.http.get<CompararRelatoriosResponse>(`${this.apiUrl}/relatorio/comparar`, {
      params: { idAtual, idAnterior }
    });
  }
}
