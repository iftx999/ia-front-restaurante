import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { AuthResponse, LoginRequest, RegistroRequest } from './auth.model';

const TOKEN_KEY = 'restoria_token';
const USER_KEY = 'restoria_user';

export interface UsuarioLogado {
  nome: string;
  email: string;
  onboardingConcluido: boolean;
}

export interface PerfilOnboarding {
  nome: string;
  nomeRestaurante: string;
}

export interface LimitesAnalise {
  margemMinimaEsperada: number;
  percentualPerdaAlerta: number;
}

interface PerfilResponse extends LimitesAnalise {
  nome: string;
  nomeRestaurante: string;
  onboardingConcluido: boolean;
}

/**
 * Autenticação (RF-05): login/registro via JWT. Token e dados básicos do
 * usuário ficam em localStorage — sessão sobrevive a reload da página.
 */
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly apiUrl = '/api/auth';

  readonly currentUser = signal<UsuarioLogado | null>(this.carregarUsuarioSalvo());

  constructor(private readonly http: HttpClient) {}

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/login`, request)
      .pipe(tap((response) => this.salvarSessao(response)));
  }

  registrar(request: RegistroRequest): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/registrar`, request)
      .pipe(tap((response) => this.salvarSessao(response)));
  }

  /** Chamado ao final do onboarding conversacional no chat (RF-05, primeiro acesso). */
  concluirOnboarding(perfil: PerfilOnboarding): Observable<PerfilResponse> {
    return this.http.post<PerfilResponse>('/api/perfil/onboarding', perfil).pipe(
      tap((resposta) => {
        const usuarioAtual = this.currentUser();
        if (!usuarioAtual) {
          return;
        }
        const usuarioAtualizado: UsuarioLogado = {
          ...usuarioAtual,
          nome: resposta.nome,
          onboardingConcluido: resposta.onboardingConcluido
        };
        localStorage.setItem(USER_KEY, JSON.stringify(usuarioAtualizado));
        this.currentUser.set(usuarioAtualizado);
      })
    );
  }

  /** Dados de perfil, incluindo os limites de alerta do módulo analítico (RF-10). */
  buscarPerfil(): Observable<PerfilResponse> {
    return this.http.get<PerfilResponse>('/api/perfil');
  }

  /** RF-10: ajusta os limites usados para marcar anomalias no relatório analítico. */
  atualizarLimitesAnalise(limites: LimitesAnalise): Observable<PerfilResponse> {
    return this.http.put<PerfilResponse>('/api/perfil/limites-analise', limites);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  private salvarSessao(response: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, response.token);
    const usuario: UsuarioLogado = {
      nome: response.nome,
      email: response.email,
      onboardingConcluido: response.onboardingConcluido
    };
    localStorage.setItem(USER_KEY, JSON.stringify(usuario));
    this.currentUser.set(usuario);
  }

  private carregarUsuarioSalvo(): UsuarioLogado | null {
    try {
      const bruto = localStorage.getItem(USER_KEY);
      return bruto ? (JSON.parse(bruto) as UsuarioLogado) : null;
    } catch {
      return null;
    }
  }
}
