import { Controller, Logger } from '@nestjs/common';
import { RecognitionService } from '../recognition/recognition.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { Cdr } from '../model/cdr';

@Controller('kafka')
export class KafkaController {
  constructor(private readonly recognitionService: RecognitionService) {}

  private readonly logger = new Logger(KafkaController.name);

  @MessagePattern('transcriptions')
  consume(@Payload() cdr: Cdr) {
    this.recognitionService.start(cdr);
    this.logger.debug(`Kafka liberado ${cdr.uniqueId}`);
  }
}
