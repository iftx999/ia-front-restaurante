import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { ChatRequest, ChatResponse, ConversaDetalhe, ConversaResumo } from './chat.model';
import { AuthService } from '../core/auth.service';
import { Router } from '@angular/router';

/** Callbacks para consumir o streaming SSE de POST /api/chat/stream. */
export interface ChatStreamHandlers {
  onStart: (conversationId: string) => void;
  onToken: (texto: string) => void;
  onDone: () => void;
  onError: (mensagem: string, limiteUsoExcedido?: boolean) => void;
}

/**
 * Encapsula as chamadas HTTP ao backend de chat (POST /api/chat e
 * POST /api/chat/stream). Usa caminho relativo para aproveitar o proxy de dev
 * (proxy.conf.json) e evitar problemas de CORS, já que o backend ainda não
 * tem CORS configurado.
 */
@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private readonly apiUrl = '/api/chat';

  constructor(
    private readonly http: HttpClient,
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  sendMessage(mensagem: string, conversationId: string | null): Observable<ChatResponse> {
    const body: ChatRequest = { conversationId, mensagem };
    return this.http.post<ChatResponse>(this.apiUrl, body);
  }

  /** Lista as conversas do usuário, para reconstruir o sidebar após um refresh. */
  listarConversas(): Observable<ConversaResumo[]> {
    return this.http.get<ConversaResumo[]>(`${this.apiUrl}/conversas`);
  }

  /** Mensagens de uma conversa específica. */
  buscarConversa(conversationId: string): Observable<ConversaDetalhe> {
    return this.http.get<ConversaDetalhe>(`${this.apiUrl}/conversas/${conversationId}`);
  }

  /**
   * Consome POST /api/chat/stream (Server-Sent Events) via fetch, já que
   * EventSource não suporta corpo de requisição (precisamos mandar a
   * mensagem). Contrato dos eventos (definido no backend, ChatController):
   *   event: start  data: {"conversationId": "..."}
   *   event: token  data: {"texto": "..."}   (múltiplos)
   *   event: done   data: {}
   *   event: error  data: {"mensagem": "..."}
   *
   * `signal` permite cancelar o streaming (ex: usuário troca de conversa
   * no meio de uma resposta em andamento).
   */
  async sendMessageStream(
    mensagem: string,
    conversationId: string | null,
    handlers: ChatStreamHandlers,
    signal?: AbortSignal
  ): Promise<void> {
    const body: ChatRequest = { conversationId, mensagem };

    const token = this.authService.getToken();

    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body),
        signal
      });
    } catch (erro) {
      if ((erro as DOMException)?.name === 'AbortError') {
        return;
      }
      handlers.onError('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
      return;
    }

    if (response.status === 401 || response.status === 403) {
      this.authService.logout();
      this.router.navigate(['/login']);
      return;
    }

    if (!response.ok || !response.body) {
      handlers.onError('Não foi possível obter uma resposta agora. Verifique sua conexão e tente novamente.');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let separatorIndex: number;
        while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
          const bloco = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          this.processarBlocoSse(bloco, handlers);
        }
      }
    } catch (erro) {
      if ((erro as DOMException)?.name !== 'AbortError') {
        handlers.onError('A conexão com o servidor foi interrompida. Tente novamente.');
      }
    }
  }

  private processarBlocoSse(bloco: string, handlers: ChatStreamHandlers): void {
    let evento = '';
    let dadosTexto = '';

    for (const linha of bloco.split('\n')) {
      if (linha.startsWith('event:')) {
        evento = linha.slice('event:'.length).trim();
      } else if (linha.startsWith('data:')) {
        dadosTexto += linha.slice('data:'.length).trim();
      }
    }

    if (!evento || !dadosTexto) {
      return;
    }

    const dados = JSON.parse(dadosTexto);

    switch (evento) {
      case 'start':
        handlers.onStart(dados.conversationId);
        break;
      case 'token':
        handlers.onToken(dados.texto);
        break;
      case 'done':
        handlers.onDone();
        break;
      case 'error':
        handlers.onError(
          dados.mensagem ?? 'Não foi possível obter resposta da IA no momento.',
          dados.tipo === 'limite_uso'
        );
        break;
    }
  }
}
