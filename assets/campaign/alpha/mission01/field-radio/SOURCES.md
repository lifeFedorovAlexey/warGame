# Сюжетное радио первой миссии

Русские реплики синтезированы локально по тексту субтитров с помощью встроенных голосов Qwen3-TTS.

| Позывной | Голос |
| --- | --- |
| Штаб | `ryan` |
| Разведка | `aiden`, для первой реплики о контакте `ryan` |
| Командир | `eric` |
| Лаборатория | `serena` |

- [Qwen3-TTS-12Hz-1.7B-CustomVoice](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice) от Qwen, [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0).
- [Конверсия Q6_K для speech.cpp](https://huggingface.co/sakasegawa/Qwen3-TTS-12Hz-1.7B-CustomVoice-GGUF/tree/a72e6c6575d67652488cdffc1c863215a9899978) от Sakasegawa, Apache 2.0.
- [speech.cpp 0.10.1](https://github.com/nyosegawa/speech.cpp/releases/tag/v0.10.1) от Sakasegawa, [MIT](https://github.com/nyosegawa/speech.cpp/blob/v0.10.1/LICENSE).
- [Qwen3-ASR-0.6B](https://huggingface.co/Qwen/Qwen3-ASR-0.6B) от Qwen, Apache 2.0. Распознавание использовано для сверки готового звука с субтитрами.

В FFmpeg 7.1 выровнена громкость до −18 LUFS, полоса ограничена фильтрами 100–7400 Гц. Игровые файлы закодированы в Ogg Opus, 48 кГц, моно. В `manifest.json` указана длительность декодированных файлов в секундах.
