### Tasks

### Immediate Tasks

- Rewrite the zero shot react agent from scratch so that I have more control over the code
- Finish sensors at least minimally working
- Work on testing coverage (specifically chat context referencing)

### Medium Term Tasks

- Write a function based agent, I suspect that it will have better performance than what we have now
- Move towards removing langchain as a dependency, it is a bit bloat-y, opaque, and annoying to debug
  - Think about moving to pgvector instead of hnswlib
- Get python packager stuff organized enough to be usable by someone besides me

### Long Term Tasks

- Re-evaluate the use of whisper.cpp and see the quality can reach the level of google stt
- Find better tts solution that supports emotions and handles numbers and acronyms better
