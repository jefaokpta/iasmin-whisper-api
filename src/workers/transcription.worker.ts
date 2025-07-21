/**
 * @author Jefferson Alves Reis (jefaokpta)
 * @email jefaokpta@hotmail.com
 * @create 18/07/2025
 */
import { parentPort } from 'worker_threads';
import * as process from 'node:process';
import { spawnSync } from 'node:child_process';
import { CallLegEnum } from '../utils/enums';
import { Cdr } from '../model/cdr';

const WHISPER_COMMAND = process.env.WHISPER_COMMAND;
const TRANSCRIPTIONS_PATH = 'transcriptions';

async function main(audioData: { cdr: Cdr; audioNameA: string; audioUrlA: string; audioNameB: string; audioUrlB: string; callLeg?: CallLegEnum }) {
  const audioName = audioData.callLeg === CallLegEnum.A ? audioData.audioNameA : audioData.audioNameB;
  const pid = process.pid;
  console.log(`Worker ${pid} Executando Transcricao: ${audioName}`);
  const command =
    WHISPER_COMMAND +
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
    `--output_dir=${TRANSCRIPTIONS_PATH}`;

  spawnSync(command, { shell: true });
  // Send response back to main thread
  parentPort?.postMessage(audioData);
}

// Listen for messages from the main thread
parentPort?.on('message', main);
