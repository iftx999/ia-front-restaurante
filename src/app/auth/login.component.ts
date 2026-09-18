import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../core/auth.service';

type Modo = 'login' | 'registro';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  modo: Modo = 'login';
  loading = false;
  errorMessage: string | null = null;

  nome = '';
  email = '';
  senha = '';
  nomeRestaurante = '';

  /** Login com Google (RF pendente): aguardando GOOGLE_CLIENT_ID — ver
   * docs/07-login-google-oauth.md. Botão fica visível mas desabilitado até lá. */
  readonly googleIndisponivel = true;

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef
  ) {
    // Permite deep-link direto pro cadastro (usado pelos CTAs da landing page: /login?modo=registro)
    if (this.route.snapshot.queryParamMap.get('modo') === 'registro') {
      this.modo = 'registro';
    }
  }

  alternarModo(): void {
    this.modo = this.modo === 'login' ? 'registro' : 'login';
    this.errorMessage = null;
  }

  continuarComGoogle(): void {
    if (this.googleIndisponivel) {
      return;
    }
    // TODO(docs/07-login-google-oauth.md): iniciar o fluxo do Google Identity
    // Services e enviar o idToken pra POST /api/auth/google quando o
    // GOOGLE_CLIENT_ID estiver configurado.
  }

  submit(): void {
    if (this.loading) {
      return;
    }

    this.errorMessage = null;
    this.loading = true;

    const requisicao =
      this.modo === 'login'
        ? this.authService.login({ email: this.email, senha: this.senha })
        : this.authService.registrar({
            nome: this.nome,
            email: this.email,
            senha: this.senha,
            nomeRestaurante: this.nomeRestaurante
          });

    requisicao.subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: (erro: HttpErrorResponse) => {
        this.errorMessage = this.extrairMensagemErro(erro);
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private extrairMensagemErro(erro: HttpErrorResponse): string {
    const detalhes = erro.error?.detalhes;
    if (Array.isArray(detalhes) && detalhes.length > 0) {
      return detalhes[0];
    }
    if (erro.status === 0) {
      return 'Não foi possível conectar ao servidor.';
    }
    return erro.error?.erro ?? 'Algo deu errado. Tente novamente.';
  }
}
