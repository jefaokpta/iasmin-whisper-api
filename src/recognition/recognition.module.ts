import { Module } from '@nestjs/common';
import { RecognitionService } from './recognition.service';
import { RecognitionController } from './recognition.controller';

@Module({
  controllers: [RecognitionController],
  providers: [RecognitionService],
})
export class RecognitionModule {}
