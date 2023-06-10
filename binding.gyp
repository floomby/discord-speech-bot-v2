{
  "targets": [
    {
      "target_name": "whisper_wrapper",
      "sources": [ "whisper_wrapper.cpp" ],
      "libraries": [ "<(module_root_dir)/deps/libwhisper.so" ],
      "cflags": [ "-std=c++17" ],
    }
  ]
} 
