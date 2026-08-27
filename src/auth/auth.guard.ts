import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

const COOKIE_NAME = 'session';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[COOKIE_NAME] as string | undefined;

    if (!token) {
      throw new UnauthorizedException('Não autenticado.');
    }

    const payload = this.authService.verifyToken(token);

    // Anexa ao request para uso nos controllers
    (req as any).user = payload;

    return true;
  }
}
