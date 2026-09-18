import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../core/auth.service';

type Estado = 'carregando' | 'sucesso' | 'erro';

@Component({
  selector: 'app-verificar-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './verificar-email.component.html',
  styleUrl: './verificar-email.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VerificarEmailComponent {
  estado: Estado = 'carregando';
  mensagemErro = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly authService: AuthService,
    private readonly cdr: ChangeDetectorRef
  ) {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.estado = 'erro';
      this.mensagemErro = 'Link de verificação inválido — falta o token.';
      return;
    }

    this.authService.verificarEmail(token).subscribe({
      next: () => {
        this.estado = 'sucesso';
        this.cdr.markForCheck();
      },
      error: (erro: HttpErrorResponse) => {
        this.estado = 'erro';
        this.mensagemErro = erro.error?.detalhes?.[0] ?? 'Não foi possível confirmar seu e-mail agora.';
        this.cdr.markForCheck();
      }
    });
  }
}
