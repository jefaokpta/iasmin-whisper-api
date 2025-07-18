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
        // sessionTimeout: 1800_000, // 30 minutos
        // heartbeatInterval: 300_000, // 5 minutos
        // maxWaitTimeInMs: 10_000,
        // retry: {
        //   retries: 15,
        //   initialRetryTime: 300,
        //   maxRetryTime: 30_000,
        // },
        // Configuração importante para tarefas longas
        maxInFlightRequests: 1, // Processar uma mensagem por vez
        // rebalanceTimeout: 300_000, // 5 minutos
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(configService.get('PORT') ?? 3000);
}
bootstrap();
