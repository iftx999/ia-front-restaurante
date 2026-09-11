import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { AssinaturaResponse, CheckoutResponse } from './assinatura.model';

/** Encapsula as chamadas HTTP a com.restoria.assinatura (plano/uso, checkout do Stripe). */
@Injectable({
  providedIn: 'root'
})
export class AssinaturaService {
  private readonly apiUrl = '/api/assinatura';

  constructor(private readonly http: HttpClient) {}

  obterAtual(): Observable<AssinaturaResponse> {
    return this.http.get<AssinaturaResponse>(this.apiUrl);
  }

  criarCheckout(): Observable<CheckoutResponse> {
    return this.http.post<CheckoutResponse>(`${this.apiUrl}/checkout`, {});
  }
}
