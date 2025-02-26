import { Module } from '@nestjs/common';
import { RecognitionService } from './recognition.service';

@Module({
  providers: [RecognitionService],
  exports: [RecognitionService],
})
export class RecognitionModule {}
