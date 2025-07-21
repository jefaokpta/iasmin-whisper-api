import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'iasmin-whisper-api',
        brokers: [configService.get('VEIA_KAFKA_BROKER') ?? 'localhost:9094'],
      },
      consumer: {
        groupId: 'iasmin-whisper-api-consumer',
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
        // Adicione estas configurações para controlar o polling:
        maxWaitTimeInMs: 30000, // Aguarda até 30s por novas mensagens
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(configService.get('PORT') ?? 3000);
}
bootstrap();
