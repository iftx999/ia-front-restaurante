import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';

import { AnaliseService } from './analise.service';
import {
  CompararRelatoriosResponse,
  RelatorioResponse,
  RelatorioResumoResponse,
  UploadPlanilhaResponse
} from './analise.model';
import { AuthService } from '../core/auth.service';
import { SidebarComponent } from '../shared/sidebar/sidebar.component';

function paraPercentual(fracao: number): number {
  return Math.round(fracao * 1000) / 10;
}

interface UploadSlotState {
  arquivoSelecionado: File | null;
  enviando: boolean;
  resultado: UploadPlanilhaResponse | null;
  erro: string | null;
}

function estadoInicialSlot(): UploadSlotState {
  return { arquivoSelecionado: null, enviando: false, resultado: null, erro: null };
}

@Component({
  selector: 'app-analise',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SidebarComponent],
  templateUrl: './analise.component.html',
  styleUrl: './analise.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AnaliseComponent {
  vendas = estadoInicialSlot();
  estoque = estadoInicialSlot();

  gerandoRelatorio = false;
  erroRelatorio: string | null = null;
  limiteUsoExcedido = false;
  relatorio: RelatorioResponse | null = null;

  pergunta = '';
  perguntando = false;
  respostaPergunta: string | null = null;
  erroPergunta: string | null = null;

  baixandoPdf = false;
  baixandoExcel = false;

  /** RF-15: histórico de relatórios e comparação mês a mês. */
  historico: RelatorioResumoResponse[] = [];
  carregandoHistorico = true;
  idAtualSelecionado: number | null = null;
  idAnteriorSelecionado: number | null = null;
  comparando = false;
  comparacao: CompararRelatoriosResponse | null = null;
  erroComparacao: string | null = null;

  /** RF-10: limites de alerta configuráveis, exibidos como percentual (20 = 20%). */
  carregandoLimites = true;
  margemMinimaPercentual = 20;
  percentualPerdaPercentual = 5;
  salvandoLimites = false;
  limitesSalvos = false;
  erroLimites: string | null = null;

  constructor(
    private readonly analiseService: AnaliseService,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.carregarLimites();
    this.carregarHistorico();
  }

  get usuarioNome(): string | null {
    return this.authService.currentUser()?.nome ?? null;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  get podeGerarRelatorio(): boolean {
    return !this.gerandoRelatorio && (this.vendas.resultado !== null || this.estoque.resultado !== null);
  }

  onArquivoSelecionado(evento: Event, tipo: 'vendas' | 'estoque'): void {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0] ?? null;
    const slot = tipo === 'vendas' ? this.vendas : this.estoque;
    slot.arquivoSelecionado = arquivo;
    slot.resultado = null;
    slot.erro = null;
  }

  enviar(tipo: 'vendas' | 'estoque'): void {
    const slot = tipo === 'vendas' ? this.vendas : this.estoque;
    if (!slot.arquivoSelecionado || slot.enviando) {
      return;
    }

    slot.enviando = true;
    slot.erro = null;

    const upload$ = tipo === 'vendas'
      ? this.analiseService.uploadVendas(slot.arquivoSelecionado)
      : this.analiseService.uploadEstoque(slot.arquivoSelecionado);

    upload$.subscribe({
      next: (resultado) => {
        slot.resultado = resultado;
        slot.enviando = false;
        this.cdr.markForCheck();
      },
      error: (erro: HttpErrorResponse) => {
        slot.erro = this.mensagemDeErro(erro);
        slot.enviando = false;
        this.cdr.markForCheck();
      }
    });
  }

  gerarRelatorio(): void {
    if (!this.podeGerarRelatorio) {
      return;
    }

    this.gerandoRelatorio = true;
    this.erroRelatorio = null;
    this.limiteUsoExcedido = false;
    this.relatorio = null;
    this.respostaPergunta = null;

    this.analiseService
      .gerarRelatorio(this.vendas.resultado?.id ?? null, this.estoque.resultado?.id ?? null)
      .subscribe({
        next: (relatorio) => {
          this.relatorio = relatorio;
          this.gerandoRelatorio = false;
          this.carregarHistorico();
          this.cdr.markForCheck();
        },
        error: (erro: HttpErrorResponse) => {
          this.erroRelatorio = this.mensagemDeErro(erro);
          this.limiteUsoExcedido = erro.status === 402;
          this.gerandoRelatorio = false;
          this.cdr.markForCheck();
        }
      });
  }

  enviarPergunta(): void {
    const texto = this.pergunta.trim();
    if (!texto || !this.relatorio || this.perguntando) {
      return;
    }

    this.perguntando = true;
    this.erroPergunta = null;
    this.respostaPergunta = null;

    this.analiseService.perguntar(this.relatorio.id, texto).subscribe({
      next: (resposta) => {
        this.respostaPergunta = resposta.resposta;
        this.perguntando = false;
        this.cdr.markForCheck();
      },
      error: (erro: HttpErrorResponse) => {
        this.erroPergunta = this.mensagemDeErro(erro);
        this.perguntando = false;
        this.cdr.markForCheck();
      }
    });
  }

  baixarPdf(): void {
    if (!this.relatorio || this.baixandoPdf) {
      return;
    }
    this.baixandoPdf = true;
    this.analiseService.baixarPdf(this.relatorio.id).subscribe({
      next: (blob) => {
        this.disparaDownload(blob, `relatorio-${this.relatorio!.id}.pdf`);
        this.baixandoPdf = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.baixandoPdf = false;
        this.cdr.markForCheck();
      }
    });
  }

  baixarExcel(): void {
    if (!this.relatorio || this.baixandoExcel) {
      return;
    }
    this.baixandoExcel = true;
    this.analiseService.baixarExcel(this.relatorio.id).subscribe({
      next: (blob) => {
        this.disparaDownload(blob, `relatorio-${this.relatorio!.id}.xlsx`);
        this.baixandoExcel = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.baixandoExcel = false;
        this.cdr.markForCheck();
      }
    });
  }

  private carregarHistorico(): void {
    this.carregandoHistorico = true;
    this.analiseService.listarRelatorios().subscribe({
      next: (historico) => {
        this.historico = historico;
        this.carregandoHistorico = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.carregandoHistorico = false;
        this.cdr.markForCheck();
      }
    });
  }

  get podeComparar(): boolean {
    return (
      !this.comparando &&
      this.idAtualSelecionado !== null &&
      this.idAnteriorSelecionado !== null &&
      this.idAtualSelecionado !== this.idAnteriorSelecionado
    );
  }

  comparar(): void {
    if (!this.podeComparar) {
      return;
    }

    this.comparando = true;
    this.erroComparacao = null;
    this.comparacao = null;

    this.analiseService.compararRelatorios(this.idAtualSelecionado!, this.idAnteriorSelecionado!).subscribe({
      next: (comparacao) => {
        this.comparacao = comparacao;
        this.comparando = false;
        this.cdr.markForCheck();
      },
      error: (erro: HttpErrorResponse) => {
        this.erroComparacao = this.mensagemDeErro(erro);
        this.comparando = false;
        this.cdr.markForCheck();
      }
    });
  }

  private carregarLimites(): void {
    this.authService.buscarPerfil().subscribe({
      next: (perfil) => {
        this.margemMinimaPercentual = paraPercentual(perfil.margemMinimaEsperada);
        this.percentualPerdaPercentual = paraPercentual(perfil.percentualPerdaAlerta);
        this.carregandoLimites = false;
        this.cdr.markForCheck();
      },
      error: () => {
        // Mantém os valores padrão (20% / 5%) se não conseguir carregar — não impede o uso da tela.
        this.carregandoLimites = false;
        this.cdr.markForCheck();
      }
    });
  }

  salvarLimites(): void {
    if (this.salvandoLimites) {
      return;
    }

    this.salvandoLimites = true;
    this.limitesSalvos = false;
    this.erroLimites = null;

    this.authService
      .atualizarLimitesAnalise({
        margemMinimaEsperada: this.margemMinimaPercentual / 100,
        percentualPerdaAlerta: this.percentualPerdaPercentual / 100
      })
      .subscribe({
        next: () => {
          this.salvandoLimites = false;
          this.limitesSalvos = true;
          this.cdr.markForCheck();
        },
        error: (erro: HttpErrorResponse) => {
          this.erroLimites = this.mensagemDeErro(erro);
          this.salvandoLimites = false;
          this.cdr.markForCheck();
        }
      });
  }

  formatarPercentual(valor: number | null): string {
    if (valor === null) {
      return 'não calculável';
    }
    return (valor * 100).toFixed(2).replace('.', ',') + '%';
  }

  formatarDeltaPercentual(valor: number | null): string {
    if (valor === null) {
      return 'sem comparação possível';
    }
    const sinal = valor > 0 ? '+' : '';
    return sinal + (valor * 100).toFixed(2).replace('.', ',') + ' p.p.';
  }

  formatarData(isoDateTime: string): string {
    return new Date(isoDateTime).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  private disparaDownload(blob: Blob, nomeArquivo: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  private mensagemDeErro(erro: HttpErrorResponse): string {
    const detalhes = erro.error?.detalhes;
    if (Array.isArray(detalhes) && detalhes.length > 0) {
      return detalhes.join(' ');
    }
    return 'Não foi possível completar a operação. Tente novamente.';
  }
}
