import { env, pipeline } from "@huggingface/transformers";

/*
=========================================================
SMART AI AUDIO SUMMARIZER
Browser AI Engine
=========================================================

- Whisper Small runs in the visitor's browser.
- Browser cache is enabled.
- No local desktop Python is required.
- Summary uses a browser model when available.
- If the summary model cannot be fetched, the code
  automatically falls back to a local extractive summary.
- Translation remains browser-based.
=========================================================
*/

env.allowLocalModels = false;
env.useBrowserCache = true;

/* =====================================================
   MODELS
===================================================== */

/*
   Whisper Small browser model.
   Based on OpenAI Whisper Small and prepared for
   Transformers.js / ONNX browser inference.
*/
const ASR_MODEL =
  "onnx-community/whisper-small_timestamped";

/*
   Smaller browser-compatible summarization model.

   This replaces:
   onnx-community/text_summarization-ONNX

   which was causing the "Failed to fetch" problem.
*/
const SUMMARY_MODEL =
  "Xenova/distilbart-cnn-6-6";

/*
   Browser translation models.
*/
const TRANSLATION_MODELS = {
  German: "Xenova/opus-mt-en-de",
  Spanish: "Xenova/opus-mt-en-es",
  French: "Xenova/opus-mt-en-fr",
  Italian: "Xenova/opus-mt-en-it",
};

/* =====================================================
   MODEL CACHE
===================================================== */

let asrPromise = null;
let summarizerPromise = null;

const translatorPromises = new Map();

/* =====================================================
   DEVICE OPTIONS
===================================================== */

function deviceOptions(progress_callback, dtype = null) {
  const hasWebGPU =
    typeof navigator !== "undefined" &&
    Boolean(navigator.gpu);

  return {
    device: hasWebGPU ? "webgpu" : "wasm",

    dtype:
      dtype ||
      (hasWebGPU ? "q4" : "q8"),

    progress_callback,
  };
}

/* =====================================================
   PROGRESS MESSAGE
===================================================== */

function progressMessage(data, label) {
  if (!data || !label) {
    return label;
  }

  if (
    data.status === "progress" &&
    typeof data.progress === "number"
  ) {
    return `${label} ${Math.round(data.progress)}%`;
  }

  if (data.status === "downloading") {
    return `${label} — downloading model...`;
  }

  if (data.status === "loading") {
    return `${label} — loading model...`;
  }

  return label;
}

/* =====================================================
   WHISPER SMALL
===================================================== */

async function getASR(onProgress) {
  if (asrPromise) {
    return asrPromise;
  }

  asrPromise = pipeline(
    "automatic-speech-recognition",
    ASR_MODEL,
    deviceOptions((data) => {
      onProgress?.(
        progressMessage(
          data,
          "Loading Whisper Small..."
        )
      );
    })
  ).catch((error) => {
    /*
      Reset the promise if model loading fails.
      This allows another attempt later.
    */
    asrPromise = null;
    throw error;
  });

  return asrPromise;
}

/* =====================================================
   BROWSER SUMMARIZER
===================================================== */

async function getSummarizer(onProgress) {
  if (summarizerPromise) {
    return summarizerPromise;
  }

  summarizerPromise = pipeline(
    "summarization",
    SUMMARY_MODEL,
    deviceOptions((data) => {
      onProgress?.(
        progressMessage(
          data,
          "Loading browser summarizer..."
        )
      );
    })
  ).catch((error) => {
    /*
      Important:
      Do not leave a rejected promise cached.
    */
    summarizerPromise = null;
    throw error;
  });

  return summarizerPromise;
}

/* =====================================================
   TRANSLATOR
===================================================== */

async function getTranslator(
  language,
  onProgress
) {
  const modelId =
    TRANSLATION_MODELS[language];

  if (!modelId) {
    throw new Error(
      `Unsupported translation language: ${language}`
    );
  }

  if (
    translatorPromises.has(language)
  ) {
    return translatorPromises.get(language);
  }

  const hasWebGPU =
    typeof navigator !== "undefined" &&
    Boolean(navigator.gpu);

  const promise = pipeline(
    "translation",
    modelId,
    {
      device:
        hasWebGPU
          ? "webgpu"
          : "wasm",

      dtype: "q8",

      progress_callback: (data) => {
        onProgress?.(
          progressMessage(
            data,
            `Loading ${language} translator...`
          )
        );
      },
    }
  ).catch((error) => {
    translatorPromises.delete(
      language
    );

    throw error;
  });

  translatorPromises.set(
    language,
    promise
  );

  return promise;
}

/* =====================================================
   WORD CHUNKS -> SEGMENTS
===================================================== */

function groupWordChunks(chunks) {
  const words = (chunks || [])
    .map((chunk) => {
      const timestamp =
        Array.isArray(chunk?.timestamp)
          ? chunk.timestamp
          : [0, 0];

      const start = Number(
        timestamp[0] ?? 0
      );

      const end = Number(
        timestamp[1] ??
        timestamp[0] ??
        start
      );

      return {
        word: String(
          chunk?.text || ""
        ).trim(),

        start:
          Number.isFinite(start)
            ? start
            : 0,

        end:
          Number.isFinite(end)
            ? end
            : start,
      };
    })
    .filter(
      (item) => item.word.length > 0
    );

  const segments = [];

  let current = [];

  for (const word of words) {
    const previous =
      current[
        current.length - 1
      ];

    const gap =
      previous
        ? word.start -
          previous.end
        : 0;

    /*
      Keep the transcript in readable
      sentence-sized groups.
    */
    if (
      current.length >= 12 ||
      gap > 2.8
    ) {
      if (current.length > 0) {
        segments.push(current);
      }

      current = [];
    }

    current.push(word);
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments.map(
    (items) => ({
      start:
        items[0]?.start ?? 0,

      end:
        items[
          items.length - 1
        ]?.end ?? 0,

      text:
        items
          .map(
            (item) =>
              item.word
          )
          .join(" "),

      words: items,
    })
  );
}

/* =====================================================
   TEXT CLEANING
===================================================== */

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

/* =====================================================
   TEXT CHUNKING
===================================================== */

function splitText(
  text,
  maxChars = 700
) {
  const clean =
    cleanText(text);

  if (!clean) {
    return [];
  }

  if (
    clean.length <= maxChars
  ) {
    return [clean];
  }

  const sentences =
    clean.split(
      /(?<=[.!?])\s+/
    );

  const chunks = [];

  let current = "";

  for (
    const sentence
    of sentences
  ) {
    if (!sentence) {
      continue;
    }

    const candidate =
      `${current} ${sentence}`.trim();

    if (
      candidate.length <=
      maxChars
    ) {
      current =
        candidate;
    } else {
      if (current) {
        chunks.push(
          current
        );
      }

      /*
        Extremely long individual
        sentence.
      */
      if (
        sentence.length >
        maxChars
      ) {
        for (
          let i = 0;
          i < sentence.length;
          i += maxChars
        ) {
          chunks.push(
            sentence.slice(
              i,
              i + maxChars
            )
          );
        }

        current = "";
      } else {
        current =
          sentence;
      }
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length
    ? chunks
    : [clean];
}

/* =====================================================
   TRANSCRIPTION
===================================================== */

export async function transcribeAudio(
  file,
  onProgress
) {
  if (!file) {
    throw new Error(
      "No audio file selected."
    );
  }

  const model =
    await getASR(
      onProgress
    );

  /*
    Create a browser object URL.

    Transformers.js supports audio URLs for
    browser speech recognition.
  */
  const objectUrl =
    URL.createObjectURL(
      file
    );

  try {
    onProgress?.(
      "Transcribing with Whisper Small..."
    );

    console.log(
      "Transcribing file:",
      file.name
    );

    console.log(
      "MIME type:",
      file.type
    );

    console.log(
      "File size:",
      file.size
    );

    /*
      Whisper Small with word timestamps.
    */
    const output =
      await model(
        objectUrl,
        {
          return_timestamps:
            "word",

          chunk_length_s:
            30,

          stride_length_s:
            5,
        }
      );

    console.log(
      "Whisper result:",
      output
    );

    const segments =
      groupWordChunks(
        output?.chunks ||
          []
      );

    return {
      success: true,

      text:
        output?.text ||
        "",

      language:
        output?.language ||
        "Auto-detected",

      segments,
    };
  } finally {
    URL.revokeObjectURL(
      objectUrl
    );
  }
}

/* =====================================================
   EXTRACTIVE SUMMARY FALLBACK
===================================================== */

function createExtractiveSummary(
  text
) {
  const clean =
    cleanText(text);

  if (!clean) {
    return "";
  }

  /*
    Split transcript into sentences.
  */
  const sentences =
    clean
      .split(
        /(?<=[.!?])\s+/
      )
      .map(
        (sentence) =>
          sentence.trim()
      )
      .filter(
        (sentence) =>
          sentence.length >= 25
      );

  if (
    sentences.length === 0
  ) {
    return clean;
  }

  /*
    Stop words.
  */
  const stopWords =
    new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "if",
      "then",
      "than",
      "this",
      "that",
      "these",
      "those",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "to",
      "of",
      "in",
      "on",
      "for",
      "with",
      "from",
      "by",
      "as",
      "at",
      "it",
      "its",
      "into",
      "about",
      "can",
      "could",
      "will",
      "would",
      "should",
      "has",
      "have",
      "had",
      "do",
      "does",
      "did",
      "you",
      "your",
      "we",
      "our",
      "they",
      "their",
      "he",
      "she",
      "his",
      "her",
      "i",
      "me",
      "my",
      "not"
    ]);

  /*
    Word frequencies.
  */
  const frequency =
    {};

  for (
    const sentence
    of sentences
  ) {
    const words =
      sentence
        .toLowerCase()
        .replace(
          /[^a-z0-9\s]/g,
          ""
        )
        .split(/\s+/)
        .filter(
          (word) =>
            word.length > 2 &&
            !stopWords.has(
              word
            )
        );

    for (
      const word
      of words
    ) {
      frequency[word] =
        (frequency[word] ||
          0) + 1;
    }
  }

  /*
    Score sentences.
  */
  const scored =
    sentences.map(
      (
        sentence,
        index
      ) => {
        const words =
          sentence
            .toLowerCase()
            .replace(
              /[^a-z0-9\s]/g,
              ""
            )
            .split(/\s+/)
            .filter(
              (word) =>
                word.length >
                  2 &&
                !stopWords.has(
                  word
                )
            );

        if (
          words.length === 0
        ) {
          return {
            sentence,
            index,
            score: 0,
          };
        }

        let score = 0;

        for (
          const word
          of words
        ) {
          score +=
            frequency[
              word
            ] || 0;
        }

        /*
          Prefer useful-length sentences.
        */
        const lengthBonus =
          words.length >= 8 &&
          words.length <= 35
            ? 2
            : 0;

        /*
          Slight preference to
          introductory content.
        */
        const positionBonus =
          index < 3
            ? 2
            : 0;

        score =
          score /
            words.length +
          lengthBonus +
          positionBonus;

        return {
          sentence,
          index,
          score,
        };
      }
    );

  /*
    Select a reasonable number
    of important sentences.
  */
  const summaryCount =
    sentences.length <= 5
      ? sentences.length
      : sentences.length <= 12
      ? 5
      : 7;

  const selected =
    scored
      .sort(
        (a, b) =>
          b.score -
          a.score
      )
      .slice(
        0,
        summaryCount
      )
      .sort(
        (a, b) =>
          a.index -
          b.index
      );

  return selected
    .map(
      (item) =>
        `• ${item.sentence}`
    )
    .join("\n\n");
}

/* =====================================================
   SUMMARIZATION
===================================================== */

export async function summarizeText(
  text,
  onProgress
) {
  const clean =
    cleanText(text);

  if (!clean) {
    throw new Error(
      "No transcript text was supplied."
    );
  }

  /*
    First attempt:
    real browser summarization model.
  */
  try {
    onProgress?.(
      "Loading browser AI summarizer..."
    );

    const model =
      await getSummarizer(
        onProgress
      );

    const chunks =
      splitText(
        clean,
        700
      );

    const summaries =
      [];

    for (
      let index = 0;
      index < chunks.length;
      index++
    ) {
      onProgress?.(
        `Summarizing part ${
          index + 1
        } of ${
          chunks.length
        }...`
      );

      const result =
        await model(
          chunks[index],
          {
            max_new_tokens:
              110,

            min_new_tokens:
              18,

            do_sample:
              false,
          }
        );

      const summary =
        result?.[0]
          ?.summary_text ||
        "";

      if (summary) {
        summaries.push(
          summary
        );
      }
    }

    let combined =
      summaries
        .filter(Boolean)
        .join("\n\n")
        .trim();

    /*
      If the browser model returned
      something usable, use it.
    */
    if (combined) {
      /*
        Optional second pass for
        longer transcripts.
      */
      if (
        summaries.length > 1 &&
        combined.length >
          900
      ) {
        try {
          onProgress?.(
            "Refining summary..."
          );

          const finalResult =
            await model(
              combined.slice(
                0,
                2200
              ),
              {
                max_new_tokens:
                  150,

                min_new_tokens:
                  30,

                do_sample:
                  false,
              }
            );

          const refined =
            finalResult?.[0]
              ?.summary_text ||
            "";

          if (
            refined
          ) {
            combined =
              refined;
          }
        } catch {
          /*
            Keep the first-pass
            summary if refinement
            fails.
          */
        }
      }

      onProgress?.(
        "Smart Summary ready."
      );

      return {
        success: true,

        summary:
          combined,

        model:
          "Browser Transformers.js summarizer",
      };
    }
  } catch (error) {
    /*
      IMPORTANT:
      Do not allow a failed browser
      model download to break the app.

      Fall through to the local
      extractive summarizer.
    */

    console.warn(
      "Browser summarizer unavailable. Using local fallback.",
      error
    );
  }

  /*
    Guaranteed fallback.
  */
  onProgress?.(
    "Using local Smart Summary..."
  );

  const fallback =
    createExtractiveSummary(
      clean
    );

  if (!fallback) {
    throw new Error(
      "Could not create a summary."
    );
  }

  onProgress?.(
    "Smart Summary ready."
  );

  return {
    success: true,

    summary:
      fallback,

    model:
      "Local browser extractive summarizer",
  };
}

/* =====================================================
   TRANSLATION
===================================================== */

export async function translateSummary(
  text,
  language,
  onProgress
) {
  const clean =
    cleanText(text);

  if (!clean) {
    throw new Error(
      "Generate a summary before translating."
    );
  }

  const model =
    await getTranslator(
      language,
      onProgress
    );

  const chunks =
    splitText(
      clean,
      650
    );

  const translatedParts =
    [];

  for (
    let index = 0;
    index < chunks.length;
    index++
  ) {
    onProgress?.(
      `Translating part ${
        index + 1
      } of ${
        chunks.length
      }...`
    );

    const result =
      await model(
        chunks[index],
        {
          max_length:
            512,

          num_beams:
            4,
        }
      );

    const translated =
      result?.[0]
        ?.translation_text ||
      "";

    if (translated) {
      translatedParts.push(
        translated
      );
    }
  }

  const translatedText =
    translatedParts
      .join("\n\n")
      .trim();

  if (!translatedText) {
    throw new Error(
      `Translation to ${language} returned no text.`
    );
  }

  return {
    success: true,

    language,

    translated_text:
      translatedText,
  };
}

/* =====================================================
   MODEL STATUS
===================================================== */

export function isSpeechModelLoaded() {
  return Boolean(
    asrPromise
  );
}

/* =====================================================
   UNLOAD MODELS
===================================================== */

export function unloadSpeechModel() {
  asrPromise = null;
  summarizerPromise = null;

  translatorPromises.clear();
}