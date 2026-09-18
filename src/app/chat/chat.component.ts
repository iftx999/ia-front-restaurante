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
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';

import { ChatService } from './chat.service';
import { ChatMessage, ChatSession, ConversaResumo, ImagemAnexada, ModeloIa } from './chat.model';
import { AuthService } from '../core/auth.service';
import { SidebarComponent } from '../shared/sidebar/sidebar.component';
import { AnaliseService } from '../analise/analise.service';
import { AlertaRelatorioResponse } from '../analise/analise.model';
import { ImagemService } from '../imagem/imagem.service';

const TITULO_PADRAO = 'Nova conversa';
const CHAVE_MODELO_IA_PREFERIDO = 'restoria_modelo_ia_preferido';

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
    private readonly router: Router,
    private readonly analiseService: AnaliseService,
    private readonly imagemService: ImagemService
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
    this.carregarAlertaRelatorio();
  }

  get activeSession(): ChatSession {
    return this.sessions.find((s) => s.localId === this.activeSessionId) ?? this.sessions[0];
  }

  get usuarioNome(): string | null {
    return this.authService.currentUser()?.nome ?? null;
  }

  get emailNaoVerificado(): boolean {
    const usuario = this.authService.currentUser();
    return !!usuario && !usuario.emailVerificado;
  }

  reenviandoVerificacao = false;
  verificacaoReenviada = false;
  erroReenvioVerificacao: string | null = null;

  reenviarVerificacaoEmail(): void {
    if (this.reenviandoVerificacao) {
      return;
    }
    this.reenviandoVerificacao = true;
    this.verificacaoReenviada = false;
    this.erroReenvioVerificacao = null;
    this.authService.reenviarVerificacaoEmail().subscribe({
      next: () => {
        this.reenviandoVerificacao = false;
        this.verificacaoReenviada = true;
        this.cdr.markForCheck();
      },
      error: (erro: HttpErrorResponse) => {
        this.reenviandoVerificacao = false;
        this.erroReenvioVerificacao = erro.error?.detalhes?.[0] ?? 'Não foi possível reenviar agora.';
        this.cdr.markForCheck();
      }
    });
  }

  /** RF-16: alerta proativo do relatório mais recente (indicador fora da faixa esperada). */
  alertaRelatorio: AlertaRelatorioResponse | null = null;

  get temAlertaRelatorio(): boolean {
    return !!this.alertaRelatorio?.temAlerta;
  }

  get mensagemAlertaRelatorio(): string {
    const quantidade = this.alertaRelatorio?.quantidadeAlertas ?? 0;
    return quantidade === 1
      ? 'Seu último relatório tem 1 indicador fora da faixa esperada.'
      : `Seu último relatório tem ${quantidade} indicadores fora da faixa esperada.`;
  }

  private carregarAlertaRelatorio(): void {
    this.analiseService.obterAlertaMaisRecente().subscribe({
      next: (resposta) => {
        this.alertaRelatorio = resposta;
        this.cdr.markForCheck();
      },
      // Silencioso: se a checagem de alerta falhar, o chat continua
      // funcionando normalmente (não é uma falha crítica pro usuário).
      error: () => {
        this.alertaRelatorio = null;
      }
    });
  }

  /** RF-22: escolha manual Claude/GPT, persistida em localStorage (sobrevive a refresh). */
  modeloIaSelecionado: ModeloIa = this.lerModeloIaPreferido();

  selecionarModeloIa(modelo: ModeloIa): void {
    this.modeloIaSelecionado = modelo;
    try {
      localStorage.setItem(CHAVE_MODELO_IA_PREFERIDO, modelo);
    } catch {
      // localStorage indisponível (modo privado, storage bloqueado etc.) — só não persiste entre sessões.
    }
  }

  private lerModeloIaPreferido(): ModeloIa {
    try {
      const valor = localStorage.getItem(CHAVE_MODELO_IA_PREFERIDO);
      return valor === 'gpt' ? 'gpt' : 'claude';
    } catch {
      return 'claude';
    }
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
    this.mostrarAtalhosPrompt = false;
    sessao.errorMessage = null;
    sessao.limiteUsoExcedido = false;
    sessao.loading = true;
    this.shouldScrollToBottom = true;

    // Mensagem da IA vai sendo preenchida token a token conforme chega. O
    // modelo ja e conhecido no momento do envio (foi o usuario que escolheu).
    const mensagemIa: ChatMessage = { role: 'assistant', text: '', modeloIa: this.modeloIaSelecionado };
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
      imagem,
      this.modeloIaSelecionado
    );
  }

  /**
   * Geracao/edicao de imagem de prato via IA (plano PRO — ver
   * docs/06-geracao-imagem-ia.md). Diferente de {@link sendMessage}: nao usa
   * streaming (a API de imagens nao suporta) e o resultado e uma imagem, nao
   * texto. Com uma imagem anexada (pendingImage), edita-a; sem anexo, gera
   * uma nova a partir do prompt.
   */
  gerarImagem(): void {
    if (this.onboardingEtapa) {
      return;
    }

    const prompt = this.currentMessage.trim();
    const imagem = this.pendingImage;
    const sessao = this.activeSession;
    if (!prompt || sessao.loading) {
      return;
    }

    if (sessao.messages.length === 0) {
      sessao.title = prompt.length > 40 ? prompt.slice(0, 40) + '…' : prompt;
    }

    sessao.messages.push({ role: 'user', text: prompt, imageDataUrl: imagem?.dataUrl });
    this.currentMessage = '';
    this.pendingImage = null;
    this.imageError = null;
    this.mostrarAtalhosPrompt = false;
    sessao.errorMessage = null;
    sessao.limiteUsoExcedido = false;
    sessao.loading = true;
    this.shouldScrollToBottom = true;

    const mensagemResultado: ChatMessage = { role: 'assistant', text: 'Gerando imagem...' };
    sessao.messages.push(mensagemResultado);

    const chamada = imagem
      ? this.imagemService.editar(prompt, imagem.base64, imagem.mediaType)
      : this.imagemService.gerar(prompt);

    chamada.subscribe({
      next: (resposta) => {
        this.imagemService.baixarArquivo(resposta.id).subscribe({
          next: (blob) => {
            mensagemResultado.text = '';
            mensagemResultado.resultImageUrl = URL.createObjectURL(blob);
            mensagemResultado.resultImageId = resposta.id;
            sessao.loading = false;
            this.shouldScrollToBottom = true;
            this.cdr.markForCheck();
          },
          error: () => this.finalizarComErroImagem(sessao, mensagemResultado, 'Imagem gerada, mas não foi possível carregá-la.')
        });
      },
      error: (erro: HttpErrorResponse) => {
        const limiteUsoExcedido = erro.status === 402;
        const mensagemErro = erro.error?.detalhes?.[0] ?? 'Não foi possível gerar a imagem agora.';
        this.finalizarComErroImagem(sessao, mensagemResultado, mensagemErro, limiteUsoExcedido);
      }
    });
  }

  private finalizarComErroImagem(
    sessao: ChatSession,
    mensagemResultado: ChatMessage,
    mensagemErro: string,
    limiteUsoExcedido = false
  ): void {
    const indice = sessao.messages.indexOf(mensagemResultado);
    if (indice !== -1) {
      sessao.messages.splice(indice, 1);
    }
    sessao.errorMessage = mensagemErro;
    sessao.limiteUsoExcedido = limiteUsoExcedido;
    sessao.loading = false;
    this.shouldScrollToBottom = true;
    this.cdr.markForCheck();
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

  /** Atalhos de termos prontos para montar prompts de imagem (usados ao anexar
   * uma foto de prato e pedir pra IA melhorar/editar). Os valores ficam em
   * inglês de propósito — é o vocabulário que os modelos de geração de imagem
   * reconhecem melhor. */
  mostrarAtalhosPrompt = false;

  readonly categoriasAtalhosPrompt: { titulo: string; itens: { label: string; valor: string }[] }[] = [
    {
      titulo: 'Melhorar uma foto',
      itens: [
        { label: 'Aparência fotorrealista', valor: 'photorealistic' },
        { label: 'Fotografia profissional', valor: 'high-end photography' },
        { label: 'Iluminação profissional', valor: 'professional lighting' },
        { label: 'Iluminação natural', valor: 'natural lighting' },
        { label: 'Luz suave', valor: 'soft lighting' },
        { label: 'Iluminação cinematográfica', valor: 'cinematic lighting' },
        { label: 'Fundo desfocado', valor: 'shallow depth of field' },
        { label: 'Mais nitidez', valor: 'sharp details' },
        { label: 'Maior nível de detalhes', valor: 'high detail' },
        { label: 'Textura de pele natural', valor: 'natural skin texture' },
        { label: 'Tratamento profissional de cor', valor: 'color grading' },
        { label: 'Maior alcance luz/sombra (HDR)', valor: 'HDR' }
      ]
    },
    {
      titulo: 'Aparência de câmera',
      itens: [
        { label: 'Câmera profissional', valor: 'shot on a professional camera' },
        { label: 'Lente 35mm', valor: '35mm photography' },
        { label: 'Retrato com lente 85mm', valor: '85mm portrait lens' },
        { label: 'Fotografia cinematográfica', valor: 'cinematic photography' },
        { label: 'Fotografia editorial', valor: 'editorial photography' },
        { label: 'Fotografia de estúdio', valor: 'studio photography' },
        { label: 'Fotografia de moda', valor: 'fashion photography' },
        { label: 'Fotografia documental', valor: 'documentary photography' },
        { label: 'Fotografia espontânea', valor: 'candid photography' }
      ]
    },
    {
      titulo: 'Estilos',
      itens: [
        { label: 'Anime', valor: 'anime' },
        { label: 'Quadrinhos', valor: 'comic book' },
        { label: 'Desenho animado', valor: 'cartoon' },
        { label: 'Aquarela', valor: 'watercolor' },
        { label: 'Pintura a óleo', valor: 'oil painting' },
        { label: 'Desenho a lápis', valor: 'pencil drawing' },
        { label: 'Lápis de cor', valor: 'colored pencil' },
        { label: 'Argila 3D', valor: 'clay 3D' },
        { label: 'Render 3D', valor: '3D render' },
        { label: 'Pixel art', valor: 'pixel art' },
        { label: 'Vintage', valor: 'vintage' },
        { label: 'Retrô', valor: 'retro' },
        { label: 'Minimalista', valor: 'minimalist' },
        { label: 'Surreal', valor: 'surreal' },
        { label: 'Pop art', valor: 'pop art' },
        { label: 'Editorial', valor: 'editorial' },
        { label: 'Foto analógica', valor: 'film photography' }
      ]
    },
    {
      titulo: 'Estética',
      itens: [
        { label: 'Tons quentes', valor: 'warm tones' },
        { label: 'Tons frios', valor: 'cool tones' },
        { label: 'Cores pastel', valor: 'pastel colors' },
        { label: 'Cores suaves', valor: 'muted colors' },
        { label: 'Cores vibrantes', valor: 'vibrant colors' },
        { label: 'Visual escuro/cinematográfico', valor: 'dark cinematic' },
        { label: 'Atmosfera dramática', valor: 'moody atmosphere' },
        { label: 'Atmosfera sonhadora', valor: 'dreamy atmosphere' },
        { label: 'Atmosfera aconchegante', valor: 'cozy atmosphere' },
        { label: 'Contraste dramático', valor: 'dramatic contrast' }
      ]
    },
    {
      titulo: 'Preservar pessoa (ao editar)',
      itens: [
        { label: 'Preservar identidade da pessoa', valor: "preserve the person's identity" },
        { label: 'Manter o rosto inalterado', valor: 'keep the face unchanged' },
        { label: 'Preservar traços faciais', valor: 'preserve facial features' },
        { label: 'Manter a pose original', valor: 'maintain the original pose' },
        { label: 'Preservar proporções do corpo', valor: 'preserve body proportions' },
        { label: 'Manter a composição original', valor: 'keep the original composition' },
        { label: 'Mudar só [elemento]', valor: 'change only [elemento]' },
        { label: 'Resto permanece inalterado', valor: 'everything else remains unchanged' }
      ]
    },
    {
      titulo: 'Trocar algo na imagem',
      itens: [
        { label: 'Trocar roupa', valor: 'change only the clothing' },
        { label: 'Trocar cenário', valor: 'replace the background' },
        { label: 'Mudar cabelo', valor: 'change only the hairstyle' },
        { label: 'Adicionar objeto', valor: 'add [objeto] naturally into the scene' },
        { label: 'Remover objeto', valor: 'remove [objeto] and reconstruct the background naturally' },
        { label: 'Dia → noite', valor: 'transform the scene from daytime to nighttime' }
      ]
    },
    {
      titulo: 'Cenas engraçadas',
      itens: [
        { label: 'Cena cômica', valor: 'comedic scene' },
        { label: 'Pose exagerada', valor: 'exaggerated pose' },
        { label: 'Situação absurda', valor: 'absurd situation' },
        { label: 'Divertido', valor: 'playful' },
        { label: 'Humorístico', valor: 'humorous' },
        { label: 'Situação inesperada', valor: 'unexpected situation' },
        { label: 'Timing cômico', valor: 'comedic timing' },
        { label: 'Over the top', valor: 'over-the-top' },
        { label: 'Humor deadpan', valor: 'deadpan humor' },
        { label: 'Estética de meme viral', valor: 'viral meme aesthetic' }
      ]
    }
  ];

  toggleAtalhosPrompt(): void {
    this.mostrarAtalhosPrompt = !this.mostrarAtalhosPrompt;
  }

  inserirAtalho(valor: string): void {
    const atual = this.currentMessage.trim();
    this.currentMessage = atual ? `${atual}, ${valor}` : valor;
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
