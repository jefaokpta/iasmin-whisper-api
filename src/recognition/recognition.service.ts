import { Injectable } from '@nestjs/common';
import { RecognitionDto } from './dto/recognition.dto';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'node:fs';
import {spawn} from 'child_process';

@Injectable()
export class RecognitionService {
  constructor(private readonly configService: ConfigService) {}

  private readonly AUDIOS_PATH = 'audios';
  private readonly TRANSCRIPTIONS_PATH = 'transcriptions';
  private readonly IASMIN_URL = this.configService.get('IASMIN_URL');
  private readonly WHISPER_COMMAND = this.configService.get('WHISPER_COMMAND');

  start(recognitionDto: RecognitionDto) {
    this.downloadAudio(recognitionDto);
  }

  private async downloadAudio(recognitionDto: RecognitionDto) {
    const audioName = recognitionDto.record + '.mp3';
    const request = await axios({
      method: 'get',
      url: `${this.IASMIN_URL}/${audioName}`,
      responseType: 'stream',
    })
    const writer = fs.createWriteStream(`${this.AUDIOS_PATH}/${audioName}`);
    request.data.pipe(writer);

    writer.on('finish', () => {
      console.log('audio baixado');
      this.processRecognition(recognitionDto, audioName);
    });

    writer.on('error', (err) => {
      console.log('erro ao baixar audio', recognitionDto, err);
    });
  }

  private processRecognition(recognitionDto: RecognitionDto, audioName: string) {
    const command =
      this.WHISPER_COMMAND +
      ' ' +
      'audios/' +
      audioName +
      ' ' +
      '--model=large ' +
      '--fp16=False ' +
      '--language=pt ' +
      '--beam_size=5 ' +
      '--patience=2 ' +
      '--output_format=json ' +
      `--output_dir=${this.TRANSCRIPTIONS_PATH}`

    spawn(command, { shell: true })
      .on('exit', (code) => {
        if (code === 0) {
          console.log('transcricao finalizada');
          this.notifyIASMIN(recognitionDto, audioName);
        } else {
          console.log('DEU RUIM NA TRANSCRICAO', code);
        }
      })
  }

  private notifyIASMIN(recognitionDto: RecognitionDto, audioName: string) {
    axios.post(`${this.IASMIN_URL}/transcription`, {
      record: recognitionDto.record,
      transcription: JSON.parse(fs.readFileSync(`${this.TRANSCRIPTIONS_PATH}/${recognitionDto.record}.json`, 'utf8')),
    })
      .then(() => {
        this.deleteAudioAndTranscription(audioName);
      })
      .catch((err) => {
        console.log('erro ao notificar IASMIN', err);
      })
  }

  private deleteAudioAndTranscription(audioName: string) {
    fs.unlink(this.AUDIOS_PATH + '/' + audioName, (err) => {
      if (err) {
        console.error('erro ao deletar audio', audioName, err);
      }
    });
    fs.unlink(this.TRANSCRIPTIONS_PATH + '/' + audioName.replace('.mp3', '.json'), (err) => {
      if (err) {
        console.error('erro ao deletar transcrição', audioName, err);
      }
    });
  }
}