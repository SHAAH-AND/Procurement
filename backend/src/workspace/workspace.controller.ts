import { Controller, Get } from '@nestjs/common';

@Controller('api/v1')
export class WorkspaceController {
  @Get('orders') orders() { return []; }
  @Get('approvals') approvals() { return []; }
  @Get('properties') properties() { return []; }
}
