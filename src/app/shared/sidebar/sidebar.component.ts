import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

export type SidebarRota = 'consultivo' | 'analitico' | 'planos';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarComponent {
  @Input() rotaAtiva: SidebarRota | null = null;
  @Input() usuarioNome: string | null = null;
  @Output() sair = new EventEmitter<void>();

  menuAberto = false;

  alternarMenu(): void {
    this.menuAberto = !this.menuAberto;
  }
}
