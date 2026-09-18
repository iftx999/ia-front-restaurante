import { Routes } from '@angular/router';

import { ChatComponent } from './chat/chat.component';
import { AnaliseComponent } from './analise/analise.component';
import { LoginComponent } from './auth/login.component';
import { VerificarEmailComponent } from './auth/verificar-email.component';
import { PlanosComponent } from './assinatura/planos.component';
import { authGuard } from './core/auth.guard';
import { guestGuard } from './core/guest.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  // Sem guard: o link de verificação pode ser aberto num dispositivo sem sessão ativa.
  { path: 'verificar-email', component: VerificarEmailComponent },
  { path: '', component: ChatComponent, canActivate: [authGuard] },
  { path: 'analise', component: AnaliseComponent, canActivate: [authGuard] },
  { path: 'planos', component: PlanosComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
