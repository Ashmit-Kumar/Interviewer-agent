import { voice, initializeLogger } from '@livekit/agents';
import { VAD } from '@livekit/agents-plugin-silero';
import { Room } from '@livekit/rtc-node';

import { connectDatabase } from '../../config/database';
import { connectRedis } from '../../config/redis';
import { sessionRepository } from '../../repositories/sessionRepository';
import { livekitConfig } from '../../config/services';

async function main() {
  const [roomName, token, sessionId] = process.argv.slice(2);

  if (!roomName || !token || !sessionId) {
    console.error('Usage: node agent.js <roomName> <token> <sessionId>');
    process.exit(1);
  }

  console.log('🚀 Starting Interview AI Agent');
  console.log(`📍 Room: ${roomName} | Session: ${sessionId}`);

  /* -------------------- LOGGER -------------------- */

  initializeLogger({ pretty: true, level: 'info' });

  /* -------------------- DATABASES -------------------- */

  await connectDatabase();
  console.log('✓ MongoDB connected');

  await connectRedis();
  console.log('✓ Redis connected');

  /* -------------------- LIVEKIT -------------------- */

  const room = new Room();
  await room.connect(livekitConfig.wsUrl, token);
  console.log('✓ LiveKit connected');

  /* -------------------- VAD -------------------- */

  const vad = await VAD.load();
  console.log('✓ VAD loaded');

  /* -------------------- AGENT SESSION -------------------- */

  const session = new voice.AgentSession({
    stt: 'deepgram/nova-2:en',
    llm: 'openai/gpt-4o-mini',
    tts: `elevenlabs/${process.env.ELEVENLABS_VOICE_ID ?? 'nPczCjzI2devNBz1zQrb'}`,
    vad,
  });

  const agent = new voice.Agent({
    instructions: `
You are a calm, human technical interviewer.

Rules:
- Ask one question at a time
- Never talk over the candidate
- Stop speaking immediately if interrupted
- Do not repeat yourself
- Ignore background noise or echoes
`,
  });

  await session.start({ room, agent });
  console.log('🎤 Agent is live');

  /* -------------------- GREETING -------------------- */

  await session.say(
    "Hello! I'm your AI interviewer. Let me know when you're ready to begin."
  );

  /* -------------------- EVENTS -------------------- */

  // Session closed
  session.on(
    voice.AgentSessionEventTypes.Close,
    (_event: voice.CloseEvent) => {
      console.log('🛑 Session closed');
      process.exit(0);
    }
  );

  // User speech → transcript
  session.on(
    voice.AgentSessionEventTypes.UserInputTranscribed,
    async (event: voice.UserInputTranscribedEvent) => {
      if (!event.isFinal) return;

      const text = event.transcript?.trim();
      if (!text) return;

      console.log(`💬 USER: ${text}`);

      await sessionRepository.addTranscript(sessionId, {
        role: 'user',
        content: text,
        timestamp: new Date(),
      });
    }
  );

  // Agent speech → transcript
  session.on(
    voice.AgentSessionEventTypes.ConversationItemAdded,
    async (event: voice.ConversationItemAddedEvent) => {
      const item = event.item;
      if (item.role !== 'assistant') return;

      const text =
        typeof item.content === 'string'
          ? item.content
          : item.content.find((c): c is string => typeof c === 'string');

      if (!text) return;

      console.log(`🤖 AGENT: ${text}`);

      await sessionRepository.addTranscript(sessionId, {
        role: 'assistant',
        content: text,
        timestamp: new Date(),
      });
    }
  );

  /* -------------------- KEEP ALIVE -------------------- */
  await new Promise<void>(() => {});
}

main().catch((err) => {
  console.error('❌ Fatal agent error:', err);
  process.exit(1);
});




// import { voice } from '@livekit/agents';
// import { VAD } from '@livekit/agents-plugin-silero';
// import { Room } from '@livekit/rtc-node';

// import { connectDatabase } from '../../config/database';
// import { connectRedis } from '../../config/redis';
// import { sessionRepository } from '../../repositories/sessionRepository';
// import { livekitConfig } from '../../config/services';

// async function main() {
//   const [roomName, token, sessionId] = process.argv.slice(2);

//   if (!roomName || !token || !sessionId) {
//     console.error('Usage: ts-node agent.ts <roomName> <token> <sessionId>');
//     process.exit(1);
//   }

//   console.log('🚀 AI Interview Agent starting');
//   console.log(`Room: ${roomName}`);
//   console.log(`Session: ${sessionId}`);

//   /* -------------------- DB + REDIS -------------------- */

//   await connectDatabase();
//   console.log('✓ MongoDB connected');

//   await connectRedis();
//   console.log('✓ Redis connected');

//   /* -------------------- LIVEKIT ROOM -------------------- */

//   const room = new Room();
//   console.log('🌐 Connecting to LiveKit...');
//   await room.connect(livekitConfig.wsUrl, token);
//   console.log('✅ LiveKit connected');

//   /* -------------------- VAD -------------------- */

//   const vad = await VAD.load();
//   console.log('✓ VAD loaded');

//   /* -------------------- AGENT SESSION -------------------- */

//   const session = new voice.AgentSession({
//     stt: 'deepgram/nova-2:en',
//     llm: 'openai/gpt-4o-mini',
//     tts: `elevenlabs/${process.env.ELEVENLABS_VOICE_ID}`,
//     vad,
//   });

//   const agent = new voice.Agent({
//     instructions: `
// You are an AI technical interviewer.

// Rules:
// - Ask one clear question at a time
// - Pause and listen fully before speaking
// - If the candidate interrupts, stop talking immediately
// - Never repeat yourself unless asked
// - Be calm, human, and concise
// `,
//   });

//   console.log('🎯 Starting agent session...');
//   await session.start({ room, agent });
//   console.log('🎤 Agent is live and listening');

//   /* -------------------- GREETING -------------------- */

//   await session.say(
//     "Hello! I’m your AI interviewer. Whenever you’re ready, we can begin."
//   );

//   /* -------------------- EVENTS -------------------- */

//   // Session closed
//   session.on('close', () => {
//     console.log('🛑 Session closed');
//   });

//   // User speech → transcript
//   session.on('user_input_transcribed', async (event: any) => {
//     if (!event?.isFinal || !event.transcript) return;

//     const text = event.transcript.trim();
//     if (!text) return;

//     console.log(`💬 USER: ${text}`);

//     await sessionRepository.addTranscript(sessionId, {
//       role: 'user',
//       content: text,
//       timestamp: new Date(),
//     });
//   });

//   // Agent output
//   session.on('conversation_item_added', async (event: any) => {
//     const item = event?.item;
//     if (!item || item.role !== 'assistant') return;

//     const text =
//       typeof item.content === 'string'
//         ? item.content
//         : item.content?.find((c: any) => typeof c === 'string');

//     if (!text) return;

//     console.log(`🤖 AGENT: ${text}`);

//     await sessionRepository.addTranscript(sessionId, {
//       role: 'assistant',
//       content: text,
//       timestamp: new Date(),
//     });
//   });

//   /* -------------------- KEEP PROCESS ALIVE -------------------- */

//   await new Promise<void>(() => {});
// }

// /* -------------------- BOOT -------------------- */

// main().catch((err) => {
//   console.error('❌ Fatal agent error:', err);
//   process.exit(1);
// });

