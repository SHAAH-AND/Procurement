import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: ['http://localhost:5174', 'http://localhost:5173', 'http://localhost:5175'],
    credentials: true,
  });
  try {
    const { ValidationPipe } = await import('@nestjs/common');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  } catch {
    console.warn('ValidationPipe disabled: class-validator not installed');
  }
  await app.listen(process.env.PORT ?? 3000);
  console.log(`Backend listening on http://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
