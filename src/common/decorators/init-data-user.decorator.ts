import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { InitDataUser as InitDataUserType } from 'src/common/guards/telegram-init-data.guard';

export const CurrentInitDataUser = createParamDecorator(
  (field: keyof InitDataUserType | undefined, ctx: ExecutionContext): InitDataUserType | number | string | undefined => {
    const req = ctx.switchToHttp().getRequest<{ initDataUser?: InitDataUserType }>();
    if (!req.initDataUser) return undefined;
    return field ? req.initDataUser[field] : req.initDataUser;
  },
);
