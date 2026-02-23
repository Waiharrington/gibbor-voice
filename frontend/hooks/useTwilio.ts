
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Device } from '@twilio/voice-sdk';

// --- Robust Audio & Ringback Manager ---
class AudioToneManager {
    private audioCtx: AudioContext | null = null;
    private oscillators: OscillatorNode[] = [];
    private gainNode: GainNode | null = null;
    private isPlaying: boolean = false;

    private initCtx() {
        if (typeof window === 'undefined') return;
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        if (!this.audioCtx) this.audioCtx = new AudioContextClass();
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => { });
        }
    }

    startRingback() {
        this.stopAll(); // Prevent double tones
        try {
            this.initCtx();
            if (!this.audioCtx) return;

            this.gainNode = this.audioCtx.createGain();
            this.gainNode.gain.value = 0.15;
            this.gainNode.connect(this.audioCtx.destination);

            const osc1 = this.audioCtx.createOscillator();
            const osc2 = this.audioCtx.createOscillator();

            osc1.frequency.value = 440;
            osc2.frequency.value = 480;

            osc1.connect(this.gainNode);
            osc2.connect(this.gainNode);

            const now = this.audioCtx.currentTime;
            for (let i = 0; i < 10; i++) {
                const start = now + (i * 6);
                const end = start + 2;
                this.gainNode.gain.setValueAtTime(0.15, start);
                this.gainNode.gain.setValueAtTime(0, end);
            }

            osc1.start();
            osc2.start();
            this.oscillators = [osc1, osc2];
            this.isPlaying = true;
        } catch (e) {
            console.error("AudioToneManager: Failed to start", e);
        }
    }

    stopAll() {
        try {
            this.oscillators.forEach(osc => {
                try { osc.stop(); osc.disconnect(); } catch { }
            });
            this.oscillators = [];
            if (this.gainNode) {
                this.gainNode.disconnect();
                this.gainNode = null;
            }
            this.isPlaying = false;
        } catch (e) {
            console.error("AudioToneManager: Error stopping", e);
        }
    }

    get isTonePlaying() { return this.isPlaying; }
}

const toneManager = new AudioToneManager();

export interface UseTwilioProps {
    token: string | null;
    identity?: string | null;
    onTokenExpired: () => Promise<void>;
    onStatusChange?: (status: 'online' | 'in-call' | 'idle') => void;
}

export function useTwilio({ token, identity, onTokenExpired, onStatusChange }: UseTwilioProps) {
    const [device, setDevice] = useState<Device | null>(null);
    const [activeCall, setActiveCall] = useState<any>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [callStatus, setCallStatus] = useState<string>('Inactivo');
    const [isDeviceReady, setIsDeviceReady] = useState(false);
    const [networkQuality, setNetworkQuality] = useState<{ mos: number, jitter: number, rtt: number } | null>(null);
    const [duration, setDuration] = useState(0);

    const isConnecting = useRef(false);
    const durationInterval = useRef<NodeJS.Timeout | null>(null);

    // Sync status with context if provided
    useEffect(() => {
        if (!onStatusChange) return;
        if (activeCall && (callStatus === 'En Llamada' || callStatus === 'En curso')) {
            onStatusChange('in-call');
        } else if (isDeviceReady) {
            onStatusChange('online');
        } else {
            onStatusChange('idle');
        }
    }, [activeCall, callStatus, isDeviceReady, onStatusChange]);

    // --- Spanish Status Mappings ---
    const mapStatusToSpanish = useCallback((status: string) => {
        const s = status.toLowerCase();
        if (s.includes('entrante') || s.includes('incoming')) return 'Llamada Entrante';
        if (s.includes('marcando') || s.includes('dialing')) return 'Marcando...';
        if (s.includes('clase') || s.includes('ringing')) return 'Repicando...';
        if (s.includes('en llamada') || s.includes('en curso') || s === 'open' || s.includes('call')) return 'En Llamada';
        if (s === 'busy') return 'Ocupado (El cliente está en otra llamada)';
        if (s === 'no-answer') return 'Sin respuesta (El cliente no contestó)';
        if (s === 'failed') return 'Llamada Fallida (Error de red o carrier)';
        if (s === 'canceled') return 'Cancelada';
        if (s === 'completed') return 'Finalizada';
        if (s === 'disponible' || s === 'active' || s === 'ready') return 'Disponible';
        if (s === 'desconectado') return 'Desconectado';
        return status;
    }, []);

    // --- Audio Handlers ---
    const stopRingback = useCallback(() => toneManager.stopAll(), []);

    // --- Call Timer ---
    useEffect(() => {
        if (activeCall && (callStatus === 'En Llamada' || callStatus === 'In Call')) {
            durationInterval.current = setInterval(() => {
                setDuration(prev => prev + 1);
            }, 1000);
        } else {
            if (durationInterval.current) clearInterval(durationInterval.current);
            // Use a slight delay to avoid synchronous state update in effect warning
            const timeout = setTimeout(() => setDuration(0), 0);
            return () => clearTimeout(timeout);
        }
        return () => {
            if (durationInterval.current) clearInterval(durationInterval.current);
        };
    }, [activeCall, callStatus]);

    // --- Device Initialization ---
    useEffect(() => {
        if (!token) return;

        const deviceOptions = {
            logLevel: 1,
            codecPreferences: ['pcmu'], // FORCED: Standard telephony only (no HD) for maximum stability
            edge: ['ashburn', 'rochester', 'sao-paulo'],
            allowIncomingWhileBusy: true,
            enableIceRestart: true,
            dscp: true,
            maxToneStopDelay: 50
        } as any;

        const newDevice = new Device(token, deviceOptions);

        newDevice.on('registered', () => {
            setCallStatus('Disponible');
            setIsDeviceReady(true);
        });

        newDevice.on('error', (error: any) => {
            console.error('Twilio Device Error:', error);
            const isNetworkError = [31000, 31005, 31009, 1000, 1006].includes(error.code);
            if (isNetworkError) {
                setCallStatus('Reconectando...');
                setTimeout(() => {
                    if (newDevice && (newDevice.state as any) === 'Unregistered') {
                        newDevice.register();
                    }
                }, 2000);
            } else {
                setCallStatus('Error: ' + error.message);
            }
            setIsDeviceReady(false);
        });

        newDevice.on('incoming', (call) => {
            stopRingback();
            setCallStatus('Llamada Entrante...');
            setActiveCall(call);

            call.on('accept', () => {
                setCallStatus('En Llamada');
                setActiveCall(call);
            });

            call.on('disconnect', () => {
                setActiveCall(null);
                setCallStatus('Disponible');
            });

            call.on('cancel', () => {
                setActiveCall(null);
                setCallStatus('Disponible');
            });
        });

        newDevice.on('tokenWillExpire', onTokenExpired);

        newDevice.register();

        // Anti-pattern fix: defer state update to next tick
        const timeout = setTimeout(() => setDevice(newDevice), 0);

        return () => {
            clearTimeout(timeout);
            setIsDeviceReady(false);
            newDevice.destroy();
            setDevice(null);
        };
    }, [token, onTokenExpired]);

    // --- Call Handlers ---
    const handleCall = useCallback(async (number: string, callerId: string, appUserId: string) => {
        if (!device || !isDeviceReady || isConnecting.current) return;

        isConnecting.current = true;
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            alert("Error de Micrófono: Permita el acceso.");
            isConnecting.current = false;
            return;
        }

        const params = {
            To: number,
            appCallerId: callerId,
            appUserId: appUserId
        };

        toneManager.startRingback();
        try {
            const call = await device.connect({ params });
            setCallStatus('Marcando...');
            setActiveCall(call);

            call.on('sample', (sample: any) => {
                const metrics = {
                    mos: sample.mos || 0,
                    jitter: sample.values?.jitter || 0,
                    rtt: sample.values?.rtt || 0
                };
                setNetworkQuality(metrics);
                (call as any)._lastMetrics = metrics; // Store for disconnect report
            });

            call.on('accept', () => {
                isConnecting.current = false;
                stopRingback();
                setCallStatus('En Llamada');
            });

            call.on('disconnect', () => {
                const metrics = (call as any)._lastMetrics;
                const sid = call.parameters.CallSid || (call as any).sid;

                if (sid && metrics) {
                    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'https://gibbor-voice-production.up.railway.app';
                    fetch(`${baseUrl}/calls/${sid}/metrics`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(metrics)
                    }).catch(() => { }); // Fire and forget
                }

                stopRingback();
                setCallStatus('Disponible');
                setActiveCall(null);
                setIsMuted(false);
                setNetworkQuality(null);
                isConnecting.current = false;
            });

            call.on('cancel', () => {
                stopRingback();
                setCallStatus('Disponible');
                setActiveCall(null);
                isConnecting.current = false;
            });

            call.on('error', (err: any) => {
                stopRingback();
                setCallStatus(`Error: ${err.message} (Code: ${err.code || '?'})`);
                setActiveCall(null);
                isConnecting.current = false;
                setNetworkQuality(null);
            });

        } catch (err) {
            stopRingback();
            isConnecting.current = false;
            setCallStatus('Llamada Fallida');
        }
    }, [device, isDeviceReady, stopRingback]);

    const agentHangup = useRef(false);

    const handleHangup = useCallback(() => {
        stopRingback();
        agentHangup.current = true;
        if (activeCall) {
            activeCall.disconnect();
        } else if (device) {
            (device as any).disconnectAll();
        }
        setActiveCall(null);
        setCallStatus('Disponible');
        setIsMuted(false);
        isConnecting.current = false;
    }, [activeCall, device, stopRingback]);

    const toggleMute = useCallback(() => {
        if (activeCall) {
            const newMute = !isMuted;
            activeCall.mute(newMute);
            setIsMuted(newMute);
        }
    }, [activeCall, isMuted]);

    const sendDTMF = useCallback((digit: string) => {
        if (activeCall) {
            activeCall.sendDigits(digit);
        }
    }, [activeCall]);

    return {
        device,
        activeCall,
        isMuted,
        callStatus,
        isDeviceReady,
        networkQuality,
        duration,
        handleCall,
        handleHangup,
        toggleMute,
        sendDTMF,
        stopRingback,
        mapStatusToSpanish,
        isTonePlaying: toneManager.isTonePlaying
    };
};
