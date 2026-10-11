import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Upload,
  Sparkles,
  Languages,
  Download,
  Search,
  ChevronUp,
  ChevronDown,
  FileText,
  Clock3,
  Brain,
  Loader2,
  Play,
  Eye,
  EyeOff,
} from "lucide-react";

import "./App.css";
import jsPDF from "jspdf";
import { supabase } from "./lib/supabase";
import {
  transcribeAudio,
  summarizeText,
  translateSummary,
} from "./lib/browserAi";

function Dashboard({ user, onLogout, onOpenAdmin }) {
  const [mode, setMode] = useState("upload");
  const [file, setFile] = useState(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [transcription, setTranscription] = useState(null);
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [recordingId, setRecordingId] = useState(null);
  const [summaryId, setSummaryId] = useState(null);
  const [targetLanguage, setTargetLanguage] = useState("German");
 
  const [translatedText, setTranslatedText] = useState("");
  const [translatedLanguage, setTranslatedLanguage] = useState("");
  const [translationLoading, setTranslationLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);  
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRef = useRef(null);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    setFile(selectedFile);
    setTranscription(null);
    setStatus("");

    if (mediaUrl) {
      URL.revokeObjectURL(mediaUrl);
    }

    const url = URL.createObjectURL(selectedFile);
    setMediaUrl(url);
  };

  const handleChooseFile = (event) => {
    handleFileSelect(event.target.files?.[0] || null);
  };

  const handleGenerateTranscript = async () => {
    if (!file) {
      setStatus("Please choose a recording first.");
      return;
    }

    try {
      setProcessing(true);
      setStatus("Preparing browser AI… first use may download the Whisper model.");

      const result = await transcribeAudio(file, (message) => {
        setStatus(message);
      });

      setTranscription(result);
      setSummary("");
      setTranslatedText("");
      setTranslatedLanguage("");
      setSummaryId(null);

      // Save the user's analysis metadata to Supabase. The actual audio stays
      // on the user's device; only transcript/summary data is persisted.
      try {
        if (user?.id) {
          const { data: recording, error: recordingError } = await supabase
            .from("recordings")
            .insert({
              user_id: user.id,
              file_name: file.name || "Recording",
              duration_seconds: Number(mediaRef.current?.duration || 0) || 0,
              detected_language: result.language || null,
            })
            .select("id")
            .single();

          if (recordingError) throw recordingError;
          setRecordingId(recording.id);

          const { error: transcriptError } = await supabase
            .from("transcripts")
            .insert({
              recording_id: recording.id,
              transcript_text: result.text || "",
              segments_json: result.segments || [],
            });

          if (transcriptError) throw transcriptError;
        }
      } catch (cloudError) {
        console.warn("Could not save transcript history:", cloudError);
      }

      setStatus("Transcription complete. AI ran in this browser, not on your laptop.");
    } catch (error) {
      console.error(error);
      setStatus(`Transcription failed: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!transcription?.text) {
      setStatus("Generate the transcript first.");
      return;
    }

    try {
      setSummaryLoading(true);
      setStatus("Loading the browser summarizer…");

      const result = await summarizeText(transcription.text, (message) => {
        setStatus(message);
      });

      setSummary(result.summary || "");

      if (recordingId) {
        try {
          const { data: savedSummary, error: summaryError } = await supabase
            .from("summaries")
            .insert({
              recording_id: recordingId,
              summary_text: result.summary || "",
              model_name: result.model || "Browser Transformers.js summarizer",
            })
            .select("id")
            .single();

          if (summaryError) throw summaryError;
          setSummaryId(savedSummary.id);
        } catch (cloudError) {
          console.warn("Could not save summary history:", cloudError);
        }
      }

      setStatus("Summary complete. AI ran in this browser, not on your laptop.");
    } catch (error) {
      console.error(error);
      setStatus(`Summary failed: ${error.message}`);
    } finally {
      setSummaryLoading(false);
    }
  };
const handleTranslate = async () => {
    if (!summary) {
      setStatus("Generate a summary first.");
      return;
    }

    try {
      setTranslationLoading(true);
      setTranslatedText("");
      setTranslatedLanguage("");
      setStatus(`Loading the ${targetLanguage} translator…`);

      const result = await translateSummary(summary, targetLanguage, (message) => {
        setStatus(message);
      });

      setTranslatedText(result.translated_text || "");
      setTranslatedLanguage(result.language || targetLanguage);

      if (summaryId) {
        try {
          const { error: translationError } = await supabase
            .from("translations")
            .insert({
              summary_id: summaryId,
              target_language: result.language || targetLanguage,
              translated_text: result.translated_text || "",
            });
          if (translationError) throw translationError;
        } catch (cloudError) {
          console.warn("Could not save translation history:", cloudError);
        }
      }

      setStatus("Translation complete. AI ran in this browser, not on your laptop.");
    } catch (error) {
      console.error(error);
      setStatus(`Translation failed: ${error.message}`);
    } finally {
      setTranslationLoading(false);
    }
  };
const wordMatchesSearch = (word) => {
  const query = searchQuery.trim().toLowerCase();

  if (!query) return false;

  return word.toLowerCase().includes(query);
};
const handleSearchNext = () => {
  const matches = Array.from(
    document.querySelectorAll(".transcript-word.search-match")
  );

  if (!matches.length) return;

  const currentIndex = matches.findIndex((element) =>
    element.classList.contains("search-current")
  );

  const nextIndex =
    currentIndex === -1
      ? 0
      : (currentIndex + 1) % matches.length;
  setSearchMatchIndex(nextIndex);

  matches.forEach((element) => {
    element.classList.remove("search-current");
  });

  const nextMatch = matches[nextIndex];

  nextMatch.classList.add("search-current");

  nextMatch.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
};
const getSearchMatchCount = () => {
  if (!searchQuery.trim() || !transcription?.segments) {
    return 0;
  }

  return transcription.segments.reduce((count, segment) => {
    if (!segment.words) return count;

    return (
      count +
      segment.words.filter((word) =>
        word.word
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase())
      ).length
    );
  }, 0);
};
const handleSearchPrevious = () => {
  const matches = Array.from(
    document.querySelectorAll(".transcript-word.search-match")
  );

  if (!matches.length) return;

  const currentIndex = matches.findIndex((element) =>
    element.classList.contains("search-current")
  );

  const previousIndex =
    currentIndex === -1
      ? matches.length - 1
      : (currentIndex - 1 + matches.length) % matches.length;
  setSearchMatchIndex(previousIndex);

  matches.forEach((element) => {
    element.classList.remove("search-current");
  });

  const previousMatch = matches[previousIndex];

  previousMatch.classList.add("search-current");

  previousMatch.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
};
const handleStartRecording = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });

    const recorder = new MediaRecorder(stream);

    recorderRef.current = recorder;
    recordedChunksRef.current = [];

    setRecordingSeconds(0);
    setIsRecording(true);
    setStatus("Recording your audio…");

    recordingTimerRef.current = setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;

      try {
        setIsRecording(false);
        setProcessing(true);
        setStatus("Recording captured. Starting browser AI transcription…");

        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        const url = URL.createObjectURL(blob);
        setMediaUrl(url);

        const recordedFile = new File(
          [blob],
          `live-recording-${Date.now()}.webm`,
          { type: blob.type || "audio/webm" }
        );

        setFile(recordedFile);

        const result = await transcribeAudio(recordedFile, (message) => {
          setStatus(message);
        });

        setTranscription(result);

        try {
          if (user?.id) {
            const { data: recording, error: recordingError } = await supabase
              .from("recordings")
              .insert({
                user_id: user.id,
                file_name: recordedFile.name,
                duration_seconds: recordingSeconds,
                detected_language: result.language || null,
              })
              .select("id")
              .single();

            if (recordingError) throw recordingError;
            setRecordingId(recording.id);

            const { error: transcriptError } = await supabase
              .from("transcripts")
              .insert({
                recording_id: recording.id,
                transcript_text: result.text || "",
                segments_json: result.segments || [],
              });

            if (transcriptError) throw transcriptError;
          }
        } catch (cloudError) {
          console.warn("Could not save recorded transcript history:", cloudError);
        }

        setStatus("Recording transcribed successfully.");
      } catch (error) {
        console.error(error);
        setStatus(`Recording transcription failed: ${error.message}`);
      } finally {
        setProcessing(false);
      }
    };

    recorder.start();
  } catch (error) {
    console.error(error);

    setIsRecording(false);

    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;

    setStatus(
      "Microphone access was denied or is unavailable."
    );
  }
};
const handleStopRecording = () => {
  const recorder = recorderRef.current;

  if (!recorder || recorder.state === "inactive") {
    return;
  }

  setStatus("Stopping recording...");

  recorder.stop();

  recorder.stream
    .getTracks()
    .forEach((track) => track.stop());

  clearInterval(recordingTimerRef.current);
  recordingTimerRef.current = null;

  setIsRecording(false);
};
  const jumpToWord = (startTime) => {
    if (!mediaRef.current) return;

    mediaRef.current.currentTime = startTime;
    mediaRef.current.play().catch(() => {});
  };
  const handleExportPDF = async () => {
    if (!transcription?.segments?.length) {
      setStatus("Generate the transcript first.");
      return;
    }

    try {
      setStatus("Creating readable PDF...");

      const pdf = new jsPDF("p", "mm", "a4");

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 16;
      const usableWidth = pageWidth - margin * 2;
      const footerY = pageHeight - 8;

      let y = 18;

      const addPageIfNeeded = (heightNeeded = 8) => {
        if (y + heightNeeded > pageHeight - 16) {
          pdf.addPage();
          y = 18;
        }
      };

      const addWrappedText = (
        text,
        fontSize = 10.5,
        fontStyle = "normal",
        lineHeight = 5.4
      ) => {
        pdf.setFont("helvetica", fontStyle);
        pdf.setFontSize(fontSize);

        const lines = pdf.splitTextToSize(
          String(text || ""),
          usableWidth
        );

        for (const line of lines) {
          addPageIfNeeded(lineHeight);
          pdf.text(line, margin, y);
          y += lineHeight;
        }
      };

      // -------------------------------------------------
      // TITLE
      // -------------------------------------------------
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(19);
      pdf.setTextColor(20, 24, 35);
      pdf.text(
        "Smart AI Audio Summarizer",
        margin,
        y
      );

      y += 8;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(95, 103, 118);
      pdf.text(
        "Readable transcript and AI summary",
        margin,
        y
      );

      y += 9;

      // -------------------------------------------------
      // RECORDING INFORMATION
      // -------------------------------------------------
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(20, 24, 35);
      pdf.text(
        "Recording Information",
        margin,
        y
      );

      y += 6;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(35, 40, 52);

      pdf.text(
        `File: ${file?.name || "Recording"}`,
        margin,
        y
      );

      y += 5;

      pdf.text(
        `Detected Language: ${
          transcription?.language || "Auto-detected"
        }`,
        margin,
        y
      );

      y += 10;

      // -------------------------------------------------
      // TRANSCRIPT
      // -------------------------------------------------
      addPageIfNeeded(15);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      pdf.setTextColor(20, 24, 35);
      pdf.text(
        "Transcript",
        margin,
        y
      );

      y += 8;

      pdf.setDrawColor(215, 219, 228);
      pdf.line(
        margin,
        y,
        pageWidth - margin,
        y
      );

      y += 7;

      for (const segment of transcription.segments) {
        const segmentText =
          segment?.text ||
          segment?.words
            ?.map((word) => word?.word || "")
            .join(" ") ||
          "";

        if (!segmentText.trim()) {
          continue;
        }

        addPageIfNeeded(15);

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(9);
        pdf.setTextColor(92, 73, 190);

        pdf.text(
          `[${Number(segment?.start || 0).toFixed(2)}s]`,
          margin,
          y
        );

        y += 5;

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10.5);
        pdf.setTextColor(35, 40, 52);

        addWrappedText(
          segmentText,
          10.5,
          "normal",
          5.3
        );

        y += 3;
      }

      // -------------------------------------------------
      // SUMMARY
      // -------------------------------------------------
      if (summary?.trim()) {
        addPageIfNeeded(22);

        y += 4;

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(15);
        pdf.setTextColor(20, 24, 35);

        pdf.text(
          "AI Summary",
          margin,
          y
        );

        y += 8;

        pdf.setDrawColor(215, 219, 228);
        pdf.line(
          margin,
          y,
          pageWidth - margin,
          y
        );

        y += 7;

        const summaryParts = String(summary)
          .split(/\n+/)
          .map((part) =>
            part
              .replace(/^[-•*]\s*/, "")
              .trim()
          )
          .filter(Boolean);

        for (const part of summaryParts) {
          addPageIfNeeded(10);

          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(10.5);
          pdf.setTextColor(35, 40, 52);

          const lines = pdf.splitTextToSize(
            `• ${part}`,
            usableWidth
          );

          for (const line of lines) {
            addPageIfNeeded(5.5);
            pdf.text(line, margin, y);
            y += 5.5;
          }

          y += 2;
        }
      }

      // -------------------------------------------------
      // FOOTERS
      // -------------------------------------------------
      const totalPages = pdf.getNumberOfPages();

      for (
        let page = 1;
        page <= totalPages;
        page++
      ) {
        pdf.setPage(page);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(120, 126, 138);

        pdf.text(
          "Smart AI Audio Summarizer",
          margin,
          footerY
        );

        pdf.text(
          `Page ${page} of ${totalPages}`,
          pageWidth - margin,
          footerY,
          { align: "right" }
        );
      }

      pdf.save("smart-ai-audio-summary.pdf");

      setStatus(
        "Readable PDF exported successfully."
      );
    } catch (error) {
      console.error("PDF export error:", error);
      setStatus(
        `PDF export failed: ${error.message}`
      );
    }
  };

  const handleExportTranslatedPDF = async () => {
    if (!translatedText?.trim()) {
      setStatus("Translate the summary first.");
      return;
    }

    try {
      setStatus(
        "Creating translated summary PDF..."
      );

      const pdf = new jsPDF("p", "mm", "a4");

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 16;
      const usableWidth = pageWidth - margin * 2;
      const footerY = pageHeight - 8;

      let y = 20;

      const addPageIfNeeded = (heightNeeded = 8) => {
        if (y + heightNeeded > pageHeight - 16) {
          pdf.addPage();
          y = 20;
        }
      };

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.setTextColor(20, 24, 35);

      pdf.text(
        "Smart AI Audio Summarizer",
        margin,
        y
      );

      y += 9;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(12);

      pdf.text(
        `Translated Summary — ${
          translatedLanguage || targetLanguage
        }`,
        margin,
        y
      );

      y += 8;

      pdf.setFontSize(9);
      pdf.setTextColor(95, 103, 118);

      pdf.text(
        `Source: ${file?.name || "Recording"}`,
        margin,
        y
      );

      y += 10;

      pdf.setDrawColor(215, 219, 228);
      pdf.line(
        margin,
        y,
        pageWidth - margin,
        y
      );

      y += 8;

      const paragraphs = String(translatedText)
        .split(/\n+/)
        .map((part) => part.trim())
        .filter(Boolean);

      for (const paragraph of paragraphs) {
        const lines = pdf.splitTextToSize(
          paragraph,
          usableWidth
        );

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(10.8);
        pdf.setTextColor(35, 40, 52);

        for (const line of lines) {
          addPageIfNeeded(6);
          pdf.text(line, margin, y);
          y += 6;
        }

        y += 4;
      }

      const totalPages = pdf.getNumberOfPages();

      for (
        let page = 1;
        page <= totalPages;
        page++
      ) {
        pdf.setPage(page);

        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8);
        pdf.setTextColor(120, 126, 138);

        pdf.text(
          "Smart AI Audio Summarizer",
          margin,
          footerY
        );

        pdf.text(
          `Page ${page} of ${totalPages}`,
          pageWidth - margin,
          footerY,
          { align: "right" }
        );
      }

      const languageName = (
        translatedLanguage || targetLanguage
      ).toLowerCase();

      pdf.save(
        `translated-summary-${languageName}.pdf`
      );

      setStatus(
        "Translated summary PDF exported successfully."
      );
    } catch (error) {
      console.error(
        "Translated PDF error:",
        error
      );

      setStatus(
        `Translated PDF export failed: ${error.message}`
      );
    }
  };


  return (
    <div className="app">
      {/* Top navigation */}
      <header className="navbar">
        <div className="brand">
          <div className="brand-icon">
            <Mic size={22} />
          </div>

          <div>
            <h2>Smart AI</h2>
            <span>Audio Summarizer</span>
          </div>
        </div>

        <div className="nav-right">
          <div className="local-badge">
            <span className="status-dot"></span>
            AI Ready
          </div>
          <div className="user-chip">
            <div className="user-avatar">{(user?.name || "U").charAt(0).toUpperCase()}</div>
            <div className="user-chip-text">
              <strong>{user?.name || "User"}</strong>
              <span>{user?.role === "admin" ? "Administrator" : "User"}</span>
            </div>
          </div>
          {user?.role === "admin" && (
            <button className="nav-admin-button" onClick={onOpenAdmin}>
              Admin Console
            </button>
          )}
          <button className="nav-logout-button" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <main className="container">
        {/* Hero */}
        <section className="hero">
          <div className="hero-badge">
            <Sparkles size={15} />
            PRIVATE • FAST • ON-DEVICE
          </div>

          <h1>
            Turn conversations into
            <span> intelligent notes.</span>
          </h1>

          <p>
            Record a lecture or upload an existing recording. Get a
            transcript, summary, key concepts, action items and translations
            using AI running directly on your computer.
          </p>
        </section>

        {/* Input mode */}
        <section className="mode-card">
          <div className="mode-tabs">
            <button
              className={mode === "upload" ? "mode active" : "mode"}
              onClick={() => setMode("upload")}
            >
              <Upload size={18} />
              Upload Recording
            </button>

            <button
              className={mode === "live" ? "mode active" : "mode"}
              onClick={() => setMode("live")}
            >
              <Mic size={18} />
              Live Recording
            </button>
          </div>

          {mode === "upload" ? (
            <div className="upload-area">
              <div className="upload-icon">
                <Upload size={30} />
              </div>

              <h3>Upload your recording</h3>

              <p>
                MP3, MP4, M4A, WAV, WebM, FLAC and other common formats
              </p>

              <label className="upload-button">
                <Upload size={18} />
                Choose Recording

                <input
                  type="file"
                  accept="audio/*,video/*"
                  onChange={handleChooseFile}
                  hidden
                />
              </label>

              {file && (
                <div className="selected-file">
                  <FileText size={18} />

                  <div>
                    <strong>{file.name}</strong>

                    <small>
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </small>
                  </div>
                </div>
              )}

              {mediaUrl && (
                <div className="media-preview">
                  {file?.type.startsWith("video/") ? (
                    <video
                      ref={mediaRef}
                      src={mediaUrl}
                      controls
                    />
                  ) : (
                    <audio
                      ref={mediaRef}
                      src={mediaUrl}
                      controls
                    />
                  )}
                </div>
              )}

              {file && (
                <button
                  className="process-button"
                  onClick={handleGenerateTranscript}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <Loader2 className="spin" size={18} />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Generate Transcript
                    </>
                  )}
                </button>
              )}

              {status && (
                <div className="processing-status">
                  {status}
                </div>
              )}
            </div>
          ) : (
            <div className="live-area">
              <div className="record-ring">
                <Mic size={34} />
              </div>

              <h3>Ready to record</h3>

              <p>
                Your microphone audio will be processed locally by the AI
                transcription engine.
              </p>

              {isRecording && (
  <div className="recording-status">
    <span className="recording-dot"></span>

    <div>
      <strong>Recording in progress</strong>
      <span>
        {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:
        {String(recordingSeconds % 60).padStart(2, "0")}
      </span>
    </div>
  </div>
)}

<button
  className={
    isRecording
      ? "record-button recording-active"
      : "record-button"
  }
  onClick={
    isRecording
      ? handleStopRecording
      : handleStartRecording
  }
  disabled={processing}
>
  <Mic size={19} />
  {isRecording ? "Stop Recording" : "Start Recording"}
</button>
            </div>
          )}
        </section>

        {/* Features */}
        <section className="feature-grid">
          <FeatureCard
            icon={<FileText />}
            title="Live Transcript"
            description="Accurate speech-to-text with timestamps."
          />

          <FeatureCard
            icon={<Brain />}
            title="AI Summary"
            description="Convert long discussions into useful notes."
          />

          <FeatureCard
            icon={<Languages />}
            title="Translation"
            description="Translate AI-generated summaries locally."
          />

          <FeatureCard
            icon={<Download />}
            title="PDF Export"
            description="Save transcripts and notes for revision."
          />
        </section>

        {/* Results */}
        <section className="preview-grid">
          <div className="panel">
            <div className="panel-header">
              <div>
                <span className="eyebrow">TRANSCRIPT</span>
                <h3>Timestamped Transcript</h3>
              </div>

              <Clock3 size={20} />
            </div>

            {transcription ? (
              <div className="transcript-content">
                <div className="detected-language">
                  <strong>Detected language:</strong>{" "}
                  {transcription.language}
                </div>

                {transcription.segments.map((segment, segmentIndex) => (
                  <div
                    className="transcript-segment"
                    key={`${segment.start}-${segmentIndex}`}
                  >
                    <div className="segment-time">
                      <button
                        onClick={() => jumpToWord(segment.start)}
                        title="Jump to this part"
                      >
                        [{segment.start.toFixed(2)}s]
                      </button>
                    </div>

                    <div className="segment-text">
                      {segment.words?.length > 0
                        ? segment.words.map((word, wordIndex) => (
                            <button
                              className={
                                wordMatchesSearch(word.word)
                                  ? "transcript-word search-match"
                                  : "transcript-word"
                              }
                              key={`${word.start}-${wordIndex}`}
                              onClick={() => jumpToWord(word.start)}
                              title={`Jump to ${word.start.toFixed(2)}s`}
                            >
                              {word.word}
                            </button>
                          ))
                        : segment.text}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <FileText size={32} />
                <p>Your transcript will appear here.</p>
              </div>
            )}
          </div>

          <div className="panel">
  <div className="panel-header">
    <div>
      <span className="eyebrow">AI NOTES</span>
      <h3>Smart Summary</h3>
    </div>

    <Sparkles size={20} />
  </div>

  {transcription ? (
    <div className="summary-content">
      <button
        className="process-button"
        onClick={handleGenerateSummary}
        disabled={summaryLoading}
      >
        {summaryLoading ? (
          <>
            <Loader2 className="spin" size={18} />
            Generating Summary...
          </>
        ) : (
          <>
            <Sparkles size={18} />
            Generate Summary
          </>
        )}
      </button>

      {summary ? (
        <div className="summary-text">
          {summary}
        </div>
        
      ) : (
        <div className="empty-state">
          
          <Brain size={32} />
          <p>Your AI-generated summary will appear here.</p>
        </div>
      )}
      {translatedText && (
  <div className="translated-result">
    <div className="translated-header">
      <Languages size={18} />
      <strong>{translatedLanguage || targetLanguage} Translation</strong>
    </div>

    <div className="summary-text">
      {translatedText}
    </div>
  </div>
)}
    </div>
  ) : (
    <div className="empty-state">
      <Brain size={32} />
      <p>Generate a transcript first.</p>
    </div>
  )}
</div>
        </section>

        {/* Tools */}
        {/* Actions */}
<section className="action-bar">
  <div className="action-bar-title">
    <span className="eyebrow">ACTIONS</span>
    <h3>Work with your results</h3>
  </div>

  <div className="action-buttons">

    {/* Search */}
    <div className="search-control">
      <button
        className="action-button"
        onClick={() => setShowSearch(!showSearch)}
      >
        <Search size={18} />
        Search Transcript
      </button>

      {showSearch && (
        <div className="search-box">
          <Search size={17} />

          <input
            type="text"
            placeholder="Search transcript..."
            value={searchQuery}
            autoFocus
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchMatchIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) {
                  handleSearchPrevious();
                } else {
                  handleSearchNext();
                }
              }

              if (e.key === "Escape") {
                setSearchQuery("");
                setShowSearch(false);
              }
            }}
          />

         {searchQuery && (
            <span className="search-count">
              {getSearchMatchCount() > 0
                ? `${searchMatchIndex + 1} of ${getSearchMatchCount()}`
                : "0 matches"}
            </span>
          )}

          <button
            className="search-nav-button"
            onClick={handleSearchPrevious}
            title="Previous match"
          >
            <ChevronUp size={16} />
          </button>

          <button
            className="search-nav-button"
            onClick={handleSearchNext}
            title="Next match"
          >
            <ChevronDown size={16} />
          </button>

          {searchQuery && (
            <button
              className="search-clear-button"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>

   
      <div className="translation-select-group">
        <span>To</span>

        <select
          value={targetLanguage}
          onChange={(e) => {
            setTargetLanguage(e.target.value);
            setTranslatedText("");
            setTranslatedLanguage("");
          }}
        >
         <option>German</option>
          <option>Spanish</option>
          <option>French</option>
          <option>Italian</option>
        </select>
      </div>

      <button
        className="action-button"
        onClick={handleTranslate}
        disabled={translationLoading}
      >
        {translationLoading ? (
          <>
            <Loader2 className="spin" size={18} />
            Translating...
          </>
        ) : (
          <>
            <Languages size={18} />
            Translate
          </>
        )}
      </button>
    

    {/* PDF */}
    <button
      className="action-button"
      onClick={handleExportPDF}
    >
      <Download size={18} />
      Export PDF
    </button>

    {translatedText && (
      <button
        className="action-button"
        onClick={handleExportTranslatedPDF}
      >
        <Download size={18} />
        Translated Summary PDF
      </button>
    )}

  </div>
</section>
      </main>

      <footer>
        Smart AI Audio Summarizer • Secure cloud workspace
      </footer>
    </div>
  );
}


function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    const email = form.email.trim().toLowerCase();
    const name = form.name.trim();

    if (mode === "signup") {
      if (name.length < 2) {
        setError("Please enter your full name.");
        return;
      }
      if (form.password.length < 8) {
        setError("Password must contain at least 8 characters.");
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    try {
      setLoading(true);

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password: form.password,
          options: {
            data: { full_name: name },
          },
        });

        if (signUpError) throw signUpError;
        if (!data.user) throw new Error("Account creation failed.");

        // Email confirmation is disabled in Supabase, so a session should
        // normally be returned immediately. We still handle the no-session
        // case cleanly in case project settings change later.
        if (!data.session) {
          throw new Error(
            "Account created, but the session was not returned. Check that Confirm Email is disabled in Supabase."
          );
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, email, role, is_active")
          .eq("id", data.user.id)
          .single();

        if (profileError) throw profileError;
        if (!profile.is_active) throw new Error("This account is disabled.");

        onAuthenticated(profile);
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: form.password,
      });

      if (signInError) throw signInError;
      if (!data.user) throw new Error("Sign in failed.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, is_active")
        .eq("id", data.user.id)
        .single();

      if (profileError) throw profileError;
      if (!profile.is_active) {
        await supabase.auth.signOut();
        throw new Error("This account has been disabled by the administrator.");
      }

      onAuthenticated(profile);
    } catch (err) {
      setError(err.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-grid-glow"></div>
      <div className="auth-orb auth-orb-one"></div>
      <div className="auth-orb auth-orb-two"></div>

      <div className="auth-showcase">
        <div className="auth-showcase-mark">
          <Mic size={24} />
        </div>
        <div className="auth-kicker">SMART AI WORKSPACE</div>
        <h1>
          Turn every conversation into
          <span> intelligent notes.</span>
        </h1>
        <p>
          A secure AI workspace for recording, transcription, intelligent
          summaries, translation and professional PDF exports.
        </p>

        <div className="auth-feature-list">
          <div><span>01</span><strong>Accurate transcription</strong></div>
          <div><span>02</span><strong>AI-powered summaries</strong></div>
          <div><span>03</span><strong>Multi-language output</strong></div>
        </div>
      </div>

      <div className="auth-card-3d">
        <div className="auth-brand-mark">
          <Mic size={26} />
        </div>
        <div className="auth-kicker">SECURE WORKSPACE ACCESS</div>
        <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
        <p className="auth-subtitle">
          {mode === "signup"
            ? "Create your account and start your private AI workspace."
            : "Sign in to continue to your audio intelligence workspace."}
        </p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={submit} className="auth-form">
          {mode === "signup" && (
            <>
              <label>Full name</label>
              <input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Your full name"
                autoComplete="name"
                required
              />
            </>
          )}

          <label>Email address</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label>Password</label>
          <div className="password-field">
            <input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="Minimum 8 characters"
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {mode === "signup" && (
            <>
              <label>Confirm password</label>
              <div className="password-field">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={form.confirmPassword}
                  onChange={(e) => update("confirmPassword", e.target.value)}
                  placeholder="Re-enter your password"
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </>
          )}

          <button className="auth-primary" disabled={loading}>
            {loading
              ? "Please wait..."
              : mode === "login"
              ? "Sign In"
              : "Create Account"}
          </button>
        </form>

        <button
          className="auth-switch"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
            setForm({
              name: "",
              email: form.email,
              password: "",
              confirmPassword: "",
            });
          }}
        >
          {mode === "login"
            ? "New here? Create an account"
            : "Already have an account? Sign in"}
        </button>

        <div className="auth-security-note">
          <span className="security-dot"></span>
          Secure password authentication powered by Supabase.
        </div>
      </div>
    </div>
  );
}

function AdminConsole({ user, onBack }) {
  const [data, setData] = useState({
    users: [],
    history: [],
    stats: { users: 0, analyses: 0, transcripts: 0, summaries: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);

      const [usersResult, recordingsResult, transcriptsResult, summariesResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, full_name, email, role, is_active, created_at")
            .order("created_at", { ascending: false }),
          supabase
            .from("recordings")
            .select("id, file_name, created_at, user_id, profiles(email)")
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("transcripts")
            .select("id", { count: "exact", head: true }),
          supabase
            .from("summaries")
            .select("id", { count: "exact", head: true }),
        ]);

      if (usersResult.error) throw usersResult.error;
      if (recordingsResult.error) throw recordingsResult.error;
      if (transcriptsResult.error) throw transcriptsResult.error;
      if (summariesResult.error) throw summariesResult.error;

      const history = (recordingsResult.data || []).map((item) => ({
        id: item.id,
        source: item.file_name,
        email: item.profiles?.email || "Unassigned",
        created_at: item.created_at,
      }));

      setData({
        users: usersResult.data || [],
        history,
        stats: {
          users: usersResult.data?.length || 0,
          analyses: recordingsResult.data?.length || 0,
          transcripts: transcriptsResult.count || 0,
          summaries: summariesResult.count || 0,
        },
      });
    } catch (error) {
      setMessage(error.message || "Could not load admin data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleUser = async (item) => {
    if (item.email.toLowerCase() === "touliktalukder02@gmail.com") return;

    try {
      setBusyId(item.id);
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: !item.is_active })
        .eq("id", item.id);

      if (error) throw error;
      setMessage(item.is_active ? "User account disabled." : "User account enabled.");
      await loadData();
    } catch (error) {
      setMessage(error.message || "Could not update user.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-shell">
      <div className="admin-top">
        <div>
          <div className="admin-heading-row">
            <div className="admin-crown">✦</div>
            <div>
              <span className="eyebrow">ADMIN CONSOLE</span>
              <h1>Workspace Management</h1>
            </div>
          </div>
          <p>Administrator access • {user.email}</p>
        </div>
        <button className="nav-logout-button" onClick={onBack}>
          ← Back to Workspace
        </button>
      </div>

      {message && <div className="admin-message">{message}</div>}

      {loading ? (
        <div className="admin-loading">Loading administration data...</div>
      ) : (
        <>
          <div className="admin-stats">
            <div className="admin-stat-card">
              <span>TOTAL USERS</span>
              <strong>{data.stats.users}</strong>
              <small>Registered accounts</small>
            </div>
            <div className="admin-stat-card">
              <span>ANALYSES</span>
              <strong>{data.stats.analyses}</strong>
              <small>Saved AI sessions</small>
            </div>
            <div className="admin-stat-card">
              <span>TRANSCRIPTS</span>
              <strong>{data.stats.transcripts}</strong>
              <small>Processed transcripts</small>
            </div>
            <div className="admin-stat-card">
              <span>SUMMARIES</span>
              <strong>{data.stats.summaries}</strong>
              <small>Generated AI notes</small>
            </div>
          </div>

          <div className="admin-grid">
            <section className="admin-card">
              <div className="admin-card-title">
                <div>
                  <span className="eyebrow">ACCOUNT CONTROL</span>
                  <h2>Registered Users</h2>
                </div>
                <span className="admin-count">{data.users.length}</span>
              </div>

              <div className="admin-table">
                {data.users.length === 0 ? (
                  <p className="admin-empty">No users registered yet.</p>
                ) : (
                  data.users.map((item) => (
                    <div className="admin-user-row" key={item.id}>
                      <div className="admin-user-main">
                        <div className="admin-avatar">
                          {(item.full_name || item.email || "U").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <strong>{item.full_name || "User"}</strong>
                          <span>{item.email}</span>
                          <small>Joined {new Date(item.created_at).toLocaleString()}</small>
                        </div>
                      </div>

                      <div className="admin-user-meta">
                        <span className={`role-pill ${item.role}`}>
                          {item.role === "admin" ? "ADMIN" : "USER"}
                        </span>
                        <span className={`status-pill ${item.is_active ? "active" : "disabled"}`}>
                          {item.is_active ? "Active" : "Disabled"}
                        </span>

                        {item.email.toLowerCase() !== "touliktalukder02@gmail.com" && (
                          <div className="admin-row-actions">
                            <button
                              onClick={() => toggleUser(item)}
                              disabled={busyId === item.id}
                            >
                              {item.is_active ? "Disable" : "Enable"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="admin-card">
              <div className="admin-card-title">
                <div>
                  <span className="eyebrow">ACTIVITY</span>
                  <h2>Recent Analyses</h2>
                </div>
                <span className="admin-count">{data.history.length}</span>
              </div>

              <div className="admin-table">
                {data.history.length === 0 ? (
                  <p className="admin-empty">No analysis history yet.</p>
                ) : (
                  data.history.map((item) => (
                    <div className="admin-history-row" key={item.id}>
                      <div className="history-icon"><FileText size={16} /></div>
                      <div>
                        <strong>{item.source}</strong>
                        <span>{item.email}</span>
                        <small>{new Date(item.created_at).toLocaleString()}</small>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);

  const loadProfile = async (authUser) => {
    if (!authUser) {
      setUser(null);
      return;
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active")
      .eq("id", authUser.id)
      .single();

    if (error) throw error;
    if (!profile.is_active) {
      await supabase.auth.signOut();
      throw new Error("This account has been disabled by the administrator.");
    }

    setUser(profile);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      try {
        await loadProfile(data.session?.user || null);
      } catch (error) {
        console.error(error);
        setUser(null);
      } finally {
        if (mounted) setAuthLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      try {
        await loadProfile(session?.user || null);
      } catch (error) {
        console.error(error);
        if (mounted) setUser(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    setShowAdmin(false);
    setUser(null);
  };

  if (authLoading) {
    return <div className="auth-shell"><div className="auth-card-3d"><div className="auth-kicker">SMART AI WORKSPACE</div><h2>Loading workspace...</h2></div></div>;
  }

  if (!user) return <AuthScreen onAuthenticated={setUser} />;

  if (showAdmin && user.role === "admin") {
    return <AdminConsole user={user} onBack={() => setShowAdmin(false)} />;
  }

  return <Dashboard user={user} onLogout={logout} onOpenAdmin={() => setShowAdmin(true)} />;
}

function FeatureCard({ icon, title, description }) {
  return (
    <div className="feature-card">
      <div className="feature-icon">{icon}</div>

      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default App;
