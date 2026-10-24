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

import { getSocket } from "./socket";

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

// Map: peerSocketId -> { pc: RTCPeerConnection, gainNode: GainNode, audioEl: HTMLAudioElement, iceQueue: Array }
const peers = new Map();
let currentSocket = null;
let currentMyUserId = null;
let currentOrgId = null;
let isInitialized = false;

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
  if (isInitialized && currentOrgId === String(orgId) && currentMyUserId === String(myUserId)) {
    return;
  }

  currentOrgId = String(orgId);
  currentMyUserId = String(myUserId);
  currentSocket = getSocket();
  isInitialized = true;

  bindSocketSignaling();
  startLocalMic(onSpeakingChange, onMicError);
}

/**
 * Starts capturing user microphone and sets up VAD.
 */
async function startLocalMic(onSpeakingChange, onMicError) {
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
        video: false,
      });

      localStream = stream;
      // Apply current mute state
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMutedState;
      });

      // Add local tracks to any already-established peer connections
      peers.forEach(({ pc }) => {
        localStream.getTracks().forEach((track) => {
          try {
            pc.addTrack(track, localStream);
          } catch {}
        });
      });

      // Set up local speaking volume analyzer
      const ctx = getAudioContext();
      if (ctx) {
        try {
          localSource = ctx.createMediaStreamSource(localStream);
          localAnalyser = ctx.createAnalyser();
          localAnalyser.fftSize = 256;
          localSource.connect(localAnalyser);

          const buffer = new Uint8Array(localAnalyser.frequencyBinCount);
          let currentlySpeaking = false;
          let holdTimer = null;

          function monitorSpeaking() {
            if (!localAnalyser) return;
            localAnalyser.getByteFrequencyData(buffer);
            const avg = buffer.reduce((sum, v) => sum + v, 0) / buffer.length;

            if (avg > 16 && !isMutedState) {
              if (!currentlySpeaking) {
                currentlySpeaking = true;
                if (onSpeakingChange) onSpeakingChange(true);
              }
              if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
              }
            } else if (currentlySpeaking && !holdTimer) {
              holdTimer = setTimeout(() => {
                currentlySpeaking = false;
                if (onSpeakingChange) onSpeakingChange(false);
                holdTimer = null;
              }, 200);
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
    if (onMicError) {
      onMicError("Microphone permission not granted — voice chat simulated.");
    }
  }
}

/**
 * Toggles microphone mute state.
 */
export function setLocalAudioMute(muted) {
  isMutedState = Boolean(muted);
  if (localStream) {
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !isMutedState;
    });
  }

  // Notify peers via socket
  if (currentSocket && currentOrgId) {
    currentSocket.emit("mic-status", {
      organizationId: currentOrgId,
      sender: currentMyUserId,
      isMuted: isMutedState,
      isSpeaking: false,
    });
  }
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
export async function connectToPeer(peerSocketId) {
  if (!peerSocketId || peers.has(peerSocketId)) return;
  const pc = createPeerConnection(peerSocketId);

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
function createPeerConnection(peerSocketId) {
  if (peers.has(peerSocketId)) {
    return peers.get(peerSocketId).pc;
  }

  const pc = new RTCPeerConnection(RTC_CONFIG);
  let gainNode = null;
  let compressorNode = null;
  let audioEl = null;

  const ctx = getAudioContext();
  if (ctx) {
    try {
        // Audio Gain Node
        gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(1.0, ctx.currentTime); // Start at 1.0 (audible) so initial packets are heard; spatial loop ramps dynamically
        //Audio Compressor Node
        compressorNode = ctx.createDynamicsCompressor();
        compressorNode.threshold.setValueAtTime(-25, ctx.currentTime);
        compressorNode.knee.setValueAtTime(20, ctx.currentTime);
        compressorNode.ratio.setValueAtTime(3, ctx.currentTime);
        compressorNode.attack.setValueAtTime(0.005, ctx.currentTime);
        compressorNode.release.setValueAtTime(0.25, ctx.currentTime);

        gainNode.connect(compressorNode);
        compressorNode.connect(ctx.destination);
    } 
    catch (e) 
    {
      console.warn("[SpatialAudio] GainNode setup error:", e);
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

  // Remote audio track received
  pc.ontrack = (event) => {
    const remoteStream =
      event.streams && event.streams[0]
        ? event.streams[0]
        : new MediaStream([event.track]);

    if (gainNode && ctx) {
      try {
        const source = ctx.createMediaStreamSource(remoteStream);
        source.connect(gainNode);
      } catch (e) {
        console.warn("[SpatialAudio] Error attaching remote stream to GainNode:", e);
      }
    }

    // Direct HTML5 audio element fallback
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.srcObject = remoteStream;
      audioEl.volume = 1.0;
      audioEl.muted = false;
      audioEl.play().catch(() => {});
    } else {
      audioEl.srcObject = remoteStream;
      audioEl.play().catch(() => {});
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

  const peerEntry = { pc, gainNode, audioEl, iceQueue: [] };
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
  currentSocket.on("webrtc:offer", async ({ from, offer }) => {
    if (!from || !offer) return;
    const pc = createPeerConnection(from);
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
  if (peer.audioEl) {
    try {
      peer.audioEl.srcObject = null;
      peer.audioEl.remove();
    } catch {}
  }
  peers.delete(peerSocketId);
}

/**
 * Updates spatial volume cross-fade for all connected peers based on physical distance.
 *
 * Spatial Acoustic Model:
 * - Within proximity radius: smooth cosine cross-fade roll-off from 1.0 (at distance 0) to 0.0 (at perimeter).
 * - Beyond proximity radius: completely silent (gain = 0).
 * - If remote peer is muted: gain = 0.
 * - Dual-pipeline: If Web Audio is active, GainNode handles output; otherwise HTML5 Audio plays smoothly.
 *
 * @param {Object} myPos - { x, y }
 * @param {Array} remoteUsersList - Array of remote user objects
 * @param {number} proximityRadius - Distance threshold (e.g. 22)
 */
export function updateSpatialAudioVolumes(myPos, remoteUsersList, proximityRadius = 22) {
  const ctx = getAudioContext();
  if (!myPos || !Array.isArray(remoteUsersList)) return;

  remoteUsersList.forEach((peer) => {
    const socketId = peer.socketId || peer.uid;
    const peerData =
      peers.get(socketId) ||
      peers.get(peer.socketId) ||
      peers.get(peer.uid);
    console.log(peerData);
    
    if (!peerData) return;

    const distance = Math.hypot(myPos.x - peer.x, myPos.y - peer.y);
    let targetGain = 0;

    if (distance <= proximityRadius && !peer.isMuted) {
      const normalizedDist = Math.max(0, Math.min(1, distance / proximityRadius));
      // Smooth acoustic cosine cross-fade
      targetGain = Math.cos(normalizedDist * (Math.PI / 2));
      targetGain = Math.max(0, Math.min(1, targetGain));
    }
    console.log(targetGain);
    
    // Set GainNode volume if Web Audio API context is running
    if (peerData.gainNode && ctx && ctx.state === "running") {
      try {
        peerData.gainNode.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);
      } catch {}
      // Mute fallback audio element to prevent double-output echo
      if (peerData.audioEl) {
        console.log("muted");
        
        peerData.audioEl.muted = true;
      }
    } else if (peerData.audioEl) {
      // Direct HTML5 audio element output if AudioContext is suspended
      try {
        peerData.audioEl.volume = Math.max(0, Math.min(1, targetGain));
        console.log(targetGain,);
        
        peerData.audioEl.muted = targetGain === 0;
        if (targetGain > 0 && peerData.audioEl.paused) {
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

  peers.forEach((peer, socketId) => {
    removePeer(socketId);
  });
  peers.clear();

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
