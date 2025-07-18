import { Controller } from '@nestjs/common';
import { RecognitionService } from '../recognition/recognition.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Cdr } from '../model/cdr';

@Controller('kafka')
export class KafkaController {
  constructor(private readonly recognitionService: RecognitionService) {}

  @MessagePattern('transcriptions')
  consume(@Payload() cdr: Cdr) {
    return this.recognitionService.jobManager(cdr);
  }
}
