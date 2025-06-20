import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { spawnSync } from 'node:child_process';
import { createWriteStream, readFileSync, unlink } from 'node:fs';
import { Cdr } from '../model/cdr';
import { CallLegEnum, UserfieldEnum } from '../utils/enums';

@Injectable()
export class RecognitionService {
  private readonly AUDIOS_PATH = 'audios';
  private readonly TRANSCRIPTIONS_PATH = 'transcriptions';
  private readonly IASMIN_PABX_URL = this.configService.get('IASMIN_PABX_URL');
  private readonly IASMIN_BACKEND_URL = this.configService.get('IASMIN_BACKEND_URL');
  private readonly IASMIN_BACKEND_URL_DEVELOPER = this.configService.get('IASMIN_BACKEND_URL_DEVELOPER');
  private readonly WHISPER_COMMAND = this.configService.get('WHISPER_COMMAND');
  private readonly REQUEST_TIMEOUT = 60000; // 1 minuto
  private readonly logger = new Logger(RecognitionService.name);

  constructor(private readonly configService: ConfigService) {}

  async start(cdr: Cdr) {
    if (cdr.userfield === UserfieldEnum.UPLOAD) return this.processUpload(cdr);
    const audioNameA = cdr.uniqueId.replace('.', '-').concat('-a.sln');
    const audioNameB = cdr.uniqueId.replace('.', '-').concat('-b.sln');
    const audioUrlA = `${this.IASMIN_PABX_URL}/${audioNameA}`;
    const audioUrlB = `${this.IASMIN_PABX_URL}/${audioNameB}`;
    try {
      await Promise.all([this.processAudio(audioNameA, audioUrlA), this.processAudio(audioNameB, audioUrlB)]);
      await this.notifyTranscriptionToBackend(cdr, audioNameA, audioNameB);
      this.deleteAudioAndTranscription(audioNameA);
      this.deleteAudioAndTranscription(audioNameB);
    } catch (error) {
      this.logger.error(`Erro no processamento de áudio para ${cdr.uniqueId}`, error);
    }
  }

  private async processUpload(cdr: Cdr) {
    const audioUrl = `${this.IASMIN_PABX_URL}/mp3s/${cdr.callRecord}`;
    await this.processAudio(cdr.callRecord, audioUrl);
    await this.notifyTranscriptionToBackend(cdr, '', '', true);
  }

  private processAudio(audioName: string, audioUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      axios({
        method: 'get',
        url: audioUrl,
        responseType: 'stream',
      })
        .then((request) => {
          const writer = createWriteStream(`${this.AUDIOS_PATH}/${audioName}`);
          request.data.pipe(writer);

          writer.on('finish', async () => {
            this.logger.log(`audio baixado ${audioName}`);
            await this.processRecognition(audioName);
            resolve();
          });

          writer.on('error', (err) => {
            this.logger.error(`Erro ao escrever audio no disco ${audioName}`, err.message);
            reject(err);
          });
        })
        .catch((err) => {
          this.logger.error(`Erro ao baixar audio ${audioName}`, err.message);
          reject(err);
        });
    });
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
    if (result.status === 0) this.logger.log(`Transcricao finalizada com sucesso ${audioName}`);
    else this.logger.error(`Erro na transcricao ${audioName}`);
  }

  private async notifyTranscriptionToBackend(cdr: Cdr, audioNameA: string, audioNameB: string, upload: boolean = false) {
    this.logger.log(`Notificando backend transcricao da ligacao ${cdr.uniqueId}`);
    try {
      let segments: any[];
      if (upload) {
        segments = this.getSegmentWithCallLeg(this.readTranscription(cdr.callRecord), CallLegEnum.BOTH);
      } else {
        const segmentsA = this.getSegmentWithCallLeg(this.readTranscription(audioNameA), CallLegEnum.A);
        const segmentsB = this.getSegmentWithCallLeg(this.readTranscription(audioNameB), CallLegEnum.B);
        segments = segmentsA.concat(segmentsB);
      }
      const backendUrl = this.defineBackendUrl(cdr.isDeveloperInstance);
      await axios.post(
        `${backendUrl}/recognitions`,
        {
          cdrId: cdr.id,
          segments,
        },
        {
          timeout: this.REQUEST_TIMEOUT,
        },
      );
    } catch (err) {
      this.logger.error(`Erro ao notificar backend ${cdr.uniqueId}`, err.response?.data?.message, err.message);
    }
  }

  private getSegmentWithCallLeg(transcriptionA: any, callLeg: string) {
    return transcriptionA.segments.map((s: any) => {
      s.callLeg = callLeg;
      return s;
    });
  }

  private readTranscription(audioName: string) {
    const jsonFileName = audioName.replace(/\.(sln|mp3)$/, '.json');
    return JSON.parse(readFileSync(`${this.TRANSCRIPTIONS_PATH}/${jsonFileName}`, 'utf8'));
  }

  private deleteAudioAndTranscription(audioName: string) {
    unlink(this.AUDIOS_PATH + '/' + audioName, (err) => {
      if (err) {
        this.logger.error(`Erro ao deletar audio ${audioName}`, err);
      }
    });
    unlink(this.TRANSCRIPTIONS_PATH + '/' + audioName.replace('.sln', '.json'), (err) => {
      if (err) {
        this.logger.error(`Erro ao deletar transcrição ${audioName}`, err);
      }
    });
  }

  private defineBackendUrl(isDeveloperInstance?: boolean) {
    if (isDeveloperInstance) {
      return this.IASMIN_BACKEND_URL_DEVELOPER;
    }
    return this.IASMIN_BACKEND_URL;
  }
}
