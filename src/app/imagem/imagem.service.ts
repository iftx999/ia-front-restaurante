import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { ImagemPratoResponse, TamanhoImagem } from './imagem.model';

/** Encapsula as chamadas HTTP de geração/edição de imagem de prato via IA (plano PRO). */
@Injectable({
  providedIn: 'root'
})
export class ImagemService {
  private readonly apiUrl = '/api/imagens';

  constructor(private readonly http: HttpClient) {}

  gerar(prompt: string, tamanho?: TamanhoImagem): Observable<ImagemPratoResponse> {
    return this.http.post<ImagemPratoResponse>(`${this.apiUrl}/gerar`, { prompt, tamanho });
  }

  editar(
    prompt: string,
    imagemBase64: string,
    imagemMediaType: string,
    tamanho?: TamanhoImagem
  ): Observable<ImagemPratoResponse> {
    return this.http.post<ImagemPratoResponse>(`${this.apiUrl}/editar`, {
      prompt,
      imagemBase64,
      imagemMediaType,
      tamanho
    });
  }

  /** Baixa o binário da imagem (precisa do Bearer token — por isso não dá pra usar <img src> direto). */
  baixarArquivo(id: number): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${id}/arquivo`, { responseType: 'blob' });
  }
}
