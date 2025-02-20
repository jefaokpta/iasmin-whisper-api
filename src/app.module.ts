import { Module } from '@nestjs/common';
import { RecognitionModule } from './recognition/recognition.module';
import { ConfigModule } from '@nestjs/config';
import { KafkaModule } from './kafka/kafka.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    RecognitionModule,
    KafkaModule
  ],
})
export class AppModule {}
