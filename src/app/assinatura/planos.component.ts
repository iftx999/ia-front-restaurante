import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { AssinaturaService } from './assinatura.service';
import { AssinaturaResponse } from './assinatura.model';
import { AuthService } from '../core/auth.service';
import { SidebarComponent } from '../shared/sidebar/sidebar.component';

@Component({
  selector: 'app-planos',
  standalone: true,
  imports: [CommonModule, SidebarComponent],
  templateUrl: './planos.component.html',
  styleUrl: './planos.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlanosComponent implements OnInit {
  assinatura: AssinaturaResponse | null = null;
  carregando = true;
  erro: string | null = null;
  iniciandoCheckout = false;

  constructor(
    private readonly assinaturaService: AssinaturaService,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  get usuarioNome(): string | null {
    return this.authService.currentUser()?.nome ?? null;
  }

  ngOnInit(): void {
    this.assinaturaService.obterAtual().subscribe({
      next: (assinatura) => {
        this.assinatura = assinatura;
        this.carregando = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.erro = 'Não foi possível carregar sua assinatura agora.';
        this.carregando = false;
        this.cdr.markForCheck();
      }
    });
  }

  fazerUpgrade(): void {
    if (this.iniciandoCheckout) {
      return;
    }
    this.iniciandoCheckout = true;
    this.erro = null;

    this.assinaturaService.criarCheckout().subscribe({
      next: (checkout) => {
        window.location.href = checkout.url;
      },
      error: () => {
        this.erro = 'Não foi possível iniciar o checkout agora. Tente novamente em instantes.';
        this.iniciandoCheckout = false;
        this.cdr.markForCheck();
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
