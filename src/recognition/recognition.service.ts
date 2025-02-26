import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import { Cdr } from '../model/cdr';
@Injectable()
export class RecognitionService {
  constructor(private readonly configService: ConfigService) {}

  private readonly AUDIOS_PATH = 'audios';
  private readonly TRANSCRIPTIONS_PATH = 'transcriptions';
  private readonly IASMIN_PABX_URL = this.configService.get('IASMIN_PABX_URL');
  private readonly IASMIN_BACKEND_URL = this.configService.get('IASMIN_BACKEND_URL');
  private readonly WHISPER_COMMAND = this.configService.get('WHISPER_COMMAND');
  private readonly REQUEST_TIMEOUT = 60000; // 1 minuto

  async start(cdr: Cdr) {
    await this.downloadAudio(cdr);
  }

  private async downloadAudio(cdr: Cdr) {
    try {
      const audioName = cdr.callRecord;
      const request = await axios({
        method: 'get',
        url: `${this.IASMIN_PABX_URL}/${audioName}`,
        responseType: 'stream',
      })
      const writer = fs.createWriteStream(`${this.AUDIOS_PATH}/${audioName}`);
      request.data.pipe(writer);

      writer.on('finish', async () => {
        Logger.log('downloadAudio', 'audio baixado', cdr.callRecord);
        await this.processRecognition(cdr, audioName);
      });

      writer.on('error', (err) => {
        Logger.error('downloadAudio', 'erro ao baixar audio', cdr.callRecord, err.message);
      });
    } catch (err) {
      Logger.error('downloadAudio', 'erro ao baixar audio', cdr.callRecord, err.message);
    }
  }

  private async processRecognition(cdr: Cdr, audioName: string) {
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

    const result = spawnSync(command, { shell: true })
    if (result.status === 0) {
      Logger.log('processRecognition', 'transcricao finalizada com sucesso', cdr);
      this.notifyIASMIN(cdr, audioName);
    } else {
      Logger.error('processRecognition', 'erro na transcricao', cdr);
    }
  }

  private notifyIASMIN(cdr: Cdr, audioName: string) {
    axios.post(`${this.IASMIN_BACKEND_URL}/recognitions`, {
      id: cdr.id,
      createRecognitionDto: JSON.parse(fs.readFileSync(`${this.TRANSCRIPTIONS_PATH}/${audioName.replace('.mp3', '.json')}`, 'utf8')),
    }, {
      timeout: this.REQUEST_TIMEOUT,
    })
      .then(() => {
        this.deleteAudioAndTranscription(audioName);
      })
      .catch((err) => {
        Logger.error('notifyIASMIN', 'error', cdr.id, err.message);
      })
  }

  private deleteAudioAndTranscription(audioName: string) {
    fs.unlink(this.AUDIOS_PATH + '/' + audioName, (err) => {
      if (err) {
        Logger.error('deleteAudioAndTranscription', 'error', audioName, err);
      }
    });
    fs.unlink(this.TRANSCRIPTIONS_PATH + '/' + audioName.replace('.mp3', '.json'), (err) => {
      if (err) {
        Logger.error('deleteAudioAndTranscription', 'error', audioName, err);
      }
    });
  }
}
