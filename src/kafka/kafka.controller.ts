import { Controller } from '@nestjs/common';
import { RecognitionService } from '../recognition/recognition.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Cdr } from '../model/cdr';

@Controller('kafka')
export class KafkaController {
  constructor(private readonly recognitionService: RecognitionService) {}

  @MessagePattern('transcriptions')
  async consume(@Payload() cdr: Cdr) {
    return await this.recognitionService.start(cdr);
  }
}
