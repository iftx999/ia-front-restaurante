/** Corpo da resposta de GET /api/assinatura */
export interface AssinaturaResponse {
  plano: 'GRATIS' | 'PRO';
  status: 'ATIVA' | 'INADIMPLENTE' | 'CANCELADA';
  mensagensUsadasNoMes: number;
  mensagensLimiteNoMes: number;
  relatoriosUsadosNoMes: number;
  relatoriosLimiteNoMes: number;
}

/** Corpo da resposta de POST /api/assinatura/checkout */
export interface CheckoutResponse {
  url: string;
}
