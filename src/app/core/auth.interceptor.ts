import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

/** Únicas rotas de /api/auth/** que não exigem token — as demais (ex: reenviar-verificacao) precisam. */
const ROTAS_AUTH_PUBLICAS = ['/api/auth/login', '/api/auth/registrar', '/api/auth/verificar-email'];

/**
 * Anexa `Authorization: Bearer <token>` em toda chamada HttpClient, exceto
 * nas rotas de auth públicas (login/registro/verificação de e-mail). Em 401
 * (token ausente/expirado) numa rota que exige token, desloga e manda pra
 * tela de login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isAuthRequest = ROTAS_AUTH_PUBLICAS.some((rota) => req.url.startsWith(rota));
  const token = authService.getToken();

  const requisicao = !isAuthRequest && token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(requisicao).pipe(
    catchError((erro: HttpErrorResponse) => {
      if (erro.status === 401 && !isAuthRequest) {
        authService.logout();
        router.navigate(['/login']);
      }
      return throwError(() => erro);
    })
  );
};
