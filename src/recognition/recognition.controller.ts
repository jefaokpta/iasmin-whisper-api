import { Controller, Post, Body} from '@nestjs/common';
import { RecognitionService } from './recognition.service';
import { RecognitionDto } from './dto/recognition.dto';

@Controller('iasmin/recognitions')
export class RecognitionController {
  constructor(private readonly recognitionService: RecognitionService) {}

  @Post()
  start(@Body() createRecognitionDto: RecognitionDto) {
    return this.recognitionService.start(createRecognitionDto);
  }

}
