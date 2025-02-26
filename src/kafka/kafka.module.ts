import { Module } from '@nestjs/common';
import { KafkaController } from './kafka.controller';
import { RecognitionModule } from '../recognition/recognition.module';
@Module({
  imports: [RecognitionModule],
  controllers: [KafkaController],
})
export class KafkaModule {}
