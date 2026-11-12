/**
 * spatialAudio.js
 * WebRTC Mesh Spatial Proximity Audio Service for ProxiSpeak Virtual Office.
 *
 * Features:
 * - Peer-to-Peer WebRTC Mesh audio connection between all active teammates in the room.
 * - Dynamic spatial cross-fade: smooth acoustic cosine volume roll-off as users walk away.
 * - Audio smoothly fades to 0 beyond the proximity radius (100m equivalent / PROXIMITY_RADIUS).
 * - Real hardware mic mute/unmute control (disables local audio tracks).
 * - Voice Activity Detection (VAD) with hysteresis to prevent rapid flickering.
 * - Handles peers with mic off / no mic via recvonly audio transceivers.
 * - W3C Perfect Negotiation to prevent WebRTC glare / collision race conditions.
 * - Hybrid Web Audio API GainNode + HTML5 Audio fallback for guaranteed playback.
 */

import { getSocket } from "./socket.js";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

let audioCtx = null;
let localStream = null;
let localAnalyser = null;
let localSource = null;
let animFrameId = null;
let isMutedState = false;
let onSpeakingChangeCallback = null;
let currentlySpeakingState = false;

// Map: peerSocketId -> { pc: RTCPeerConnection, gainNode: GainNode, audioEl: HTMLAudioElement, iceQueue: Array }
const peers = new Map();
const peerLookup = new Map();
let currentSocket = null;
let currentMyUserId = null;
let currentOrgId = null;
let isInitialized = false;

function broadcastMicStatus(isSpeaking) {
  if (currentSocket && currentOrgId) {
    currentSocket.emit("mic-status", {
      organizationId: currentOrgId,
      sender: currentMyUserId,
      isMuted: isMutedState,
      isSpeaking: Boolean(isSpeaking),
    });
  }
}

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// User-gesture listener to reliably resume AudioContext per browser autoplay policy
function ensureAudioContextResumed() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("click", ensureAudioContextResumed, { passive: true });
  window.addEventListener("keydown", ensureAudioContextResumed, { passive: true });
  window.addEventListener("pointerdown", ensureAudioContextResumed, { passive: true });
  window.addEventListener("touchstart", ensureAudioContextResumed, { passive: true });
}

/**
 * Initializes spatial audio subsystem and binds WebRTC signaling listeners.
 */
export function initSpatialAudio(orgId, myUserId, onSpeakingChange, onMicError) {
  onSpeakingChangeCallback = onSpeakingChange;
  if (isInitialized && currentOrgId === String(orgId) && currentMyUserId === String(myUserId)) {
    return;
  }

  currentOrgId = String(orgId);
  currentMyUserId = String(myUserId);
  currentSocket = getSocket();
  isInitialized = true;

  bindSocketSignaling();
  startLocalMic(onMicError);
}

// Starts capturing user microphone and sets up high-sensitivity Discord-like VAD.
async function startLocalMic(onMicError) {
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true, // AGC ensures crisp, consistent voice levels
        },
        video: false,
      });

      localStream = stream;
      // Apply current mute state
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMutedState;
      });

      // Add local tracks to any already-established peer connections and trigger renegotiation
      peers.forEach(async ({ pc, socketId }) => {
        try {
          const audioTrack = localStream.getAudioTracks()[0];
          if (!audioTrack) return;

          const senders = pc.getSenders();
          const audioSender = senders.find((s) => s.track && s.track.kind === "audio");

          if (audioSender) {
            await audioSender.replaceTrack(audioTrack);
          } else {
            const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
            const audioTransceiver = transceivers.find(
              (t) => t.sender && (t.sender.track?.kind === "audio" || t.receiver?.track?.kind === "audio")
            );
            if (audioTransceiver && audioTransceiver.sender) {
              await audioTransceiver.sender.replaceTrack(audioTrack);
              audioTransceiver.direction = "sendrecv";
            } else {
              pc.addTrack(audioTrack, localStream);
            }
          }

          if (pc.signalingState === "stable") {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            if (currentSocket) {
              currentSocket.emit("webrtc:offer", {
                to: socketId,
                offer: pc.localDescription,
                fromUser: currentMyUserId,
              });
            }
          }
        } catch (e) {
          console.warn("[SpatialAudio] Error updating peer tracks on mic start:", e);
        }
      });

      // Set up local speaking volume analyzer
      const ctx = getAudioContext();
      if (ctx) {
        try {
          localSource = ctx.createMediaStreamSource(localStream);
          localAnalyser = ctx.createAnalyser();
          localAnalyser.fftSize = 512; // 256 frequency bins (93.75 Hz resolution at 48kHz)
          localAnalyser.smoothingTimeConstant = 0.15; // Fast attack time for instant speaking detection
          localSource.connect(localAnalyser);

          const timeData = new Uint8Array(localAnalyser.fftSize);
          const freqData = new Uint8Array(localAnalyser.frequencyBinCount);
          let lastVoiceDetectedTime = 0;
          // Discord-style 280ms voice hangover window: prevents flickering between syllables/words
          const HANGOVER_WINDOW_MS = 280;

          function monitorSpeaking() {
            if (!localAnalyser) return;

            // If user is muted, cut speaking immediately
            if (isMutedState) {
              if (currentlySpeakingState) {
                currentlySpeakingState = false;
                if (onSpeakingChangeCallback) onSpeakingChangeCallback(false);
                broadcastMicStatus(false);
              }
              lastVoiceDetectedTime = 0;
              animFrameId = requestAnimationFrame(monitorSpeaking);
              return;
            }

            // 1. Time-Domain PCM Analysis (instant RMS & Peak volume)
            localAnalyser.getByteTimeDomainData(timeData);
            let sumSquares = 0;
            let peakDiff = 0;
            const len = timeData.length;
            for (let i = 0; i < len; i++) {
              const diff = Math.abs(timeData[i] - 128);
              if (diff > peakDiff) peakDiff = diff;
              sumSquares += diff * diff;
            }
            const rms = Math.sqrt(sumSquares / len);

            // 2. Frequency Vocal-Band Analysis (85Hz - 3400Hz, bins 1 to 36)
            localAnalyser.getByteFrequencyData(freqData);
            let vocalSum = 0;
            const vocalBins = 36;
            for (let i = 1; i <= vocalBins; i++) {
              vocalSum += freqData[i];
            }
            const vocalAvg = vocalSum / vocalBins;

            const now = performance.now();

            // Sensitivity threshold:
            // High sensitivity to conversational and soft human speech, while rejecting silent background hiss.
            // Conversational speech produces rms ~ 3.5-25+, peak ~ 10-60+, vocalAvg ~ 20-80+.
            // Quiet whisper produces rms ~ 2.6+ or peak ~ 8+.
            // Silent room noise floor is rms < 1.8, peak < 5, vocalAvg < 12.
            const isVoiceDetected = (rms > 2.5 && peakDiff > 6) || vocalAvg > 16 || peakDiff > 14;

            if (isVoiceDetected) {
              lastVoiceDetectedTime = now;
            }

            // Real-time speech status with Discord-like 280ms hangover
            const isSpeakingNow = (now - lastVoiceDetectedTime) < HANGOVER_WINDOW_MS;

            if (isSpeakingNow !== currentlySpeakingState) {
              currentlySpeakingState = isSpeakingNow;
              if (onSpeakingChangeCallback) {
                onSpeakingChangeCallback(isSpeakingNow);
              }
              broadcastMicStatus(isSpeakingNow);
            }

            animFrameId = requestAnimationFrame(monitorSpeaking);
          }

          monitorSpeaking();
        } catch (e) {
          console.warn("[SpatialAudio] VAD setup warning:", e);
        }
      }
    }
  } catch (err) {
    console.warn("[SpatialAudio] Microphone access unavailable:", err.message);
  }
}

/**
 * Toggles microphone mute state.
 */
export function setLocalAudioMute(muted) {
  isMutedState = Boolean(muted);
  if (!isMutedState && !localStream) {
    // If unmuting when mic stream has not yet been acquired, acquire it now
    startLocalMic();
  } else if (localStream) {
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !isMutedState;
    });
  }

  // If muted, immediately cut off speaking indicator locally
  if (isMutedState && currentlySpeakingState) {
    currentlySpeakingState = false;
    if (onSpeakingChangeCallback) onSpeakingChangeCallback(false);
  }

  // Notify peers via socket immediately
  broadcastMicStatus(false);
}

/**
 * Check if a peer connection already exists.
 */
export function hasPeer(peerSocketId) {
  return peers.has(peerSocketId);
}

/**
 * Creates and initiates a WebRTC peer connection towards a remote peer.
 */
export async function connectToPeer(peerSocketId, peerUserId = null) {
  if (!peerSocketId) return;
  if (peerUserId) peerLookup.set(String(peerUserId), peerSocketId);
  peerLookup.set(peerSocketId, peerSocketId);
  if (peers.has(peerSocketId)) return;
  const pc = createPeerConnection(peerSocketId, peerUserId);

  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await pc.setLocalDescription(offer);

    if (currentSocket) {
      currentSocket.emit("webrtc:offer", {
        to: peerSocketId,
        offer,
        fromUser: currentMyUserId,
      });
    }
  } catch (err) {
    console.warn(`[SpatialAudio] Failed to create offer for peer ${peerSocketId}:`, err);
  }
}

/**
 * Helper to build RTCPeerConnection with Web Audio GainNode + HTML5 Audio pipeline.
 */
function createPeerConnection(peerSocketId, peerUserId = null) {
  if (peerUserId) peerLookup.set(String(peerUserId), peerSocketId);
  peerLookup.set(peerSocketId, peerSocketId);
  if (peers.has(peerSocketId)) {
    return peers.get(peerSocketId).pc;
  }

  const pc = new RTCPeerConnection(RTC_CONFIG);
  let gainNode = null;
  let pannerNode = null;
  let compressorNode = null;

  // Pre-create HTML5 Audio fallback attached to DOM (hidden) for reliable playback
  let audioEl = null;
  if (typeof document !== "undefined" && document.createElement) {
    try {
      audioEl = document.createElement("audio");
      audioEl.style.display = "none";
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.volume = 0;
      audioEl.muted = true;
      document.body.appendChild(audioEl);
    } catch {}
  }

  const ctx = getAudioContext();
  if (ctx) {
    try {
      // 1. Audio Gain Node (Distance cross-fade)
      gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, ctx.currentTime);

      // 2. 3D Spatial Stereo Panner Node (Stereo separation: left / right)
      if (typeof ctx.createStereoPanner === "function") {
        pannerNode = ctx.createStereoPanner();
        pannerNode.pan.setValueAtTime(0, ctx.currentTime);
      }

      // 3. Audio Dynamics Compressor Node (Anti-clipping protection)
      compressorNode = ctx.createDynamicsCompressor();
      compressorNode.threshold.setValueAtTime(-25, ctx.currentTime);
      compressorNode.knee.setValueAtTime(20, ctx.currentTime);
      compressorNode.ratio.setValueAtTime(3, ctx.currentTime);
      compressorNode.attack.setValueAtTime(0.005, ctx.currentTime);
      compressorNode.release.setValueAtTime(0.25, ctx.currentTime);

      // Audio Graph Pipeline:
      // MediaStreamSource -> GainNode -> StereoPannerNode -> DynamicsCompressorNode -> ctx.destination
      if (pannerNode) {
        gainNode.connect(pannerNode);
        pannerNode.connect(compressorNode);
      } else {
        gainNode.connect(compressorNode);
      }
      compressorNode.connect(ctx.destination);
    } catch (e) {
      console.warn("[SpatialAudio] Audio graph setup error:", e);
    }
  }

  // Add local tracks if available; otherwise add a recvonly transceiver so peers with mic off can still hear
  let hasAudioTrack = false;
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      try {
        pc.addTrack(track, localStream);
        if (track.kind === "audio") hasAudioTrack = true;
      } catch {}
    });
  }

  if (!hasAudioTrack) {
    try {
      pc.addTransceiver("audio", { direction: "recvonly" });
    } catch {}
  }

  // ICE candidates routing
  pc.onicecandidate = (event) => {
    if (event.candidate && currentSocket) {
      currentSocket.emit("webrtc:ice-candidate", {
        to: peerSocketId,
        candidate: event.candidate,
      });
    }
  };

  // Automatic renegotiation when local tracks/transceivers change
  pc.onnegotiationneeded = async () => {
    try {
      if (pc.signalingState !== "stable") return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (currentSocket) {
        currentSocket.emit("webrtc:offer", {
          to: peerSocketId,
          offer: pc.localDescription,
          fromUser: currentMyUserId,
        });
      }
    } catch (err) {
      console.warn(`[SpatialAudio] Negotiation needed error for ${peerSocketId}:`, err);
    }
  };

  // Remote audio track received
  pc.ontrack = (event) => {
    const remoteStream =
      event.streams && event.streams[0]
        ? event.streams[0]
        : new MediaStream([event.track]);

    peerEntry.remoteStream = remoteStream;

    // Immediately disable audio tracks by default until updateSpatialAudioVolumes confirms proximity
    try {
      remoteStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    } catch {}

    if (gainNode && ctx) {
      try {
        const source = ctx.createMediaStreamSource(remoteStream);
        source.connect(gainNode);
      } catch (e) {
        console.warn("[SpatialAudio] Error attaching remote stream to GainNode:", e);
      }
    }

    // Direct HTML5 audio element: Keep attached, muted, and paused to avoid audio leakage
    if (audioEl) {
      audioEl.srcObject = remoteStream;
      audioEl.muted = true;
      audioEl.volume = 0;
      audioEl.pause();
    }
  };

  pc.onconnectionstatechange = () => {
    if (
      pc.connectionState === "disconnected" ||
      pc.connectionState === "failed" ||
      pc.connectionState === "closed"
    ) {
      removePeer(peerSocketId);
    }
  };

  const peerEntry = {
    pc,
    gainNode,
    pannerNode,
    compressorNode,
    audioEl,
    iceQueue: [],
    socketId: peerSocketId,
    userId: peerUserId ? String(peerUserId) : null,
    remoteStream: null,
  };
  peers.set(peerSocketId, peerEntry);
  return pc;
}

/**
 * Binds Socket.IO signaling event listeners with W3C Perfect Negotiation.
 */
function bindSocketSignaling() {
  if (!currentSocket) return;

  currentSocket.off("webrtc:offer");
  currentSocket.off("webrtc:answer");
  currentSocket.off("webrtc:ice-candidate");
  currentSocket.off("room:user-left");

  // Handle incoming Offer
  currentSocket.on("webrtc:offer", async ({ from, offer, fromUser }) => {
    if (!from || !offer) return;
    if (fromUser) peerLookup.set(String(fromUser), from);
    peerLookup.set(from, from);
    const pc = createPeerConnection(from, fromUser);
    const peer = peers.get(from);

    try {
      // Perfect Negotiation collision detection
      const isPolite = currentSocket.id > from;
      const offerCollision = pc.signalingState !== "stable";

      if (offerCollision) {
        if (!isPolite) {
          // Impolite peer ignores incoming colliding offer; our offer stands
          return;
        }
        // Polite peer rolls back local offer to accept remote offer
        await pc.setLocalDescription({ type: "rollback" }).catch(() => {});
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Process any queued ICE candidates
      if (peer && peer.iceQueue && peer.iceQueue.length > 0) {
        for (const cand of peer.iceQueue) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch {}
        }
        peer.iceQueue = [];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      currentSocket.emit("webrtc:answer", {
        to: from,
        answer,
      });
    } catch (err) {
      console.warn(`[SpatialAudio] Failed to process offer from ${from}:`, err);
    }
  });

  // Handle incoming Answer
  currentSocket.on("webrtc:answer", async ({ from, answer }) => {
    if (!from || !answer) return;
    const peer = peers.get(from);
    if (peer && peer.pc) {
      try {
        if (peer.pc.signalingState === "have-local-offer") {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));

          if (peer.iceQueue && peer.iceQueue.length > 0) {
            for (const cand of peer.iceQueue) {
              try {
                await peer.pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch {}
            }
            peer.iceQueue = [];
          }
        }
      } catch (err) {
        console.warn(`[SpatialAudio] Failed to set remote answer from ${from}:`, err);
      }
    }
  });

  // Handle incoming ICE Candidate
  currentSocket.on("webrtc:ice-candidate", async ({ from, candidate }) => {
    if (!from || !candidate) return;
    const peer = peers.get(from);
    if (peer && peer.pc) {
      try {
        if (peer.pc.remoteDescription && peer.pc.remoteDescription.type) {
          await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          // Queue candidate until remote description is set
          peer.iceQueue = peer.iceQueue || [];
          peer.iceQueue.push(candidate);
        }
      } catch {}
    }
  });

  currentSocket.on("room:user-left", ({ socketId }) => {
    if (socketId) removePeer(socketId);
  });
}

function removePeer(peerSocketId) {
  const peer = peers.get(peerSocketId);
  if (!peer) return;

  try {
    peer.pc.close();
  } catch {}
  if (peer.gainNode) {
    try {
      peer.gainNode.disconnect();
    } catch {}
  }
  if (peer.pannerNode) {
    try {
      peer.pannerNode.disconnect();
    } catch {}
  }
  if (peer.compressorNode) {
    try {
      peer.compressorNode.disconnect();
    } catch {}
  }
  if (peer.audioEl) {
    try {
      peer.audioEl.srcObject = null;
      peer.audioEl.remove();
    } catch {}
  }
  if (peer && peer.userId) peerLookup.delete(peer.userId);
  peerLookup.delete(peerSocketId);
  peers.delete(peerSocketId);
}

/**
 * Tests whether a line segment from (p1x, p1y) to (p2x, p2y) intersects
 * an axis-aligned bounding box centered at (0, 0) with half-dimensions (hw, hh).
 */
function segmentIntersectsBox(p1x, p1y, p2x, p2y, hw, hh) {
  if (Math.abs(p1x) <= hw && Math.abs(p1y) <= hh) return true;
  if (Math.abs(p2x) <= hw && Math.abs(p2y) <= hh) return true;

  const dx = p2x - p1x;
  const dy = p2y - p1y;

  let tmin = 0;
  let tmax = 1;

  // X slab
  if (Math.abs(dx) < 1e-7) {
    if (Math.abs(p1x) > hw) return false;
  } else {
    let t1 = (-hw - p1x) / dx;
    let t2 = (hw - p1x) / dx;
    if (t1 > t2) {
      const temp = t1;
      t1 = t2;
      t2 = temp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  // Y slab
  if (Math.abs(dy) < 1e-7) {
    if (Math.abs(p1y) > hh) return false;
  } else {
    let t1 = (-hh - p1y) / dy;
    let t2 = (hh - p1y) / dy;
    if (t1 > t2) {
      const temp = t1;
      t1 = t2;
      t2 = temp;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }

  return tmin <= tmax && tmax >= 0 && tmin <= 1;
}

/**
 * Calculates audio transmission attenuation factor between two positions based on
 * intervening building blocks marked with `soundBarrier: true`.
 * Returns 1.0 (unattenuated) if no sound barriers, or attenuated factor (0.2 per barrier).
 *
 * @param {Object} posA - { x, y } (percentages 0-100)
 * @param {Object} posB - { x, y } (percentages 0-100)
 * @param {Object|Array} furnitureLayout - Layout object containing placed objects
 * @returns {number} - Attenuation factor between 0.0 and 1.0
 */
export function getSoundBarrierAttenuation(posA, posB, furnitureLayout = {}) {
  if (!posA || !posB || !furnitureLayout) return 1.0;

  const ax = Number(posA.x !== undefined ? posA.x : posA.position?.x);
  const ay = Number(posA.y !== undefined ? posA.y : posA.position?.y);
  const bx = Number(posB.x !== undefined ? posB.x : posB.position?.x);
  const by = Number(posB.y !== undefined ? posB.y : posB.position?.y);

  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) {
    return 1.0;
  }
  if (ax === bx && ay === by) return 1.0;

  const items = Array.isArray(furnitureLayout)
    ? furnitureLayout
    : (furnitureLayout.officeLayout && Array.isArray(furnitureLayout.officeLayout.objects))
    ? furnitureLayout.officeLayout.objects
    : (furnitureLayout.objects && Array.isArray(furnitureLayout.objects))
    ? furnitureLayout.objects
    : Object.values(furnitureLayout);

  let barriersCrossed = 0;

  for (const item of items) {
    if (!item) continue;
    // Only heavy building blocks with soundBarrier: true reduce/block voice audio
    const isBarrier = Boolean(item.soundBarrier === true || item.soundBarrier === "true");
    if (!isBarrier) continue;

    const cx = Number(item.x !== undefined ? item.x : item.position?.x);
    const cy = Number(item.y !== undefined ? item.y : item.position?.y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

    const widthPx = Number(item.width) || 40;
    const heightPx = Number(item.height) || 20;
    const halfW = ((widthPx / 1000) * 100) / 2;
    const halfH = ((heightPx / 590) * 100) / 2;

    const deg = Number(item.rotation) || 0;
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Transform posA to local coordinate frame of rotated object
    const dx1 = ax - cx;
    const dy1 = ay - cy;
    const p1x = dx1 * cos + dy1 * sin;
    const p1y = -dx1 * sin + dy1 * cos;

    // Transform posB to local coordinate frame of rotated object
    const dx2 = bx - cx;
    const dy2 = by - cy;
    const p2x = dx2 * cos + dy2 * sin;
    const p2y = -dx2 * sin + dy2 * cos;

    if (segmentIntersectsBox(p1x, p1y, p2x, p2y, halfW, halfH)) {
      barriersCrossed++;
    }
  }

  if (barriersCrossed === 0) return 1.0;
  // Sound barrier reduces audio: 0.2 per barrier (80% attenuation)
  return Math.max(0, Math.pow(0.2, barriersCrossed));
}

/**
 * Checks whether at least one sound barrier separates two positions.
 */
export function hasSoundBarrierBetween(posA, posB, furnitureLayout = {}) {
  return getSoundBarrierAttenuation(posA, posB, furnitureLayout) < 1.0;
}

/**
 * Hard mutes a peer connection completely across WebRTC tracks, Web Audio API, and HTML5 Audio fallback.
 */
function mutePeerEntry(peerData) {
  if (!peerData) return;
  const ctx = getAudioContext();

  // 1. Hardware-level track cutoff: disable receiving audio tracks
  if (peerData.remoteStream) {
    try {
      peerData.remoteStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    } catch {}
  }

  // 2. Web Audio API GainNode hard-zero with scheduled cancellation
  if (ctx && peerData.gainNode) {
    try {
      peerData.gainNode.gain.cancelScheduledValues(ctx.currentTime);
      peerData.gainNode.gain.setValueAtTime(0, ctx.currentTime);
      peerData.gainNode.gain.value = 0;
    } catch {}
  }

  // 3. Fallback audio element hard-mute and pause
  if (peerData.audioEl) {
    try {
      peerData.audioEl.muted = true;
      peerData.audioEl.volume = 0;
      peerData.audioEl.pause();
    } catch {}
  }
}

/**
 * Updates spatial volume cross-fade for all connected peers based on physical distance.
 *
 * Spatial Acoustic Model:
 * - Within proximity radius: smooth cosine cross-fade roll-off from 1.0 (at distance 0) to 0.0 (at perimeter).
 * - Beyond proximity radius (100m equivalent cluster): completely silent (gain = 0, tracks disabled).
 * - If remote peer is muted: gain = 0, tracks disabled.
 * - Iterates every peer in peers Map to guarantee no unmapped peer leaks audio.
 *
 * @param {Object} myPos - { x, y }
 * @param {Array} remoteUsersList - Array of remote user objects
 * @param {number} proximityRadius - Distance threshold (e.g. 22)
 */
export function updateSpatialAudioVolumes(myPos, remoteUsersList, proximityRadius = 22, furnitureLayout = {}) {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  if (!myPos) {
    peers.forEach((peerData) => mutePeerEntry(peerData));
    return;
  }

  // Build fast O(1) lookup tables for teammates
  const userBySocketId = new Map();
  const userByUid = new Map();
  if (Array.isArray(remoteUsersList)) {
    for (const u of remoteUsersList) {
      if (!u) continue;
      if (u.socketId) userBySocketId.set(String(u.socketId), u);
      if (u.uid) userByUid.set(String(u.uid), u);
      if (u.userId) userByUid.set(String(u.userId), u);
    }
  }

  const myX = Number(myPos.x !== undefined ? myPos.x : myPos.position?.x);
  const myY = Number(myPos.y !== undefined ? myPos.y : myPos.position?.y);

  if (!Number.isFinite(myX) || !Number.isFinite(myY)) {
    peers.forEach((peerData) => mutePeerEntry(peerData));
    return;
  }

  // Loop through ALL established WebRTC peer connections
  peers.forEach((peerData, peerSocketId) => {
    // Resolve user from remote users list
    const candidateId = peerData.userId || peerData.socketId || peerSocketId;
    const resolvedSocket = peerLookup.get(candidateId) || candidateId;

    const peerUser =
      userBySocketId.get(String(resolvedSocket)) ||
      userBySocketId.get(String(peerSocketId)) ||
      (peerData.userId ? userByUid.get(String(peerData.userId)) : null) ||
      userByUid.get(String(candidateId));

    // If peer is not recognized in room or has missing coordinates, strictly mute!
    if (!peerUser) {
      mutePeerEntry(peerData);
      return;
    }

    const peerX = Number(peerUser.x !== undefined ? peerUser.x : peerUser.position?.x);
    const peerY = Number(peerUser.y !== undefined ? peerUser.y : peerUser.position?.y);

    if (!Number.isFinite(peerX) || !Number.isFinite(peerY)) {
      mutePeerEntry(peerData);
      return;
    }

    const distance = Math.hypot(myX - peerX, myY - peerY);

    // Strict 100m / cluster proximity check & mute status check:
    // Any peer outside proximityRadius or with microphone muted is completely silenced!
    if (distance > proximityRadius || peerUser.isMuted) {
      mutePeerEntry(peerData);
      return;
    }

    // Inside proximity cluster and microphone is active
    const normalizedDist = Math.max(0, Math.min(1, distance / proximityRadius));
    // Cosine cross-fade: 1.0 (at distance 0) down to 0.0 (at perimeter)
    let targetGain = Math.cos(normalizedDist * (Math.PI / 2));
    targetGain = Math.max(0, Math.min(1, targetGain));

    // 3D Spatial Audio Stereo Separation:
    const deltaX = peerX - myX;
    let targetPan = Math.max(-1, Math.min(1, (deltaX / proximityRadius) * 1.15));

    // Sound barrier attenuation
    const barrierAttenuation = getSoundBarrierAttenuation(myPos, peerUser, furnitureLayout);
    targetGain = targetGain * barrierAttenuation;
    targetGain = Number.isFinite(targetGain) ? Math.max(0, Math.min(1, targetGain)) : 0;
    targetPan = Number.isFinite(targetPan) ? Math.max(-1, Math.min(1, targetPan)) : 0;

    if (targetGain <= 0.0001) {
      mutePeerEntry(peerData);
      return;
    }

    // Unmute and play sound
    if (peerData.remoteStream) {
      try {
        peerData.remoteStream.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
      } catch {}
    }

    if (ctx && ctx.state === "running") {
      if (peerData.gainNode) {
        try {
          peerData.gainNode.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.04);
        } catch {}
      }
      if (peerData.pannerNode) {
        try {
          peerData.pannerNode.pan.setTargetAtTime(targetPan, ctx.currentTime, 0.04);
        } catch {}
      }
      if (peerData.audioEl) {
        try {
          peerData.audioEl.muted = true;
          peerData.audioEl.volume = 0;
          peerData.audioEl.pause();
        } catch {}
      }
    } else if (peerData.audioEl) {
      // Direct HTML5 audio element output ONLY if Web Audio AudioContext is suspended
      try {
        peerData.audioEl.volume = Math.max(0, Math.min(1, targetGain));
        peerData.audioEl.muted = false;
        if (peerData.audioEl.paused) {
          peerData.audioEl.play().catch(() => {});
        }
      } catch {}
    }
  });
}

/**
 * Tears down spatial audio subsystem completely.
 */
export function stopSpatialAudio() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  currentlySpeakingState = false;
  onSpeakingChangeCallback = null;

  peers.forEach((peer, socketId) => {
    removePeer(socketId);
  });
  peers.clear();
  peerLookup.clear();

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  if (localSource) {
    try {
      localSource.disconnect();
    } catch {}
    localSource = null;
  }
  if (localAnalyser) {
    try {
      localAnalyser.disconnect();
    } catch {}
    localAnalyser = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }

  if (currentSocket) {
    currentSocket.off("webrtc:offer");
    currentSocket.off("webrtc:answer");
    currentSocket.off("webrtc:ice-candidate");
    currentSocket.off("room:user-left");
  }

  isInitialized = false;
  currentSocket = null;
  currentOrgId = null;
  currentMyUserId = null;
}
