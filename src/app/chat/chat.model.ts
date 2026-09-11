/** Mensagem exibida na tela de chat (modelo de UI, não é o payload da API). */
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** Corpo da requisição enviada para POST /api/chat */
export interface ChatRequest {
  conversationId: string | null;
  mensagem: string;
}

/** Corpo da resposta recebida de POST /api/chat */
export interface ChatResponse {
  conversationId: string;
  resposta: string;
}

/** Item de GET /api/chat/conversas */
export interface ConversaResumo {
  id: string;
  titulo: string;
}

/** Uma mensagem tal como o backend a envia (ver MensagemResponse) */
export interface MensagemApi {
  role: 'user' | 'assistant';
  texto: string;
}

/** Corpo da resposta de GET /api/chat/conversas/{id} */
export interface ConversaDetalhe {
  id: string;
  titulo: string;
  mensagens: MensagemApi[];
}

/**
 * Uma conversa exibida no sidebar. Vive só em memória (sessão do navegador) -
 * `conversationId` é o id no backend, atribuído após a primeira mensagem.
 */
export interface ChatSession {
  localId: string;
  conversationId: string | null;
  title: string;
  messages: ChatMessage[];
  loading: boolean;
  errorMessage: string | null;
  /** true quando errorMessage veio de estourar a cota do plano (mostra CTA de upgrade em vez de erro genérico). */
  limiteUsoExcedido: boolean;
  /** false para sessões vindas de GET /api/chat/conversas cujas mensagens ainda não foram buscadas. */
  messagesLoaded: boolean;
}
