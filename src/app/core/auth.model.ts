export interface LoginRequest {
  email: string;
  senha: string;
}

export interface RegistroRequest {
  nome: string;
  email: string;
  senha: string;
  nomeRestaurante: string;
}

/** Corpo da resposta de POST /api/auth/login e /api/auth/registrar */
export interface AuthResponse {
  token: string;
  nome: string;
  email: string;
  onboardingConcluido: boolean;
}
