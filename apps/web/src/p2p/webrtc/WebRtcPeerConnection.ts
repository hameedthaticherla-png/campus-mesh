/**
 * Campus Mesh — WebRTC Peer Connection & DataChannel Wrapper
 *
 * Manages RTCPeerConnection lifecycle, deterministic SDP negotiation,
 * RTCDataChannel creation, and SCTP backpressure queues.
 */

import {
  DATA_CHANNEL_LABEL,
  P2P_BUFFER_LOW_THRESHOLD,
  P2P_BUFFER_HIGH_WATERMARK
} from '@campus-mesh/shared';

export interface WebRtcPeerEvents {
  onDataMessage: (data: ArrayBuffer) => void;
  onChannelOpen: () => void;
  onChannelClose: () => void;
  onIceCandidate: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onError: (err: Error) => void;
}

export class WebRtcPeerConnection {
  public readonly peerId: string;
  public readonly isInitiator: boolean;
  private readonly pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel | null = null;
  private readonly events: WebRtcPeerEvents;
  private readonly sendQueue: Uint8Array[] = [];
  private readonly pendingIceCandidates: RTCIceCandidateInit[] = [];
  private isClosed = false;

  constructor(
    peerId: string,
    isInitiator: boolean,
    iceServers: RTCIceServer[],
    events: WebRtcPeerEvents
  ) {
    this.peerId = peerId;
    this.isInitiator = isInitiator;
    this.events = events;

    this.pc = new RTCPeerConnection({ iceServers });
    this.setupPcListeners();

    if (isInitiator) {
      // Initiator creates data channel directly
      const dc = this.pc.createDataChannel(DATA_CHANNEL_LABEL, {
        ordered: true
      });
      this.setupDataChannel(dc);
    } else {
      // Non-initiator waits for remote data channel
      this.pc.ondatachannel = (evt) => {
        if (evt.channel.label === DATA_CHANNEL_LABEL) {
          this.setupDataChannel(evt.channel);
        }
      };
    }
  }

  private setupPcListeners(): void {
    this.pc.onicecandidate = (evt) => {
      if (evt.candidate && !this.isClosed) {
        this.events.onIceCandidate(evt.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.isClosed) {
        this.events.onConnectionStateChange(this.pc.connectionState);
      }
    };
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';

    try {
      this.dataChannel.bufferedAmountLowThreshold = P2P_BUFFER_LOW_THRESHOLD;
    } catch {
      // Some environments or older browsers may ignore or throw
    }

    this.dataChannel.onopen = () => {
      if (!this.isClosed) {
        this.events.onChannelOpen();
      }
    };

    this.dataChannel.onclose = () => {
      if (!this.isClosed) {
        this.events.onChannelClose();
      }
    };

    this.dataChannel.onerror = (err) => {
      if (!this.isClosed) {
        this.events.onError(new Error(`DataChannel error: ${err}`));
      }
    };

    this.dataChannel.onmessage = (evt) => {
      if (!this.isClosed && evt.data instanceof ArrayBuffer) {
        this.events.onDataMessage(evt.data);
      }
    };

    this.dataChannel.onbufferedamountlow = () => {
      this.drainSendQueue();
    };
  }

  /**
   * Drains the backpressure send queue when bufferedAmount drops.
   */
  private drainSendQueue(): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return;

    while (this.sendQueue.length > 0) {
      if (this.dataChannel.bufferedAmount >= P2P_BUFFER_HIGH_WATERMARK) {
        break; // Wait for next bufferedamountlow event
      }
      const nextBuffer = this.sendQueue.shift();
      if (nextBuffer) {
        (this.dataChannel as any).send(nextBuffer);
      }
    }
  }

  /**
   * Initiator creates and sets local SDP offer.
   */
  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /**
   * Non-initiator accepts remote offer, sets description, creates and sets answer.
   */
  public async setRemoteOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushPendingIceCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  /**
   * Initiator receives and sets remote SDP answer.
   */
  public async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushPendingIceCandidates();
  }

  /**
   * Handles incoming trickle ICE candidate.
   */
  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc.remoteDescription || !this.pc.remoteDescription.type) {
      // Queue until remote description is established
      this.pendingIceCandidates.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private async flushPendingIceCandidates(): Promise<void> {
    while (this.pendingIceCandidates.length > 0) {
      const candidate = this.pendingIceCandidates.shift();
      if (candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // Ignore stale or duplicate candidate
        }
      }
    }
  }

  /**
   * Sends binary payload with backpressure protection.
   */
  public send(buffer: Uint8Array): boolean {
    if (this.isClosed || !this.dataChannel || this.dataChannel.readyState !== 'open') {
      return false;
    }

    if (
      this.sendQueue.length > 0 ||
      this.dataChannel.bufferedAmount >= P2P_BUFFER_HIGH_WATERMARK
    ) {
      this.sendQueue.push(new Uint8Array(buffer));
      return true;
    }

    try {
      (this.dataChannel as any).send(buffer);
      return true;
    } catch {
      this.sendQueue.push(new Uint8Array(buffer));
      return false;
    }
  }

  public isChannelOpen(): boolean {
    return this.dataChannel !== null && this.dataChannel.readyState === 'open';
  }

  public getConnectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;

    this.sendQueue.length = 0;
    this.pendingIceCandidates.length = 0;

    if (this.dataChannel) {
      try {
        this.dataChannel.close();
      } catch {
        // Ignore
      }
      this.dataChannel = null;
    }

    try {
      this.pc.close();
    } catch {
      // Ignore
    }
  }
}
