#define WHISPER_SHARED
#include "./deps/whisper.h"

#define NAPI_DISABLE_CPP_EXCEPTIONS
#include "node_modules/node-addon-api/napi.h"

#include <iostream>
#include <exception>
#include <thread>
#include <string>
#include <cmath>
#include <fstream>
#include <queue>
#include <sstream>
#include <optional>

void high_pass_filter(std::vector<float> & data, float cutoff, float sample_rate) {
  const float rc = 1.0f / (2.0f * M_PI * cutoff);
  const float dt = 1.0f / sample_rate;
  const float alpha = dt / (rc + dt);

  float y = data[0];

  for (size_t i = 1; i < data.size(); i++) {
    y = alpha * (y + data[i] - data[i - 1]);
    data[i] = y;
  }
}

bool vad(std::vector<float> & pcmf32, int sample_rate, int unprocessedSamples, float vad_thold, float freq_thold) {
  if (freq_thold > 0.0f) {
    high_pass_filter(pcmf32, freq_thold, sample_rate);
  }

  float energy_all  = 0.0f;

  int n_samples = std::min((size_t)unprocessedSamples, pcmf32.size());

  for (int i = 0; i < n_samples; i++) {
    energy_all += fabsf(pcmf32[i]);
  }

  energy_all /= n_samples;

  return energy_all > vad_thold;
}

struct Params {
  std::string model_path = "models/ggml-base.en.bin";
};

class ASRUnit;

enum class WorkloadType {
  Audio,
  Release
};

struct Workload {
  WorkloadType type;
  std::optional<std::vector<float>> buffer;
  std::shared_ptr<ASRUnit> unit;
};

struct TimestampedBuffer {
  std::vector<float> buffer;
  int64_t timestamp;
  int64_t endTime() const {
    return timestamp + buffer.size() * 1000 / WHISPER_SAMPLE_RATE;
  }
};

const int n_samples_30s = WHISPER_SAMPLE_RATE * 30;
const float freq_threshold = 0.0f;

// TUNING PARAMETERS
const int n_samples_overlap_desired = WHISPER_SAMPLE_RATE * 0.22;
const float vad_threshold = 0.008f;
const int n_whisper_threads = 5;

class ASRUnit : public std::enable_shared_from_this<ASRUnit> {
  static struct whisper_context *ctx;
  static std::thread whisperWorker;
  static bool running;
  static std::queue<Workload> workQueue;
  static std::mutex workQueueMutex;
  static std::vector<float> inferenceBuffer;

  // NOTE This is model specific, this needs to be updated if the model changes
  static bool suppressQuietInferences(const std::string &text) {
    if (text == " you") return true;
    if (text == " [BLANK_AUDIO]") return true;
    if (text == " [ Silence ]") return true;
    return false;
  }

  static void runWhisperOnUnit(std::shared_ptr<ASRUnit> unit) {
    if (unit->unprocessedSamples < n_samples_overlap_desired) {
      return;
    }

    // zero out the inference buffer
    std::fill(inferenceBuffer.begin(), inferenceBuffer.end(), 0.0f);

    const int samplesToCopy = std::min(n_samples_30s, unit->unprocessedSamples + n_samples_overlap_desired);
    unit->unprocessedSamples = 0;

    // copy the samples into the beginning of the inference buffer
    std::copy(unit->pcmf32.end() - samplesToCopy, unit->pcmf32.end(), inferenceBuffer.begin());    

    // run vad on the inference buffer
    const bool isSpeech = vad(inferenceBuffer, WHISPER_SAMPLE_RATE, 1000, vad_threshold, freq_threshold);

    if (!isSpeech) {
      return;
    }

    whisper_full_params wparams = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);

    wparams.print_progress   = false;
    wparams.print_special    = false;
    wparams.print_realtime   = false;
    wparams.print_timestamps = false;
    wparams.translate        = false;
    wparams.single_segment   = true;
    wparams.max_tokens       = 512;
    wparams.language         = "en";
    // wparams.n_threads        = std::max(1u, std::thread::hardware_concurrency() - 1);
    wparams.n_threads        = n_whisper_threads;

    wparams.audio_ctx        = 0;
    wparams.speed_up         = false;

    // disable temperature fallback
    //wparams.temperature_inc  = -1.0f;
    // wparams.temperature_inc  = params.no_fallback ? 0.0f : wparams.temperature_inc;

    wparams.prompt_tokens = unit->prompt_tokens.data();
    wparams.prompt_n_tokens = unit->prompt_tokens.size();

    if (whisper_full(ctx, wparams, inferenceBuffer.data(), inferenceBuffer.size()) != 0) {
      Napi::Error::Fatal("ASRUnit::runWhisperOnUnit", "Failed to process audio");
    }

    std::stringstream ss;

    const int n_segments = whisper_full_n_segments(ctx);
    for (int i = 0; i < n_segments; ++i) {
      ss << whisper_full_get_segment_text(ctx, i);
    }

    unit->text = ss.str();

    if (suppressQuietInferences(unit->text)) {
      return;
    }

    // TODO Make this non-blocking (new thread for managing the text results)
    const auto status = unit->callback.BlockingCall(unit.get());
    if (status != napi_ok) {
      unit->destroyed = true;
    }
  }

  static void runWhisper() {
    while (running) {
      std::vector<Workload> workloads;
      bool didWork = false;

      {
        std::lock_guard<std::mutex> lock(workQueueMutex);
        while (!workQueue.empty()) {
          workloads.push_back(workQueue.front());
          workQueue.pop();
        }
      }

      // we will need a deduped list of units
      std::vector<std::shared_ptr<ASRUnit>> units;

      for (auto &workload : workloads) {
        // process the audio
        if (workload.type == WorkloadType::Audio) {
          auto unit = workload.unit;
          if (unit->destroyed) {
            continue;
          }

          didWork = true;
          auto pcm = *workload.buffer;

          unit->unprocessedSamples += pcm.size();
          
          // keep the last 30s of audio
          unit->pcmf32.insert(unit->pcmf32.end(), pcm.begin(), pcm.end());
          unit->pcmf32.erase(unit->pcmf32.begin(), unit->pcmf32.begin() + pcm.size());

          // TODO Make this non dropping
          if (pcm.size() > n_samples_30s) {
            std::clog << "Warning: dropping " << pcm.size() - n_samples_30s << " samples" << std::endl;
          }

          bool found = false;
          for (auto &u : units) {
            if (u->id == unit->id) {
              found = true;
              break;
            }
          }

          if (!found) {
            units.push_back(unit);
          }
        } else {
          // WorkloadType::Release
          workload.unit->callback.Release();
        }
      }

      // run whisper on the units
      for (auto &unit : units) {
        if (unit->needsAcquisition) {
          unit->needsAcquisition = false;
          auto status = unit->callback.Acquire();
          if (status != napi_ok) {
            Napi::Error::Fatal("ASRUnit::runWhisper", "Failed to acquire callback");
          }
        }
        runWhisperOnUnit(unit);
      }

      if (!didWork) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
      }
    }
  }

  std::vector<float> pcmf32;
  std::vector<whisper_token> prompt_tokens;
  std::string id;
  std::string text;
  int unprocessedSamples = 0;
  
  // Lifecycle
  bool needsAcquisition = true;
  bool destroyed = false;

  // The ability to re run the inference 
  // std::vector<TimestampedBuffer> finalizationBuffer;
public:
  static void callbackTrampoline(Napi::Env env, Napi::Function jsCallback, std::nullptr_t *data, ASRUnit *thisView) {
    jsCallback.Call({ Napi::String::New(env, thisView->text) });
  }

private:
  Napi::TypedThreadSafeFunction<std::nullptr_t, ASRUnit, callbackTrampoline> callback;

public:
  static void init(Params &&params) {
    // start the whisper worker
    running = true;
    whisperWorker = std::thread(runWhisper);

    whisper_lang_id("en");
    ctx = whisper_init_from_file(params.model_path.c_str());
    if (!ctx) {
      Napi::Error::Fatal("ASRUnit::init", "Failed to initialize whisper (check model path)");
    }

    inferenceBuffer = std::vector(n_samples_30s, 0.0f);

    atexit([]() {
      if (ctx) {
        whisper_free(ctx);
      }
    });
  }

  ASRUnit(const std::string &id, const decltype(callback) &callback) : pcmf32(n_samples_30s, 0.0f), id(id), callback(callback) {}

  void process(const Napi::Buffer<char> &data) {
    if (destroyed) {
      std::clog << "Warning: ASRUnit::process called on destroyed unit" << std::endl;
      return;
    }

    std::vector<float> pcm(data.ByteLength() / 2);

    for (size_t i = 0; i < pcm.size(); i++) {
      pcm[i] = ((int16_t *)data.Data())[i] / 32768.0f;
    }

    std::lock_guard<std::mutex> lock(workQueueMutex);
    workQueue.push({WorkloadType::Audio, pcm, shared_from_this()});
  }

  void destroy() {
    destroyed = true;
    // need to release the callback
    std::lock_guard<std::mutex> lock(workQueueMutex);
    workQueue.push({WorkloadType::Release, {}, shared_from_this()});
  }

  ~ASRUnit() {
    std::clog << "ASRUnit destructor " << id << std::endl;
  }
};

struct whisper_context *ASRUnit::ctx;
std::thread ASRUnit::whisperWorker;
bool ASRUnit::running;
std::queue<Workload> ASRUnit::workQueue;
std::mutex ASRUnit::workQueueMutex;
std::vector<float> ASRUnit::inferenceBuffer;

Napi::Value createASRUnit(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  Napi::Function callback = info[0].As<Napi::Function>();
  Napi::String asrId = info[1].As<Napi::String>();

  auto emitThreadSafe = Napi::TypedThreadSafeFunction<
    std::nullptr_t,
    ASRUnit,
    ASRUnit::callbackTrampoline
  >::New(env, callback, "asr_callback", 0, 1);

  const auto unit = std::make_shared<ASRUnit>(asrId.Utf8Value(), emitThreadSafe);

  // create a proccess function for the napi returned object
  Napi::Function process = Napi::Function::New(env, [unit](const Napi::CallbackInfo &info) {
    unit->process(info[0].As<Napi::Buffer<char>>());

    return Napi::Value();
  });

  Napi::Function end = Napi::Function::New(env, [unit](const Napi::CallbackInfo &info) {
    unit->destroy();

    return Napi::Value();
  });

  auto ret = Napi::Object::New(env);

  ret.Set(Napi::String::New(env, "process"), process);
  ret.Set(Napi::String::New(env, "destroy"), end);

  return ret;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  ASRUnit::init({
    .model_path = "models/ggml-base.en.bin",
  });
  exports.Set(Napi::String::New(env, "createASRUnit"), Napi::Function::New(env, createASRUnit));
  return exports;
}

NODE_API_MODULE(whisper_wrapper, Init)
