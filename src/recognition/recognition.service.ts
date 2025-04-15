import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { spawnSync } from 'node:child_process';
import { createWriteStream, readFileSync, unlink } from 'node:fs';
import { Cdr } from '../model/cdr';

@Injectable()
export class RecognitionService {
  constructor(private readonly configService: ConfigService) {}

  private readonly AUDIOS_PATH = 'audios';
  private readonly TRANSCRIPTIONS_PATH = 'transcriptions';
  private readonly IASMIN_PABX_URL = this.configService.get('IASMIN_PABX_URL');
  private readonly IASMIN_BACKEND_URL =
    this.configService.get('IASMIN_BACKEND_URL');
  private readonly WHISPER_COMMAND = this.configService.get('WHISPER_COMMAND');
  private readonly REQUEST_TIMEOUT = 60000; // 1 minuto
  private readonly logger = new Logger(RecognitionService.name);

  async start(cdr: Cdr) {
    await this.downloadAudio(cdr);
  }

  private async downloadAudio(cdr: Cdr) {
    try {
      const audioName = cdr.uniqueId.replace('.', '_').concat('-a.sln');
      const request = await axios({
        method: 'get',
        url: `${this.IASMIN_PABX_URL}/${audioName}`,
        responseType: 'stream',
      });
      const writer = createWriteStream(`${this.AUDIOS_PATH}/${audioName}`);
      request.data.pipe(writer);

      writer.on('finish', async () => {
        this.logger.log(`audio baixado ${audioName}`);
        await this.processRecognition(cdr, audioName);
        await this.notifyTranscriptionToBackend(cdr, audioName);
        this.deleteAudioAndTranscription(audioName);
      });

      writer.on('error', (err) => {
        this.logger.error(
          `Erro ao escrever audio no disco ${audioName}`,
          err.message,
        );
      });
    } catch (err) {
      this.logger.error(`Erro ao baixar audio ${cdr.uniqueId}`, err.message);
    }
  }

  private async processRecognition(audioName: string) {
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
      `--output_dir=${this.TRANSCRIPTIONS_PATH}`;

    const result = spawnSync(command, { shell: true });
    if (result.status === 0)
      this.logger.log(`Transcricao finalizada com sucesso ${audioName}`);
    else this.logger.error(`Erro na transcricao ${audioName}`);
  }

  private async notifyTranscriptionToBackend(cdr: Cdr, audioName: string) {
    this.logger.log(`Notificando backend transcricao ${audioName}`);
    try {
      await axios.post(
        `${this.IASMIN_BACKEND_URL}/recognitions`,
        {
          id: cdr.id,
          createRecognitionDto: JSON.parse(
            readFileSync(
              `${this.TRANSCRIPTIONS_PATH}/${audioName.replace('.sln', '.json')}`,
              'utf8',
            ),
          ),
        },
        {
          timeout: this.REQUEST_TIMEOUT,
        },
      );
    } catch (err) {
      this.logger.error(`Erro ao notificar backend ${audioName}`, err.message);
    }
  }

  private deleteAudioAndTranscription(audioName: string) {
    unlink(this.AUDIOS_PATH + '/' + audioName, (err) => {
      if (err) {
        this.logger.error(`Erro ao deletar audio ${audioName}`, err);
      }
    });
    unlink(
      this.TRANSCRIPTIONS_PATH + '/' + audioName.replace('.sln', '.json'),
      (err) => {
        if (err) {
          this.logger.error(`Erro ao deletar transcrição ${audioName}`, err);
        }
      },
    );
  }
}
