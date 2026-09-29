/* ============================================================
   SOMA — Voice Agent
   ------------------------------------------------------------
   Wraps the browser's SpeechRecognition and SpeechSynthesis
   Web APIs. This is push-to-talk only: the user taps the mic
   button to start listening (Option A from the spec).

   WAKE-WORD NOTE ("Siri-style" activation)
   ------------------------------------------------------------
   A normal website CANNOT keep the microphone open and
   listening in the background the way a native OS assistant
   can — browsers require a user gesture (a click/tap) to start
   any microphone capture, and continuously streaming audio to
   detect a wake word would drain battery and raise real privacy
   concerns, so no browser exposes that capability by default.
   This build does NOT fake wake-word detection. The closest
   honest equivalent is: press the mic button once per session,
   after which follow-up turns can auto-restart listening (see
   `continuousMode`) until the user ends the conversation.

   REAL-TIME VOICE UPGRADE PATH
   ------------------------------------------------------------
   Microphone → [this file: SpeechRecognition] → ai-agent.js → [this file: SpeechSynthesis] → Speaker
   To upgrade to a realtime voice API later, replace the
   `startListening` / `speak` implementations below with calls to
   that provider's streaming SDK — script.js and ai-agent.js do
   not need to change, since they only depend on the callbacks
   defined here (onResult, onEnd, onError).
   ============================================================ */

const VoiceAgent = (() => {
  const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;

  let recognition = null;
  let isListening = false;
  let continuousMode = false; // set true after first voice turn in a session

  const supportsRecognition = !!SpeechRecognitionAPI;
  const supportsSynthesis = !!synth;

  function initRecognition() {
    if (!supportsRecognition || recognition) return;
    recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
  }

  function startListening({ onInterim, onResult, onEnd, onError, onStart } = {}) {
    if (!supportsRecognition) {
      onError && onError({ code: "unsupported", message: "Speech recognition isn't supported in this browser." });
      return;
    }
    initRecognition();
    if (isListening) return;

    let finalTranscript = "";

    recognition.onstart = () => { isListening = true; onStart && onStart(); };

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += transcript;
        else interim += transcript;
      }
      onInterim && onInterim(interim || finalTranscript);
    };

    recognition.onerror = (event) => {
      isListening = false;
      let message = "I couldn't access your microphone. You can still chat with me using text.";
      if (event.error === "no-speech") message = "I didn't catch that — want to try again?";
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        message = "Microphone access was denied. You can still chat with me using text.";
      }
      onError && onError({ code: event.error, message });
    };

    recognition.onend = () => {
      isListening = false;
      onEnd && onEnd(finalTranscript.trim());
    };

    try {
      recognition.start();
    } catch (e) {
      onError && onError({ code: "start-failed", message: "Voice input couldn't start. Please try again." });
    }
  }

  function stopListening() {
    if (recognition && isListening) recognition.stop();
  }

  // Picks a soft Indian-accented female English voice.
  // Priority: Indian female > any en-IN > soft British female > any English.
  function pickSoftVoice() {
    const voices = synth.getVoices();
    if (!voices.length) return null;

    const allVoices = voices;
    const enVoices  = voices.filter(v => v.lang.startsWith("en"));

    // 1. Named Indian English female voices
    //    "Lekha"  — Apple's smooth Indian female voice (macOS/iOS)
    //    "Neerja" — older Apple Indian female
    const indianFemaleNames = ["lekha", "neerja"];
    for (const kw of indianFemaleNames) {
      const match = allVoices.find(v => v.name.toLowerCase().includes(kw));
      if (match) return match;
    }

    // 2. Any en-IN locale (Google en-IN on Chrome / Android)
    const inVoice = allVoices.find(v => v.lang === "en-IN");
    if (inVoice) return inVoice;

    // 3. Fallback: soft female voices (closest feel to a gentle Indian accent)
    const femaleFallback = [
      "samantha", "karen", "moira", "fiona", "kate",
      "google uk english female", "microsoft zira", "microsoft hazel",
      "victoria", "tessa",
    ];
    for (const kw of femaleFallback) {
      const match = enVoices.find(v => v.name.toLowerCase().includes(kw));
      if (match) return match;
    }

    // 4. en-GB / en-AU / en-IE — calmer than en-US
    const calm = enVoices.find(v =>
      v.lang === "en-GB" || v.lang === "en-AU" || v.lang === "en-IE"
    );
    if (calm) return calm;

    // 5. Last resort
    return enVoices[0] || null;
  }

  function speak(text, { onStart, onEnd, onError } = {}) {
    if (!supportsSynthesis) {
      onError && onError({ code: "unsupported", message: "Speech output isn't supported in this browser." });
      return;
    }
    try {
      synth.cancel(); // stop anything currently speaking
      const utterance = new SpeechSynthesisUtterance(text);

      // Friendly, soft, sweet Indian female tone
      utterance.rate   = 0.90;   // gentle & unhurried — feels caring, not rushed
      utterance.pitch  = 1.22;   // warm & friendly — bright without being sharp
      utterance.volume = 0.92;   // softer presence — intimate, not loud

      // Try to assign a soft voice; voices may load async so we wait if needed
      const assignVoice = () => {
        const v = pickSoftVoice();
        if (v) utterance.voice = v;
      };

      if (synth.getVoices().length) {
        assignVoice();
      } else {
        synth.onvoiceschanged = () => { assignVoice(); synth.onvoiceschanged = null; };
      }

      utterance.onstart = () => onStart && onStart();
      utterance.onend   = () => onEnd && onEnd();
      utterance.onerror = () => onError && onError({ code: "speech-error", message: "I couldn't speak that response aloud." });
      synth.speak(utterance);
    } catch (e) {
      onError && onError({ code: "speech-error", message: "I couldn't speak that response aloud." });
    }
  }

  function stopSpeaking() {
    if (supportsSynthesis) synth.cancel();
  }

  function setContinuousMode(value) { continuousMode = value; }
  function isContinuousMode() { return continuousMode; }

  return {
    supportsRecognition,
    supportsSynthesis,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    setContinuousMode,
    isContinuousMode,
    get isListening() { return isListening; }
  };
})();
