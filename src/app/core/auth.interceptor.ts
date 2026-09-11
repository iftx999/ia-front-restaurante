import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Anexa `Authorization: Bearer <token>` em toda chamada HttpClient (exceto
 * /api/auth/**, que não precisa de token). Em 401 (token ausente/expirado),
 * desloga e manda pra tela de login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const isAuthRequest = req.url.startsWith('/api/auth');
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
