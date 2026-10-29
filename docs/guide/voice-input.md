# Desktop voice input

English | [简体中文](voice-input.zh-CN.md)

The Web workbench can transcribe microphone audio through Volcengine Agent Plan ASR.
Set `AGH_ASR_API_KEY` in the environment of the process launching the Web server,
then start AGH normally. Keep the key out of repository files and browser configuration.
An unset key disables backend ASR access. The endpoint is restricted to the existing
loopback Web origin; this does not enable remote or mobile access.

Select a conversation, click the microphone icon (**语音输入**), allow microphone access, and speak.
Partial transcription appears in the input box. While recording, the input is read-only and sending is disabled. Click the stop icon (**结束录音**) to finish and
append the final text to the current draft. Review and send manually. **取消录音** (×),
switching conversations, disconnecting from AGH, and closing the page discard the current transcription.
Existing draft text and attachments are preserved. Stopping recording does not
cancel a running task.

Audio is captured using AudioWorklet and sent as 16 kHz mono signed 16-bit PCM.
The server holds the provider credential and relays audio through `/api/asr`.
Each recording is limited to two minutes, with two concurrent connections per Web
server and bounded buffers. Failed connections preserve the existing draft.
Audio is sent to Volcengine; this module does not save recordings locally.

Use a current desktop browser with microphone and AudioWorklet support. Start with
localhost deployment; mobile HTTPS and remote authentication remain separate work.

Provider contract: [Agent Plan speech API](https://docs.volcengine.com/docs/ark/agent-plan-personal-voice-model?lang=zh).
