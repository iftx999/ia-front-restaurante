import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { ChatService } from './chat.service';
import { ChatMessage, ChatSession, ConversaResumo, ImagemAnexada } from './chat.model';
import { AuthService } from '../core/auth.service';
import { SidebarComponent } from '../shared/sidebar/sidebar.component';

const TITULO_PADRAO = 'Nova conversa';

type EtapaOnboarding = 'nome' | 'restaurante' | null;

const TAMANHO_MAX_TITULO = 40;

function truncarTitulo(texto: string): string {
  return texto.length > TAMANHO_MAX_TITULO ? texto.slice(0, TAMANHO_MAX_TITULO) + '…' : texto;
}

const TIPOS_IMAGEM_ACEITOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const TAMANHO_MAX_IMAGEM_BYTES = 5 * 1024 * 1024;

function criarSessao(): ChatSession {
  return {
    localId: crypto.randomUUID(),
    conversationId: null,
    title: TITULO_PADRAO,
    messages: [],
    loading: false,
    errorMessage: null,
    limiteUsoExcedido: false,
    messagesLoaded: true
  };
}

function criarSessaoAPartirDoResumo(resumo: ConversaResumo): ChatSession {
  return {
    localId: crypto.randomUUID(),
    conversationId: resumo.id,
    title: truncarTitulo(resumo.titulo),
    messages: [],
    loading: false,
    errorMessage: null,
    limiteUsoExcedido: false,
    messagesLoaded: false
  };
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SidebarComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponent implements AfterViewChecked, OnDestroy {
  @ViewChild('messagesList') private messagesList?: ElementRef<HTMLDivElement>;

  sessions: ChatSession[] = [criarSessao()];
  activeSessionId: string = this.sessions[0].localId;
  currentMessage = '';
  pendingImage: ImagemAnexada | null = null;
  imageError: string | null = null;

  /** Onboarding conversacional de primeiro acesso (RF-05): antes de liberar
   * perguntas livres, a IA confirma nome e nome do restaurante do usuário. */
  onboardingEtapa: EtapaOnboarding = null;
  private onboardingNome = '';

  private shouldScrollToBottom = false;
  private readonly streamsAtivos = new Map<string, AbortController>();

  constructor(
    private readonly chatService: ChatService,
    private readonly cdr: ChangeDetectorRef,
    private readonly authService: AuthService,
    private readonly router: Router
  ) {
    const usuario = this.authService.currentUser();
    if (usuario && !usuario.onboardingConcluido) {
      this.onboardingEtapa = 'nome';
      this.sessions[0].messages.push({
        role: 'assistant',
        text: 'Oi! Eu sou a RestorIA 👋 Antes de começarmos, qual é o seu nome?'
      });
    }

    this.carregarConversas();
  }

  get activeSession(): ChatSession {
    return this.sessions.find((s) => s.localId === this.activeSessionId) ?? this.sessions[0];
  }

  get usuarioNome(): string | null {
    return this.authService.currentUser()?.nome ?? null;
  }

  get placeholderInput(): string {
    if (this.onboardingEtapa === 'nome') {
      return 'Digite seu nome...';
    }
    if (this.onboardingEtapa === 'restaurante') {
      return 'Digite o nome do seu restaurante...';
    }
    return 'Digite sua pergunta sobre o restaurante...';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy(): void {
    for (const controller of this.streamsAtivos.values()) {
      controller.abort();
    }
  }

  newChat(): void {
    if (this.onboardingEtapa) {
      return;
    }
    const sessao = criarSessao();
    this.sessions.unshift(sessao);
    this.activeSessionId = sessao.localId;
    this.currentMessage = '';
  }

  selectSession(localId: string): void {
    if (this.onboardingEtapa) {
      return;
    }
    this.activeSessionId = localId;
    this.currentMessage = '';
    this.shouldScrollToBottom = true;

    const sessao = this.activeSession;
    if (!sessao.messagesLoaded) {
      this.carregarMensagens(sessao);
    }
  }

  /** Busca a lista de conversas do usuário para restaurar o histórico após um refresh. */
  private carregarConversas(): void {
    this.chatService.listarConversas().subscribe({
      next: (resumos) => {
        if (resumos.length === 0) {
          return;
        }

        const sessoesExistentes = resumos.map(criarSessaoAPartirDoResumo);

        if (!this.onboardingEtapa) {
          this.sessions = sessoesExistentes;
          this.activeSessionId = sessoesExistentes[0].localId;
          this.carregarMensagens(sessoesExistentes[0]);
        } else {
          // Onboarding em andamento: mantém a sessão sintética ativa; o
          // histórico antigo (usuários que já conversavam antes desse
          // recurso) fica disponível assim que o onboarding terminar.
          this.sessions.push(...sessoesExistentes);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        // Falha ao carregar histórico não deve travar o chat — segue com a sessão local vazia.
      }
    });
  }

  private carregarMensagens(sessao: ChatSession): void {
    if (!sessao.conversationId || sessao.messagesLoaded || sessao.loading) {
      return;
    }

    sessao.loading = true;
    this.chatService.buscarConversa(sessao.conversationId).subscribe({
      next: (detalhe) => {
        sessao.messages = detalhe.mensagens.map((mensagem) => ({ role: mensagem.role, text: mensagem.texto }));
        sessao.messagesLoaded = true;
        sessao.loading = false;
        this.shouldScrollToBottom = true;
        this.cdr.markForCheck();
      },
      error: () => {
        sessao.errorMessage = 'Não foi possível carregar essa conversa agora.';
        sessao.messagesLoaded = true;
        sessao.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const arquivo = input.files?.[0] ?? null;
    input.value = '';

    if (!arquivo) {
      return;
    }

    this.imageError = null;

    if (!TIPOS_IMAGEM_ACEITOS.includes(arquivo.type)) {
      this.imageError = 'Formato não suportado. Use JPEG, PNG, GIF ou WebP.';
      return;
    }

    if (arquivo.size > TAMANHO_MAX_IMAGEM_BYTES) {
      this.imageError = 'Imagem muito grande (limite de 5MB).';
      return;
    }

    const leitor = new FileReader();
    leitor.onload = () => {
      const dataUrl = leitor.result as string;
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      this.pendingImage = { dataUrl, base64, mediaType: arquivo.type };
      this.cdr.markForCheck();
    };
    leitor.onerror = () => {
      this.imageError = 'Não foi possível ler essa imagem.';
      this.cdr.markForCheck();
    };
    leitor.readAsDataURL(arquivo);
  }

  removePendingImage(): void {
    this.pendingImage = null;
    this.imageError = null;
  }

  sendMessage(): void {
    if (this.onboardingEtapa) {
      this.responderOnboarding();
      return;
    }

    const mensagem = this.currentMessage.trim();
    const imagem = this.pendingImage;
    const sessao = this.activeSession;
    if ((!mensagem && !imagem) || sessao.loading) {
      return;
    }

    const textoMensagem = mensagem || 'O que você vê nessa imagem?';

    if (sessao.messages.length === 0) {
      sessao.title = textoMensagem.length > 40 ? textoMensagem.slice(0, 40) + '…' : textoMensagem;
    }

    sessao.messages.push({ role: 'user', text: textoMensagem, imageDataUrl: imagem?.dataUrl });
    this.currentMessage = '';
    this.pendingImage = null;
    this.imageError = null;
    sessao.errorMessage = null;
    sessao.limiteUsoExcedido = false;
    sessao.loading = true;
    this.shouldScrollToBottom = true;

    // Mensagem da IA vai sendo preenchida token a token conforme chega.
    const mensagemIa: ChatMessage = { role: 'assistant', text: '' };
    sessao.messages.push(mensagemIa);

    const controller = new AbortController();
    this.streamsAtivos.set(sessao.localId, controller);

    this.chatService.sendMessageStream(
      textoMensagem,
      sessao.conversationId,
      {
        onStart: (conversationId) => {
          sessao.conversationId = conversationId;
        },
        onToken: (texto) => {
          mensagemIa.text += texto;
          this.shouldScrollToBottom = true;
          // App zoneless (sem zone.js): cada token chega fora de um evento do
          // Angular, então precisamos avisar manualmente para redesenhar a tela.
          this.cdr.markForCheck();
        },
        onDone: () => {
          sessao.loading = false;
          this.streamsAtivos.delete(sessao.localId);
          this.cdr.markForCheck();
        },
        onError: (mensagemErro, limiteUsoExcedido) => {
          // Remove o balão vazio/parcial da IA — o erro já é comunicado no banner.
          const indice = sessao.messages.indexOf(mensagemIa);
          if (indice !== -1 && mensagemIa.text === '') {
            sessao.messages.splice(indice, 1);
          }
          sessao.errorMessage = mensagemErro;
          sessao.limiteUsoExcedido = !!limiteUsoExcedido;
          sessao.loading = false;
          this.streamsAtivos.delete(sessao.localId);
          this.shouldScrollToBottom = true;
          this.cdr.markForCheck();
        }
      },
      controller.signal,
      imagem
    );
  }

  private responderOnboarding(): void {
    const resposta = this.currentMessage.trim();
    const sessao = this.activeSession;
    if (!resposta || sessao.loading) {
      return;
    }

    sessao.messages.push({ role: 'user', text: resposta });
    this.currentMessage = '';
    sessao.errorMessage = null;
    this.shouldScrollToBottom = true;

    if (this.onboardingEtapa === 'nome') {
      this.onboardingNome = resposta;
      this.onboardingEtapa = 'restaurante';
      sessao.messages.push({
        role: 'assistant',
        text: `Prazer, ${resposta}! E qual é o nome do seu restaurante?`
      });
      this.shouldScrollToBottom = true;
      return;
    }

    const nomeRestaurante = resposta;
    sessao.loading = true;
    const mensagemFinal: ChatMessage = { role: 'assistant', text: '' };
    sessao.messages.push(mensagemFinal);
    this.shouldScrollToBottom = true;

    this.authService.concluirOnboarding({ nome: this.onboardingNome, nomeRestaurante }).subscribe({
      next: () => {
        mensagemFinal.text =
          `Perfeito! Já tenho o que preciso sobre o ${nomeRestaurante}. ` +
          'Pode perguntar o que quiser sobre gestão do seu restaurante — CMV, precificação, estoque, compliance sanitário e mais.';
        sessao.loading = false;
        this.onboardingEtapa = null;
        this.shouldScrollToBottom = true;
        this.cdr.markForCheck();
      },
      error: () => {
        const indice = sessao.messages.indexOf(mensagemFinal);
        if (indice !== -1) {
          sessao.messages.splice(indice, 1);
        }
        sessao.errorMessage = 'Não consegui salvar seu perfil agora. Digite o nome do restaurante novamente.';
        sessao.loading = false;
        this.shouldScrollToBottom = true;
        this.cdr.markForCheck();
      }
    });
  }

  readonly exemplosPergunta = [
    'Como calculo o CMV do mês?',
    'Como precificar um prato novo?',
    'Como reduzir perda de estoque?',
    'O que preciso pra compliance sanitário?'
  ];

  usarExemplo(texto: string): void {
    this.currentMessage = texto;
  }

  onEnterKey(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (!keyboardEvent.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    if (this.messagesList) {
      const el = this.messagesList.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
