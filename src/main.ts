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
        retry: {
          retries: 10,
          initialRetryTime: 30_000,
          maxRetryTime: 60_000,
        },
      },
      consumer: {
        groupId: 'iasmin-whisper-api-consumer',
        sessionTimeout: 600_000,
        heartbeatInterval: 300_000,
        maxWaitTimeInMs: 60_000,
        retry: {
          restartOnFailure: async () => true,
        },
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(configService.get('PORT') ?? 3000);
}
bootstrap();
