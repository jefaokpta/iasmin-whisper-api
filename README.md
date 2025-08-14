# iasmin-whisper-api

Backend responsável por consumir mensagens de CDR via Kafka, realizar transcrição de áudios com Whisper (instalado no host Linux) e enviar os segmentos para o iasmin-backend.

Este README foi escrito para ser completo o suficiente para que um agente (humano ou IA) possa:
- entender a arquitetura e o fluxo de dados;
- instalar e rodar o projeto localmente;
- configurar variáveis de ambiente e dependências externas (Kafka, Whisper, ffmpeg);
- debugar problemas e adicionar novas features seguindo boas práticas (DRY e Immutability).


## Sumário
- Visão Geral
- Arquitetura e Fluxo
- Tecnologias
- Requisitos
- Configuração (env/.folders)
- Como Executar (dev/prod)
- Kafka (tópicos e payload)
- Integração com iasmin-backend
- Diretrizes de Desenvolvimento (DRY/Immutability)
- Debug e Troubleshooting
- Testes
- Estrutura do Projeto


## Visão Geral
O serviço conecta-se a um cluster Kafka, consome eventos de CDR no tópico transcriptions e, para cada CDR:
1. Verifica no iasmin-backend se já existe transcrição para aquele uniqueId.
2. Se não existir, baixa o(s) arquivo(s) de áudio do PABX (IASMIN_PABX_URL) para a pasta local audios/.
3. Aciona um worker (Node.js Worker Threads) que executa o CLI whisper no host para transcrever o áudio, gerando um JSON em transcriptions/.
4. Envia os segmentos gerados via HTTP para o iasmin-backend.

A aplicação expõe um servidor HTTP Nest na PORT apenas para compatibilidade/observabilidade, mas não possui endpoints públicos de negócio; o consumo principal acontece via microservice Kafka.


## Arquitetura e Fluxo
Componentes principais:
- Kafka Microservice (NestJS):
  - clientId: iasmin-whisper-api
  - consumer group: iasmin-whisper-api-consumer
  - tópico: transcriptions
- RecognitionService: orquestra download de áudio, chamada ao worker de transcrição e notificação ao backend.
- Worker de Transcrição: executa o comando whisper via shell (spawnSync), salvando a saída JSON em transcriptions/.
- iasmin-backend: consulta prévia (GET /recognitions/:uniqueId) e envio de segmentos (POST /recognitions).

Fluxo resumido:
- Mensagem Kafka (CDR) -> KafkaController -> RecognitionService.jobManager ->
  - verifica backend -> baixa áudio(s) -> worker transcreve -> lê JSON -> POST para backend -> remove arquivos.


## Tecnologias
- NestJS (Framework) — https://docs.nestjs.com
- Kafka (kafkajs / microservices Nest) — mensagens assíncronas
- Axios — chamadas HTTP para iasmin-backend
- Whisper (CLI) — transcrição de áudio — https://github.com/openai/whisper

Bibliotecas (package.json): @nestjs/axios, @nestjs/config, @nestjs/microservices, kafkajs, axios, class-validator, class-transformer, rxjs.


## Requisitos
- Node.js 20+ (recomendado LTS atual). NPM incluído.
- Kafka acessível (local ou remoto).
- Python 3 e ffmpeg instalados no host.
- Whisper instalado no host (via pip install -U openai-whisper).
- Modelo whisper "large" baixado na primeira execução (o CLI baixa automaticamente).
- Pastas locais: audios/ e transcriptions/ devem existir com permissão de escrita.


## Configuração
Variáveis de ambiente utilizadas:
- PORT: porta HTTP do Nest (default: 3000).
- VEIA_KAFKA_BROKER: endereço do broker Kafka (ex.: localhost:9094).
- IASMIN_PABX_URL: base URL para download de áudios do PABX (ex.: http://pabx-host/records).
- IASMIN_BACKEND_URL: URL do backend principal (ex.: http://localhost:3001).
- IASMIN_BACKEND_URL_DEVELOPER: URL alternativa para instâncias de dev (usada quando isDeveloperInstance = true no CDR).
- WHISPER_COMMAND: caminho/comando do CLI do whisper (ex.: whisper ou /usr/local/bin/whisper).

Exemplo de .env:
PORT=3000
VEIA_KAFKA_BROKER=localhost:9094
IASMIN_PABX_URL=http://pabx-host/records
IASMIN_BACKEND_URL=http://localhost:3001
IASMIN_BACKEND_URL_DEVELOPER=http://localhost:3001
WHISPER_COMMAND=whisper

Pastas necessárias (na raiz do projeto):
- audios/
- transcriptions/


## Como Executar
Instalação:
- npm ci

Desenvolvimento (watch + microservice Kafka):
- npm run start:dev:whisper

Debug (Node inspector):
- npm run start:debug

Produção:
- npm run build
- npm run start:prod

Observações:
- O worker é carregado de dist/workers/transcription.worker.js, portanto a transcrição via worker exige build (em dev o Nest compila em tempo real ao rodar com --watch).
- Certifique-se de que WHISPER_COMMAND é válido e que ffmpeg está no PATH do host.


## Kafka
- Tópico consumido: transcriptions
- Grupo de consumo: iasmin-whisper-api-consumer
- ClientId: iasmin-whisper-api

Payload esperado (interface Cdr):
{
  "id": 123,
  "uniqueId": "1694800000.42",
  "callRecord": "2025-07-22_12-00-00_1694800000.42.mp3",
  "userfield": "OUTBOUND" | "INBOUND" | "UPLOAD",
  "isDeveloperInstance": true | false
}

Regras por tipo:
- OUTBOUND/INBOUND: baixará duas pernas de áudio (A e B) do PABX em formato .sln, com nomes derivados de uniqueId (ex.: 1694800000-42-a.sln e -b.sln) a partir de IASMIN_PABX_URL.
- UPLOAD: usa callRecord (mp3) em IASMIN_PABX_URL/mp3s/<callRecord>, e considera ambos os lados (BOTH) num único arquivo.

Backoff/concorrência:
- Execução single worker. Se o worker estiver ocupado, a chamada loga "Whisper ocupado", aguarda 10s e lança exceção. Produtores devem reentregar a mensagem conforme política do Kafka.


## Integração com iasmin-backend
- Verificação prévia:
  - GET {IASMIN_BACKEND_URL}/recognitions/{uniqueId}
  - Em caso de 200, cancela o processamento (já existe transcrição).
- Envio de segmentos:
  - POST {IASMIN_BACKEND_URL}/recognitions
  - body: { cdrId: number, segments: any[] }
  - Os segmentos são lidos do JSON gerado pelo whisper e são marcados com callLeg: "A" | "B" | "BOTH".
- Quando isDeveloperInstance = true no CDR, as URLs de backend vêm de IASMIN_BACKEND_URL_DEVELOPER.


## Diretrizes de Desenvolvimento
Boas práticas adotadas:
- DRY (Don't Repeat Yourself) — https://en.wikipedia.org/wiki/Don%27t_repeat_yourself
- Immutability — https://en.wikipedia.org/wiki/Immutable_object

Padrões no código:
- Configurações via @nestjs/config (ConfigService) em vez de process.env direto.
- Tipagem explícita (interfaces/enums em src/types.ts).
- Funções utilitárias puras (ex.: defineAudioNameAndUrl em src/utils.ts) para respeitar imutabilidade e facilitar testes.
- Side-effects (I/O, spawn, HTTP) concentrados em serviços (RecognitionService) e worker (transcription.worker.ts).

Sugestões ao contribuir:
- Antes de transcrever, sempre checar existência da transcrição no backend.
- Validar entradas com ValidationPipe (já habilitado globalmente) e manter DTOs/tipos atualizados.
- Evitar criar múltiplos workers; se necessário, tratar fila/prioridade explicitamente e documentar.


## Debug e Troubleshooting
- Logs:
  - Worker imprime "Executando Transcricao" com PID e nome do arquivo.
  - RecognitionService loga avanço/erros (download, escrita, notificação, delete de arquivos).
- Erros comuns:
  - "Erro ao baixar audio": verifique IASMIN_PABX_URL e acessibilidade do arquivo.
  - "Worker error"/"desligou worker": o worker será recriado automaticamente.
  - JSON inexistente em transcriptions/: cheque se WHISPER_COMMAND está configurado e se o whisper concluiu.
  - Permissões: garanta escrita nas pastas audios/ e transcriptions/.
- Execução do whisper manual:
  whisper audios/arquivo.sln --model=large --fp16=False --language=pt --beam_size=5 --patience=2 --output_format=json --output_dir=transcriptions


## Testes
- npm test — testes unitários
- npm run test:e2e — testes e2e (se configurados)
- npm run test:cov — cobertura


## Estrutura do Projeto (principais arquivos)
- src/main.ts — bootstrap Nest + microservice Kafka
- src/app.module.ts — módulos principais
- src/kafka/kafka.controller.ts — consumer (@MessagePattern('transcriptions'))
- src/kafka/kafka.module.ts — módulo Kafka
- src/recognition/recognition.service.ts — orquestração do fluxo
- src/recognition/recognition.module.ts — módulo Recognition
- src/workers/transcription.worker.ts — execução do CLI whisper
- src/utils.ts — utilitários
- src/types.ts — interfaces/enums (CDR, AudioData, CallLeg, Userfield)


## Licença
Uso interno. Consulte o arquivo LICENSE da organização, se aplicável.
